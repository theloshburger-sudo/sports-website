import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Premier League, LaLiga, Bundesliga, Champions League, Europa League only.
const SOCCER_LEAGUES = [39, 140, 78, 2, 3];

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const startOfSoccerSeason = (date: Date) => date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
const basketballSeason = (date: Date) => date.getUTCMonth() >= 7 ? `${date.getUTCFullYear()}-${date.getUTCFullYear() + 1}` : `${date.getUTCFullYear() - 1}-${date.getUTCFullYear()}`;
const footballSeason = (date: Date) => date.getUTCFullYear();

function kickoffFor(game: Record<string, unknown>) {
  const date = typeof game.date === "string" ? game.date : (game.date as Record<string, unknown> | undefined)?.date;
  const timestamp = typeof game.timestamp === "number" ? game.timestamp : (game.fixture as Record<string, unknown> | undefined)?.timestamp;
  if (typeof date === "string" && !Number.isNaN(Date.parse(date))) return new Date(date).toISOString();
  if (typeof timestamp === "number") return new Date(timestamp * 1000).toISOString();
  return null;
}

function providerGame(sport: string, raw: Record<string, unknown>, weekId: string) {
  const teams = raw.teams as { home?: { name?: string }; away?: { name?: string } } | undefined;
  const fixture = raw.fixture as { id?: string | number } | undefined;
  const id = raw.id ?? fixture?.id;
  const kickoff = kickoffFor(raw);
  if (!id || !kickoff || !teams?.home?.name || !teams?.away?.name || teams.home.name === teams.away.name) return null;
  return { week_id: weekId, provider: "api-sports", provider_game_id: `${sport}:${id}`, sport, home_team: teams.home.name, away_team: teams.away.name, kickoff_at: kickoff };
}

async function apiSports(url: string, key: string) {
  const response = await fetch(url, { headers: { "x-apisports-key": key } });
  if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
  const body = await response.json();
  return Array.isArray(body.response) ? body.response : [];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Sign in to load games.");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("APISPORTS_KEY");
    if (!apiKey) throw new Error("The sports-data provider is not connected yet.");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Your sign-in has expired. Sign in again and retry.");

    const { leagueId, weekId } = await request.json();
    if (typeof leagueId !== "string" || typeof weekId !== "string") throw new Error("Choose a league and current week before loading games.");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: membership } = await admin.from("league_members").select("role").eq("league_id", leagueId).eq("user_id", user.id).maybeSingle();
    if (membership?.role !== "host") throw new Error("Only the league host can load games.");

    const [{ data: league }, { data: week }] = await Promise.all([
      admin.from("leagues").select("settings").eq("id", leagueId).single(),
      admin.from("game_weeks").select("starts_at, ends_at, league_id").eq("id", weekId).single(),
    ]);
    if (!league || !week || week.league_id !== leagueId) throw new Error("That current week is unavailable.");

    const selected = new Set<string>(Array.isArray(league.settings?.sports) ? league.settings.sports : []);
    const starts = new Date(week.starts_at), ends = new Date(week.ends_at);
    const from = isoDate(starts), to = isoDate(ends);
    const dates = Array.from({ length: Math.max(1, Math.ceil((ends.getTime() - starts.getTime()) / 86_400_000)) }, (_, index) => {
      const date = new Date(starts); date.setUTCDate(date.getUTCDate() + index); return isoDate(date);
    });
    const games: Record<string, unknown>[] = [];
    const providerErrors: string[] = [];
    const load = async (sport: string, url: string) => {
      try { games.push(...(await apiSports(url, apiKey)).map((raw: Record<string, unknown>) => providerGame(sport, raw, weekId)).filter(Boolean)); }
      catch (error) { providerErrors.push(error instanceof Error ? error.message : "Provider request failed."); }
    };

    if (selected.has("soccer")) await Promise.all(SOCCER_LEAGUES.map((leagueId) => load("Soccer", `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${startOfSoccerSeason(starts)}&from=${from}&to=${to}`)));
    if (selected.has("basketball")) await Promise.all(dates.map((date) => load("Basketball", `https://v1.basketball.api-sports.io/games?league=12&season=${basketballSeason(starts)}&date=${date}`)));
    if (selected.has("football")) await Promise.all(dates.map((date) => load("Football", `https://v1.american-football.api-sports.io/games?league=1&season=${footballSeason(starts)}&date=${date}`)));

    const validGames = games.filter((game) => new Date(game.kickoff_at as string) >= starts && new Date(game.kickoff_at as string) < ends);
    if (validGames.length) {
      const { error: upsertError } = await admin.from("games").upsert(validGames, { onConflict: "week_id,provider,provider_game_id" });
      if (upsertError) throw new Error("BragBoard could not save the provider games.");
    }
    const suffix = providerErrors.length ? " Some selected sport feeds are not available on this API-Sports plan." : "";
    return Response.json({ message: `${validGames.length} real game${validGames.length === 1 ? "" : "s"} loaded.${suffix}` }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load games.";
    return Response.json({ error: message }, { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

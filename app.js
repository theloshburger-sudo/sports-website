/* BragBoard's public browser client. Authorization lives in Supabase RLS policies. */
const $ = (id) => document.getElementById(id);
const state = { client: null, user: null, profile: null, leagues: [], league: null, member: null, week: null, games: [], picks: new Map(), signingUp: false, setup: { step: 0, answers: {} } };
const setupQuestions = [
  { key: "name", title: "What should your league be called?", help: "Choose a name your friends will recognize. You can change it later.", input: "Sunday Pick Crew" },
  { key: "authority", title: "Who should manage your league’s settings?", help: "This controls regular settings such as sports and competitions. Punishments always require approval from everyone.", choices: [["everyone", "Everyone decides together", "All members must agree before a regular league setting changes."], ["host", "The host manages settings", "The person who created the league can update regular settings."]] },
  { key: "sports", title: "Which sports will your group pick?", help: "Choose one or more sports to start with. The host adds that week’s games, and these choices can be changed later.", multi: true, choices: [["basketball", "Basketball", "Add basketball games to your league."], ["football", "Football", "Add football games to your league."], ["soccer", "Soccer", "Add soccer matches to your league."]] },
  { key: "winner_period", title: "How often should your league crown a winner?", help: "Choose how long results should count before a new competition begins.", choices: [["weekly", "Every week", "Crown a new winner based on that week’s completed games."], ["monthly", "Every month", "Crown a winner based on all scored picks during the calendar month."], ["weekly_monthly", "Weekly and monthly", "Celebrate weekly winners while also tracking a monthly champion."]] },
  { key: "punishment_mode", title: "Should your league use one shared punishment or separate punishments?", help: "Punishments are optional, harmless social consequences for the group. Every idea needs approval from everyone, and anyone may opt out or leave the league.", choices: [["shared", "One shared punishment", "The group uses the same approved punishment for the people assigned by the standings."], ["separate", "Separate punishments", "The group can approve and assign different punishments to individual players."]] },
  { key: "selection", title: "How should the final punishment be chosen?", help: "First, everyone must approve the available ideas. Then your group chooses among them.", choices: [["vote", "Let the group vote", "Members vote, and the most popular approved idea wins."], ["random", "Choose randomly", "BragBoard randomly selects one of the ideas everyone has approved."]] },
  { key: "loser_scope", title: "Who is assigned the punishment?", help: "This setting uses the standings to determine who is assigned the group’s approved punishment. It is a social agreement, not a legal obligation: participation remains voluntary.", choices: [["last", "The last-place player", "The player at the bottom of the standings is assigned the approved punishment."], ["bottom_three", "The bottom three players", "The three lowest-ranked players are assigned an approved punishment."]] },
  { key: "coins", title: "Should winners earn BragBoard Coins?", help: "BragBoard Coins are in-app points for bragging rights. They are not real money and cannot be purchased, transferred, sold, or redeemed.", choices: [["on", "Yes, award BragBoard Coins", "Weekly winners earn 10 coins and monthly winners earn 20."], ["off", "No, use the leaderboard only", "Track wins and standings without awarding coins."]] },
  { key: "punishment_proposal", title: "Propose a punishment", help: "Write one punishment for your group to review. You will see everyone’s ideas after the league is created. Do not write anything dangerous, degrading, sexual, discriminatory, illegal, or financially coercive.", proposal: true },
  { key: "safety", title: "Agree to the league safety rules", help: "Punishments must be harmless, legal, and voluntary. Dangerous, degrading, sexual, discriminatory, or financially coercive ideas are not allowed. Signing a league agreement does not remove anyone’s right to decline or leave.", choices: [["confirmed", "I agree to keep punishments safe and voluntary", "Your group can only use ideas everyone has approved."]] }
];

function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }
function message(id, text, isError = false) { const node = $(id); node.textContent = text; node.style.color = isError ? "var(--danger)" : ""; }
function toast(text) { const node = $("toast"); node.textContent = text; node.classList.add("show"); window.setTimeout(() => node.classList.remove("show"), 4200); }
function disabled(button, value) { button.disabled = value; }
function configured() {
  const c = window.BRAGBOARD_CONFIG || {};
  return c.url && c.publishableKey && !c.url.includes("YOUR_") && !c.publishableKey.includes("YOUR_");
}
function clear(node) { node.replaceChildren(); }
function button(text, className = "ghost") { const el = document.createElement("button"); el.type = "button"; el.className = className; el.textContent = text; return el; }
function text(tag, value, className) { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; }
function localDate(value) { return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
function isHost() { return state.member?.role === "host"; }

document.addEventListener("DOMContentLoaded", init);
async function init() {
  if (!configured() || !window.supabase?.createClient) { show("connection-panel"); return; }
  const c = window.BRAGBOARD_CONFIG;
  state.client = window.supabase.createClient(c.url, c.publishableKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  bindEvents();
  const { data: { session } } = await state.client.auth.getSession();
  await setUser(session?.user || null);
  state.client.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); });
}
function bindEvents() {
  document.querySelector(".signup-only").hidden = true;
  $("auth-form").addEventListener("submit", signInOrUp);
  $("toggle-auth").addEventListener("click", () => {
    state.signingUp = !state.signingUp;
    document.querySelector(".signup-only").hidden = !state.signingUp;
    $("auth-form").querySelector(".primary").textContent = state.signingUp ? "Create account" : "Sign in";
    $("toggle-auth").textContent = state.signingUp ? "I already have an account" : "Create an account";
    $("auth-password").autocomplete = state.signingUp ? "new-password" : "current-password";
    message("auth-message", "");
  });
  $("sign-out").addEventListener("click", () => state.client.auth.signOut());
  $("create-league-form").addEventListener("submit", startSetup);
  $("setup-form").addEventListener("submit", nextSetup);
  $("setup-back").addEventListener("click", previousSetup);
  $("join-league-form").addEventListener("submit", joinLeague);
  $("back-to-leagues").addEventListener("click", showLeagues);
  $("copy-invite").addEventListener("click", copyInvite);
  $("game-form").addEventListener("submit", addGame);
  $("finalize-week").addEventListener("click", finalizeWeek);
  $("award-month").addEventListener("click", awardMonth);
  $("lock-picks").addEventListener("click", lockPicks);
  $("proposal-form").addEventListener("submit", submitProposal);
  document.addEventListener("click", handleClick);
}
async function setUser(user) {
  state.user = user;
  hide("connection-panel"); hide("auth-panel"); hide("league-panel"); hide("game-panel");
  $("sign-out").hidden = !user;
  if (!user) { show("auth-panel"); return; }
  await loadHome();
}
async function signInOrUp(event) {
  event.preventDefault();
  const email = $("auth-email").value.trim(), password = $("auth-password").value;
  const displayName = $("display-name").value.trim();
  disabled(event.submitter, true); message("auth-message", "");
  const response = state.signingUp
    ? await state.client.auth.signUp({ email, password, options: { data: { display_name: displayName || email.split("@")[0] } } })
    : await state.client.auth.signInWithPassword({ email, password });
  disabled(event.submitter, false);
  if (response.error) return message("auth-message", response.error.message, true);
  if (state.signingUp && !response.data.session) message("auth-message", "Check your email to confirm your account, then sign in.");
}
async function loadHome() {
  const { data: profile } = await state.client.from("profiles").select("display_name").eq("id", state.user.id).maybeSingle();
  state.profile = profile || { display_name: state.user.email };
  $("welcome").textContent = `Welcome back, ${state.profile.display_name}.`;
  const { data, error } = await state.client.from("league_members").select("league_id, role, coins, leagues(id,name,invite_code,created_at)").eq("user_id", state.user.id).order("joined_at", { ascending: false });
  if (error) return toast(error.message);
  state.leagues = data || [];
  $("coin-count").textContent = state.leagues.reduce((sum, m) => sum + (m.coins || 0), 0);
  renderLeagueList(); show("league-panel");
}
function renderLeagueList() {
  const list = $("league-list"); clear(list);
  if (!state.leagues.length) list.append(text("p", "No leagues yet. Create one or join your friends with an invite code.", "hint"));
  for (const member of state.leagues) {
    const league = member.leagues; if (!league) continue;
    const card = button("", "panel league-card"); card.dataset.leagueId = league.id;
    card.append(text("p", member.role === "host" ? "YOU HOST THIS LEAGUE" : "PRIVATE LEAGUE", "eyebrow"), text("h2", league.name), text("p", "Open league →"));
    list.append(card);
  }
}
function startSetup(event) {
  event.preventDefault(); message("league-message", "");
  state.setup = { step: 0, answers: {} }; hide("league-panel"); renderSetup(); show("setup-panel");
}
function renderSetup() {
  const question = setupQuestions[state.setup.step], target = $("setup-question");
  clear(target); $("setup-progress").textContent = `STEP ${state.setup.step + 1} OF ${setupQuestions.length}`;
  $("progress-fill").style.width = `${((state.setup.step + 1) / setupQuestions.length) * 100}%`;
  if (state.setup.step === 0) {
    const intro = document.createElement("div"); intro.className = "setup-intro";
    intro.append(text("p", "CREATE YOUR PRIVATE PICK’EM LEAGUE", "eyebrow"), text("p", "Invite friends, pick the winners of real games, and compete for weekly and monthly bragging rights. There’s no betting or real money. You can change most settings later."));
    target.append(intro);
  }
  target.append(text("h2", question.title), text("p", question.help, "hint"));
  if (question.input) {
    const label = document.createElement("label"); label.textContent = "League name";
    const input = document.createElement("input"); input.id = "setup-input"; input.maxLength = 60; input.required = true; input.placeholder = question.input; input.value = state.setup.answers[question.key] || "";
    label.append(input); target.append(label); input.focus();
  } else if (question.proposal) {
    const label = document.createElement("label"); label.textContent = "Your punishment proposal";
    const input = document.createElement("textarea"); input.id = "setup-proposal"; input.maxLength = 240; input.minLength = 5; input.required = true; input.autocomplete = "off"; input.placeholder = "Write a harmless, voluntary punishment your group can review."; input.value = state.setup.answers[question.key] || "";
    label.append(input);
    const rules = text("p", "5–240 characters. Your group reviews ideas; BragBoard does not automatically decide whether an idea is safe.", "hint");
    const attestation = document.createElement("label"); attestation.className = "check";
    const checkbox = document.createElement("input"); checkbox.id = "setup-proposal-attestation"; checkbox.type = "checkbox"; checkbox.checked = Boolean(state.setup.answers.punishment_attested);
    attestation.append(checkbox, document.createTextNode(" I confirm this proposal is harmless, legal, and voluntary."));
    target.append(label, rules, attestation); input.focus();
  } else {
    const choices = document.createElement("div"); choices.className = "wizard-options";
    for (const [value, label, explanation] of question.choices) {
      const selected = question.multi ? (state.setup.answers[question.key] || []).includes(value) : state.setup.answers[question.key] === value;
      const card = button("", `option-card${selected ? " selected" : ""}`);
      card.dataset.setupChoice = value;
      const copy = document.createElement("span"); copy.className = "choice-copy";
      copy.append(text("strong", label), text("span", explanation, "choice-explanation"));
      if (question.multi) copy.append(text("span", selected ? "Selected ✓" : "Select this sport", "choice-selection"));
      card.append(copy); card.setAttribute("aria-pressed", selected ? "true" : "false");
      card.addEventListener("click", () => {
        if (question.multi) {
          const selectedSports = new Set(state.setup.answers[question.key] || []);
          selectedSports.has(value) ? selectedSports.delete(value) : selectedSports.add(value);
          state.setup.answers[question.key] = [...selectedSports];
        } else state.setup.answers[question.key] = value;
        renderSetup();
      });
      choices.append(card);
    }
    target.append(choices);
  }
  $("setup-back").hidden = state.setup.step === 0;
  $("setup-next").textContent = state.setup.step === setupQuestions.length - 1 ? "Create private league" : "Continue";
  message("setup-message", "");
}
async function nextSetup(event) {
  event.preventDefault();
  const question = setupQuestions[state.setup.step];
  if (question.input) state.setup.answers[question.key] = $("setup-input").value.trim();
  if (question.proposal) {
    state.setup.answers[question.key] = $("setup-proposal").value.trim();
    state.setup.answers.punishment_attested = $("setup-proposal-attestation").checked;
    if (state.setup.answers[question.key].length < 5) return message("setup-message", "Write a punishment proposal of at least 5 characters before continuing.", true);
    if (!state.setup.answers.punishment_attested) return message("setup-message", "Confirm that your proposal is harmless, legal, and voluntary before continuing.", true);
  }
  const answer = state.setup.answers[question.key];
  if (!answer || (Array.isArray(answer) && !answer.length)) return message("setup-message", question.multi ? "Choose at least one sport before continuing." : "Choose an answer before continuing.", true);
  if (state.setup.step < setupQuestions.length - 1) { state.setup.step += 1; renderSetup(); return; }
  disabled($("setup-next"), true);
  let data, error;
  try { ({ data, error } = await state.client.rpc("create_league", { league_name: state.setup.answers.name, league_settings: state.setup.answers })); }
  catch (failure) { error = failure; }
  disabled($("setup-next"), false);
  if (error || !data) return message("setup-message", error?.message || "BragBoard could not create the league. Try again, then share this message with the host if it continues.", true);
  const proposalResult = await state.client.from("punishment_proposals").insert({ league_id: data, proposer_id: state.user.id, body: state.setup.answers.punishment_proposal }).select("id").maybeSingle();
  let proposalWarning = proposalResult.error?.message || "";
  if (!proposalWarning && proposalResult.data?.id) {
    const approval = await state.client.from("proposal_approvals").insert({ proposal_id: proposalResult.data.id, user_id: state.user.id });
    proposalWarning = approval.error?.message || "";
  }
  hide("setup-panel"); await loadHome(); await openLeague(data);
  toast(proposalWarning ? `League created, but your punishment proposal needs to be added from the league page: ${proposalWarning}` : "League created. Your punishment proposal is ready for group approval.");
}
function previousSetup() {
  if (!state.setup.step) return;
  state.setup.step -= 1; renderSetup();
}
async function joinLeague(event) {
  event.preventDefault(); message("league-message", "");
  const { data, error } = await state.client.rpc("join_league", { invite: $("invite-code").value.trim().toUpperCase() });
  if (error) return message("league-message", error.message, true);
  $("invite-code").value = ""; toast("You joined the league."); await loadHome(); await openLeague(data);
}
async function showLeagues() { state.league = null; state.week = null; hide("game-panel"); await loadHome(); }
async function openLeague(leagueId) {
  state.member = state.leagues.find((m) => m.league_id === leagueId);
  state.league = state.member?.leagues;
  if (!state.league) return toast("That league is no longer available.");
  hide("league-panel"); show("game-panel");
  $("league-title").textContent = state.league.name;
  $("copy-invite").hidden = !isHost();
  $("host-tools").hidden = !isHost();
  await loadLeague();
}
async function loadLeague() {
  let { data: week, error } = await state.client.from("game_weeks").select("*").eq("league_id", state.league.id).in("status", ["open", "completed"]).order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return toast(error.message);
  if (!week && isHost()) {
    const created = await state.client.rpc("ensure_current_week", { target_league: state.league.id });
    if (created.error) return toast(created.error.message);
    week = created.data;
  }
  state.week = week; state.games = []; state.picks = new Map();
  $("week-label").textContent = week ? week.label : "WAITING FOR A HOST";
  if (!week) { $("games").replaceChildren(text("p", "The host has not opened a week yet.", "hint")); return; }
  const [gamesResponse, picksResponse, boardResponse, proposalResponse] = await Promise.all([
    state.client.from("games").select("*").eq("week_id", week.id).order("kickoff_at"),
    state.client.from("picks").select("game_id, chosen_team, locked_at").eq("user_id", state.user.id),
    state.client.rpc("league_leaderboard", { target_league: state.league.id }),
    state.client.from("punishment_proposals").select("id,body,status,proposer:profiles(display_name),proposal_approvals(user_id)").eq("league_id", state.league.id).order("created_at")
  ]);
  if (gamesResponse.error || picksResponse.error || boardResponse.error || proposalResponse.error) return toast((gamesResponse.error || picksResponse.error || boardResponse.error || proposalResponse.error).message);
  state.games = gamesResponse.data || [];
  for (const pick of picksResponse.data || []) state.picks.set(pick.game_id, pick);
  renderGames(); renderBoard(boardResponse.data || []); renderProposals(proposalResponse.data || []);
}
function renderGames() {
  const list = $("games"); clear(list);
  if (!state.games.length) list.append(text("p", isHost() ? "Add this week’s first illustrative game above." : "The host has not added games yet.", "hint"));
  const now = Date.now();
  for (const game of state.games) {
    const card = document.createElement("article"); card.className = "game";
    card.append(text("p", `${game.sport} · ${localDate(game.kickoff_at)}`, "game-meta"));
    const prior = state.picks.get(game.id), locked = Boolean(prior) || new Date(game.kickoff_at).getTime() <= now;
    for (const team of [game.home_team, game.away_team]) {
      const pick = button(team, `pick${prior?.chosen_team === team ? " selected" : ""}`);
      pick.dataset.pickGame = game.id; pick.dataset.team = team; pick.disabled = locked; card.append(pick);
    }
    if (game.winner) card.append(text("p", `Winner: ${game.winner}`, "game-meta"));
    if (isHost() && !game.winner && new Date(game.kickoff_at).getTime() <= now) {
      const results = document.createElement("p"); results.className = "game-meta";
      for (const team of [game.home_team, game.away_team]) { const r = button(`Mark ${team} won`); r.dataset.resultGame = game.id; r.dataset.winner = team; results.append(r); }
      card.append(results);
    }
    list.append(card);
  }
  updatePickState();
}
function updatePickState() {
  const selected = state.games.filter((game) => state.picks.has(game.id)).length;
  $("pick-count").textContent = `${selected} / ${state.games.length}`;
  const permanentlyLocked = state.games.some((game) => state.picks.has(game.id));
  disabled($("lock-picks"), !state.games.length || selected !== state.games.length || permanentlyLocked);
  $("lock-picks").textContent = permanentlyLocked ? "Picks locked" : "Lock my picks";
}
function renderBoard(rows) {
  const list = $("leaderboard"); clear(list);
  if (!rows.length) return list.append(text("li", "No scored picks yet."));
  rows.forEach((row, index) => { const line = document.createElement("li"); line.append(text("span", `#${index + 1}  ${row.display_name}`), text("span", `${row.points} pts · ${row.coins} coins`)); list.append(line); });
}
function renderProposals(proposals) {
  const target = $("proposals"); clear(target);
  if (!proposals.length) target.append(text("p", "No proposals yet.", "hint"));
  proposals.forEach((proposal) => {
    const box = document.createElement("article"); box.className = "proposal";
    const approvals = proposal.proposal_approvals?.length || 0;
    box.append(text("strong", proposal.body), text("p", `Proposed by ${proposal.proposer?.display_name || "member"} · ${approvals} approval${approvals === 1 ? "" : "s"} · ${proposal.status}`));
    if (!proposal.proposal_approvals?.some((a) => a.user_id === state.user.id) && proposal.status === "pending") { const approve = button("Approve as safe & voluntary"); approve.dataset.approveProposal = proposal.id; box.append(approve); }
    target.append(box);
  });
}
async function handleClick(event) {
  const pick = event.target.closest("[data-pick-game]");
  if (pick) { state.picks.set(pick.dataset.pickGame, { game_id: pick.dataset.pickGame, chosen_team: pick.dataset.team }); renderGames(); return; }
  const league = event.target.closest("[data-league-id]");
  if (league) return openLeague(league.dataset.leagueId);
  const approve = event.target.closest("[data-approve-proposal]");
  if (approve) {
    const { error } = await state.client.from("proposal_approvals").insert({ proposal_id: approve.dataset.approveProposal, user_id: state.user.id });
    if (error) toast(error.message); else { toast("Approval recorded."); loadLeague(); } return;
  }
  const result = event.target.closest("[data-result-game]");
  if (result) { const response = await state.client.rpc("record_game_result", { target_game: result.dataset.resultGame, winning_team: result.dataset.winner }); if (response.error) toast(response.error.message); else loadLeague(); }
}
async function lockPicks() {
  const picks = state.games.map((game) => ({ game_id: game.id, chosen_team: state.picks.get(game.id)?.chosen_team }));
  const { error } = await state.client.rpc("lock_week_picks", { target_week: state.week.id, selections: picks });
  if (error) return message("pick-message", error.message, true);
  message("pick-message", "Your card is locked. Your picks stay visible, but cannot be changed."); await loadLeague();
}
async function addGame(event) {
  event.preventDefault();
  const game = { week_id: state.week.id, sport: $("game-sport").value.trim(), home_team: $("home-team").value.trim(), away_team: $("away-team").value.trim(), kickoff_at: new Date($("kickoff-at").value).toISOString() };
  if (game.home_team === game.away_team) return toast("Choose two different teams.");
  const { error } = await state.client.from("games").insert(game);
  if (error) return toast(error.message);
  event.target.reset(); toast("Illustrative game added."); loadLeague();
}
async function finalizeWeek() {
  if (!state.week || !confirm("Finalize this fully scored week? Locked picks will be scored and tied weekly leaders receive 10 non-cash coins.")) return;
  const { error } = await state.client.rpc("finalize_week", { target_week: state.week.id });
  if (error) return toast(error.message);
  toast("Week finalized and leaders awarded."); await loadLeague();
}
async function awardMonth() {
  if (!confirm("Award 20 non-cash coins to this month’s tied leaders? This can be done once per calendar month.")) return;
  const { error } = await state.client.rpc("award_month", { target_league: state.league.id });
  if (error) return toast(error.message);
  toast("Monthly leaders awarded."); await loadLeague();
}
async function submitProposal(event) {
  event.preventDefault();
  const body = $("proposal-text").value.trim();
  const { error } = await state.client.from("punishment_proposals").insert({ league_id: state.league.id, proposer_id: state.user.id, body });
  if (error) return toast(error.message);
  event.target.reset(); toast("Punishment submitted for everyone’s approval."); loadLeague();
}
async function copyInvite() {
  try { await navigator.clipboard.writeText(state.league.invite_code); toast(`Invite code ${state.league.invite_code} copied.`); } catch { toast(`Invite code: ${state.league.invite_code}`); }
}

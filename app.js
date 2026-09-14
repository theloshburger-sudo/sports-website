/* BragBoard's public browser client. Authorization lives in Supabase RLS policies. */
const $ = (id) => document.getElementById(id);
const state = { client: null, user: null, profile: null, leagues: [], league: null, member: null, weeks: [], week: null, games: [], picks: new Map(), signingUp: false, setup: { step: 0, answers: {} } };
const setupQuestions = [
  { key: "authority", category: "League leadership", title: "Who manages your league’s regular settings?", help: "Choose how your group changes everyday league settings after setup: sports, winner period, and which games appear. This never gives anyone control over punishments—every punishment still needs approval from every member.", impact: "This choice determines whether normal league updates need a group vote or can be handled by the host.", changeNote: "You can revisit regular settings later. Punishment consent always stays unanimous.", choices: [["everyone", "Everyone decides together", "Every member must agree before a regular league setting changes. Best when your group wants every decision to be shared."], ["host", "The host manages regular settings", "The creator can update sports, winner period, and games without a group vote. Best when your group wants quick adjustments."]] },
  { key: "name", category: "League identity", title: "What should your league be called?", help: "Choose the name your friends will recognize in their invite, on the leaderboard, and in the group chat.", impact: "This is the label your members see whenever they open the league.", changeNote: "You can change the league name later.", input: "Sunday Pick Crew" },
  { key: "sports", category: "Weekly game card", title: "Which sports should appear in your league?", help: "Choose one or more sports to start with. BragBoard uses these choices to load this week’s real men’s professional games.", impact: "Your host will only load games from the sports selected here, so pick the sports your group actually watches.", changeNote: "You can adjust the sport list later before a future week is prepared.", multi: true, choices: [["basketball", "Basketball", "Load NBA games only."], ["football", "Football", "Load NFL games only."], ["soccer", "Soccer", "Load Premier League, LaLiga, Bundesliga, Champions League, and Europa League games only."]] },
  { key: "winner_period", category: "Competition schedule", title: "When should your league celebrate winners?", help: "Choose how long picks count before BragBoard names a new winner. This does not change when individual picks lock—every pick still locks at kickoff.", impact: "This controls the rhythm of the leaderboard and when your group has something new to talk about.", changeNote: "Weekly and monthly is the most complete view; choose the pace that fits your group.", choices: [["weekly", "Every week", "Name a winner from that week’s completed games. Great for quick, frequent bragging rights."], ["monthly", "Every month", "Name a winner from all completed picks in the calendar month. Great for one longer contest."], ["weekly_monthly", "Weekly and monthly", "Celebrate weekly winners while also tracking a monthly champion across every scored pick."]] },
  { key: "punishment_mode", category: "Punishment format", title: "Should your league use one shared punishment or separate punishments?", help: "Punishments are optional, harmless social consequences for the group. Every idea needs approval from everyone, and anyone may opt out or leave the league.", impact: "This tells the group whether standings point to one approved idea or allow different approved ideas for different players.", changeNote: "No punishment can be chosen until the group has approved it unanimously.", choices: [["shared", "One shared punishment", "The group uses one approved punishment for the people assigned by the standings. Simpler to explain and vote on."], ["separate", "Separate punishments", "The group can approve and assign different punishments to individual players. More variety, but more ideas to review."]] },
  { key: "selection", category: "Punishment selection", title: "How should the group choose the final punishment?", help: "First, everyone must approve the available ideas. Then this is the method your group uses to select from only those approved ideas.", impact: "This determines what happens after the safety approval step—not how picks or standings work.", changeNote: "Your group can use a vote or a random choice; only unanimously approved ideas appear in either option.", choices: [["vote", "Let the group vote", "Members vote, and the most popular idea everyone approved wins. Best when your group wants a direct say."], ["random", "Choose randomly", "BragBoard randomly selects one idea everyone approved. Best when your group wants an unbiased surprise."]] },
  { key: "loser_scope", category: "Standings consequence", title: "Who is assigned the punishment?", help: "Choose which lowest-ranked players the standings point to. A punishment remains a voluntary social agreement, never a legal obligation.", impact: "This only identifies who the group may ask about an approved idea after the scoring period ends.", changeNote: "Anyone can decline or leave; no setting can remove that choice.", choices: [["last", "The last-place player", "The player at the bottom of the standings is the only person assigned the approved punishment."], ["bottom_three", "The bottom three players", "The three lowest-ranked players are assigned an approved punishment. This makes the end-of-period race broader."]] },
  { key: "coins", category: "Bragging rights", title: "Should winners earn BragBoard Coins?", help: "BragBoard Coins are in-app scorekeeping points for bragging rights. They are not real money and cannot be purchased, transferred, sold, or redeemed.", impact: "Coins add a visible reward beside the leaderboard; they never create a payment, pot, or cash prize.", changeNote: "If you turn coins on, weekly winners earn 10 and monthly winners earn 20.", choices: [["on", "Yes, award BragBoard Coins", "Show 10 coins for weekly winners and 20 coins for monthly winners. Coins stay inside BragBoard."], ["off", "No, use the leaderboard only", "Keep the game focused on wins, points, and rank without displaying coin awards."]] },
  { key: "punishment_proposal", category: "Your group’s idea", title: "Write the first punishment proposal", help: "Add one harmless, voluntary idea for your friends to review after the league is created. This is a proposal—not an automatic assignment.", impact: "Your group will see this idea alongside other members’ proposals and must approve it unanimously before it can be selected.", changeNote: "Do not include anything dangerous, degrading, sexual, discriminatory, illegal, or financially coercive.", proposal: true },
  { key: "safety", category: "Group agreement", title: "Confirm the league safety rules", help: "Punishments must be harmless, legal, and voluntary. Dangerous, degrading, sexual, discriminatory, or financially coercive ideas are not allowed. Signing a league agreement never removes anyone’s right to decline or leave.", impact: "This rule applies to every proposal and every member, before and after the league begins.", changeNote: "Only ideas everyone approves can enter the group’s selection.", choices: [["confirmed", "I agree to keep punishments safe and voluntary", "I understand that every member can decline or leave, and only unanimously approved ideas can be used."]] }
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
  $("guide-copy-invite").addEventListener("click", copyInvite);
  $("sync-games").addEventListener("click", syncGames);
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
  const { data, error } = await state.client.from("league_members").select("league_id, role, coins, leagues(id,name,invite_code,settings,created_at)").eq("user_id", state.user.id).order("joined_at", { ascending: false });
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
function setupAnswerLabel(question) {
  const answer = state.setup.answers[question.key];
  if (!answer) return null;
  if (question.input) return answer;
  if (question.proposal) return "Proposal written";
  const values = Array.isArray(answer) ? answer : [answer];
  return values.map((value) => question.choices.find(([choice]) => choice === value)?.[1] || value).join(" · ");
}
function appendLeaguePlan(target) {
  const plan = document.createElement("aside"); plan.className = "setup-plan";
  plan.append(text("p", "YOUR LEAGUE PLAN", "eyebrow"));
  const completed = setupQuestions.slice(0, state.setup.step).map((question) => ({ question, answer: setupAnswerLabel(question) })).filter((entry) => entry.answer);
  if (!completed.length) {
    plan.append(text("p", "Your choices will appear here as you shape the league. Nothing is saved until you create the private league.", "hint"));
  } else {
    const list = document.createElement("ul"); list.className = "setup-plan-list";
    completed.forEach(({ question, answer }) => {
      const item = document.createElement("li"); item.append(text("span", question.category), text("strong", answer)); list.append(item);
    });
    plan.append(list, text("p", "Review these choices as you go. You can use Back to change an earlier answer before you create the league.", "hint"));
  }
  target.append(plan);
}
function renderSetup() {
  const question = setupQuestions[state.setup.step], target = $("setup-question");
  clear(target); $("setup-progress").textContent = `STEP ${state.setup.step + 1} OF ${setupQuestions.length} · ${question.category.toUpperCase()}`;
  $("progress-fill").style.width = `${((state.setup.step + 1) / setupQuestions.length) * 100}%`;
  if (state.setup.step === 0) {
    const intro = document.createElement("div"); intro.className = "setup-intro";
    intro.append(text("p", "CREATE YOUR PRIVATE PICK’EM LEAGUE", "eyebrow"), text("p", "You’ll answer 10 quick questions to set the rules your friends will see. First: decide who handles normal league settings. Then choose the sports, winner schedule, and punishment agreement. There’s no betting or real money."));
    target.append(intro);
  }
  target.append(text("p", `DECISION ${state.setup.step + 1} · ${question.category.toUpperCase()}`, "question-category"));
  const titleRow = document.createElement("div"); titleRow.className = "question-title-row";
  const title = text("h2", question.title);
  const helpButton = button("?", "question-help"); helpButton.setAttribute("aria-label", `Explain: ${question.title}`); helpButton.setAttribute("aria-expanded", "false");
  const context = document.createElement("div"); context.className = "question-context"; context.hidden = true;
  context.append(text("p", "WHAT THIS QUESTION MEANS", "context-label"), text("p", question.help), text("p", "WHAT THIS SETTING CHANGES", "context-label"), text("p", question.impact), text("p", question.changeNote, "change-note"));
  helpButton.setAttribute("aria-controls", "question-context"); context.id = "question-context";
  helpButton.addEventListener("click", () => { context.hidden = !context.hidden; helpButton.setAttribute("aria-expanded", String(!context.hidden)); helpButton.textContent = context.hidden ? "?" : "×"; });
  titleRow.append(title, helpButton); target.append(titleRow, context);
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
  appendLeaguePlan(target);
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
async function showLeagues() { state.league = null; state.weeks = []; state.week = null; hide("game-panel"); await loadHome(); }
async function openLeague(leagueId) {
  state.member = state.leagues.find((m) => m.league_id === leagueId);
  state.league = state.member?.leagues;
  if (!state.league) return toast("That league is no longer available.");
  hide("league-panel"); show("game-panel");
  $("league-title").textContent = state.league.name;
  $("copy-invite").hidden = !isHost();
  $("host-tools").hidden = !isHost();
  $("league-instructions-copy").textContent = isHost()
    ? "You are the host. BragBoard schedules this week plus the next two weeks. Choose a week, load its real games, then share the invite code so friends can pick one winner in every game before kickoff."
    : "Choose a scheduled week to see its games. Pick exactly one winner in every listed game before its kickoff, then lock your card. Your locked picks cannot change.";
  const loserScope = state.league.settings?.loser_scope === "bottom_three" ? "the bottom three players" : "the last-place player";
  $("loser-rule-copy").textContent = `This is a loser-does-the-punishment league: when the scoring period ends, ${loserScope} is assigned the group’s unanimously approved punishment. It remains harmless and voluntary; winners get bragging rights and non-cash coins, not a prize.`;
  const sports = state.league.settings?.sports || [];
  const selectedSports = sports.length ? sports.map((sport) => sport[0].toUpperCase() + sport.slice(1)).join(", ") : "the sports selected in setup";
  $("guide-sports").textContent = `You chose ${selectedSports}. BragBoard loads their real men’s professional games for each scheduled week you prepare.`;
  $("sync-copy").textContent = `Choose a scheduled week above, then load its real men’s professional ${selectedSports} games. Women’s competitions are not included.`;
  await loadLeague();
}
async function loadLeague() {
  let { data: weeks, error } = await state.client.from("game_weeks").select("*").eq("league_id", state.league.id).eq("status", "open").gte("ends_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(3);
  if (error) return toast(error.message);
  if (isHost() && (weeks || []).length < 3) {
    const created = await state.client.rpc("ensure_upcoming_weeks", { target_league: state.league.id });
    if (created.error) {
      // Existing projects can keep working while the documented schedule migration is applied.
      const missingScheduleFunction = created.error.code === "42883" || created.error.code === "PGRST202" || /ensure_upcoming_weeks/i.test(created.error.message || "");
      if (!missingScheduleFunction) return toast(created.error.message);
      const fallback = await state.client.rpc("ensure_current_week", { target_league: state.league.id });
      if (fallback.error) return toast(fallback.error.message);
      weeks = fallback.data ? [fallback.data] : weeks;
      message("sync-message", "This project still needs the upcoming-weeks migration before it can schedule all three weeks.", true);
    } else {
      weeks = created.data || weeks;
    }
  }
  state.weeks = (weeks || []).slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  if (!state.week || !state.weeks.some((candidate) => candidate.id === state.week.id)) {
    const now = Date.now();
    state.week = state.weeks.find((candidate) => new Date(candidate.starts_at).getTime() <= now && new Date(candidate.ends_at).getTime() > now) || state.weeks[0] || null;
  }
  const week = state.week;
  state.games = []; state.picks = new Map();
  renderWeekSchedule();
  $("week-label").textContent = week ? week.label : "WAITING FOR A HOST";
  if (!week) { $("games").replaceChildren(text("p", "The host has not opened a week yet.", "hint")); return; }
  const [gamesResponse, picksResponse, boardResponse, proposalResponse] = await Promise.all([
    state.client.from("games").select("*").eq("week_id", week.id).order("kickoff_at"),
    state.client.from("picks").select("game_id, chosen_team, locked_at").eq("user_id", state.user.id),
    state.client.rpc("league_leaderboard", { target_league: state.league.id }),
    state.client.from("punishment_proposals").select("id,body,status,proposer:profiles!punishment_proposals_proposer_id_fkey(display_name),proposal_approvals(user_id)").eq("league_id", state.league.id).order("created_at")
  ]);
  if (gamesResponse.error || picksResponse.error || boardResponse.error || proposalResponse.error) return toast((gamesResponse.error || picksResponse.error || boardResponse.error || proposalResponse.error).message);
  state.games = gamesResponse.data || [];
  for (const pick of picksResponse.data || []) state.picks.set(pick.game_id, pick);
  renderGames(); renderBoard(boardResponse.data || []); renderProposals(proposalResponse.data || []);
}
function weekTabLabel(week, index) {
  const now = Date.now();
  if (new Date(week.starts_at).getTime() <= now && new Date(week.ends_at).getTime() > now) return `This week · ${week.label}`;
  return index === 1 ? `Next week · ${week.label}` : `Week ${index + 1} · ${week.label}`;
}
function renderWeekSchedule() {
  const panel = $("week-schedule"), target = $("week-selector"); clear(target);
  panel.hidden = !state.weeks.length;
  if (!state.weeks.length) return;
  $("week-schedule-copy").textContent = "Your league keeps the current week and the next two weeks ready. Pick a week to view its games or prepare it as host.";
  state.weeks.forEach((week, index) => {
    const tab = button(weekTabLabel(week, index), `week-tab${state.week?.id === week.id ? " selected" : ""}`);
    tab.dataset.weekId = week.id;
    tab.setAttribute("aria-pressed", String(state.week?.id === week.id));
    target.append(tab);
  });
}
function renderGames() {
  const list = $("games"); clear(list);
  const waitingForGames = !state.games.length;
  $("host-start-guide").hidden = !isHost() || !waitingForGames;
  $("host-actions").hidden = waitingForGames || !isHost();
  const selectedWeek = state.week?.label || "this week";
  $("host-tools-title").textContent = `Load games for ${selectedWeek}.`;
  $("sync-games").textContent = `Load ${selectedWeek}'s games`;
  $("game-heading").textContent = isHost() && waitingForGames ? `Prepare ${selectedWeek}.` : "Make your picks.";
  $("pick-rule").textContent = isHost() && waitingForGames ? "Choose one of the next three weeks above, then load its real games. Your friends can make picks after that week’s games load." : "Choose exactly one winner for every listed game. Once locked, your choices remain visible and cannot be changed.";
  if (waitingForGames) list.append(text("p", isHost() ? `No games are loaded for ${selectedWeek} yet — use Step 2 above to load that week’s selected real games.` : `The host is preparing ${selectedWeek}'s games. Check back when the picks are ready.`, "hint"));
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
  const week = event.target.closest("[data-week-id]");
  if (week) {
    const chosen = state.weeks.find((candidate) => candidate.id === week.dataset.weekId);
    if (chosen && chosen.id !== state.week?.id) { state.week = chosen; await loadLeague(); }
    return;
  }
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
async function syncGames() {
  if (!state.week) return message("sync-message", "Choose a scheduled week before loading games.", true);
  const trigger = $("sync-games"); disabled(trigger, true); message("sync-message", "Loading the selected real games…");
  const { data, error } = await state.client.functions.invoke("sync-games", { body: { leagueId: state.league.id, weekId: state.week.id } });
  disabled(trigger, false);
  if (error) return message("sync-message", `Could not load ${state.week.label}'s games. The host needs to finish connecting the sports-data provider.`, true);
  message("sync-message", data?.message || `${state.week.label}'s games are ready.`); await loadLeague();
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

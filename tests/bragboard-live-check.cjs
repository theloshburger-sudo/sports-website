const assert = require("node:assert/strict");
const fs = require("node:fs");

const root = __dirname + "/..";
const html = fs.readFileSync(root + "/index.html", "utf8");
const app = fs.readFileSync(root + "/app.js", "utf8");
const sql = fs.readFileSync(root + "/supabase/schema.sql", "utf8");
const config = fs.readFileSync(root + "/supabase/config.js", "utf8");
const wizardCss = fs.readFileSync(root + "/wizard.css", "utf8");

const check = (condition, description) => {
  assert.ok(condition, description);
  console.log("PASS " + description);
};

check(html.includes('id="auth-form"') && html.includes('id="create-league-form"'), "provides account and private-league entry points");
check((app.match(/key: "/g) || []).length === 10 && app.includes("STEP") && app.includes("setupQuestions.length"), "keeps the accurately numbered ten-question league setup");
check(app.includes("Everyone decides together") && app.includes("I agree to keep punishments safe and voluntary"), "keeps first-time rule explanations in setup");
check(app.includes("CREATE YOUR PRIVATE PICK") && app.includes("choice-explanation"), "introduces Step 1 and explains every answer directly");
check(app.includes("multi: true") && app.includes("Choose at least one sport") && app.includes("setup-proposal"), "lets a creator select multiple sports and write a punishment during setup");
check(!/snake draft|spin a wheel|take turns choosing|rotating turns/i.test(app), "removes rotating-turn selection from the punishment setup");
check(wizardCss.includes("[hidden]{display:none !important}"), "shows exactly one focused application state at a time");
check(html.includes('id="lock-picks"') && app.includes("lock_week_picks"), "uses a database lock function for picks");
check(app.includes("chosen_team") && app.includes("selected !== state.games.length"), "requires one displayed-game choice before locking");
check(app.includes("record_game_result") && app.includes("finalize_week"), "keeps result recording and weekly awards host-mediated");
check(app.includes("punishment_proposals") && app.includes("proposal_approvals"), "keeps voluntary-punishment proposals and approvals in the app");
check(html.includes("no money on the line") && html.includes("does not collect payments"), "discloses the non-cash boundary");
check(sql.includes("enable row level security") && sql.includes("public.is_member"), "enables member-scoped row-level access");
check(sql.includes("Your picks are already locked.") && sql.includes("kickoff_at <= now()"), "enforces immutable pre-kickoff picks in the database");
check(sql.includes("Only the league host") && sql.includes("record_game_result"), "limits result administration to hosts");
check(sql.includes("award_type in ('weekly', 'monthly')") && /'weekly', period, 10/.test(sql) && /'monthly', period, 20/.test(sql), "defines non-cash weekly and monthly coin awards");
check(!/service[_-]?role\s*[:=]\s*['"][^'"]+/.test(config), "contains no service-role credential");
check(!/(stripe|venmo|cashapp|payment intent)/i.test(html + "\n" + app + "\n" + sql), "contains no payment collection integration");

console.log("18 BragBoard live-foundation checks passed. They do not execute a Supabase project or browser UI.");

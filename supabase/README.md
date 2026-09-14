# Connect BragBoard to Supabase

This project is a real multi-user private-league client once it is connected to a Supabase project. It remains strictly non-cash: it does not process payments, hold a pot, or track debts.

## One-time project setup

1. Create a Supabase project.
2. In **SQL Editor**, run the entire schema.sql file.
3. In **Authentication → URL Configuration**, add the deployed Pages URL:
   https://theloshburger-sudo.github.io/sports-website/
4. In the project’s **Connect** dialog, copy the project URL and its browser-safe **publishable key** (or legacy anon key).
5. Replace the blank values in config.js. This file is served to browsers, so it may contain only that public key and URL. Never paste a service-role or secret key.
6. Commit the configured file to the build branch, review the PR, then merge and let GitHub Pages deploy it.

The schema creates profiles after email signup, private leagues with host-generated invite codes, members, provider-synced games, immutable locked picks, results, standings, unanimous punishment approvals, and non-cash coin awards.

## Live men’s-game sync

1. In **SQL Editor**, run `supabase/migrations/20260912_add_provider_games.sql`, `supabase/migrations/20260913_add_upcoming_weeks.sql`, and `supabase/migrations/20260913_add_deletion_controls.sql` once for an existing project.
2. Create an API-Sports account with access to API-Football, API-Basketball, and API-NFL. This app reads only NBA, NFL, Premier League, LaLiga, Bundesliga, Champions League, and Europa League. It does not request women’s competitions, Serie A, or Ligue 1.
3. Create and deploy the `sync-games` Supabase Edge Function from `supabase/functions/sync-games/index.ts`.
4. In **Edge Functions → Secrets**, add `APISPORTS_KEY` with the API-Sports key. Do not put this key in `config.js` or commit it to Git.
5. A league host can choose from the current week plus the next two scheduled weeks, then use **Load [week]'s games**. The function checks that the caller is that league’s host, then upserts the selected week’s games without duplicates. Loading one week at a time avoids a large burst of provider requests.

## First live league

1. Sign up with email and password, then confirm the email if confirmations are enabled.
2. Create a private league and share the visible invite code from its host view.
3. The host sees a three-week schedule, chooses one week, and uses its **Load games** button to import selected real men’s professional games.
4. Each member locks exactly one winner per game before the game’s kickoff.
5. After every result is recorded, the host finalizes the week. Tied weekly leaders get 10 in-app coins; monthly leaders can receive 20 once per calendar month.

## Security boundaries

- Row-level security is enabled on every application table. Signed-in members may see only leagues they have joined.
- The SQL functions enforce private membership, host-only game/result controls, valid pre-kickoff selections, and permanent pick locks.
- A host can permanently delete only their own league after a confirmation prompt. A proposal author can withdraw only their own pending proposal; locked picks are never deletable.
- A Supabase publishable/anon key is intentionally public; its access is constrained by the row-level policies. A secret or service-role key bypasses those policies and must never be placed in this repository or browser code.
- The client intentionally has no payments, cash pots, money transfers, debt collection, or “failure to pay” feature.

Before relying on this app for a real group, have someone run the schema in a disposable Supabase project and test two separate accounts: a host and a joined member.

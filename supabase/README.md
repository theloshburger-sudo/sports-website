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

The schema creates profiles after email signup, private leagues with host-generated invite codes, members, host-added fixtures, immutable locked picks, results, standings, unanimous punishment approvals, and non-cash coin awards.

## First live league

1. Sign up with email and password, then confirm the email if confirmations are enabled.
2. Create a private league and share the visible invite code from its host view.
3. The host opens the week, adds only fixtures they are entitled to use, and labels illustrative fixtures honestly.
4. Each member locks exactly one winner per game before the game’s kickoff.
5. After every result is recorded, the host finalizes the week. Tied weekly leaders get 10 in-app coins; monthly leaders can receive 20 once per calendar month.

## Security boundaries

- Row-level security is enabled on every application table. Signed-in members may see only leagues they have joined.
- The SQL functions enforce private membership, host-only game/result controls, valid pre-kickoff selections, and permanent pick locks.
- A Supabase publishable/anon key is intentionally public; its access is constrained by the row-level policies. A secret or service-role key bypasses those policies and must never be placed in this repository or browser code.
- The client intentionally has no payments, cash pots, money transfers, debt collection, or “failure to pay” feature.

Before relying on this app for a real group, have someone run the schema in a disposable Supabase project and test two separate accounts: a host and a joined member.

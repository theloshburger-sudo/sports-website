-- BragBoard's non-cash private-league schema.
-- Run this once in a new Supabase project's SQL Editor before publishing.
-- Do not use a service-role key in the browser: the policies below are required.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  created_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  host_id uuid not null references public.profiles(id) on delete restrict,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('host', 'member')) default 'member',
  coins integer not null default 0 check (coins >= 0),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table if not exists public.game_weeks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 50),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'open' check (status in ('open', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.game_weeks(id) on delete cascade,
  provider text not null default 'manual',
  provider_game_id text,
  sport text not null check (char_length(sport) between 1 and 30),
  home_team text not null check (char_length(home_team) between 1 and 50),
  away_team text not null check (char_length(away_team) between 1 and 50),
  kickoff_at timestamptz not null,
  winner text check (winner is null or char_length(winner) between 1 and 50),
  created_at timestamptz not null default now(),
  unique (week_id, provider, provider_game_id),
  check (home_team <> away_team),
  check (winner is null or winner = home_team or winner = away_team)
);

create table if not exists public.picks (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  chosen_team text not null,
  locked_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table if not exists public.punishment_proposals (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 5 and 240),
  status text not null default 'pending' check (status in ('pending', 'approved', 'withdrawn')),
  created_at timestamptz not null default now()
);

create table if not exists public.proposal_approvals (
  proposal_id uuid not null references public.punishment_proposals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create table if not exists public.coin_awards (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  award_type text not null check (award_type in ('weekly', 'monthly')),
  period_key date not null,
  amount integer not null check (amount > 0),
  awarded_at timestamptz not null default now(),
  unique (league_id, user_id, award_type, period_key)
);

create index if not exists games_week_kickoff_idx on public.games(week_id, kickoff_at);
create index if not exists picks_user_idx on public.picks(user_id);
create index if not exists league_members_user_idx on public.league_members(user_id);

-- SECURITY DEFINER helpers avoid recursive RLS checks. Keep their search path fixed.
create or replace function public.is_member(target_league uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.league_members where league_id = target_league and user_id = auth.uid());
$$;
create or replace function public.is_host(target_league uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.league_members where league_id = target_league and user_id = auth.uid() and role = 'host');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 32), ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.create_league(league_name text, league_settings jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_league uuid; code text;
begin
  if auth.uid() is null then raise exception 'Sign in to create a league.'; end if;
  if char_length(trim(league_name)) not between 1 and 60 then raise exception 'League name must be 1–60 characters.'; end if;
  -- gen_random_uuid() is available in supported Supabase Postgres projects;
  -- unlike gen_random_bytes(), it does not require the pgcrypto extension.
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) into code;
  insert into public.leagues(name, invite_code, host_id, settings) values (trim(league_name), code, auth.uid(), coalesce(league_settings, '{}'::jsonb)) returning id into new_league;
  insert into public.league_members(league_id, user_id, role) values (new_league, auth.uid(), 'host');
  return new_league;
end;
$$;

create or replace function public.join_league(invite text)
returns uuid language plpgsql security definer set search_path = public as $$
declare joined_league uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to join a league.'; end if;
  select id into joined_league from public.leagues where invite_code = upper(trim(invite));
  if joined_league is null then raise exception 'That invite code was not found.'; end if;
  insert into public.league_members(league_id, user_id) values (joined_league, auth.uid()) on conflict do nothing;
  return joined_league;
end;
$$;

-- A host may permanently delete only their own league. Dependent private data
-- is removed through the foreign-key cascades declared above.
create or replace function public.delete_league(target_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_host(target_league) then raise exception 'Only the league host can delete this league.'; end if;
  delete from public.leagues where id = target_league;
  if not found then raise exception 'That league is no longer available.'; end if;
end;
$$;

-- Keep a proposal record, but stop it from being approved or selected when its
-- author withdraws it before the group has unanimously approved it.
create or replace function public.withdraw_punishment_proposal(target_proposal uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.punishment_proposals
  set status = 'withdrawn'
  where id = target_proposal and proposer_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Only the proposal author can withdraw a pending proposal.'; end if;
end;
$$;

create or replace function public.ensure_current_week(target_league uuid)
returns public.game_weeks language plpgsql security definer set search_path = public as $$
declare active_week public.game_weeks;
begin
  if not public.is_host(target_league) then raise exception 'Only the league host can open a week.'; end if;
  select * into active_week from public.game_weeks where league_id = target_league and status = 'open' order by starts_at desc limit 1;
  if found then return active_week; end if;
  insert into public.game_weeks(league_id, label, starts_at, ends_at)
  values (target_league, 'Week of ' || to_char(now(), 'Mon DD'), now(), now() + interval '7 days')
  returning * into active_week;
  return active_week;
end;
$$;

-- Keep exactly three upcoming open weeks ready for a host. Games remain loaded one
-- selected week at a time, which avoids a large burst of sports-provider requests.
create or replace function public.ensure_upcoming_weeks(target_league uuid)
returns setof public.game_weeks language plpgsql security definer set search_path = public as $$
declare anchor_week public.game_weeks; scheduled_week public.game_weeks; scheduled_start timestamptz; week_offset integer;
begin
  if not public.is_host(target_league) then raise exception 'Only the league host can schedule upcoming weeks.'; end if;

  select * into anchor_week
  from public.game_weeks
  where league_id = target_league and status = 'open' and ends_at > now()
  order by starts_at asc
  limit 1;

  if not found then
    insert into public.game_weeks(league_id, label, starts_at, ends_at)
    values (target_league, 'Week of ' || to_char(now(), 'Mon DD'), now(), now() + interval '7 days')
    returning * into anchor_week;
  end if;

  for week_offset in 0..2 loop
    scheduled_start := anchor_week.starts_at + (week_offset * interval '7 days');
    select * into scheduled_week
    from public.game_weeks
    where league_id = target_league and starts_at = scheduled_start
    order by created_at asc
    limit 1;
    if not found then
      insert into public.game_weeks(league_id, label, starts_at, ends_at)
      values (
        target_league,
        'Week of ' || to_char(scheduled_start, 'Mon DD'),
        scheduled_start,
        scheduled_start + interval '7 days'
      )
      returning * into scheduled_week;
    end if;
    return next scheduled_week;
  end loop;
end;
$$;

create or replace function public.lock_week_picks(target_week uuid, selections jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare total_games integer; supplied integer; existing integer; invalid integer;
begin
  if auth.uid() is null then raise exception 'Sign in to lock picks.'; end if;
  if not exists (select 1 from public.game_weeks w where w.id = target_week and w.status = 'open' and public.is_member(w.league_id)) then raise exception 'That week is unavailable.'; end if;
  select count(*) into existing from public.picks p join public.games g on g.id = p.game_id where p.user_id = auth.uid() and g.week_id = target_week;
  if existing > 0 then raise exception 'Your picks are already locked.'; end if;
  select count(*) into total_games from public.games where week_id = target_week;
  select count(*), count(distinct (x ->> 'game_id')) into supplied, invalid
  from jsonb_array_elements(selections) x;
  if total_games = 0 or supplied <> total_games or invalid <> total_games then raise exception 'Choose one winner for every displayed game.'; end if;
  select count(*) into invalid from jsonb_array_elements(selections) x
  left join public.games g on g.id = (x ->> 'game_id')::uuid and g.week_id = target_week
  where g.id is null or g.kickoff_at <= now() or (x ->> 'chosen_team') not in (g.home_team, g.away_team);
  if invalid > 0 then raise exception 'Every pick must be a current game and a valid team before kickoff.'; end if;
  insert into public.picks(game_id, user_id, chosen_team)
  select (x ->> 'game_id')::uuid, auth.uid(), x ->> 'chosen_team' from jsonb_array_elements(selections) x;
end;
$$;

create or replace function public.record_game_result(target_game uuid, winning_team text)
returns void language plpgsql security definer set search_path = public as $$
declare league_uuid uuid;
begin
  select w.league_id into league_uuid from public.games g join public.game_weeks w on w.id = g.week_id where g.id = target_game;
  if league_uuid is null or not public.is_host(league_uuid) then raise exception 'Only the league host can record a result.'; end if;
  update public.games set winner = winning_team where id = target_game and kickoff_at <= now() and winning_team in (home_team, away_team);
  if not found then raise exception 'Choose one of the teams in this game.'; end if;
end;
$$;

create or replace function public.league_leaderboard(target_league uuid)
returns table(display_name text, points integer, coins integer)
language sql stable security definer set search_path = public as $$
  select pr.display_name, coalesce(scores.points, 0)::integer, m.coins
  from public.league_members m
  join public.profiles pr on pr.id = m.user_id
  left join lateral (
    select sum(case when g.winner = p.chosen_team then 1 else 0 end) as points
    from public.picks p
    join public.games g on g.id = p.game_id
    join public.game_weeks w on w.id = g.week_id
    where p.user_id = m.user_id and w.league_id = target_league
  ) scores on true
  where m.league_id = target_league and public.is_member(target_league)
  group by pr.display_name, m.coins, scores.points
  order by points desc, pr.display_name asc;
$$;

create or replace function public.finalize_week(target_week uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target_league uuid; period date; top_score integer;
begin
  select league_id, starts_at::date into target_league, period from public.game_weeks where id = target_week and status = 'open';
  if target_league is null or not public.is_host(target_league) then raise exception 'Only the host can finalize an open week.'; end if;
  if exists (select 1 from public.games where week_id = target_week and winner is null) then raise exception 'Record every game result before finalizing.'; end if;
  select max(points) into top_score from (
    select p.user_id, sum(case when g.winner = p.chosen_team then 1 else 0 end)::integer as points
    from public.picks p join public.games g on g.id = p.game_id where g.week_id = target_week group by p.user_id
  ) scored;
  update public.game_weeks set status = 'completed' where id = target_week;
  if top_score is null then return; end if;
  insert into public.coin_awards(league_id, user_id, award_type, period_key, amount)
  select target_league, scored.user_id, 'weekly', period, 10 from (
    select p.user_id, sum(case when g.winner = p.chosen_team then 1 else 0 end)::integer as points
    from public.picks p join public.games g on g.id = p.game_id where g.week_id = target_week group by p.user_id
  ) scored where scored.points = top_score
  on conflict do nothing;
  update public.league_members m set coins = m.coins + 10
  where m.league_id = target_league and exists (
    select 1 from public.coin_awards a where a.league_id = target_league and a.user_id = m.user_id and a.award_type = 'weekly' and a.period_key = period
  );
end;
$$;

create or replace function public.award_month(target_league uuid)
returns void language plpgsql security definer set search_path = public as $$
declare period date := date_trunc('month', now())::date; top_score integer;
begin
  if not public.is_host(target_league) then raise exception 'Only the host can award the monthly leaders.'; end if;
  if exists (select 1 from public.coin_awards where league_id = target_league and award_type = 'monthly' and period_key = period) then raise exception 'This month has already been awarded.'; end if;
  select max(points) into top_score from (
    select p.user_id, sum(case when g.winner = p.chosen_team then 1 else 0 end)::integer as points
    from public.picks p join public.games g on g.id = p.game_id
    join public.game_weeks w on w.id = g.week_id
    where w.league_id = target_league and g.kickoff_at >= period and g.kickoff_at < (period + interval '1 month') and g.winner is not null
    group by p.user_id
  ) scored;
  if top_score is null then raise exception 'There are no scored picks this month.'; end if;
  insert into public.coin_awards(league_id, user_id, award_type, period_key, amount)
  select target_league, scored.user_id, 'monthly', period, 20 from (
    select p.user_id, sum(case when g.winner = p.chosen_team then 1 else 0 end)::integer as points
    from public.picks p join public.games g on g.id = p.game_id join public.game_weeks w on w.id = g.week_id
    where w.league_id = target_league and g.kickoff_at >= period and g.kickoff_at < (period + interval '1 month') and g.winner is not null
    group by p.user_id
  ) scored where scored.points = top_score;
  update public.league_members m set coins = m.coins + 20
  where m.league_id = target_league and exists (
    select 1 from public.coin_awards a where a.league_id = target_league and a.user_id = m.user_id and a.award_type = 'monthly' and a.period_key = period
  );
end;
$$;

create or replace function public.refresh_proposal_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid; members integer; approvals integer;
begin
  select league_id into target from public.punishment_proposals where id = new.proposal_id;
  select count(*) into members from public.league_members where league_id = target;
  select count(*) into approvals from public.proposal_approvals where proposal_id = new.proposal_id;
  if members > 0 and approvals = members then update public.punishment_proposals set status = 'approved' where id = new.proposal_id; end if;
  return new;
end;
$$;
drop trigger if exists on_proposal_approval on public.proposal_approvals;
create trigger on_proposal_approval after insert on public.proposal_approvals for each row execute procedure public.refresh_proposal_status();

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.game_weeks enable row level security;
alter table public.games enable row level security;
alter table public.picks enable row level security;
alter table public.punishment_proposals enable row level security;
alter table public.proposal_approvals enable row level security;
alter table public.coin_awards enable row level security;

create policy "profiles are visible to league peers" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.league_members mine join public.league_members peer on peer.league_id = mine.league_id
    where mine.user_id = auth.uid() and peer.user_id = profiles.id
  )
);
create policy "members read their leagues" on public.leagues for select to authenticated using (public.is_member(id));
create policy "members read league members" on public.league_members for select to authenticated using (public.is_member(league_id));
create policy "members read game weeks" on public.game_weeks for select to authenticated using (public.is_member(league_id));
create policy "hosts manage game weeks" on public.game_weeks for all to authenticated using (public.is_host(league_id)) with check (public.is_host(league_id));
create policy "members read games" on public.games for select to authenticated using (exists (select 1 from public.game_weeks w where w.id = week_id and public.is_member(w.league_id)));
create policy "hosts manage games" on public.games for all to authenticated using (exists (select 1 from public.game_weeks w where w.id = week_id and public.is_host(w.league_id))) with check (exists (select 1 from public.game_weeks w where w.id = week_id and public.is_host(w.league_id)));
create policy "members read league picks" on public.picks for select to authenticated using (exists (select 1 from public.games g join public.game_weeks w on w.id = g.week_id where g.id = game_id and public.is_member(w.league_id)));
create policy "members read proposals" on public.punishment_proposals for select to authenticated using (public.is_member(league_id));
create policy "members submit their own proposals" on public.punishment_proposals for insert to authenticated with check (proposer_id = auth.uid() and public.is_member(league_id));
create policy "members read approvals" on public.proposal_approvals for select to authenticated using (exists (select 1 from public.punishment_proposals p where p.id = proposal_id and public.is_member(p.league_id)));
create policy "members approve once" on public.proposal_approvals for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.punishment_proposals p where p.id = proposal_id and public.is_member(p.league_id)));
create policy "members read coin awards" on public.coin_awards for select to authenticated using (public.is_member(league_id));

grant usage on schema public to authenticated;
grant select on public.profiles, public.leagues, public.league_members, public.game_weeks, public.games, public.picks, public.punishment_proposals, public.proposal_approvals, public.coin_awards to authenticated;
grant insert on public.games, public.punishment_proposals, public.proposal_approvals to authenticated;
grant execute on function public.create_league(text, jsonb), public.join_league(text), public.delete_league(uuid), public.withdraw_punishment_proposal(uuid), public.ensure_current_week(uuid), public.ensure_upcoming_weeks(uuid), public.lock_week_picks(uuid, jsonb), public.record_game_result(uuid, text), public.league_leaderboard(uuid), public.finalize_week(uuid), public.award_month(uuid) to authenticated;

-- Run this once in the Supabase SQL Editor for existing BragBoard projects.
-- It replaces the unavailable gen_random_bytes() call with gen_random_uuid().
create or replace function public.create_league(league_name text, league_settings jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_league uuid; code text;
begin
  if auth.uid() is null then raise exception 'Sign in to create a league.'; end if;
  if char_length(trim(league_name)) not between 1 and 60 then raise exception 'League name must be 1–60 characters.'; end if;
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) into code;
  insert into public.leagues(name, invite_code, host_id, settings)
  values (trim(league_name), code, auth.uid(), coalesce(league_settings, '{}'::jsonb))
  returning id into new_league;
  insert into public.league_members(league_id, user_id, role) values (new_league, auth.uid(), 'host');
  return new_league;
end;
$$;

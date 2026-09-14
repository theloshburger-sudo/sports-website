-- Run this once in the Supabase SQL Editor for an existing BragBoard project.
-- It schedules the current week plus the next two open weeks for the host.
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

grant execute on function public.ensure_upcoming_weeks(uuid) to authenticated;

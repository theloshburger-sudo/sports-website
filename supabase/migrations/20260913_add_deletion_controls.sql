-- Run this once in the Supabase SQL Editor for an existing BragBoard project.
-- League deletion is deliberately restricted to its host; proposal withdrawal
-- is restricted to its author and preserves an auditable withdrawn status.
create or replace function public.delete_league(target_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_host(target_league) then raise exception 'Only the league host can delete this league.'; end if;
  delete from public.leagues where id = target_league;
  if not found then raise exception 'That league is no longer available.'; end if;
end;
$$;

create or replace function public.withdraw_punishment_proposal(target_proposal uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.punishment_proposals
  set status = 'withdrawn'
  where id = target_proposal and proposer_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Only the proposal author can withdraw a pending proposal.'; end if;
end;
$$;

grant execute on function public.delete_league(uuid), public.withdraw_punishment_proposal(uuid) to authenticated;

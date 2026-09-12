-- Run this once in an existing BragBoard Supabase project before deploying sync-games.
alter table public.games add column if not exists provider text not null default 'manual';
alter table public.games add column if not exists provider_game_id text;
alter table public.games drop constraint if exists games_week_id_provider_provider_game_id_key;
alter table public.games add constraint games_week_id_provider_provider_game_id_key unique (week_id, provider, provider_game_id);

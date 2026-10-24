-- =====================================================================
-- Nexus — v8: games hub leaderboards. Applied live as nexus_19_games + nexus_19b_game_leaderboard.
-- =====================================================================
create table if not exists public.game_scores (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game        text not null check (game in ('streets', 'blocks', 'snake', '2048', 'beatbird')),
  score       int not null check (score between 0 and 100000000),
  created_at  timestamptz not null default now()
);
create index if not exists game_scores_game_idx on public.game_scores (game, score desc);
create index if not exists game_scores_user_idx on public.game_scores (user_id, game);
alter table public.game_scores enable row level security;
create policy "game scores read" on public.game_scores for select to authenticated using (true);
create policy "game scores insert" on public.game_scores for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_banned());

-- best score per player
create or replace function public.game_leaderboard(p_game text, p_limit int default 20)
returns table (user_id uuid, best int, at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.user_id, b.score, b.created_at from (
    select distinct on (s.user_id) s.user_id, s.score, s.created_at
    from public.game_scores s
    where s.game = p_game
    order by s.user_id, s.score desc, s.created_at
  ) b
  order by b.score desc, b.created_at
  limit least(greatest(p_limit, 1), 100)
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

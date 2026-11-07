-- Takedown protection: releases a member watches on Spotify / Apple Music / YouTube / Deezer / SoundCloud / TIDAL.
-- The app checks them and flags when one disappears so it can be appealed fast.
create table if not exists public.release_watch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  url text not null check (char_length(url) <= 500 and url ~* '^https://'),
  platform text not null check (platform in ('spotify', 'apple', 'youtube', 'deezer', 'soundcloud', 'tidal', 'isrc')),
  label text check (char_length(label) <= 120),
  title text check (char_length(title) <= 200),
  status text not null default 'unknown' check (status in ('unknown', 'live', 'missing')),
  last_checked timestamptz,
  last_live timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index if not exists release_watch_user_idx on public.release_watch (user_id, created_at desc);
alter table public.release_watch enable row level security;
revoke all on public.release_watch from anon, authenticated;
grant select, insert, update, delete on public.release_watch to authenticated;
create policy "own watch read" on public.release_watch for select to authenticated using (user_id = (select auth.uid()));
create policy "own watch add" on public.release_watch for insert to authenticated with check (user_id = (select auth.uid()) and (select count(*) from public.release_watch w where w.user_id = (select auth.uid())) < 200);
create policy "own watch update" on public.release_watch for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own watch delete" on public.release_watch for delete to authenticated using (user_id = (select auth.uid()));

-- Beat Battle: shareable song links (public or unlisted) + multiplayer room invites.

-- 1) Room invites: the CHECK still only allowed the first three games, so "Invite friends" failed
--    (silently) in Flappy Race, Classic Strike and Global Strike. Widen it and add Beat Battle.
alter table public.game_invites drop constraint if exists game_invites_game_check;
alter table public.game_invites add constraint game_invites_game_check
  check (game in ('streets', 'geo', 'four', 'flappy', 'classicstrike', 'globalstrike', 'beat'));

-- 2) Unlisted community songs: not in the browse list, playable by anyone with the link.
alter table public.beat_songs add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'unlisted'));
create index if not exists beat_songs_visible on public.beat_songs (visibility, hidden, created_at desc);
grant update (title, credit, difficulty, color, hidden, visibility) on public.beat_songs to authenticated;

-- One song by id (used by invite links). Hidden songs stay hidden; unlisted ones open fine.
create or replace function public.beat_song_by_id(p_id uuid)
returns public.beat_songs language sql stable security definer set search_path = '' as $$
  select * from public.beat_songs where id = p_id and auth.uid() is not null
    and (not hidden or owner_id = auth.uid() or public.my_rank() >= 2);
$$;
revoke execute on function public.beat_song_by_id(uuid) from public, anon;
grant execute on function public.beat_song_by_id(uuid) to authenticated;

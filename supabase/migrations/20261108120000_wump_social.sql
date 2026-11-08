-- Wump social: shared music (own uploads → friends), saved-place folders, 48 h stories for VIP / staff / premium.

-- ------------------------------------------------------------------ 48 h stories
create or replace function public.can_long_story(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = u and (public.role_rank(p.site_role) >= 1 or (p.premium_until > now() and public.tier_rank(p.premium_tier) >= 1)))
      or public.wump_is_plus(u);
$$;
revoke execute on function public.can_long_story(uuid) from public, anon;
grant execute on function public.can_long_story(uuid) to authenticated;

create or replace function public.gram_story_expiry()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.duration_h = 48 and not public.can_long_story(new.author_id) then
      raise exception '48-hour stories are for VIP, premium and staff — post a 24-hour story instead';
    end if;
    new.created_at := now();
    new.expires_at := now() + make_interval(hours => new.duration_h);
  elsif current_user in ('authenticated', 'anon') then
    -- editing media (story repair) is fine; the clock and author are not
    new.author_id := old.author_id;
    new.duration_h := old.duration_h;
    new.created_at := old.created_at;
    new.expires_at := old.expires_at;
  end if;
  return new;
end $$;
drop trigger if exists gram_story_expiry on public.gram_stories;
create trigger gram_story_expiry before insert or update on public.gram_stories for each row execute function public.gram_story_expiry();

-- ------------------------------------------------------------------ saved place folders
create table if not exists public.wump_place_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  emoji text check (emoji is null or char_length(emoji) <= 8),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists wump_place_folders_user on public.wump_place_folders (user_id, position);
alter table public.wump_place_folders enable row level security;
drop policy if exists wump_place_folders_own on public.wump_place_folders;
create policy wump_place_folders_own on public.wump_place_folders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.wump_place_folders to authenticated;

create or replace function public.wump_folder_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.wump_place_folders where user_id = new.user_id) >= 50 then raise exception 'Up to 50 folders'; end if;
  return new;
end $$;
drop trigger if exists wump_folder_limit on public.wump_place_folders;
create trigger wump_folder_limit before insert on public.wump_place_folders for each row execute function public.wump_folder_limit();

alter table public.wump_saved_places add column if not exists folder_id uuid references public.wump_place_folders (id) on delete set null;
create index if not exists wump_saved_places_folder on public.wump_saved_places (folder_id);

create or replace function public.wump_set_place_folder(p_place uuid, p_folder uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_folder is not null and not exists (select 1 from public.wump_place_folders where id = p_folder and user_id = auth.uid()) then raise exception 'folder not found'; end if;
  update public.wump_saved_places set folder_id = p_folder where id = p_place and user_id = auth.uid();
  return found;
end $$;
revoke execute on function public.wump_set_place_folder(uuid, uuid) from public, anon;
grant execute on function public.wump_set_place_folder(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------ shared music
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wump-music', 'wump-music', false, 52428800, array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg', 'audio/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.wump_tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  artist text check (artist is null or char_length(artist) <= 120),
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  mime text,
  bytes bigint check (bytes is null or bytes between 1 and 52428800),
  duration real,
  created_at timestamptz not null default now()
);
create index if not exists wump_tracks_owner on public.wump_tracks (owner_id, created_at desc);
create table if not exists public.wump_track_shares (
  track_id uuid not null references public.wump_tracks (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (track_id, recipient_id)
);
create index if not exists wump_track_shares_recipient on public.wump_track_shares (recipient_id, created_at desc);
alter table public.wump_tracks enable row level security;
alter table public.wump_track_shares enable row level security;

-- definer helpers keep the two tables' policies from recursing into each other
create or replace function public.wump_track_shared_with(p_track uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wump_track_shares where track_id = p_track and recipient_id = p_user);
$$;
create or replace function public.wump_track_owned_by(p_track uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wump_tracks where id = p_track and owner_id = p_user);
$$;
revoke execute on function public.wump_track_shared_with(uuid, uuid) from public, anon;
revoke execute on function public.wump_track_owned_by(uuid, uuid) from public, anon;
grant execute on function public.wump_track_shared_with(uuid, uuid) to authenticated;
grant execute on function public.wump_track_owned_by(uuid, uuid) to authenticated;

drop policy if exists wump_tracks_read on public.wump_tracks;
create policy wump_tracks_read on public.wump_tracks for select to authenticated using (
  owner_id = (select auth.uid()) or public.wump_track_shared_with(id, (select auth.uid())));
drop policy if exists wump_tracks_insert on public.wump_tracks;
create policy wump_tracks_insert on public.wump_tracks for insert to authenticated with check (
  owner_id = (select auth.uid()) and split_part(path, '/', 1) = (select auth.uid())::text);
drop policy if exists wump_tracks_update on public.wump_tracks;
create policy wump_tracks_update on public.wump_tracks for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists wump_tracks_delete on public.wump_tracks;
create policy wump_tracks_delete on public.wump_tracks for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.wump_tracks from anon;
grant select, insert, delete on public.wump_tracks to authenticated;
grant update (title, artist, duration) on public.wump_tracks to authenticated;

drop policy if exists wump_track_shares_read on public.wump_track_shares;
create policy wump_track_shares_read on public.wump_track_shares for select to authenticated using (
  recipient_id = (select auth.uid()) or public.wump_track_owned_by(track_id, (select auth.uid())));
drop policy if exists wump_track_shares_delete on public.wump_track_shares;
create policy wump_track_shares_delete on public.wump_track_shares for delete to authenticated using (
  recipient_id = (select auth.uid()) or public.wump_track_owned_by(track_id, (select auth.uid())));
revoke all on public.wump_track_shares from anon;
grant select, delete on public.wump_track_shares to authenticated;

create or replace function public.wump_track_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.wump_tracks where owner_id = new.owner_id) >= 200 then raise exception 'Up to 200 shared songs — delete some first'; end if;
  return new;
end $$;
drop trigger if exists wump_track_limit on public.wump_tracks;
create trigger wump_track_limit before insert on public.wump_tracks for each row execute function public.wump_track_limit();

create or replace function public.wump_track_path_shared(p_path text, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wump_tracks t join public.wump_track_shares s on s.track_id = t.id where t.path = p_path and s.recipient_id = p_user);
$$;
revoke execute on function public.wump_track_path_shared(text, uuid) from public, anon;
grant execute on function public.wump_track_path_shared(text, uuid) to authenticated;

-- storage: upload into your own folder; read your own files or ones shared with you
drop policy if exists "wump music upload" on storage.objects;
create policy "wump music upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'wump-music' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "wump music read" on storage.objects;
create policy "wump music read" on storage.objects for select to authenticated using (
  bucket_id = 'wump-music' and ((storage.foldername(name))[1] = (select auth.uid())::text
    or public.wump_track_path_shared(objects.name, (select auth.uid()))));
drop policy if exists "wump music delete" on storage.objects;
create policy "wump music delete" on storage.objects for delete to authenticated using (
  bucket_id = 'wump-music' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- share with friends (and drop a DM so it shows up in their Wump chat)
create or replace function public.wump_share_track(p_track uuid, p_to uuid[], p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t public.wump_tracks; r uuid; n int := 0;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into t from public.wump_tracks where id = p_track and owner_id = me;
  if not found then raise exception 'song not found'; end if;
  if coalesce(array_length(p_to, 1), 0) = 0 or array_length(p_to, 1) > 50 then raise exception 'pick 1–50 friends'; end if;
  foreach r in array p_to loop
    if r = me or not public.bump_is_friend(me, r) then continue; end if;
    insert into public.wump_track_shares (track_id, recipient_id) values (t.id, r) on conflict do nothing;
    if found then
      insert into public.bump_messages (sender_id, recipient_id, body)
      values (me, r, left(format(E'🎵 %s%s\nwump-track:%s', t.title, coalesce(' — ' || nullif(btrim(t.artist), ''), ''),
        t.id) || coalesce(E'\n' || nullif(left(btrim(p_note), 200), ''), ''), 1000));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.wump_share_track(uuid, uuid[], text) from public, anon;
grant execute on function public.wump_share_track(uuid, uuid[], text) to authenticated;

create or replace function public.wump_shared_with_me(p_limit int default 100)
returns table (id uuid, owner_id uuid, title text, artist text, path text, mime text, bytes bigint, duration real, shared_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.owner_id, t.title, t.artist, t.path, t.mime, t.bytes, t.duration, s.created_at
  from public.wump_track_shares s join public.wump_tracks t on t.id = s.track_id
  where s.recipient_id = auth.uid() order by s.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
revoke execute on function public.wump_shared_with_me(int) from public, anon;
grant execute on function public.wump_shared_with_me(int) to authenticated;

-- ------------------------------------------------------------------ Beat Battle community songs
-- Members upload songs/charts THEY made (or have the rights to) so everyone can play them. Public bucket (the
-- game streams Inst/Voices with plain fetch); staff can take a song down.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('beat-songs', 'beat-songs', true, 41943040, array['application/json', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.beat_songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  credit text check (credit is null or char_length(credit) <= 120),
  difficulty text not null default 'Hard' check (char_length(difficulty) between 1 and 20),
  chart_path text not null check (chart_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/chart\.json$'),
  inst_path text not null check (inst_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/inst\.[a-z0-9]{2,4}$'),
  voices_path text check (voices_path is null or voices_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/voices\.[a-z0-9]{2,4}$'),
  notes int not null default 0 check (notes between 0 and 20000),
  bpm real,
  length_ms int,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  plays int not null default 0,
  rights_confirmed boolean not null default false check (rights_confirmed),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists beat_songs_recent on public.beat_songs (hidden, created_at desc);
create index if not exists beat_songs_plays on public.beat_songs (hidden, plays desc);
alter table public.beat_songs enable row level security;
drop policy if exists beat_songs_read on public.beat_songs;
create policy beat_songs_read on public.beat_songs for select to authenticated using (not hidden or owner_id = (select auth.uid()) or public.my_rank() >= 2);
drop policy if exists beat_songs_insert on public.beat_songs;
create policy beat_songs_insert on public.beat_songs for insert to authenticated with check (
  owner_id = (select auth.uid()) and not public.is_banned() and split_part(chart_path, '/', 1) = (select auth.uid())::text
  and split_part(inst_path, '/', 1) = (select auth.uid())::text and (voices_path is null or split_part(voices_path, '/', 1) = (select auth.uid())::text));
drop policy if exists beat_songs_update on public.beat_songs;
create policy beat_songs_update on public.beat_songs for update to authenticated using (owner_id = (select auth.uid()) or public.my_rank() >= 2) with check (owner_id = (select auth.uid()) or public.my_rank() >= 2);
drop policy if exists beat_songs_delete on public.beat_songs;
create policy beat_songs_delete on public.beat_songs for delete to authenticated using (owner_id = (select auth.uid()) or public.my_rank() >= 2);
revoke all on public.beat_songs from anon;
grant select, insert, delete on public.beat_songs to authenticated;
grant update (title, credit, difficulty, color, hidden) on public.beat_songs to authenticated;

create or replace function public.beat_song_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.beat_songs where owner_id = new.owner_id) >= 40 then raise exception 'Up to 40 community songs per member'; end if;
    if (select count(*) from public.beat_songs where owner_id = new.owner_id and created_at > now() - interval '1 hour') >= 5 then raise exception 'Slow down — 5 uploads per hour'; end if;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') then
    -- owners can't un-hide a song staff took down; only staff flip hidden
    if new.hidden is distinct from old.hidden and public.my_rank() < 2 then new.hidden := old.hidden; end if;
    new.plays := old.plays;
    new.owner_id := old.owner_id;
  end if;
  return new;
end $$;
drop trigger if exists beat_song_guard on public.beat_songs;
create trigger beat_song_guard before insert or update on public.beat_songs for each row execute function public.beat_song_guard();

create or replace function public.beat_song_played(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.beat_songs set plays = plays + 1 where id = p_id and not hidden and auth.uid() is not null;
$$;
revoke execute on function public.beat_song_played(uuid) from public, anon;
grant execute on function public.beat_song_played(uuid) to authenticated;

drop policy if exists "beat songs upload" on storage.objects;
create policy "beat songs upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'beat-songs' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.is_banned());
drop policy if exists "beat songs read" on storage.objects;
create policy "beat songs read" on storage.objects for select to public using (bucket_id = 'beat-songs');
drop policy if exists "beat songs delete" on storage.objects;
create policy "beat songs delete" on storage.objects for delete to authenticated using (
  bucket_id = 'beat-songs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.my_rank() >= 2));

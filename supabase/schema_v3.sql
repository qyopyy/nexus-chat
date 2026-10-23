-- =====================================================================
-- Nexus chat — v3: profile links/UID/banner/song, new badges, mutes,
-- music hub (artist pages, claims, posts, comments, watchlist),
-- listen-together space music, private attachments.
-- Run AFTER schema.sql and schema_v2.sql. No destructive statements.
-- =====================================================================

-- ---------------------------------------------------------------- profiles
alter table public.profiles
  add column if not exists links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 10),
  add column if not exists banner_url text check (char_length(banner_url) <= 600),
  add column if not exists profile_song text check (char_length(profile_song) <= 300),
  add column if not exists now_playing jsonb,
  add column if not exists forum_name text check (forum_name ~ '^[a-zA-Z0-9_.]{2,24}$'),
  add column if not exists member_no bigint,
  add column if not exists muted_until timestamptz,
  add column if not exists mute_reason text check (char_length(mute_reason) <= 200);

create unique index if not exists profiles_forum_name_idx on public.profiles (lower(forum_name));

-- safe text -> uuid for storage path policies
create or replace function public.try_uuid(t text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- UID = registration number (#1 is the first account ever)
create sequence if not exists public.member_no_seq;
with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.profiles where member_no is null
)
update public.profiles p
set member_no = o.rn + coalesce((select max(member_no) from public.profiles), 0)
from ordered o where o.id = p.id;
select setval('public.member_no_seq', greatest(coalesce((select max(member_no) from public.profiles), 0), 1), (select count(*) > 0 from public.profiles));
alter table public.profiles alter column member_no set default nextval('public.member_no_seq');
create unique index if not exists profiles_member_no_idx on public.profiles (member_no);

create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('nexus.admin_write', true), '') = 'on' then return new; end if;
  if auth.uid() is null then return new; end if;
  if new.site_role is distinct from old.site_role
     or new.banned_until is distinct from old.banned_until
     or new.ban_reason is distinct from old.ban_reason
     or new.muted_until is distinct from old.muted_until
     or new.mute_reason is distinct from old.mute_reason
     or new.member_no is distinct from old.member_no
     or new.username is distinct from old.username
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'You are not allowed to change that';
  end if;
  return new;
end;
$$;

create or replace function public.is_muted()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select muted_until > now() from public.profiles where id = (select auth.uid())), false);
$$;

alter policy "messages insert" on public.messages
  with check (author_id = (select auth.uid()) and public.is_conversation_member(conversation_id)
              and not public.is_banned() and not public.is_muted());

-- ---------------------------------------------------------------- moderation with exact end time
-- p_until null = permanent ban
create or replace function public.admin_ban_until(p_user uuid, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(p_user, 2);
  if p_user = auth.uid() then raise exception 'You cannot ban yourself'; end if;
  if p_until is not null and p_until <= now() then raise exception 'Pick a time in the future'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles
  set banned_until = coalesce(p_until, 'infinity'::timestamptz),
      ban_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_user;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(p_user, case when p_until is null then 'ban' else 'ban_until' end,
    jsonb_build_object('until', p_until, 'reason', p_reason));
end;
$$;

-- p_until null = lift the mute
create or replace function public.admin_mute(p_user uuid, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(p_user, 2);
  if p_user = auth.uid() then raise exception 'You cannot mute yourself'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles
  set muted_until = p_until,
      mute_reason = case when p_until is null then null else nullif(trim(coalesce(p_reason, '')), '') end
  where id = p_user;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(p_user, case when p_until is null then 'unmute' else 'mute' end,
    jsonb_build_object('until', p_until, 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------- badges
insert into public.badges (key, name, icon, color, description, priority) values
  ('verified',     'Verified',     '✓',  '#FFFFFF', 'Verified notable person', 100),
  ('partner',      'Partner',      '🤝', '#5865F2', 'Official Nexus partner', 95),
  ('high_profile', 'High Profile', '💵', '#3BA55D', 'High-profile member', 90),
  ('vip',          'VIP',          '💎', '#EB459E', 'VIP member', 85),
  ('artist',       'Artist',       '🧑‍🎤', '#9B59B6', 'Recording artist', 80),
  ('admin',        'Admin',        '🛡️', '#ED4245', 'Nexus staff', 75),
  ('friend',       'Friend',       '🫶', '#FAA61A', 'Friend of Nexus', 70)
on conflict (key) do update
set name = excluded.name, icon = excluded.icon, color = excluded.color,
    description = excluded.description, priority = excluded.priority, archived_at = null;

-- ---------------------------------------------------------------- music hub
create table if not exists public.artist_pages (
  id          uuid primary key default gen_random_uuid(),
  spotify_id  text unique,
  handle      text not null unique check (handle ~ '^[a-z0-9_.]{2,32}$'),
  name        text not null check (char_length(name) between 1 and 80),
  image_url   text check (char_length(image_url) <= 600),
  bio         text check (char_length(bio) <= 500),
  owner_id    uuid references public.profiles (id) on delete set null,
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists artist_pages_owner_idx on public.artist_pages (owner_id);

create table if not exists public.artist_claims (
  id               uuid primary key default gen_random_uuid(),
  spotify_id       text not null,
  artist_name      text not null check (char_length(artist_name) between 1 and 80),
  artist_image     text check (char_length(artist_image) <= 600),
  requested_handle text not null check (requested_handle ~ '^[a-z0-9_.]{2,32}$'),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  proof            text check (char_length(proof) <= 1000),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists artist_claims_user_idx on public.artist_claims (user_id);
create index if not exists artist_claims_reviewer_idx on public.artist_claims (reviewed_by);
create index if not exists artist_claims_status_idx on public.artist_claims (status, created_at desc);

create table if not exists public.artist_posts (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.artist_pages (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  content     text not null default '' check (char_length(content) <= 4000),
  media_url   text check (char_length(media_url) <= 600),
  media_type  text check (char_length(media_type) <= 100),
  link_url    text check (char_length(link_url) <= 600),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists artist_posts_page_idx on public.artist_posts (page_id, created_at desc);
create index if not exists artist_posts_author_idx on public.artist_posts (author_id);

create table if not exists public.artist_post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.artist_posts (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 2000),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists artist_comments_post_idx on public.artist_post_comments (post_id, created_at);
create index if not exists artist_comments_author_idx on public.artist_post_comments (author_id);

create table if not exists public.artist_watch (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  spotify_id  text not null,
  name        text not null check (char_length(name) <= 120),
  image_url   text check (char_length(image_url) <= 600),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (user_id, spotify_id)
);

alter table public.artist_pages enable row level security;
alter table public.artist_claims enable row level security;
alter table public.artist_posts enable row level security;
alter table public.artist_post_comments enable row level security;
alter table public.artist_watch enable row level security;

drop policy if exists "artist pages readable" on public.artist_pages;
create policy "artist pages readable" on public.artist_pages for select to authenticated using (true);
drop policy if exists "claims own or staff" on public.artist_claims;
create policy "claims own or staff" on public.artist_claims for select to authenticated
  using (user_id = (select auth.uid()) or (select public.my_rank()) >= 3);
drop policy if exists "artist posts readable" on public.artist_posts;
create policy "artist posts readable" on public.artist_posts for select to authenticated using (true);
drop policy if exists "artist posts by owner" on public.artist_posts;
create policy "artist posts by owner" on public.artist_posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not public.is_banned() and not public.is_muted()
    and exists (select 1 from public.artist_pages p where p.id = page_id and p.owner_id = (select auth.uid()))
  );
drop policy if exists "comments readable" on public.artist_post_comments;
create policy "comments readable" on public.artist_post_comments for select to authenticated using (true);
drop policy if exists "comments insert" on public.artist_post_comments;
create policy "comments insert" on public.artist_post_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and not public.is_banned() and not public.is_muted());
drop policy if exists "watch own read" on public.artist_watch;
create policy "watch own read" on public.artist_watch for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "watch own insert" on public.artist_watch;
create policy "watch own insert" on public.artist_watch for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "watch own update" on public.artist_watch;
create policy "watch own update" on public.artist_watch for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.handle_taken(p_handle text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where username = lower(p_handle))
      or exists (select 1 from public.artist_pages where handle = lower(p_handle));
$$;

create or replace function public.request_artist_claim(p_spotify_id text, p_name text, p_image text, p_handle text, p_proof text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  h text := lower(trim(p_handle));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.artist_pages where spotify_id = p_spotify_id and owner_id is not null) then
    raise exception 'This artist page is already claimed';
  end if;
  if exists (select 1 from public.artist_claims where spotify_id = p_spotify_id and user_id = auth.uid() and status = 'pending') then
    raise exception 'You already have a pending claim for this artist';
  end if;
  if public.handle_taken(h) and not exists (select 1 from public.artist_pages where handle = h and spotify_id = p_spotify_id) then
    raise exception 'That handle is taken';
  end if;
  insert into public.artist_claims (spotify_id, artist_name, artist_image, requested_handle, user_id, proof)
  values (p_spotify_id, trim(p_name), p_image, h, auth.uid(), nullif(trim(coalesce(p_proof, '')), ''))
  returning id into cid;
  return cid;
end;
$$;

create or replace function public.admin_review_claim(p_claim uuid, p_approve boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.artist_claims;
  pid uuid;
begin
  perform public.assert_can_moderate(null, 3);
  select * into c from public.artist_claims where id = p_claim;
  if c.id is null then raise exception 'Claim not found'; end if;
  if c.status <> 'pending' then raise exception 'Claim already reviewed'; end if;
  update public.artist_claims set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_claim;
  if p_approve then
    insert into public.artist_pages (spotify_id, handle, name, image_url, owner_id, verified)
    values (c.spotify_id, c.requested_handle, c.artist_name, c.artist_image, c.user_id, true)
    on conflict (spotify_id) do update set owner_id = excluded.owner_id, verified = true,
      name = excluded.name, image_url = coalesce(excluded.image_url, public.artist_pages.image_url)
    returning id into pid;
    insert into public.user_badges (user_id, badge_id, granted_by)
    select c.user_id, b.id, auth.uid() from public.badges b where b.key = 'artist'
    on conflict (user_id, badge_id) do update set revoked_at = null;
    perform public.log_admin(c.user_id, 'approve_claim', jsonb_build_object('artist', c.artist_name));
  else
    perform public.log_admin(c.user_id, 'reject_claim', jsonb_build_object('artist', c.artist_name));
  end if;
  return pid;
end;
$$;

create or replace function public.update_artist_page(p_page uuid, p_bio text, p_image text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.artist_pages where id = p_page and (owner_id = auth.uid() or public.my_rank() >= 3)) then
    raise exception 'Only the page owner can edit it';
  end if;
  update public.artist_pages
  set bio = nullif(trim(coalesce(p_bio, '')), ''), image_url = coalesce(nullif(trim(coalesce(p_image, '')), ''), image_url)
  where id = p_page;
end;
$$;

create or replace function public.remove_artist_post(p_post uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
  owner uuid;
begin
  select ap.author_id, pg.owner_id into author, owner
  from public.artist_posts ap join public.artist_pages pg on pg.id = ap.page_id where ap.id = p_post;
  if author is null then raise exception 'Post not found'; end if;
  if auth.uid() <> author and auth.uid() is distinct from owner then
    perform public.assert_can_moderate(author, 2);
    perform public.log_admin(author, 'delete_post', jsonb_build_object('post', p_post));
  end if;
  update public.artist_posts set deleted_at = now() where id = p_post;
end;
$$;

create or replace function public.remove_artist_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
  owner uuid;
begin
  select c.author_id, pg.owner_id into author, owner
  from public.artist_post_comments c
  join public.artist_posts ap on ap.id = c.post_id
  join public.artist_pages pg on pg.id = ap.page_id where c.id = p_comment;
  if author is null then raise exception 'Comment not found'; end if;
  if auth.uid() <> author and auth.uid() is distinct from owner then
    perform public.assert_can_moderate(author, 2);
  end if;
  update public.artist_post_comments set deleted_at = now() where id = p_comment;
end;
$$;

-- usernames and artist handles share one namespace
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n int := 0;
  colors text[] := array['#5865F2','#3BA55D','#FAA61A','#ED4245','#EB459E','#2AABEE','#9B59B6','#1ABC9C'];
begin
  base := lower(regexp_replace(
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1), 'user'),
    '[^a-zA-Z0-9_.]', '', 'g'));
  if char_length(base) < 2 then base := 'user' || substr(replace(new.id::text, '-', ''), 1, 6); end if;
  base := substr(base, 1, 28);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate)
     or exists (select 1 from public.artist_pages where handle = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username, display_name, avatar_color)
  values (new.id, candidate,
          coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), candidate),
          colors[1 + floor(random() * array_length(colors, 1))::int]);
  return new;
end;
$$;

-- ---------------------------------------------------------------- listen together (space music)
alter table public.spaces add column if not exists music_enabled boolean not null default true;

create table if not exists public.space_tracks (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  artist      text check (char_length(artist) <= 200),
  url         text not null check (char_length(url) <= 600),
  kind        text not null default 'upload' check (kind in ('upload', 'spotify')),
  duration    real,
  added_by    uuid references public.profiles (id) on delete set null,
  removed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists space_tracks_space_idx on public.space_tracks (space_id, created_at);
create index if not exists space_tracks_added_idx on public.space_tracks (added_by);

create table if not exists public.space_player (
  space_id    uuid primary key references public.spaces (id) on delete cascade,
  track_id    uuid references public.space_tracks (id) on delete set null,
  is_playing  boolean not null default false,
  position    real not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);
create index if not exists space_player_track_idx on public.space_player (track_id);
create index if not exists space_player_by_idx on public.space_player (updated_by);

alter table public.space_tracks enable row level security;
alter table public.space_player enable row level security;

create or replace function public.space_music_on(p_space uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select music_enabled from public.spaces where id = p_space), false);
$$;

drop policy if exists "tracks read" on public.space_tracks;
create policy "tracks read" on public.space_tracks for select to authenticated using (public.is_space_member(space_id));
drop policy if exists "tracks add" on public.space_tracks;
create policy "tracks add" on public.space_tracks for insert to authenticated
  with check (added_by = (select auth.uid()) and public.is_space_member(space_id) and public.space_music_on(space_id) and not public.is_banned());
drop policy if exists "tracks remove" on public.space_tracks;
create policy "tracks remove" on public.space_tracks for update to authenticated
  using (public.is_space_member(space_id) and (added_by = (select auth.uid())
         or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = (select auth.uid()))));
drop policy if exists "player read" on public.space_player;
create policy "player read" on public.space_player for select to authenticated using (public.is_space_member(space_id));
drop policy if exists "player start" on public.space_player;
create policy "player start" on public.space_player for insert to authenticated
  with check (public.is_space_member(space_id) and public.space_music_on(space_id));
drop policy if exists "player control" on public.space_player;
create policy "player control" on public.space_player for update to authenticated
  using (public.is_space_member(space_id) and public.space_music_on(space_id));

-- ---------------------------------------------------------------- realtime
do $$
declare t text;
begin
  foreach t in array array['artist_posts','artist_post_comments','artist_pages','space_tracks','space_player','spaces'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------- storage privacy
-- Chat attachments become private: only members of that conversation can read them (via signed URLs).
update storage.buckets set public = false where id = 'attachments';
drop policy if exists "attachments member read" on storage.objects;
create policy "attachments member read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_conversation_member(public.try_uuid((storage.foldername(name))[1])));

-- Space music files: private to space members
insert into storage.buckets (id, name, public, file_size_limit)
values ('space-music', 'space-music', false, 52428800)
on conflict (id) do nothing;
drop policy if exists "space music upload" on storage.objects;
create policy "space music upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'space-music' and public.is_space_member(public.try_uuid((storage.foldername(name))[1]))
              and public.space_music_on(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "space music read" on storage.objects;
create policy "space music read" on storage.objects for select to authenticated
  using (bucket_id = 'space-music' and public.is_space_member(public.try_uuid((storage.foldername(name))[1])));

-- Artist page media is public by design
insert into storage.buckets (id, name, public, file_size_limit)
values ('artist-media', 'artist-media', true, 52428800)
on conflict (id) do nothing;
drop policy if exists "artist media upload" on storage.objects;
create policy "artist media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'artist-media' and exists (
    select 1 from public.artist_pages p
    where p.id::text = (storage.foldername(name))[1] and p.owner_id = (select auth.uid())));

-- Admin file vault: password hash only (PBKDF2), read by the vault edge function with the service role
create table if not exists public.vault_config (
  id         int primary key check (id = 1),
  pass_hash  text not null,
  updated_at timestamptz not null default now()
);
alter table public.vault_config enable row level security;

revoke execute on all functions in schema public from anon;

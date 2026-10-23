-- =====================================================================
-- Nexus — v4: music distribution (Tunearo) + video platform (Nexus Videos / Studio)
-- Run AFTER schema.sql, schema_v2.sql, schema_v3.sql. No destructive statements.
-- =====================================================================

-- ---------------------------------------------------------------- distribution
create table if not exists public.dist_artists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  spotify_id  text check (char_length(spotify_id) <= 60),
  apple_id    text check (char_length(apple_id) <= 60),
  bio         text check (char_length(bio) <= 2000),
  tunearo_id  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists dist_artists_owner_idx on public.dist_artists (owner_id);

create table if not exists public.dist_releases (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 200),
  primary_artist_name  text not null check (char_length(primary_artist_name) between 1 and 200),
  artist_ids           uuid[] not null default '{}',
  release_type         text not null default 'Single' check (release_type in ('Single', 'EP', 'Album')),
  primary_genre        text not null default 'Hip-Hop/Rap' check (char_length(primary_genre) <= 60),
  secondary_genre      text check (char_length(secondary_genre) <= 60),
  release_date         date not null default (current_date + 14),
  label_name           text not null default 'Audia Music Recordings' check (char_length(label_name) <= 120),
  language             text default 'English' check (char_length(language) <= 40),
  explicit             boolean not null default false,
  copyright_year       int check (copyright_year between 1900 and 2100),
  copyright_holder     text check (char_length(copyright_holder) <= 200),
  territories_include  text not null default 'WORLD' check (char_length(territories_include) <= 1000),
  territories_exclude  text check (char_length(territories_exclude) <= 1000),
  artwork_path         text check (char_length(artwork_path) <= 400),
  upc                  text check (char_length(upc) <= 20),
  -- Nexus workflow: draft → in_review → (changes_requested | sending) ; Tunearo: pending → approved → live ...
  status               text not null default 'draft' check (status in
                         ('draft','in_review','changes_requested','sending','pending','approved','rejected','live','takedown_requested','taken_down','error')),
  staff_note           text check (char_length(staff_note) <= 2000),
  rejection_reason     text,
  last_error           text,
  tunearo_id           uuid,
  submitted_at         timestamptz,
  reviewed_by          uuid references public.profiles (id) on delete set null,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists dist_releases_owner_idx on public.dist_releases (owner_id, created_at desc);
create index if not exists dist_releases_status_idx on public.dist_releases (status);
create index if not exists dist_releases_reviewer_idx on public.dist_releases (reviewed_by);
create unique index if not exists dist_releases_tunearo_idx on public.dist_releases (tunearo_id);

create table if not exists public.dist_tracks (
  id                    uuid primary key default gen_random_uuid(),
  release_id            uuid not null references public.dist_releases (id) on delete cascade,
  position              int not null default 1 check (position between 1 and 100),
  title                 text not null check (char_length(title) between 1 and 200),
  primary_artist_name   text check (char_length(primary_artist_name) <= 200),
  featured_artist_names text check (char_length(featured_artist_names) <= 300),
  explicit              boolean not null default false,
  isrc                  text check (isrc is null or isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  language              text check (char_length(language) <= 40),
  lyrics                text check (char_length(lyrics) <= 20000),
  composer              text check (char_length(composer) <= 300),
  producer              text check (char_length(producer) <= 300),
  songwriter            text check (char_length(songwriter) <= 300),
  lyricist              text check (char_length(lyricist) <= 300),
  mixer                 text check (char_length(mixer) <= 300),
  mastering_engineer    text check (char_length(mastering_engineer) <= 300),
  publisher             text check (char_length(publisher) <= 300),
  remixer               text check (char_length(remixer) <= 300),
  audio_path            text check (char_length(audio_path) <= 400),
  audio_name            text check (char_length(audio_name) <= 300),
  audio_bytes           bigint,
  duration              real,
  tunearo_track_id      uuid,
  audio_sent            boolean not null default false,
  created_at            timestamptz not null default now()
);
create index if not exists dist_tracks_release_idx on public.dist_tracks (release_id, position);

-- webhook log + settings: service role only (no policies)
create table if not exists public.dist_events (
  id           bigint generated always as identity primary key,
  event        text not null,
  tunearo_id   uuid,
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);
create table if not exists public.dist_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.dist_artists enable row level security;
alter table public.dist_releases enable row level security;
alter table public.dist_tracks enable row level security;
alter table public.dist_events enable row level security;
alter table public.dist_settings enable row level security;

create or replace function public.release_editable(p_release uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dist_releases r
                 where r.id = p_release and r.owner_id = (select auth.uid())
                   and r.status in ('draft', 'changes_requested', 'rejected'));
$$;

create or replace function public.release_visible(p_release uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dist_releases r
                 where r.id = p_release and (r.owner_id = (select auth.uid()) or public.my_rank() >= 3));
$$;

-- artists
create policy "dist artists read" on public.dist_artists for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.my_rank()) >= 3);
create policy "dist artists insert" on public.dist_artists for insert to authenticated
  with check (owner_id = (select auth.uid()) and not public.is_banned());
create policy "dist artists update" on public.dist_artists for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- releases: owners edit only while draft / changes requested / rejected; status moves via RPCs
create policy "dist releases read" on public.dist_releases for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.my_rank()) >= 3);
create policy "dist releases insert" on public.dist_releases for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft' and tunearo_id is null and not public.is_banned());
create policy "dist releases update" on public.dist_releases for update to authenticated
  using (owner_id = (select auth.uid()) and status in ('draft', 'changes_requested', 'rejected'))
  with check (owner_id = (select auth.uid()) and status in ('draft', 'changes_requested', 'rejected'));
create policy "dist releases delete" on public.dist_releases for delete to authenticated
  using (owner_id = (select auth.uid()) and status in ('draft', 'changes_requested') and tunearo_id is null);

-- protect workflow columns from direct edits
create or replace function public.protect_release_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('nexus.admin_write', true), '') = 'on' then return new; end if;
  if auth.uid() is null then return new; end if;
  if new.status is distinct from old.status
     or new.tunearo_id is distinct from old.tunearo_id
     or new.owner_id is distinct from old.owner_id
     or new.reviewed_by is distinct from old.reviewed_by
     or new.sent_at is distinct from old.sent_at
     or new.rejection_reason is distinct from old.rejection_reason
     or new.staff_note is distinct from old.staff_note then
    raise exception 'Use the release actions to change its status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists protect_release on public.dist_releases;
create trigger protect_release before update on public.dist_releases
  for each row execute function public.protect_release_columns();

-- tracks follow their release
create policy "dist tracks read" on public.dist_tracks for select to authenticated using (public.release_visible(release_id));
create policy "dist tracks insert" on public.dist_tracks for insert to authenticated with check (public.release_editable(release_id));
create policy "dist tracks update" on public.dist_tracks for update to authenticated
  using (public.release_editable(release_id)) with check (public.release_editable(release_id));
create policy "dist tracks delete" on public.dist_tracks for delete to authenticated using (public.release_editable(release_id));

-- workflow RPCs
create or replace function public.submit_release(p_release uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.dist_releases;
  n int;
begin
  select * into r from public.dist_releases where id = p_release;
  if r.id is null or r.owner_id <> auth.uid() then raise exception 'Release not found'; end if;
  if r.status not in ('draft', 'changes_requested', 'rejected') then raise exception 'This release is already submitted'; end if;
  if r.artwork_path is null then raise exception 'Add cover artwork (3000×3000 JPG or PNG)'; end if;
  select count(*) into n from public.dist_tracks where release_id = p_release;
  if n = 0 then raise exception 'Add at least one track'; end if;
  if exists (select 1 from public.dist_tracks where release_id = p_release and audio_path is null) then
    raise exception 'Every track needs a WAV or FLAC file';
  end if;
  if r.release_type = 'Single' and n > 3 then raise exception 'A single can have up to 3 tracks — choose EP or Album'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.dist_releases set status = 'in_review', submitted_at = now(), updated_at = now() where id = p_release;
  perform set_config('nexus.admin_write', 'off', true);
end;
$$;

create or replace function public.withdraw_release(p_release uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.dist_releases where id = p_release and owner_id = auth.uid() and status = 'in_review') then
    raise exception 'Only releases waiting for review can be withdrawn';
  end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.dist_releases set status = case when tunearo_id is null then 'draft' else 'rejected' end, updated_at = now() where id = p_release;
  perform set_config('nexus.admin_write', 'off', true);
end;
$$;

-- staff: request changes (approval itself happens in the tunearo edge function, which sends the release)
create or replace function public.review_release(p_release uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.dist_releases;
begin
  perform public.assert_can_moderate(null, 3);
  select * into r from public.dist_releases where id = p_release;
  if r.id is null then raise exception 'Release not found'; end if;
  if r.status not in ('in_review', 'error') then raise exception 'Release is not waiting for review'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.dist_releases set status = 'changes_requested', staff_note = nullif(trim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(), updated_at = now() where id = p_release;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(r.owner_id, 'release_changes', jsonb_build_object('release', r.title));
end;
$$;

-- ---------------------------------------------------------------- videos
alter table public.profiles
  add column if not exists channel_description text check (char_length(channel_description) <= 1000);

create table if not exists public.videos (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles (id) on delete cascade,
  title             text not null default 'Untitled' check (char_length(title) between 1 and 100),
  description       text not null default '' check (char_length(description) <= 5000),
  slug              text unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  links             jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 12),
  tags              text[] not null default '{}',
  category          text check (char_length(category) <= 40),
  visibility        text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  status            text not null default 'uploading' check (status in ('uploading', 'ready', 'failed')),
  made_for_kids     boolean not null default false,
  comments_enabled  boolean not null default true,
  video_path        text check (char_length(video_path) <= 400),
  thumb_url         text check (char_length(thumb_url) <= 600),
  mime              text check (char_length(mime) <= 100),
  width             int,
  height            int,
  duration          real,
  bytes             bigint,
  views             bigint not null default 0,
  likes             int not null default 0,
  dislikes          int not null default 0,
  comment_count     int not null default 0,
  publish_at        timestamptz,
  published_at      timestamptz,
  removed_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists videos_owner_idx on public.videos (owner_id, created_at desc);
create index if not exists videos_feed_idx on public.videos (visibility, published_at desc);

create table if not exists public.video_reactions (
  video_id   uuid not null references public.videos (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  value      smallint not null check (value in (-1, 0, 1)),
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);
create index if not exists video_reactions_user_idx on public.video_reactions (user_id);

create table if not exists public.video_comments (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references public.videos (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  parent_id  uuid references public.video_comments (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 5000),
  pinned     boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists video_comments_video_idx on public.video_comments (video_id, created_at desc);
create index if not exists video_comments_author_idx on public.video_comments (author_id);
create index if not exists video_comments_parent_idx on public.video_comments (parent_id);

create table if not exists public.video_views (
  video_id  uuid not null references public.videos (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  day       date not null default current_date,
  watched   real not null default 0,
  primary key (video_id, viewer_id, day)
);
create index if not exists video_views_day_idx on public.video_views (video_id, day);
create index if not exists video_views_viewer_idx on public.video_views (viewer_id);

create table if not exists public.channel_subs (
  channel_id    uuid not null references public.profiles (id) on delete cascade,
  subscriber_id uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (channel_id, subscriber_id),
  check (channel_id <> subscriber_id)
);
create index if not exists channel_subs_sub_idx on public.channel_subs (subscriber_id);

alter table public.videos enable row level security;
alter table public.video_reactions enable row level security;
alter table public.video_comments enable row level security;
alter table public.video_views enable row level security;
alter table public.channel_subs enable row level security;

create or replace function public.video_watchable(p_video uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.videos v where v.id = p_video and v.removed_at is null
                 and (v.owner_id = (select auth.uid()) or public.my_rank() >= 2
                      or (v.status = 'ready' and v.visibility <> 'private' and coalesce(v.publish_at, v.created_at) <= now())));
$$;

create policy "videos read" on public.videos for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.my_rank()) >= 2
         or (removed_at is null and status = 'ready' and visibility <> 'private' and coalesce(publish_at, created_at) <= now()));
create policy "videos insert" on public.videos for insert to authenticated
  with check (owner_id = (select auth.uid()) and not public.is_banned() and views = 0 and likes = 0);
create policy "videos update" on public.videos for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "videos delete" on public.videos for delete to authenticated using (owner_id = (select auth.uid()));

create or replace function public.protect_video_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('nexus.admin_write', true), '') = 'on' then return new; end if;
  if auth.uid() is null then return new; end if;
  if new.views is distinct from old.views or new.likes is distinct from old.likes or new.dislikes is distinct from old.dislikes
     or new.comment_count is distinct from old.comment_count or new.owner_id is distinct from old.owner_id
     or new.removed_at is distinct from old.removed_at then
    raise exception 'Not allowed';
  end if;
  if new.visibility <> 'private' and new.status = 'ready' and new.published_at is null then
    new.published_at := greatest(now(), coalesce(new.publish_at, now()));
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists protect_video on public.videos;
create trigger protect_video before update on public.videos for each row execute function public.protect_video_columns();

create policy "reactions read own" on public.video_reactions for select to authenticated using (user_id = (select auth.uid()));
create policy "comments read" on public.video_comments for select to authenticated using (public.video_watchable(video_id));
create policy "subs read" on public.channel_subs for select to authenticated using (true);
create policy "subs insert" on public.channel_subs for insert to authenticated with check (subscriber_id = (select auth.uid()));
create policy "subs delete" on public.channel_subs for delete to authenticated using (subscriber_id = (select auth.uid()));
create policy "views read own channel" on public.video_views for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and (v.owner_id = (select auth.uid()) or public.my_rank() >= 3)));

-- like / dislike / clear (value 0 = cleared; keeps counters exact)
create or replace function public.react_video(p_video uuid, p_value int)
returns json language plpgsql security definer set search_path = '' as $$
declare
  old_v smallint;
  new_v smallint := case when p_value in (1, -1) then p_value else 0 end;
  me uuid := auth.uid();
begin
  if me is null or not public.video_watchable(p_video) then raise exception 'Video not found'; end if;
  select value into old_v from public.video_reactions where video_id = p_video and user_id = me;
  old_v := coalesce(old_v, 0);
  insert into public.video_reactions (video_id, user_id, value) values (p_video, me, new_v)
  on conflict (video_id, user_id) do update set value = excluded.value, created_at = now();
  perform set_config('nexus.admin_write', 'on', true);
  update public.videos
  set likes = likes - (old_v = 1)::int + (new_v = 1)::int,
      dislikes = dislikes - (old_v = -1)::int + (new_v = -1)::int
  where id = p_video;
  perform set_config('nexus.admin_write', 'off', true);
  return (select json_build_object('likes', likes, 'dislikes', dislikes, 'mine', new_v) from public.videos where id = p_video);
end;
$$;

-- one counted view per viewer per day
create or replace function public.record_view(p_video uuid, p_watched real)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  fresh boolean;
begin
  if me is null or not public.video_watchable(p_video) then return; end if;
  insert into public.video_views (video_id, viewer_id, watched) values (p_video, me, greatest(coalesce(p_watched, 0), 0))
  on conflict (video_id, viewer_id, day) do update set watched = greatest(public.video_views.watched, excluded.watched)
  returning (xmax = 0) into fresh;
  if fresh then
    perform set_config('nexus.admin_write', 'on', true);
    update public.videos set views = views + 1 where id = p_video;
    perform set_config('nexus.admin_write', 'off', true);
  end if;
end;
$$;

create or replace function public.add_video_comment(p_video uuid, p_content text, p_parent uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  if auth.uid() is null or not public.video_watchable(p_video) then raise exception 'Video not found'; end if;
  if public.is_banned() or public.is_muted() then raise exception 'You can''t comment right now'; end if;
  if not coalesce((select comments_enabled from public.videos where id = p_video), false) then raise exception 'Comments are turned off'; end if;
  insert into public.video_comments (video_id, author_id, parent_id, content) values (p_video, auth.uid(), p_parent, trim(p_content)) returning id into cid;
  perform set_config('nexus.admin_write', 'on', true);
  update public.videos set comment_count = comment_count + 1 where id = p_video;
  perform set_config('nexus.admin_write', 'off', true);
  return cid;
end;
$$;

create or replace function public.remove_video_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.video_comments;
  owner uuid;
begin
  select * into c from public.video_comments where id = p_comment;
  if c.id is null or c.deleted_at is not null then raise exception 'Comment not found'; end if;
  select owner_id into owner from public.videos where id = c.video_id;
  if auth.uid() <> c.author_id and auth.uid() is distinct from owner then perform public.assert_can_moderate(c.author_id, 2); end if;
  update public.video_comments set deleted_at = now() where id = p_comment;
  perform set_config('nexus.admin_write', 'on', true);
  update public.videos set comment_count = greatest(comment_count - 1, 0) where id = c.video_id;
  perform set_config('nexus.admin_write', 'off', true);
end;
$$;

create or replace function public.pin_video_comment(p_comment uuid, p_pin boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  vid uuid;
begin
  select video_id into vid from public.video_comments where id = p_comment;
  if not exists (select 1 from public.videos where id = vid and owner_id = auth.uid()) then raise exception 'Only the creator can pin'; end if;
  if p_pin then update public.video_comments set pinned = false where video_id = vid; end if;
  update public.video_comments set pinned = p_pin where id = p_comment;
end;
$$;

-- staff removal
create or replace function public.mod_remove_video(p_video uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.videos where id = p_video;
  if owner is null then raise exception 'Video not found'; end if;
  perform public.assert_can_moderate(owner, 2);
  perform set_config('nexus.admin_write', 'on', true);
  update public.videos set removed_at = now() where id = p_video;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(owner, 'remove_video', jsonb_build_object('video', p_video, 'reason', p_reason));
end;
$$;

-- channel analytics: daily views for the caller's videos (or one video)
create or replace function public.channel_daily_views(p_days int, p_video uuid default null)
returns table (day date, views bigint, watch_seconds double precision)
language sql stable security definer set search_path = '' as $$
  select d::date, count(vv.viewer_id), coalesce(sum(vv.watched), 0)
  from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
  left join public.video_views vv on vv.day = d::date
    and vv.video_id in (select id from public.videos where owner_id = auth.uid() and (p_video is null or id = p_video))
  group by d order by d;
$$;

create or replace function public.slug_free(p_slug text, p_video uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.videos where slug = lower(p_slug) and id is distinct from p_video);
$$;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('dist-files', 'dist-files', false, 1073741824, array['image/jpeg','image/png','audio/wav','audio/x-wav','audio/wave','audio/vnd.wave','audio/flac','audio/x-flac']),
  ('videos', 'videos', false, null, array['video/mp4','video/quicktime','video/webm','video/x-m4v','video/x-matroska']),
  ('video-thumbs', 'video-thumbs', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- dist-files/<owner>/<release>/...
create policy "dist files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'dist-files' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.release_editable(public.try_uuid((storage.foldername(name))[2])));
create policy "dist files update" on storage.objects for update to authenticated
  using (bucket_id = 'dist-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dist files read" on storage.objects for select to authenticated
  using (bucket_id = 'dist-files' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.my_rank()) >= 3));

-- videos/<owner>/<video>/source.ext
create policy "videos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.is_banned());
create policy "videos read" on storage.objects for select to authenticated
  using (bucket_id = 'videos' and public.video_watchable(public.try_uuid((storage.foldername(name))[2])));
create policy "thumbs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'video-thumbs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "thumbs update" on storage.objects for update to authenticated
  using (bucket_id = 'video-thumbs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- realtime
do $$
declare t text;
begin
  foreach t in array array['dist_releases','dist_tracks','videos','video_comments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Acetate — private demo library (projects, albums, playlists, versions, shares).
-- Additive. Private bucket, RLS on every table, quota enforced in the storage trigger.
-- Free plan: 5 GB. Admin-granted premium is lifetime and unlimited.
-- Anonymous playback uses signed URLs minted by the acetate function / API (service role).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'acetate',
  'acetate',
  false,
  1073741824,
  array[
    'audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/wave','audio/flac','audio/x-flac',
    'audio/ogg','audio/webm','audio/opus',
    'image/jpeg','image/png','image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 1073741824,
  allowed_mime_types = excluded.allowed_mime_types;

-- --------------------------------------------------------------------- tables

create table if not exists public.acetate_projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  kind          text not null default 'project' check (kind in ('project','album','playlist')),
  title         text not null default 'Untitled cut' check (char_length(title) between 1 and 140),
  note          text check (note is null or char_length(note) <= 2000),
  artwork_path  text check (artwork_path is null or char_length(artwork_path) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists acetate_projects_owner_idx on public.acetate_projects (owner_id, updated_at desc);

create table if not exists public.acetate_tracks (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  note          text check (note is null or char_length(note) <= 2000),
  artwork_path  text check (artwork_path is null or char_length(artwork_path) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists acetate_tracks_owner_idx on public.acetate_tracks (owner_id, updated_at desc);

create table if not exists public.acetate_memberships (
  project_id    uuid not null references public.acetate_projects (id) on delete cascade,
  track_id      uuid not null references public.acetate_tracks (id) on delete cascade,
  position      int not null default 1 check (position between 1 and 5000),
  created_at    timestamptz not null default now(),
  primary key (project_id, track_id)
);
create index if not exists acetate_memberships_track_idx on public.acetate_memberships (track_id);

create table if not exists public.acetate_versions (
  id            uuid primary key default gen_random_uuid(),
  track_id      uuid not null references public.acetate_tracks (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  label         text check (label is null or char_length(label) <= 80),
  version       int not null check (version between 1 and 10000),
  path          text not null check (char_length(path) between 8 and 500),
  mime          text check (mime is null or char_length(mime) <= 120),
  bytes         bigint not null check (bytes > 0),
  duration      real check (duration is null or (duration >= 0 and duration < 86400)),
  peaks         jsonb,
  created_at    timestamptz not null default now(),
  unique (track_id, version),
  unique (path)
);
create index if not exists acetate_versions_track_idx on public.acetate_versions (track_id, version desc);

create table if not exists public.acetate_comments (
  id            uuid primary key default gen_random_uuid(),
  track_id      uuid not null references public.acetate_tracks (id) on delete cascade,
  version_id    uuid references public.acetate_versions (id) on delete set null,
  share_id      uuid,
  author_id     uuid references public.profiles (id) on delete set null,
  guest_name    text check (guest_name is null or char_length(guest_name) between 1 and 40),
  who           text,
  at_seconds    double precision not null check (at_seconds >= 0 and at_seconds < 86400),
  body          text not null check (char_length(body) between 1 and 500),
  created_at    timestamptz not null default now()
);
create index if not exists acetate_comments_track_idx on public.acetate_comments (track_id, at_seconds, created_at);

create table if not exists public.acetate_shares (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('track','project')),
  track_id        uuid references public.acetate_tracks (id) on delete cascade,
  project_id      uuid references public.acetate_projects (id) on delete cascade,
  token           text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
                    check (char_length(token) between 16 and 64),
  listing         text not null default 'unlisted' check (listing in ('public','unlisted')),
  pass_hash       text,
  expires_at      timestamptz,
  revoked         boolean not null default false,
  allow_download  boolean not null default false,
  views           int not null default 0 check (views >= 0),
  created_at      timestamptz not null default now(),
  constraint acetate_shares_target check (
    (kind = 'track' and track_id is not null and project_id is null)
    or (kind = 'project' and project_id is not null and track_id is null)
  )
);
create index if not exists acetate_shares_owner_idx on public.acetate_shares (owner_id, created_at desc);
create index if not exists acetate_shares_track_idx on public.acetate_shares (track_id) where not revoked;
create index if not exists acetate_shares_project_idx on public.acetate_shares (project_id) where not revoked;

alter table public.acetate_comments
  drop constraint if exists acetate_comments_share_fk;
alter table public.acetate_comments
  add constraint acetate_comments_share_fk foreign key (share_id) references public.acetate_shares (id) on delete set null;

create table if not exists public.acetate_entitlements (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  tier         text not null default 'free' check (tier in ('free','premium')),
  source       text not null default 'none' check (source in ('none','admin','checkout')),
  lifetime     boolean not null default false,
  granted_by   uuid references public.profiles (id) on delete set null,
  granted_at   timestamptz,
  expires_at   timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists public.acetate_admin_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid not null references public.profiles (id) on delete cascade,
  target_id   uuid not null references public.profiles (id) on delete cascade,
  action      text not null check (action in ('grant','revoke')),
  created_at  timestamptz not null default now()
);
create index if not exists acetate_admin_log_created_idx on public.acetate_admin_log (created_at desc);

-- Upload reservations + bytes actually stored (quota source of truth).
create table if not exists public.acetate_reservations (
  path        text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  bytes       bigint not null check (bytes > 0 and bytes <= 1073741824),
  kind        text not null check (kind in ('audio','art')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists acetate_reservations_user_idx on public.acetate_reservations (user_id, expires_at);

create table if not exists public.acetate_stored (
  path      text primary key,
  owner_id  uuid not null references public.profiles (id) on delete cascade,
  bytes     bigint not null check (bytes > 0),
  created_at timestamptz not null default now()
);
create index if not exists acetate_stored_owner_idx on public.acetate_stored (owner_id);

alter table public.acetate_projects enable row level security;
alter table public.acetate_tracks enable row level security;
alter table public.acetate_memberships enable row level security;
alter table public.acetate_versions enable row level security;
alter table public.acetate_comments enable row level security;
alter table public.acetate_shares enable row level security;
alter table public.acetate_entitlements enable row level security;
alter table public.acetate_admin_log enable row level security;
alter table public.acetate_reservations enable row level security;
alter table public.acetate_stored enable row level security;

-- No client policies on reservations, stored bytes, or the admin log (definer functions only).
revoke all on public.acetate_reservations from anon, authenticated;
revoke all on public.acetate_stored from anon, authenticated;
revoke all on public.acetate_admin_log from anon, authenticated;

-- --------------------------------------------------------------------- helpers

create or replace function public.acetate_free_quota()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 5368709120::bigint; -- 5 × 1024³ bytes
$$;

create or replace function public.acetate_premium_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.acetate_entitlements e
    where e.user_id = p_user
      and e.tier = 'premium'
      and (
        e.lifetime
        or e.expires_at is null
        or e.expires_at > now()
      )
  );
$$;

create or replace function public.acetate_entitlement_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tier = 'premium' and new.source = 'admin' then
    new.lifetime := true;
    new.expires_at := null;
  end if;
  if new.tier is distinct from 'premium' then
    new.lifetime := false;
    new.expires_at := null;
    if new.source is distinct from 'checkout' then
      new.source := 'none';
    end if;
  end if;
  -- Paid checkout is not wired. Only the service role (a future webhook) may store it.
  if new.source = 'checkout' and auth.role() is distinct from 'service_role' then
    raise exception 'Acetate checkout is not available';
  end if;
  if new.tier = 'premium' and new.source is distinct from 'admin' and new.source is distinct from 'checkout' then
    raise exception 'Unknown premium source';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists acetate_entitlement_guard on public.acetate_entitlements;
create trigger acetate_entitlement_guard
  before insert or update on public.acetate_entitlements
  for each row execute function public.acetate_entitlement_guard();

create or replace function public.acetate_touch_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists acetate_projects_touch on public.acetate_projects;
create trigger acetate_projects_touch
  before update on public.acetate_projects
  for each row execute function public.acetate_touch_project();

drop trigger if exists acetate_tracks_touch on public.acetate_tracks;
create trigger acetate_tracks_touch
  before update on public.acetate_tracks
  for each row execute function public.acetate_touch_project();

-- --------------------------------------------------------------------- RLS

drop policy if exists acetate_projects_owner on public.acetate_projects;
create policy acetate_projects_owner on public.acetate_projects
  for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists acetate_tracks_owner on public.acetate_tracks;
create policy acetate_tracks_owner on public.acetate_tracks
  for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists acetate_memberships_owner on public.acetate_memberships;
create policy acetate_memberships_owner on public.acetate_memberships
  for all
  using (
    exists (select 1 from public.acetate_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.acetate_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
    and exists (select 1 from public.acetate_tracks t where t.id = track_id and t.owner_id = (select auth.uid()))
  );

drop policy if exists acetate_versions_owner_read on public.acetate_versions;
create policy acetate_versions_owner_read on public.acetate_versions
  for select
  using (owner_id = (select auth.uid()));

drop policy if exists acetate_versions_owner_delete on public.acetate_versions;
create policy acetate_versions_owner_delete on public.acetate_versions
  for delete
  using (owner_id = (select auth.uid()));

drop policy if exists acetate_comments_read on public.acetate_comments;
create policy acetate_comments_read on public.acetate_comments
  for select
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.acetate_tracks t where t.id = track_id and t.owner_id = (select auth.uid()))
  );

drop policy if exists acetate_comments_insert on public.acetate_comments;
create policy acetate_comments_insert on public.acetate_comments
  for insert
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.acetate_tracks t where t.id = track_id and t.owner_id = (select auth.uid()))
  );

drop policy if exists acetate_comments_delete on public.acetate_comments;
create policy acetate_comments_delete on public.acetate_comments
  for delete
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.acetate_tracks t where t.id = track_id and t.owner_id = (select auth.uid()))
  );

drop policy if exists acetate_shares_owner_read on public.acetate_shares;
create policy acetate_shares_owner_read on public.acetate_shares
  for select
  using (owner_id = (select auth.uid()));

revoke all on public.acetate_shares from anon, authenticated;
grant select (
  id, owner_id, kind, track_id, project_id, token, listing, expires_at, revoked, allow_download, views, created_at
) on public.acetate_shares to authenticated;

drop policy if exists acetate_entitlements_read on public.acetate_entitlements;
create policy acetate_entitlements_read on public.acetate_entitlements
  for select
  using (user_id = (select auth.uid()) or public.my_rank() >= 3);

drop policy if exists acetate_entitlements_admin_write on public.acetate_entitlements;
create policy acetate_entitlements_admin_write on public.acetate_entitlements
  for all
  using (public.my_rank() >= 3)
  with check (public.my_rank() >= 3);

-- --------------------------------------------------------------------- quota + upload

create or replace function public.acetate_meta_size(p_meta jsonb)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  n bigint := 0;
begin
  if p_meta is null then return 0; end if;
  begin
    n := coalesce((p_meta->>'size')::bigint, 0);
  exception when others then
    n := 0;
  end;
  if n > 0 then return n; end if;
  begin
    n := coalesce((p_meta->>'contentLength')::bigint, 0);
  exception when others then
    n := 0;
  end;
  return greatest(coalesce(n, 0), 0);
end;
$$;

create or replace function public.acetate_upload_allowed(p_name text, p_size bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.acetate_reservations r
    where r.path = p_name
      and r.user_id = (select auth.uid())
      and r.expires_at > now()
      and (p_size is null or p_size <= 0 or p_size <= r.bytes)
  );
$$;

create or replace function public.acetate_my_storage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  used bigint;
  ent public.acetate_entitlements;
  premium boolean;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select coalesce(sum(bytes), 0) into used from public.acetate_stored where owner_id = me;
  select * into ent from public.acetate_entitlements where user_id = me;
  premium := public.acetate_premium_active(me);
  return jsonb_build_object(
    'bytes', used,
    'limit', case when premium then null else public.acetate_free_quota() end,
    'premium', premium,
    'lifetime', coalesce(ent.lifetime, false) and coalesce(ent.tier, 'free') = 'premium',
    'source', coalesce(ent.source, 'none'),
    'tier', case when premium then 'premium' else 'free' end
  );
end;
$$;

create or replace function public.acetate_reserve_upload(p_kind text, p_bytes bigint, p_ext text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ext text := lower(regexp_replace(coalesce(p_ext, ''), '[^a-z0-9]', '', 'g'));
  used bigint;
  pending bigint;
  lim bigint := public.acetate_free_quota();
  path text;
  cap bigint;
begin
  if me is null then raise exception 'Sign in required'; end if;
  if public.is_banned() then raise exception 'Account suspended'; end if;
  if p_kind not in ('audio','art') then raise exception 'Unknown upload'; end if;
  if p_kind = 'audio' then
    if ext not in ('mp3','wav','flac','aac','m4a','ogg','webm','opus') then
      raise exception 'Use mp3, wav, flac, aac, m4a, ogg, opus, or webm';
    end if;
    cap := 1073741824;
  else
    if ext = 'jpeg' then ext := 'jpg'; end if;
    if ext not in ('jpg','png','webp') then raise exception 'Artwork must be jpg, png, or webp'; end if;
    cap := 8388608;
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > cap then
    raise exception 'That file is empty or too large';
  end if;

  perform pg_advisory_xact_lock(814001, hashtext(me::text));
  delete from public.acetate_reservations where expires_at < now();

  select coalesce(sum(bytes), 0) into used from public.acetate_stored where owner_id = me;
  select coalesce(sum(r.bytes), 0) into pending
  from public.acetate_reservations r
  where r.user_id = me
    and r.expires_at > now()
    and not exists (select 1 from public.acetate_stored s where s.path = r.path);

  if not public.acetate_premium_active(me) and used + pending + p_bytes > lim then
    raise exception 'Acetate storage is full (5 GB on the free plan). Premium is unlimited.';
  end if;

  path := me::text || '/' || case when p_kind = 'audio' then 'audio' else 'art' end || '/' || gen_random_uuid()::text || '.' || ext;
  insert into public.acetate_reservations (path, user_id, bytes, kind, expires_at)
  values (path, me, p_bytes, p_kind, now() + interval '2 hours');
  return path;
end;
$$;

create or replace function public.acetate_commit_version(
  p_track uuid,
  p_label text,
  p_path text,
  p_mime text,
  p_bytes bigint,
  p_duration real,
  p_peaks jsonb
) returns public.acetate_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n int;
  row public.acetate_versions;
  stored bigint;
  label text := nullif(trim(coalesce(p_label, '')), '');
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_path is null or p_path like '%..%' or p_path not like me::text || '/audio/%' then
    raise exception 'Bad audio path';
  end if;
  if not exists (select 1 from public.acetate_tracks t where t.id = p_track and t.owner_id = me) then
    raise exception 'Track not found';
  end if;
  if exists (select 1 from public.acetate_versions v where v.path = p_path) then
    raise exception 'That file is already saved';
  end if;
  select bytes into stored from public.acetate_stored where path = p_path and owner_id = me;
  if stored is null then raise exception 'Upload the file before saving the version'; end if;
  if p_peaks is not null and (jsonb_typeof(p_peaks) <> 'array' or jsonb_array_length(p_peaks) > 240) then
    raise exception 'Bad waveform';
  end if;
  if p_duration is not null and (p_duration < 0 or p_duration >= 86400) then
    raise exception 'Bad duration';
  end if;
  if label is not null and char_length(label) > 80 then
    raise exception 'Version name is too long';
  end if;
  select coalesce(max(version), 0) + 1 into n from public.acetate_versions where track_id = p_track;
  insert into public.acetate_versions (track_id, owner_id, label, version, path, mime, bytes, duration, peaks)
  values (
    p_track, me, label, n, p_path,
    nullif(trim(coalesce(p_mime, '')), ''),
    stored,
    p_duration,
    p_peaks
  )
  returning * into row;
  delete from public.acetate_reservations where path = p_path and user_id = me;
  update public.acetate_tracks set updated_at = now() where id = p_track;
  return row;
end;
$$;

create or replace function public.acetate_commit_art(
  p_target text,
  p_id uuid,
  p_path text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  old_path text;
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_path is null or p_path like '%..%' or p_path not like me::text || '/art/%' then
    raise exception 'Bad artwork path';
  end if;
  if not exists (select 1 from public.acetate_stored where path = p_path and owner_id = me) then
    raise exception 'Upload the artwork first';
  end if;
  if p_target = 'track' then
    select artwork_path into old_path from public.acetate_tracks where id = p_id and owner_id = me;
    if not found then raise exception 'Track not found'; end if;
    update public.acetate_tracks set artwork_path = p_path, updated_at = now() where id = p_id;
  elsif p_target = 'project' then
    select artwork_path into old_path from public.acetate_projects where id = p_id and owner_id = me;
    if not found then raise exception 'Project not found'; end if;
    update public.acetate_projects set artwork_path = p_path, updated_at = now() where id = p_id;
  else
    raise exception 'Unknown artwork target';
  end if;
  delete from public.acetate_reservations where path = p_path and user_id = me;
  if old_path is not null and old_path is distinct from p_path then
    return old_path;
  end if;
  return null;
end;
$$;

-- Counts bytes when an object lands in the acetate bucket and frees them on delete.
-- Other buckets return immediately.
create or replace function public.acetate_storage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  sz bigint := 0;
  reserved bigint;
  used bigint;
  pending bigint;
begin
  if tg_op = 'DELETE' then
    if old.bucket_id is distinct from 'acetate' then
      return old;
    end if;
    delete from public.acetate_stored where path = old.name;
    return old;
  end if;

  if new.bucket_id is distinct from 'acetate' then
    return new;
  end if;

  uid := public.try_uuid((storage.foldername(new.name))[1]);
  if uid is null then
    raise exception 'Acetate files must live in your folder';
  end if;
  if auth.role() is distinct from 'service_role' and auth.uid() is distinct from uid then
    raise exception 'You can only store Acetate files in your own library';
  end if;

  if new.metadata is not null then
    begin
      sz := coalesce((new.metadata->>'size')::bigint, 0);
    exception when others then
      sz := 0;
    end;
    if sz <= 0 then
      begin
        sz := coalesce((new.metadata->>'contentLength')::bigint, 0);
      exception when others then
        sz := 0;
      end;
    end if;
  end if;

  perform pg_advisory_xact_lock(814001, hashtext(uid::text));

  select r.bytes into reserved
  from public.acetate_reservations r
  where r.path = new.name and r.user_id = uid and r.expires_at > now();
  if reserved is null then
    raise exception 'Reserve Acetate space before uploading';
  end if;
  if sz <= 0 then
    sz := reserved;
  elsif sz > reserved then
    raise exception 'File is larger than the reserved Acetate upload';
  end if;

  if not public.acetate_premium_active(uid) then
    select coalesce(sum(bytes), 0) into used from public.acetate_stored where owner_id = uid;
    select coalesce(sum(r.bytes), 0) into pending
    from public.acetate_reservations r
    where r.user_id = uid
      and r.expires_at > now()
      and r.path is distinct from new.name
      and not exists (select 1 from public.acetate_stored s where s.path = r.path);
    if used + pending + sz > public.acetate_free_quota() then
      raise exception 'Acetate storage is full (5 GB on the free plan). Premium is unlimited.';
    end if;
  end if;

  insert into public.acetate_stored (path, owner_id, bytes)
  values (new.name, uid, sz)
  on conflict (path) do update set bytes = excluded.bytes, owner_id = excluded.owner_id;
  return new;
end;
$$;

drop trigger if exists acetate_storage_guard on storage.objects;
create trigger acetate_storage_guard
  before insert or delete on storage.objects
  for each row execute function public.acetate_storage_guard();

drop policy if exists acetate_obj_insert on storage.objects;
create policy acetate_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'acetate'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.acetate_upload_allowed(name, public.acetate_meta_size(metadata))
  );

drop policy if exists acetate_obj_select on storage.objects;
create policy acetate_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'acetate'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists acetate_obj_update on storage.objects;
create policy acetate_obj_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'acetate'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'acetate'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists acetate_obj_delete on storage.objects;
create policy acetate_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'acetate'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- --------------------------------------------------------------------- shares

create or replace function public.acetate_share_create(
  p_kind text,
  p_id uuid,
  p_listing text,
  p_password text,
  p_expires timestamptz,
  p_download boolean
) returns public.acetate_shares
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row public.acetate_shares;
  pw text := nullif(trim(coalesce(p_password, '')), '');
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_kind not in ('track','project') then raise exception 'Unknown share'; end if;
  if p_listing not in ('public','unlisted') then raise exception 'Pick public or unlisted'; end if;
  if p_expires is not null and p_expires <= now() then raise exception 'Expiry must be in the future'; end if;
  if (select count(*) from public.acetate_shares where owner_id = me and not revoked) >= 200 then
    raise exception 'Too many share links — revoke some first';
  end if;
  if p_kind = 'track' then
    if not exists (select 1 from public.acetate_tracks t where t.id = p_id and t.owner_id = me) then
      raise exception 'Track not found';
    end if;
  else
    if not exists (select 1 from public.acetate_projects p where p.id = p_id and p.owner_id = me) then
      raise exception 'Project not found';
    end if;
  end if;
  insert into public.acetate_shares (owner_id, kind, track_id, project_id, listing, expires_at, allow_download, pass_hash)
  values (
    me,
    p_kind,
    case when p_kind = 'track' then p_id else null end,
    case when p_kind = 'project' then p_id else null end,
    p_listing,
    p_expires,
    coalesce(p_download, false),
    case when pw is null then null else extensions.crypt(pw, extensions.gen_salt('bf')) end
  )
  returning * into row;
  return row;
end;
$$;

create or replace function public.acetate_share_revoke(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.acetate_shares
  set revoked = true
  where id = p_id and owner_id = auth.uid() and not revoked;
  if not found then raise exception 'Share link not found'; end if;
end;
$$;

create or replace function public.acetate_share_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.acetate_shares;
  title text;
  note text;
  owner_name text;
  owner_user text;
  tracks int;
begin
  if p_token is null or char_length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  select * into s from public.acetate_shares where token = p_token and not revoked;
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  if s.expires_at is not null and s.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  select pr.display_name, pr.username into owner_name, owner_user
  from public.profiles pr where pr.id = s.owner_id;
  if s.kind = 'track' then
    select t.title, t.note into title, note from public.acetate_tracks t where t.id = s.track_id;
    tracks := 1;
  else
    select p.title, p.note into title, note from public.acetate_projects p where p.id = s.project_id;
    select count(*) into tracks from public.acetate_memberships m where m.project_id = s.project_id;
  end if;
  if title is null then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  return jsonb_build_object(
    'ok', true,
    'password', s.pass_hash is not null,
    'listing', s.listing,
    'download', s.allow_download,
    'kind', s.kind,
    'title', title,
    'note', case when s.pass_hash is null then note else null end,
    'owner', owner_user,
    'owner_name', owner_name,
    'track_count', tracks,
    'expires_at', s.expires_at
  );
end;
$$;

-- Paths included. Service role only — the signer strips them and returns signed URLs.
create or replace function public.acetate_share_open(p_token text, p_password text, p_touch boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.acetate_shares;
  title text;
  note text;
  art text;
  owner_name text;
  owner_user text;
  tracks jsonb;
begin
  if p_token is null or char_length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  select * into s from public.acetate_shares where token = p_token and not revoked;
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  if s.expires_at is not null and s.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if s.pass_hash is not null then
    if public.pw_blocked('acetate', s.id::text) then
      return jsonb_build_object('ok', false, 'reason', 'too_many');
    end if;
    if p_password is null or extensions.crypt(p_password, s.pass_hash) is distinct from s.pass_hash then
      perform public.pw_fail('acetate', s.id::text);
      return jsonb_build_object('ok', false, 'reason', 'password');
    end if;
  end if;

  select pr.display_name, pr.username into owner_name, owner_user
  from public.profiles pr where pr.id = s.owner_id;

  if s.kind = 'track' then
    select t.title, t.note, t.artwork_path into title, note, art
    from public.acetate_tracks t where t.id = s.track_id;
    select coalesce(jsonb_agg(obj), '[]'::jsonb) into tracks
    from (
      select public.acetate_pack_track(t.id, 1) as obj
      from public.acetate_tracks t
      where t.id = s.track_id
    ) q;
  else
    select p.title, p.note, p.artwork_path into title, note, art
    from public.acetate_projects p where p.id = s.project_id;
    select coalesce(jsonb_agg(obj order by pos, created_at), '[]'::jsonb) into tracks
    from (
      select m.position as pos, t.created_at, public.acetate_pack_track(t.id, m.position) as obj
      from public.acetate_memberships m
      join public.acetate_tracks t on t.id = m.track_id
      where m.project_id = s.project_id
    ) q;
  end if;
  if title is null then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;

  if p_touch then
    update public.acetate_shares set views = views + 1 where id = s.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'share_id', s.id,
    'kind', s.kind,
    'listing', s.listing,
    'download', s.allow_download,
    'title', title,
    'note', note,
    'artwork_path', art,
    'owner', owner_user,
    'owner_name', owner_name,
    'tracks', tracks
  );
end;
$$;

create or replace function public.acetate_pack_track(p_track uuid, p_position int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'note', t.note,
    'position', p_position,
    'artwork_path', t.artwork_path,
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'label', v.label,
        'version', v.version,
        'path', v.path,
        'mime', v.mime,
        'bytes', v.bytes,
        'duration', v.duration,
        'peaks', v.peaks
      ) order by v.version desc)
      from public.acetate_versions v where v.track_id = t.id
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'at', c.at_seconds,
        'body', c.body,
        'name', coalesce(pr.display_name, c.guest_name, 'Listener'),
        'created_at', c.created_at
      ) order by c.at_seconds, c.created_at)
      from public.acetate_comments c
      left join public.profiles pr on pr.id = c.author_id
      where c.track_id = t.id
    ), '[]'::jsonb)
  )
  from public.acetate_tracks t
  where t.id = p_track;
$$;

create or replace function public.acetate_share_comment(
  p_token text,
  p_password text,
  p_track uuid,
  p_version uuid,
  p_at double precision,
  p_body text,
  p_guest text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  opened jsonb;
  share_id uuid;
  kind text;
  project_id uuid;
  body text := nullif(trim(coalesce(p_body, '')), '');
  guest text := nullif(trim(coalesce(p_guest, '')), '');
  recent int;
  row_id uuid;
begin
  opened := public.acetate_share_open(p_token, p_password, false);
  if coalesce((opened->>'ok')::boolean, false) is distinct from true then
    return opened;
  end if;
  share_id := (opened->>'share_id')::uuid;
  kind := opened->>'kind';
  if body is null or char_length(body) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'body');
  end if;
  if p_at is null or p_at < 0 or p_at >= 86400 then
    return jsonb_build_object('ok', false, 'reason', 'time');
  end if;
  if kind = 'track' then
    if not exists (
      select 1 from public.acetate_shares s
      where s.id = share_id and s.track_id = p_track
    ) then
      return jsonb_build_object('ok', false, 'reason', 'missing');
    end if;
  else
    select s.project_id into project_id from public.acetate_shares s where s.id = share_id;
    if not exists (
      select 1 from public.acetate_memberships m
      where m.project_id = project_id and m.track_id = p_track
    ) then
      return jsonb_build_object('ok', false, 'reason', 'missing');
    end if;
  end if;
  if p_version is not null and not exists (
    select 1 from public.acetate_versions v where v.id = p_version and v.track_id = p_track
  ) then
    p_version := null;
  end if;
  select count(*) into recent
  from public.acetate_comments c
  where c.share_id = share_id
    and c.who = public.pw_caller()
    and c.created_at > now() - interval '10 minutes';
  if recent >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  if auth.uid() is null and (guest is null or char_length(guest) > 40) then
    guest := 'Listener';
  end if;
  insert into public.acetate_comments (track_id, version_id, share_id, author_id, guest_name, who, at_seconds, body)
  values (p_track, p_version, share_id, auth.uid(), case when auth.uid() is null then guest else null end, public.pw_caller(), p_at, body)
  returning id into row_id;
  return jsonb_build_object('ok', true, 'id', row_id);
end;
$$;

-- --------------------------------------------------------------------- admin + checkout stub

create or replace function public.acetate_admin_search(p_q text)
returns table (
  id uuid,
  username text,
  display_name text,
  tier text,
  lifetime boolean,
  source text,
  bytes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := lower(trim(coalesce(p_q, '')));
begin
  if public.my_rank() < 3 then
    raise exception 'Acetate admin is limited to Nexus admins';
  end if;
  if char_length(q) < 1 or char_length(q) > 40 then
    raise exception 'Type a username to search';
  end if;
  q := replace(replace(replace(q, '\', ''), '%', ''), '_', '');
  if char_length(q) < 1 then
    raise exception 'Type a username to search';
  end if;
  return query
  select
    p.id,
    p.username,
    p.display_name,
    case when public.acetate_premium_active(p.id) then 'premium' else 'free' end,
    coalesce(e.lifetime, false) and coalesce(e.tier, 'free') = 'premium',
    coalesce(e.source, 'none'),
    coalesce((select sum(s.bytes) from public.acetate_stored s where s.owner_id = p.id), 0)::bigint
  from public.profiles p
  left join public.acetate_entitlements e on e.user_id = p.id
  where position(q in lower(p.username)) > 0
     or position(q in lower(coalesce(p.display_name, ''))) > 0
  order by p.username
  limit 25;
end;
$$;

create or replace function public.acetate_admin_set_premium(p_user uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if public.my_rank() < 3 then
    raise exception 'Acetate admin is limited to Nexus admins';
  end if;
  if me is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'No such user';
  end if;
  if p_on then
    insert into public.acetate_entitlements (user_id, tier, source, lifetime, granted_by, granted_at, expires_at)
    values (p_user, 'premium', 'admin', true, me, now(), null)
    on conflict (user_id) do update
      set tier = 'premium', source = 'admin', lifetime = true, granted_by = me, granted_at = now(), expires_at = null, updated_at = now();
    insert into public.acetate_admin_log (actor_id, target_id, action) values (me, p_user, 'grant');
  else
    insert into public.acetate_entitlements (user_id, tier, source, lifetime, granted_by, granted_at, expires_at)
    values (p_user, 'free', 'none', false, me, now(), null)
    on conflict (user_id) do update
      set tier = 'free', source = 'none', lifetime = false, granted_by = me, granted_at = now(), expires_at = null, updated_at = now();
    insert into public.acetate_admin_log (actor_id, target_id, action) values (me, p_user, 'revoke');
  end if;
  return public.acetate_my_storage_for(p_user);
end;
$$;

create or replace function public.acetate_my_storage_for(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ent public.acetate_entitlements;
  premium boolean;
begin
  if auth.uid() is distinct from p_user and public.my_rank() < 3 then
    raise exception 'Not allowed';
  end if;
  select * into ent from public.acetate_entitlements where user_id = p_user;
  premium := public.acetate_premium_active(p_user);
  return jsonb_build_object(
    'user_id', p_user,
    'bytes', coalesce((select sum(bytes) from public.acetate_stored where owner_id = p_user), 0),
    'limit', case when premium then null else public.acetate_free_quota() end,
    'premium', premium,
    'lifetime', coalesce(ent.lifetime, false) and coalesce(ent.tier, 'free') = 'premium',
    'source', coalesce(ent.source, 'none'),
    'tier', case when premium then 'premium' else 'free' end
  );
end;
$$;

-- Placeholder for a future payment provider. Does not grant premium.
create or replace function public.acetate_start_checkout()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  return jsonb_build_object(
    'ok', false,
    'stub', true,
    'reason', 'payments_not_configured',
    'message', 'Acetate Premium checkout is not connected to a payment provider. A Nexus admin can grant lifetime Premium from the Acetate admin panel.'
  );
end;
$$;

-- --------------------------------------------------------------------- grants

revoke all on function public.acetate_free_quota() from public, anon, authenticated;
revoke all on function public.acetate_premium_active(uuid) from public, anon, authenticated;
revoke all on function public.acetate_pack_track(uuid, int) from public, anon, authenticated;
revoke all on function public.acetate_share_open(text, text, boolean) from public, anon, authenticated;
revoke all on function public.acetate_my_storage_for(uuid) from public, anon, authenticated;

grant execute on function public.acetate_free_quota() to current_user;
grant execute on function public.acetate_premium_active(uuid) to current_user;
grant execute on function public.acetate_pack_track(uuid, int) to current_user;
grant execute on function public.acetate_share_open(text, text, boolean) to service_role, current_user;
grant execute on function public.acetate_my_storage_for(uuid) to current_user;

grant execute on function public.acetate_meta_size(jsonb) to authenticated, anon;
grant execute on function public.acetate_upload_allowed(text, bigint) to authenticated;
grant execute on function public.acetate_my_storage() to authenticated;
grant execute on function public.acetate_reserve_upload(text, bigint, text) to authenticated;
grant execute on function public.acetate_commit_version(uuid, text, text, text, bigint, real, jsonb) to authenticated;
grant execute on function public.acetate_commit_art(text, uuid, text) to authenticated;
grant execute on function public.acetate_share_create(text, uuid, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.acetate_share_revoke(uuid) to authenticated;
grant execute on function public.acetate_share_info(text) to anon, authenticated;
grant execute on function public.acetate_share_comment(text, text, uuid, uuid, double precision, text, text) to anon, authenticated;
grant execute on function public.acetate_admin_search(text) to authenticated;
grant execute on function public.acetate_admin_set_premium(uuid, boolean) to authenticated;
grant execute on function public.acetate_start_checkout() to authenticated;

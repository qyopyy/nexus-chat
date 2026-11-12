-- Acetate Vault. Shelf (the original library) keeps the free 5 GB quota and premium bypass.
-- Vault does not use that quota while acetate_storage_policy.vault_quota_bytes is null.
-- Change the rule in public.acetate_storage_policy (one row, id = 1). Do not edit callers.
-- file_bytes is the per-file cap and must stay within the acetate bucket (5 GB, same as attachments/gram).
-- Unlimited vault storage means Supabase storage cost grows with usage.

create table if not exists public.acetate_storage_policy (
  id                smallint primary key default 1 check (id = 1),
  shelf_free_bytes  bigint not null default 5368709120 check (shelf_free_bytes > 0),
  vault_quota_bytes bigint check (vault_quota_bytes is null or vault_quota_bytes > 0),
  file_bytes        bigint not null default 5368709120 check (file_bytes > 0 and file_bytes <= 5368709120),
  updated_at        timestamptz not null default now()
);
insert into public.acetate_storage_policy (id) values (1) on conflict (id) do nothing;

alter table public.acetate_storage_policy enable row level security;
revoke all on public.acetate_storage_policy from anon, authenticated;
grant select on public.acetate_storage_policy to authenticated;
drop policy if exists acetate_storage_policy_read on public.acetate_storage_policy;
create policy acetate_storage_policy_read on public.acetate_storage_policy
  for select to authenticated using (true);

create or replace function public.acetate_free_quota()
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce((select shelf_free_bytes from public.acetate_storage_policy where id = 1), 5368709120::bigint);
$$;

alter table public.acetate_projects
  add column if not exists library text not null default 'shelf';
alter table public.acetate_projects drop constraint if exists acetate_projects_library_check;
alter table public.acetate_projects
  add constraint acetate_projects_library_check check (library in ('shelf', 'vault'));

alter table public.acetate_tracks
  add column if not exists library text not null default 'shelf';
alter table public.acetate_tracks drop constraint if exists acetate_tracks_library_check;
alter table public.acetate_tracks
  add constraint acetate_tracks_library_check check (library in ('shelf', 'vault'));

alter table public.acetate_reservations
  add column if not exists library text not null default 'shelf';
alter table public.acetate_reservations drop constraint if exists acetate_reservations_library_check;
alter table public.acetate_reservations
  add constraint acetate_reservations_library_check check (library in ('shelf', 'vault'));

alter table public.acetate_stored
  add column if not exists library text not null default 'shelf';
alter table public.acetate_stored drop constraint if exists acetate_stored_library_check;
alter table public.acetate_stored
  add constraint acetate_stored_library_check check (library in ('shelf', 'vault'));

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.acetate_reservations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%bytes%'
  loop
    execute format('alter table public.acetate_reservations drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.acetate_reservations
  add constraint acetate_reservations_bytes_check check (bytes > 0 and bytes <= 5368709120);

update storage.buckets
set file_size_limit = 5368709120,
    allowed_mime_types = array[
      'audio/mpeg','audio/mp3','audio/mp4','audio/aac',
      'audio/wav','audio/x-wav','audio/wave',
      'audio/flac','audio/x-flac',
      'audio/ogg','audio/webm','audio/opus',
      'audio/aiff','audio/x-aiff','audio/aif',
      'image/jpeg','image/png','image/webp'
    ]
where id = 'acetate';

drop function if exists public.acetate_reserve_upload(text, bigint, text);

create or replace function public.acetate_reserve_upload(
  p_kind text,
  p_bytes bigint,
  p_ext text,
  p_library text default 'shelf'
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ext text := lower(regexp_replace(coalesce(p_ext, ''), '[^a-z0-9]', '', 'g'));
  lib text := coalesce(nullif(p_library, ''), 'shelf');
  used bigint;
  pending bigint;
  lim bigint;
  vlim bigint;
  path text;
  cap bigint;
begin
  if me is null then raise exception 'Sign in required'; end if;
  if public.is_banned() then raise exception 'Account suspended'; end if;
  if lib not in ('shelf', 'vault') then raise exception 'Unknown library'; end if;
  if p_kind not in ('audio', 'art') then raise exception 'Unknown upload'; end if;
  if lib = 'vault' and not public.feature_on('vault_uploads') then
    raise exception 'Vault uploads are turned off';
  end if;
  if (select count(*) from public.acetate_reservations
      where user_id = me and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many Acetate uploads. Wait a few minutes.';
  end if;
  if ext = 'aif' then ext := 'aiff'; end if;
  if p_kind = 'audio' then
    if ext not in ('mp3', 'wav', 'flac', 'aiff', 'aac', 'm4a', 'ogg', 'webm', 'opus') then
      raise exception 'Use mp3, wav, aiff, flac, aac, m4a, ogg, opus, or webm';
    end if;
    select file_bytes into cap from public.acetate_storage_policy where id = 1;
    cap := coalesce(cap, 5368709120);
  else
    if ext = 'jpeg' then ext := 'jpg'; end if;
    if ext not in ('jpg', 'png', 'webp') then raise exception 'Artwork must be jpg, png, or webp'; end if;
    cap := 8388608;
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > cap then
    raise exception 'That file is empty or over the per-file limit';
  end if;

  perform pg_advisory_xact_lock(814001, hashtext(me::text));
  delete from public.acetate_reservations where expires_at < now();

  select coalesce(sum(bytes), 0) into used
  from public.acetate_stored where owner_id = me and library = lib;
  select coalesce(sum(r.bytes), 0) into pending
  from public.acetate_reservations r
  where r.user_id = me
    and r.library = lib
    and r.expires_at > now()
    and not exists (select 1 from public.acetate_stored s where s.path = r.path);

  if lib = 'vault' then
    select vault_quota_bytes into vlim from public.acetate_storage_policy where id = 1;
    if vlim is not null and not public.acetate_premium_active(me) and used + pending + p_bytes > vlim then
      raise exception 'Vault storage is full for this plan';
    end if;
  elsif not public.acetate_premium_active(me) and used + pending + p_bytes > public.acetate_free_quota() then
    raise exception 'Acetate library storage is full on the free plan. Premium is unlimited. Vault is separate.';
  end if;

  path := me::text || '/' || case
    when lib = 'vault' and p_kind = 'audio' then 'vault/'
    when lib = 'vault' then 'vault/art/'
    when p_kind = 'audio' then 'audio/'
    else 'art/'
  end || gen_random_uuid()::text || '.' || ext;
  insert into public.acetate_reservations (path, user_id, bytes, kind, library, expires_at)
  values (path, me, p_bytes, p_kind, lib, now() + interval '2 hours');
  return path;
end;
$$;

revoke all on function public.acetate_reserve_upload(text, bigint, text, text) from public, anon;
grant execute on function public.acetate_reserve_upload(text, bigint, text, text) to authenticated;

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
  if p_path is null or p_path like '%..%'
     or (p_path not like me::text || '/audio/%' and p_path not like me::text || '/vault/%') then
    raise exception 'Bad audio path';
  end if;
  if p_path like '%/art/%' then raise exception 'Bad audio path'; end if;
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
  if p_path is null or p_path like '%..%'
     or (p_path not like me::text || '/art/%' and p_path not like me::text || '/vault/art/%') then
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
  lib text;
  used bigint;
  pending bigint;
  vlim bigint;
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

  select r.bytes, r.library into reserved, lib
  from public.acetate_reservations r
  where r.path = new.name and r.user_id = uid and r.expires_at > now();
  if reserved is null then
    raise exception 'Reserve Acetate space before uploading';
  end if;
  lib := coalesce(lib, 'shelf');
  if sz <= 0 then
    raise exception 'Acetate could not read the upload size';
  end if;
  if sz > reserved then
    raise exception 'File is larger than the reserved Acetate upload';
  end if;

  if lib = 'vault' then
    select vault_quota_bytes into vlim from public.acetate_storage_policy where id = 1;
    if vlim is not null and not public.acetate_premium_active(uid) then
      select coalesce(sum(bytes), 0) into used from public.acetate_stored where owner_id = uid and library = 'vault';
      select coalesce(sum(r.bytes), 0) into pending
      from public.acetate_reservations r
      where r.user_id = uid and r.library = 'vault' and r.expires_at > now()
        and r.path is distinct from new.name
        and not exists (select 1 from public.acetate_stored s where s.path = r.path);
      if used + pending + sz > vlim then
        raise exception 'Vault storage is full for this plan';
      end if;
    end if;
  elsif not public.acetate_premium_active(uid) then
    select coalesce(sum(bytes), 0) into used from public.acetate_stored where owner_id = uid and library = 'shelf';
    select coalesce(sum(r.bytes), 0) into pending
    from public.acetate_reservations r
    where r.user_id = uid and r.library = 'shelf' and r.expires_at > now()
      and r.path is distinct from new.name
      and not exists (select 1 from public.acetate_stored s where s.path = r.path);
    if used + pending + sz > public.acetate_free_quota() then
      raise exception 'Acetate library storage is full on the free plan. Premium is unlimited. Vault is separate.';
    end if;
  end if;

  insert into public.acetate_stored (path, owner_id, bytes, library)
  values (new.name, uid, sz, lib)
  on conflict (path) do update set bytes = excluded.bytes, owner_id = excluded.owner_id, library = excluded.library;
  return new;
end;
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
  shelf_used bigint;
  vault_used bigint;
  music bigint;
  covers bigint;
  ent public.acetate_entitlements;
  premium boolean;
  vlim bigint;
  file_cap bigint;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select coalesce(sum(bytes) filter (where library = 'shelf'), 0),
         coalesce(sum(bytes) filter (where library = 'vault'), 0),
         coalesce(sum(bytes) filter (where path not like '%/art/%'), 0),
         coalesce(sum(bytes) filter (where path like '%/art/%'), 0)
    into shelf_used, vault_used, music, covers
  from public.acetate_stored where owner_id = me;
  select * into ent from public.acetate_entitlements where user_id = me;
  premium := public.acetate_premium_active(me);
  select vault_quota_bytes, file_bytes into vlim, file_cap from public.acetate_storage_policy where id = 1;
  return jsonb_build_object(
    'bytes', shelf_used,
    'limit', case when premium then null else public.acetate_free_quota() end,
    'premium', premium,
    'lifetime', coalesce(ent.lifetime, false) and coalesce(ent.tier, 'free') = 'premium',
    'source', coalesce(ent.source, 'none'),
    'tier', case when premium then 'premium' else 'free' end,
    'vault_bytes', vault_used,
    'vault_limit', case when premium or vlim is null then null else vlim end,
    'music_bytes', music,
    'cover_bytes', covers,
    'file_bytes', coalesce(file_cap, 5368709120)
  );
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
  shelf_used bigint;
  vault_used bigint;
  music bigint;
  covers bigint;
  vlim bigint;
  file_cap bigint;
begin
  if auth.uid() is distinct from p_user and public.my_rank() < 3 then
    raise exception 'Not allowed';
  end if;
  select coalesce(sum(bytes) filter (where library = 'shelf'), 0),
         coalesce(sum(bytes) filter (where library = 'vault'), 0),
         coalesce(sum(bytes) filter (where path not like '%/art/%'), 0),
         coalesce(sum(bytes) filter (where path like '%/art/%'), 0)
    into shelf_used, vault_used, music, covers
  from public.acetate_stored where owner_id = p_user;
  select * into ent from public.acetate_entitlements where user_id = p_user;
  premium := public.acetate_premium_active(p_user);
  select vault_quota_bytes, file_bytes into vlim, file_cap from public.acetate_storage_policy where id = 1;
  return jsonb_build_object(
    'user_id', p_user,
    'bytes', shelf_used,
    'limit', case when premium then null else public.acetate_free_quota() end,
    'premium', premium,
    'lifetime', coalesce(ent.lifetime, false) and coalesce(ent.tier, 'free') = 'premium',
    'source', coalesce(ent.source, 'none'),
    'tier', case when premium then 'premium' else 'free' end,
    'vault_bytes', vault_used,
    'vault_limit', case when premium or vlim is null then null else vlim end,
    'music_bytes', music,
    'cover_bytes', covers,
    'file_bytes', coalesce(file_cap, 5368709120)
  );
end;
$$;

-- Per-user Acetate theme. custom is color and font tokens only (enforced by the trigger).
create table if not exists public.acetate_appearance (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  theme_id   text not null default 'ink' check (theme_id ~ '^[a-z0-9_-]{1,40}$'),
  custom     jsonb,
  updated_at timestamptz not null default now()
);
alter table public.acetate_appearance enable row level security;
revoke all on public.acetate_appearance from anon, authenticated;
grant select, insert, update, delete on public.acetate_appearance to authenticated;
drop policy if exists acetate_appearance_own on public.acetate_appearance;
create policy acetate_appearance_own on public.acetate_appearance
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.acetate_appearance_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c jsonb := new.custom;
  k text;
  allowed text[] := array['name','mode','bg','card','text','muted','accent','accentText','line','font'];
  fonts text[] := array['system','serif','mono','condensed'];
  colors text[] := array['bg','card','text','muted','accent','accentText','line'];
begin
  if c is null then
    new.updated_at := now();
    return new;
  end if;
  if jsonb_typeof(c) <> 'object' then
    raise exception 'Theme must be an object of color and font tokens';
  end if;
  if (select count(*) from jsonb_object_keys(c)) > 10 then
    raise exception 'Theme has too many fields';
  end if;
  for k in select jsonb_object_keys(c) loop
    if not (k = any (allowed)) then
      raise exception 'Theme field not allowed';
    end if;
    if position('url(' in lower(c->>k)) > 0
       or position('expression(' in lower(c->>k)) > 0
       or position('<' in c->>k) > 0
       or position(';' in c->>k) > 0
       or position('{' in c->>k) > 0 then
      raise exception 'Theme tokens cannot contain code';
    end if;
  end loop;
  if c ? 'mode' and c->>'mode' not in ('dark', 'light') then
    raise exception 'Theme mode must be dark or light';
  end if;
  if c ? 'font' and not (c->>'font' = any (fonts)) then
    raise exception 'Theme font not allowed';
  end if;
  if c ? 'name' and char_length(c->>'name') > 40 then
    raise exception 'Theme name is too long';
  end if;
  foreach k in array colors loop
    if c ? k and c->>k !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'Theme colors must be #RRGGBB';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists acetate_appearance_guard on public.acetate_appearance;
create trigger acetate_appearance_guard
  before insert or update on public.acetate_appearance
  for each row execute function public.acetate_appearance_guard();

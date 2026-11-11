-- 24-hour Nexus Status, Live Stage flag on a voice channel, and explicit
-- trusted-circle location grants. Device coordinates stay on the owner's
-- handset row. Other people only receive a pin through an active grant.

create or replace function public.can_see_nexus_status(p_owner uuid, p_audience text, p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when auth.uid() = p_owner then true
    when p_audience = 'friends' then public.are_friends(auth.uid(), p_owner)
    when p_audience = 'space' and p_space is not null then exists (
      select 1 from public.space_members m
      where m.space_id = p_space and m.user_id = auth.uid()
    )
    else false
  end;
$$;

revoke all on function public.can_see_nexus_status(uuid, text, uuid) from public, anon;
grant execute on function public.can_see_nexus_status(uuid, text, uuid) to authenticated;

create table if not exists public.nexus_statuses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('text', 'photo')),
  body       text check (body is null or char_length(body) between 1 and 280),
  media_path text check (media_path is null or char_length(media_path) between 8 and 220),
  audience   text not null check (audience in ('friends', 'space')),
  space_id   uuid references public.spaces (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  check (kind = 'text' and body is not null and media_path is null or kind = 'photo' and media_path is not null),
  check (audience = 'friends' and space_id is null or audience = 'space' and space_id is not null)
);
create index if not exists nexus_statuses_user_idx on public.nexus_statuses (user_id, expires_at desc);
create index if not exists nexus_statuses_live_idx on public.nexus_statuses (expires_at desc);

alter table public.nexus_statuses enable row level security;
revoke all on public.nexus_statuses from anon, authenticated;
grant select, insert, delete on public.nexus_statuses to authenticated;

drop policy if exists nexus_statuses_read on public.nexus_statuses;
create policy nexus_statuses_read on public.nexus_statuses
  for select to authenticated
  using (
    expires_at > now()
    and public.can_see_nexus_status(user_id, audience, space_id)
  );

drop policy if exists nexus_statuses_insert on public.nexus_statuses;
create policy nexus_statuses_insert on public.nexus_statuses
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and expires_at > now()
    and expires_at <= now() + interval '24 hours'
    and public.can_see_nexus_status(user_id, audience, space_id)
  );

drop policy if exists nexus_statuses_delete on public.nexus_statuses;
create policy nexus_statuses_delete on public.nexus_statuses
  for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.nexus_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'Not your status';
  end if;
  if new.kind = 'photo' and new.media_path not like auth.uid()::text || '/%' then
    raise exception 'Photo path must stay in your folder';
  end if;
  if (
    select count(*) from public.nexus_statuses
    where user_id = new.user_id and expires_at > now()
  ) >= 5 then
    raise exception 'You can have 5 active statuses. Delete one or wait for it to expire.';
  end if;
  new.expires_at := least(new.expires_at, now() + interval '24 hours');
  return new;
end;
$$;

revoke all on function public.nexus_status_guard() from public, anon, authenticated;

drop trigger if exists nexus_status_guard on public.nexus_statuses;
create trigger nexus_status_guard
  before insert on public.nexus_statuses
  for each row execute function public.nexus_status_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nexus-status', 'nexus-status', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nexus status read" on storage.objects;
create policy "nexus status read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'nexus-status'
    and exists (
      select 1 from public.nexus_statuses s
      where s.media_path = objects.name
        and s.expires_at > now()
        and public.can_see_nexus_status(s.user_id, s.audience, s.space_id)
    )
  );

drop policy if exists "nexus status upload" on storage.objects;
create policy "nexus status upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'nexus-status'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "nexus status delete" on storage.objects;
create policy "nexus status delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'nexus-status'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $$
begin
  alter publication supabase_realtime add table public.nexus_statuses;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- ------------------------------------------------------------------ live stage

alter table public.conversations
  add column if not exists stage boolean not null default false;

create or replace function public.set_channel_stage(p_conv uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
begin
  select * into c from public.conversations where id = p_conv;
  if c.id is null or c.space_id is null then
    raise exception 'Channel not found';
  end if;
  if c.kind is distinct from 'voice' then
    raise exception 'Live Stage is a voice room';
  end if;
  if not public.is_space_staff(c.space_id) then
    raise exception 'Staff only';
  end if;
  update public.conversations set stage = coalesce(p_on, false) where id = p_conv;
end;
$$;

revoke all on function public.set_channel_stage(uuid, boolean) from public, anon;
grant execute on function public.set_channel_stage(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ trusted circle

create table if not exists public.nexus_circle_self (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  sharing     boolean not null default false,
  lat         double precision,
  lng         double precision,
  accuracy_m  real,
  updated_at  timestamptz not null default now(),
  check (lat is null or lat between -90 and 90),
  check (lng is null or lng between -180 and 180),
  check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m < 100000))
);

create table if not exists public.nexus_circle_grants (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  subject    text not null check (subject in ('self', 'device')),
  device_id  text,
  status     text not null default 'pending' check (status in ('pending', 'active', 'declined')),
  expires_at timestamptz not null,
  revoked    boolean not null default false,
  created_at timestamptz not null default now(),
  check (owner_id <> viewer_id),
  check (
    (subject = 'self' and device_id is null)
    or (subject = 'device' and device_id is not null and char_length(device_id) between 8 and 64)
  )
);
create index if not exists nexus_circle_grants_owner_idx on public.nexus_circle_grants (owner_id, created_at desc);
create index if not exists nexus_circle_grants_viewer_idx on public.nexus_circle_grants (viewer_id, status, expires_at desc);
create unique index if not exists nexus_circle_grants_open_idx
  on public.nexus_circle_grants (owner_id, viewer_id, subject, coalesce(device_id, ''))
  where revoked = false and status in ('pending', 'active');

alter table public.nexus_circle_self enable row level security;
alter table public.nexus_circle_grants enable row level security;
revoke all on public.nexus_circle_self from anon, authenticated;
revoke all on public.nexus_circle_grants from anon, authenticated;
grant select on public.nexus_circle_self to authenticated;
grant select on public.nexus_circle_grants to authenticated;

drop policy if exists nexus_circle_self_own on public.nexus_circle_self;
create policy nexus_circle_self_own on public.nexus_circle_self
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists nexus_circle_grants_read on public.nexus_circle_grants;
create policy nexus_circle_grants_read on public.nexus_circle_grants
  for select to authenticated
  using (owner_id = (select auth.uid()) or viewer_id = (select auth.uid()));

create or replace function public.nexus_circle_set_sharing(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  insert into public.nexus_circle_self (user_id, sharing, lat, lng, accuracy_m, updated_at)
  values (auth.uid(), coalesce(p_on, false), null, null, null, now())
  on conflict (user_id) do update
    set sharing = excluded.sharing,
        lat = case when excluded.sharing then public.nexus_circle_self.lat else null end,
        lng = case when excluded.sharing then public.nexus_circle_self.lng else null end,
        accuracy_m = case when excluded.sharing then public.nexus_circle_self.accuracy_m else null end,
        updated_at = now();
end;
$$;

create or replace function public.nexus_circle_ping(p_lat double precision, p_lng double precision, p_accuracy real)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return;
  end if;
  update public.nexus_circle_self
  set lat = p_lat,
      lng = p_lng,
      accuracy_m = case when p_accuracy is null or p_accuracy < 0 or p_accuracy >= 100000 then null else p_accuracy end,
      updated_at = now()
  where user_id = auth.uid() and sharing;
end;
$$;

create or replace function public.nexus_circle_invite(p_viewer uuid, p_subject text, p_device text, p_hours int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  device text := nullif(btrim(coalesce(p_device, '')), '');
  existing public.nexus_circle_grants;
  rid uuid;
begin
  if me is null or p_viewer is null or p_viewer = me then
    raise exception 'Pick someone else';
  end if;
  if not public.are_friends(me, p_viewer) then
    raise exception 'Invite a friend';
  end if;
  if p_subject not in ('self', 'device') then
    raise exception 'Share yourself or one device';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 168 then
    raise exception 'Choose 1 to 168 hours';
  end if;
  if p_subject = 'self' then
    device := null;
  elsif device is null or not exists (
    select 1 from public.nexus_handsets h
    where h.user_id = me and h.device_id = device and h.share_location
  ) then
    raise exception 'Turn location on for that device before inviting someone';
  end if;
  select * into existing
  from public.nexus_circle_grants g
  where g.owner_id = me
    and g.viewer_id = p_viewer
    and g.subject = p_subject
    and coalesce(g.device_id, '') = coalesce(device, '')
    and not g.revoked
    and g.status in ('pending', 'active');
  if found then
    update public.nexus_circle_grants
    set expires_at = now() + make_interval(hours => p_hours)
    where id = existing.id
    returning nexus_circle_grants.id into rid;
    return rid;
  end if;
  insert into public.nexus_circle_grants (owner_id, viewer_id, subject, device_id, status, expires_at)
  values (me, p_viewer, p_subject, device, 'pending', now() + make_interval(hours => p_hours))
  returning nexus_circle_grants.id into rid;
  return rid;
end;
$$;

create or replace function public.nexus_circle_respond(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nexus_circle_grants
  set status = case when p_accept then 'active' else 'declined' end
  where id = p_id
    and viewer_id = auth.uid()
    and status = 'pending'
    and not revoked
    and expires_at > now();
  if not found then
    raise exception 'That invite is no longer open';
  end if;
end;
$$;

create or replace function public.nexus_circle_revoke(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nexus_circle_grants
  set revoked = true
  where id = p_id
    and (owner_id = auth.uid() or viewer_id = auth.uid());
end;
$$;

create or replace function public.nexus_circle_visible()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb := '[]'::jsonb;
  g record;
  lat double precision;
  lng double precision;
  accuracy real;
  fresh boolean;
  label text;
  name text;
begin
  if auth.uid() is null then
    return result;
  end if;
  for g in
    select *
    from public.nexus_circle_grants
    where viewer_id = auth.uid()
      and status = 'active'
      and not revoked
      and expires_at > now()
  loop
    lat := null;
    lng := null;
    accuracy := null;
    fresh := false;
    label := null;
    if g.subject = 'self' then
      select s.lat, s.lng, s.accuracy_m, s.sharing and s.updated_at > now() - interval '20 minutes' and s.lat is not null
        into lat, lng, accuracy, fresh
      from public.nexus_circle_self s
      where s.user_id = g.owner_id and s.sharing;
    else
      select h.lat, h.lng, h.accuracy_m, h.label,
             h.share_location and h.loc_at > now() - interval '20 minutes' and h.lat is not null
        into lat, lng, accuracy, label, fresh
      from public.nexus_handsets h
      where h.user_id = g.owner_id and h.device_id = g.device_id and h.share_location;
    end if;
    select coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Someone')
      into name
    from public.profiles p
    where p.id = g.owner_id;
    result := result || jsonb_build_array(jsonb_build_object(
      'grant_id', g.id,
      'owner_id', g.owner_id,
      'name', name,
      'subject', g.subject,
      'device_id', g.device_id,
      'label', label,
      'lat', case when fresh then lat else null end,
      'lng', case when fresh then lng else null end,
      'accuracy_m', case when fresh then accuracy else null end,
      'fresh', coalesce(fresh, false),
      'expires_at', g.expires_at
    ));
  end loop;
  return result;
end;
$$;

revoke all on function public.nexus_circle_set_sharing(boolean) from public, anon;
revoke all on function public.nexus_circle_ping(double precision, double precision, real) from public, anon;
revoke all on function public.nexus_circle_invite(uuid, text, text, int) from public, anon;
revoke all on function public.nexus_circle_respond(uuid, boolean) from public, anon;
revoke all on function public.nexus_circle_revoke(uuid) from public, anon;
revoke all on function public.nexus_circle_visible() from public, anon;
grant execute on function public.nexus_circle_set_sharing(boolean) to authenticated;
grant execute on function public.nexus_circle_ping(double precision, double precision, real) to authenticated;
grant execute on function public.nexus_circle_invite(uuid, text, text, int) to authenticated;
grant execute on function public.nexus_circle_respond(uuid, boolean) to authenticated;
grant execute on function public.nexus_circle_revoke(uuid) to authenticated;
grant execute on function public.nexus_circle_visible() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.nexus_circle_grants;
exception when duplicate_object then null; when undefined_object then null;
end $$;

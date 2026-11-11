-- Nexus Locator. Extends the signed-in handset row. Location is written only
-- when that device has share_location on. Nobody else can read the table.
-- A temporary share link is a separate, expiring token.

alter table public.nexus_handsets
  add column if not exists platform text not null default 'web',
  add column if not exists model text,
  add column if not exists os_name text,
  add column if not exists storage_bytes bigint,
  add column if not exists share_location boolean not null default false,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists accuracy_m real,
  add column if not exists loc_at timestamptz,
  add column if not exists lost boolean not null default false,
  add column if not exists trusted boolean not null default false,
  add column if not exists lost_message text,
  add column if not exists control_enabled boolean not null default false,
  add column if not exists place_alerts boolean not null default false;

alter table public.nexus_handsets drop constraint if exists nexus_handsets_platform_check;
alter table public.nexus_handsets
  add constraint nexus_handsets_platform_check
  check (platform in ('ios', 'ipados', 'macos', 'android', 'web', 'desktop'));

alter table public.nexus_handsets drop constraint if exists nexus_handsets_model_check;
alter table public.nexus_handsets
  add constraint nexus_handsets_model_check
  check (model is null or char_length(model) <= 80);

alter table public.nexus_handsets drop constraint if exists nexus_handsets_os_check;
alter table public.nexus_handsets
  add constraint nexus_handsets_os_check
  check (os_name is null or char_length(os_name) <= 80);

alter table public.nexus_handsets drop constraint if exists nexus_handsets_storage_check;
alter table public.nexus_handsets
  add constraint nexus_handsets_storage_check
  check (storage_bytes is null or storage_bytes >= 0);

alter table public.nexus_handsets drop constraint if exists nexus_handsets_accuracy_check;
alter table public.nexus_handsets
  add constraint nexus_handsets_accuracy_check
  check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m < 100000));

alter table public.nexus_handsets drop constraint if exists nexus_handsets_lat_check;
alter table public.nexus_handsets
  add constraint nexus_handsets_lat_check
  check (lat is null or lat between -90 and 90);

alter table public.nexus_handsets drop constraint if exists nexus_handsets_lng_check;
alter table public.nexus_handsets
  add constraint nexus_handsets_lng_check
  check (lng is null or lng between -180 and 180);

alter table public.nexus_handsets drop constraint if exists nexus_handsets_lost_message_check;
alter table public.nexus_handsets
  add constraint nexus_handsets_lost_message_check
  check (lost_message is null or char_length(lost_message) <= 280);

create table if not exists public.nexus_locator_points (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  device_id    text not null,
  lat          double precision not null,
  lng          double precision not null,
  accuracy_m   real,
  recorded_at  timestamptz not null default now()
);
create index if not exists nexus_locator_points_device_idx
  on public.nexus_locator_points (user_id, device_id, recorded_at desc);

create table if not exists public.nexus_locator_alerts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  device_id   text not null,
  place_name  text not null,
  kind        text not null check (kind in ('arrive', 'leave')),
  created_at  timestamptz not null default now()
);
create index if not exists nexus_locator_alerts_user_idx
  on public.nexus_locator_alerts (user_id, created_at desc);

create table if not exists public.nexus_locator_shares (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  device_id   text not null,
  token       text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  expires_at  timestamptz not null,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists nexus_locator_shares_user_idx on public.nexus_locator_shares (user_id, created_at desc);

alter table public.nexus_locator_points enable row level security;
alter table public.nexus_locator_alerts enable row level security;
alter table public.nexus_locator_shares enable row level security;
revoke all on public.nexus_locator_points from anon, authenticated;
revoke all on public.nexus_locator_alerts from anon, authenticated;
revoke all on public.nexus_locator_shares from anon, authenticated;
grant select, delete on public.nexus_locator_points to authenticated;
grant select, delete on public.nexus_locator_alerts to authenticated;
grant select, update on public.nexus_locator_shares to authenticated;

drop policy if exists nexus_locator_points_own on public.nexus_locator_points;
create policy nexus_locator_points_own on public.nexus_locator_points
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists nexus_locator_points_delete on public.nexus_locator_points;
create policy nexus_locator_points_delete on public.nexus_locator_points
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists nexus_locator_alerts_own on public.nexus_locator_alerts;
create policy nexus_locator_alerts_own on public.nexus_locator_alerts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists nexus_locator_alerts_delete on public.nexus_locator_alerts;
create policy nexus_locator_alerts_delete on public.nexus_locator_alerts
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists nexus_locator_shares_own on public.nexus_locator_shares;
create policy nexus_locator_shares_own on public.nexus_locator_shares
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists nexus_locator_shares_revoke on public.nexus_locator_shares;
create policy nexus_locator_shares_revoke on public.nexus_locator_shares
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.nexus_meters_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

revoke all on function public.nexus_meters_between(double precision, double precision, double precision, double precision) from public, anon, authenticated;

create or replace function public.nexus_locator_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
  was_in boolean;
  now_in boolean;
  moved boolean;
begin
  if new.share_location is not true or new.lat is null or new.lng is null then
    return new;
  end if;
  new.loc_at := now();
  moved := tg_op = 'INSERT'
    or old.lat is null
    or public.nexus_meters_between(old.lat, old.lng, new.lat, new.lng) > 40;
  if moved then
    insert into public.nexus_locator_points (user_id, device_id, lat, lng, accuracy_m)
    values (new.user_id, new.device_id, new.lat, new.lng, new.accuracy_m);
    delete from public.nexus_locator_points
    where id in (
      select id from public.nexus_locator_points
      where user_id = new.user_id and device_id = new.device_id
      order by recorded_at desc
      offset 80
    );
  end if;
  if new.place_alerts then
    for place in
      select s.name, s.lat, s.lng, coalesce(s.alert_radius_m, 150) as radius_m
      from public.wump_saved_places s
      where s.user_id = new.user_id
    loop
      now_in := public.nexus_meters_between(new.lat, new.lng, place.lat, place.lng) <= place.radius_m;
      was_in := tg_op = 'UPDATE' and old.lat is not null
        and public.nexus_meters_between(old.lat, old.lng, place.lat, place.lng) <= place.radius_m;
      if now_in and not was_in and not exists (
        select 1 from public.nexus_locator_alerts a
        where a.user_id = new.user_id and a.device_id = new.device_id
          and a.place_name = place.name and a.kind = 'arrive'
          and a.created_at > now() - interval '10 minutes'
      ) then
        insert into public.nexus_locator_alerts (user_id, device_id, place_name, kind)
        values (new.user_id, new.device_id, place.name, 'arrive');
      elsif was_in and not now_in and not exists (
        select 1 from public.nexus_locator_alerts a
        where a.user_id = new.user_id and a.device_id = new.device_id
          and a.place_name = place.name and a.kind = 'leave'
          and a.created_at > now() - interval '10 minutes'
      ) then
        insert into public.nexus_locator_alerts (user_id, device_id, place_name, kind)
        values (new.user_id, new.device_id, place.name, 'leave');
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists nexus_locator_track on public.nexus_handsets;
create trigger nexus_locator_track
  before insert or update of lat, lng, share_location, place_alerts on public.nexus_handsets
  for each row execute function public.nexus_locator_track();

create or replace function public.nexus_locator_share_start(p_device text, p_minutes int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row public.nexus_locator_shares;
  mins int := least(240, greatest(15, coalesce(p_minutes, 60)));
begin
  if me is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1 from public.nexus_handsets h
    where h.user_id = me and h.device_id = p_device and h.share_location and h.lat is not null
  ) then
    raise exception 'Turn location on for that device first';
  end if;
  insert into public.nexus_locator_shares (user_id, device_id, expires_at)
  values (me, p_device, now() + make_interval(mins => mins))
  returning * into row;
  return jsonb_build_object('id', row.id, 'token', row.token, 'expires_at', row.expires_at);
end;
$$;

create or replace function public.nexus_locator_share_open(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  share public.nexus_locator_shares;
  hand public.nexus_handsets;
begin
  select * into share from public.nexus_locator_shares
  where token = left(coalesce(p_token, ''), 64) and not revoked and expires_at > now();
  if not found then return jsonb_build_object('ok', false); end if;
  select * into hand from public.nexus_handsets
  where user_id = share.user_id and device_id = share.device_id and share_location and lat is not null;
  if not found then return jsonb_build_object('ok', false); end if;
  if auth.uid() is not null and auth.uid() is distinct from share.user_id and public.is_blocked_between(auth.uid(), share.user_id) then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'label', hand.label,
    'model', hand.model,
    'lat', hand.lat,
    'lng', hand.lng,
    'accuracy_m', hand.accuracy_m,
    'loc_at', hand.loc_at,
    'expires_at', share.expires_at
  );
end;
$$;

revoke all on function public.nexus_locator_share_start(text, int) from public, anon;
revoke all on function public.nexus_locator_share_open(text) from public;
grant execute on function public.nexus_locator_share_start(text, int) to authenticated;
grant execute on function public.nexus_locator_share_open(text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.nexus_locator_alerts;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.nexus_locator_points;
exception when duplicate_object then null; when undefined_object then null;
end $$;

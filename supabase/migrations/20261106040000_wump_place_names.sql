-- Wump place names on Live presence (web-deployable — no IPA rebuild required).

alter table public.bump_presence
  add column if not exists place_name text,
  add column if not exists place_locality text;

alter table public.bump_presence
  drop constraint if exists bump_presence_place_name_check;
alter table public.bump_presence
  add constraint bump_presence_place_name_check
  check (place_name is null or char_length(place_name) <= 160);

alter table public.bump_presence
  drop constraint if exists bump_presence_place_locality_check;
alter table public.bump_presence
  add constraint bump_presence_place_locality_check
  check (place_locality is null or char_length(place_locality) <= 120);

comment on column public.bump_presence.place_name is 'Reverse-geocoded place (street / POI) for Live pin';
comment on column public.bump_presence.place_locality is 'City / neighborhood for Live pin';

-- Publish with optional place labels
create or replace function public.bump_publish(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_visible text default 'friends',
  p_label text default null,
  p_precision text default null,
  p_heading double precision default null,
  p_speed double precision default null,
  p_battery smallint default null,
  p_place_name text default null,
  p_place_locality text default null
)
returns public.bump_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.bump_presence;
  qlat double precision;
  qlng double precision;
  prec text;
  digits int;
  sharing boolean;
  hdg double precision;
  spd double precision;
  pname text;
  ploc text;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select wump_share_enabled, coalesce(wump_precision, 'approx')
    into sharing, prec
  from public.user_privacy
  where user_id = uid;

  if found and sharing = false then
    raise exception 'location sharing is disabled in privacy settings';
  end if;
  prec := coalesce(prec, 'approx');

  if p_visible is null or p_visible not in ('friends','family','everyone') then
    p_visible := 'friends';
  end if;

  prec := coalesce(nullif(p_precision, ''), prec, 'approx');
  if prec = 'exact' then digits := 5;
  elsif prec = 'city' then digits := 1;
  else digits := 3;
  end if;

  qlat := round(p_lat::numeric, digits)::double precision;
  qlng := round(p_lng::numeric, digits)::double precision;

  hdg := case
    when p_heading is null then null
    when p_heading < 0 or p_heading > 360 then mod(p_heading::numeric + 360, 360)::double precision
    else p_heading
  end;
  spd := case when p_speed is null then null else greatest(0, least(p_speed, 120)) end;
  pname := nullif(trim(coalesce(p_place_name, '')), '');
  ploc := nullif(trim(coalesce(p_place_locality, '')), '');
  if pname is not null then pname := left(pname, 160); end if;
  if ploc is not null then ploc := left(ploc, 120); end if;

  insert into bump_presence (
    user_id, lat, lng, accuracy_m, visible, label, updated_at,
    heading, speed_mps, battery_pct, expires_at, place_name, place_locality
  )
  values (
    uid, qlat, qlng, p_accuracy, p_visible, nullif(trim(p_label), ''), now(),
    hdg, spd, p_battery, now() + interval '20 minutes', pname, ploc
  )
  on conflict (user_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    accuracy_m = excluded.accuracy_m,
    visible = excluded.visible,
    label = excluded.label,
    updated_at = now(),
    heading = coalesce(excluded.heading, bump_presence.heading),
    speed_mps = coalesce(excluded.speed_mps, bump_presence.speed_mps),
    battery_pct = coalesce(excluded.battery_pct, bump_presence.battery_pct),
    expires_at = now() + interval '20 minutes',
    place_name = coalesce(excluded.place_name, bump_presence.place_name),
    place_locality = coalesce(excluded.place_locality, bump_presence.place_locality)
  returning * into row;
  return row;
end;
$$;

grant execute on function public.bump_publish(double precision, double precision, double precision, text, text, text, double precision, double precision, smallint, text, text) to authenticated;

-- Heartbeat with place
create or replace function public.bump_heartbeat(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_heading double precision default null,
  p_speed double precision default null,
  p_place_name text default null,
  p_place_locality text default null
)
returns public.bump_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur public.bump_presence;
  vis text;
  lab text;
  prec text;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into cur from bump_presence where user_id = uid;
  if not found then
    return public.bump_publish(p_lat, p_lng, p_accuracy, 'friends', null, null, p_heading, p_speed, null, p_place_name, p_place_locality);
  end if;

  select coalesce(wump_precision, 'approx') into prec
  from public.user_privacy where user_id = uid;
  prec := coalesce(prec, 'approx');

  vis := cur.visible;
  lab := cur.label;

  return public.bump_publish(p_lat, p_lng, p_accuracy, vis, lab, prec, p_heading, p_speed, null, p_place_name, p_place_locality);
end;
$$;

grant execute on function public.bump_heartbeat(double precision, double precision, double precision, double precision, double precision, text, text) to authenticated;
-- keep older 5-arg heartbeat working
grant execute on function public.bump_heartbeat(double precision, double precision, double precision, double precision, double precision) to authenticated;

-- Update place labels without moving (async geocode after publish)
create or replace function public.bump_set_place(
  p_place_name text default null,
  p_place_locality text default null
)
returns public.bump_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.bump_presence;
  pname text := nullif(trim(coalesce(p_place_name, '')), '');
  ploc text := nullif(trim(coalesce(p_place_locality, '')), '');
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if pname is not null then pname := left(pname, 160); end if;
  if ploc is not null then ploc := left(ploc, 120); end if;

  update bump_presence set
    place_name = coalesce(pname, place_name),
    place_locality = coalesce(ploc, place_locality),
    updated_at = now(),
    expires_at = now() + interval '20 minutes'
  where user_id = uid
  returning * into row;

  if not found then raise exception 'publish your location first'; end if;
  return row;
end;
$$;

grant execute on function public.bump_set_place(text, text) to authenticated;

-- Nearby includes Live place + profile pinned place
drop function if exists public.bump_nearby(double precision);
create or replace function public.bump_nearby(p_radius_m double precision default 400)
returns table (
  user_id uuid,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  visible text,
  label text,
  updated_at timestamptz,
  meters double precision,
  heading double precision,
  speed_mps double precision,
  expires_at timestamptz,
  age_seconds double precision,
  place_name text,
  place_locality text,
  profile_place_name text,
  profile_place_lat double precision,
  profile_place_lng double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  mylat double precision;
  mylng double precision;
  deg double precision;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select p.lat, p.lng into mylat, mylng from bump_presence p where p.user_id = me;
  if mylat is null then raise exception 'publish your location first'; end if;
  deg := greatest(0.002, least(0.25, (coalesce(p_radius_m, 400) / 111320.0) * 1.35));
  return query
  select
    p.user_id,
    p.lat,
    p.lng,
    p.accuracy_m,
    p.visible,
    p.label,
    p.updated_at,
    (6371000 * 2 * asin(sqrt(
      power(sin(radians(p.lat - mylat) / 2), 2) +
      cos(radians(mylat)) * cos(radians(p.lat)) *
      power(sin(radians(p.lng - mylng) / 2), 2)
    )))::double precision as meters,
    p.heading,
    p.speed_mps,
    p.expires_at,
    extract(epoch from (now() - p.updated_at))::double precision as age_seconds,
    p.place_name,
    p.place_locality,
    bp.place_name,
    bp.place_lat,
    bp.place_lng
  from bump_presence p
  left join bump_profiles bp on bp.user_id = p.user_id
  where p.user_id <> me
    and p.updated_at > now() - interval '20 minutes'
    and (p.expires_at is null or p.expires_at > now())
    and p.lat between mylat - deg and mylat + deg
    and p.lng between mylng - deg and mylng + deg
    and public.bump_can_see(p.user_id, me)
  order by meters asc
  limit 80;
end;
$$;

grant execute on function public.bump_nearby(double precision) to authenticated;

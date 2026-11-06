-- Wump live map: motion fields, expiry, heartbeat RPC, richer nearby payload.

alter table public.bump_presence
  add column if not exists heading double precision,
  add column if not exists speed_mps double precision,
  add column if not exists battery_pct smallint,
  add column if not exists expires_at timestamptz;

comment on column public.bump_presence.heading is 'Degrees from north (0-360) when publishing Live';
comment on column public.bump_presence.speed_mps is 'Ground speed m/s from device GPS';
comment on column public.bump_presence.expires_at is 'Soft TTL — pins hidden after this (default 20 min from publish)';

update public.bump_presence
set expires_at = updated_at + interval '20 minutes'
where expires_at is null;

create index if not exists bump_presence_expires_idx on public.bump_presence (expires_at desc);

-- Full publish with motion + expiry
create or replace function public.bump_publish(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_visible text default 'friends',
  p_label text default null,
  p_precision text default null,
  p_heading double precision default null,
  p_speed double precision default null,
  p_battery smallint default null
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

  insert into bump_presence (
    user_id, lat, lng, accuracy_m, visible, label, updated_at,
    heading, speed_mps, battery_pct, expires_at
  )
  values (
    uid, qlat, qlng, p_accuracy, p_visible, nullif(trim(p_label), ''), now(),
    hdg, spd, p_battery, now() + interval '20 minutes'
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
    expires_at = now() + interval '20 minutes'
  returning * into row;
  return row;
end;
$$;

grant execute on function public.bump_publish(double precision, double precision, double precision, text, text, text, double precision, double precision, smallint) to authenticated;
grant execute on function public.bump_publish(double precision, double precision, double precision, text, text, text) to authenticated;
grant execute on function public.bump_publish(double precision, double precision, double precision, text, text) to authenticated;

-- Cheap Live heartbeat (same rounding rules, always refreshes expiry)
create or replace function public.bump_heartbeat(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_heading double precision default null,
  p_speed double precision default null
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
    -- first heartbeat acts as publish with default audience
    return public.bump_publish(p_lat, p_lng, p_accuracy, 'friends', null, null, p_heading, p_speed, null);
  end if;

  select coalesce(wump_precision, 'approx') into prec
  from public.user_privacy where user_id = uid;
  prec := coalesce(prec, 'approx');

  vis := cur.visible;
  lab := cur.label;

  return public.bump_publish(p_lat, p_lng, p_accuracy, vis, lab, prec, p_heading, p_speed, null);
end;
$$;

grant execute on function public.bump_heartbeat(double precision, double precision, double precision, double precision, double precision) to authenticated;

-- Nearby with motion + freshness (drop first — OUT row type changed)
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
  age_seconds double precision
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
    extract(epoch from (now() - p.updated_at))::double precision as age_seconds
  from bump_presence p
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

-- Purge stale Live pins (callable by authenticated self-heal or service cron)
create or replace function public.bump_expire_stale()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from bump_presence
  where updated_at < now() - interval '20 minutes'
     or (expires_at is not null and expires_at < now());
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.bump_expire_stale() to authenticated;

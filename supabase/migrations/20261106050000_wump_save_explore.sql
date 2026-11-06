-- Wump: saved places + map exploration grid (web-deployable, no IPA).

create table if not exists public.wump_saved_places (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 160),
  locality    text check (locality is null or char_length(locality) <= 120),
  lat         double precision not null,
  lng         double precision not null,
  note        text check (note is null or char_length(note) <= 280),
  source      text not null default 'map'
                check (source in ('map', 'live', 'tap', 'profile')),
  created_at  timestamptz not null default now()
);
create index if not exists wump_saved_places_user_idx on public.wump_saved_places (user_id, created_at desc);

alter table public.wump_saved_places enable row level security;
drop policy if exists wump_saved_places_own on public.wump_saved_places;
create policy wump_saved_places_own on public.wump_saved_places
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ~150–200 m cells (0.0015°) — exploration fog grid
create table if not exists public.wump_explore_cells (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  cell_x    integer not null,
  cell_y    integer not null,
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  primary key (user_id, cell_x, cell_y)
);
create index if not exists wump_explore_cells_user_idx on public.wump_explore_cells (user_id, last_at desc);

alter table public.wump_explore_cells enable row level security;
drop policy if exists wump_explore_cells_own on public.wump_explore_cells;
create policy wump_explore_cells_own on public.wump_explore_cells
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.wump_save_place(
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_locality text default null,
  p_note text default null,
  p_source text default 'map'
)
returns public.wump_saved_places
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.wump_saved_places;
  src text := coalesce(nullif(p_source, ''), 'map');
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'name required'; end if;
  if src not in ('map', 'live', 'tap', 'profile') then src := 'map'; end if;

  insert into wump_saved_places (user_id, name, locality, lat, lng, note, source)
  values (
    uid,
    left(trim(p_name), 160),
    nullif(left(trim(coalesce(p_locality, '')), 120), ''),
    p_lat,
    p_lng,
    nullif(left(trim(coalesce(p_note, '')), 280), ''),
    src
  )
  returning * into row;
  return row;
end;
$$;

grant execute on function public.wump_save_place(text, double precision, double precision, text, text, text) to authenticated;

create or replace function public.wump_list_saved_places()
returns setof public.wump_saved_places
language sql
security definer
set search_path = public
as $$
  select * from wump_saved_places
  where user_id = auth.uid()
  order by created_at desc
  limit 200;
$$;

grant execute on function public.wump_list_saved_places() to authenticated;

create or replace function public.wump_delete_saved_place(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from wump_saved_places where id = p_id and user_id = auth.uid();
  return found;
end;
$$;

grant execute on function public.wump_delete_saved_place(uuid) to authenticated;

-- Mark current GPS cell explored; returns whether it was new
create or replace function public.wump_explore_mark(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cx int;
  cy int;
  inserted boolean := false;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- 0.0015° ≈ 167 m at equator
  cx := floor(p_lng / 0.0015)::int;
  cy := floor(p_lat / 0.0015)::int;

  begin
    insert into wump_explore_cells (user_id, cell_x, cell_y)
    values (uid, cx, cy);
    inserted := true;
  exception when unique_violation then
    update wump_explore_cells set last_at = now()
    where user_id = uid and cell_x = cx and cell_y = cy;
    inserted := false;
  end;

  return jsonb_build_object('cell_x', cx, 'cell_y', cy, 'new', inserted);
end;
$$;

grant execute on function public.wump_explore_mark(double precision, double precision) to authenticated;

-- Exploration % within radius around a point (default 5 km)
create or replace function public.wump_explore_stats(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m double precision default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lat0 double precision;
  lng0 double precision;
  r double precision := greatest(500, least(coalesce(p_radius_m, 5000), 25000));
  cell_m double precision := 167.0; -- approx meters per cell
  total_cells int;
  explored_local int;
  explored_all int;
  pct numeric;
  deg_lat double precision;
  deg_lng double precision;
  x0 int; x1 int; y0 int; y1 int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if p_lat is null or p_lng is null then
    select lat, lng into lat0, lng0 from bump_presence where user_id = uid;
  else
    lat0 := p_lat;
    lng0 := p_lng;
  end if;

  select count(*)::int into explored_all from wump_explore_cells where user_id = uid;

  if lat0 is null then
    return jsonb_build_object(
      'percent', 0,
      'explored_local', 0,
      'total_local', 0,
      'explored_all', explored_all,
      'radius_m', r,
      'has_location', false
    );
  end if;

  -- Bounding box of cells covering the circle (slight overcount → conservative %)
  deg_lat := (r / 111320.0);
  deg_lng := (r / (111320.0 * greatest(0.2, cos(radians(lat0)))));
  y0 := floor((lat0 - deg_lat) / 0.0015)::int;
  y1 := floor((lat0 + deg_lat) / 0.0015)::int;
  x0 := floor((lng0 - deg_lng) / 0.0015)::int;
  x1 := floor((lng0 + deg_lng) / 0.0015)::int;

  total_cells := greatest(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  -- Prefer area-based estimate for circle (less rectangular overcount)
  total_cells := greatest(1, ceil(pi() * power(r / cell_m, 2))::int);

  select count(*)::int into explored_local
  from wump_explore_cells c
  where c.user_id = uid
    and c.cell_x between x0 and x1
    and c.cell_y between y0 and y1;

  pct := least(100, round((explored_local::numeric / total_cells::numeric) * 100, 1));

  return jsonb_build_object(
    'percent', pct,
    'explored_local', explored_local,
    'total_local', total_cells,
    'explored_all', explored_all,
    'radius_m', r,
    'has_location', true,
    'lat', lat0,
    'lng', lng0
  );
end;
$$;

grant execute on function public.wump_explore_stats(double precision, double precision, double precision) to authenticated;

-- Enrich nearby with Nexus username / display_name for map labels + profile links
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
  profile_place_lng double precision,
  username text,
  display_name text
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
    bp.place_lng,
    pr.username,
    pr.display_name
  from bump_presence p
  left join bump_profiles bp on bp.user_id = p.user_id
  left join profiles pr on pr.id = p.user_id
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

-- Polish Wump save/explore: nearby dedupe on save, richer explore_mark payload.

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
  nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  nm := left(trim(coalesce(p_name, '')), 160);
  if nm = '' then raise exception 'name required'; end if;
  if p_lat is null or p_lng is null then raise exception 'coordinates required'; end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates';
  end if;
  if src not in ('map', 'live', 'tap', 'profile') then src := 'map'; end if;

  -- Refresh an existing pin within ~80 m with the same name instead of duplicating
  select * into row
  from wump_saved_places s
  where s.user_id = uid
    and lower(s.name) = lower(nm)
    and abs(s.lat - p_lat) < 0.0007
    and abs(s.lng - p_lng) < 0.0007
  order by s.created_at desc
  limit 1;

  if found then
    update wump_saved_places
    set
      locality = coalesce(nullif(left(trim(coalesce(p_locality, '')), 120), ''), locality),
      note = coalesce(nullif(left(trim(coalesce(p_note, '')), 280), ''), note),
      lat = p_lat,
      lng = p_lng,
      source = src
    where id = row.id
    returning * into row;
    return row;
  end if;

  insert into wump_saved_places (user_id, name, locality, lat, lng, note, source)
  values (
    uid,
    nm,
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
  stats jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_lat is null or p_lng is null then raise exception 'coordinates required'; end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates';
  end if;

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

  stats := public.wump_explore_stats(p_lat, p_lng, 5000);

  return jsonb_build_object(
    'cell_x', cx,
    'cell_y', cy,
    'new', inserted,
    'percent', coalesce((stats->>'percent')::numeric, 0),
    'explored_local', coalesce((stats->>'explored_local')::int, 0),
    'total_local', coalesce((stats->>'total_local')::int, 0),
    'explored_all', coalesce((stats->>'explored_all')::int, 0)
  );
end;
$$;

grant execute on function public.wump_explore_mark(double precision, double precision) to authenticated;

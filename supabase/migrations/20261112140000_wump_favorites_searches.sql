-- Wump map: favorite saved places, and the signed-in user's own recent place searches.
-- Favorites stay on wump_saved_places. The existing owner-only policy covers the new column.
-- Recent searches are place queries the user typed. They are not a live location share.

alter table public.wump_saved_places
  add column if not exists favorite boolean not null default false;

create index if not exists wump_saved_places_favorite_idx
  on public.wump_saved_places (user_id, created_at desc)
  where favorite;

create or replace function public.wump_set_place_favorite(p_place uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  update public.wump_saved_places
     set favorite = coalesce(p_on, false)
   where id = p_place
     and user_id = me;
  return found;
end;
$$;

revoke all on function public.wump_set_place_favorite(uuid, boolean) from public, anon;
grant execute on function public.wump_set_place_favorite(uuid, boolean) to authenticated;

create table if not exists public.wump_recent_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  query text not null check (char_length(query) between 1 and 120),
  name text check (name is null or char_length(name) <= 160),
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  constraint wump_recent_searches_coords check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  )
);

create index if not exists wump_recent_searches_user_idx
  on public.wump_recent_searches (user_id, created_at desc);

alter table public.wump_recent_searches enable row level security;

drop policy if exists wump_recent_searches_own on public.wump_recent_searches;
create policy wump_recent_searches_own on public.wump_recent_searches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.wump_recent_searches from anon, public;
grant select, insert, delete on public.wump_recent_searches to authenticated;

create or replace function public.wump_remember_search(
  p_query text,
  p_name text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  q text := left(btrim(coalesce(p_query, '')), 120);
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if q = '' then
    return;
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lng is null or p_lng < -180 or p_lng > 180) then
    p_lat := null;
    p_lng := null;
  end if;
  insert into public.wump_recent_searches (user_id, query, name, lat, lng)
  values (me, q, nullif(left(btrim(coalesce(p_name, '')), 160), ''), p_lat, p_lng);
  delete from public.wump_recent_searches
   where user_id = me
     and id not in (
       select s.id
         from public.wump_recent_searches s
        where s.user_id = me
        order by s.created_at desc
        limit 20
     );
end;
$$;

revoke all on function public.wump_remember_search(text, text, double precision, double precision) from public, anon;
grant execute on function public.wump_remember_search(text, text, double precision, double precision) to authenticated;

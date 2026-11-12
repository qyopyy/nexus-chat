-- Wump Wilds: original creatures on a street block, caught with friends.
-- A room stores a rounded cell (~110 m), never a raw GPS sample.
-- Only the host and friends who redeem the code can see that cell.
-- Not applied to the live database by this change.

create table if not exists public.wump_wild_rooms (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles (id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  title       text not null default 'Wilds' check (char_length(title) between 1 and 40),
  cell_lat    double precision not null check (cell_lat between -90 and 90),
  cell_lng    double precision not null check (cell_lng between -180 and 180),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '6 hours')
);

create table if not exists public.wump_wild_members (
  room_id    uuid not null references public.wump_wild_rooms (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.wump_wild_catches (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.wump_wild_rooms (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  species    text not null check (species in ('pebblit', 'mossnip', 'brooklet', 'emberling', 'gustkit', 'nightgleam', 'shellbit', 'lanternub')),
  caught_at  timestamptz not null default now()
);

create table if not exists public.wump_wild_dex (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  species     text not null check (species in ('pebblit', 'mossnip', 'brooklet', 'emberling', 'gustkit', 'nightgleam', 'shellbit', 'lanternub')),
  caught      integer not null default 1 check (caught between 1 and 500),
  updated_at  timestamptz not null default now(),
  primary key (user_id, species)
);

alter table public.wump_wild_rooms enable row level security;
alter table public.wump_wild_members enable row level security;
alter table public.wump_wild_catches enable row level security;
alter table public.wump_wild_dex enable row level security;

revoke all on public.wump_wild_rooms from anon, authenticated;
revoke all on public.wump_wild_members from anon, authenticated;
revoke all on public.wump_wild_catches from anon, authenticated;
revoke all on public.wump_wild_dex from anon, authenticated;

grant select on public.wump_wild_rooms to authenticated;
grant select on public.wump_wild_members to authenticated;
grant select on public.wump_wild_catches to authenticated;
grant select on public.wump_wild_dex to authenticated;

create or replace function public.wump_wild_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wump_wild_members m
    where m.room_id = p_room and m.user_id = (select auth.uid())
  );
$$;

drop policy if exists wump_wild_rooms_member on public.wump_wild_rooms;
create policy wump_wild_rooms_member on public.wump_wild_rooms
  for select to authenticated
  using (public.wump_wild_member(id) and expires_at > now());

drop policy if exists wump_wild_members_read on public.wump_wild_members;
create policy wump_wild_members_read on public.wump_wild_members
  for select to authenticated
  using (public.wump_wild_member(room_id));

drop policy if exists wump_wild_catches_read on public.wump_wild_catches;
create policy wump_wild_catches_read on public.wump_wild_catches
  for select to authenticated
  using (public.wump_wild_member(room_id));

drop policy if exists wump_wild_dex_own on public.wump_wild_dex;
create policy wump_wild_dex_own on public.wump_wild_dex
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.wump_wild_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..6 loop
    out := out || substr(alphabet, 1 + (floor(random() * length(alphabet)))::int, 1);
  end loop;
  return out;
end;
$$;

create or replace function public.wump_wild_create(p_title text, p_lat double precision, p_lng double precision)
returns public.wump_wild_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row public.wump_wild_rooms;
  cell_lat double precision := round(p_lat::numeric, 3);
  cell_lng double precision := round(p_lng::numeric, 3);
  next_code text;
  n int := 0;
begin
  if me is null then raise exception 'Sign in required'; end if;
  if cell_lat is null or cell_lng is null or cell_lat not between -90 and 90 or cell_lng not between -180 and 180 then
    raise exception 'Location is needed to open a Wilds room';
  end if;
  loop
    n := n + 1;
    next_code := public.wump_wild_code();
    exit when not exists (select 1 from public.wump_wild_rooms r where r.code = next_code);
    if n > 8 then raise exception 'Could not make a room code'; end if;
  end loop;
  insert into public.wump_wild_rooms (host_id, code, title, cell_lat, cell_lng)
  values (me, next_code, left(coalesce(nullif(btrim(p_title), ''), 'Wilds'), 40), cell_lat, cell_lng)
  returning * into row;
  insert into public.wump_wild_members (room_id, user_id) values (row.id, me);
  return row;
end;
$$;

create or replace function public.wump_wild_join(p_code text)
returns public.wump_wild_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row public.wump_wild_rooms;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select * into row from public.wump_wild_rooms r
  where r.code = upper(btrim(p_code)) and r.expires_at > now();
  if row.id is null then raise exception 'That code is not open for you'; end if;
  if row.host_id is distinct from me and not public.are_friends(me, row.host_id) then
    raise exception 'That code is not open for you';
  end if;
  insert into public.wump_wild_members (room_id, user_id) values (row.id, me)
  on conflict (room_id, user_id) do nothing;
  return row;
end;
$$;

create or replace function public.wump_wild_leave(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then return; end if;
  delete from public.wump_wild_members where room_id = p_room and user_id = me;
end;
$$;

create or replace function public.wump_wild_mine()
returns public.wump_wild_rooms
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.wump_wild_rooms r
  join public.wump_wild_members m on m.room_id = r.id
  where m.user_id = (select auth.uid()) and r.expires_at > now()
  order by m.joined_at desc
  limit 1;
$$;

create or replace function public.wump_wild_catch(p_species text, p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_species not in ('pebblit', 'mossnip', 'brooklet', 'emberling', 'gustkit', 'nightgleam', 'shellbit', 'lanternub') then
    raise exception 'Unknown creature';
  end if;
  if (select count(*) from public.wump_wild_dex d where d.user_id = me) >= 8
     and not exists (select 1 from public.wump_wild_dex d where d.user_id = me and d.species = p_species)
     and (select coalesce(sum(caught), 0) from public.wump_wild_dex d where d.user_id = me) >= 500 then
    raise exception 'Your field notes are full';
  end if;
  insert into public.wump_wild_dex (user_id, species, caught)
  values (me, p_species, 1)
  on conflict (user_id, species) do update
    set caught = least(500, public.wump_wild_dex.caught + 1), updated_at = now();
  if p_room is not null then
    if not public.wump_wild_member(p_room) then
      raise exception 'Join the room before sharing a catch';
    end if;
    if (select count(*) from public.wump_wild_catches c where c.user_id = me and c.caught_at > now() - interval '1 hour') >= 40 then
      raise exception 'Rest a minute — that is a lot of catches';
    end if;
    insert into public.wump_wild_catches (room_id, user_id, species) values (p_room, me, p_species);
  end if;
end;
$$;

revoke all on function public.wump_wild_create(text, double precision, double precision) from public, anon;
revoke all on function public.wump_wild_join(text) from public, anon;
revoke all on function public.wump_wild_leave(uuid) from public, anon;
revoke all on function public.wump_wild_mine() from public, anon;
revoke all on function public.wump_wild_catch(text, uuid) from public, anon;
grant execute on function public.wump_wild_create(text, double precision, double precision) to authenticated;
grant execute on function public.wump_wild_join(text) to authenticated;
grant execute on function public.wump_wild_leave(uuid) to authenticated;
grant execute on function public.wump_wild_mine() to authenticated;
grant execute on function public.wump_wild_catch(text, uuid) to authenticated;

alter table public.wump_wild_catches replica identity full;
alter table public.wump_wild_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.wump_wild_catches;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wump_wild_members;
exception when duplicate_object then null; when undefined_object then null;
end $$;

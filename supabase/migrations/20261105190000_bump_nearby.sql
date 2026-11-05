-- Nexus Bump — nearby / family presence + invite codes (approx location, short TTL)

create table if not exists public.bump_presence (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  double precision,
  visible     text not null default 'friends'
                check (visible in ('friends', 'family', 'everyone')),
  label       text check (label is null or char_length(label) <= 40),
  updated_at  timestamptz not null default now()
);
create index if not exists bump_presence_updated_idx on public.bump_presence (updated_at desc);
create index if not exists bump_presence_geo_idx on public.bump_presence (lat, lng);

create table if not exists public.bump_family (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  member_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, member_id),
  check (user_id <> member_id)
);
create index if not exists bump_family_member_idx on public.bump_family (member_id);

create table if not exists public.bump_invites (
  code        text primary key check (char_length(code) between 6 and 24),
  creator_id  uuid not null references public.profiles (id) on delete cascade,
  kind        text not null default 'family' check (kind in ('family', 'friend', 'nearby')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  uses        int not null default 0,
  max_uses    int not null default 25
);
create index if not exists bump_invites_creator_idx on public.bump_invites (creator_id, created_at desc);

alter table public.bump_presence enable row level security;
alter table public.bump_family enable row level security;
alter table public.bump_invites enable row level security;

-- Presence: own row always; others only when fresh (< 20 min) and visibility allows
create or replace function public.bump_can_see(target uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target = viewer then true
    when not exists (
      select 1 from bump_presence p
      where p.user_id = target and p.updated_at > now() - interval '20 minutes'
    ) then false
    when (select visible from bump_presence where user_id = target) = 'everyone' then true
    when (select visible from bump_presence where user_id = target) = 'family' then exists (
      select 1 from bump_family f
      where (f.user_id = target and f.member_id = viewer)
         or (f.user_id = viewer and f.member_id = target)
    )
    when (select visible from bump_presence where user_id = target) = 'friends' then exists (
      select 1 from friendships fr
      where fr.status = 'accepted'
        and ((fr.requester_id = target and fr.addressee_id = viewer)
          or (fr.requester_id = viewer and fr.addressee_id = target))
    ) or exists (
      select 1 from bump_family f
      where (f.user_id = target and f.member_id = viewer)
         or (f.user_id = viewer and f.member_id = target)
    )
    else false
  end;
$$;

drop policy if exists bump_presence_select on public.bump_presence;
create policy bump_presence_select on public.bump_presence
  for select to authenticated
  using (public.bump_can_see(user_id, auth.uid()));

drop policy if exists bump_presence_upsert on public.bump_presence;
create policy bump_presence_insert on public.bump_presence
  for insert to authenticated with check (user_id = auth.uid());
create policy bump_presence_update on public.bump_presence
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bump_presence_delete on public.bump_presence
  for delete to authenticated using (user_id = auth.uid());

create policy bump_family_select on public.bump_family
  for select to authenticated
  using (user_id = auth.uid() or member_id = auth.uid());
create policy bump_family_write on public.bump_family
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy bump_invites_select on public.bump_invites
  for select to authenticated using (creator_id = auth.uid() or true);
create policy bump_invites_insert on public.bump_invites
  for insert to authenticated with check (creator_id = auth.uid());
create policy bump_invites_update on public.bump_invites
  for update to authenticated using (creator_id = auth.uid() or true);

create or replace function public.bump_publish(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_visible text default 'friends',
  p_label text default null
)
returns public.bump_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.bump_presence;
  -- ~100 m grid so we never store exact GPS
  qlat double precision;
  qlng double precision;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_visible is null or p_visible not in ('friends','family','everyone') then
    p_visible := 'friends';
  end if;
  qlat := round(p_lat::numeric, 3)::double precision;
  qlng := round(p_lng::numeric, 3)::double precision;
  insert into bump_presence (user_id, lat, lng, accuracy_m, visible, label, updated_at)
  values (uid, qlat, qlng, p_accuracy, p_visible, nullif(trim(p_label), ''), now())
  on conflict (user_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    accuracy_m = excluded.accuracy_m,
    visible = excluded.visible,
    label = excluded.label,
    updated_at = now()
  returning * into row;
  return row;
end;
$$;

create or replace function public.bump_clear()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from bump_presence where user_id = auth.uid();
end;
$$;

create or replace function public.bump_nearby(p_radius_m double precision default 400)
returns table (
  user_id uuid,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  visible text,
  label text,
  updated_at timestamptz,
  meters double precision
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
  deg := greatest(0.002, least(0.2, (coalesce(p_radius_m, 400) / 111320.0) * 1.35));
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
    )))::double precision as meters
  from bump_presence p
  where p.user_id <> me
    and p.updated_at > now() - interval '20 minutes'
    and p.lat between mylat - deg and mylat + deg
    and p.lng between mylng - deg and mylng + deg
    and public.bump_can_see(p.user_id, me)
  order by meters asc
  limit 80;
end;
$$;

create or replace function public.bump_create_invite(p_kind text default 'family')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  code text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind is null or p_kind not in ('family','friend','nearby') then p_kind := 'family'; end if;
  code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into bump_invites (code, creator_id, kind, expires_at)
  values (code, uid, p_kind, now() + interval '7 days');
  return code;
end;
$$;

create or replace function public.bump_redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv bump_invites%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from bump_invites where code = lower(trim(p_code));
  if not found then raise exception 'invite not found'; end if;
  if inv.expires_at < now() then raise exception 'invite expired'; end if;
  if inv.uses >= inv.max_uses then raise exception 'invite used up'; end if;
  if inv.creator_id = uid then raise exception 'that''s your own invite'; end if;

  if inv.kind = 'family' then
    insert into bump_family (user_id, member_id) values (inv.creator_id, uid)
      on conflict do nothing;
    insert into bump_family (user_id, member_id) values (uid, inv.creator_id)
      on conflict do nothing;
  elsif inv.kind = 'friend' then
    -- soft friend request if friendships table exists
    begin
      insert into friendships (requester_id, addressee_id, status)
      values (uid, inv.creator_id, 'pending')
      on conflict do nothing;
    exception when others then
      null;
    end;
  end if;

  update bump_invites set uses = uses + 1 where code = inv.code;
  return jsonb_build_object(
    'ok', true,
    'kind', inv.kind,
    'creator_id', inv.creator_id
  );
end;
$$;

grant execute on function public.bump_publish(double precision, double precision, double precision, text, text) to authenticated;
grant execute on function public.bump_clear() to authenticated;
grant execute on function public.bump_nearby(double precision) to authenticated;
grant execute on function public.bump_create_invite(text) to authenticated;
grant execute on function public.bump_redeem_invite(text) to authenticated;
grant execute on function public.bump_can_see(uuid, uuid) to authenticated;

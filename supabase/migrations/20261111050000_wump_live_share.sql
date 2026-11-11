-- Temporary live location links, and a small "heading there" session
-- with each person's pin and an ETA. Both expire. RLS keeps writes to the owner
-- or the people who joined.

create table if not exists public.wump_live_shares (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
                check (char_length(token) between 16 and 64),
  label       text check (label is null or char_length(label) between 1 and 80),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  real check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m < 100000)),
  expires_at  timestamptz not null,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists wump_live_shares_owner_idx on public.wump_live_shares (owner_id, created_at desc);

create table if not exists public.wump_headings (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
                check (char_length(token) between 16 and 64),
  title       text not null check (char_length(title) between 1 and 80),
  dest_lat    double precision not null check (dest_lat between -90 and 90),
  dest_lng    double precision not null check (dest_lng between -180 and 180),
  dest_name   text check (dest_name is null or char_length(dest_name) <= 160),
  expires_at  timestamptz not null,
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists wump_headings_host_idx on public.wump_headings (host_id, created_at desc);

create table if not exists public.wump_heading_members (
  heading_id  uuid not null references public.wump_headings (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  lat         double precision check (lat is null or lat between -90 and 90),
  lng         double precision check (lng is null or lng between -180 and 180),
  accuracy_m  real check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m < 100000)),
  eta_min     int check (eta_min is null or (eta_min >= 0 and eta_min <= 1440)),
  updated_at  timestamptz not null default now(),
  primary key (heading_id, user_id)
);

alter table public.wump_live_shares enable row level security;
alter table public.wump_headings enable row level security;
alter table public.wump_heading_members enable row level security;
revoke all on public.wump_live_shares from anon, authenticated;
revoke all on public.wump_headings from anon, authenticated;
revoke all on public.wump_heading_members from anon, authenticated;
grant select, update on public.wump_live_shares to authenticated;
grant select on public.wump_headings to authenticated;
grant select, update on public.wump_heading_members to authenticated;

create or replace function public.wump_heading_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wump_headings h
    where h.id = p_id
      and (
        h.host_id = (select auth.uid())
        or exists (
          select 1 from public.wump_heading_members m
          where m.heading_id = h.id and m.user_id = (select auth.uid())
        )
      )
  );
$$;
revoke all on function public.wump_heading_visible(uuid) from public, anon;
grant execute on function public.wump_heading_visible(uuid) to authenticated;

drop policy if exists wump_live_shares_own on public.wump_live_shares;
create policy wump_live_shares_own on public.wump_live_shares
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists wump_live_shares_ping on public.wump_live_shares;
create policy wump_live_shares_ping on public.wump_live_shares
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists wump_headings_member_read on public.wump_headings;
create policy wump_headings_member_read on public.wump_headings
  for select to authenticated
  using (public.wump_heading_visible(id));

drop policy if exists wump_heading_members_read on public.wump_heading_members;
create policy wump_heading_members_read on public.wump_heading_members
  for select to authenticated
  using (public.wump_heading_visible(heading_id));

drop policy if exists wump_heading_members_update on public.wump_heading_members;
create policy wump_heading_members_update on public.wump_heading_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.wump_live_share_start(p_label text, p_minutes int, p_lat double precision, p_lng double precision, p_accuracy real)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row public.wump_live_shares;
  mins int := least(240, greatest(15, coalesce(p_minutes, 60)));
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Need a location first';
  end if;
  if (select count(*) from public.wump_live_shares where owner_id = me and not revoked and expires_at > now()) >= 5 then
    raise exception 'You already have 5 live links';
  end if;
  insert into public.wump_live_shares (owner_id, label, lat, lng, accuracy_m, expires_at)
  values (me, nullif(left(btrim(coalesce(p_label, '')), 80), ''), p_lat, p_lng, p_accuracy, now() + make_interval(mins => mins))
  returning * into row;
  return jsonb_build_object('id', row.id, 'token', row.token, 'expires_at', row.expires_at);
end;
$$;

create or replace function public.wump_live_share_ping(p_id uuid, p_lat double precision, p_lng double precision, p_accuracy real)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.wump_live_shares
  set lat = p_lat, lng = p_lng, accuracy_m = p_accuracy
  where id = p_id and owner_id = auth.uid() and not revoked and expires_at > now();
end;
$$;

create or replace function public.wump_live_share_revoke(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.wump_live_shares set revoked = true where id = p_id and owner_id = auth.uid();
end;
$$;

create or replace function public.wump_live_share_open(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  row public.wump_live_shares;
  who text;
begin
  select * into row from public.wump_live_shares
  where token = left(coalesce(p_token, ''), 64) and not revoked and expires_at > now();
  if not found then return jsonb_build_object('ok', false); end if;
  if auth.uid() is not null and public.is_blocked_between(auth.uid(), row.owner_id) then
    return jsonb_build_object('ok', false);
  end if;
  select coalesce(display_name, username) into who from public.profiles where id = row.owner_id;
  return jsonb_build_object(
    'ok', true,
    'label', row.label,
    'name', who,
    'lat', row.lat,
    'lng', row.lng,
    'accuracy_m', row.accuracy_m,
    'expires_at', row.expires_at
  );
end;
$$;

create or replace function public.wump_heading_start(
  p_title text,
  p_lat double precision,
  p_lng double precision,
  p_name text,
  p_minutes int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row public.wump_headings;
  mins int := least(240, greatest(30, coalesce(p_minutes, 120)));
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_lat is null or p_lng is null then raise exception 'Pick a destination'; end if;
  insert into public.wump_headings (host_id, title, dest_lat, dest_lng, dest_name, expires_at)
  values (
    me,
    left(coalesce(nullif(btrim(p_title), ''), 'Heading there'), 80),
    p_lat, p_lng,
    nullif(left(btrim(coalesce(p_name, '')), 160), ''),
    now() + make_interval(mins => mins)
  )
  returning * into row;
  insert into public.wump_heading_members (heading_id, user_id, lat, lng)
  values (row.id, me, p_lat, p_lng);
  return jsonb_build_object('id', row.id, 'token', row.token, 'expires_at', row.expires_at);
end;
$$;

create or replace function public.wump_heading_join(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row public.wump_headings;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select * into row from public.wump_headings
  where token = left(coalesce(p_token, ''), 64) and ended_at is null and expires_at > now();
  if not found then return jsonb_build_object('ok', false); end if;
  if public.is_blocked_between(me, row.host_id) then raise exception 'You cannot join that session'; end if;
  if (select count(*) from public.wump_heading_members where heading_id = row.id) >= 8
     and not exists (select 1 from public.wump_heading_members where heading_id = row.id and user_id = me) then
    raise exception 'This session is full (8 people)';
  end if;
  insert into public.wump_heading_members (heading_id, user_id)
  values (row.id, me)
  on conflict (heading_id, user_id) do nothing;
  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'title', row.title,
    'host_id', row.host_id,
    'dest_lat', row.dest_lat,
    'dest_lng', row.dest_lng,
    'dest_name', row.dest_name,
    'expires_at', row.expires_at
  );
end;
$$;

create or replace function public.wump_heading_ping(
  p_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy real,
  p_eta int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.wump_heading_members
  set lat = p_lat, lng = p_lng, accuracy_m = p_accuracy,
      eta_min = least(1440, greatest(0, coalesce(p_eta, 0))),
      updated_at = now()
  where heading_id = p_id and user_id = auth.uid();
  if not found then raise exception 'Join the session first'; end if;
end;
$$;

create or replace function public.wump_heading_end(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.wump_headings set ended_at = now() where id = p_id and host_id = auth.uid() and ended_at is null;
end;
$$;

create or replace function public.wump_heading_state(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row public.wump_headings;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select * into row from public.wump_headings where id = p_id and ended_at is null and expires_at > now();
  if not found then return jsonb_build_object('ok', false); end if;
  if row.host_id is distinct from me and not exists (
    select 1 from public.wump_heading_members m where m.heading_id = row.id and m.user_id = me
  ) then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'token', row.token,
    'title', row.title,
    'host_id', row.host_id,
    'dest_lat', row.dest_lat,
    'dest_lng', row.dest_lng,
    'dest_name', row.dest_name,
    'expires_at', row.expires_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'username', p.username,
        'display_name', p.display_name,
        'lat', m.lat,
        'lng', m.lng,
        'accuracy_m', m.accuracy_m,
        'eta_min', m.eta_min,
        'updated_at', m.updated_at
      ) order by m.updated_at desc)
      from public.wump_heading_members m
      join public.profiles p on p.id = m.user_id
      where m.heading_id = row.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.wump_live_share_start(text, int, double precision, double precision, real) from public, anon;
revoke all on function public.wump_live_share_ping(uuid, double precision, double precision, real) from public, anon;
revoke all on function public.wump_live_share_revoke(uuid) from public, anon;
revoke all on function public.wump_live_share_open(text) from public;
revoke all on function public.wump_heading_start(text, double precision, double precision, text, int) from public, anon;
revoke all on function public.wump_heading_join(text) from public, anon;
revoke all on function public.wump_heading_ping(uuid, double precision, double precision, real, int) from public, anon;
revoke all on function public.wump_heading_end(uuid) from public, anon;
revoke all on function public.wump_heading_state(uuid) from public, anon;
grant execute on function public.wump_live_share_start(text, int, double precision, double precision, real) to authenticated;
grant execute on function public.wump_live_share_ping(uuid, double precision, double precision, real) to authenticated;
grant execute on function public.wump_live_share_revoke(uuid) to authenticated;
grant execute on function public.wump_live_share_open(text) to anon, authenticated;
grant execute on function public.wump_heading_start(text, double precision, double precision, text, int) to authenticated;
grant execute on function public.wump_heading_join(text) to authenticated;
grant execute on function public.wump_heading_ping(uuid, double precision, double precision, real, int) to authenticated;
grant execute on function public.wump_heading_end(uuid) to authenticated;
grant execute on function public.wump_heading_state(uuid) to authenticated;

alter table public.wump_heading_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.wump_live_shares;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wump_headings;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wump_heading_members;
exception when duplicate_object then null; when undefined_object then null;
end $$;

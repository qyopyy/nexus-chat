-- Opt-in safety check-ins, and saved paths from a trail or heading session.
-- A safety contact must accept the role. A missed check-in notifies only that
-- person. Saved routes stay private until the owner makes an expiring link.

create table if not exists public.wump_safety_contacts (
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);
create index if not exists wump_safety_contacts_contact_idx on public.wump_safety_contacts (contact_id, status);

create table if not exists public.wump_safety_checks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  contact_id   uuid not null references public.profiles (id) on delete cascade,
  note         text check (note is null or char_length(note) between 1 and 140),
  due_at       timestamptz not null,
  status       text not null default 'active' check (status in ('active', 'ok', 'cancelled', 'missed')),
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists wump_safety_checks_user_idx on public.wump_safety_checks (user_id, created_at desc);
create index if not exists wump_safety_checks_contact_idx on public.wump_safety_checks (contact_id, status, due_at);

alter table public.wump_safety_contacts enable row level security;
alter table public.wump_safety_checks enable row level security;
revoke all on public.wump_safety_contacts from anon, authenticated;
revoke all on public.wump_safety_checks from anon, authenticated;
grant select, delete on public.wump_safety_contacts to authenticated;
grant select on public.wump_safety_checks to authenticated;

drop policy if exists wump_safety_contacts_read on public.wump_safety_contacts;
create policy wump_safety_contacts_read on public.wump_safety_contacts
  for select to authenticated
  using (owner_id = (select auth.uid()) or contact_id = (select auth.uid()));

drop policy if exists wump_safety_contacts_delete on public.wump_safety_contacts;
create policy wump_safety_contacts_delete on public.wump_safety_contacts
  for delete to authenticated
  using (owner_id = (select auth.uid()) or contact_id = (select auth.uid()));

drop policy if exists wump_safety_checks_read on public.wump_safety_checks;
create policy wump_safety_checks_read on public.wump_safety_checks
  for select to authenticated
  using (user_id = (select auth.uid()) or contact_id = (select auth.uid()));

create or replace function public.wump_safety_invite(p_contact uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_contact is null or p_contact = auth.uid() then
    raise exception 'Pick someone else';
  end if;
  if not public.are_friends(auth.uid(), p_contact) then
    raise exception 'Safety contacts have to be friends first';
  end if;
  insert into public.wump_safety_contacts (owner_id, contact_id, status)
  values (auth.uid(), p_contact, 'pending')
  on conflict (owner_id, contact_id) do update
    set status = case
      when public.wump_safety_contacts.status = 'accepted' then 'accepted'
      else 'pending'
    end,
    created_at = case
      when public.wump_safety_contacts.status = 'accepted' then public.wump_safety_contacts.created_at
      else now()
    end;
end;
$$;

create or replace function public.wump_safety_respond(p_owner uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  update public.wump_safety_contacts
  set status = case when p_accept then 'accepted' else 'declined' end
  where owner_id = p_owner and contact_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending request';
  end if;
end;
$$;

create or replace function public.wump_safety_start(p_contact uuid, p_due timestamptz, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  note text := nullif(left(btrim(coalesce(p_note, '')), 140), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_due < now() + interval '5 minutes' or p_due > now() + interval '12 hours' then
    raise exception 'Pick a check-in between 5 minutes and 12 hours from now';
  end if;
  if not exists (
    select 1 from public.wump_safety_contacts
    where owner_id = auth.uid() and contact_id = p_contact and status = 'accepted'
  ) then
    raise exception 'That person has not accepted being a safety contact';
  end if;
  if exists (
    select 1 from public.wump_safety_checks
    where user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'You already have a check-in running';
  end if;
  insert into public.wump_safety_checks (user_id, contact_id, note, due_at)
  values (auth.uid(), p_contact, note, p_due)
  returning wump_safety_checks.id into rid;
  return rid;
end;
$$;

create or replace function public.wump_safety_resolve(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('ok', 'cancelled') then
    raise exception 'Check in or cancel';
  end if;
  update public.wump_safety_checks
  set status = p_status
  where id = p_id and user_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'No active check-in';
  end if;
end;
$$;

create or replace function public.wump_safety_mark_overdue(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  row record;
  n int := 0;
  who text;
  body text;
begin
  for row in
    select c.*
    from public.wump_safety_checks c
    where c.status = 'active'
      and c.due_at <= now()
      and (p_user is null or c.user_id = p_user or c.contact_id = p_user)
    for update
  loop
    update public.wump_safety_checks
    set status = 'missed', notified_at = now()
    where id = row.id and status = 'active';
    if not found then
      continue;
    end if;
    select coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Someone')
      into who
    from public.profiles p
    where p.id = row.user_id;
    body := who || ' said they would check in by '
      || to_char(row.due_at at time zone 'utc', 'HH24:MI') || ' UTC and has not.';
    if row.note is not null then
      body := left(body || ' ' || row.note, 240);
    end if;
    insert into public.notification_inbox (user_id, kind, title, body, actor_id, meta)
    values (
      row.contact_id,
      'safety',
      'Missed check-in',
      body,
      row.user_id,
      jsonb_build_object('check_id', row.id)
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.wump_safety_sweep()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return 0;
  end if;
  return public.wump_safety_mark_overdue(auth.uid());
end;
$$;

create or replace function public.wump_safety_sweep_all()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.wump_safety_mark_overdue(null);
end;
$$;

revoke all on function public.wump_safety_invite(uuid) from public, anon;
revoke all on function public.wump_safety_respond(uuid, boolean) from public, anon;
revoke all on function public.wump_safety_start(uuid, timestamptz, text) from public, anon;
revoke all on function public.wump_safety_resolve(uuid, text) from public, anon;
revoke all on function public.wump_safety_mark_overdue(uuid) from public, anon, authenticated;
revoke all on function public.wump_safety_sweep() from public, anon;
revoke all on function public.wump_safety_sweep_all() from public, anon, authenticated;
grant execute on function public.wump_safety_invite(uuid) to authenticated;
grant execute on function public.wump_safety_respond(uuid, boolean) to authenticated;
grant execute on function public.wump_safety_start(uuid, timestamptz, text) to authenticated;
grant execute on function public.wump_safety_resolve(uuid, text) to authenticated;
grant execute on function public.wump_safety_sweep() to authenticated;

do $$
begin
  perform cron.schedule('nexus-safety-sweep', '* * * * *', 'select public.wump_safety_sweep_all()');
exception
  when undefined_table or undefined_function or invalid_schema_name or insufficient_privilege or unique_violation then
    null;
end $$;

-- ------------------------------------------------------------------ saved routes

create table if not exists public.wump_routes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  source     text not null check (source in ('trail', 'heading')),
  points     jsonb not null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(points) = 'array')
);
create index if not exists wump_routes_user_idx on public.wump_routes (user_id, created_at desc);

create table if not exists public.wump_route_links (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid not null references public.wump_routes (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  expires_at timestamptz not null,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists wump_route_links_user_idx on public.wump_route_links (user_id, created_at desc);

alter table public.wump_routes enable row level security;
alter table public.wump_route_links enable row level security;
revoke all on public.wump_routes from anon, authenticated;
revoke all on public.wump_route_links from anon, authenticated;
grant select, delete on public.wump_routes to authenticated;
grant select on public.wump_route_links to authenticated;

drop policy if exists wump_routes_own on public.wump_routes;
create policy wump_routes_own on public.wump_routes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wump_routes_delete on public.wump_routes;
create policy wump_routes_delete on public.wump_routes
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wump_route_links_own on public.wump_route_links;
create policy wump_route_links_own on public.wump_route_links
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.wump_route_save(p_title text, p_source text, p_points jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item jsonb;
  cleaned jsonb := '[]'::jsonb;
  n int := 0;
  lat double precision;
  lng double precision;
  rid uuid;
  title text := left(btrim(coalesce(p_title, '')), 80);
begin
  if me is null then
    raise exception 'Sign in required';
  end if;
  if p_source not in ('trail', 'heading') then
    raise exception 'Save a trail or a heading-there path';
  end if;
  if title = '' then
    title := case when p_source = 'trail' then 'Trail' else 'Heading there' end;
  end if;
  if jsonb_typeof(p_points) is distinct from 'array' then
    raise exception 'A path needs at least two points';
  end if;
  for item in select value from jsonb_array_elements(p_points)
  loop
    begin
      lat := (item->>'lat')::double precision;
      lng := (item->>'lng')::double precision;
    exception when others then
      continue;
    end;
    if lat is null or lng is null or lat < -90 or lat > 90 or lng < -180 or lng > 180 then
      continue;
    end if;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object(
      'lat', round(lat::numeric, 5),
      'lng', round(lng::numeric, 5)
    ));
    n := n + 1;
    exit when n >= 300;
  end loop;
  if n < 2 then
    raise exception 'A path needs at least two points';
  end if;
  if (select count(*) from public.wump_routes where user_id = me) >= 30 then
    raise exception 'You can keep 30 saved paths. Delete one first.';
  end if;
  insert into public.wump_routes (user_id, title, source, points)
  values (me, title, p_source, cleaned)
  returning wump_routes.id into rid;
  return rid;
end;
$$;

create or replace function public.wump_route_share(p_route uuid, p_minutes int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.wump_route_links;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_minutes not in (60, 1440, 10080) then
    raise exception 'Share for 1 hour, 1 day, or 7 days';
  end if;
  if not exists (select 1 from public.wump_routes r where r.id = p_route and r.user_id = auth.uid()) then
    raise exception 'Not your path';
  end if;
  if (select count(*) from public.wump_route_links l where l.route_id = p_route and not l.revoked and l.expires_at > now()) >= 5 then
    raise exception 'This path already has 5 live links';
  end if;
  insert into public.wump_route_links (route_id, user_id, expires_at)
  values (p_route, auth.uid(), now() + make_interval(mins => p_minutes))
  returning * into row;
  return jsonb_build_object('id', row.id, 'token', row.token, 'expires_at', row.expires_at);
end;
$$;

create or replace function public.wump_route_revoke(p_link uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.wump_route_links
  set revoked = true
  where id = p_link and user_id = auth.uid();
end;
$$;

create or replace function public.wump_route_open(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.wump_route_links;
  route public.wump_routes;
begin
  select * into link from public.wump_route_links
  where token = p_token and not revoked and expires_at > now();
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  select * into route from public.wump_routes where id = link.route_id;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'title', route.title,
    'source', route.source,
    'points', route.points,
    'expires_at', link.expires_at
  );
end;
$$;

revoke all on function public.wump_route_save(text, text, jsonb) from public, anon;
revoke all on function public.wump_route_share(uuid, int) from public, anon;
revoke all on function public.wump_route_revoke(uuid) from public, anon;
revoke all on function public.wump_route_open(text) from public;
grant execute on function public.wump_route_save(text, text, jsonb) to authenticated;
grant execute on function public.wump_route_share(uuid, int) to authenticated;
grant execute on function public.wump_route_revoke(uuid) to authenticated;
grant execute on function public.wump_route_open(text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.wump_safety_checks;
exception when duplicate_object then null; when undefined_object then null;
end $$;

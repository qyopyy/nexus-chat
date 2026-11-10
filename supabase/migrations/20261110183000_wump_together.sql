-- Wump together: richer presence, opt-in trails, place arrive/leave alerts,
-- meetup + ETA, and map nudges.
--
-- Privacy:
--   * Trail points store the already-fuzzed Live pin (same precision as bump_publish),
--     never a finer GPS sample. Recording is off until the user opts in.
--   * Friends see a trail only while the owner is Live, sharing is on, and
--     wump_share_trail is on. Changing precision or turning recording off deletes the trail.
--   * City precision skips home/work matching and arrive/leave alerts (the pin is too coarse).
--   * Arrive/leave messages go only to friends, family, and group members who can
--     already see the Live pin, and they name the place — they do not include coordinates.
--   * Meetups are visible only to the host and people they invited.
--   * Nudges are friend-only and rate-limited.

-- ------------------------------------------------------------------ presence columns
alter table public.bump_presence
  add column if not exists activity text,
  add column if not exists place_status text;

alter table public.bump_presence drop constraint if exists bump_presence_activity_check;
alter table public.bump_presence
  add constraint bump_presence_activity_check
  check (activity is null or activity in ('still', 'walk', 'bike', 'drive'));

alter table public.bump_presence drop constraint if exists bump_presence_place_status_check;
alter table public.bump_presence
  add constraint bump_presence_place_status_check
  check (place_status is null or place_status in ('home', 'work', 'school'));

comment on column public.bump_presence.activity is 'still / walk / bike / drive, derived from speed on publish';
comment on column public.bump_presence.place_status is 'home / work / school when the fuzzed pin is inside that saved place';

-- ------------------------------------------------------------------ privacy prefs
alter table public.user_privacy
  add column if not exists wump_record_trail boolean not null default false,
  add column if not exists wump_share_trail boolean not null default false,
  add column if not exists wump_onboarded_at timestamptz;

comment on column public.user_privacy.wump_record_trail is 'Store this user''s fuzzed Live pin as a 48h trail';
comment on column public.user_privacy.wump_share_trail is 'Friends who can see the Live pin may read the recent trail';
comment on column public.user_privacy.wump_onboarded_at is 'When the Wump first-run sheet was finished or skipped';

-- ------------------------------------------------------------------ saved-place role + alerts
alter table public.wump_saved_places
  add column if not exists role text,
  add column if not exists alert_arrive boolean not null default false,
  add column if not exists alert_leave boolean not null default false,
  add column if not exists share_moves boolean not null default false,
  add column if not exists alert_radius_m integer not null default 150;

alter table public.wump_saved_places drop constraint if exists wump_saved_places_role_check;
alter table public.wump_saved_places
  add constraint wump_saved_places_role_check
  check (role is null or role in ('home', 'work', 'school'));

alter table public.wump_saved_places drop constraint if exists wump_saved_places_alert_radius_check;
alter table public.wump_saved_places
  add constraint wump_saved_places_alert_radius_check
  check (alert_radius_m between 80 and 800);

create unique index if not exists wump_saved_places_role_uidx
  on public.wump_saved_places (user_id, role)
  where role is not null;

create index if not exists wump_saved_places_alerts_idx
  on public.wump_saved_places (user_id)
  where alert_arrive or alert_leave;

-- ------------------------------------------------------------------ helpers
create or replace function public.wump_meters(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371000 * 2 * asin(least(1::double precision, sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )))
  end;
$$;

revoke all on function public.wump_meters(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- Visibility without the auth.uid() lock in bump_can_see, so a definer trigger
-- can ask "can this friend see the publisher?" Caller must not be granted to clients.
create or replace function public.wump_presence_visible_to(target uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target is null or viewer is null or target = viewer then false
    when not exists (
      select 1 from public.bump_presence p
      where p.user_id = target
        and p.updated_at > now() - interval '20 minutes'
        and (p.expires_at is null or p.expires_at > now())
    ) then false
    when exists (
      select 1 from public.bump_group_members a
      join public.bump_group_members b on a.group_id = b.group_id
      where a.user_id = target and b.user_id = viewer
    ) then true
    when (select p.visible from public.bump_presence p where p.user_id = target) = 'everyone' then true
    when (select p.visible from public.bump_presence p where p.user_id = target) = 'family' then exists (
      select 1 from public.bump_family f
      where (f.user_id = target and f.member_id = viewer)
         or (f.user_id = viewer and f.member_id = target)
    )
    when (select p.visible from public.bump_presence p where p.user_id = target) = 'friends' then
      exists (
        select 1 from public.friendships fr
        where fr.status = 'accepted'
          and ((fr.requester_id = target and fr.addressee_id = viewer)
            or (fr.requester_id = viewer and fr.addressee_id = target))
      )
      or exists (
        select 1 from public.bump_family f
        where (f.user_id = target and f.member_id = viewer)
           or (f.user_id = viewer and f.member_id = target)
      )
    else false
  end;
$$;

revoke all on function public.wump_presence_visible_to(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ trail + alerts + nudges + meetups
create table if not exists public.wump_trail_points (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  activity text,
  recorded_at timestamptz not null default now(),
  check (lat between -90 and 90),
  check (lng between -180 and 180),
  check (activity is null or activity in ('still', 'walk', 'bike', 'drive'))
);
create index if not exists wump_trail_points_user_idx
  on public.wump_trail_points (user_id, recorded_at desc);

create table if not exists public.wump_place_inside (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.wump_saved_places (id) on delete cascade,
  inside boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table if not exists public.wump_place_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id uuid references public.wump_saved_places (id) on delete set null,
  place_name text not null,
  kind text not null check (kind in ('arrive', 'leave')),
  created_at timestamptz not null default now()
);
create index if not exists wump_place_events_user_idx
  on public.wump_place_events (user_id, created_at desc);

create table if not exists public.wump_nudges (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('wave', 'poke', 'heart', 'hurry', 'coffee', 'here')),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  check (from_id <> to_id)
);
create index if not exists wump_nudges_to_idx on public.wump_nudges (to_id, created_at desc);
create index if not exists wump_nudges_from_pair_idx on public.wump_nudges (from_id, to_id, created_at desc);

create table if not exists public.wump_meetups (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  note text check (note is null or char_length(note) <= 280),
  place_name text check (place_name is null or char_length(place_name) <= 160),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours'),
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create index if not exists wump_meetups_host_idx on public.wump_meetups (host_id, expires_at desc);

create table if not exists public.wump_meetup_rsvps (
  meetup_id uuid not null references public.wump_meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'going', 'maybe', 'no')),
  eta_min smallint check (eta_min is null or (eta_min between 0 and 1440)),
  updated_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);
create index if not exists wump_meetup_rsvps_user_idx on public.wump_meetup_rsvps (user_id, meetup_id);

alter table public.wump_trail_points enable row level security;
alter table public.wump_place_inside enable row level security;
alter table public.wump_place_events enable row level security;
alter table public.wump_nudges enable row level security;
alter table public.wump_meetups enable row level security;
alter table public.wump_meetup_rsvps enable row level security;

revoke all on public.wump_trail_points from anon, public;
revoke all on public.wump_place_inside from anon, public;
revoke all on public.wump_place_events from anon, public;
revoke all on public.wump_nudges from anon, public;
revoke all on public.wump_meetups from anon, public;
revoke all on public.wump_meetup_rsvps from anon, public;

drop policy if exists wump_trail_points_own on public.wump_trail_points;
create policy wump_trail_points_own on public.wump_trail_points
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wump_place_inside_own on public.wump_place_inside;
create policy wump_place_inside_own on public.wump_place_inside
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wump_place_events_own on public.wump_place_events;
create policy wump_place_events_own on public.wump_place_events
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wump_nudges_select on public.wump_nudges;
create policy wump_nudges_select on public.wump_nudges
  for select to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()));

drop policy if exists wump_nudges_seen on public.wump_nudges;
create policy wump_nudges_seen on public.wump_nudges
  for update to authenticated
  using (to_id = (select auth.uid()))
  with check (to_id = (select auth.uid()));

create or replace function public.wump_in_meetup(p_meetup uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (
      select 1 from public.wump_meetups m
      where m.id = p_meetup and m.host_id = (select auth.uid())
    )
    or exists (
      select 1 from public.wump_meetup_rsvps r
      where r.meetup_id = p_meetup and r.user_id = (select auth.uid())
    )
  );
$$;

revoke all on function public.wump_in_meetup(uuid) from public, anon;
grant execute on function public.wump_in_meetup(uuid) to authenticated;

drop policy if exists wump_meetups_select on public.wump_meetups;
create policy wump_meetups_select on public.wump_meetups
  for select to authenticated
  using ((select public.wump_in_meetup(id)));

drop policy if exists wump_meetup_rsvps_select on public.wump_meetup_rsvps;
create policy wump_meetup_rsvps_select on public.wump_meetup_rsvps
  for select to authenticated
  using ((select public.wump_in_meetup(meetup_id)));

grant select on public.wump_trail_points to authenticated;
grant select on public.wump_place_inside to authenticated;
grant select on public.wump_place_events to authenticated;
grant select on public.wump_meetups to authenticated;
grant select on public.wump_meetup_rsvps to authenticated;
grant select, update (seen_at) on public.wump_nudges to authenticated;

-- ------------------------------------------------------------------ enrich pin (activity + home/work/school)
create or replace function public.wump_presence_enrich()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prec text := 'approx';
begin
  new.activity := case
    when new.speed_mps is null or new.speed_mps < 0.6 then 'still'
    when new.speed_mps < 2.2 then 'walk'
    when new.speed_mps < 8 then 'bike'
    else 'drive'
  end;

  begin
    select coalesce(up.wump_precision, 'approx') into prec
    from public.user_privacy up
    where up.user_id = new.user_id;
  exception when others then
    prec := 'approx';
  end;

  if prec = 'city' then
    new.place_status := null;
  else
    begin
      select sp.role into new.place_status
      from public.wump_saved_places sp
      where sp.user_id = new.user_id
        and sp.role in ('home', 'work', 'school')
        and public.wump_meters(sp.lat, sp.lng, new.lat, new.lng) <= 180
      order by public.wump_meters(sp.lat, sp.lng, new.lat, new.lng)
      limit 1;
    exception when others then
      new.place_status := null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.wump_presence_enrich() from public, anon, authenticated;

drop trigger if exists wump_presence_enrich on public.bump_presence;
create trigger wump_presence_enrich
  before insert or update on public.bump_presence
  for each row execute function public.wump_presence_enrich();

-- ------------------------------------------------------------------ trail + arrive/leave (never fails the Live publish)
create or replace function public.wump_presence_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prec text := 'approx';
  record_trail boolean := false;
  last_lat double precision;
  last_lng double precision;
  last_at timestamptz;
  sp record;
  prev boolean;
  dist double precision;
  arrive_r integer;
  inside_now boolean;
  who text;
  emoji text;
  body text;
  kind text;
  viewer uuid;
  sent integer;
begin
  select coalesce(up.wump_precision, 'approx'), coalesce(up.wump_record_trail, false)
    into prec, record_trail
  from public.user_privacy up
  where up.user_id = new.user_id;

  if record_trail then
    select t.lat, t.lng, t.recorded_at
      into last_lat, last_lng, last_at
    from public.wump_trail_points t
    where t.user_id = new.user_id
    order by t.recorded_at desc
    limit 1;

    if last_lat is null
       or public.wump_meters(last_lat, last_lng, new.lat, new.lng) >= 40
       or last_at < now() - interval '3 minutes' then
      insert into public.wump_trail_points (user_id, lat, lng, activity, recorded_at)
      values (new.user_id, new.lat, new.lng, new.activity, now());

      delete from public.wump_trail_points
      where user_id = new.user_id
        and recorded_at < now() - interval '48 hours';

      delete from public.wump_trail_points
      where user_id = new.user_id
        and id in (
          select id from public.wump_trail_points
          where user_id = new.user_id
          order by recorded_at desc
          offset 400
        );
    end if;
  end if;

  if prec = 'city' then
    return new;
  end if;

  select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'A friend')
    into who
  from public.profiles p
  where p.id = new.user_id;
  who := coalesce(who, 'A friend');

  for sp in
    select s.id, s.name, s.role, s.lat, s.lng, s.alert_arrive, s.alert_leave, s.share_moves, s.alert_radius_m
    from public.wump_saved_places s
    where s.user_id = new.user_id
      and (s.alert_arrive or s.alert_leave)
  loop
    select i.inside into prev
    from public.wump_place_inside i
    where i.user_id = new.user_id and i.place_id = sp.id;

    dist := public.wump_meters(sp.lat, sp.lng, new.lat, new.lng);
    arrive_r := greatest(80, least(coalesce(sp.alert_radius_m, 150), 800));
    if prev is true then
      inside_now := dist <= (arrive_r + 80);
    else
      inside_now := dist <= arrive_r;
    end if;

    if prev is null then
      insert into public.wump_place_inside (user_id, place_id, inside, updated_at)
      values (new.user_id, sp.id, inside_now, now())
      on conflict (user_id, place_id) do nothing;
      continue;
    end if;

    update public.wump_place_inside
      set inside = inside_now, updated_at = now()
      where user_id = new.user_id
        and place_id = sp.id
        and inside is distinct from inside_now;
    if not found then
      continue;
    end if;

    kind := case when inside_now then 'arrive' else 'leave' end;
    if kind = 'arrive' and not sp.alert_arrive then continue; end if;
    if kind = 'leave' and not sp.alert_leave then continue; end if;

    emoji := case sp.role
      when 'home' then '🏠'
      when 'work' then '💼'
      when 'school' then '🎓'
      else '📍'
    end;

    insert into public.wump_place_events (user_id, place_id, place_name, kind)
    values (new.user_id, sp.id, left(sp.name, 160), kind);

    insert into public.notification_inbox (user_id, kind, title, body, actor_id, meta)
    values (
      new.user_id,
      'wump_place',
      case when kind = 'arrive' then 'Arrived' else 'Left' end,
      emoji || ' ' || left(sp.name, 120),
      new.user_id,
      jsonb_build_object('place_id', sp.id, 'kind', kind)
    );

    if sp.share_moves then
      body := emoji || ' ' || who || case when kind = 'arrive' then ' arrived at ' else ' left ' end || left(sp.name, 80);
      sent := 0;
      for viewer in
        select distinct people.viewer
        from (
          select case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end as viewer
          from public.friendships f
          where f.status = 'accepted'
            and (f.requester_id = new.user_id or f.addressee_id = new.user_id)
          union
          select case when fam.user_id = new.user_id then fam.member_id else fam.user_id end
          from public.bump_family fam
          where fam.user_id = new.user_id or fam.member_id = new.user_id
          union
          select b.user_id
          from public.bump_group_members a
          join public.bump_group_members b on a.group_id = b.group_id and b.user_id <> new.user_id
          where a.user_id = new.user_id
        ) people
        where people.viewer is not null
          and public.wump_presence_visible_to(new.user_id, people.viewer)
        limit 40
      loop
        insert into public.bump_messages (sender_id, recipient_id, body)
        values (new.user_id, viewer, left(body, 1000));
        sent := sent + 1;
      end loop;
    end if;
  end loop;

  return new;
exception when others then
  raise warning 'wump presence side effect skipped: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.wump_presence_effects() from public, anon, authenticated;

drop trigger if exists wump_presence_effects on public.bump_presence;
create trigger wump_presence_effects
  after insert or update on public.bump_presence
  for each row execute function public.wump_presence_effects();

create or replace function public.wump_privacy_trail_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.wump_share_trail and not new.wump_record_trail then
    new.wump_record_trail := true;
  end if;
  if new.wump_precision is distinct from old.wump_precision
     or (old.wump_record_trail is true and new.wump_record_trail is not true) then
    delete from public.wump_trail_points where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.wump_privacy_trail_guard() from public, anon, authenticated;

drop trigger if exists wump_privacy_trail_guard on public.user_privacy;
create trigger wump_privacy_trail_guard
  before update on public.user_privacy
  for each row execute function public.wump_privacy_trail_guard();

-- ------------------------------------------------------------------ trail RPCs
create or replace function public.wump_my_trail(p_hours integer default 24)
returns table (lat double precision, lng double precision, activity text, recorded_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.lat, t.lng, t.activity, t.recorded_at
  from public.wump_trail_points t
  where t.user_id = (select auth.uid())
    and t.recorded_at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 48))
  order by t.recorded_at asc
  limit 400;
$$;

revoke all on function public.wump_my_trail(integer) from public, anon;
grant execute on function public.wump_my_trail(integer) to authenticated;

create or replace function public.wump_friend_trail(p_user uuid, p_hours integer default 6)
returns table (lat double precision, lng double precision, activity text, recorded_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hours integer := least(greatest(coalesce(p_hours, 6), 1), 12);
begin
  if me is null or p_user is null or p_user = me then
    return;
  end if;
  if not exists (
    select 1 from public.user_privacy up
    where up.user_id = p_user and up.wump_share_trail and up.wump_record_trail
  ) then
    return;
  end if;
  if not public.wump_presence_visible_to(p_user, me) then
    return;
  end if;
  return query
    select t.lat, t.lng, t.activity, t.recorded_at
    from public.wump_trail_points t
    where t.user_id = p_user
      and t.recorded_at > now() - make_interval(hours => hours)
    order by t.recorded_at asc
    limit 240;
end;
$$;

revoke all on function public.wump_friend_trail(uuid, integer) from public, anon;
grant execute on function public.wump_friend_trail(uuid, integer) to authenticated;

create or replace function public.wump_clear_trail()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.wump_trail_points where user_id = me;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.wump_clear_trail() from public, anon;
grant execute on function public.wump_clear_trail() to authenticated;

-- ------------------------------------------------------------------ place watch
create or replace function public.wump_set_place_watch(
  p_place uuid,
  p_role text,
  p_arrive boolean,
  p_leave boolean,
  p_share boolean,
  p_radius integer default null
)
returns public.wump_saved_places
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  next_role text := nullif(lower(btrim(coalesce(p_role, ''))), '');
  row public.wump_saved_places;
  rad integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if next_role is not null and next_role not in ('home', 'work', 'school') then
    raise exception 'role must be home, work, school, or empty';
  end if;
  if not exists (select 1 from public.wump_saved_places s where s.id = p_place and s.user_id = me) then
    raise exception 'place not found';
  end if;

  if next_role is not null then
    update public.wump_saved_places
      set "role" = null
      where user_id = me and "role" = next_role and id <> p_place;
  end if;

  rad := case
    when p_radius is null then null
    else greatest(80, least(p_radius, 800))
  end;

  update public.wump_saved_places s set
    "role" = next_role,
    alert_arrive = coalesce(p_arrive, false),
    alert_leave = coalesce(p_leave, false),
    share_moves = (coalesce(p_share, false) and (coalesce(p_arrive, false) or coalesce(p_leave, false))),
    alert_radius_m = coalesce(rad, s.alert_radius_m)
  where s.id = p_place and s.user_id = me
  returning * into row;

  -- forget the previous inside/outside so the next Live fix re-baselines quietly
  delete from public.wump_place_inside where place_id = p_place and user_id = me;
  return row;
end;
$$;

revoke all on function public.wump_set_place_watch(uuid, text, boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.wump_set_place_watch(uuid, text, boolean, boolean, boolean, integer) to authenticated;

create or replace function public.wump_place_events(p_limit integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
  from (
    select ev.id, ev.place_id, ev.place_name, ev.kind, ev.created_at
    from public.wump_place_events ev
    where ev.user_id = (select auth.uid())
    order by ev.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) e;
$$;

revoke all on function public.wump_place_events(integer) from public, anon;
grant execute on function public.wump_place_events(integer) to authenticated;

-- ------------------------------------------------------------------ meetups
create or replace function public.wump_create_meetup(
  p_title text,
  p_lat double precision,
  p_lng double precision,
  p_place_name text default null,
  p_note text default null,
  p_starts_at timestamptz default null,
  p_invite uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  mid uuid;
  starts timestamptz;
  exp timestamptz;
  title text;
  friend uuid;
  invited integer := 0;
  who text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  title := nullif(btrim(coalesce(p_title, '')), '');
  if title is null then raise exception 'Give the meetup a name'; end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Pick a spot on the map';
  end if;
  if coalesce(array_length(p_invite, 1), 0) > 30 then
    raise exception 'Invite up to 30 friends';
  end if;

  starts := coalesce(p_starts_at, now());
  if starts < now() - interval '5 minutes' then starts := now(); end if;
  if starts > now() + interval '7 days' then starts := now() + interval '7 days'; end if;
  exp := starts + interval '6 hours';
  if exp > now() + interval '7 days' then exp := now() + interval '7 days'; end if;
  if exp <= starts then exp := starts + interval '6 hours'; end if;

  insert into public.wump_meetups (host_id, title, note, place_name, lat, lng, starts_at, expires_at)
  values (
    me,
    left(title, 80),
    nullif(left(btrim(coalesce(p_note, '')), 280), ''),
    nullif(left(btrim(coalesce(p_place_name, '')), 160), ''),
    p_lat,
    p_lng,
    starts,
    exp
  )
  returning id into mid;

  insert into public.wump_meetup_rsvps (meetup_id, user_id, status)
  values (mid, me, 'going');

  select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'A friend')
    into who
  from public.profiles p where p.id = me;

  if p_invite is not null then
    foreach friend in array p_invite loop
      if friend is null or friend = me or not public.bump_is_friend(me, friend) then
        continue;
      end if;
      insert into public.wump_meetup_rsvps (meetup_id, user_id, status)
      values (mid, friend, 'invited')
      on conflict do nothing;
      if found then
        insert into public.bump_messages (sender_id, recipient_id, body)
        values (
          me,
          friend,
          left('📍 ' || coalesce(who, 'A friend') || ' invited you to ' || left(title, 80)
            || coalesce(' · ' || nullif(left(btrim(coalesce(p_place_name, '')), 80), ''), '')
            || E'\nwump-meetup:' || mid::text, 1000)
        );
        invited := invited + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object('id', mid, 'invited', invited, 'expires_at', exp);
end;
$$;

revoke all on function public.wump_create_meetup(text, double precision, double precision, text, text, timestamptz, uuid[]) from public, anon;
grant execute on function public.wump_create_meetup(text, double precision, double precision, text, text, timestamptz, uuid[]) to authenticated;

create or replace function public.wump_rsvp_meetup(p_meetup uuid, p_status text, p_eta integer default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  st text := lower(btrim(coalesce(p_status, '')));
  eta smallint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if st not in ('going', 'maybe', 'no', 'invited') then
    raise exception 'status must be going, maybe, or no';
  end if;
  if not public.wump_in_meetup(p_meetup) then
    raise exception 'meetup not found';
  end if;
  if not exists (select 1 from public.wump_meetups m where m.id = p_meetup and m.expires_at > now()) then
    raise exception 'That meetup has ended';
  end if;
  eta := case
    when p_eta is null then null
    else greatest(0, least(p_eta, 1440))::smallint
  end;
  insert into public.wump_meetup_rsvps (meetup_id, user_id, status, eta_min, updated_at)
  values (p_meetup, me, st, eta, now())
  on conflict (meetup_id, user_id) do update
    set status = excluded.status,
        eta_min = coalesce(excluded.eta_min, public.wump_meetup_rsvps.eta_min),
        updated_at = now();
  return true;
end;
$$;

revoke all on function public.wump_rsvp_meetup(uuid, text, integer) from public, anon;
grant execute on function public.wump_rsvp_meetup(uuid, text, integer) to authenticated;

create or replace function public.wump_share_meetup_eta(p_meetup uuid)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  mlat double precision;
  mlng double precision;
  plat double precision;
  plng double precision;
  spd double precision;
  meters double precision;
  mins smallint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.wump_in_meetup(p_meetup) then raise exception 'meetup not found'; end if;
  select m.lat, m.lng into mlat, mlng from public.wump_meetups m where m.id = p_meetup and m.expires_at > now();
  if mlat is null then raise exception 'That meetup has ended'; end if;
  select p.lat, p.lng, p.speed_mps into plat, plng, spd
  from public.bump_presence p
  where p.user_id = me
    and p.updated_at > now() - interval '20 minutes'
    and (p.expires_at is null or p.expires_at > now());
  if plat is null then raise exception 'Go Live so Wump can estimate your ETA'; end if;

  meters := public.wump_meters(plat, plng, mlat, mlng);
  if spd is not null and spd > 1.2 then
    spd := least(spd, 28);
  else
    spd := 1.35;
  end if;
  mins := least(1440, greatest(1, ceil(meters / spd / 60.0)))::smallint;

  insert into public.wump_meetup_rsvps (meetup_id, user_id, status, eta_min, updated_at)
  values (p_meetup, me, 'going', mins, now())
  on conflict (meetup_id, user_id) do update
    set status = case when public.wump_meetup_rsvps.status = 'no' then 'going' else 'going' end,
        eta_min = excluded.eta_min,
        updated_at = now();
  return mins;
end;
$$;

revoke all on function public.wump_share_meetup_eta(uuid) from public, anon;
grant execute on function public.wump_share_meetup_eta(uuid) to authenticated;

create or replace function public.wump_cancel_meetup(p_meetup uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.wump_meetups
    set expires_at = now()
    where id = p_meetup and host_id = me and expires_at > now();
  return found;
end;
$$;

revoke all on function public.wump_cancel_meetup(uuid) from public, anon;
grant execute on function public.wump_cancel_meetup(uuid) to authenticated;

create or replace function public.wump_list_meetups()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at), '[]'::jsonb)
  from (
    select
      m.id,
      m.host_id,
      m.title,
      m.note,
      m.place_name,
      m.lat,
      m.lng,
      m.starts_at,
      m.expires_at,
      mine.status as my_status,
      mine.eta_min as my_eta_min,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', r.user_id,
          'status', r.status,
          'eta_min', r.eta_min
        ) order by r.updated_at)
        from public.wump_meetup_rsvps r
        where r.meetup_id = m.id
      ), '[]'::jsonb) as members
    from public.wump_meetups m
    join public.wump_meetup_rsvps mine on mine.meetup_id = m.id and mine.user_id = (select auth.uid())
    where m.expires_at > now()
    order by m.starts_at
    limit 30
  ) x;
$$;

revoke all on function public.wump_list_meetups() from public, anon;
grant execute on function public.wump_list_meetups() to authenticated;

-- ------------------------------------------------------------------ nudges
create or replace function public.wump_nudge(p_to uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  kind text := lower(btrim(coalesce(p_kind, '')));
  emoji text;
  label text;
  nid bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_to is null or p_to = me then raise exception 'Pick a friend'; end if;
  if kind not in ('wave', 'poke', 'heart', 'hurry', 'coffee', 'here') then
    raise exception 'unknown nudge';
  end if;
  if not public.bump_is_friend(me, p_to) then
    raise exception 'You can nudge friends';
  end if;
  if (
    select count(*) from public.wump_nudges n
    where n.from_id = me and n.to_id = p_to and n.created_at > now() - interval '1 hour'
  ) >= 12 then
    raise exception 'Easy — too many nudges to this friend this hour';
  end if;
  if (
    select count(*) from public.wump_nudges n
    where n.from_id = me and n.created_at > now() - interval '1 hour'
  ) >= 40 then
    raise exception 'Nudge limit reached for this hour';
  end if;

  emoji := case kind
    when 'wave' then '👋'
    when 'poke' then '👉'
    when 'heart' then '❤️'
    when 'hurry' then '⚡'
    when 'coffee' then '☕'
    when 'here' then '📍'
    else '👋'
  end;
  label := case kind
    when 'wave' then 'Wave'
    when 'poke' then 'Poke'
    when 'heart' then 'Heart'
    when 'hurry' then 'Hurry up'
    when 'coffee' then 'Coffee?'
    when 'here' then 'I''m here'
    else 'Nudge'
  end;

  insert into public.wump_nudges (from_id, to_id, kind)
  values (me, p_to, kind)
  returning id into nid;

  insert into public.bump_messages (sender_id, recipient_id, body)
  values (me, p_to, left(emoji || ' ' || label || ' — on Wump', 1000));

  return jsonb_build_object('id', nid, 'kind', kind, 'emoji', emoji);
end;
$$;

revoke all on function public.wump_nudge(uuid, text) from public, anon;
grant execute on function public.wump_nudge(uuid, text) to authenticated;

create or replace function public.wump_unseen_nudges()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
  from (
    select g.id, g.from_id, g.kind, g.created_at
    from public.wump_nudges g
    where g.to_id = (select auth.uid()) and g.seen_at is null
    order by g.created_at desc
    limit 20
  ) n;
$$;

revoke all on function public.wump_unseen_nudges() from public, anon;
grant execute on function public.wump_unseen_nudges() to authenticated;

create or replace function public.wump_nudges_seen(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then return 0; end if;
  update public.wump_nudges
    set seen_at = now()
    where to_id = me
      and seen_at is null
      and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.wump_nudges_seen(bigint[]) from public, anon;
grant execute on function public.wump_nudges_seen(bigint[]) to authenticated;

-- ------------------------------------------------------------------ nearby includes battery, activity, place status
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
  battery_pct smallint,
  activity text,
  place_status text
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
    p.battery_pct,
    p.activity,
    p.place_status
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

-- Heartbeat now forwards battery. One signature so PostgREST is not ambiguous.
drop function if exists public.bump_heartbeat(double precision, double precision, double precision, double precision, double precision, text, text);
drop function if exists public.bump_heartbeat(double precision, double precision, double precision, double precision, double precision);

create or replace function public.bump_heartbeat(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_heading double precision default null,
  p_speed double precision default null,
  p_place_name text default null,
  p_place_locality text default null,
  p_battery smallint default null
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
    return public.bump_publish(p_lat, p_lng, p_accuracy, 'friends', null, null, p_heading, p_speed, p_battery, p_place_name, p_place_locality);
  end if;

  select coalesce(wump_precision, 'approx') into prec
  from public.user_privacy where user_id = uid;
  prec := coalesce(prec, 'approx');

  vis := cur.visible;
  lab := cur.label;

  return public.bump_publish(p_lat, p_lng, p_accuracy, vis, lab, prec, p_heading, p_speed, p_battery, p_place_name, p_place_locality);
end;
$$;

grant execute on function public.bump_heartbeat(double precision, double precision, double precision, double precision, double precision, text, text, smallint) to authenticated;

-- realtime so nudges and meetup RSVPs show up without a refresh
do $$
begin
  alter publication supabase_realtime add table public.wump_nudges;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.wump_meetups;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.wump_meetup_rsvps;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

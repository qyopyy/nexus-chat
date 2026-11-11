-- Acetate Listen Together. A host shares one room link. Guests hear the
-- current cut and follow play, pause, and seek. RLS keeps the room to its members.

create table if not exists public.acetate_rooms (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
                check (char_length(token) between 16 and 64),
  title       text not null default 'Listen together' check (char_length(title) between 1 and 80),
  track_id    uuid references public.acetate_tracks (id) on delete set null,
  position_s  real not null default 0 check (position_s >= 0 and position_s < 86400),
  playing     boolean not null default false,
  queue       uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  ended_at    timestamptz,
  expires_at  timestamptz not null default (now() + interval '12 hours')
);
create index if not exists acetate_rooms_host_idx on public.acetate_rooms (host_id, created_at desc);
create index if not exists acetate_rooms_token_idx on public.acetate_rooms (token) where ended_at is null;

create table if not exists public.acetate_room_members (
  room_id    uuid not null references public.acetate_rooms (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('host', 'guest')),
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists acetate_room_members_user_idx on public.acetate_room_members (user_id);

alter table public.acetate_rooms enable row level security;
alter table public.acetate_room_members enable row level security;
revoke all on public.acetate_rooms from anon, authenticated;
revoke all on public.acetate_room_members from anon, authenticated;
grant select on public.acetate_rooms to authenticated;
grant select on public.acetate_room_members to authenticated;

create or replace function public.acetate_in_room(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.acetate_room_members m
    where m.room_id = p_room and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.acetate_in_room(uuid) from public, anon;
grant execute on function public.acetate_in_room(uuid) to authenticated;

drop policy if exists acetate_rooms_member_read on public.acetate_rooms;
create policy acetate_rooms_member_read on public.acetate_rooms
  for select to authenticated
  using (host_id = (select auth.uid()) or public.acetate_in_room(id));

drop policy if exists acetate_room_members_read on public.acetate_room_members;
create policy acetate_room_members_read on public.acetate_room_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.acetate_in_room(room_id)
    or exists (
      select 1 from public.acetate_rooms r
      where r.id = room_id and r.host_id = (select auth.uid())
    )
  );

-- Guests may sign the current cut. They never get the versions table.
drop policy if exists acetate_obj_room_read on storage.objects;
create policy acetate_obj_room_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'acetate'
    and exists (
      select 1
      from public.acetate_room_members mem
      join public.acetate_rooms room on room.id = mem.room_id
      where mem.user_id = (select auth.uid())
        and room.ended_at is null
        and room.expires_at > now()
        and (
          exists (
            select 1 from public.acetate_versions v
            where v.track_id = room.track_id and v.path = name
          )
          or exists (
            select 1 from public.acetate_tracks t
            where t.id = room.track_id and t.artwork_path = name
          )
        )
    )
  );

create or replace function public.acetate_room_snapshot(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  room public.acetate_rooms;
  track jsonb;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select * into room from public.acetate_rooms where id = p_room;
  if not found or room.ended_at is not null or room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if room.host_id is distinct from me and not exists (
    select 1 from public.acetate_room_members m where m.room_id = room.id and m.user_id = me
  ) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'artist', coalesce(p.display_name, p.username, 'Acetate'),
    'lyrics', case when t.owner_id = me or t.lyrics_on_share then t.lyrics else null end,
    'art_path', t.artwork_path,
    'version_id', v.id,
    'path', v.path,
    'label', v.label,
    'duration', v.duration,
    'peaks', v.peaks
  ) into track
  from public.acetate_tracks t
  left join public.profiles p on p.id = t.owner_id
  left join lateral (
    select * from public.acetate_versions ver
    where ver.track_id = t.id
    order by ver.version desc
    limit 1
  ) v on true
  where t.id = room.track_id;
  return jsonb_build_object(
    'ok', true,
    'id', room.id,
    'token', room.token,
    'title', room.title,
    'host_id', room.host_id,
    'role', case when room.host_id = me then 'host' else 'guest' end,
    'track_id', room.track_id,
    'position_s', room.position_s,
    'playing', room.playing,
    'updated_at', room.updated_at,
    'expires_at', room.expires_at,
    'queue', to_jsonb(room.queue),
    'track', track,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'role', m.role,
        'username', pr.username,
        'display_name', pr.display_name
      ) order by m.joined_at)
      from public.acetate_room_members m
      join public.profiles pr on pr.id = m.user_id
      where m.room_id = room.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.acetate_room_start(p_title text, p_queue uuid[], p_track uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  room public.acetate_rooms;
  q uuid[] := coalesce(p_queue, '{}');
begin
  if me is null then raise exception 'Sign in required'; end if;
  if cardinality(q) < 1 or cardinality(q) > 40 then raise exception 'Add a cut to the room first'; end if;
  if p_track is null or not (p_track = any(q)) then raise exception 'Pick the cut that is playing'; end if;
  if exists (select 1 from unnest(q) id where not public.acetate_can_hear(id)) then
    raise exception 'That queue has a cut you cannot play';
  end if;
  update public.acetate_rooms set ended_at = now()
  where host_id = me and ended_at is null;
  insert into public.acetate_rooms (host_id, title, track_id, queue, playing, position_s)
  values (me, left(coalesce(nullif(btrim(p_title), ''), 'Listen together'), 80), p_track, q, true, 0)
  returning * into room;
  insert into public.acetate_room_members (room_id, user_id, role) values (room.id, me, 'host');
  return public.acetate_room_snapshot(room.id);
end;
$$;

create or replace function public.acetate_room_join(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  room public.acetate_rooms;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select * into room from public.acetate_rooms
  where token = left(coalesce(p_token, ''), 64) and ended_at is null and expires_at > now();
  if not found then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if public.is_blocked_between(me, room.host_id) then
    raise exception 'You cannot join that room';
  end if;
  if (select count(*) from public.acetate_room_members where room_id = room.id) >= 40
     and not exists (select 1 from public.acetate_room_members where room_id = room.id and user_id = me) then
    raise exception 'This room is full';
  end if;
  insert into public.acetate_room_members (room_id, user_id, role)
  values (room.id, me, case when room.host_id = me then 'host' else 'guest' end)
  on conflict (room_id, user_id) do nothing;
  return public.acetate_room_snapshot(room.id);
end;
$$;

create or replace function public.acetate_room_sync(
  p_room uuid,
  p_track uuid,
  p_position real,
  p_playing boolean,
  p_queue uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  q uuid[] := coalesce(p_queue, '{}');
begin
  if me is null then raise exception 'Sign in required'; end if;
  if cardinality(q) > 40 then raise exception 'That queue is too long'; end if;
  if exists (select 1 from unnest(q) id where not public.acetate_can_hear(id)) then
    raise exception 'That queue has a cut you cannot play';
  end if;
  update public.acetate_rooms
  set track_id = p_track,
      position_s = least(86399, greatest(0, coalesce(p_position, 0))),
      playing = coalesce(p_playing, false),
      queue = q,
      updated_at = now()
  where id = p_room and host_id = me and ended_at is null and expires_at > now();
  if not found then raise exception 'Only the host can move playback'; end if;
end;
$$;

create or replace function public.acetate_room_end(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.acetate_rooms set ended_at = now(), playing = false, updated_at = now()
  where id = p_room and host_id = auth.uid() and ended_at is null;
end;
$$;

revoke all on function public.acetate_room_snapshot(uuid) from public, anon;
revoke all on function public.acetate_room_start(text, uuid[], uuid) from public, anon;
revoke all on function public.acetate_room_join(text) from public, anon;
revoke all on function public.acetate_room_sync(uuid, uuid, real, boolean, uuid[]) from public, anon;
revoke all on function public.acetate_room_end(uuid) from public, anon;
grant execute on function public.acetate_room_snapshot(uuid) to authenticated;
grant execute on function public.acetate_room_start(text, uuid[], uuid) to authenticated;
grant execute on function public.acetate_room_join(text) to authenticated;
grant execute on function public.acetate_room_sync(uuid, uuid, real, boolean, uuid[]) to authenticated;
grant execute on function public.acetate_room_end(uuid) to authenticated;

alter table public.acetate_room_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.acetate_rooms;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.acetate_room_members;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Bump social: profiles (bio + Spotify track + Apple Maps place), follows, DMs

create table if not exists public.bump_profiles (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  bio              text check (bio is null or char_length(bio) <= 280),
  spotify_track    text check (spotify_track is null or char_length(spotify_track) <= 200),
  apple_maps_url   text check (apple_maps_url is null or char_length(apple_maps_url) <= 500),
  place_name       text check (place_name is null or char_length(place_name) <= 120),
  place_address    text check (place_address is null or char_length(place_address) <= 240),
  place_lat        double precision,
  place_lng        double precision,
  updated_at       timestamptz not null default now()
);

create table if not exists public.bump_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists bump_follows_followee_idx on public.bump_follows (followee_id, created_at desc);

create table if not exists public.bump_messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(trim(body)) between 1 and 1000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists bump_messages_inbox_idx
  on public.bump_messages (recipient_id, created_at desc);
create index if not exists bump_messages_thread_idx
  on public.bump_messages (sender_id, recipient_id, created_at);

alter table public.bump_profiles enable row level security;
alter table public.bump_follows enable row level security;
alter table public.bump_messages enable row level security;

drop policy if exists bump_profiles_select on public.bump_profiles;
create policy bump_profiles_select on public.bump_profiles
  for select to authenticated using (true);
drop policy if exists bump_profiles_upsert on public.bump_profiles;
create policy bump_profiles_insert on public.bump_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy bump_profiles_update on public.bump_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bump_profiles_delete on public.bump_profiles
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists bump_follows_select on public.bump_follows;
create policy bump_follows_select on public.bump_follows
  for select to authenticated using (true);
drop policy if exists bump_follows_write on public.bump_follows;
create policy bump_follows_write on public.bump_follows
  for all to authenticated
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

drop policy if exists bump_messages_select on public.bump_messages;
create policy bump_messages_select on public.bump_messages
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists bump_messages_insert on public.bump_messages;
create policy bump_messages_insert on public.bump_messages
  for insert to authenticated with check (sender_id = auth.uid());
drop policy if exists bump_messages_update on public.bump_messages;
create policy bump_messages_update on public.bump_messages
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Public card: Nexus username/avatar + Bump bio/place/spotify + follow counts
create or replace function public.bump_get_profile(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  p profiles%rowtype;
  bp bump_profiles%rowtype;
  followers int;
  following int;
  is_following boolean;
  follows_you boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into p from profiles where id = p_user;
  if not found then raise exception 'user not found'; end if;
  select * into bp from bump_profiles where user_id = p_user;
  select count(*)::int into followers from bump_follows where followee_id = p_user;
  select count(*)::int into following from bump_follows where follower_id = p_user;
  is_following := exists (select 1 from bump_follows where follower_id = me and followee_id = p_user);
  follows_you := exists (select 1 from bump_follows where follower_id = p_user and followee_id = me);
  return jsonb_build_object(
    'user_id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'avatar_color', p.avatar_color,
    'bio', coalesce(bp.bio, p.bio),
    'spotify_track', bp.spotify_track,
    'apple_maps_url', bp.apple_maps_url,
    'place_name', bp.place_name,
    'place_address', bp.place_address,
    'place_lat', bp.place_lat,
    'place_lng', bp.place_lng,
    'followers', followers,
    'following', following,
    'is_following', is_following,
    'follows_you', follows_you,
    'is_me', p.id = me,
    'updated_at', bp.updated_at
  );
end;
$$;

create or replace function public.bump_upsert_profile(
  p_bio text default null,
  p_spotify_track text default null,
  p_apple_maps_url text default null,
  p_place_name text default null,
  p_place_address text default null,
  p_place_lat double precision default null,
  p_place_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  track text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  track := nullif(trim(coalesce(p_spotify_track, '')), '');
  if track is not null and track !~* 'open\.spotify\.com/(intl-[a-z-]+/)?track/|spotify:track:' then
    raise exception 'spotify_track must be a Spotify track link';
  end if;
  insert into bump_profiles (
    user_id, bio, spotify_track, apple_maps_url, place_name, place_address, place_lat, place_lng, updated_at
  ) values (
    uid,
    nullif(trim(coalesce(p_bio, '')), ''),
    track,
    nullif(trim(coalesce(p_apple_maps_url, '')), ''),
    nullif(trim(coalesce(p_place_name, '')), ''),
    nullif(trim(coalesce(p_place_address, '')), ''),
    p_place_lat,
    p_place_lng,
    now()
  )
  on conflict (user_id) do update set
    bio = excluded.bio,
    spotify_track = excluded.spotify_track,
    apple_maps_url = excluded.apple_maps_url,
    place_name = excluded.place_name,
    place_address = excluded.place_address,
    place_lat = excluded.place_lat,
    place_lng = excluded.place_lng,
    updated_at = now();
  return public.bump_get_profile(uid);
end;
$$;

create or replace function public.bump_set_follow(p_user uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  followers int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_user is null or p_user = me then raise exception 'invalid user'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'user not found'; end if;
  if p_on then
    insert into bump_follows (follower_id, followee_id) values (me, p_user) on conflict do nothing;
  else
    delete from bump_follows where follower_id = me and followee_id = p_user;
  end if;
  select count(*)::int into followers from bump_follows where followee_id = p_user;
  return jsonb_build_object(
    'ok', true,
    'is_following', p_on,
    'followers', followers
  );
end;
$$;

create or replace function public.bump_follow_list(p_user uuid, p_which text default 'followers')
returns table (user_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_which = 'following' then
    return query
      select f.followee_id, f.created_at
      from bump_follows f
      where f.follower_id = p_user
      order by f.created_at desc
      limit 200;
  else
    return query
      select f.follower_id, f.created_at
      from bump_follows f
      where f.followee_id = p_user
      order by f.created_at desc
      limit 200;
  end if;
end;
$$;

create or replace function public.bump_send_message(p_to uuid, p_body text)
returns public.bump_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.bump_messages;
  cleaned text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_to is null or p_to = me then raise exception 'invalid recipient'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception 'user not found'; end if;
  cleaned := trim(coalesce(p_body, ''));
  if char_length(cleaned) < 1 or char_length(cleaned) > 1000 then
    raise exception 'message must be 1–1000 characters';
  end if;
  insert into bump_messages (sender_id, recipient_id, body)
  values (me, p_to, cleaned)
  returning * into row;
  return row;
end;
$$;

create or replace function public.bump_thread(p_with uuid, p_limit int default 80)
returns setof public.bump_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_with is null then raise exception 'invalid user'; end if;
  update bump_messages
    set read_at = now()
    where recipient_id = me and sender_id = p_with and read_at is null;
  return query
    select *
    from bump_messages m
    where (m.sender_id = me and m.recipient_id = p_with)
       or (m.sender_id = p_with and m.recipient_id = me)
    order by m.created_at asc
    limit least(greatest(coalesce(p_limit, 80), 1), 200);
end;
$$;

create or replace function public.bump_inbox(p_limit int default 40)
returns table (
  other_id uuid,
  last_body text,
  last_at timestamptz,
  unread int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
  with threads as (
    select
      case when m.sender_id = me then m.recipient_id else m.sender_id end as oid,
      m.body,
      m.created_at,
      m.recipient_id,
      m.read_at,
      row_number() over (
        partition by case when m.sender_id = me then m.recipient_id else m.sender_id end
        order by m.created_at desc
      ) as rn
    from bump_messages m
    where m.sender_id = me or m.recipient_id = me
  )
  select
    t.oid,
    t.body,
    t.created_at,
    (
      select count(*)::int from bump_messages u
      where u.recipient_id = me and u.sender_id = t.oid and u.read_at is null
    ) as unread
  from threads t
  where t.rn = 1
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$$;

grant execute on function public.bump_get_profile(uuid) to authenticated;
grant execute on function public.bump_upsert_profile(text, text, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.bump_set_follow(uuid, boolean) to authenticated;
grant execute on function public.bump_follow_list(uuid, text) to authenticated;
grant execute on function public.bump_send_message(uuid, text) to authenticated;
grant execute on function public.bump_thread(uuid, int) to authenticated;
grant execute on function public.bump_inbox(int) to authenticated;

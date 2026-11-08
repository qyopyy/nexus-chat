-- Wump Plus (premium subscription / role) + Wump profiles: privacy (who sees the profile / place / song / follows, who can DM, searchability),
-- optional page password (bcrypt), profile views (count + recent viewers) and people search.
alter table public.bump_profiles
  add column if not exists visibility text not null default 'everyone' check (visibility in ('everyone', 'friends', 'private')),
  add column if not exists show_place text not null default 'friends' check (show_place in ('everyone', 'friends', 'nobody')),
  add column if not exists show_song boolean not null default true,
  add column if not exists show_follows boolean not null default true,
  add column if not exists dm_from text not null default 'everyone' check (dm_from in ('everyone', 'friends', 'nobody')),
  add column if not exists searchable boolean not null default true,
  add column if not exists page_password text,
  add column if not exists password_hint text check (password_hint is null or char_length(password_hint) <= 80),
  add column if not exists password_friends_bypass boolean not null default true,
  add column if not exists hide_my_views boolean not null default false,
  add column if not exists view_count int not null default 0;

-- the hash must never leave the database
revoke select (page_password) on public.bump_profiles from anon, authenticated;
revoke select on public.bump_profiles from anon, authenticated;
grant select (user_id, bio, spotify_track, apple_maps_url, place_name, place_address, place_lat, place_lng, updated_at,
  visibility, show_place, show_song, show_follows, dm_from, searchable, password_hint, password_friends_bypass, hide_my_views, view_count) on public.bump_profiles to authenticated;
-- direct reads of other people's rows are no longer needed (bump_get_profile enforces privacy)
drop policy if exists bump_profiles_select on public.bump_profiles;
create policy bump_profiles_select on public.bump_profiles for select to authenticated using (user_id = (select auth.uid()));
-- privacy columns only through bump_set_privacy
revoke update on public.bump_profiles from authenticated;
grant update (bio, spotify_track, apple_maps_url, place_name, place_address, place_lat, place_lng, updated_at) on public.bump_profiles to authenticated;
revoke insert on public.bump_profiles from authenticated;
grant insert (user_id, bio, spotify_track, apple_maps_url, place_name, place_address, place_lat, place_lng, updated_at) on public.bump_profiles to authenticated;

create table if not exists public.bump_profile_views (
  target_id uuid not null references public.profiles (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  hidden boolean not null default false,
  viewed_at timestamptz not null default now(),
  primary key (target_id, viewer_id)
);
create index if not exists bump_profile_views_recent on public.bump_profile_views (target_id, viewed_at desc);
alter table public.bump_profile_views enable row level security;
revoke all on public.bump_profile_views from anon, authenticated;

create table if not exists public.bump_password_attempts (
  id bigint generated always as identity primary key,
  target_id uuid not null,
  viewer_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists bump_password_attempts_idx on public.bump_password_attempts (viewer_id, target_id, at desc);
alter table public.bump_password_attempts enable row level security;
revoke all on public.bump_password_attempts from anon, authenticated;

create or replace function public.bump_is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select a is not null and b is not null and (a = b
    or exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a)))
    or exists (select 1 from public.bump_family f where (f.user_id = a and f.member_id = b) or (f.user_id = b and f.member_id = a))
    or (exists (select 1 from public.bump_follows x where x.follower_id = a and x.followee_id = b) and exists (select 1 from public.bump_follows y where y.follower_id = b and y.followee_id = a)));
$$;
revoke execute on function public.bump_is_friend(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ Wump Plus
-- Active when: a gifted / bought / granted period is running, an admin made it permanent (the "Wump Plus" role),
-- the member has Nexus Premium or higher, or is an admin.
create table if not exists public.wump_plus (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  until timestamptz,
  permanent boolean not null default false,
  source text not null default 'grant' check (source in ('grant', 'gift', 'order', 'role', 'style')),
  granted_by uuid references public.profiles (id) on delete set null,
  pin_emoji text check (pin_emoji is null or char_length(pin_emoji) <= 16),
  pin_color text check (pin_color is null or pin_color ~ '^#[0-9a-fA-F]{6}$'),
  banner_color text check (banner_color is null or banner_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now()
);
alter table public.wump_plus enable row level security;
revoke all on public.wump_plus from anon, authenticated;

create or replace function public.wump_plus_via(u uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.wump_plus w where w.user_id = u and (w.permanent or w.until > now())) then 'plus'
    when exists (select 1 from public.profiles p where p.id = u and p.premium_until > now() and public.tier_rank(p.premium_tier) >= 2) then 'nexus'
    when exists (select 1 from public.profiles p where p.id = u and public.role_rank(p.site_role) >= 3) then 'staff'
  end;
$$;
create or replace function public.wump_is_plus(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select public.wump_plus_via(u) is not null; $$;
revoke execute on function public.wump_plus_via(uuid) from public, anon, authenticated;
revoke execute on function public.wump_is_plus(uuid) from public, anon, authenticated;

create or replace function public.wump_plus_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); w public.wump_plus%rowtype; via text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into w from public.wump_plus where user_id = me;
  via := public.wump_plus_via(me);
  return jsonb_build_object('active', via is not null, 'via', via, 'until', case when w.until > now() then w.until end, 'permanent', coalesce(w.permanent, false),
    'pin_emoji', w.pin_emoji, 'pin_color', w.pin_color, 'banner_color', w.banner_color, 'price', public.tier_price('wump_plus'));
end $$;
revoke execute on function public.wump_plus_status() from public, anon;
grant execute on function public.wump_plus_status() to authenticated;

create or replace function public.wump_plus_style(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); e text; c text; b text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.wump_is_plus(me) then raise exception 'Wump Plus required'; end if;
  e := nullif(left(btrim(coalesce(p->>'pin_emoji', '')), 16), '');
  if e is not null and (e ~ '[<>"''&\\]' or e ~ '[A-Za-z0-9]{3,}') then raise exception 'Pick an emoji'; end if;
  c := nullif(lower(btrim(coalesce(p->>'pin_color', ''))), '');
  b := nullif(lower(btrim(coalesce(p->>'banner_color', ''))), '');
  if c is not null and c !~ '^#[0-9a-f]{6}$' then raise exception 'Bad color'; end if;
  if b is not null and b !~ '^#[0-9a-f]{6}$' then raise exception 'Bad color'; end if;
  insert into public.wump_plus (user_id, source, pin_emoji, pin_color, banner_color) values (me, 'style', e, c, b)
    on conflict (user_id) do update set
      pin_emoji = case when p ? 'pin_emoji' then e else public.wump_plus.pin_emoji end,
      pin_color = case when p ? 'pin_color' then c else public.wump_plus.pin_color end,
      banner_color = case when p ? 'banner_color' then b else public.wump_plus.banner_color end,
      updated_at = now();
  return public.wump_plus_status();
end $$;
revoke execute on function public.wump_plus_style(jsonb) from public, anon;
grant execute on function public.wump_plus_style(jsonb) to authenticated;

-- Admins: give / extend / make permanent (role) / revoke, by username.
create or replace function public.wump_plus_grant(p_username text, p_days int, p_permanent boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; w public.wump_plus%rowtype;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select id into u from public.profiles where lower(username) = lower(ltrim(btrim(coalesce(p_username, '')), '@'));
  if u is null then raise exception 'User not found'; end if;
  if coalesce(p_days, 0) > 3650 then raise exception 'Days must be 0–3650'; end if;
  if coalesce(p_permanent, false) then
    insert into public.wump_plus (user_id, permanent, source, granted_by) values (u, true, 'role', auth.uid())
      on conflict (user_id) do update set permanent = true, source = 'role', granted_by = auth.uid(), updated_at = now();
  elsif coalesce(p_days, 0) <= 0 then
    update public.wump_plus set permanent = false, until = least(coalesce(until, now()), now()), granted_by = auth.uid(), updated_at = now() where user_id = u;
  else
    insert into public.wump_plus (user_id, until, source, granted_by) values (u, now() + make_interval(days => p_days), 'grant', auth.uid())
      on conflict (user_id) do update set until = greatest(coalesce(public.wump_plus.until, now()), now()) + make_interval(days => p_days),
        source = 'grant', granted_by = auth.uid(), updated_at = now();
  end if;
  perform public.log_admin(u, 'wump_plus', jsonb_build_object('days', p_days, 'permanent', coalesce(p_permanent, false)));
  select * into w from public.wump_plus where user_id = u;
  return jsonb_build_object('user_id', u, 'active', public.wump_is_plus(u), 'until', w.until, 'permanent', coalesce(w.permanent, false));
end $$;
revoke execute on function public.wump_plus_grant(text, int, boolean) from public, anon;
grant execute on function public.wump_plus_grant(text, int, boolean) to authenticated;

create or replace function public.wump_plus_members()
returns table (user_id uuid, username text, until timestamptz, permanent boolean, source text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  return query select w.user_id, p.username, w.until, w.permanent, w.source, w.updated_at
    from public.wump_plus w join public.profiles p on p.id = w.user_id
    where w.permanent or w.until > now() order by w.updated_at desc limit 200;
end $$;
revoke execute on function public.wump_plus_members() from public, anon;
grant execute on function public.wump_plus_members() to authenticated;

-- Cosmetics for map pins / profiles (only members with Plus active).
create or replace function public.wump_plus_for(p_ids uuid[])
returns table (user_id uuid, pin_emoji text, pin_color text, banner_color text)
language sql stable security definer set search_path = '' as $$
  select x.id, w.pin_emoji, w.pin_color, w.banner_color
  from unnest(p_ids[1:200]) as x(id) left join public.wump_plus w on w.user_id = x.id
  where auth.uid() is not null and public.wump_is_plus(x.id);
$$;
revoke execute on function public.wump_plus_for(uuid[]) from public, anon;
grant execute on function public.wump_plus_for(uuid[]) to authenticated;

-- Sellable + giftable like the Nexus plans (separate from the Nexus plan ladder: tier_rank stays 0).
create or replace function public.tier_price(t text) returns numeric language sql immutable set search_path = '' as $$
  select case t when 'lighting' then 3.99 when 'premium' then 5.99 when 'dist' then 19.99 when 'dist_pro' then 49.99 when 'dist_video' then 59.99 when 'wump_plus' then 2.99 end;
$$;
create or replace function public.tier_name(t text) returns text language sql immutable set search_path = '' as $$
  select case t when 'lighting' then 'Nexus Lighting Sub' when 'premium' then 'Nexus Lighting Premium'
    when 'dist' then 'Nexus Lighting Premium + Music Distribution' when 'dist_pro' then 'Nexus Lighting Premium + Music Distribution Pro'
    when 'dist_video' then 'Nexus Lighting Premium + Music Distribution Pro + Official Music Video Distribution'
    when 'wump_plus' then 'Wump Plus' end;
$$;
alter table public.premium_gifts drop constraint if exists premium_gifts_tier_check;
alter table public.premium_gifts add constraint premium_gifts_tier_check check (tier in ('lighting', 'premium', 'dist', 'dist_pro', 'dist_video', 'wump_plus'));
alter table public.premium_orders drop constraint if exists premium_orders_tier_check;
alter table public.premium_orders add constraint premium_orders_tier_check check (tier in ('lighting', 'premium', 'dist', 'dist_pro', 'dist_video', 'wump_plus'));

create or replace function public.create_premium_gift(p_tier text, p_days integer, p_max_claims integer, p_expires_days integer, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare code text; gid uuid; exp timestamptz;
begin
  if public.my_rank() < 2 then raise exception 'Staff only (mods & admins)'; end if;
  if p_tier not in ('lighting', 'premium', 'dist', 'dist_pro', 'dist_video', 'wump_plus') then raise exception 'Bad tier'; end if;
  if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'Days must be 1–3650'; end if;
  if p_max_claims is null or p_max_claims < 1 or p_max_claims > 1000 then raise exception 'Max claims 1–1000'; end if;
  code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  exp := case when p_expires_days is null or p_expires_days <= 0 then null else now() + make_interval(days => p_expires_days) end;
  insert into public.premium_gifts (code, tier, days, max_claims, expires_at, created_by, note)
  values (code, p_tier, p_days, p_max_claims, exp, auth.uid(), nullif(trim(p_note), '')) returning id into gid;
  perform public.log_admin(auth.uid(), 'premium_gift_create', jsonb_build_object('code', code, 'tier', p_tier, 'days', p_days, 'max', p_max_claims));
  return jsonb_build_object('id', gid, 'code', code, 'path', '/gift/' || code);
end $$;

create or replace function public.redeem_premium_gift(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.premium_gifts; code text := lower(trim(p_code)); until_ts timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to claim this gift'; end if;
  if code is null or code = '' then raise exception 'Missing gift code'; end if;
  select * into g from public.premium_gifts where premium_gifts.code = code for update;
  if g.id is null then raise exception 'Gift not found'; end if;
  if g.expires_at is not null and g.expires_at < now() then raise exception 'This gift link has expired'; end if;
  if g.claims >= g.max_claims then raise exception 'This gift has already been claimed'; end if;
  if exists (select 1 from public.premium_gift_claims where gift_id = g.id and user_id = auth.uid()) then raise exception 'You already claimed this gift'; end if;

  if g.tier = 'wump_plus' then
    insert into public.wump_plus (user_id, until, source) values (auth.uid(), now() + make_interval(days => g.days), 'gift')
      on conflict (user_id) do update set until = greatest(coalesce(public.wump_plus.until, now()), now()) + make_interval(days => g.days),
        source = case when public.wump_plus.permanent then public.wump_plus.source else 'gift' end, updated_at = now()
      returning until into until_ts;
  else
    perform set_config('nexus.admin_write', 'on', true);
    update public.profiles set
      premium_tier = case when premium_until > now() and public.tier_rank(premium_tier) > public.tier_rank(g.tier) then premium_tier else g.tier end,
      premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => g.days)
    where id = auth.uid() returning premium_until into until_ts;
    perform set_config('nexus.admin_write', 'off', true);
  end if;

  insert into public.premium_gift_claims (gift_id, user_id) values (g.id, auth.uid());
  update public.premium_gifts set claims = claims + 1 where id = g.id;
  perform public.log_admin(auth.uid(), 'premium_gift_redeem', jsonb_build_object('code', code, 'tier', g.tier, 'days', g.days));
  return jsonb_build_object('ok', true, 'tier', g.tier, 'days', g.days, 'until', until_ts);
end $$;

drop function if exists public.bump_get_profile(uuid);
create or replace function public.bump_get_profile(p_user uuid, p_password text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
  bp public.bump_profiles%rowtype;
  friend boolean; mine boolean; lock text := null;
  fc int; fg int; recent int;
  base jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'user not found'; end if;
  select * into bp from public.bump_profiles where user_id = p_user;
  mine := p_user = me;
  friend := public.bump_is_friend(me, p_user);

  base := jsonb_build_object('user_id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
    'avatar_color', p.avatar_color, 'is_me', mine, 'is_friend', friend,
    'is_following', exists (select 1 from public.bump_follows where follower_id = me and followee_id = p_user),
    'follows_you', exists (select 1 from public.bump_follows where follower_id = p_user and followee_id = me));

  if not mine then
    if coalesce(bp.visibility, 'everyone') = 'private' then lock := 'private';
    elsif bp.visibility = 'friends' and not friend then lock := 'friends';
    elsif bp.page_password is not null and not (friend and bp.password_friends_bypass) then
      if p_password is null or p_password = '' then lock := 'password';
      elsif (select count(*) from public.bump_password_attempts where viewer_id = me and target_id = p_user and at > now() - interval '10 minutes') >= 8 then lock := 'too_many';
      elsif extensions.crypt(p_password, bp.page_password) <> bp.page_password then
        insert into public.bump_password_attempts (target_id, viewer_id) values (p_user, me);
        lock := 'wrong_password';
      end if;
    end if;
  end if;
  if lock is not null then
    return base || jsonb_build_object('locked', lock, 'password_hint', case when lock in ('password', 'wrong_password', 'too_many') then bp.password_hint end);
  end if;

  if not mine then
    insert into public.bump_profile_views (target_id, viewer_id, hidden, viewed_at)
      values (p_user, me, coalesce((select hide_my_views from public.bump_profiles where user_id = me), false) and public.wump_is_plus(me), now())
      on conflict (target_id, viewer_id) do update set viewed_at = now(), hidden = excluded.hidden
      where public.bump_profile_views.viewed_at < now() - interval '30 minutes';
    if found then update public.bump_profiles set view_count = view_count + 1 where user_id = p_user; end if;
  end if;

  select count(*)::int into fc from public.bump_follows where followee_id = p_user;
  select count(*)::int into fg from public.bump_follows where follower_id = p_user;
  select count(*)::int into recent from public.bump_profile_views where target_id = p_user and viewed_at > now() - interval '7 days';

  return base || jsonb_build_object(
    'locked', null,
    'is_plus', public.wump_is_plus(p_user),
    'plus_style', (select jsonb_build_object('pin_emoji', w.pin_emoji, 'pin_color', w.pin_color, 'banner_color', w.banner_color)
      from public.wump_plus w where w.user_id = p_user and public.wump_is_plus(p_user)),
    'bio', coalesce(bp.bio, p.bio),
    'spotify_track', case when mine or coalesce(bp.show_song, true) then bp.spotify_track end,
    'apple_maps_url', case when mine or coalesce(bp.show_place, 'friends') = 'everyone' or (bp.show_place = 'friends' and friend) or bp.show_place is null then bp.apple_maps_url end,
    'place_name', case when mine or coalesce(bp.show_place, 'friends') = 'everyone' or (coalesce(bp.show_place, 'friends') = 'friends' and friend) then bp.place_name end,
    'place_address', case when mine or coalesce(bp.show_place, 'friends') = 'everyone' or (coalesce(bp.show_place, 'friends') = 'friends' and friend) then bp.place_address end,
    'place_lat', case when mine or coalesce(bp.show_place, 'friends') = 'everyone' or (coalesce(bp.show_place, 'friends') = 'friends' and friend) then bp.place_lat end,
    'place_lng', case when mine or coalesce(bp.show_place, 'friends') = 'everyone' or (coalesce(bp.show_place, 'friends') = 'friends' and friend) then bp.place_lng end,
    'followers', case when mine or coalesce(bp.show_follows, true) or friend then fc end,
    'following', case when mine or coalesce(bp.show_follows, true) or friend then fg end,
    'can_message', mine or coalesce(bp.dm_from, 'everyone') = 'everyone' or (bp.dm_from = 'friends' and friend),
    'updated_at', bp.updated_at,
    'views', case when mine then coalesce(bp.view_count, 0) end,
    'views_7d', case when mine then recent end,
    'privacy', case when mine then jsonb_build_object('visibility', coalesce(bp.visibility, 'everyone'), 'show_place', coalesce(bp.show_place, 'friends'),
      'show_song', coalesce(bp.show_song, true), 'show_follows', coalesce(bp.show_follows, true), 'dm_from', coalesce(bp.dm_from, 'everyone'),
      'searchable', coalesce(bp.searchable, true), 'has_password', bp.page_password is not null, 'password_hint', bp.password_hint,
      'password_friends_bypass', coalesce(bp.password_friends_bypass, true), 'hide_my_views', coalesce(bp.hide_my_views, false)) end);
end $$;
revoke execute on function public.bump_get_profile(uuid, text) from public, anon;
grant execute on function public.bump_get_profile(uuid, text) to authenticated;

create or replace function public.bump_set_privacy(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pw text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.bump_profiles (user_id) values (me) on conflict do nothing;
  if coalesce((p->>'hide_my_views')::boolean, false) and not public.wump_is_plus(me) then raise exception 'Browse privately is a Wump Plus feature'; end if;
  if p ? 'password' then
    pw := p->>'password';
    if pw is not null and pw <> '' and (char_length(pw) < 4 or char_length(pw) > 64) then raise exception 'Password must be 4–64 characters'; end if;
  end if;
  update public.bump_profiles set
    visibility = case when p->>'visibility' in ('everyone', 'friends', 'private') then p->>'visibility' else visibility end,
    show_place = case when p->>'show_place' in ('everyone', 'friends', 'nobody') then p->>'show_place' else show_place end,
    show_song = case when p ? 'show_song' then coalesce((p->>'show_song')::boolean, true) else show_song end,
    show_follows = case when p ? 'show_follows' then coalesce((p->>'show_follows')::boolean, true) else show_follows end,
    dm_from = case when p->>'dm_from' in ('everyone', 'friends', 'nobody') then p->>'dm_from' else dm_from end,
    searchable = case when p ? 'searchable' then coalesce((p->>'searchable')::boolean, true) else searchable end,
    hide_my_views = case when p ? 'hide_my_views' then coalesce((p->>'hide_my_views')::boolean, false) else hide_my_views end,
    password_friends_bypass = case when p ? 'password_friends_bypass' then coalesce((p->>'password_friends_bypass')::boolean, true) else password_friends_bypass end,
    password_hint = case when p ? 'password_hint' then nullif(left(btrim(p->>'password_hint'), 80), '') else password_hint end,
    page_password = case when p ? 'password' then case when coalesce(pw, '') = '' then null else extensions.crypt(pw, extensions.gen_salt('bf', 8)) end else page_password end,
    updated_at = now()
  where user_id = me;
  return public.bump_get_profile(me);
end $$;
revoke execute on function public.bump_set_privacy(jsonb) from public, anon;
grant execute on function public.bump_set_privacy(jsonb) to authenticated;

create or replace function public.bump_set_song(p_track text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t text := nullif(btrim(coalesce(p_track, '')), '');
begin
  if me is null then raise exception 'not authenticated'; end if;
  if t is not null and t !~* '^https://open\.spotify\.com/(intl-[a-z-]+/)?track/[A-Za-z0-9]{10,40}' then raise exception 'Pick a Spotify track'; end if;
  insert into public.bump_profiles (user_id, spotify_track, updated_at) values (me, left(t, 200), now())
    on conflict (user_id) do update set spotify_track = excluded.spotify_track, updated_at = now();
  return public.bump_get_profile(me);
end $$;
revoke execute on function public.bump_set_song(text) from public, anon;
grant execute on function public.bump_set_song(text) to authenticated;

create or replace function public.bump_profile_viewers(p_limit int default 50)
returns table (viewer_id uuid, viewed_at timestamptz, is_friend boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.wump_is_plus(auth.uid()) then raise exception 'Who viewed is a Wump Plus feature'; end if;
  return query select v.viewer_id, v.viewed_at, public.bump_is_friend(v.target_id, v.viewer_id)
    from public.bump_profile_views v
    where v.target_id = auth.uid() and not v.hidden and v.viewed_at > now() - interval '30 days'
    order by v.viewed_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;
revoke execute on function public.bump_profile_viewers(int) from public, anon;
grant execute on function public.bump_profile_viewers(int) to authenticated;

create or replace function public.bump_search_people(p_q text)
returns table (user_id uuid, username text, display_name text, avatar_url text, avatar_color text, is_friend boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_color, public.bump_is_friend(auth.uid(), p.id)
  from public.profiles p left join public.bump_profiles b on b.user_id = p.id
  where auth.uid() is not null and char_length(btrim(coalesce(p_q, ''))) >= 2 and p.id <> auth.uid() and not coalesce(p.is_bot, false)
    and (p.username ilike replace(replace(btrim(p_q), '%', ''), '_', '\_') || '%' or p.display_name ilike '%' || replace(replace(btrim(p_q), '%', ''), '_', '\_') || '%')
    and (coalesce(b.searchable, true) or public.bump_is_friend(auth.uid(), p.id))
    and (p.banned_until is null or p.banned_until < now())
  order by public.bump_is_friend(auth.uid(), p.id) desc, (p.username ilike btrim(p_q) || '%') desc, p.username
  limit 10;
$$;
revoke execute on function public.bump_search_people(text) from public, anon;
grant execute on function public.bump_search_people(text) to authenticated;

-- DMs respect dm_from
create or replace function public.bump_send_message(p_to uuid, p_body text)
returns public.bump_messages language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); row public.bump_messages; cleaned text; pol text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_to is null or p_to = me then raise exception 'invalid recipient'; end if;
  if not exists (select 1 from public.profiles where id = p_to) then raise exception 'user not found'; end if;
  select dm_from into pol from public.bump_profiles where user_id = p_to;
  if pol = 'nobody' then raise exception 'This person isn''t taking messages'; end if;
  if pol = 'friends' and not public.bump_is_friend(me, p_to) then raise exception 'Only friends can message this person'; end if;
  cleaned := trim(coalesce(p_body, ''));
  if char_length(cleaned) < 1 or char_length(cleaned) > 1000 then raise exception 'message must be 1–1000 characters'; end if;
  insert into public.bump_messages (sender_id, recipient_id, body) values (me, p_to, cleaned) returning * into row;
  return row;
end $$;

-- follower lists respect show_follows / visibility
create or replace function public.bump_follow_list(p_user uuid, p_which text)
returns table (user_id uuid, created_at timestamptz) language plpgsql stable security definer set search_path = '' as $$
declare bp public.bump_profiles%rowtype; me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into bp from public.bump_profiles where bump_profiles.user_id = p_user;
  if p_user <> me and not public.bump_is_friend(me, p_user)
     and (coalesce(bp.show_follows, true) = false or coalesce(bp.visibility, 'everyone') <> 'everyone' or bp.page_password is not null) then
    return;
  end if;
  if p_which = 'following' then
    return query select f.followee_id, f.created_at from public.bump_follows f where f.follower_id = p_user order by f.created_at desc limit 200;
  else
    return query select f.follower_id, f.created_at from public.bump_follows f where f.followee_id = p_user order by f.created_at desc limit 200;
  end if;
end $$;

-- Orders: fulfilling a Wump Plus order extends Wump Plus instead of the Nexus plan.
create or replace function public.set_order_status(p_order bigint, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.premium_orders;
  bot uuid := '00000000-0000-4000-8000-00000000b002';
  v_until timestamptz;
  msg text;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_status not in ('pending','awaiting_payment','paid','fulfilled','cancelled') then raise exception 'Unknown status'; end if;
  select * into o from public.premium_orders where id = p_order;
  if o.id is null then raise exception 'Order not found'; end if;
  update public.premium_orders set status = p_status, note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note), handled_by = auth.uid(), updated_at = now() where id = p_order;
  if p_status = 'fulfilled' and o.status <> 'fulfilled' then
    if o.tier = 'wump_plus' then
      insert into public.wump_plus (user_id, until, source, granted_by) values (o.user_id, now() + make_interval(days => 30 * o.months), 'order', auth.uid())
        on conflict (user_id) do update set until = greatest(coalesce(public.wump_plus.until, now()), now()) + make_interval(days => 30 * o.months),
          source = case when public.wump_plus.permanent then public.wump_plus.source else 'order' end, updated_at = now()
        returning until into v_until;
    else
      perform set_config('nexus.admin_write', 'on', true);
      update public.profiles set
        premium_tier = case when premium_until > now() and public.tier_rank(premium_tier) > public.tier_rank(o.tier) then premium_tier else o.tier end,
        premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => 30 * o.months)
      where id = o.user_id returning premium_until into v_until;
      perform set_config('nexus.admin_write', 'off', true);
    end if;
    msg := format(E'✅ Order #%s is complete — %s is active until %s. Enjoy! ⚡', o.id, public.tier_name(o.tier), to_char(v_until, 'YYYY-MM-DD'));
  elsif p_status = 'paid' then
    msg := format('💸 Payment for order #%s received — activating your plan now.', o.id);
  elsif p_status = 'awaiting_payment' then
    msg := format('⏳ Order #%s is waiting for your payment of $%s (PayPal details are in your chat with qyopy).', o.id, o.amount_usd);
  elsif p_status = 'cancelled' then
    msg := format('❌ Order #%s was cancelled.%s', o.id, coalesce(' ' || nullif(trim(coalesce(p_note, '')), ''), ''));
  end if;
  if msg is not null then perform public.bot_say(bot, public.dm_between(bot, o.user_id), msg); end if;
end $$;

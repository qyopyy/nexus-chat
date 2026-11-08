-- Security round 3 (2026-11-08):
-- 1) Brute-force protection for public password checks (Link-in-bio page passwords, Untitled share passwords):
--    10 wrong tries per caller (user id, else hashed client IP) and 100 per target, per 15 minutes.
-- 2) Wump nearby no longer leaks a member's pinned hangout spot when their profile privacy hides it.
create table if not exists public.pw_attempts (
  id bigint generated always as identity primary key,
  scope text not null,
  target text not null,
  who text not null,
  at timestamptz not null default now()
);
create index if not exists pw_attempts_who on public.pw_attempts (scope, target, who, at desc);
create index if not exists pw_attempts_target on public.pw_attempts (scope, target, at desc);
alter table public.pw_attempts enable row level security;
revoke all on public.pw_attempts from anon, authenticated;

create or replace function public.pw_caller()
returns text language plpgsql stable security definer set search_path = '' as $$
declare h json; ip text;
begin
  if auth.uid() is not null then return 'u:' || auth.uid()::text; end if;
  begin
    h := current_setting('request.headers', true)::json;
    ip := coalesce(nullif(btrim(split_part(h->>'x-forwarded-for', ',', 1)), ''), h->>'cf-connecting-ip', h->>'x-real-ip');
  exception when others then ip := null;
  end;
  return 'ip:' || md5(coalesce(ip, 'unknown'));
end $$;

create or replace function public.pw_blocked(p_scope text, p_target text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.pw_attempts where scope = p_scope and target = p_target and who = public.pw_caller() and at > now() - interval '15 minutes') >= 10
      or (select count(*) from public.pw_attempts where scope = p_scope and target = p_target and at > now() - interval '15 minutes') >= 100;
$$;

create or replace function public.pw_fail(p_scope text, p_target text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pw_attempts (scope, target, who) values (p_scope, p_target, public.pw_caller());
  if random() < 0.02 then
    delete from public.pw_attempts where at < now() - interval '1 day';
    delete from public.bump_password_attempts where at < now() - interval '1 day';
  end if;
end $$;
revoke execute on function public.pw_caller() from public, anon, authenticated;
revoke execute on function public.pw_blocked(text, text) from public, anon, authenticated;
revoke execute on function public.pw_fail(text, text) from public, anon, authenticated;

create or replace function public.linkbio_check_password(p_username text, p_password text)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.linkbio_pages;
begin
  select * into r from public.linkbio_pages where username = lower(trim(p_username)) and published = true;
  if r.id is null then return json_build_object('ok', false, 'error', 'not found'); end if;
  if not (r.password_enabled and r.page_password_hash is not null) then
    return json_build_object('ok', true, 'token', null, 'needed', false);
  end if;
  if p_password is null or length(p_password) < 1 then return json_build_object('ok', false, 'error', 'password required'); end if;
  if public.pw_blocked('linkbio', r.id::text) then
    return json_build_object('ok', false, 'error', 'too many tries — wait 15 minutes');
  end if;
  if extensions.crypt(p_password, r.page_password_hash) <> r.page_password_hash then
    perform public.pw_fail('linkbio', r.id::text);
    return json_build_object('ok', false, 'error', 'wrong password');
  end if;
  return json_build_object('ok', true, 'token', public.linkbio_unlock_token(r), 'needed', true);
end $$;

create or replace function public.untitled_share_resolve(p_token text, p_password text default null, p_count text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.untitled_shares;
  p public.untitled_projects;
  owner public.profiles;
  tracks jsonb;
begin
  select * into s from public.untitled_shares where token = p_token and not revoked;
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  if s.expires_at is not null and s.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  select * into p from public.untitled_projects where id = s.project_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  select * into owner from public.profiles where id = s.owner_id;

  if p_count is null then
    return jsonb_build_object('ok', true, 'password', s.pass_hash is not null, 'permission', s.permission, 'title', p.title,
      'owner', owner.username, 'owner_name', owner.display_name, 'color', p.color, 'note', p.note, 'track_count', p.track_count,
      'download', s.permission in ('download', 'edit'));
  end if;

  if s.pass_hash is not null then
    if public.pw_blocked('untitled', s.id::text) then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
    if p_password is null or s.pass_hash <> extensions.crypt(p_password, s.pass_hash) then
      perform public.pw_fail('untitled', s.id::text);
      return jsonb_build_object('ok', false, 'reason', 'password');
    end if;
  end if;

  if p_count = 'view' then
    update public.untitled_shares set views = views + 1, last_at = now() where id = s.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'mime', t.mime, 'bytes', t.bytes,
    'duration', t.duration, 'position', t.position, 'path', t.path) order by t.position, t.created_at), '[]'::jsonb)
  into tracks from public.untitled_tracks t where t.project_id = p.id;

  return jsonb_build_object('ok', true, 'password', false, 'permission', s.permission,
    'share_id', s.id, 'project_id', p.id, 'title', p.title, 'note', p.note,
    'color', p.color, 'owner', owner.username, 'owner_name', owner.display_name,
    'owner_id', owner.id, 'tracks', tracks, 'download', s.permission in ('download', 'edit'));
end $$;

-- Wump nearby: pinned hangout spot only when the member's show_place allows it.
create or replace function public.bump_nearby(p_radius_m double precision default 400)
returns table(user_id uuid, lat double precision, lng double precision, accuracy_m double precision, visible text, label text, updated_at timestamptz, meters double precision,
  heading double precision, speed_mps double precision, expires_at timestamptz, age_seconds double precision, place_name text, place_locality text,
  profile_place_name text, profile_place_lat double precision, profile_place_lng double precision, username text, display_name text)
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); mylat double precision; mylng double precision; deg double precision;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select p.lat, p.lng into mylat, mylng from bump_presence p where p.user_id = me;
  if mylat is null then raise exception 'publish your location first'; end if;
  deg := greatest(0.002, least(0.25, (coalesce(p_radius_m, 400) / 111320.0) * 1.35));
  return query
  select p.user_id, p.lat, p.lng, p.accuracy_m, p.visible, p.label, p.updated_at,
    (6371000 * 2 * asin(sqrt(power(sin(radians(p.lat - mylat) / 2), 2) + cos(radians(mylat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - mylng) / 2), 2))))::double precision as meters,
    p.heading, p.speed_mps, p.expires_at, extract(epoch from (now() - p.updated_at))::double precision as age_seconds,
    p.place_name, p.place_locality,
    case when sp.ok then bp.place_name end, case when sp.ok then bp.place_lat end, case when sp.ok then bp.place_lng end,
    pr.username, pr.display_name
  from bump_presence p
  left join bump_profiles bp on bp.user_id = p.user_id
  left join profiles pr on pr.id = p.user_id
  cross join lateral (select coalesce(bp.show_place, 'friends') = 'everyone'
    or (coalesce(bp.show_place, 'friends') = 'friends' and public.bump_is_friend(me, p.user_id)) as ok) sp
  where p.user_id <> me and p.updated_at > now() - interval '20 minutes'
    and (p.expires_at is null or p.expires_at > now())
    and p.lat between mylat - deg and mylat + deg and p.lng between mylng - deg and mylng + deg
    and public.bump_can_see(p.user_id, me)
  order by meters asc limit 80;
end; $function$;

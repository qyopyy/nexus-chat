-- =====================================================================
-- Nexus chat — v2: site roles, badges, moderation, profile flair
-- Run AFTER schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profile columns
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists site_role text not null default 'member'
    check (site_role in ('owner', 'admin', 'moderator', 'vip', 'member')),
  add column if not exists avatar_decoration text check (char_length(avatar_decoration) <= 32),
  add column if not exists banner_color text check (char_length(banner_color) <= 32),
  add column if not exists bio text check (char_length(bio) <= 190),
  add column if not exists banned_until timestamptz,
  add column if not exists ban_reason text check (char_length(ban_reason) <= 200);

-- Users may only edit their cosmetic columns — never site_role / bans / username.
-- Admin RPCs set the transaction-local flag `nexus.admin_write` to pass.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('nexus.admin_write', true), '') = 'on' then return new; end if;
  if auth.uid() is null then return new; end if; -- service role / dashboard / signup triggers
  if new.site_role is distinct from old.site_role
     or new.banned_until is distinct from old.banned_until
     or new.ban_reason is distinct from old.ban_reason
     or new.username is distinct from old.username
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'You are not allowed to change that';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------
-- Rank helpers
-- ---------------------------------------------------------------------
create or replace function public.role_rank(r text)
returns int language sql immutable set search_path = '' as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'moderator' then 2 when 'vip' then 1 else 0 end;
$$;

create or replace function public.my_rank()
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select public.role_rank(site_role) from public.profiles where id = (select auth.uid())), 0);
$$;

create or replace function public.rank_of(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select public.role_rank(site_role) from public.profiles where id = p_user), 0);
$$;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select banned_until > now() from public.profiles where id = (select auth.uid())), false);
$$;

-- First account ever becomes the site Owner
create or replace function public.first_user_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where site_role = 'owner' and id <> new.id) then
    perform set_config('nexus.admin_write', 'on', true);
    update public.profiles set site_role = 'owner' where id = new.id;
    perform set_config('nexus.admin_write', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_created_owner on public.profiles;
create trigger on_profile_created_owner
  after insert on public.profiles
  for each row execute function public.first_user_owner();

-- Promote an existing first user if the project already had accounts
update public.profiles set site_role = 'owner'
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where site_role = 'owner');

-- ---------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------
create table if not exists public.badges (
  id          uuid primary key default gen_random_uuid(),
  key         text unique,
  name        text not null check (char_length(name) between 1 and 32),
  icon        text not null check (char_length(icon) between 1 and 16),
  color       text not null default '#5865F2',
  description text check (char_length(description) <= 120),
  priority    int not null default 0,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.user_badges (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge_id   uuid not null references public.badges (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, badge_id)
);
create index if not exists user_badges_badge_idx on public.user_badges (badge_id);

insert into public.badges (key, name, icon, color, description, priority) values
  ('verified',  'Verified',        '✔️', '#2AABEE', 'Verified account', 90),
  ('developer', 'Developer',       '⚙️', '#5865F2', 'Builds Nexus', 80),
  ('partner',   'Partner',         '🤝', '#3BA55D', 'Official partner', 70),
  ('artist',    'Artist',          '🎤', '#9B59B6', 'Recording artist', 60),
  ('producer',  'Producer',        '🎹', '#1ABC9C', 'Music producer', 55),
  ('booster',   'Booster',         '🚀', '#FF73FA', 'Supports the community', 50),
  ('early',     'Early Supporter', '🌟', '#FAA61A', 'Here since the beginning', 40),
  ('bughunter', 'Bug Hunter',      '🐛', '#3BA55D', 'Reported a bug', 30),
  ('og',        'OG',              '🔥', '#ED4245', 'Original member', 20)
on conflict (key) do nothing;

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists "badges readable" on public.badges;
create policy "badges readable" on public.badges for select to authenticated using (true);
drop policy if exists "user_badges readable" on public.user_badges;
create policy "user_badges readable" on public.user_badges for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table if not exists public.admin_actions (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  target_id  uuid references public.profiles (id) on delete set null,
  action     text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);
alter table public.admin_actions enable row level security;
drop policy if exists "staff read audit" on public.admin_actions;
create policy "staff read audit" on public.admin_actions for select to authenticated using (public.my_rank() >= 2);

create or replace function public.log_admin(p_target uuid, p_action text, p_detail jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  insert into public.admin_actions (actor_id, target_id, action, detail) values (auth.uid(), p_target, p_action, p_detail);
end;
$$;

-- Guard: caller must have at least `need` rank and outrank the target
create or replace function public.assert_can_moderate(p_target uuid, need int)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  mine int := public.my_rank();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if mine < need then raise exception 'You do not have permission to do that'; end if;
  if p_target is not null and p_target <> auth.uid() and public.rank_of(p_target) >= mine then
    raise exception 'You can only manage members ranked below you';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old text;
begin
  perform public.assert_can_moderate(p_user, 3);
  if p_user = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if public.role_rank(p_role) >= public.my_rank() then raise exception 'You can only give roles below your own'; end if;
  if p_role not in ('admin', 'moderator', 'vip', 'member') then raise exception 'Unknown role'; end if;
  select site_role into old from public.profiles where id = p_user;
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles set site_role = p_role where id = p_user;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(p_user, 'set_role', jsonb_build_object('from', old, 'to', p_role));
end;
$$;

create or replace function public.admin_grant_badge(p_user uuid, p_badge uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(null, 3);
  insert into public.user_badges (user_id, badge_id, granted_by) values (p_user, p_badge, auth.uid())
  on conflict (user_id, badge_id) do update set revoked_at = null, granted_by = auth.uid(), granted_at = now();
  perform public.log_admin(p_user, 'grant_badge', jsonb_build_object('badge', (select name from public.badges where id = p_badge)));
end;
$$;

create or replace function public.admin_revoke_badge(p_user uuid, p_badge uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(null, 3);
  update public.user_badges set revoked_at = now() where user_id = p_user and badge_id = p_badge;
  perform public.log_admin(p_user, 'revoke_badge', jsonb_build_object('badge', (select name from public.badges where id = p_badge)));
end;
$$;

create or replace function public.admin_create_badge(p_name text, p_icon text, p_color text, p_description text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  bid uuid;
begin
  perform public.assert_can_moderate(null, 3);
  insert into public.badges (name, icon, color, description, priority)
  values (trim(p_name), trim(p_icon), p_color, nullif(trim(coalesce(p_description, '')), ''), 10)
  returning id into bid;
  perform public.log_admin(null, 'create_badge', jsonb_build_object('badge', p_name));
  return bid;
end;
$$;

create or replace function public.admin_delete_badge(p_badge uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  nm text;
begin
  perform public.assert_can_moderate(null, 3);
  update public.badges set archived_at = now() where id = p_badge returning name into nm;
  update public.user_badges set revoked_at = now() where badge_id = p_badge and revoked_at is null;
  perform public.log_admin(null, 'delete_badge', jsonb_build_object('badge', nm));
end;
$$;

-- p_minutes null = permanent
create or replace function public.admin_ban(p_user uuid, p_minutes int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(p_user, 2);
  if p_user = auth.uid() then raise exception 'You cannot ban yourself'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles
  set banned_until = case when p_minutes is null then 'infinity'::timestamptz else now() + make_interval(mins => p_minutes) end,
      ban_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_user;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(p_user, case when p_minutes is null then 'ban' else 'timeout' end,
    jsonb_build_object('minutes', p_minutes, 'reason', p_reason));
end;
$$;

create or replace function public.admin_unban(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(p_user, 2);
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles set banned_until = null, ban_reason = null where id = p_user;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(p_user, 'unban');
end;
$$;

create or replace function public.admin_reset_profile(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(p_user, 2);
  update public.profiles
  set avatar_url = null, custom_status = null, bio = null, avatar_decoration = null
  where id = p_user;
  perform public.log_admin(p_user, 'reset_profile');
end;
$$;

create or replace function public.mod_delete_message(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
begin
  select author_id into author from public.messages where id = p_id;
  if author is null then raise exception 'Message not found'; end if;
  if author <> auth.uid() then
    perform public.assert_can_moderate(author, 2);
    perform public.log_admin(author, 'delete_message', jsonb_build_object('message', p_id));
  end if;
  update public.messages set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.admin_list_users(p_search text default '', p_limit int default 100)
returns table (
  id uuid, username text, display_name text, avatar_color text, avatar_url text,
  site_role text, banned_until timestamptz, ban_reason text, created_at timestamptz,
  email text, message_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  return query
  select p.id, p.username, p.display_name, p.avatar_color, p.avatar_url, p.site_role, p.banned_until, p.ban_reason, p.created_at,
         case when public.my_rank() >= 3 then u.email::text else null end,
         (select count(*) from public.messages m where m.author_id = p.id)
  from public.profiles p
  left join auth.users u on u.id = p.id
  where coalesce(p_search, '') = ''
     or p.username ilike '%' || p_search || '%'
     or p.display_name ilike '%' || p_search || '%'
  order by public.role_rank(p.site_role) desc, p.created_at
  limit least(greatest(p_limit, 1), 500);
end;
$$;

create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'messages', (select count(*) from public.messages),
    'messages_24h', (select count(*) from public.messages where created_at > now() - interval '24 hours'),
    'spaces', (select count(*) from public.spaces),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'staff', (select count(*) from public.profiles where public.role_rank(site_role) >= 2)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Enforce bans
-- ---------------------------------------------------------------------
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_conversation_member(conversation_id) and not public.is_banned());

drop policy if exists "reactions insert" on public.message_reactions;
create policy "reactions insert" on public.message_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_conversation_member(conversation_id) and not public.is_banned());

drop policy if exists "call_events insert" on public.call_events;
create policy "call_events insert" on public.call_events for insert to authenticated
  with check (caller_id = (select auth.uid()) and public.is_conversation_member(conversation_id) and not public.is_banned());

create or replace function public.can_access_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_topic = 'online' then return true; end if;
  if public.is_banned() then return false; end if;
  if p_topic like 'call:%' or p_topic like 'chat:%' then
    begin
      v_id := split_part(p_topic, ':', 2)::uuid;
    exception when others then
      return false;
    end;
    return public.is_conversation_member(v_id);
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------
-- Realtime + storage
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.user_badges;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.badges;
  exception when duplicate_object then null;
  end;
end $$;

-- allow animated avatars up to 10 MB
update storage.buckets set file_size_limit = 10485760 where id = 'avatars';

drop policy if exists "avatars own read" on storage.objects;
create policy "avatars own read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

revoke execute on all functions in schema public from anon;

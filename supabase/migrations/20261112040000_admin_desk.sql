-- Admin desk. Extends site_role / my_rank() / admin_actions / site_settings / site_notices.
-- qyopy is the Nexus site owner. Verified on the Nexus Chat database (2026-11-12):
--   profiles.username = 'qyopy'
--   profiles.id       = 46265ba4-ad41-4ed8-8262-2ed7cd35389d
--   site_role         = owner
-- The Vibely screenshot handle @owner / owner@qyopy.hu is not this profile.
-- This migration reaffirms that row and blocks other members from demoting, banning,
-- resetting, or signing it out. Acetate admin is the same rank (my_rank() >= 3).

create or replace function public.protect_site_owner(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is null or auth.uid() is not distinct from p_user then
    return;
  end if;
  if exists (
    select 1 from public.profiles
    where id = p_user
      and (id = '46265ba4-ad41-4ed8-8262-2ed7cd35389d' or username = 'qyopy')
  ) then
    raise exception 'The site owner account cannot be changed by another member';
  end if;
end;
$$;

revoke all on function public.protect_site_owner(uuid) from public, anon, authenticated;

do $$
begin
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles
  set site_role = 'owner'
  where id = '46265ba4-ad41-4ed8-8262-2ed7cd35389d'
    and username = 'qyopy'
    and site_role is distinct from 'owner';
  perform set_config('nexus.admin_write', 'off', true);
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old text;
begin
  perform public.assert_can_moderate(p_user, 3);
  perform public.protect_site_owner(p_user);
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

create or replace function public.admin_ban(p_user uuid, p_minutes int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(p_user, 2);
  perform public.protect_site_owner(p_user);
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

create or replace function public.admin_revoke_sessions(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.assert_can_moderate(p_user, 3);
  perform public.protect_site_owner(p_user);
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  perform public.log_admin(p_user, 'revoke_sessions', jsonb_build_object('sessions', n));
  return n;
end;
$$;

create or replace function public.admin_reset_profile(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_moderate(p_user, 2);
  perform public.protect_site_owner(p_user);
  update public.profiles
  set avatar_url = null, custom_status = null, bio = null, avatar_decoration = null
  where id = p_user;
  perform public.log_admin(p_user, 'reset_profile');
end;
$$;

alter table public.site_settings
  add column if not exists phone_link boolean not null default true,
  add column if not exists locator boolean not null default true,
  add column if not exists live_stage boolean not null default true,
  add column if not exists vault_uploads boolean not null default true;

create or replace function public.feature_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_key
      when 'phone_link' then s.phone_link
      when 'locator' then s.locator
      when 'live_stage' then s.live_stage
      when 'vault_uploads' then s.vault_uploads
      else true
    end
    from public.site_settings s
    where s.id = 1
  ), true);
$$;

create or replace function public.admin_set_flags(
  p_phone boolean,
  p_locator boolean,
  p_stage boolean,
  p_vault boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  update public.site_settings
  set phone_link = p_phone,
      locator = p_locator,
      live_stage = p_stage,
      vault_uploads = p_vault,
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1;
  perform public.log_admin(null, 'set_flags', jsonb_build_object(
    'phone_link', p_phone, 'locator', p_locator, 'live_stage', p_stage, 'vault_uploads', p_vault
  ));
end;
$$;

revoke all on function public.admin_set_flags(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_set_flags(boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.admin_set_storage_policy(
  p_shelf_bytes bigint,
  p_vault_bytes bigint,
  p_file_bytes bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_shelf_bytes is null or p_shelf_bytes < 1048576 or p_shelf_bytes > 5497558138880 then
    raise exception 'Library quota must be between 1 MB and 5 TB';
  end if;
  if p_file_bytes is null or p_file_bytes < 1048576 or p_file_bytes > 5368709120 then
    raise exception 'Per-file limit must be between 1 MB and 5 GB';
  end if;
  if p_vault_bytes is not null and (p_vault_bytes < 1048576 or p_vault_bytes > 5497558138880) then
    raise exception 'Vault cap must be empty (unlimited) or between 1 MB and 5 TB';
  end if;
  update public.acetate_storage_policy
  set shelf_free_bytes = p_shelf_bytes,
      vault_quota_bytes = p_vault_bytes,
      file_bytes = p_file_bytes,
      updated_at = now()
  where id = 1;
  perform public.log_admin(null, 'storage_policy', jsonb_build_object(
    'shelf_free_bytes', p_shelf_bytes,
    'vault_quota_bytes', p_vault_bytes,
    'file_bytes', p_file_bytes
  ));
end;
$$;

revoke all on function public.admin_set_storage_policy(bigint, bigint, bigint) from public, anon;
grant execute on function public.admin_set_storage_policy(bigint, bigint, bigint) to authenticated;

create or replace function public.admin_set_notice(p_body text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  update public.site_notices
  set body = left(btrim(coalesce(p_body, '')), 280),
      active = coalesce(p_active, false),
      author_id = auth.uid(),
      updated_at = now()
  where id = 'global';
  perform public.log_admin(null, 'notice', jsonb_build_object('active', p_active, 'body', left(coalesce(p_body, ''), 80)));
end;
$$;

revoke all on function public.admin_set_notice(text, boolean) from public, anon;
grant execute on function public.admin_set_notice(text, boolean) to authenticated;

create or replace function public.set_channel_stage(p_conv uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
begin
  if coalesce(p_on, false) and not public.feature_on('live_stage') then
    raise exception 'Live Stage is turned off';
  end if;
  select * into c from public.conversations where id = p_conv;
  if c.id is null or c.space_id is null then
    raise exception 'Channel not found';
  end if;
  if c.kind is distinct from 'voice' then
    raise exception 'Live Stage is a voice room';
  end if;
  if not public.is_space_staff(c.space_id) then
    raise exception 'Staff only';
  end if;
  update public.conversations set stage = coalesce(p_on, false) where id = p_conv;
end;
$$;

create table if not exists public.content_reports (
  id           bigint generated always as identity primary key,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('track', 'status', 'share')),
  target_id    uuid not null,
  reason       text not null check (char_length(reason) between 1 and 500),
  status       text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at   timestamptz not null default now(),
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz
);
create index if not exists content_reports_open_idx
  on public.content_reports (created_at desc) where status = 'open';
alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;
grant select, insert on public.content_reports to authenticated;
drop policy if exists content_reports_read on public.content_reports;
create policy content_reports_read on public.content_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.my_rank() >= 3);
drop policy if exists content_reports_insert on public.content_reports;
create policy content_reports_insert on public.content_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create or replace function public.report_content(p_kind text, p_target uuid, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid bigint;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_kind not in ('track', 'status', 'share') then raise exception 'Unknown report'; end if;
  if p_target is null then raise exception 'Nothing to report'; end if;
  if (select count(*) from public.content_reports
      where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'You have sent a lot of reports. Try again in a bit.';
  end if;
  if exists (
    select 1 from public.content_reports
    where reporter_id = auth.uid() and kind = p_kind and target_id = p_target and status = 'open'
  ) then
    raise exception 'You already reported that';
  end if;
  insert into public.content_reports (reporter_id, kind, target_id, reason)
  values (auth.uid(), p_kind, p_target, left(btrim(coalesce(p_reason, 'other')), 500))
  returning id into rid;
  return rid;
end;
$$;

revoke all on function public.report_content(text, uuid, text) from public, anon;
grant execute on function public.report_content(text, uuid, text) to authenticated;

create or replace function public.admin_resolve_content(p_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.content_reports;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_status not in ('removed', 'dismissed', 'open') then raise exception 'Bad status'; end if;
  update public.content_reports
  set status = p_status,
      resolved_by = case when p_status = 'open' then null else auth.uid() end,
      resolved_at = case when p_status = 'open' then null else now() end
  where id = p_id
  returning * into r;
  if not found then raise exception 'Report not found'; end if;
  if p_status = 'removed' then
    if r.kind = 'track' then
      perform public.admin_remove_track(r.target_id);
    elsif r.kind = 'status' then
      perform public.admin_remove_status(r.target_id);
    elsif r.kind = 'share' then
      perform public.admin_revoke_share(r.target_id);
    end if;
  end if;
  perform public.log_admin(null, 'content_' || p_status, jsonb_build_object('report', p_id, 'kind', r.kind, 'target', r.target_id));
end;
$$;

create or replace function public.admin_remove_track(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select owner_id into owner from public.acetate_tracks where id = p_id;
  if owner is null then raise exception 'Track not found'; end if;
  delete from storage.objects
  where bucket_id = 'acetate'
    and name in (
      select path from public.acetate_versions where track_id = p_id
      union
      select artwork_path from public.acetate_tracks where id = p_id and artwork_path is not null
    );
  delete from public.acetate_tracks where id = p_id;
  perform public.log_admin(owner, 'remove_track', jsonb_build_object('track', p_id));
end;
$$;

create or replace function public.admin_remove_status(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select user_id into owner from public.nexus_statuses where id = p_id;
  if owner is null then raise exception 'Status not found'; end if;
  delete from public.nexus_statuses where id = p_id;
  perform public.log_admin(owner, 'remove_status', jsonb_build_object('status', p_id));
end;
$$;

create or replace function public.admin_revoke_share(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select owner_id into owner from public.acetate_shares where id = p_id;
  if owner is null then raise exception 'Share not found'; end if;
  update public.acetate_shares set revoked = true where id = p_id;
  perform public.log_admin(owner, 'revoke_share', jsonb_build_object('share', p_id));
end;
$$;

revoke all on function public.admin_resolve_content(bigint, text) from public, anon;
revoke all on function public.admin_remove_track(uuid) from public, anon;
revoke all on function public.admin_remove_status(uuid) from public, anon;
revoke all on function public.admin_revoke_share(uuid) from public, anon;
grant execute on function public.admin_resolve_content(bigint, text) to authenticated;
grant execute on function public.admin_remove_track(uuid) to authenticated;
grant execute on function public.admin_remove_status(uuid) to authenticated;
grant execute on function public.admin_revoke_share(uuid) to authenticated;

create or replace function public.admin_desk_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  policy public.acetate_storage_policy;
  flags public.site_settings;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select * into policy from public.acetate_storage_policy where id = 1;
  select * into flags from public.site_settings where id = 1;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'active_7d', (select count(distinct author_id) from public.messages where created_at > now() - interval '7 days'),
    'active_1d', (select count(distinct user_id) from public.nexus_handsets where last_seen > now() - interval '1 day'),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'open_content_reports', (select count(*) from public.content_reports where status = 'open'),
    'storage_bytes', (select coalesce(sum(bytes), 0) from public.acetate_stored),
    'vault_bytes', (select coalesce(sum(bytes), 0) from public.acetate_stored where library = 'vault'),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as n
        from public.profiles
        where created_at > now() - interval '14 days'
        group by 1
      ) s
    ), '[]'::jsonb),
    'uploads', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as n
        from public.acetate_versions
        where created_at > now() - interval '14 days'
        group by 1
      ) u
    ), '[]'::jsonb),
    'flags', jsonb_build_object(
      'phone_link', coalesce(flags.phone_link, true),
      'locator', coalesce(flags.locator, true),
      'live_stage', coalesce(flags.live_stage, true),
      'vault_uploads', coalesce(flags.vault_uploads, true)
    ),
    'policy', jsonb_build_object(
      'shelf_free_bytes', policy.shelf_free_bytes,
      'vault_quota_bytes', policy.vault_quota_bytes,
      'file_bytes', policy.file_bytes
    )
  );
end;
$$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  email text;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select * into p from public.profiles where id = p_user;
  if p.id is null then raise exception 'User not found'; end if;
  select u.email::text into email from auth.users u where u.id = p_user;
  return jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'site_role', p.site_role,
    'email', email,
    'created_at', p.created_at,
    'banned_until', p.banned_until,
    'ban_reason', p.ban_reason,
    'premium_tier', p.premium_tier,
    'premium_until', p.premium_until,
    'storage', public.acetate_my_storage_for(p_user),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'device_id', h.device_id,
        'label', h.label,
        'kind', h.kind,
        'platform', h.platform,
        'model', h.model,
        'last_seen', h.last_seen,
        'control_enabled', h.control_enabled,
        'focus_until', h.focus_until
      ) order by h.last_seen desc)
      from public.nexus_handsets h where h.user_id = p_user
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'user_agent', s.user_agent,
        'ip', s.ip::text
      ) order by s.updated_at desc)
      from (
        select created_at, updated_at, user_agent, ip
        from auth.sessions
        where user_id = p_user
        order by updated_at desc
        limit 12
      ) s
    ), '[]'::jsonb),
    'reports', (select count(*) from public.reports where target_user = p_user and status = 'open')
  );
end;
$$;

create or replace function public.admin_storage_top(p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'path', s.path,
      'bytes', s.bytes,
      'library', s.library,
      'owner_id', s.owner_id,
      'username', p.username
    ) order by s.bytes desc)
    from (
      select path, bytes, library, owner_id
      from public.acetate_stored
      order by bytes desc
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
    ) s
    join public.profiles p on p.id = s.owner_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_moderation_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reason', r.reason, 'excerpt', r.excerpt, 'target_user', r.target_user,
        'message_id', r.message_id, 'created_at', r.created_at
      ) order by r.created_at desc)
      from (
        select id, reason, excerpt, target_user, message_id, created_at
        from public.reports where status = 'open'
        order by created_at desc limit 40
      ) r
    ), '[]'::jsonb),
    'content', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'target_id', c.target_id, 'reason', c.reason, 'created_at', c.created_at
      ) order by c.created_at desc)
      from (
        select id, kind, target_id, reason, created_at
        from public.content_reports where status = 'open'
        order by created_at desc limit 40
      ) c
    ), '[]'::jsonb),
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'owner_id', s.owner_id, 'username', p.username, 'kind', s.kind,
        'listing', s.listing, 'revoked', s.revoked, 'expires_at', s.expires_at, 'created_at', s.created_at
      ) order by s.created_at desc)
      from (
        select id, owner_id, kind, listing, revoked, expires_at, created_at
        from public.acetate_shares
        order by created_at desc limit 30
      ) s
      join public.profiles p on p.id = s.owner_id
    ), '[]'::jsonb),
    'statuses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'user_id', n.user_id, 'username', p.username, 'kind', n.kind,
        'body', n.body, 'audience', n.audience, 'created_at', n.created_at
      ) order by n.created_at desc)
      from (
        select id, user_id, kind, body, audience, created_at
        from public.nexus_statuses
        where expires_at > now()
        order by created_at desc limit 30
      ) n
      join public.profiles p on p.id = n.user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_desk_overview() from public, anon;
revoke all on function public.admin_user_detail(uuid) from public, anon;
revoke all on function public.admin_storage_top(int) from public, anon;
revoke all on function public.admin_moderation_queue() from public, anon;
grant execute on function public.admin_desk_overview() to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_storage_top(int) to authenticated;
grant execute on function public.admin_moderation_queue() to authenticated;

-- Distribution panel entry. Default on. Admins hide it from Acetate and Nexus with admin_set_flags.
-- Not applied to the live database.

alter table public.site_settings
  add column if not exists distribution_panel boolean not null default true;

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
      when 'format_convert' then s.format_convert
      when 'soundcloud_import' then s.soundcloud_import
      when 'link_import' then s.link_import
      when 'distribution_panel' then s.distribution_panel
      else true
    end
    from public.site_settings s
    where s.id = 1
  ), true);
$$;

drop function if exists public.admin_set_flags(boolean, boolean, boolean, boolean, boolean, boolean, boolean);

create or replace function public.admin_set_flags(
  p_phone boolean,
  p_locator boolean,
  p_stage boolean,
  p_vault boolean,
  p_format boolean default true,
  p_soundcloud boolean default true,
  p_links boolean default true,
  p_panel boolean default true
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
      format_convert = p_format,
      soundcloud_import = p_soundcloud,
      link_import = p_links,
      distribution_panel = p_panel,
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1;
  perform public.log_admin(null, 'set_flags', jsonb_build_object(
    'phone_link', p_phone,
    'locator', p_locator,
    'live_stage', p_stage,
    'vault_uploads', p_vault,
    'format_convert', p_format,
    'soundcloud_import', p_soundcloud,
    'link_import', p_links,
    'distribution_panel', p_panel
  ));
end;
$$;

revoke all on function public.admin_set_flags(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_set_flags(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

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
      'vault_uploads', coalesce(flags.vault_uploads, true),
      'format_convert', coalesce(flags.format_convert, true),
      'soundcloud_import', coalesce(flags.soundcloud_import, true),
      'link_import', coalesce(flags.link_import, true),
      'distribution_panel', coalesce(flags.distribution_panel, true)
    ),
    'policy', jsonb_build_object(
      'shelf_free_bytes', policy.shelf_free_bytes,
      'vault_quota_bytes', policy.vault_quota_bytes,
      'file_bytes', policy.file_bytes
    )
  );
end;
$$;

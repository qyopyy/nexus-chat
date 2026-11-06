-- Nexus Link: more badges, verified on public /bio pages, richer admin list.

insert into public.badges (key, name, icon, color, description, priority) values
  ('creator',     'Creator',      '✨', '#A855F7', 'Content creator', 78),
  ('legend',      'Legend',       '🏆', '#F59E0B', 'Community legend', 115),
  ('supporter',   'Supporter',    '💜', '#C084FC', 'Supports Nexus', 48),
  ('beta',        'Beta',         '🧪', '#22D3EE', 'Beta tester', 35),
  ('streaming',   'Streaming',    '📡', '#F43F5E', 'Live streamer', 72),
  ('label',       'Label',        '🏷️', '#F97316', 'Record label', 76),
  ('certified',   'Certified',    '🏅', '#38BDF8', 'Certified creator', 88),
  ('nexus_link',  'Nexus Link',   '🔗', '#C084FC', 'Nexus Link pioneer', 65),
  ('community',   'Community',    '👥', '#34D399', 'Community builder', 52),
  ('news',        'News',         '📰', '#60A5FA', 'News & media', 58),
  ('influencer',  'Influencer',   '📣', '#FB7185', 'Influencer', 74),
  ('staff',       'Staff',        '🛠️', '#F87171', 'Nexus staff', 82)
on conflict (key) do update set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color,
  description = excluded.description,
  priority = excluded.priority,
  archived_at = null;

-- Ensure classic verified badge stays high priority with a clear check icon.
update public.badges
set name = 'Verified',
    icon = '✓',
    color = '#2AABEE',
    priority = 100,
    description = 'Verified notable person',
    archived_at = null
where key = 'verified';

create or replace function public.linkbio_owner_badges(p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', b.key,
      'name', b.name,
      'icon', b.icon,
      'color', b.color,
      'description', b.description,
      'priority', b.priority
    ) order by b.priority desc, b.name)
    from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
    where ub.user_id = p_owner
      and ub.revoked_at is null
      and b.archived_at is null
      and b.key is not null
  ), '[]'::jsonb);
$$;

create or replace function public.linkbio_owner_verified(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_owner and p.site_role in ('owner', 'admin')
  )
  or exists (
    select 1 from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
    where ub.user_id = p_owner
      and ub.revoked_at is null
      and b.key = 'verified'
      and b.archived_at is null
  )
  or exists (
    select 1 from public.profiles p
    where p.id = p_owner
      and p.premium_tier is not null
      and (p.premium_until is null or p.premium_until > now())
  );
$$;

create or replace function public.linkbio_page_json(r public.linkbio_pages, p_owner boolean default false)
returns json
language plpgsql
stable
set search_path to ''
as $fn$
declare
  owner_role text;
begin
  select site_role into owner_role from public.profiles where id = r.owner_id;
  return json_build_object(
    'id', r.id,
    'owner_id', case when p_owner then r.owner_id else null end,
    'username', r.username,
    'display_name', r.display_name,
    'bio', r.bio,
    'avatar_url', r.avatar_url,
    'links', coalesce(r.links, '[]'::jsonb),
    'theme', r.theme,
    'background', r.background,
    'animated_bg', r.animated_bg,
    'font', r.font,
    'glow', r.glow,
    'accent', r.accent,
    'premium', public.linkbio_is_premium(r),
    'premium_until', case when p_owner then r.premium_until else null end,
    'published', r.published,
    'view_count', r.view_count,
    'password_enabled', r.password_enabled,
    'password_protected', r.password_enabled and r.page_password_hash is not null,
    'button_style', r.button_style,
    'layout', r.layout,
    'show_views', r.show_views,
    'show_branding', r.show_branding,
    'nsfw', r.nsfw,
    'seo_title', r.seo_title,
    'seo_description', r.seo_description,
    'banner_url', r.banner_url,
    'music_url', r.music_url,
    'custom_status', r.custom_status,
    'verified', public.linkbio_owner_verified(r.owner_id),
    'site_role', owner_role,
    'badges', public.linkbio_owner_badges(r.owner_id),
    'created_at', case when p_owner then r.created_at else null end,
    'updated_at', case when p_owner then r.updated_at else null end
  );
end;
$fn$;

create or replace function public.linkbio_admin_list()
returns json
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.site_role in ('owner','admin','moderator')) then
    raise exception 'forbidden';
  end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', lp.id,
      'owner_id', lp.owner_id,
      'username', lp.username,
      'display_name', lp.display_name,
      'theme', lp.theme,
      'premium', public.linkbio_is_premium(lp),
      'premium_until', lp.premium_until,
      'published', lp.published,
      'view_count', lp.view_count,
      'owner_username', pr.username,
      'owner_role', pr.site_role,
      'verified', public.linkbio_owner_verified(lp.owner_id),
      'badges', public.linkbio_owner_badges(lp.owner_id),
      'updated_at', lp.updated_at
    ) order by lp.updated_at desc)
    from public.linkbio_pages lp
    join public.profiles pr on pr.id = lp.owner_id
  ), '[]'::json);
end;
$fn$;

-- Grant / revoke verified (and any badge by key) from Nexus Link admin.
create or replace function public.linkbio_admin_set_badge(p_owner uuid, p_badge_key text, p_on boolean)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  bid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.site_role in ('owner','admin')) then
    raise exception 'forbidden';
  end if;
  if p_owner is null then raise exception 'missing owner'; end if;
  select id into bid from public.badges where key = lower(trim(p_badge_key)) and archived_at is null;
  if bid is null then raise exception 'unknown badge'; end if;

  if coalesce(p_on, false) then
    insert into public.user_badges (user_id, badge_id, granted_by)
    values (p_owner, bid, me)
    on conflict (user_id, badge_id) do update set revoked_at = null, granted_by = me, granted_at = now();
  else
    update public.user_badges
    set revoked_at = now()
    where user_id = p_owner and badge_id = bid and revoked_at is null;
  end if;

  insert into public.admin_actions (actor_id, action, target_id, detail)
  values (me, 'linkbio_badge', p_owner, jsonb_build_object('badge', p_badge_key, 'on', p_on));

  return public.linkbio_admin_list();
end;
$fn$;

grant execute on function public.linkbio_owner_badges(uuid) to anon, authenticated;
grant execute on function public.linkbio_owner_verified(uuid) to anon, authenticated;
grant execute on function public.linkbio_admin_set_badge(uuid, text, boolean) to authenticated;

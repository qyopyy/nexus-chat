-- Nexus Link malware / abuse protections + admin networking tools.

alter table public.linkbio_pages
  add column if not exists suspended boolean not null default false,
  add column if not exists suspend_reason text;

create table if not exists public.linkbio_blocked_hosts (
  host text primary key,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.linkbio_blocked_hosts enable row level security;

create table if not exists public.linkbio_security_events (
  id bigserial primary key,
  kind text not null,
  page_id uuid references public.linkbio_pages (id) on delete set null,
  username text,
  detail text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists linkbio_security_events_at_idx
  on public.linkbio_security_events (created_at desc);

alter table public.linkbio_security_events enable row level security;

drop policy if exists linkbio_blocked_hosts_staff on public.linkbio_blocked_hosts;
create policy linkbio_blocked_hosts_staff on public.linkbio_blocked_hosts
  for all to authenticated
  using (public.my_rank() >= 2)
  with check (public.my_rank() >= 2);

drop policy if exists linkbio_security_events_staff on public.linkbio_security_events;
create policy linkbio_security_events_staff on public.linkbio_security_events
  for select to authenticated
  using (public.my_rank() >= 2);

create or replace function public.linkbio_url_is_safe(p_url text)
returns boolean
language plpgsql
immutable
set search_path to ''
as $fn$
declare
  u text := lower(trim(coalesce(p_url, '')));
begin
  if u = '' then return false; end if;
  if u ~* '^(javascript|data|vbscript|file|blob):' then return false; end if;
  if u !~* '^https?://' then return false; end if;
  if u ~* '@' and u ~* '^https?://[^/]*:' then return false; end if;
  if u ~* '\.(exe|dll|msi|bat|cmd|ps1|vbs|js|jse|wsf|hta|scr|apk|dmg|pkg|sh|php|asp|aspx|jsp)(\?|#|$)' then
    return false;
  end if;
  if u ~* '(malware\.|phishing\.|ransom\.|cryptolocker|coinhive|grabify|iplogger)' then
    return false;
  end if;
  return true;
end;
$fn$;

create or replace function public.linkbio_links_are_safe(p_links jsonb)
returns boolean
language plpgsql
immutable
set search_path to ''
as $fn$
declare
  el jsonb;
begin
  if p_links is null then return true; end if;
  if jsonb_typeof(p_links) <> 'array' then return false; end if;
  for el in select * from jsonb_array_elements(p_links)
  loop
    if not public.linkbio_url_is_safe(el->>'url') then
      return false;
    end if;
  end loop;
  return true;
end;
$fn$;

create or replace function public.linkbio_log_security(
  p_kind text,
  p_username text default null,
  p_detail text default null,
  p_page uuid default null,
  p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  insert into public.linkbio_security_events (kind, page_id, username, detail, ip_hash)
  values (
    left(coalesce(p_kind, 'event'), 64),
    p_page,
    nullif(left(lower(trim(coalesce(p_username, ''))), 32), ''),
    nullif(left(coalesce(p_detail, ''), 500), ''),
    nullif(left(coalesce(p_ip_hash, ''), 64), '')
  );
end;
$fn$;

-- Expose suspended state on page JSON (owner sees reason)
create or replace function public.linkbio_page_json(r public.linkbio_pages, p_owner boolean default false)
returns json
language plpgsql
stable
set search_path to ''
as $fn$
declare
  owner_role text;
  prest json;
begin
  select site_role into owner_role from public.profiles where id = r.owner_id;
  begin
    prest := public.linkbio_presence(r.username);
  exception when others then
    prest := json_build_object('status', 'offline');
  end;
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
    'suspended', coalesce(r.suspended, false),
    'suspend_reason', case when p_owner then r.suspend_reason else null end,
    'view_count', r.view_count,
    'password_enabled', r.password_enabled,
    'password_protected', r.password_enabled and r.page_password_hash is not null,
    'button_style', r.button_style,
    'layout', r.layout,
    'show_views', r.show_views,
    'show_branding', r.show_branding,
    'show_presence', coalesce(r.show_presence, true),
    'nsfw', r.nsfw,
    'seo_title', r.seo_title,
    'seo_description', r.seo_description,
    'banner_url', r.banner_url,
    'music_url', r.music_url,
    'custom_status', r.custom_status,
    'verified', public.linkbio_owner_verified(r.owner_id),
    'site_role', owner_role,
    'badges', public.linkbio_owner_badges(r.owner_id),
    'presence', prest,
    'created_at', case when p_owner then r.created_at else null end,
    'updated_at', case when p_owner then r.updated_at else null end
  );
end;
$fn$;

-- Patch public fetch: hide suspended pages (keep unlock-token behavior)
create or replace function public.linkbio_public(p_username text, p_unlock text default null)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  r public.linkbio_pages;
  j json;
  locked boolean;
begin
  select * into r from public.linkbio_pages
  where username = lower(trim(p_username)) and published = true;
  if r.id is null then return null; end if;
  if coalesce(r.suspended, false) then
    return json_build_object(
      'id', r.id,
      'username', r.username,
      'display_name', r.display_name,
      'suspended', true,
      'suspend_reason', coalesce(r.suspend_reason, 'This Nexus Link was suspended for security.'),
      'published', false,
      'locked', true,
      'links', '[]'::jsonb,
      'theme', coalesce(r.theme, 'midnight'),
      'background', 'none',
      'animated_bg', false,
      'font', 'glow',
      'glow', false,
      'accent', null,
      'premium', false,
      'view_count', 0,
      'show_branding', true,
      'bio', null,
      'music_url', null,
      'banner_url', null,
      'custom_status', null
    );
  end if;
  locked := r.password_enabled and r.page_password_hash is not null
    and (p_unlock is null or p_unlock <> public.linkbio_unlock_token(r));
  j := public.linkbio_page_json(r, false);
  if locked then
    j := (j::jsonb || jsonb_build_object(
      'locked', true,
      'bio', null,
      'links', '[]'::jsonb,
      'music_url', null,
      'banner_url', null,
      'custom_status', null
    ))::json;
  else
    j := (j::jsonb || jsonb_build_object('locked', false))::json;
  end if;
  return j;
end;
$fn$;

-- Reject unsafe links on save (malware / phishing)
create or replace function public.linkbio_save(p jsonb)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  r public.linkbio_pages;
  new_user text;
  pw text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.linkbio_pages where owner_id = me;
  if r.id is null then raise exception 'create page first'; end if;
  if coalesce(r.suspended, false) then
    raise exception 'page suspended — contact Nexus Link admin';
  end if;

  if p ? 'username' then
    new_user := lower(trim(p->>'username'));
    if new_user !~ '^[a-z0-9_]{2,24}$' then raise exception 'invalid username'; end if;
    if exists (select 1 from public.linkbio_pages where username = new_user and id <> r.id) then
      raise exception 'username taken';
    end if;
    r.username := new_user;
  end if;

  if p ? 'display_name' then r.display_name := left(trim(p->>'display_name'), 48); end if;
  if p ? 'bio' then r.bio := nullif(left(trim(p->>'bio'), 280), ''); end if;
  if p ? 'avatar_url' then
    if nullif(trim(p->>'avatar_url'), '') is not null and not public.linkbio_url_is_safe(p->>'avatar_url') then
      raise exception 'avatar URL blocked by malware protection';
    end if;
    r.avatar_url := nullif(left(trim(p->>'avatar_url'), 500), '');
  end if;
  if p ? 'links' then
    if jsonb_typeof(p->'links') <> 'array' then raise exception 'links must be array'; end if;
    if jsonb_array_length(p->'links') > 20 then raise exception 'too many links'; end if;
    if not public.linkbio_links_are_safe(p->'links') then
      perform public.linkbio_log_security('malware_link_blocked', r.username, 'save rejected unsafe links', r.id);
      raise exception 'one or more links blocked by malware protection';
    end if;
    -- also reject admin-blocked hosts
    if exists (
      select 1
      from jsonb_array_elements(p->'links') el
      join public.linkbio_blocked_hosts bh
        on position(bh.host in lower(coalesce(el->>'url', ''))) > 0
    ) then
      perform public.linkbio_log_security('blocked_host', r.username, 'save hit admin blocklist', r.id);
      raise exception 'link host is blocked by Nexus Link admin';
    end if;
    r.links := p->'links';
  end if;
  if p ? 'theme' then r.theme := p->>'theme'; end if;
  if p ? 'background' then
    if (p->>'background') in ('999','waves') and not public.linkbio_is_premium(r) then
      raise exception 'premium theme background';
    end if;
    r.background := p->>'background';
  end if;
  if p ? 'animated_bg' then r.animated_bg := (p->>'animated_bg')::boolean; end if;
  if p ? 'font' then
    if (p->>'font') = 'juice' and not public.linkbio_is_premium(r) then
      raise exception 'premium font';
    end if;
    r.font := p->>'font';
  end if;
  if p ? 'glow' then r.glow := (p->>'glow')::boolean; end if;
  if p ? 'accent' then r.accent := nullif(p->>'accent', ''); end if;
  if p ? 'published' then r.published := (p->>'published')::boolean; end if;

  if p ? 'button_style' then r.button_style := p->>'button_style'; end if;
  if p ? 'layout' then r.layout := p->>'layout'; end if;
  if p ? 'show_views' then r.show_views := (p->>'show_views')::boolean; end if;
  if p ? 'show_branding' then
    if (p->>'show_branding')::boolean = false and not public.linkbio_is_premium(r) then
      raise exception 'premium: hide branding';
    end if;
    r.show_branding := (p->>'show_branding')::boolean;
  end if;
  if p ? 'show_presence' then r.show_presence := (p->>'show_presence')::boolean; end if;
  if p ? 'nsfw' then r.nsfw := (p->>'nsfw')::boolean; end if;
  if p ? 'seo_title' then r.seo_title := nullif(left(trim(p->>'seo_title'), 80), ''); end if;
  if p ? 'seo_description' then r.seo_description := nullif(left(trim(p->>'seo_description'), 200), ''); end if;
  if p ? 'banner_url' then
    if nullif(trim(p->>'banner_url'), '') is not null and not public.linkbio_url_is_safe(p->>'banner_url') then
      raise exception 'banner URL blocked by malware protection';
    end if;
    r.banner_url := nullif(left(trim(p->>'banner_url'), 500), '');
  end if;
  if p ? 'music_url' then
    if nullif(trim(p->>'music_url'), '') is not null and not public.linkbio_url_is_safe(p->>'music_url') then
      raise exception 'music URL blocked by malware protection';
    end if;
    r.music_url := nullif(left(trim(p->>'music_url'), 800), '');
  end if;
  if p ? 'custom_status' then r.custom_status := nullif(left(trim(p->>'custom_status'), 80), ''); end if;

  if p ? 'password_enabled' then
    r.password_enabled := (p->>'password_enabled')::boolean;
    if not r.password_enabled then r.page_password_hash := null; end if;
  end if;
  if p ? 'page_password' then
    pw := p->>'page_password';
    if pw is null or pw = '' then
      r.page_password_hash := null;
      r.password_enabled := false;
    else
      if char_length(pw) < 4 then raise exception 'page password too short'; end if;
      r.page_password_hash := extensions.crypt(pw, extensions.gen_salt('bf'));
      r.password_enabled := true;
    end if;
  end if;

  update public.linkbio_pages set
    username = r.username,
    display_name = r.display_name,
    bio = r.bio,
    avatar_url = r.avatar_url,
    links = r.links,
    theme = r.theme,
    background = r.background,
    animated_bg = r.animated_bg,
    font = r.font,
    glow = r.glow,
    accent = r.accent,
    published = r.published,
    password_enabled = r.password_enabled,
    page_password_hash = r.page_password_hash,
    button_style = r.button_style,
    layout = r.layout,
    show_views = r.show_views,
    show_branding = r.show_branding,
    show_presence = coalesce(r.show_presence, true),
    nsfw = r.nsfw,
    seo_title = r.seo_title,
    seo_description = r.seo_description,
    banner_url = r.banner_url,
    music_url = r.music_url,
    custom_status = r.custom_status,
    updated_at = now()
  where id = r.id
  returning * into r;

  return public.linkbio_page_json(r, true);
end;
$fn$;

create or replace function public.linkbio_hit(p_username text)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  update public.linkbio_pages
  set view_count = view_count + 1
  where username = lower(trim(p_username))
    and published = true
    and coalesce(suspended, false) = false;
end;
$fn$;

create or replace function public.linkbio_click(p_username text, p_url text)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
declare pid uuid;
begin
  if not public.linkbio_url_is_safe(p_url) then
    perform public.linkbio_log_security('malware_click_blocked', lower(trim(p_username)), left(p_url, 200));
    return;
  end if;
  select id into pid from public.linkbio_pages
  where username = lower(trim(p_username))
    and published = true
    and coalesce(suspended, false) = false;
  if pid is null then return; end if;
  insert into public.linkbio_clicks (page_id, link_url)
  values (pid, left(coalesce(p_url, ''), 500));
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
  if public.my_rank() < 2 then raise exception 'forbidden'; end if;
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
      'suspended', coalesce(lp.suspended, false),
      'suspend_reason', lp.suspend_reason,
      'nsfw', lp.nsfw,
      'view_count', lp.view_count,
      'links_count', jsonb_array_length(coalesce(lp.links, '[]'::jsonb)),
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

create or replace function public.linkbio_admin_suspend(p_id uuid, p_on boolean, p_reason text default null)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  r public.linkbio_pages;
begin
  if me is null or public.my_rank() < 2 then raise exception 'forbidden'; end if;
  update public.linkbio_pages
  set suspended = coalesce(p_on, true),
      suspend_reason = case when coalesce(p_on, true) then nullif(left(trim(coalesce(p_reason, '')), 200), '') else null end,
      published = case when coalesce(p_on, true) then false else published end,
      updated_at = now()
  where id = p_id
  returning * into r;
  if r.id is null then raise exception 'not found'; end if;
  perform public.linkbio_log_security(
    case when r.suspended then 'admin_suspend' else 'admin_unsuspend' end,
    r.username,
    r.suspend_reason,
    r.id
  );
  return public.linkbio_admin_list();
end;
$fn$;

create or replace function public.linkbio_admin_set_published(p_id uuid, p_on boolean)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if auth.uid() is null or public.my_rank() < 2 then raise exception 'forbidden'; end if;
  update public.linkbio_pages
  set published = coalesce(p_on, false), updated_at = now()
  where id = p_id and coalesce(suspended, false) = false;
  return public.linkbio_admin_list();
end;
$fn$;

create or replace function public.linkbio_admin_clear_links(p_id uuid)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare r public.linkbio_pages;
begin
  if auth.uid() is null or public.my_rank() < 2 then raise exception 'forbidden'; end if;
  update public.linkbio_pages
  set links = '[]'::jsonb, updated_at = now()
  where id = p_id
  returning * into r;
  if r.id is null then raise exception 'not found'; end if;
  perform public.linkbio_log_security('admin_clear_links', r.username, 'links wiped', r.id);
  return public.linkbio_admin_list();
end;
$fn$;

create or replace function public.linkbio_admin_network()
returns json
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  views_24 bigint;
  clicks_24 bigint;
  pages_live bigint;
  pages_susp bigint;
  events json;
  hosts json;
  top json;
begin
  if auth.uid() is null or public.my_rank() < 2 then raise exception 'forbidden'; end if;

  select count(*) into pages_live from public.linkbio_pages where published and not coalesce(suspended, false);
  select count(*) into pages_susp from public.linkbio_pages where coalesce(suspended, false);

  select coalesce(sum(greatest(view_count, 0)), 0) into views_24 from public.linkbio_pages;
  select count(*) into clicks_24 from public.linkbio_clicks where created_at > now() - interval '24 hours';

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into events
  from (
    select id, kind, username, detail, created_at
    from public.linkbio_security_events
    order by created_at desc
    limit 40
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into hosts
  from (
    select host, reason, created_at from public.linkbio_blocked_hosts order by created_at desc limit 50
  ) x;

  select coalesce(json_agg(row_to_json(x)), '[]'::json) into top
  from (
    select username, view_count, published, coalesce(suspended, false) as suspended
    from public.linkbio_pages
    order by view_count desc
    limit 10
  ) x;

  return json_build_object(
    'pages_live', pages_live,
    'pages_suspended', pages_susp,
    'views_total', views_24,
    'clicks_24h', clicks_24,
    'events', events,
    'blocked_hosts', hosts,
    'top_pages', top,
    'protect', json_build_object(
      'malware', true,
      'ddos_rate_limit', true,
      'security_headers', true,
      'link_scan', true
    )
  );
end;
$fn$;

create or replace function public.linkbio_admin_block_host(p_host text, p_reason text default null)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare h text := lower(trim(coalesce(p_host, '')));
begin
  if auth.uid() is null or public.my_rank() < 2 then raise exception 'forbidden'; end if;
  h := regexp_replace(h, '^https?://', '');
  h := split_part(h, '/', 1);
  if char_length(h) < 3 or char_length(h) > 120 then raise exception 'invalid host'; end if;
  insert into public.linkbio_blocked_hosts (host, reason, created_by)
  values (h, nullif(left(trim(coalesce(p_reason, '')), 200), ''), auth.uid())
  on conflict (host) do update set reason = excluded.reason;
  perform public.linkbio_log_security('block_host', null, h);
  return public.linkbio_admin_network();
end;
$fn$;

create or replace function public.linkbio_admin_unblock_host(p_host text)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if auth.uid() is null or public.my_rank() < 2 then raise exception 'forbidden'; end if;
  delete from public.linkbio_blocked_hosts where host = lower(trim(p_host));
  return public.linkbio_admin_network();
end;
$fn$;

grant execute on function public.linkbio_url_is_safe(text) to anon, authenticated;
grant execute on function public.linkbio_log_security(text, text, text, uuid, text) to authenticated;
grant execute on function public.linkbio_public(text, text) to anon, authenticated;
grant execute on function public.linkbio_save(jsonb) to authenticated;
grant execute on function public.linkbio_hit(text) to anon, authenticated;
grant execute on function public.linkbio_click(text, text) to anon, authenticated;
grant execute on function public.linkbio_admin_list() to authenticated;
grant execute on function public.linkbio_admin_suspend(uuid, boolean, text) to authenticated;
grant execute on function public.linkbio_admin_set_published(uuid, boolean) to authenticated;
grant execute on function public.linkbio_admin_clear_links(uuid) to authenticated;
grant execute on function public.linkbio_admin_block_host(text, text) to authenticated;
grant execute on function public.linkbio_admin_unblock_host(text) to authenticated;
grant execute on function public.linkbio_admin_network() to authenticated;

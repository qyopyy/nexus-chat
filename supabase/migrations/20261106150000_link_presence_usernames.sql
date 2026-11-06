-- Nexus presence snapshot for public Link pages + 10 username aliases for everyone.
-- linkbio_pages.show_presence toggle.

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'offline'
    check (status in ('online', 'idle', 'dnd', 'offline')),
  online_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;

drop policy if exists user_presence_select on public.user_presence;
create policy user_presence_select on public.user_presence
  for select to authenticated
  using (user_id = auth.uid());

alter table public.linkbio_pages
  add column if not exists show_presence boolean not null default true;

create or replace function public.presence_heartbeat(p_status text default 'online')
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  st text := lower(coalesce(nullif(trim(p_status), ''), 'online'));
  show_on boolean := true;
begin
  if me is null then return; end if;
  if st not in ('online', 'idle', 'dnd', 'invisible', 'offline') then st := 'online'; end if;

  select coalesce(up.show_online, true) into show_on
  from public.user_privacy up where up.user_id = me;
  if not found then show_on := true; end if;

  if not show_on or st = 'invisible' then
    insert into public.user_presence (user_id, status, online_at, updated_at)
    values (me, 'offline', null, now())
    on conflict (user_id) do update
      set status = 'offline', online_at = null, updated_at = now();
    return;
  end if;

  insert into public.user_presence (user_id, status, online_at, updated_at)
  values (me, st, now(), now())
  on conflict (user_id) do update
    set status = excluded.status,
        online_at = excluded.online_at,
        updated_at = now();
end;
$fn$;

create or replace function public.linkbio_presence(p_username text)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  r public.linkbio_pages;
  st text := 'offline';
  at timestamptz;
  show_on boolean := true;
  fresh boolean := false;
begin
  select * into r from public.linkbio_pages
  where username = lower(trim(p_username)) and published = true;
  if r.id is null then
    return json_build_object('status', 'offline', 'online_at', null);
  end if;
  if coalesce(r.show_presence, true) = false then
    return json_build_object('status', 'offline', 'online_at', null, 'hidden', true);
  end if;

  select coalesce(up.show_online, true) into show_on
  from public.user_privacy up where up.user_id = r.owner_id;
  if not found then show_on := true; end if;
  if not show_on then
    return json_build_object('status', 'offline', 'online_at', null, 'hidden', true);
  end if;

  select p.status, p.online_at,
         (p.updated_at > now() - interval '3 minutes' and p.status in ('online','idle','dnd'))
    into st, at, fresh
  from public.user_presence p where p.user_id = r.owner_id;

  if not found or not coalesce(fresh, false) then
    return json_build_object('status', 'offline', 'online_at', null);
  end if;

  return json_build_object('status', st, 'online_at', at);
end;
$fn$;

create or replace function public.claim_username(p_username text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v text := lower(trim(both '@ ' from coalesce(p_username, '')));
  lim int := 10;
begin
  if auth.uid() is null or public.is_banned() then raise exception 'Sign in first'; end if;
  perform public.check_username_rules(v);
  if v in ('admin','nexus','support','help','official','moderator','staff','root','system','nexusbot','orderbot','musicbot','gram','nexusgram') and public.my_rank() < 3 then
    raise exception 'That username is reserved';
  end if;
  if public.handle_taken(v) then raise exception 'That username is taken'; end if;
  if (select count(*) from public.username_aliases where user_id = auth.uid()) >= lim then
    raise exception 'You can have up to % extra usernames', lim;
  end if;
  insert into public.username_aliases (username, user_id) values (v, auth.uid());
  return v;
end;
$function$;

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
  if p ? 'avatar_url' then r.avatar_url := nullif(left(trim(p->>'avatar_url'), 500), ''); end if;
  if p ? 'links' then
    if jsonb_typeof(p->'links') <> 'array' then raise exception 'links must be array'; end if;
    if jsonb_array_length(p->'links') > 20 then raise exception 'too many links'; end if;
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
  if p ? 'banner_url' then r.banner_url := nullif(left(trim(p->>'banner_url'), 500), ''); end if;
  if p ? 'music_url' then
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

grant execute on function public.presence_heartbeat(text) to authenticated;
grant execute on function public.linkbio_presence(text) to anon, authenticated;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.linkbio_save(jsonb) to authenticated;

-- Nexus Link: page password, richer settings, invite codes for new registrants.

create extension if not exists pgcrypto with schema extensions;

-- Replace single-arg public RPC with unlock-token aware version
drop function if exists public.linkbio_public(text);

alter table public.linkbio_pages
  add column if not exists password_enabled boolean not null default false,
  add column if not exists page_password_hash text,
  add column if not exists button_style text not null default 'pill',
  add column if not exists layout text not null default 'classic',
  add column if not exists show_views boolean not null default false,
  add column if not exists show_branding boolean not null default true,
  add column if not exists nsfw boolean not null default false,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists banner_url text,
  add column if not exists music_url text,
  add column if not exists custom_status text;

do $$ begin
  alter table public.linkbio_pages drop constraint if exists linkbio_button_ok;
  alter table public.linkbio_pages add constraint linkbio_button_ok
    check (button_style in ('pill','square','outline','glass'));
  alter table public.linkbio_pages drop constraint if exists linkbio_layout_ok;
  alter table public.linkbio_pages add constraint linkbio_layout_ok
    check (layout in ('classic','cards','minimal'));
  alter table public.linkbio_pages drop constraint if exists linkbio_seo_title_len;
  alter table public.linkbio_pages add constraint linkbio_seo_title_len
    check (seo_title is null or char_length(seo_title) <= 80);
  alter table public.linkbio_pages drop constraint if exists linkbio_seo_desc_len;
  alter table public.linkbio_pages add constraint linkbio_seo_desc_len
    check (seo_description is null or char_length(seo_description) <= 200);
  alter table public.linkbio_pages drop constraint if exists linkbio_status_len;
  alter table public.linkbio_pages add constraint linkbio_status_len
    check (custom_status is null or char_length(custom_status) <= 80);
exception when others then null;
end $$;

create table if not exists public.linkbio_invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  created_by  uuid references public.profiles (id) on delete set null,
  note        text,
  max_uses    int not null default 1,
  uses        int not null default 0,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint linkbio_invite_code_fmt check (code ~ '^[A-Z0-9_-]{4,24}$'),
  constraint linkbio_invite_uses_ok check (uses >= 0 and max_uses >= 1)
);

create table if not exists public.linkbio_invite_redemptions (
  id          bigint generated always as identity primary key,
  invite_id   uuid not null references public.linkbio_invites (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (invite_id, user_id)
);

alter table public.linkbio_invites enable row level security;
alter table public.linkbio_invite_redemptions enable row level security;

drop policy if exists linkbio_invites_admin on public.linkbio_invites;
create policy linkbio_invites_admin on public.linkbio_invites
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.site_role in ('owner','admin','moderator')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.site_role in ('owner','admin')));

drop policy if exists linkbio_invite_redemptions_select on public.linkbio_invite_redemptions;
create policy linkbio_invite_redemptions_select on public.linkbio_invite_redemptions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.site_role in ('owner','admin','moderator'))
  );

create or replace function public.linkbio_page_json(r public.linkbio_pages, p_owner boolean default false)
returns json
language plpgsql
stable
set search_path to ''
as $fn$
begin
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
    'created_at', case when p_owner then r.created_at else null end,
    'updated_at', case when p_owner then r.updated_at else null end
  );
end;
$fn$;

create or replace function public.linkbio_unlock_token(r public.linkbio_pages)
returns text
language sql
stable
set search_path to ''
as $$
  select encode(
    extensions.digest(
      convert_to(r.username || ':' || coalesce(r.page_password_hash, '') || ':' || to_char(now(), 'IYYY-IW'), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.linkbio_public(p_username text, p_unlock text default null)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare r public.linkbio_pages;
declare locked boolean;
declare j json;
begin
  select * into r from public.linkbio_pages
  where username = lower(trim(p_username)) and published = true;
  if r.id is null then return null; end if;
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

create or replace function public.linkbio_check_password(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare r public.linkbio_pages;
begin
  select * into r from public.linkbio_pages
  where username = lower(trim(p_username)) and published = true;
  if r.id is null then return json_build_object('ok', false, 'error', 'not found'); end if;
  if not (r.password_enabled and r.page_password_hash is not null) then
    return json_build_object('ok', true, 'token', null, 'needed', false);
  end if;
  if p_password is null or length(p_password) < 1 then
    return json_build_object('ok', false, 'error', 'password required');
  end if;
  if extensions.crypt(p_password, r.page_password_hash) <> r.page_password_hash then
    return json_build_object('ok', false, 'error', 'wrong password');
  end if;
  return json_build_object('ok', true, 'token', public.linkbio_unlock_token(r), 'needed', true);
end;
$fn$;

create or replace function public.linkbio_mine()
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  r public.linkbio_pages;
  p public.profiles;
  uname text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.linkbio_pages where owner_id = me;
  if r.id is not null then
    return public.linkbio_page_json(r, true);
  end if;

  select * into p from public.profiles where id = me;
  uname := lower(regexp_replace(coalesce(p.username, 'user'), '[^a-z0-9_]', '', 'g'));
  if char_length(uname) < 2 then uname := 'user' || substr(replace(me::text, '-', ''), 1, 8); end if;
  if exists (select 1 from public.linkbio_pages where username = uname) then
    uname := left(uname, 16) || substr(replace(me::text, '-', ''), 1, 6);
  end if;

  insert into public.linkbio_pages (owner_id, username, display_name, bio, avatar_url, links)
  values (
    me, uname,
    coalesce(nullif(p.display_name, ''), p.username, 'Me'),
    p.bio,
    p.avatar_url,
    coalesce(p.links, '[]'::jsonb)
  )
  returning * into r;

  return public.linkbio_page_json(r, true);
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
  if p ? 'nsfw' then r.nsfw := (p->>'nsfw')::boolean; end if;
  if p ? 'seo_title' then r.seo_title := nullif(left(trim(p->>'seo_title'), 80), ''); end if;
  if p ? 'seo_description' then r.seo_description := nullif(left(trim(p->>'seo_description'), 200), ''); end if;
  if p ? 'banner_url' then r.banner_url := nullif(left(trim(p->>'banner_url'), 500), ''); end if;
  if p ? 'music_url' then
    if nullif(p->>'music_url','') is not null and not public.linkbio_is_premium(r) then
      raise exception 'premium: music embed';
    end if;
    r.music_url := nullif(left(trim(p->>'music_url'), 500), '');
  end if;
  if p ? 'custom_status' then r.custom_status := nullif(left(trim(p->>'custom_status'), 80), ''); end if;

  -- password protect
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

-- Invites
create or replace function public.linkbio_invite_check(p_code text)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare inv public.linkbio_invites;
declare c text := upper(trim(p_code));
begin
  select * into inv from public.linkbio_invites where code = c;
  if inv.id is null then return json_build_object('ok', false, 'error', 'invalid invite'); end if;
  if inv.revoked_at is not null then return json_build_object('ok', false, 'error', 'invite revoked'); end if;
  if inv.expires_at is not null and inv.expires_at < now() then return json_build_object('ok', false, 'error', 'invite expired'); end if;
  if inv.uses >= inv.max_uses then return json_build_object('ok', false, 'error', 'invite used up'); end if;
  return json_build_object('ok', true, 'code', inv.code, 'remaining', inv.max_uses - inv.uses);
end;
$fn$;

create or replace function public.linkbio_invite_redeem(p_code text)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  inv public.linkbio_invites;
  c text := upper(trim(p_code));
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into inv from public.linkbio_invites where code = c for update;
  if inv.id is null then raise exception 'invalid invite'; end if;
  if inv.revoked_at is not null then raise exception 'invite revoked'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then raise exception 'invite expired'; end if;
  if inv.uses >= inv.max_uses then raise exception 'invite used up'; end if;
  if exists (select 1 from public.linkbio_invite_redemptions where invite_id = inv.id and user_id = me) then
    return json_build_object('ok', true, 'already', true);
  end if;
  insert into public.linkbio_invite_redemptions (invite_id, user_id) values (inv.id, me);
  update public.linkbio_invites set uses = uses + 1 where id = inv.id;
  return json_build_object('ok', true, 'already', false);
end;
$fn$;

create or replace function public.linkbio_invite_create(p_max_uses int default 1, p_note text default null, p_days int default 30)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  code text;
  inv public.linkbio_invites;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.site_role in ('owner','admin')) then
    raise exception 'forbidden';
  end if;
  code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  insert into public.linkbio_invites (code, created_by, note, max_uses, expires_at)
  values (
    code, me, nullif(left(coalesce(p_note, ''), 120), ''),
    greatest(1, least(coalesce(p_max_uses, 1), 100)),
    case when coalesce(p_days, 30) > 0 then now() + make_interval(days => least(p_days, 365)) else null end
  )
  returning * into inv;
  insert into public.admin_actions (actor_id, action, target_id, detail)
  values (me, 'linkbio_invite', null, jsonb_build_object('code', inv.code, 'max_uses', inv.max_uses));
  return json_build_object(
    'id', inv.id, 'code', inv.code, 'max_uses', inv.max_uses, 'uses', inv.uses,
    'expires_at', inv.expires_at, 'note', inv.note
  );
end;
$fn$;

create or replace function public.linkbio_invite_list()
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
      'id', i.id, 'code', i.code, 'note', i.note, 'max_uses', i.max_uses, 'uses', i.uses,
      'expires_at', i.expires_at, 'revoked_at', i.revoked_at, 'created_at', i.created_at
    ) order by i.created_at desc)
    from public.linkbio_invites i
  ), '[]'::json);
end;
$fn$;

create or replace function public.linkbio_invite_revoke(p_id uuid)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.site_role in ('owner','admin')) then
    raise exception 'forbidden';
  end if;
  update public.linkbio_invites set revoked_at = now() where id = p_id and revoked_at is null;
  return public.linkbio_invite_list();
end;
$fn$;

-- Seed a founder invite for testing/onboarding
insert into public.linkbio_invites (code, created_by, note, max_uses, expires_at)
select 'NEXUS999', p.id, 'Founder welcome invite', 50, now() + interval '365 days'
from public.profiles p where p.username = 'qyopy'
on conflict (code) do nothing;

grant execute on function public.linkbio_public(text, text) to anon, authenticated;
grant execute on function public.linkbio_check_password(text, text) to anon, authenticated;
grant execute on function public.linkbio_invite_check(text) to anon, authenticated;
grant execute on function public.linkbio_invite_redeem(text) to authenticated;
grant execute on function public.linkbio_invite_create(int, text, int) to authenticated;
grant execute on function public.linkbio_invite_list() to authenticated;
grant execute on function public.linkbio_invite_revoke(uuid) to authenticated;

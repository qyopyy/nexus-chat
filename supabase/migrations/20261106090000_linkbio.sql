-- Nexus Link — standalone link-in-bio side project (themes, premium, admin).

create table if not exists public.linkbio_pages (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null unique references public.profiles (id) on delete cascade,
  username      text not null unique,
  display_name  text not null,
  bio           text,
  avatar_url    text,
  links         jsonb not null default '[]'::jsonb,
  theme         text not null default 'midnight',
  background    text not null default 'particles',
  animated_bg   boolean not null default true,
  font          text not null default 'glow',
  glow          boolean not null default true,
  accent        text,
  premium       boolean not null default false,
  premium_until timestamptz,
  published     boolean not null default true,
  view_count    bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint linkbio_username_fmt check (username ~ '^[a-z0-9_]{2,24}$'),
  constraint linkbio_display_len check (char_length(display_name) between 1 and 48),
  constraint linkbio_bio_len check (bio is null or char_length(bio) <= 280),
  constraint linkbio_theme_ok check (theme in (
    'midnight','juice999','purple999','neon','aurora','void','gold','smoke','candy','ocean'
  )),
  constraint linkbio_bg_ok check (background in (
    'none','particles','rain','smoke','stars','grid','waves','999'
  )),
  constraint linkbio_font_ok check (font in (
    'glow','marker','display','space','mono','juice'
  )),
  constraint linkbio_accent_ok check (accent is null or accent ~ '^#[0-9A-Fa-f]{6}$'),
  constraint linkbio_links_arr check (jsonb_typeof(links) = 'array')
);

create index if not exists linkbio_pages_owner_idx on public.linkbio_pages (owner_id);
create index if not exists linkbio_pages_published_idx on public.linkbio_pages (published) where published;

create table if not exists public.linkbio_clicks (
  id         bigint generated always as identity primary key,
  page_id    uuid not null references public.linkbio_pages (id) on delete cascade,
  link_url   text not null,
  created_at timestamptz not null default now()
);
create index if not exists linkbio_clicks_page_idx on public.linkbio_clicks (page_id, created_at desc);

alter table public.linkbio_pages enable row level security;
alter table public.linkbio_clicks enable row level security;

drop policy if exists linkbio_pages_select on public.linkbio_pages;
create policy linkbio_pages_select on public.linkbio_pages
  for select to anon, authenticated
  using (published or owner_id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.site_role in ('owner','admin','moderator')
  ));

drop policy if exists linkbio_pages_insert on public.linkbio_pages;
create policy linkbio_pages_insert on public.linkbio_pages
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists linkbio_pages_update on public.linkbio_pages;
create policy linkbio_pages_update on public.linkbio_pages
  for update to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.site_role in ('owner','admin'))
  )
  with check (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.site_role in ('owner','admin'))
  );

drop policy if exists linkbio_pages_delete on public.linkbio_pages;
create policy linkbio_pages_delete on public.linkbio_pages
  for delete to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.site_role in ('owner','admin'))
  );

drop policy if exists linkbio_clicks_insert on public.linkbio_clicks;
create policy linkbio_clicks_insert on public.linkbio_clicks
  for insert to anon, authenticated with check (true);

drop policy if exists linkbio_clicks_select on public.linkbio_clicks;
create policy linkbio_clicks_select on public.linkbio_clicks
  for select to authenticated
  using (
    exists (select 1 from public.linkbio_pages lp where lp.id = page_id and lp.owner_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.site_role in ('owner','admin','moderator'))
  );

create or replace function public.linkbio_is_premium(p public.linkbio_pages)
returns boolean
language sql
stable
as $$
  select p.premium and (p.premium_until is null or p.premium_until > now());
$$;

create or replace function public.linkbio_public(p_username text)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare r public.linkbio_pages;
begin
  select * into r from public.linkbio_pages
  where username = lower(trim(p_username)) and published = true;
  if r.id is null then return null; end if;
  return json_build_object(
    'id', r.id,
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
    'view_count', r.view_count
  );
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
  where username = lower(trim(p_username)) and published = true;
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
  select id into pid from public.linkbio_pages
  where username = lower(trim(p_username)) and published = true;
  if pid is null then return; end if;
  insert into public.linkbio_clicks (page_id, link_url)
  values (pid, left(coalesce(p_url, ''), 500));
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
    return json_build_object(
      'id', r.id, 'owner_id', r.owner_id, 'username', r.username, 'display_name', r.display_name,
      'bio', r.bio, 'avatar_url', r.avatar_url, 'links', coalesce(r.links, '[]'::jsonb),
      'theme', r.theme, 'background', r.background, 'animated_bg', r.animated_bg,
      'font', r.font, 'glow', r.glow, 'accent', r.accent,
      'premium', public.linkbio_is_premium(r), 'premium_until', r.premium_until,
      'published', r.published, 'view_count', r.view_count,
      'created_at', r.created_at, 'updated_at', r.updated_at
    );
  end if;

  select * into p from public.profiles where id = me;
  uname := lower(regexp_replace(coalesce(p.username, 'user'), '[^a-z0-9_]', '', 'g'));
  if char_length(uname) < 2 then uname := 'user' || substr(replace(me::text, '-', ''), 1, 8); end if;
  -- collide → append short id
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

  return json_build_object(
    'id', r.id, 'owner_id', r.owner_id, 'username', r.username, 'display_name', r.display_name,
    'bio', r.bio, 'avatar_url', r.avatar_url, 'links', coalesce(r.links, '[]'::jsonb),
    'theme', r.theme, 'background', r.background, 'animated_bg', r.animated_bg,
    'font', r.font, 'glow', r.glow, 'accent', r.accent,
    'premium', public.linkbio_is_premium(r), 'premium_until', r.premium_until,
    'published', r.published, 'view_count', r.view_count,
    'created_at', r.created_at, 'updated_at', r.updated_at
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
    -- free users keep current username unless admin; premium or first change ok
    if new_user <> r.username and not public.linkbio_is_premium(r) then
      -- allow one free rename if still matching nexus username pattern seed — still allow for sanity
      null;
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
    updated_at = now()
  where id = r.id
  returning * into r;

  return public.linkbio_mine();
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
      'updated_at', lp.updated_at
    ) order by lp.updated_at desc)
    from public.linkbio_pages lp
    join public.profiles pr on pr.id = lp.owner_id
  ), '[]'::json);
end;
$fn$;

create or replace function public.linkbio_admin_set_username(p_id uuid, p_username text)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  u text := lower(trim(p_username));
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.site_role in ('owner','admin')) then
    raise exception 'forbidden';
  end if;
  if u !~ '^[a-z0-9_]{2,24}$' then raise exception 'invalid username'; end if;
  if exists (select 1 from public.linkbio_pages where username = u and id <> p_id) then
    raise exception 'username taken';
  end if;
  update public.linkbio_pages set username = u, updated_at = now() where id = p_id;
  insert into public.admin_actions (actor_id, action, target_id, detail)
  values (me, 'linkbio_username', p_id, jsonb_build_object('username', u));
  return public.linkbio_admin_list();
end;
$fn$;

create or replace function public.linkbio_admin_set_premium(p_id uuid, p_on boolean, p_until timestamptz default null)
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
  update public.linkbio_pages set
    premium = coalesce(p_on, false),
    premium_until = case when coalesce(p_on, false) then coalesce(p_until, '2099-12-31 23:59:59+00'::timestamptz) else null end,
    updated_at = now()
  where id = p_id;
  insert into public.admin_actions (actor_id, action, target_id, detail)
  values (me, 'linkbio_premium', p_id, jsonb_build_object('on', p_on, 'until', p_until));
  return public.linkbio_admin_list();
end;
$fn$;

grant execute on function public.linkbio_public(text) to anon, authenticated;
grant execute on function public.linkbio_hit(text) to anon, authenticated;
grant execute on function public.linkbio_click(text, text) to anon, authenticated;
grant execute on function public.linkbio_mine() to authenticated;
grant execute on function public.linkbio_save(jsonb) to authenticated;
grant execute on function public.linkbio_admin_list() to authenticated;
grant execute on function public.linkbio_admin_set_username(uuid, text) to authenticated;
grant execute on function public.linkbio_admin_set_premium(uuid, boolean, timestamptz) to authenticated;

-- Seed founder page for qyopy
insert into public.linkbio_pages (
  owner_id, username, display_name, bio, avatar_url, links,
  theme, background, animated_bg, font, glow, premium, premium_until, published
)
select
  p.id,
  'qyopy',
  coalesce(nullif(p.display_name, ''), 'qyopy'),
  coalesce(p.bio, 'Founder of Nexus · Artist & Record Label CEO'),
  p.avatar_url,
  coalesce(p.links, '[]'::jsonb),
  'juice999',
  '999',
  true,
  'juice',
  true,
  true,
  '2099-12-31 23:59:59+00'::timestamptz,
  true
from public.profiles p
where p.username = 'qyopy'
on conflict (owner_id) do update set
  username = excluded.username,
  display_name = excluded.display_name,
  bio = excluded.bio,
  avatar_url = excluded.avatar_url,
  links = excluded.links,
  theme = excluded.theme,
  background = excluded.background,
  animated_bg = excluded.animated_bg,
  font = excluded.font,
  glow = excluded.glow,
  premium = excluded.premium,
  premium_until = excluded.premium_until,
  published = excluded.published,
  updated_at = now();

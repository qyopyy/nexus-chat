-- Community bots, space installs, extra system bots (fun / trivia / spotify)
-- ---------------------------------------------------------------- system bots
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', b.id, 'authenticated', 'authenticated', b.email, '',
       '{"provider":"bot","providers":["bot"]}'::jsonb,
       jsonb_build_object('username', b.username, 'display_name', b.display_name), now(), now()
from (values
  ('00000000-0000-4000-8000-00000000b004'::uuid, 'funbot@bots.nexus.invalid', 'funbot', 'Fun Bot'),
  ('00000000-0000-4000-8000-00000000b005'::uuid, 'triviabot@bots.nexus.invalid', 'triviabot', 'Trivia Bot'),
  ('00000000-0000-4000-8000-00000000b006'::uuid, 'spotifybot@bots.nexus.invalid', 'spotifybot', 'Spotify Bot')
) as b(id, email, username, display_name)
where not exists (select 1 from auth.users u where u.id = b.id);

update public.profiles set
  is_bot = true,
  avatar_color = case id
    when '00000000-0000-4000-8000-00000000b004' then '#FEE75C'
    when '00000000-0000-4000-8000-00000000b005' then '#57F287'
    when '00000000-0000-4000-8000-00000000b006' then '#1DB954'
    else avatar_color end,
  bio = case id
    when '00000000-0000-4000-8000-00000000b004' then 'Games & vibes: /joke /rps /fact /rate /ship /help'
    when '00000000-0000-4000-8000-00000000b005' then 'Trivia night: /trivia /answer'
    when '00000000-0000-4000-8000-00000000b006' then 'Spotify tracks: /spotify /track /album /artist'
    when '00000000-0000-4000-8000-00000000b003' then 'Music: /isrc /song /upc + Spotify /spotify /track'
    else bio end
where id in (
  '00000000-0000-4000-8000-00000000b003',
  '00000000-0000-4000-8000-00000000b004',
  '00000000-0000-4000-8000-00000000b005',
  '00000000-0000-4000-8000-00000000b006'
);

-- ---------------------------------------------------------------- community bots (anyone can create)
create table if not exists public.community_bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null,
  name text not null check (char_length(name) between 2 and 64),
  description text not null default '' check (char_length(description) <= 280),
  avatar_url text,
  color text not null default '#5865F2',
  commands jsonb not null default '[]'::jsonb,
  webhook_token text not null default encode(gen_random_bytes(24), 'hex'),
  public boolean not null default true,
  uses int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_bots_slug_ok check (slug ~ '^[a-z0-9][a-z0-9_-]{1,30}$'),
  constraint community_bots_slug_unique unique (slug)
);
create index if not exists community_bots_owner_idx on public.community_bots (owner_id);
create index if not exists community_bots_public_idx on public.community_bots (public, created_at desc);

alter table public.community_bots enable row level security;
drop policy if exists "community_bots read" on public.community_bots;
create policy "community_bots read" on public.community_bots for select to authenticated
  using (public = true or owner_id = auth.uid());
drop policy if exists "community_bots insert" on public.community_bots;
create policy "community_bots insert" on public.community_bots for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_banned());
drop policy if exists "community_bots update" on public.community_bots;
create policy "community_bots update" on public.community_bots for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "community_bots delete" on public.community_bots;
create policy "community_bots delete" on public.community_bots for delete to authenticated
  using (owner_id = auth.uid() or public.my_rank() >= 3);

-- ---------------------------------------------------------------- install bots on servers
create table if not exists public.space_bot_installs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  system_key text check (system_key is null or system_key in ('nexus','music','orders','fun','trivia','spotify')),
  community_bot_id uuid references public.community_bots (id) on delete cascade,
  installed_by uuid references public.profiles (id) on delete set null,
  installed_at timestamptz not null default now(),
  constraint space_bot_one_kind check (
    (system_key is not null and community_bot_id is null)
    or (system_key is null and community_bot_id is not null)
  )
);
create unique index if not exists space_bot_installs_sys_uq
  on public.space_bot_installs (space_id, system_key) where system_key is not null;
create unique index if not exists space_bot_installs_com_uq
  on public.space_bot_installs (space_id, community_bot_id) where community_bot_id is not null;
create index if not exists space_bot_installs_space_idx on public.space_bot_installs (space_id);

alter table public.space_bot_installs enable row level security;
drop policy if exists "space_bot_installs read" on public.space_bot_installs;
create policy "space_bot_installs read" on public.space_bot_installs for select to authenticated
  using (exists (select 1 from public.space_members sm where sm.space_id = space_bot_installs.space_id and sm.user_id = auth.uid()));

-- ---------------------------------------------------------------- RPCs
create or replace function public.create_community_bot(
  p_slug text, p_name text, p_description text default '', p_color text default '#5865F2', p_commands jsonb default '[]'::jsonb
)
returns public.community_bots
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  row public.community_bots;
  slug text := lower(trim(p_slug));
begin
  if me is null then raise exception 'Sign in first'; end if;
  if public.is_banned() then raise exception 'You are banned'; end if;
  if slug !~ '^[a-z0-9][a-z0-9_-]{1,30}$' then raise exception 'Slug: 2–31 chars, letters/numbers/_/-'; end if;
  if exists (select 1 from public.community_bots where community_bots.slug = slug) then
    raise exception 'That bot link is taken';
  end if;
  if exists (select 1 from public.profiles where username = slug) then
    raise exception 'That name is already a username';
  end if;
  if jsonb_typeof(coalesce(p_commands, '[]'::jsonb)) <> 'array' then raise exception 'Commands must be a list'; end if;
  if jsonb_array_length(coalesce(p_commands, '[]'::jsonb)) > 25 then raise exception 'Max 25 commands'; end if;
  insert into public.community_bots (owner_id, slug, name, description, color, commands, webhook_token)
  values (
    me, slug, left(trim(p_name), 64), left(coalesce(p_description, ''), 280),
    coalesce(nullif(trim(p_color), ''), '#5865F2'), coalesce(p_commands, '[]'::jsonb),
    encode(extensions.gen_random_bytes(24), 'hex')
  )
  returning * into row;
  return row;
end;
$$;

create or replace function public.update_community_bot(
  p_id uuid, p_name text default null, p_description text default null, p_color text default null,
  p_commands jsonb default null, p_public boolean default null, p_avatar_url text default null
)
returns public.community_bots
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  row public.community_bots;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into row from public.community_bots where id = p_id;
  if row.id is null then raise exception 'Bot not found'; end if;
  if row.owner_id <> me and public.my_rank() < 3 then raise exception 'Not your bot'; end if;
  if p_commands is not null then
    if jsonb_typeof(p_commands) <> 'array' then raise exception 'Commands must be a list'; end if;
    if jsonb_array_length(p_commands) > 25 then raise exception 'Max 25 commands'; end if;
  end if;
  update public.community_bots set
    name = coalesce(nullif(trim(p_name), ''), name),
    description = coalesce(p_description, description),
    color = coalesce(nullif(trim(p_color), ''), color),
    commands = coalesce(p_commands, commands),
    public = coalesce(p_public, public),
    avatar_url = case when p_avatar_url is null then avatar_url else nullif(trim(p_avatar_url), '') end,
    updated_at = now()
  where id = p_id
  returning * into row;
  return row;
end;
$$;

create or replace function public.install_bot_to_space(
  p_space uuid, p_system_key text default null, p_community_bot_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  iid uuid;
  bot public.community_bots;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not public.is_space_staff(p_space) then raise exception 'Server staff can invite bots'; end if;
  if (p_system_key is null) = (p_community_bot_id is null) then
    raise exception 'Pick one system bot or one community bot';
  end if;
  if p_system_key is not null then
    if p_system_key not in ('nexus','music','orders','fun','trivia','spotify') then
      raise exception 'Unknown system bot';
    end if;
    insert into public.space_bot_installs (space_id, system_key, installed_by)
    values (p_space, p_system_key, me)
    on conflict do nothing
    returning id into iid;
    if iid is null then
      select id into iid from public.space_bot_installs where space_id = p_space and system_key = p_system_key;
    end if;
    return iid;
  end if;
  select * into bot from public.community_bots where id = p_community_bot_id;
  if bot.id is null then raise exception 'Bot not found'; end if;
  if not bot.public and bot.owner_id <> me then raise exception 'That bot is private'; end if;
  insert into public.space_bot_installs (space_id, community_bot_id, installed_by)
  values (p_space, p_community_bot_id, me)
  on conflict do nothing
  returning id into iid;
  if iid is null then
    select id into iid from public.space_bot_installs where space_id = p_space and community_bot_id = p_community_bot_id;
  end if;
  return iid;
end;
$$;

create or replace function public.uninstall_bot_from_space(p_install_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select space_id into sid from public.space_bot_installs where id = p_install_id;
  if sid is null then raise exception 'Not installed'; end if;
  if not public.is_space_staff(sid) then raise exception 'Server staff only'; end if;
  delete from public.space_bot_installs where id = p_install_id;
end;
$$;

create or replace function public.bot_by_slug(p_slug text)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  slug text := lower(trim(p_slug));
  row public.community_bots;
begin
  -- system bots
  if slug in ('nexusbot','nexus') then
    return json_build_object('kind','system','key','nexus','slug','nexusbot','name','Nexus Bot','description','Fun slash commands for every chat.','color','#5865F2','commands', json_build_array('/help','/roll','/flip','/8ball','/choose'));
  elsif slug in ('musicbot','music') then
    return json_build_object('kind','system','key','music','slug','musicbot','name','Music Bot','description','ISRC codes, Deezer + Spotify track lookup.','color','#EB459E','commands', json_build_array('/isrc','/song','/upc','/spotify','/track'));
  elsif slug in ('orderbot','orders') then
    return json_build_object('kind','system','key','orders','slug','orderbot','name','Order Bot','description','Premium plans and your order status.','color','#3BA55D','commands', json_build_array('/premium','/orders'));
  elsif slug in ('funbot','fun') then
    return json_build_object('kind','system','key','fun','slug','funbot','name','Fun Bot','description','Jokes, facts, rock-paper-scissors, rates & ships.','color','#FEE75C','commands', json_build_array('/joke','/fact','/rps','/rate','/ship'));
  elsif slug in ('triviabot','trivia') then
    return json_build_object('kind','system','key','trivia','slug','triviabot','name','Trivia Bot','description','Quick trivia rounds in any chat.','color','#57F287','commands', json_build_array('/trivia','/answer'));
  elsif slug in ('spotifybot','spotify') then
    return json_build_object('kind','system','key','spotify','slug','spotifybot','name','Spotify Bot','description','Search Spotify tracks, albums, and artists.','color','#1DB954','commands', json_build_array('/spotify','/track','/album','/artist'));
  end if;

  select * into row from public.community_bots where community_bots.slug = slug and (public = true or owner_id = auth.uid());
  if row.id is null then return null; end if;
  return json_build_object(
    'kind','community','id',row.id,'slug',row.slug,'name',row.name,'description',row.description,
    'color',row.color,'avatar_url',row.avatar_url,'owner_id',row.owner_id,'public',row.public,
    'commands',row.commands,'uses',row.uses,'created_at',row.created_at
  );
end;
$$;

grant execute on function public.create_community_bot(text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_community_bot(uuid, text, text, text, jsonb, boolean, text) to authenticated;
grant execute on function public.install_bot_to_space(uuid, text, uuid) to authenticated;
grant execute on function public.uninstall_bot_from_space(uuid) to authenticated;
grant execute on function public.bot_by_slug(text) to authenticated;
grant execute on function public.bot_by_slug(text) to anon;

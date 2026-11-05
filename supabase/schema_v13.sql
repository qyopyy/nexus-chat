-- Server polish: icons/banners, custom invites, custom roles, private password rooms
drop function if exists public.create_channel(uuid, text, text);

create extension if not exists pgcrypto with schema extensions;

-- ─── spaces appearance + vanity ─────────────────────────────────────────────
alter table public.spaces
  add column if not exists icon_url text,
  add column if not exists banner_url text,
  add column if not exists background_url text,
  add column if not exists vanity_code text,
  add column if not exists description text;

do $$ begin
  alter table public.spaces add constraint spaces_vanity_unique unique (vanity_code);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.spaces add constraint spaces_vanity_format
    check (vanity_code is null or vanity_code ~ '^[a-z0-9-]{3,32}$');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.spaces add constraint spaces_description_len
    check (description is null or char_length(description) <= 300);
exception when duplicate_object then null;
end $$;

-- ─── channels: private + password + topic ───────────────────────────────────
alter table public.conversations
  add column if not exists is_private boolean not null default false,
  add column if not exists password_hash text,
  add column if not exists topic text,
  add column if not exists nsfw boolean not null default false;

do $$ begin
  alter table public.conversations add constraint conversations_topic_len
    check (topic is null or char_length(topic) <= 200);
exception when duplicate_object then null;
end $$;

create table if not exists public.space_channel_unlocks (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.space_channel_unlocks enable row level security;
drop policy if exists unlocks_select on public.space_channel_unlocks;
create policy unlocks_select on public.space_channel_unlocks for select to authenticated
  using (user_id = auth.uid());
-- inserts go through security definer RPC

-- ─── custom invites ─────────────────────────────────────────────────────────
create table if not exists public.space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  code text not null unique,
  label text,
  created_by uuid references public.profiles (id) on delete set null,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists space_invites_space_idx on public.space_invites (space_id) where revoked_at is null;
alter table public.space_invites enable row level security;
drop policy if exists invites_member_select on public.space_invites;
create policy invites_member_select on public.space_invites for select to authenticated
  using (exists (select 1 from public.space_members sm where sm.space_id = space_invites.space_id and sm.user_id = auth.uid()));

-- ─── custom roles ───────────────────────────────────────────────────────────
create table if not exists public.space_roles (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#99aab5',
  position int not null default 0,
  perms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (space_id, name)
);
create index if not exists space_roles_space_idx on public.space_roles (space_id, position desc);
alter table public.space_roles enable row level security;
drop policy if exists roles_member_select on public.space_roles;
create policy roles_member_select on public.space_roles for select to authenticated
  using (exists (select 1 from public.space_members sm where sm.space_id = space_roles.space_id and sm.user_id = auth.uid()));

create table if not exists public.space_member_roles (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.space_roles (id) on delete cascade,
  primary key (space_id, user_id, role_id)
);
alter table public.space_member_roles enable row level security;
drop policy if exists member_roles_select on public.space_member_roles;
create policy member_roles_select on public.space_member_roles for select to authenticated
  using (exists (select 1 from public.space_members sm where sm.space_id = space_member_roles.space_id and sm.user_id = auth.uid()));

-- ─── helpers ────────────────────────────────────────────────────────────────
create or replace function public.space_has_channel_access(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    join public.space_members sm on sm.space_id = c.space_id and sm.user_id = auth.uid()
    where c.id = p_conv
      and (
        coalesce(c.is_private, false) = false
        or coalesce(c.password_hash, '') = ''
        or sm.role in ('owner', 'admin')
        or exists (
          select 1 from public.space_channel_unlocks u
          where u.conversation_id = p_conv and u.user_id = auth.uid()
        )
      )
  ) or exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conv and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_member(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conv and user_id = (select auth.uid())
  ) or exists (
    select 1 from public.conversations c
    join public.space_members sm on sm.space_id = c.space_id
    where c.id = p_conv and sm.user_id = (select auth.uid())
      and (
        coalesce(c.is_private, false) = false
        or coalesce(c.password_hash, '') = ''
        or sm.role in ('owner', 'admin')
        or exists (
          select 1 from public.space_channel_unlocks u
          where u.conversation_id = p_conv and u.user_id = (select auth.uid())
        )
      )
  );
$$;

-- ─── appearance ─────────────────────────────────────────────────────────────
create or replace function public.space_set_appearance(
  p_space uuid,
  p_icon_url text default null,
  p_banner_url text default null,
  p_background_url text default null,
  p_icon_color text default null,
  p_description text default null,
  p_name text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_space_staff(p_space) then raise exception 'Staff only'; end if;
  update public.spaces set
    icon_url = coalesce(p_icon_url, icon_url),
    banner_url = coalesce(p_banner_url, banner_url),
    background_url = coalesce(p_background_url, background_url),
    icon_color = coalesce(nullif(trim(p_icon_color), ''), icon_color),
    description = case when p_description is null then description else left(trim(p_description), 300) end,
    name = case when p_name is null or trim(p_name) = '' then name else left(trim(p_name), 64) end
  where id = p_space;
end;
$$;

create or replace function public.space_clear_media(p_space uuid, p_which text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_space_staff(p_space) then raise exception 'Staff only'; end if;
  if p_which = 'icon' then update public.spaces set icon_url = null where id = p_space;
  elsif p_which = 'banner' then update public.spaces set banner_url = null where id = p_space;
  elsif p_which = 'background' then update public.spaces set background_url = null where id = p_space;
  else raise exception 'bad which';
  end if;
end;
$$;

-- ─── invites ────────────────────────────────────────────────────────────────
create or replace function public.space_create_invite(
  p_space uuid,
  p_label text default null,
  p_max_uses int default null,
  p_expires_hours int default null,
  p_code text default null
) returns public.space_invites language plpgsql security definer set search_path = '' as $$
declare
  row public.space_invites;
  code text;
begin
  if not public.is_space_staff(p_space) then raise exception 'Staff only'; end if;
  code := coalesce(nullif(lower(trim(p_code)), ''), substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  if code !~ '^[a-z0-9-]{3,32}$' then raise exception 'Invite code must be 3–32 letters, numbers or dashes'; end if;
  insert into public.space_invites (space_id, code, label, created_by, max_uses, expires_at)
  values (
    p_space,
    code,
    nullif(left(trim(coalesce(p_label, '')), 40), ''),
    auth.uid(),
    p_max_uses,
    case when p_expires_hours is null or p_expires_hours <= 0 then null else now() + make_interval(hours => p_expires_hours) end
  )
  returning * into row;
  return row;
end;
$$;

create or replace function public.space_revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select space_id into sid from public.space_invites where id = p_invite;
  if sid is null then raise exception 'Invite not found'; end if;
  if not public.is_space_staff(sid) then raise exception 'Staff only'; end if;
  update public.space_invites set revoked_at = now() where id = p_invite and revoked_at is null;
end;
$$;

create or replace function public.space_set_vanity(p_space uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare c text := nullif(lower(trim(p_code)), '');
begin
  if public.space_role(p_space) <> 'owner' then raise exception 'Owner only'; end if;
  if c is not null and c !~ '^[a-z0-9-]{3,32}$' then raise exception 'Vanity must be 3–32 letters, numbers or dashes'; end if;
  update public.spaces set vanity_code = c where id = p_space;
exception when unique_violation then
  raise exception 'That vanity code is taken';
end;
$$;

create or replace function public.join_space(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  inv public.space_invites%rowtype;
  raw text := lower(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  raw := split_part(raw, '/', array_length(string_to_array(raw, '/'), 1));

  select id into sid from public.spaces
  where invite_code = raw or vanity_code = raw
  limit 1;

  if sid is null then
    select * into inv from public.space_invites
    where code = raw and revoked_at is null
    limit 1;
    if inv.id is null then raise exception 'Invite code not found'; end if;
    if inv.expires_at is not null and inv.expires_at < now() then raise exception 'This invite has expired'; end if;
    if inv.max_uses is not null and inv.uses >= inv.max_uses then raise exception 'This invite has been used up'; end if;
    sid := inv.space_id;
    update public.space_invites set uses = uses + 1 where id = inv.id;
  end if;

  insert into public.space_members (space_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end;
$$;

-- ─── roles ──────────────────────────────────────────────────────────────────
create or replace function public.space_create_role(
  p_space uuid, p_name text, p_color text default '#99aab5', p_perms jsonb default '{}'::jsonb
) returns public.space_roles language plpgsql security definer set search_path = '' as $$
declare row public.space_roles;
begin
  if not public.is_space_staff(p_space) then raise exception 'Staff only'; end if;
  insert into public.space_roles (space_id, name, color, position, perms)
  values (
    p_space,
    left(trim(p_name), 40),
    coalesce(nullif(trim(p_color), ''), '#99aab5'),
    coalesce((select max(position) + 1 from public.space_roles where space_id = p_space), 1),
    coalesce(p_perms, '{}'::jsonb)
  )
  returning * into row;
  return row;
end;
$$;

create or replace function public.space_update_role(
  p_role uuid, p_name text default null, p_color text default null, p_perms jsonb default null, p_position int default null
) returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select space_id into sid from public.space_roles where id = p_role;
  if sid is null then raise exception 'Role not found'; end if;
  if not public.is_space_staff(sid) then raise exception 'Staff only'; end if;
  update public.space_roles set
    name = coalesce(nullif(trim(p_name), ''), name),
    color = coalesce(nullif(trim(p_color), ''), color),
    perms = coalesce(p_perms, perms),
    position = coalesce(p_position, position)
  where id = p_role;
end;
$$;

create or replace function public.space_delete_role(p_role uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select space_id into sid from public.space_roles where id = p_role;
  if sid is null then raise exception 'Role not found'; end if;
  if not public.is_space_staff(sid) then raise exception 'Staff only'; end if;
  delete from public.space_roles where id = p_role;
end;
$$;

create or replace function public.space_assign_role(p_space uuid, p_user uuid, p_role uuid, p_on boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_space_staff(p_space) then raise exception 'Staff only'; end if;
  if not exists (select 1 from public.space_roles where id = p_role and space_id = p_space) then
    raise exception 'Role not in this server';
  end if;
  if p_on then
    insert into public.space_member_roles (space_id, user_id, role_id) values (p_space, p_user, p_role)
    on conflict do nothing;
  else
    delete from public.space_member_roles where space_id = p_space and user_id = p_user and role_id = p_role;
  end if;
end;
$$;

-- ─── channels create / unlock / settings ────────────────────────────────────
create or replace function public.create_channel(
  p_space uuid,
  p_name text,
  p_kind text,
  p_private boolean default false,
  p_password text default null,
  p_topic text default null,
  p_nsfw boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  hash text := null;
begin
  if not exists (
    select 1 from public.space_members
    where space_id = p_space and user_id = auth.uid() and role in ('owner', 'admin')
  ) then
    raise exception 'Only owners/admins can create channels';
  end if;
  if p_kind not in ('text', 'voice') then raise exception 'bad kind'; end if;
  if coalesce(p_private, false) and nullif(trim(coalesce(p_password, '')), '') is not null then
    hash := extensions.crypt(trim(p_password), extensions.gen_salt('bf'));
  end if;
  insert into public.conversations (kind, name, space_id, position, created_by, is_private, password_hash, topic, nsfw)
  values (
    p_kind,
    case when p_kind = 'text' then lower(regexp_replace(trim(p_name), '\s+', '-', 'g')) else trim(p_name) end,
    p_space,
    coalesce((select max(position) + 1 from public.conversations where space_id = p_space and kind = p_kind), 0),
    auth.uid(),
    coalesce(p_private, false) or hash is not null,
    hash,
    nullif(left(trim(coalesce(p_topic, '')), 200), ''),
    coalesce(p_nsfw, false)
  )
  returning id into cid;
  return cid;
end;
$$;

create or replace function public.unlock_channel(p_conv uuid, p_password text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into c from public.conversations where id = p_conv;
  if c.id is null then raise exception 'Channel not found'; end if;
  if c.space_id is null then raise exception 'Not a server channel'; end if;
  if not exists (select 1 from public.space_members where space_id = c.space_id and user_id = auth.uid()) then
    raise exception 'Join the server first';
  end if;
  if coalesce(c.password_hash, '') = '' then
    insert into public.space_channel_unlocks (conversation_id, user_id) values (p_conv, auth.uid()) on conflict do nothing;
    return true;
  end if;
  if extensions.crypt(trim(p_password), c.password_hash) <> c.password_hash then
    raise exception 'Wrong password';
  end if;
  insert into public.space_channel_unlocks (conversation_id, user_id) values (p_conv, auth.uid()) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.space_set_channel(
  p_conv uuid,
  p_name text default null,
  p_topic text default null,
  p_nsfw boolean default null,
  p_private boolean default null,
  p_password text default null,
  p_clear_password boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.conversations%rowtype;
begin
  select * into c from public.conversations where id = p_conv;
  if c.id is null or c.space_id is null then raise exception 'Channel not found'; end if;
  if not public.is_space_staff(c.space_id) then raise exception 'Staff only'; end if;
  update public.conversations set
    name = case
      when p_name is null or trim(p_name) = '' then name
      when kind = 'text' then lower(regexp_replace(trim(p_name), '\s+', '-', 'g'))
      else left(trim(p_name), 40)
    end,
    topic = case when p_topic is null then topic else nullif(left(trim(p_topic), 200), '') end,
    nsfw = coalesce(p_nsfw, nsfw),
    is_private = coalesce(p_private, is_private),
    password_hash = case
      when p_clear_password then null
      when nullif(trim(coalesce(p_password, '')), '') is not null then extensions.crypt(trim(p_password), extensions.gen_salt('bf'))
      else password_hash
    end
  where id = p_conv;
  if p_clear_password or (p_private is not null and p_private = false) then
    delete from public.space_channel_unlocks where conversation_id = p_conv;
  end if;
end;
$$;

create or replace function public.space_delete_channel(p_conv uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.conversations%rowtype;
begin
  select * into c from public.conversations where id = p_conv;
  if c.id is null or c.space_id is null then raise exception 'Channel not found'; end if;
  if not public.is_space_staff(c.space_id) then raise exception 'Staff only'; end if;
  delete from public.conversations where id = p_conv;
end;
$$;

grant execute on function public.space_set_appearance(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.space_clear_media(uuid, text) to authenticated;
grant execute on function public.space_create_invite(uuid, text, int, int, text) to authenticated;
grant execute on function public.space_revoke_invite(uuid) to authenticated;
grant execute on function public.space_set_vanity(uuid, text) to authenticated;
grant execute on function public.space_create_role(uuid, text, text, jsonb) to authenticated;
grant execute on function public.space_update_role(uuid, text, text, jsonb, int) to authenticated;
grant execute on function public.space_delete_role(uuid) to authenticated;
grant execute on function public.space_assign_role(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.create_channel(uuid, text, text, boolean, text, text, boolean) to authenticated;
grant execute on function public.unlock_channel(uuid, text) to authenticated;
grant execute on function public.space_set_channel(uuid, text, text, boolean, boolean, text, boolean) to authenticated;
grant execute on function public.space_delete_channel(uuid) to authenticated;
grant execute on function public.space_has_channel_access(uuid) to authenticated;

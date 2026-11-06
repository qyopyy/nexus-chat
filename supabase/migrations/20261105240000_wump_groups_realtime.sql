-- Wump groups + group-aware visibility + fix nearby-invite follows.

create table if not exists public.bump_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists bump_groups_owner_idx on public.bump_groups (owner_id, created_at desc);

create table if not exists public.bump_group_members (
  group_id uuid not null references public.bump_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists bump_group_members_user_idx on public.bump_group_members (user_id, joined_at desc);

alter table public.bump_groups enable row level security;
alter table public.bump_group_members enable row level security;

drop policy if exists bump_groups_select on public.bump_groups;
create policy bump_groups_select on public.bump_groups
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.bump_group_members m where m.group_id = id and m.user_id = auth.uid())
  );

drop policy if exists bump_groups_insert on public.bump_groups;
create policy bump_groups_insert on public.bump_groups
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists bump_groups_update on public.bump_groups;
create policy bump_groups_update on public.bump_groups
  for update to authenticated using (owner_id = auth.uid());

drop policy if exists bump_groups_delete on public.bump_groups;
create policy bump_groups_delete on public.bump_groups
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists bump_group_members_select on public.bump_group_members;
create policy bump_group_members_select on public.bump_group_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.bump_group_members m
      where m.group_id = bump_group_members.group_id and m.user_id = auth.uid()
    )
  );

drop policy if exists bump_group_members_write on public.bump_group_members;
create policy bump_group_members_write on public.bump_group_members
  for all to authenticated
  using (
    exists (
      select 1 from public.bump_groups g
      where g.id = group_id and g.owner_id = auth.uid()
    )
    or user_id = auth.uid()
  )
  with check (
    exists (
      select 1 from public.bump_groups g
      where g.id = group_id and g.owner_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- Group mates can always see each other's Live pins (in addition to friends/family/everyone)
create or replace function public.bump_can_see(target uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target = viewer then true
    when not exists (
      select 1 from bump_presence p
      where p.user_id = target and p.updated_at > now() - interval '20 minutes'
    ) then false
    when exists (
      select 1
      from bump_group_members a
      join bump_group_members b on a.group_id = b.group_id
      where a.user_id = target and b.user_id = viewer
    ) then true
    when (select visible from bump_presence where user_id = target) = 'everyone' then true
    when (select visible from bump_presence where user_id = target) = 'family' then exists (
      select 1 from bump_family f
      where (f.user_id = target and f.member_id = viewer)
         or (f.user_id = viewer and f.member_id = target)
    )
    when (select visible from bump_presence where user_id = target) = 'friends' then exists (
      select 1 from friendships fr
      where fr.status = 'accepted'
        and ((fr.requester_id = target and fr.addressee_id = viewer)
          or (fr.requester_id = viewer and fr.addressee_id = target))
    ) or exists (
      select 1 from bump_family f
      where (f.user_id = target and f.member_id = viewer)
         or (f.user_id = viewer and f.member_id = target)
    )
    else false
  end;
$$;

create or replace function public.bump_create_group(p_name text, p_members uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  code text;
  mid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_name is null or char_length(trim(p_name)) < 1 then raise exception 'name required'; end if;
  code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into bump_groups (name, owner_id, invite_code)
  values (trim(p_name), uid, code)
  returning id into gid;
  insert into bump_group_members (group_id, user_id, role) values (gid, uid, 'owner');
  if p_members is not null then
    foreach mid in array p_members loop
      if mid is distinct from uid then
        insert into bump_group_members (group_id, user_id, role)
        values (gid, mid, 'member')
        on conflict do nothing;
      end if;
    end loop;
  end if;
  return jsonb_build_object('id', gid, 'invite_code', code, 'name', trim(p_name));
end;
$$;

create or replace function public.bump_join_group(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g bump_groups%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into g from bump_groups where invite_code = lower(trim(p_code));
  if not found then raise exception 'group not found'; end if;
  insert into bump_group_members (group_id, user_id, role)
  values (g.id, uid, 'member')
  on conflict do nothing;
  return jsonb_build_object('id', g.id, 'name', g.name, 'invite_code', g.invite_code);
end;
$$;

create or replace function public.bump_list_groups()
returns table (
  id uuid,
  name text,
  owner_id uuid,
  invite_code text,
  created_at timestamptz,
  member_count int,
  my_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.owner_id,
    g.invite_code,
    g.created_at,
    (select count(*)::int from bump_group_members m where m.group_id = g.id) as member_count,
    coalesce((select m.role from bump_group_members m where m.group_id = g.id and m.user_id = auth.uid()), 'member') as my_role
  from bump_groups g
  where exists (
    select 1 from bump_group_members m where m.group_id = g.id and m.user_id = auth.uid()
  )
  order by g.created_at desc;
$$;

create or replace function public.bump_group_members_list(p_group uuid)
returns table (user_id uuid, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.role, m.joined_at
  from bump_group_members m
  where m.group_id = p_group
    and exists (
      select 1 from bump_group_members x
      where x.group_id = p_group and x.user_id = auth.uid()
    )
  order by m.joined_at;
$$;

create or replace function public.bump_leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select owner_id into owner from bump_groups where id = p_group;
  if owner is null then raise exception 'group not found'; end if;
  if owner = uid then
    delete from bump_groups where id = p_group;
  else
    delete from bump_group_members where group_id = p_group and user_id = uid;
  end if;
end;
$$;

grant execute on function public.bump_create_group(text, uuid[]) to authenticated;
grant execute on function public.bump_join_group(text) to authenticated;
grant execute on function public.bump_list_groups() to authenticated;
grant execute on function public.bump_group_members_list(uuid) to authenticated;
grant execute on function public.bump_leave_group(uuid) to authenticated;
grant execute on function public.bump_can_see(uuid, uuid) to authenticated;

-- Fix nearby invite soft-follow column name
create or replace function public.bump_redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv bump_invites%rowtype;
  who text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from bump_invites where code = lower(trim(p_code));
  if not found then raise exception 'invite not found'; end if;
  if inv.expires_at < now() then raise exception 'invite expired'; end if;
  if inv.uses >= inv.max_uses then raise exception 'invite used up'; end if;
  if inv.creator_id = uid then raise exception 'that''s your own invite'; end if;

  select coalesce(wump_who_can_invite, 'friends') into who
  from public.user_privacy where user_id = inv.creator_id;
  who := coalesce(who, 'friends');
  if who = 'nobody' then
    raise exception 'this person is not accepting Wump invites';
  end if;

  if inv.kind = 'family' then
    insert into bump_family (user_id, member_id) values (inv.creator_id, uid) on conflict do nothing;
    insert into bump_family (user_id, member_id) values (uid, inv.creator_id) on conflict do nothing;
    begin
      insert into friendships (requester_id, addressee_id, status)
      values (uid, inv.creator_id, 'pending') on conflict do nothing;
    exception when others then null;
    end;
  elsif inv.kind = 'friend' then
    begin
      insert into friendships (requester_id, addressee_id, status)
      values (uid, inv.creator_id, 'pending') on conflict do nothing;
    exception when others then null;
    end;
  elsif inv.kind = 'nearby' then
    begin
      insert into bump_follows (follower_id, followee_id)
      values (uid, inv.creator_id) on conflict do nothing;
    exception when others then null;
    end;
  end if;

  update bump_invites set uses = uses + 1 where code = inv.code;
  return jsonb_build_object('ok', true, 'kind', inv.kind, 'creator_id', inv.creator_id);
end;
$$;

grant execute on function public.bump_redeem_invite(text) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.bump_groups;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.bump_group_members;
  exception when duplicate_object then null;
  end;
end $$;

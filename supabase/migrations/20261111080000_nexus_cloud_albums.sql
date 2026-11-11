-- Shared Cloud albums. Creating and uploading still require Premium (rank 2).
-- An invited friend also needs Premium to open the album. They cannot upload
-- into the owner's storage.

create table if not exists public.nexus_cloud_albums (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  created_at  timestamptz not null default now()
);
create index if not exists nexus_cloud_albums_owner_idx on public.nexus_cloud_albums (owner_id, created_at desc);

create table if not exists public.nexus_cloud_album_items (
  album_id   uuid not null references public.nexus_cloud_albums (id) on delete cascade,
  file_id    uuid not null references public.nexus_cloud_files (id) on delete cascade,
  position   int not null default 1 check (position between 1 and 5000),
  created_at timestamptz not null default now(),
  primary key (album_id, file_id)
);
create index if not exists nexus_cloud_album_items_file_idx on public.nexus_cloud_album_items (file_id);

create table if not exists public.nexus_cloud_album_members (
  album_id   uuid not null references public.nexus_cloud_albums (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (album_id, user_id)
);
create index if not exists nexus_cloud_album_members_user_idx on public.nexus_cloud_album_members (user_id);

alter table public.nexus_cloud_albums enable row level security;
alter table public.nexus_cloud_album_items enable row level security;
alter table public.nexus_cloud_album_members enable row level security;
revoke all on public.nexus_cloud_albums from anon, authenticated;
revoke all on public.nexus_cloud_album_items from anon, authenticated;
revoke all on public.nexus_cloud_album_members from anon, authenticated;
grant select, insert, update, delete on public.nexus_cloud_albums to authenticated;
grant select, insert, delete on public.nexus_cloud_album_items to authenticated;
grant select, delete on public.nexus_cloud_album_members to authenticated;

create or replace function public.nexus_cloud_album_visible(p_album uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_tier() >= 2 and exists (
    select 1 from public.nexus_cloud_albums a
    where a.id = p_album and (
      a.owner_id = (select auth.uid())
      or exists (
        select 1 from public.nexus_cloud_album_members m
        where m.album_id = a.id and m.user_id = (select auth.uid())
      )
    )
  );
$$;
revoke all on function public.nexus_cloud_album_visible(uuid) from public, anon;
grant execute on function public.nexus_cloud_album_visible(uuid) to authenticated;

drop policy if exists nexus_cloud_albums_read on public.nexus_cloud_albums;
create policy nexus_cloud_albums_read on public.nexus_cloud_albums
  for select to authenticated
  using (public.nexus_cloud_album_visible(id));

drop policy if exists nexus_cloud_albums_write on public.nexus_cloud_albums;
create policy nexus_cloud_albums_write on public.nexus_cloud_albums
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.my_tier() >= 2);

drop policy if exists nexus_cloud_albums_owner_update on public.nexus_cloud_albums;
create policy nexus_cloud_albums_owner_update on public.nexus_cloud_albums
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.my_tier() >= 2)
  with check (owner_id = (select auth.uid()) and public.my_tier() >= 2);

drop policy if exists nexus_cloud_albums_owner_delete on public.nexus_cloud_albums;
create policy nexus_cloud_albums_owner_delete on public.nexus_cloud_albums
  for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists nexus_cloud_album_items_read on public.nexus_cloud_album_items;
create policy nexus_cloud_album_items_read on public.nexus_cloud_album_items
  for select to authenticated
  using (public.nexus_cloud_album_visible(album_id));

drop policy if exists nexus_cloud_album_items_write on public.nexus_cloud_album_items;
create policy nexus_cloud_album_items_write on public.nexus_cloud_album_items
  for insert to authenticated
  with check (
    public.my_tier() >= 2
    and exists (
      select 1 from public.nexus_cloud_albums a
      where a.id = album_id and a.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.nexus_cloud_files f
      where f.id = file_id and f.owner_id = (select auth.uid())
    )
  );

drop policy if exists nexus_cloud_album_items_delete on public.nexus_cloud_album_items;
create policy nexus_cloud_album_items_delete on public.nexus_cloud_album_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.nexus_cloud_albums a
      where a.id = album_id and a.owner_id = (select auth.uid())
    )
  );

drop policy if exists nexus_cloud_album_members_read on public.nexus_cloud_album_members;
create policy nexus_cloud_album_members_read on public.nexus_cloud_album_members
  for select to authenticated
  using (public.nexus_cloud_album_visible(album_id));

drop policy if exists nexus_cloud_album_members_delete on public.nexus_cloud_album_members;
create policy nexus_cloud_album_members_delete on public.nexus_cloud_album_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.nexus_cloud_albums a
      where a.id = album_id and a.owner_id = (select auth.uid())
    )
  );

drop policy if exists nexus_cloud_album_file_read on public.nexus_cloud_files;
create policy nexus_cloud_album_file_read on public.nexus_cloud_files
  for select to authenticated
  using (
    public.my_tier() >= 2
    and exists (
      select 1
      from public.nexus_cloud_album_items i
      join public.nexus_cloud_album_members m on m.album_id = i.album_id
      where i.file_id = id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists nexus_cloud_obj_album_read on storage.objects;
create policy nexus_cloud_obj_album_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'nexus-cloud'
    and public.my_tier() >= 2
    and exists (
      select 1
      from public.nexus_cloud_files f
      join public.nexus_cloud_album_items i on i.file_id = f.id
      join public.nexus_cloud_album_members m on m.album_id = i.album_id
      where f.path = name and m.user_id = (select auth.uid())
    )
  );

create or replace function public.nexus_cloud_album_invite(p_album uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  who uuid;
begin
  if me is null or public.my_tier() < 2 then raise exception 'Nexus Cloud is part of Premium'; end if;
  if not exists (select 1 from public.nexus_cloud_albums a where a.id = p_album and a.owner_id = me) then
    raise exception 'Album not found';
  end if;
  select id into who from public.profiles where lower(username) = lower(trim(coalesce(p_username, '')));
  if who is null then raise exception 'No Nexus user with that name'; end if;
  if who = me then raise exception 'You already own this album'; end if;
  if public.is_blocked_between(me, who) then raise exception 'You cannot invite that person'; end if;
  if public.tier_of(who) < 2 then raise exception 'They need Nexus Premium to open a shared album'; end if;
  if (select count(*) from public.nexus_cloud_album_members where album_id = p_album) >= 20 then
    raise exception 'This album already has 20 people';
  end if;
  insert into public.nexus_cloud_album_members (album_id, user_id) values (p_album, who)
  on conflict do nothing;
end;
$$;

revoke all on function public.nexus_cloud_album_invite(uuid, text) from public, anon;
grant execute on function public.nexus_cloud_album_invite(uuid, text) to authenticated;

alter table public.nexus_cloud_album_items replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.nexus_cloud_albums;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.nexus_cloud_album_items;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.nexus_cloud_album_members;
exception when duplicate_object then null; when undefined_object then null;
end $$;

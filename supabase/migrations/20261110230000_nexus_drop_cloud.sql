-- Nexus Drop (send a file to your other screen or a friend) and Nexus Cloud
-- (premium photos, files, and voice memos, with a daily sync marker).
-- Additive. Drop files expire after a day. Cloud uploads require Premium (rank 2) or staff.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('nexus-drops', 'nexus-drops', false, 104857600, null),
  ('nexus-cloud', 'nexus-cloud', false, 2147483648, null)
on conflict (id) do update set public = false;

create table if not exists public.nexus_drops (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references public.profiles (id) on delete cascade,
  to_user      uuid not null references public.profiles (id) on delete cascade,
  from_device  text,
  name         text not null check (char_length(name) between 1 and 180),
  path         text not null check (char_length(path) between 8 and 400),
  mime         text,
  bytes        bigint not null check (bytes > 0 and bytes <= 104857600),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '1 day'),
  claimed_at   timestamptz
);
create index if not exists nexus_drops_to_idx on public.nexus_drops (to_user, created_at desc);

create table if not exists public.nexus_cloud_files (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('photo', 'file', 'voice')),
  name        text not null check (char_length(name) between 1 and 180),
  path        text not null check (char_length(path) between 8 and 400),
  mime        text,
  bytes       bigint not null check (bytes > 0),
  created_at  timestamptz not null default now()
);
create index if not exists nexus_cloud_owner_idx on public.nexus_cloud_files (owner_id, created_at desc);

create table if not exists public.nexus_cloud_sync (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  last_sync  timestamptz
);

alter table public.nexus_drops enable row level security;
alter table public.nexus_cloud_files enable row level security;
alter table public.nexus_cloud_sync enable row level security;

drop policy if exists nexus_drops_read on public.nexus_drops;
create policy nexus_drops_read on public.nexus_drops
  for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

drop policy if exists nexus_drops_insert on public.nexus_drops;
create policy nexus_drops_insert on public.nexus_drops
  for insert to authenticated
  with check (from_user = (select auth.uid()));

drop policy if exists nexus_drops_claim on public.nexus_drops;
create policy nexus_drops_claim on public.nexus_drops
  for update to authenticated
  using (to_user = (select auth.uid()))
  with check (to_user = (select auth.uid()));

drop policy if exists nexus_cloud_read on public.nexus_cloud_files;
create policy nexus_cloud_read on public.nexus_cloud_files
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists nexus_cloud_insert on public.nexus_cloud_files;
create policy nexus_cloud_insert on public.nexus_cloud_files
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.my_tier() >= 2);

drop policy if exists nexus_cloud_delete on public.nexus_cloud_files;
create policy nexus_cloud_delete on public.nexus_cloud_files
  for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists nexus_cloud_sync_own on public.nexus_cloud_sync;
create policy nexus_cloud_sync_own on public.nexus_cloud_sync
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.nexus_cloud_sync_due()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  last_at timestamptz;
begin
  if me is null or public.my_tier() < 2 then
    return false;
  end if;
  select last_sync into last_at from public.nexus_cloud_sync where user_id = me;
  return last_at is null or last_at < now() - interval '1 day';
end;
$$;

create or replace function public.nexus_cloud_sync_mark()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or public.my_tier() < 2 then
    raise exception 'Nexus Cloud is part of Premium';
  end if;
  insert into public.nexus_cloud_sync (user_id, last_sync) values (me, now())
  on conflict (user_id) do update set last_sync = now();
end;
$$;

grant execute on function public.nexus_cloud_sync_due() to authenticated;
grant execute on function public.nexus_cloud_sync_mark() to authenticated;

drop policy if exists nexus_drops_obj_insert on storage.objects;
create policy nexus_drops_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'nexus-drops' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists nexus_drops_obj_read on storage.objects;
create policy nexus_drops_obj_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'nexus-drops'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.nexus_drops d
        where d.path = name and d.to_user = (select auth.uid()) and d.expires_at > now()
      )
    )
  );

drop policy if exists nexus_drops_obj_delete on storage.objects;
create policy nexus_drops_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'nexus-drops' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists nexus_cloud_obj_all on storage.objects;
create policy nexus_cloud_obj_all on storage.objects
  for all to authenticated
  using (bucket_id = 'nexus-cloud' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'nexus-cloud'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.my_tier() >= 2
  );

do $$
begin
  alter publication supabase_realtime add table public.nexus_drops;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.nexus_cloud_files;
exception when duplicate_object then null; when undefined_object then null;
end $$;

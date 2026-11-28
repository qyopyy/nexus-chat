-- Nexus Pass: end-to-end encrypted password manager + authenticator.
-- The server stores only ciphertext, a random salt, the KDF settings and the wrapped vault key.
-- Master password, vault key and every item stay in the client (AES-256-GCM, Argon2id).

create table if not exists public.pass_vaults (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  kdf jsonb not null,
  wrapped_vk text not null check (length(wrapped_vk) between 20 and 400),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pass_items (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  blob text not null check (length(blob) between 20 and 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pass_items_owner_idx on public.pass_items (owner_id, updated_at desc);

alter table public.pass_vaults enable row level security;
alter table public.pass_items enable row level security;

create policy pass_vaults_select on public.pass_vaults for select to authenticated using (owner_id = (select auth.uid()));
create policy pass_vaults_insert on public.pass_vaults for insert to authenticated with check (owner_id = (select auth.uid()));
create policy pass_vaults_update on public.pass_vaults for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy pass_vaults_delete on public.pass_vaults for delete to authenticated using (owner_id = (select auth.uid()));

create policy pass_items_select on public.pass_items for select to authenticated using (owner_id = (select auth.uid()));
create policy pass_items_insert on public.pass_items for insert to authenticated with check (owner_id = (select auth.uid()));
create policy pass_items_update on public.pass_items for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy pass_items_delete on public.pass_items for delete to authenticated using (owner_id = (select auth.uid()));

-- bump updated_at, cap the number of items per person, and never let a row change owner
create or replace function public.pass_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'owner cannot change';
  end if;
  if tg_op = 'INSERT' and tg_table_name = 'pass_items' then
    if (select count(*) from public.pass_items where owner_id = new.owner_id) >= 10000 then
      raise exception 'Vault is full (10000 items)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pass_items_touch on public.pass_items;
create trigger pass_items_touch before insert or update on public.pass_items for each row execute function public.pass_touch();
drop trigger if exists pass_vaults_touch on public.pass_vaults;
create trigger pass_vaults_touch before update on public.pass_vaults for each row execute function public.pass_touch();

revoke all on function public.pass_touch() from public, anon, authenticated;

-- live sync between a person's own devices
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pass_items') then
    alter publication supabase_realtime add table public.pass_items;
  end if;
end $$;

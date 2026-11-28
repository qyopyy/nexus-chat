-- Nexus Clip: universal clipboard + tab handoff, end-to-end encrypted.
-- The server stores only ciphertext (blob), a random salt, KDF settings and the wrapped key.
-- Plain columns are limited to what the database needs to do its job: kind, pinned, expiry.

create table if not exists public.clip_keys (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  kdf jsonb not null,
  wrapped_key text not null check (length(wrapped_key) between 20 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clip_items (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('text','url','color','image','code','handoff')),
  blob text not null check (length(blob) between 20 and 2000000),
  pinned boolean not null default false,
  sensitive boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists clip_items_owner_idx on public.clip_items (owner_id, created_at desc);
create index if not exists clip_items_expiry_idx on public.clip_items (expires_at) where expires_at is not null;

alter table public.clip_keys enable row level security;
alter table public.clip_items enable row level security;

create policy clip_keys_select on public.clip_keys for select to authenticated using (owner_id = (select auth.uid()));
create policy clip_keys_insert on public.clip_keys for insert to authenticated with check (owner_id = (select auth.uid()));
create policy clip_keys_update on public.clip_keys for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy clip_keys_delete on public.clip_keys for delete to authenticated using (owner_id = (select auth.uid()));

-- expired rows are invisible the moment they expire, even before anything deletes them
create policy clip_items_select on public.clip_items for select to authenticated
  using (owner_id = (select auth.uid()) and (expires_at is null or expires_at > now()));
create policy clip_items_insert on public.clip_items for insert to authenticated with check (owner_id = (select auth.uid()));
create policy clip_items_update on public.clip_items for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy clip_items_delete on public.clip_items for delete to authenticated using (owner_id = (select auth.uid()));

-- keep the table tidy: owner is fixed, pinned means "keep", expiry is capped, old rows make room
create or replace function public.clip_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'owner cannot change';
  end if;
  if new.pinned then
    new.expires_at := null;
  elsif new.expires_at is not null and new.expires_at > now() + interval '30 days' then
    new.expires_at := now() + interval '30 days';
  end if;
  if tg_op = 'INSERT' then
    delete from public.clip_items where owner_id = new.owner_id and expires_at is not null and expires_at <= now();
    delete from public.clip_items where id in (
      select id from public.clip_items where owner_id = new.owner_id and not pinned
      order by created_at desc offset 299
    );
  end if;
  return new;
end $$;

drop trigger if exists clip_items_touch on public.clip_items;
create trigger clip_items_touch before insert or update on public.clip_items for each row execute function public.clip_touch();
create or replace function public.clip_keys_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'owner cannot change';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists clip_keys_touch on public.clip_keys;
create trigger clip_keys_touch before update on public.clip_keys for each row execute function public.clip_keys_touch();

revoke all on function public.clip_touch() from public, anon, authenticated;
revoke all on function public.clip_keys_touch() from public, anon, authenticated;

-- a device calls this when it opens, to sweep its owner's expired rows
create or replace function public.clip_purge() returns int
language sql security invoker set search_path = public as $$
  with d as (delete from public.clip_items where owner_id = (select auth.uid()) and expires_at is not null and expires_at <= now() returning 1)
  select count(*)::int from d;
$$;
revoke all on function public.clip_purge() from public, anon;
grant execute on function public.clip_purge() to authenticated;

-- deletes must carry the owner so live sync can filter them
alter table public.clip_items replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clip_items') then
    alter publication supabase_realtime add table public.clip_items;
  end if;
end $$;

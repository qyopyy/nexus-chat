-- Saved claimant details (name, company, email, phone, address) for copyright notices, per account.
create table if not exists public.takedown_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  contact jsonb not null check (jsonb_typeof(contact) = 'object' and pg_column_size(contact) < 4000),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists takedown_contacts_owner_idx on public.takedown_contacts (owner_id);
-- at most one default per account
create unique index if not exists takedown_contacts_one_default on public.takedown_contacts (owner_id) where is_default;

alter table public.takedown_contacts enable row level security;

drop policy if exists takedown_contacts_select on public.takedown_contacts;
drop policy if exists takedown_contacts_insert on public.takedown_contacts;
drop policy if exists takedown_contacts_update on public.takedown_contacts;
drop policy if exists takedown_contacts_delete on public.takedown_contacts;
create policy takedown_contacts_select on public.takedown_contacts for select to authenticated using (owner_id = (select auth.uid()));
create policy takedown_contacts_insert on public.takedown_contacts for insert to authenticated with check (owner_id = (select auth.uid()));
create policy takedown_contacts_update on public.takedown_contacts for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy takedown_contacts_delete on public.takedown_contacts for delete to authenticated using (owner_id = (select auth.uid()));

-- keep the default flag exclusive: setting one clears the others
create or replace function public.takedown_contacts_one_default() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.is_default then
    update public.takedown_contacts set is_default = false where owner_id = new.owner_id and id <> new.id and is_default;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists takedown_contacts_default on public.takedown_contacts;
create trigger takedown_contacts_default before insert or update on public.takedown_contacts for each row execute function public.takedown_contacts_one_default();

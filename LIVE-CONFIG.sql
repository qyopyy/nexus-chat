-- Nexus Live Control: owner-set settings that every open app follows in real time (no app update needed).
-- Run once in the Supabase SQL editor. Adds one new table; nothing existing is changed.
create table if not exists public.live_config (
  key        text primary key check (key ~ '^[a-z0-9_.]{1,64}$'),
  value      jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.live_config enable row level security;

drop policy if exists live_config_read on public.live_config;
create policy live_config_read on public.live_config for select to anon, authenticated using (true);

drop policy if exists live_config_write on public.live_config;
create policy live_config_write on public.live_config for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.site_role in ('admin','owner')))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.site_role in ('admin','owner')));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_config') then
    alter publication supabase_realtime add table public.live_config;
  end if;
end $$;

-- Nexus Guard: 24/7 link watchlist + event log (scanner runs in the `guard` edge function; cron re-scans every 3 h)
create table if not exists public.guard_watch (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null check (char_length(url) <= 2048),
  verdict text not null default 'safe' check (verdict in ('safe','suspicious','danger')),
  score int not null default 0,
  details jsonb,
  alerts_on boolean not null default true,
  last_scan timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, url)
);
create index if not exists guard_watch_scan_idx on public.guard_watch (last_scan nulls first);

create table if not exists public.guard_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  watch_id uuid references public.guard_watch(id) on delete cascade,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists guard_events_owner_idx on public.guard_events (owner_id, created_at desc);
create index if not exists guard_events_watch_idx on public.guard_events (watch_id);

alter table public.guard_watch enable row level security;
alter table public.guard_events enable row level security;

create policy guard_watch_select on public.guard_watch for select to authenticated using (owner_id = (select auth.uid()));
create policy guard_watch_insert on public.guard_watch for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select count(*) from public.guard_watch w where w.owner_id = (select auth.uid())) < 25);
create policy guard_watch_update on public.guard_watch for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy guard_watch_delete on public.guard_watch for delete to authenticated using (owner_id = (select auth.uid()));
create policy guard_events_select on public.guard_events for select to authenticated using (owner_id = (select auth.uid()));
create policy guard_events_delete on public.guard_events for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.guard_watch, public.guard_events from anon, public;
grant select, insert, update, delete on public.guard_watch to authenticated;
grant select, delete on public.guard_events to authenticated;
grant all on public.guard_watch, public.guard_events to service_role;

select cron.schedule('nexus-guard-watch', '23 */3 * * *', $$
  select net.http_post(
    url := 'https://fcnabeudhdlugruqzezn.supabase.co/functions/v1/guard',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', (select secret from public.push_config where id = 1)),
    body := '{"action":"scan_all"}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

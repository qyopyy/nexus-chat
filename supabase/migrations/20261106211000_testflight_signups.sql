-- TestFlight email invites: testers enter first name, last name and email on /beta; the
-- testflight-invite edge function adds them to the app's external TestFlight group via the
-- App Store Connect API (Apple then emails the invite). Only the edge function (service role)
-- writes; admins can read, retry and remove.
create table if not exists public.testflight_signups (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('nexus', 'wump', 'browser', 'link')),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  status text not null default 'pending' check (status in ('pending', 'invited', 'failed')),
  error text,
  ip_hash text,
  created_at timestamptz not null default now(),
  invited_at timestamptz
);
create unique index if not exists testflight_signups_app_email_key on public.testflight_signups (app, lower(email));
create index if not exists testflight_signups_app_status_idx on public.testflight_signups (app, status);
create index if not exists testflight_signups_ip_idx on public.testflight_signups (ip_hash, created_at desc);
alter table public.testflight_signups enable row level security;
revoke all on public.testflight_signups from anon, authenticated;
grant select, delete on public.testflight_signups to authenticated;
create policy "testflight signups admin read" on public.testflight_signups for select to authenticated using (public.my_rank() >= 3);
create policy "testflight signups admin delete" on public.testflight_signups for delete to authenticated using (public.my_rank() >= 3);

-- public counter for the /beta page ("1,234 of 10,000 spots taken")
create or replace function public.testflight_spots(p_app text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('taken', (select count(*) from public.testflight_signups where app = p_app and status = 'invited'), 'limit', 10000);
$$;
revoke execute on function public.testflight_spots(text) from public;
grant execute on function public.testflight_spots(text) to anon, authenticated, service_role;

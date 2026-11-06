-- TestFlight public invite links (one per iOS app). Anyone can read them (the /beta page is public);
-- only site admins/owner can set them. Links must be real TestFlight public links.
create table if not exists public.testflight_links (
  app text primary key check (app in ('nexus', 'wump', 'browser', 'link')),
  url text not null check (url ~ '^https://testflight\.apple\.com/join/[A-Za-z0-9]{6,16}$'),
  note text check (char_length(note) <= 140),
  opens int not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists testflight_links_updated_by_fk_idx on public.testflight_links (updated_by);
alter table public.testflight_links enable row level security;
revoke all on public.testflight_links from anon, authenticated;
grant select on public.testflight_links to anon, authenticated;
grant insert, update, delete on public.testflight_links to authenticated;
create policy "testflight read" on public.testflight_links for select to anon, authenticated using (true);
create policy "testflight admin insert" on public.testflight_links for insert to authenticated with check (public.my_rank() >= 3);
create policy "testflight admin update" on public.testflight_links for update to authenticated using (public.my_rank() >= 3) with check (public.my_rank() >= 3);
create policy "testflight admin delete" on public.testflight_links for delete to authenticated using (public.my_rank() >= 3);

-- count taps on "Join" (public, so the /beta page can call it; only bumps a counter)
create or replace function public.testflight_open(p_app text)
returns void language sql security definer set search_path = '' as $$
  update public.testflight_links set opens = opens + 1 where app = p_app;
$$;
revoke execute on function public.testflight_open(text) from public;
grant execute on function public.testflight_open(text) to anon, authenticated, service_role;

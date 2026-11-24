-- Custom domains for pre-save pages: music.yourname.com → that campaign's public page.
-- The owner adds a domain to a campaign, proves ownership with a DNS TXT record, and the presave
-- Edge Function verifies it (and adds it to the Vercel project when VERCEL_TOKEN / VERCEL_PROJECT_ID are set).
-- Apply AFTER 20261121180000_presave_service.sql and 20261123120000_presave_design.sql.
create table if not exists public.presave_domains (
  campaign_id uuid primary key references public.presave_campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (
    char_length(domain) <= 253 and domain = lower(domain)
    and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'
    and domain !~ '(^|\.)(nexusproject\.cc|vercel\.app|vercel\.com|vercel-dns\.com|supabase\.co|supabase\.in|localhost)$'
  ),
  token text not null check (token ~ '^[a-f0-9]{32}$'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'live')),
  note text check (note is null or char_length(note) <= 400),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Anyone may ask for a domain, but only one campaign can own a verified one.
create unique index if not exists presave_domains_one_verified on public.presave_domains(domain) where status in ('verified', 'live');
create index if not exists presave_domains_owner on public.presave_domains(owner_id);
alter table public.presave_domains enable row level security;
revoke all on public.presave_domains from public, anon, authenticated;
grant select on public.presave_domains to authenticated;
grant all on public.presave_domains to service_role;
-- Owners can read their own rows (token included: it is their own DNS challenge). All writes go through the Edge Function.
create policy "domain owners read" on public.presave_domains for select to authenticated using (public.presave_owner(owner_id));

-- Used by the site's proxy and the public page: which published campaign does this domain open?
create or replace function public.presave_slug_by_domain(p_domain text)
returns text language sql stable security definer set search_path = '' as $$
  select c.slug
  from public.presave_domains d join public.presave_campaigns c on c.id = d.campaign_id
  where d.domain = lower(regexp_replace(coalesce(p_domain, ''), '^www\.', ''))
    and d.status in ('verified', 'live') and c.published;
$$;
revoke all on function public.presave_slug_by_domain(text) from public;
grant execute on function public.presave_slug_by_domain(text) to anon, authenticated, service_role;

-- The Edge Function stamps updated_at itself; keep ownership immutable.
create or replace function public.presave_domains_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.campaign_id is distinct from old.campaign_id or new.owner_id is distinct from old.owner_id then
    raise exception 'Domain ownership cannot be transferred' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.presave_domains_guard() from public, anon, authenticated;
drop trigger if exists presave_domains_guard on public.presave_domains;
create trigger presave_domains_guard before update on public.presave_domains for each row execute function public.presave_domains_guard();

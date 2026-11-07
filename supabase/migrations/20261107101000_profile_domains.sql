-- Custom domains for profiles: martin.com → that user's public profile (/u/<username>).
-- Owner sets the domain, proves ownership with a DNS TXT record, the `domains` edge function
-- verifies it (and adds it to the Vercel project when VERCEL_TOKEN/VERCEL_PROJECT_ID are set).
create table if not exists public.profile_domains (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  domain text not null unique check (char_length(domain) <= 253 and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),
  token text not null default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'pending' check (status in ('pending', 'verified', 'live')),
  note text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_domains enable row level security;
revoke all on public.profile_domains from anon, authenticated;
grant select on public.profile_domains to authenticated;
create policy "own domain read" on public.profile_domains for select to authenticated using (user_id = (select auth.uid()));

-- set / change my domain (resets verification)
create or replace function public.set_profile_domain(p_domain text)
returns public.profile_domains language plpgsql security definer set search_path = '' as $$
declare
  d text := lower(trim(coalesce(p_domain, '')));
  r public.profile_domains;
begin
  if auth.uid() is null or public.is_banned() then raise exception 'Sign in first'; end if;
  d := regexp_replace(d, '^https?://', '');
  d := regexp_replace(d, '[/?#].*$', '');
  d := regexp_replace(d, '^www\.', '');
  d := regexp_replace(d, '\.$', '');
  if d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' or char_length(d) > 253 then
    raise exception 'Enter a domain like yourname.com';
  end if;
  if d ~ '(^|\.)(nexusproject\.cc|vercel\.app|vercel\.com|supabase\.co|supabase\.in|localhost)$' then
    raise exception 'That domain can''t be used';
  end if;
  if exists (select 1 from public.profile_domains where domain = d and user_id <> auth.uid()) then
    raise exception 'That domain is already linked to another profile';
  end if;
  insert into public.profile_domains (user_id, domain) values (auth.uid(), d)
  on conflict (user_id) do update set domain = excluded.domain,
    token = case when public.profile_domains.domain = excluded.domain then public.profile_domains.token else replace(gen_random_uuid()::text, '-', '') end,
    status = case when public.profile_domains.domain = excluded.domain then public.profile_domains.status else 'pending' end,
    note = case when public.profile_domains.domain = excluded.domain then public.profile_domains.note else null end,
    verified_at = case when public.profile_domains.domain = excluded.domain then public.profile_domains.verified_at else null end,
    updated_at = now()
  returning * into r;
  return r;
end $$;
revoke execute on function public.set_profile_domain(text) from public, anon;
grant execute on function public.set_profile_domain(text) to authenticated, service_role;

-- the verified domain shown on someone's profile
create or replace function public.profile_domain_of(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select domain from public.profile_domains where user_id = p_user and status in ('verified', 'live');
$$;
revoke execute on function public.profile_domain_of(uuid) from public;
grant execute on function public.profile_domain_of(uuid) to anon, authenticated, service_role;

-- used by the site's proxy: which profile does this domain open?
create or replace function public.profile_by_domain(p_domain text)
returns text language sql stable security definer set search_path = '' as $$
  select p.username from public.profile_domains d join public.profiles p on p.id = d.user_id
  where d.domain = lower(regexp_replace(coalesce(p_domain, ''), '^www\.', '')) and d.status in ('verified', 'live')
    and (p.banned_until is null or p.banned_until < now());
$$;
revoke execute on function public.profile_by_domain(text) from public;
grant execute on function public.profile_by_domain(text) to anon, authenticated, service_role;

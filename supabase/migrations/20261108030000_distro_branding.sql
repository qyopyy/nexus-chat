-- Distro workspace white-label: every account can brand its own workspace (name, logo, accent);
-- admins set the platform-wide default brand. Logos live in a public `brand-assets` bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
do $$ begin
  create policy "brand assets public read" on storage.objects for select to anon, authenticated using (bucket_id = 'brand-assets');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "brand assets own upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "brand assets own update" on storage.objects for update to authenticated
    using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "brand assets own delete" on storage.objects for delete to authenticated
    using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

create table if not exists public.dist_brands (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  name text check (char_length(name) <= 48),
  logo_url text check (char_length(logo_url) <= 500),
  accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  tagline text check (char_length(tagline) <= 120),
  support_email text check (char_length(support_email) <= 120),
  hide_nexus boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.dist_brands enable row level security;
revoke all on public.dist_brands from anon, authenticated;
grant select on public.dist_brands to anon, authenticated;
create policy "brands readable" on public.dist_brands for select to anon, authenticated using (true);

create table if not exists public.dist_brand_global (
  id int primary key default 1 check (id = 1),
  name text check (char_length(name) <= 48),
  logo_url text check (char_length(logo_url) <= 500),
  accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  tagline text check (char_length(tagline) <= 120),
  support_email text check (char_length(support_email) <= 120),
  updated_at timestamptz not null default now()
);
alter table public.dist_brand_global enable row level security;
revoke all on public.dist_brand_global from anon, authenticated;
grant select on public.dist_brand_global to anon, authenticated;
create policy "global brand readable" on public.dist_brand_global for select to anon, authenticated using (true);
insert into public.dist_brand_global (id) values (1) on conflict do nothing;

create or replace function public.dist_brand_clean_url(u text)
returns text language sql immutable set search_path = '' as $$
  select case when nullif(btrim(coalesce(u, '')), '') is null then null
              when btrim(u) ~* '^https://' then left(btrim(u), 500) end;
$$;

create or replace function public.set_dist_brand(p jsonb)
returns public.dist_brands language plpgsql security definer set search_path = '' as $$
declare r public.dist_brands; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p ? 'logo_url' and nullif(btrim(coalesce(p->>'logo_url', '')), '') is not null and public.dist_brand_clean_url(p->>'logo_url') is null then raise exception 'Logo must be an https:// image'; end if;
  if p ? 'accent' and nullif(p->>'accent', '') is not null and (p->>'accent') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Accent must look like #1DB954'; end if;
  insert into public.dist_brands (owner_id) values (me) on conflict do nothing;
  update public.dist_brands set
    name = case when p ? 'name' then nullif(left(btrim(p->>'name'), 48), '') else name end,
    logo_url = case when p ? 'logo_url' then public.dist_brand_clean_url(p->>'logo_url') else logo_url end,
    accent = case when p ? 'accent' then nullif(p->>'accent', '') else accent end,
    tagline = case when p ? 'tagline' then nullif(left(btrim(p->>'tagline'), 120), '') else tagline end,
    support_email = case when p ? 'support_email' then nullif(left(btrim(p->>'support_email'), 120), '') else support_email end,
    hide_nexus = case when p ? 'hide_nexus' then coalesce((p->>'hide_nexus')::boolean, false) else hide_nexus end,
    updated_at = now()
  where owner_id = me returning * into r;
  return r;
end $$;
revoke execute on function public.set_dist_brand(jsonb) from public, anon;
grant execute on function public.set_dist_brand(jsonb) to authenticated;

create or replace function public.admin_set_dist_brand_global(p jsonb)
returns public.dist_brand_global language plpgsql security definer set search_path = '' as $$
declare r public.dist_brand_global;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p ? 'logo_url' and nullif(btrim(coalesce(p->>'logo_url', '')), '') is not null and public.dist_brand_clean_url(p->>'logo_url') is null then raise exception 'Logo must be an https:// image'; end if;
  if p ? 'accent' and nullif(p->>'accent', '') is not null and (p->>'accent') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Accent must look like #1DB954'; end if;
  update public.dist_brand_global set
    name = case when p ? 'name' then nullif(left(btrim(p->>'name'), 48), '') else name end,
    logo_url = case when p ? 'logo_url' then public.dist_brand_clean_url(p->>'logo_url') else logo_url end,
    accent = case when p ? 'accent' then nullif(p->>'accent', '') else accent end,
    tagline = case when p ? 'tagline' then nullif(left(btrim(p->>'tagline'), 120), '') else tagline end,
    support_email = case when p ? 'support_email' then nullif(left(btrim(p->>'support_email'), 120), '') else support_email end,
    updated_at = now()
  where id = 1 returning * into r;
  perform public.log_admin(null, 'distro_brand_global', p);
  return r;
end $$;
revoke execute on function public.admin_set_dist_brand_global(jsonb) from public, anon;
grant execute on function public.admin_set_dist_brand_global(jsonb) to authenticated;

-- Distro workspace themes: 'classic' (near-black) or '999' (red/black, dark-red buttons, 999 watermark).
-- Per-workspace override in dist_brands.theme (null = follow platform); platform default in dist_brand_global.theme.
alter table public.dist_brands add column if not exists theme text check (theme in ('classic', '999'));
alter table public.dist_brand_global add column if not exists theme text not null default 'classic' check (theme in ('classic', '999'));
update public.dist_brand_global set theme = '999' where id = 1;

create or replace function public.set_dist_brand(p jsonb)
returns public.dist_brands language plpgsql security definer set search_path = '' as $$
declare r public.dist_brands; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p ? 'logo_url' and nullif(btrim(coalesce(p->>'logo_url', '')), '') is not null and public.dist_brand_clean_url(p->>'logo_url') is null then raise exception 'Logo must be an https:// image'; end if;
  if p ? 'accent' and nullif(p->>'accent', '') is not null and (p->>'accent') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Accent must look like #1DB954'; end if;
  if p ? 'theme' and nullif(p->>'theme', '') is not null and (p->>'theme') not in ('classic', '999') then raise exception 'Unknown theme'; end if;
  insert into public.dist_brands (owner_id) values (me) on conflict do nothing;
  update public.dist_brands set
    name = case when p ? 'name' then nullif(left(btrim(p->>'name'), 48), '') else name end,
    logo_url = case when p ? 'logo_url' then public.dist_brand_clean_url(p->>'logo_url') else logo_url end,
    accent = case when p ? 'accent' then nullif(p->>'accent', '') else accent end,
    tagline = case when p ? 'tagline' then nullif(left(btrim(p->>'tagline'), 120), '') else tagline end,
    support_email = case when p ? 'support_email' then nullif(left(btrim(p->>'support_email'), 120), '') else support_email end,
    hide_nexus = case when p ? 'hide_nexus' then coalesce((p->>'hide_nexus')::boolean, false) else hide_nexus end,
    theme = case when p ? 'theme' then nullif(p->>'theme', '') else theme end,
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
  if p ? 'theme' and nullif(p->>'theme', '') is not null and (p->>'theme') not in ('classic', '999') then raise exception 'Unknown theme'; end if;
  update public.dist_brand_global set
    name = case when p ? 'name' then nullif(left(btrim(p->>'name'), 48), '') else name end,
    logo_url = case when p ? 'logo_url' then public.dist_brand_clean_url(p->>'logo_url') else logo_url end,
    accent = case when p ? 'accent' then nullif(p->>'accent', '') else accent end,
    tagline = case when p ? 'tagline' then nullif(left(btrim(p->>'tagline'), 120), '') else tagline end,
    support_email = case when p ? 'support_email' then nullif(left(btrim(p->>'support_email'), 120), '') else support_email end,
    theme = case when p ? 'theme' then coalesce(nullif(p->>'theme', ''), 'classic') else theme end,
    updated_at = now()
  where id = 1 returning * into r;
  perform public.log_admin(null, 'distro_brand_global', p);
  return r;
end $$;
revoke execute on function public.admin_set_dist_brand_global(jsonb) from public, anon;
grant execute on function public.admin_set_dist_brand_global(jsonb) to authenticated;

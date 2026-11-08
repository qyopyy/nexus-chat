-- More distro themes + Too Lost API keys (stored server-side in dist_settings; never readable from the browser).
revoke all on public.dist_settings from anon, authenticated;
alter table public.dist_brands drop constraint if exists dist_brands_theme_check;
alter table public.dist_brands add constraint dist_brands_theme_check check (theme in ('classic', '999', 'purple999', 'midnight', 'emerald', 'sunset'));
alter table public.dist_brand_global drop constraint if exists dist_brand_global_theme_check;
alter table public.dist_brand_global add constraint dist_brand_global_theme_check check (theme in ('classic', '999', 'purple999', 'midnight', 'emerald', 'sunset'));

create or replace function public.set_dist_brand(p jsonb)
returns public.dist_brands language plpgsql security definer set search_path = '' as $$
declare r public.dist_brands; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p ? 'logo_url' and nullif(btrim(coalesce(p->>'logo_url', '')), '') is not null and public.dist_brand_clean_url(p->>'logo_url') is null then raise exception 'Logo must be an https:// image'; end if;
  if p ? 'accent' and nullif(p->>'accent', '') is not null and (p->>'accent') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Accent must look like #1DB954'; end if;
  if p ? 'theme' and nullif(p->>'theme', '') is not null and (p->>'theme') not in ('classic', '999', 'purple999', 'midnight', 'emerald', 'sunset') then raise exception 'Unknown theme'; end if;
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
  if p ? 'theme' and nullif(p->>'theme', '') is not null and (p->>'theme') not in ('classic', '999', 'purple999', 'midnight', 'emerald', 'sunset') then raise exception 'Unknown theme'; end if;
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

-- Too Lost: admins paste keys in Distro → Settings → Too Lost. Keys go to dist_settings (no client access) and are only ever shown masked.
create or replace function public.admin_set_toolost(p_env text, p_key text, p_make_active boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k text := btrim(coalesce(p_key, ''));
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_env not in ('sandbox', 'production') then raise exception 'Pick sandbox or production'; end if;
  if k = '' then
    delete from public.dist_settings where key = 'toolost_key_' || p_env;
  else
    if char_length(k) < 16 or char_length(k) > 400 or k ~ '\s' then raise exception 'That does not look like an API key'; end if;
    insert into public.dist_settings (key, value, updated_at) values ('toolost_key_' || p_env, k, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    if p_make_active then
      insert into public.dist_settings (key, value, updated_at) values ('toolost_env', p_env, now())
        on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
  end if;
  perform public.log_admin(null, 'toolost_key', jsonb_build_object('env', p_env, 'cleared', k = ''));
  return public.admin_toolost_status();
end $$;

create or replace function public.admin_set_toolost_env(p_env text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_env not in ('sandbox', 'production') then raise exception 'Pick sandbox or production'; end if;
  insert into public.dist_settings (key, value, updated_at) values ('toolost_env', p_env, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return public.admin_toolost_status();
end $$;

create or replace function public.admin_toolost_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s jsonb := '{}'; r record;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  for r in select key, value, updated_at from public.dist_settings where key in ('toolost_key_sandbox', 'toolost_key_production') loop
    s := s || jsonb_build_object(replace(r.key, 'toolost_key_', ''), jsonb_build_object('masked', left(r.value, 4) || '••••' || right(r.value, 4), 'updated_at', r.updated_at));
  end loop;
  return jsonb_build_object('keys', s, 'env', coalesce((select value from public.dist_settings where key = 'toolost_env'), 'sandbox'));
end $$;

revoke execute on function public.admin_set_toolost(text, text, boolean) from public, anon;
revoke execute on function public.admin_set_toolost_env(text) from public, anon;
revoke execute on function public.admin_toolost_status() from public, anon;
grant execute on function public.admin_set_toolost(text, text, boolean) to authenticated;
grant execute on function public.admin_set_toolost_env(text) to authenticated;
grant execute on function public.admin_toolost_status() to authenticated;

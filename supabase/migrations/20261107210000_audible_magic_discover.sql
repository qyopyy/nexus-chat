-- Audible Magic 360 (second fingerprint engine next to ACRCloud) + server Discover directory

-- which engines ran on each check and what each found, e.g. {"acrcloud":"match","audible_magic":"clean"}
alter table public.audio_checks add column if not exists engines jsonb not null default '{}'::jsonb;

-- ───────────── Discover: public server directory (opt-in per server) ─────────────
alter table public.spaces add column if not exists discoverable boolean not null default false;
alter table public.spaces add column if not exists discover_tags text[] not null default '{}' check (cardinality(discover_tags) <= 5);
create index if not exists spaces_discoverable_idx on public.spaces (verified desc, created_at desc) where discoverable;

create or replace function public.space_set_discoverable(p_space uuid, p_on boolean, p_tags text[] default null)
returns void language plpgsql security definer set search_path = '' as $$
declare clean text[];
begin
  if not public.is_space_staff(p_space) then raise exception 'Only server owners and admins can list the server'; end if;
  if p_tags is not null then
    select coalesce(array_agg(distinct t), '{}') into clean from (
      select left(lower(regexp_replace(btrim(x), '[^a-zA-Z0-9 &-]', '', 'g')), 20) t from unnest(p_tags) x
    ) s where char_length(t) >= 2;
    clean := clean[1:5];
  end if;
  update public.spaces set discoverable = coalesce(p_on, discoverable), discover_tags = coalesce(clean, discover_tags) where id = p_space;
end $$;
revoke execute on function public.space_set_discoverable(uuid, boolean, text[]) from public, anon;
grant execute on function public.space_set_discoverable(uuid, boolean, text[]) to authenticated;

create or replace function public.discover_servers(p_query text default null, p_tag text default null, p_limit int default 40)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x), '[]'::json) from (
    select s.id, s.name, s.description, s.icon_url, s.icon_color, coalesce(s.banner_url, s.background_url) as banner_url,
           s.verified, s.discover_tags as tags, coalesce(s.vanity_code, s.invite_code) as code,
           (select count(*) from public.space_members m where m.space_id = s.id)::int as members,
           exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = (select auth.uid())) as joined
    from public.spaces s
    where s.discoverable
      and (p_query is null or btrim(p_query) = '' or s.name ilike '%' || btrim(p_query) || '%' or coalesce(s.description, '') ilike '%' || btrim(p_query) || '%')
      and (p_tag is null or p_tag = '' or lower(p_tag) = any (s.discover_tags))
    order by s.verified desc, (select count(*) from public.space_members m where m.space_id = s.id) desc, s.created_at desc
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) x;
$$;
revoke execute on function public.discover_servers(text, text, int) from public, anon;
grant execute on function public.discover_servers(text, text, int) to authenticated;

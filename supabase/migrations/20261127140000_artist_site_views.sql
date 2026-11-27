-- Page-view counter for public artist websites (/bio/<handle>, /bio/artist/<id>).
create table if not exists public.artist_site_views (
  slug text primary key,
  views bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.artist_site_views enable row level security; -- no policies: only the function below can touch it

create or replace function public.artist_site_hit(p_slug text, p_count boolean default true)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  s text := lower(left(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9_.-]', '', 'g'), 40));
  n bigint;
begin
  if s = '' then return 0; end if;
  if p_count then
    insert into public.artist_site_views as v (slug, views) values (s, 1)
    on conflict (slug) do update set views = v.views + 1, updated_at = now()
    returning v.views into n;
  else
    select v.views into n from public.artist_site_views v where v.slug = s;
  end if;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.artist_site_hit(text, boolean) from public;
grant execute on function public.artist_site_hit(text, boolean) to anon, authenticated;

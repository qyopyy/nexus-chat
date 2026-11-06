-- Dated page hits + richer linkbio_stats (period views, daily click series)
create table if not exists public.linkbio_hits (
  id bigserial primary key,
  page_id uuid not null references public.linkbio_pages(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists linkbio_hits_page_created_idx on public.linkbio_hits (page_id, created_at desc);

alter table public.linkbio_hits enable row level security;
drop policy if exists linkbio_hits_select on public.linkbio_hits;
create policy linkbio_hits_select on public.linkbio_hits
  for select to authenticated
  using (exists (
    select 1 from public.linkbio_pages p
    where p.id = page_id and p.owner_id = auth.uid()
  ));

create or replace function public.linkbio_hit(p_username text)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  pid uuid;
begin
  update public.linkbio_pages
  set view_count = view_count + 1
  where username = lower(trim(p_username))
    and published = true
    and coalesce(suspended, false) = false
  returning id into pid;
  if pid is not null then
    insert into public.linkbio_hits (page_id) values (pid);
  end if;
end;
$fn$;

create or replace function public.linkbio_stats(p_days int default 7)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  pid uuid;
  days int := greatest(1, least(coalesce(p_days, 7), 90));
  since timestamptz := now() - make_interval(days => days);
  views_all bigint := 0;
  views_period bigint := 0;
  clicks bigint := 0;
  top json;
  series json;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select id, view_count into pid, views_all from public.linkbio_pages where owner_id = me;
  if pid is null then
    return json_build_object(
      'views', 0,
      'views_all', 0,
      'views_period', 0,
      'clicks', 0,
      'days', days,
      'top', '[]'::json,
      'series', '[]'::json
    );
  end if;

  select count(*) into views_period
  from public.linkbio_hits
  where page_id = pid and created_at >= since;

  select count(*) into clicks
  from public.linkbio_clicks
  where page_id = pid and created_at >= since;

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into top
  from (
    select link_url as url, count(*)::int as hits
    from public.linkbio_clicks
    where page_id = pid and created_at >= since
    group by link_url
    order by hits desc
    limit 12
  ) t;

  select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) into series
  from (
    select
      to_char(gs.day, 'YYYY-MM-DD') as day,
      coalesce(h.views, 0)::int as views,
      coalesce(c.clicks, 0)::int as clicks
    from generate_series(
      (since at time zone 'utc')::date,
      (now() at time zone 'utc')::date,
      '1 day'::interval
    ) as gs(day)
    left join (
      select (created_at at time zone 'utc')::date as day, count(*)::int as views
      from public.linkbio_hits
      where page_id = pid and created_at >= since
      group by 1
    ) h on h.day = gs.day::date
    left join (
      select (created_at at time zone 'utc')::date as day, count(*)::int as clicks
      from public.linkbio_clicks
      where page_id = pid and created_at >= since
      group by 1
    ) c on c.day = gs.day::date
  ) d;

  return json_build_object(
    'views', views_all,
    'views_all', views_all,
    'views_period', views_period,
    'clicks', clicks,
    'days', days,
    'top', top,
    'series', series
  );
end;
$fn$;

grant execute on function public.linkbio_hit(text) to anon, authenticated;
grant execute on function public.linkbio_stats(int) to authenticated;

-- Owner analytics for Nexus Link clicks + views
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
  views bigint := 0;
  clicks bigint := 0;
  top json;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select id, view_count into pid, views from public.linkbio_pages where owner_id = me;
  if pid is null then
    return json_build_object('views', 0, 'clicks', 0, 'days', days, 'top', '[]'::json);
  end if;

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

  return json_build_object(
    'views', views,
    'clicks', clicks,
    'days', days,
    'top', top
  );
end;
$fn$;

grant execute on function public.linkbio_stats(int) to authenticated;

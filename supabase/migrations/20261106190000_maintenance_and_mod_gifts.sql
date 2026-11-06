-- Maintenance mode row + allow moderators (rank >= 2) to mint premium gift links.

insert into public.site_notices (id, body, active)
values (
  'maintenance',
  E'We''ll be back soon — Nexus is updating.\nHang tight while we ship improvements.',
  false
)
on conflict (id) do nothing;

-- Moderators (rank 2+) can create / list gift links (admins were rank 3+).
create or replace function public.create_premium_gift(
  p_tier text,
  p_days int,
  p_max_claims int default 1,
  p_expires_days int default 30,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  code text;
  gid uuid;
  exp timestamptz;
begin
  if public.my_rank() < 2 then raise exception 'Staff only (mods & admins)'; end if;
  if p_tier not in ('lighting','premium','dist','dist_pro','dist_video') then raise exception 'Bad tier'; end if;
  if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'Days must be 1–3650'; end if;
  if p_max_claims is null or p_max_claims < 1 or p_max_claims > 1000 then raise exception 'Max claims 1–1000'; end if;
  code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  exp := case when p_expires_days is null or p_expires_days <= 0 then null
              else now() + make_interval(days => p_expires_days) end;
  insert into public.premium_gifts (code, tier, days, max_claims, expires_at, created_by, note)
  values (code, p_tier, p_days, p_max_claims, exp, auth.uid(), nullif(trim(p_note), ''))
  returning id into gid;
  perform public.log_admin(auth.uid(), 'premium_gift_create', jsonb_build_object('code', code, 'tier', p_tier, 'days', p_days, 'max', p_max_claims));
  return jsonb_build_object('id', gid, 'code', code, 'path', '/gift/' || code);
end;
$$;

create or replace function public.list_premium_gifts()
returns setof public.premium_gifts language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 2 then raise exception 'Staff only (mods & admins)'; end if;
  return query select * from public.premium_gifts order by created_at desc limit 100;
end;
$$;

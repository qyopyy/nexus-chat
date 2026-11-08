-- Distribution: manual hand-off (admin releases it in their own distributor portal, e.g. Too Lost),
-- then records UPC / ISRCs / store links here. Approve / reject / changes all DM the artist via Nexus Bot.

alter table public.dist_releases add column if not exists store_links jsonb not null default '{}'::jsonb;
alter table public.dist_releases add column if not exists distributor text check (distributor is null or char_length(distributor) <= 40);
alter table public.dist_releases add column if not exists distributor_ref text check (distributor_ref is null or char_length(distributor_ref) <= 120);

create or replace function public.dist_notify_owner(p_owner uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare conv uuid;
begin
  conv := public.nexus_bot_dm(p_owner);
  perform set_config('nexus.admin_write', 'on', true);
  insert into public.messages (conversation_id, author_id, content, bot_name) values (conv, '00000000-0000-4000-8000-00000000b001', left(p_text, 3500), 'Nexus Bot');
  perform set_config('nexus.admin_write', 'off', true);
exception when others then
  perform set_config('nexus.admin_write', 'off', true);
end $$;
revoke execute on function public.dist_notify_owner(uuid, text) from public, anon, authenticated;

-- approve: record where/how it was delivered + identifiers + store links, and move the status on
create or replace function public.admin_mark_release_delivered(
  p_release uuid, p_status text default 'approved', p_distributor text default 'Too Lost', p_ref text default null,
  p_upc text default null, p_isrcs jsonb default '{}'::jsonb, p_links jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.dist_releases; k text; v text; clean jsonb := '{}'::jsonb; lines text := '';
begin
  if not public.can_review() then raise exception 'Only admins and moderators can approve releases'; end if;
  if p_status not in ('pending', 'approved', 'live') then raise exception 'Status must be pending, approved or live'; end if;
  select * into r from public.dist_releases where id = p_release;
  if r.id is null then raise exception 'Release not found'; end if;
  if nullif(btrim(coalesce(p_upc, '')), '') is not null and btrim(p_upc) !~ '^\d{12,14}$' then raise exception 'UPC must be 12–14 digits'; end if;
  for k, v in select * from jsonb_each_text(coalesce(p_links, '{}'::jsonb)) loop
    if k !~ '^[a-z_]{2,20}$' then continue; end if;
    v := btrim(v);
    if v = '' then continue; end if;
    if v !~* '^https://' or char_length(v) > 500 then raise exception 'Store links must be https:// URLs'; end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;
  -- ISRCs per track id
  for k, v in select * from jsonb_each_text(coalesce(p_isrcs, '{}'::jsonb)) loop
    v := upper(replace(btrim(v), '-', ''));
    if v = '' then continue; end if;
    if v !~ '^[A-Z]{2}[A-Z0-9]{3}\d{7}$' then raise exception 'Bad ISRC: %', v; end if;
    update public.dist_tracks set isrc = v where id = k::uuid and release_id = p_release;
  end loop;
  perform set_config('nexus.admin_write', 'on', true);
  update public.dist_releases set
    status = p_status,
    upc = coalesce(nullif(btrim(coalesce(p_upc, '')), ''), upc),
    store_links = store_links || clean,
    distributor = nullif(left(btrim(coalesce(p_distributor, '')), 40), ''),
    distributor_ref = coalesce(nullif(left(btrim(coalesce(p_ref, '')), 120), ''), distributor_ref),
    sent_at = coalesce(sent_at, now()),
    staff_note = null, rejection_reason = null, last_error = null,
    reviewed_by = auth.uid(), updated_at = now()
  where id = p_release returning * into r;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(r.owner_id, 'release_delivered', jsonb_build_object('release', r.title, 'status', p_status, 'distributor', p_distributor));
  select coalesce(string_agg(format('%s: %s', initcap(replace(key, '_', ' ')), value), E'\n'), '') into lines from jsonb_each_text(r.store_links);
  perform public.dist_notify_owner(r.owner_id, format(
    E'%s **%s** — %s\n%s%s%s',
    case when p_status = 'live' then '🎉' else '✅' end,
    r.title,
    case when p_status = 'live' then 'is live in stores!' when p_status = 'approved' then 'was approved and is being delivered to stores.' else 'was approved and sent to the distributor for final review.' end,
    case when r.upc is not null then format(E'UPC %s\n', r.upc) else '' end,
    case when lines <> '' then lines || E'\n' else '' end,
    'Track the status in Studio → Releases.'));
end $$;
revoke execute on function public.admin_mark_release_delivered(uuid, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.admin_mark_release_delivered(uuid, text, text, text, text, jsonb, jsonb) to authenticated;

-- reject / request changes with a reason the artist sees (and gets as a DM)
create or replace function public.admin_decide_release(p_release uuid, p_decision text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.dist_releases; n text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.can_review() then raise exception 'Only admins and moderators can review releases'; end if;
  if p_decision not in ('reject', 'changes') then raise exception 'Decision must be reject or changes'; end if;
  if n is null then raise exception 'Add a reason for the artist'; end if;
  select * into r from public.dist_releases where id = p_release;
  if r.id is null then raise exception 'Release not found'; end if;
  perform public.set_release_status(p_release, case when p_decision = 'reject' then 'rejected' else 'changes_requested' end, n);
  perform public.dist_notify_owner(r.owner_id, format(
    E'%s **%s** %s\n%s\n%s',
    case when p_decision = 'reject' then '❌' else '✏️' end,
    r.title,
    case when p_decision = 'reject' then 'was not approved.' else 'needs a few changes before it can go out.' end,
    '> ' || replace(left(n, 1500), E'\n', E'\n> '),
    'Open Studio → Releases to fix it and resubmit.'));
end $$;
revoke execute on function public.admin_decide_release(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_release(uuid, text, text) to authenticated;

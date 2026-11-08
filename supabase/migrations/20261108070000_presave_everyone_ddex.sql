-- 1) Pre-save / smart links for everyone (no plan needed), auto-created when a release is submitted.
drop policy if exists "smart links need distribution" on public.smart_links;

create or replace function public.dist_auto_smart_link(p_release uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.dist_releases; base text; s text; i int := 2;
begin
  select * into r from public.dist_releases where id = p_release;
  if r.id is null or exists (select 1 from public.smart_links where release_id = r.id) then return; end if;
  base := left(btrim(regexp_replace(lower(coalesce(r.primary_artist_name, '') || '-' || coalesce(r.title, '')), '[^a-z0-9]+', '-', 'g'), '-'), 50);
  if char_length(base) < 3 then base := base || '-music'; end if;
  base := btrim(base, '-');
  if base !~ '^[a-z0-9]' then base := 'r' || base; end if;
  s := base;
  while exists (select 1 from public.smart_links where slug = s) and i < 200 loop
    s := left(base, 50) || '-' || i; i := i + 1;
  end loop;
  insert into public.smart_links (release_id, owner_id, slug) values (r.id, r.owner_id, s) on conflict do nothing;
exception when others then null; -- never block a status change over a link
end $$;
revoke execute on function public.dist_auto_smart_link(uuid) from public, anon, authenticated;

create or replace function public.dist_release_auto_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('in_review', 'pending', 'approved', 'sending', 'live') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.dist_auto_smart_link(new.id);
  end if;
  return new;
end $$;
drop trigger if exists release_auto_smart_link on public.dist_releases;
create trigger release_auto_smart_link after insert or update of status on public.dist_releases
  for each row execute function public.dist_release_auto_link();

-- backfill: every submitted/live release gets its pre-save page
do $$ declare x uuid; begin
  for x in select id from public.dist_releases where status in ('in_review', 'pending', 'approved', 'sending', 'live') loop
    perform public.dist_auto_smart_link(x);
  end loop;
end $$;

-- 2) DDEX (ERN 4.3) delivery settings: your DDEX Party ID (DPID) + recipient DSPs/distributors, and a delivery log.
create table if not exists public.dist_ddex_config (
  id int primary key default 1 check (id = 1),
  sender_dpid text check (sender_dpid ~ '^PADPIDA[0-9A-Z]{10,11}$'),
  sender_name text check (char_length(sender_name) <= 120),
  label_name text check (char_length(label_name) <= 120),
  recipients jsonb not null default '[]' check (jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) <= 30),
  test_mode boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.dist_ddex_config enable row level security;
revoke all on public.dist_ddex_config from anon, authenticated;
insert into public.dist_ddex_config (id) values (1) on conflict do nothing;

create table if not exists public.dist_ddex_log (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.dist_releases(id) on delete cascade,
  recipient_dpid text not null,
  recipient_name text,
  message_id text not null,
  update_indicator text not null default 'OriginalMessage',
  test boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists dist_ddex_log_release on public.dist_ddex_log (release_id, created_at desc);
alter table public.dist_ddex_log enable row level security;
revoke all on public.dist_ddex_log from anon, authenticated;

create or replace function public.admin_get_ddex()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_review() then raise exception 'Only admins and moderators'; end if;
  return (select to_jsonb(c) - 'id' from public.dist_ddex_config c where id = 1);
end $$;

create or replace function public.admin_set_ddex(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rec jsonb; clean jsonb := '[]';
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p ? 'sender_dpid' and nullif(p->>'sender_dpid', '') is not null and upper(p->>'sender_dpid') !~ '^PADPIDA[0-9A-Z]{10,11}$' then raise exception 'A DDEX Party ID looks like PADPIDA2014120301A'; end if;
  if p ? 'recipients' then
    for rec in select * from jsonb_array_elements(coalesce(p->'recipients', '[]')) loop
      if upper(coalesce(rec->>'dpid', '')) !~ '^PADPIDA[0-9A-Z]{10,11}$' then raise exception 'Recipient Party ID % is not a valid DPID', coalesce(rec->>'dpid', '(empty)'); end if;
      clean := clean || jsonb_build_object('dpid', upper(rec->>'dpid'), 'name', left(coalesce(nullif(btrim(rec->>'name'), ''), upper(rec->>'dpid')), 120));
    end loop;
  end if;
  update public.dist_ddex_config set
    sender_dpid = case when p ? 'sender_dpid' then nullif(upper(btrim(p->>'sender_dpid')), '') else sender_dpid end,
    sender_name = case when p ? 'sender_name' then nullif(left(btrim(p->>'sender_name'), 120), '') else sender_name end,
    label_name = case when p ? 'label_name' then nullif(left(btrim(p->>'label_name'), 120), '') else label_name end,
    recipients = case when p ? 'recipients' then clean else recipients end,
    test_mode = case when p ? 'test_mode' then coalesce((p->>'test_mode')::boolean, true) else test_mode end,
    updated_at = now()
  where id = 1;
  perform public.log_admin(null, 'ddex_config', p);
  return public.admin_get_ddex();
end $$;

create or replace function public.ddex_log_delivery(p_release uuid, p_dpid text, p_name text, p_message_id text, p_update text, p_test boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_review() then raise exception 'Only admins and moderators'; end if;
  insert into public.dist_ddex_log (release_id, recipient_dpid, recipient_name, message_id, update_indicator, test, created_by)
  values (p_release, upper(left(p_dpid, 40)), left(p_name, 120), left(p_message_id, 80), case when p_update = 'UpdateMessage' then 'UpdateMessage' else 'OriginalMessage' end, coalesce(p_test, true), auth.uid());
end $$;

create or replace function public.ddex_release_log(p_release uuid)
returns setof public.dist_ddex_log language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_review() then raise exception 'Only admins and moderators'; end if;
  return query select * from public.dist_ddex_log where release_id = p_release order by created_at desc limit 50;
end $$;

revoke execute on function public.admin_get_ddex() from public, anon;
revoke execute on function public.admin_set_ddex(jsonb) from public, anon;
revoke execute on function public.ddex_log_delivery(uuid, text, text, text, text, boolean) from public, anon;
revoke execute on function public.ddex_release_log(uuid) from public, anon;
grant execute on function public.admin_get_ddex() to authenticated;
grant execute on function public.admin_set_ddex(jsonb) to authenticated;
grant execute on function public.ddex_log_delivery(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.ddex_release_log(uuid) to authenticated;

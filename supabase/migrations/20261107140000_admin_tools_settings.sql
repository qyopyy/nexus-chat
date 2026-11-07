-- Admin tools & settings: reports queue · site settings (signups, read-only, new-account wait, blocked words)
-- · message search · premium grants · sign-out-everywhere for members · activity chart
-- · notification preferences (types, previews, quiet hours) · delete my account

-- ───────────── notification preferences (read by the push function) ─────────────
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  dms boolean not null default true,
  groups boolean not null default true,
  mentions boolean not null default true,
  calls boolean not null default true,
  previews boolean not null default true,
  quiet_enabled boolean not null default false,
  quiet_start smallint not null default 1320 check (quiet_start between 0 and 1439), -- minutes after midnight
  quiet_end smallint not null default 480 check (quiet_end between 0 and 1439),
  quiet_allow_calls boolean not null default true,
  tz text not null default 'UTC' check (char_length(tz) between 1 and 64),
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
grant select, insert, update on public.notification_prefs to authenticated;
create policy "own notif read" on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy "own notif insert" on public.notification_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own notif update" on public.notification_prefs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────── reports ─────────────
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_user uuid references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  excerpt text,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'nsfw', 'scam', 'impersonation', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now()
);
create index if not exists reports_open_idx on public.reports (created_at desc) where status = 'open';
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index if not exists reports_target_idx on public.reports (target_user);
create index if not exists reports_message_idx on public.reports (message_id);
create index if not exists reports_conv_idx on public.reports (conversation_id);
create index if not exists reports_resolver_idx on public.reports (resolved_by);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
create policy "staff or own reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.my_rank() >= 2);

create or replace function public.file_report(p_reason text, p_details text, p_message uuid default null, p_user uuid default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare m public.messages; target uuid := p_user; conv uuid; ex text; rid bigint;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_message is null and p_user is null then raise exception 'Nothing to report'; end if;
  if (select count(*) from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'You''ve sent a lot of reports — try again in a bit';
  end if;
  if p_message is not null then
    select * into m from public.messages where id = p_message;
    if not found then raise exception 'Message not found'; end if;
    if not public.is_conversation_member(m.conversation_id) then raise exception 'You can only report messages you can see'; end if;
    target := m.author_id; conv := m.conversation_id; ex := left(coalesce(m.content, m.attachment_name, ''), 500);
    if exists (select 1 from public.reports where reporter_id = auth.uid() and message_id = p_message and status = 'open') then
      raise exception 'You already reported this message';
    end if;
  end if;
  if target = auth.uid() then raise exception 'You can''t report yourself'; end if;
  insert into public.reports (reporter_id, target_user, message_id, conversation_id, excerpt, reason, details)
  values (auth.uid(), target, p_message, conv, ex, p_reason, nullif(left(btrim(coalesce(p_details, '')), 1000), ''))
  returning id into rid;
  return rid;
end $$;
revoke execute on function public.file_report(text, text, uuid, uuid) from public, anon;
grant execute on function public.file_report(text, text, uuid, uuid) to authenticated;

create or replace function public.admin_resolve_report(p_id bigint, p_status text, p_resolution text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  if p_status not in ('open', 'resolved', 'dismissed') then raise exception 'Bad status'; end if;
  update public.reports set status = p_status,
    resolved_by = case when p_status = 'open' then null else auth.uid() end,
    resolved_at = case when p_status = 'open' then null else now() end,
    resolution = nullif(left(btrim(coalesce(p_resolution, '')), 300), '')
  where id = p_id returning * into r;
  if not found then raise exception 'Report not found'; end if;
  perform public.log_admin(r.target_user, 'report_' || p_status, jsonb_build_object('report', p_id, 'reason', r.reason, 'note', p_resolution));
end $$;
revoke execute on function public.admin_resolve_report(bigint, text, text) from public, anon;
grant execute on function public.admin_resolve_report(bigint, text, text) to authenticated;

-- ───────────── site settings ─────────────
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  signups_open boolean not null default true,
  read_only boolean not null default false,
  new_account_minutes int not null default 0 check (new_account_minutes between 0 and 10080),
  blocked_words text[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict do nothing;
create index if not exists site_settings_updated_by_idx on public.site_settings (updated_by);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
create policy "site settings readable" on public.site_settings for select to anon, authenticated using (true);

create or replace function public.admin_update_site_settings(p_signups_open boolean, p_read_only boolean, p_new_account_minutes int, p_blocked_words text[])
returns public.site_settings language plpgsql security definer set search_path = '' as $$
declare r public.site_settings; words text[];
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select coalesce(array_agg(distinct w order by w), '{}') into words
  from (select lower(btrim(x)) w from unnest(coalesce(p_blocked_words, '{}')) x) s
  where char_length(w) between 2 and 40;
  if array_length(words, 1) > 300 then raise exception 'Up to 300 blocked words'; end if;
  update public.site_settings set signups_open = coalesce(p_signups_open, signups_open), read_only = coalesce(p_read_only, read_only),
    new_account_minutes = greatest(0, least(10080, coalesce(p_new_account_minutes, new_account_minutes))), blocked_words = words,
    updated_by = auth.uid(), updated_at = now()
  where id = 1 returning * into r;
  perform public.log_admin(null, 'site_settings', jsonb_build_object('signups_open', r.signups_open, 'read_only', r.read_only, 'new_account_minutes', r.new_account_minutes, 'blocked_words', coalesce(array_length(r.blocked_words, 1), 0)));
  return r;
end $$;
revoke execute on function public.admin_update_site_settings(boolean, boolean, int, text[]) from public, anon;
grant execute on function public.admin_update_site_settings(boolean, boolean, int, text[]) to authenticated;

-- message rules from site settings (staff + system posts are exempt)
create or replace function public.enforce_site_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cfg public.site_settings; r int; joined timestamptz; w text; low text;
begin
  if coalesce(current_setting('nexus.admin_write', true), '') = 'on' then return new; end if;
  select * into cfg from public.site_settings where id = 1;
  if not found then return new; end if;
  if not cfg.read_only and cfg.new_account_minutes = 0 and cardinality(cfg.blocked_words) = 0 then return new; end if;
  r := public.rank_of(new.author_id);
  if r >= 2 then return new; end if;
  if tg_op = 'INSERT' then
    if cfg.read_only then raise exception 'Nexus is in read-only mode for a moment — try again soon'; end if;
    if cfg.new_account_minutes > 0 then
      select created_at into joined from public.profiles where id = new.author_id;
      if joined > now() - make_interval(mins => cfg.new_account_minutes) then
        raise exception 'New accounts can send messages % after joining', case when cfg.new_account_minutes >= 60 then (cfg.new_account_minutes / 60) || ' h' else cfg.new_account_minutes || ' min' end;
      end if;
    end if;
  end if;
  if cardinality(cfg.blocked_words) > 0 and coalesce(new.content, '') <> '' then
    low := lower(new.content);
    foreach w in array cfg.blocked_words loop
      if position(w in low) > 0 and low ~ ('(^|[^[:alnum:]_])' || regexp_replace(w, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '($|[^[:alnum:]_])') then
        raise exception 'That message has a word that isn''t allowed on Nexus';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.enforce_site_rules() from public, anon, authenticated;
drop trigger if exists messages_site_rules on public.messages;
create trigger messages_site_rules before insert or update of content on public.messages for each row execute function public.enforce_site_rules();

-- signups switch: blocks new accounts at the source (email, phone and social sign-in alike)
create or replace function public.signup_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.site_settings where id = 1 and not signups_open) then
    raise exception 'Sign-ups are closed right now';
  end if;
  return new;
end $$;
revoke execute on function public.signup_gate() from public, anon, authenticated;
drop trigger if exists nexus_signup_gate on auth.users;
create trigger nexus_signup_gate before insert on auth.users for each row execute function public.signup_gate();

-- ───────────── admin: message search ─────────────
create or replace function public.admin_search_messages(p_query text, p_user uuid default null, p_servers_only boolean default true, p_limit int default 50)
returns table (id uuid, conversation_id uuid, author_id uuid, content text, attachment_name text, created_at timestamptz, deleted_at timestamptz, conv_kind text, conv_name text, space_name text)
language plpgsql security definer set search_path = '' as $$
declare q text := btrim(coalesce(p_query, ''));
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if char_length(q) < 2 and p_user is null then raise exception 'Type at least 2 characters or pick a member'; end if;
  perform public.log_admin(p_user, 'search_messages', jsonb_build_object('q', left(q, 80), 'servers_only', p_servers_only));
  return query
  select m.id, m.conversation_id, m.author_id, m.content, m.attachment_name, m.created_at, m.deleted_at, c.kind::text, c.name, s.name
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.spaces s on s.id = c.space_id
  where (q = '' or m.content ilike '%' || replace(replace(q, '%', '\%'), '_', '\_') || '%')
    and (p_user is null or m.author_id = p_user)
    and (not p_servers_only or c.space_id is not null)
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;
revoke execute on function public.admin_search_messages(text, uuid, boolean, int) from public, anon;
grant execute on function public.admin_search_messages(text, uuid, boolean, int) to authenticated;

-- ───────────── admin: premium grants ─────────────
create or replace function public.admin_set_premium(p_user uuid, p_tier text, p_days int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_tier is not null and public.tier_rank(p_tier) = 0 then raise exception 'Unknown plan'; end if;
  if p_tier is not null and (p_days is null or p_days < 1 or p_days > 3650) then raise exception 'Pick 1–3650 days'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles set
    premium_tier = p_tier,
    premium_until = case when p_tier is null then null else greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days) end
  where id = p_user;
  perform set_config('nexus.admin_write', 'off', true);
  if not found then raise exception 'User not found'; end if;
  perform public.log_admin(p_user, case when p_tier is null then 'remove_premium' else 'grant_premium' end, jsonb_build_object('tier', p_tier, 'days', p_days));
end $$;
revoke execute on function public.admin_set_premium(uuid, text, int) from public, anon;
grant execute on function public.admin_set_premium(uuid, text, int) to authenticated;

-- ───────────── admin: sign a member out everywhere ─────────────
create or replace function public.admin_revoke_sessions(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.assert_can_moderate(p_user, 3);
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  perform public.log_admin(p_user, 'revoke_sessions', jsonb_build_object('sessions', n));
  return n;
end $$;
revoke execute on function public.admin_revoke_sessions(uuid) from public, anon;
grant execute on function public.admin_revoke_sessions(uuid) to authenticated;

-- ───────────── admin: activity (last N days) ─────────────
create or replace function public.admin_activity(p_days int default 14)
returns table (day date, signups int, messages int, active_users int)
language plpgsql stable security definer set search_path = '' as $$
declare d int := greatest(1, least(coalesce(p_days, 14), 90));
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  return query
  with days as (select generate_series(current_date - (d - 1), current_date, interval '1 day')::date as day),
  sg as (select created_at::date as day, count(*)::int n from public.profiles where created_at >= current_date - (d - 1) group by 1),
  ms as (select created_at::date as day, count(*)::int n, count(distinct author_id)::int u from public.messages where created_at >= current_date - (d - 1) group by 1)
  select days.day, coalesce(sg.n, 0), coalesce(ms.n, 0), coalesce(ms.u, 0)
  from days left join sg using (day) left join ms using (day) order by days.day;
end $$;
revoke execute on function public.admin_activity(int) from public, anon;
grant execute on function public.admin_activity(int) to authenticated;

-- ───────────── delete my account ─────────────
create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); uname text; busy int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select username into uname from public.profiles where id = me;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(coalesce(uname, '')) then raise exception 'Type your username to confirm'; end if;
  if public.rank_of(me) >= 4 then raise exception 'The owner account can''t be deleted here'; end if;
  select count(*) into busy from public.spaces s
  where s.owner_id = me and exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id <> me);
  if busy > 0 then raise exception 'Transfer or delete the % server(s) you own first', busy; end if;
  delete from public.spaces where owner_id = me;
  delete from auth.users where id = me;
end $$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

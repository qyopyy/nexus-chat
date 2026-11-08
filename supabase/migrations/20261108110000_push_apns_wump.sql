-- Closed-app push on iPhone (APNs) + Wump notifications (DMs, friend went Live).
alter table public.push_config
  add column if not exists apns_key_p8 text,
  add column if not exists apns_key_id text check (apns_key_id is null or apns_key_id ~ '^[A-Z0-9]{10}$'),
  add column if not exists apns_team_id text check (apns_team_id is null or apns_team_id ~ '^[A-Z0-9]{10}$'),
  add column if not exists apns_sandbox boolean not null default false,
  add column if not exists apns_default_topic text;

alter table public.push_subscriptions add column if not exists app text check (app is null or app ~ '^[A-Za-z0-9.\-]{3,120}$');
alter table public.push_subscriptions drop constraint if exists push_subscriptions_kind_check;
alter table public.push_subscriptions add constraint push_subscriptions_kind_check check (kind in ('web', 'fcm', 'apns'));

alter table public.notification_prefs add column if not exists wump_live boolean not null default true;

drop function if exists public.register_push(text, text, text, text, text);
create or replace function public.register_push(p_kind text, p_endpoint text, p_p256dh text, p_auth text, p_platform text, p_app text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('web', 'fcm', 'apns') then raise exception 'bad kind'; end if;
  if p_kind = 'web' and p_endpoint !~ '^https://' then raise exception 'bad endpoint'; end if;
  if p_kind = 'apns' and p_endpoint !~ '^[0-9a-fA-F]{64,200}$' then raise exception 'bad device token'; end if;
  if p_kind = 'apns' and coalesce(p_app, '') !~ '^hu\.qyopy\.[A-Za-z0-9.\-]{2,100}$' then raise exception 'bad app'; end if;
  insert into public.push_subscriptions (user_id, kind, endpoint, p256dh, auth, platform, app, last_seen)
  values (auth.uid(), p_kind, p_endpoint, p_p256dh, p_auth, left(p_platform, 40), case when p_kind = 'apns' then p_app end, now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id, kind = excluded.kind, p256dh = excluded.p256dh, auth = excluded.auth,
        platform = excluded.platform, app = excluded.app, last_seen = now();
  -- one user can't hoard unlimited device rows
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where user_id = auth.uid() order by last_seen desc nulls last offset 20);
end $$;
revoke execute on function public.register_push(text, text, text, text, text, text) from public, anon;
grant execute on function public.register_push(text, text, text, text, text, text) to authenticated;

create or replace function public.push_status()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'web', coalesce((select vapid_private is not null from public.push_config where id = 1), false),
    'fcm', coalesce((select fcm_service_account is not null from public.push_config where id = 1), false),
    'apns', coalesce((select apns_key_p8 is not null and apns_key_id is not null and apns_team_id is not null from public.push_config where id = 1), false),
    'devices', (select count(*) from public.push_subscriptions where user_id = (select auth.uid()))
  );
$$;

-- Admin: save the APNs auth key (.p8 from developer.apple.com → Keys). Never readable back.
create or replace function public.admin_set_apns(p_key_id text, p_team_id text, p_key_p8 text default null, p_sandbox boolean default false)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if upper(btrim(coalesce(p_key_id, ''))) !~ '^[A-Z0-9]{10}$' then raise exception 'Key ID is 10 letters/numbers'; end if;
  if upper(btrim(coalesce(p_team_id, ''))) !~ '^[A-Z0-9]{10}$' then raise exception 'Team ID is 10 letters/numbers'; end if;
  if p_key_p8 is not null and btrim(p_key_p8) <> '' and p_key_p8 !~ 'BEGIN PRIVATE KEY' then raise exception 'Paste the whole .p8 file contents'; end if;
  insert into public.push_config (id) values (1) on conflict (id) do nothing;
  update public.push_config set
    apns_key_id = upper(btrim(p_key_id)), apns_team_id = upper(btrim(p_team_id)), apns_sandbox = coalesce(p_sandbox, false),
    apns_key_p8 = case when p_key_p8 is not null and btrim(p_key_p8) <> '' then btrim(p_key_p8) else apns_key_p8 end,
    updated_at = now()
  where id = 1;
  perform public.log_admin(auth.uid(), 'apns_config', jsonb_build_object('key_id', upper(btrim(p_key_id)), 'sandbox', coalesce(p_sandbox, false)));
  return public.admin_apns_status();
end $$;

create or replace function public.admin_apns_status()
returns json language plpgsql stable security definer set search_path = '' as $$
declare c public.push_config;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select * into c from public.push_config where id = 1;
  return json_build_object('key_id', c.apns_key_id, 'team_id', c.apns_team_id, 'has_key', c.apns_key_p8 is not null, 'sandbox', coalesce(c.apns_sandbox, false),
    'ios_devices', (select count(*) from public.push_subscriptions where kind = 'apns'));
end $$;
revoke execute on function public.admin_set_apns(text, text, text, boolean) from public, anon;
revoke execute on function public.admin_apns_status() from public, anon;
grant execute on function public.admin_set_apns(text, text, text, boolean) to authenticated;
grant execute on function public.admin_apns_status() to authenticated;

-- Triggers → push edge function (same pattern as messages_push)
create or replace function public.notify_push(p_body jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare cfg public.push_config;
begin
  select * into cfg from public.push_config where id = 1;
  if cfg.secret is null then return; end if;
  perform net.http_post(
    url := 'https://fcnabeudhdlugruqzezn.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret),
    body := p_body, timeout_milliseconds := 5000);
exception when others then null;
end $$;
revoke execute on function public.notify_push(jsonb) from public, anon, authenticated;

create or replace function public.bump_message_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_push(jsonb_build_object('bump_message_id', new.id));
  return new;
end $$;
drop trigger if exists bump_messages_push on public.bump_messages;
create trigger bump_messages_push after insert on public.bump_messages for each row execute function public.bump_message_push();

-- "<friend> is Live" — only when they start sharing (new pin, or back after 30+ min / expiry), not on every heartbeat
create or replace function public.bump_live_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or old.updated_at < now() - interval '30 minutes' or (old.expires_at is not null and old.expires_at < now()) then
    perform public.notify_push(jsonb_build_object('wump_live_user', new.user_id));
  end if;
  return new;
end $$;
drop trigger if exists bump_presence_live_push on public.bump_presence;
create trigger bump_presence_live_push after insert or update on public.bump_presence for each row execute function public.bump_live_push();
revoke execute on function public.bump_message_push() from public, anon, authenticated;
revoke execute on function public.bump_live_push() from public, anon, authenticated;

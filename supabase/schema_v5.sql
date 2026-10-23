-- =====================================================================
-- Nexus — v5: push notifications
-- Web Push (browsers, Android Chrome, iPhone home-screen app on iOS 16.4+) + FCM (Android app, optional).
-- New messages and incoming calls → pg_net → `push` edge function. Applied live as nexus_14..16.
-- =====================================================================
create extension if not exists pg_net with schema extensions;

alter table public.conversation_members add column if not exists muted boolean not null default false;

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('web', 'fcm')),
  endpoint    text not null unique check (char_length(endpoint) <= 1000),
  p256dh      text check (char_length(p256dh) <= 200),
  auth        text check (char_length(auth) <= 100),
  platform    text check (char_length(platform) <= 40),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

create policy "push own read" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "push own insert" on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push own update" on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push own remove" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- secret + VAPID keys + optional FCM service account (service role only; no policies)
create table if not exists public.push_config (
  id         int primary key check (id = 1),
  secret     text not null,
  vapid_public  text,
  vapid_private text,
  fcm_service_account text,
  updated_at timestamptz not null default now()
);
alter table public.push_config enable row level security;

create or replace function public.set_conversation_muted(p_conv uuid, p_muted boolean)
returns void language sql security definer set search_path = '' as $$
  update public.conversation_members set muted = p_muted where conversation_id = p_conv and user_id = (select auth.uid());
$$;

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cfg public.push_config;
begin
  if new.deleted_at is not null then return new; end if;
  select * into cfg from public.push_config where id = 1;
  if cfg.secret is null then return new; end if;
  perform net.http_post(
    url := 'https://fcnabeudhdlugruqzezn.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret),
    body := jsonb_build_object('message_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end;
$$;
create trigger messages_push after insert on public.messages for each row execute function public.notify_new_message();

create or replace function public.register_push(p_kind text, p_endpoint text, p_p256dh text, p_auth text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('web', 'fcm') then raise exception 'bad kind'; end if;
  insert into public.push_subscriptions (user_id, kind, endpoint, p256dh, auth, platform, last_seen)
  values (auth.uid(), p_kind, p_endpoint, p_p256dh, p_auth, left(p_platform, 40), now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id, kind = excluded.kind, p256dh = excluded.p256dh, auth = excluded.auth,
        platform = excluded.platform, last_seen = now();
end;
$$;

-- ---------------------------------------------------------------- v16: call pushes + Android (FCM) setup
create or replace function public.notify_call_ring()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cfg public.push_config;
begin
  if new.kind <> 'ring' then return new; end if;
  select * into cfg from public.push_config where id = 1;
  if cfg.secret is null then return new; end if;
  perform net.http_post(
    url := 'https://fcnabeudhdlugruqzezn.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret),
    body := jsonb_build_object('call_event_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end;
$$;
create trigger call_events_push after insert on public.call_events for each row execute function public.notify_call_ring();

-- owner pastes the Firebase service-account JSON for Android app pushes
create or replace function public.set_fcm_service_account(p_json text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j jsonb;
begin
  if public.my_rank() < 4 then raise exception 'Only the owner can change push settings'; end if;
  if p_json is null or trim(p_json) = '' then
    update public.push_config set fcm_service_account = null, updated_at = now() where id = 1;
    return;
  end if;
  j := p_json::jsonb;
  if j ->> 'type' <> 'service_account' or j ->> 'project_id' is null or j ->> 'private_key' is null or j ->> 'client_email' is null then
    raise exception 'That is not a Firebase service-account key (JSON)';
  end if;
  update public.push_config set fcm_service_account = p_json, updated_at = now() where id = 1;
end;
$$;

create or replace function public.push_status()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'web', coalesce((select vapid_private is not null from public.push_config where id = 1), false),
    'fcm', coalesce((select fcm_service_account is not null from public.push_config where id = 1), false),
    'devices', (select count(*) from public.push_subscriptions where user_id = (select auth.uid()))
  );
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

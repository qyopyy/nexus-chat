-- One-time six-digit approval for sign-in on a second screen.
-- Codes are short-lived; knowing a code is NEVER enough to redeem a session.
-- The requesting screen keeps a separate 256-bit verifier. All writes are
-- server-only. Apply before deploying the device-link Edge Function.
create table if not exists public.nexus_device_link_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  verifier_hash text not null check (verifier_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  device_label text not null check (char_length(device_label) between 1 and 64),
  status text not null default 'pending'
    check (status in ('pending','approved','consumed','cancelled')),
  approved_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint nexus_device_link_five_minutes
    check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);
create index if not exists nexus_device_link_codes_ip_idx
  on public.nexus_device_link_codes (ip_hash, created_at desc);

create table if not exists public.nexus_device_link_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists nexus_device_link_attempts_user_idx
  on public.nexus_device_link_attempts (user_id, created_at desc);
create index if not exists nexus_device_link_attempts_ip_idx
  on public.nexus_device_link_attempts (ip_hash, created_at desc);

alter table public.nexus_device_link_codes enable row level security;
alter table public.nexus_device_link_attempts enable row level security;
revoke all on public.nexus_device_link_codes from public, anon, authenticated;
revoke all on public.nexus_device_link_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.nexus_device_link_codes to service_role;
grant select, insert, update, delete on public.nexus_device_link_attempts to service_role;
grant usage, select on sequence public.nexus_device_link_attempts_id_seq to service_role;

-- Serializes new-code requests by IP and limits each IP to 8 / 10 minutes.
-- An app server must hash the IP with a secret (never persist the raw address).
create or replace function public.nexus_device_link_start_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.ip_hash, 0));
  if (select count(*) from public.nexus_device_link_codes
      where ip_hash = new.ip_hash and created_at > now() - interval '10 minutes') >= 8 then
    raise exception using errcode = 'P0001', message = 'Too many pairing codes. Try again later.';
  end if;
  return new;
end;
$$;
revoke all on function public.nexus_device_link_start_guard() from public, anon, authenticated;
drop trigger if exists nexus_device_link_start_guard on public.nexus_device_link_codes;
create trigger nexus_device_link_start_guard before insert on public.nexus_device_link_codes
  for each row execute function public.nexus_device_link_start_guard();

-- The Edge Function supplies p_user_id only after checking the caller's actual
-- Supabase user JWT. Limit guesses to 8 per signed-in user and 40 per IP
-- every 10 minutes, including wrong and already-used codes.
create or replace function public.nexus_device_link_approve(
  p_code_hash text, p_user_id uuid, p_ip_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  linked_label text;
begin
  if p_user_id is null or p_code_hash !~ '^[a-f0-9]{64}$'
     or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 2));
  if (select count(*) from public.nexus_device_link_attempts
      where user_id = p_user_id and created_at > now() - interval '10 minutes') >= 8
    or (select count(*) from public.nexus_device_link_attempts
      where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.nexus_device_link_attempts(user_id,ip_hash)
    values(p_user_id,p_ip_hash);
  update public.nexus_device_link_codes
    set status = 'approved', approved_user_id = p_user_id
    where code_hash = p_code_hash and status = 'pending' and expires_at > now()
    returning device_label into linked_label;
  if linked_label is null then return jsonb_build_object('status', 'invalid'); end if;
  return jsonb_build_object('status', 'approved', 'device_label', linked_label);
end;
$$;

-- Atomically consume approval and return the owner only to the Edge Function.
-- The separate random verifier prevents code-only session theft.
create or replace function public.nexus_device_link_redeem(
  p_request_id uuid, p_verifier_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid;
begin
  update public.nexus_device_link_codes
     set status = 'consumed', consumed_at = now()
   where id = p_request_id and verifier_hash = p_verifier_hash
     and status = 'approved' and expires_at > now()
     and approved_user_id is not null
  returning approved_user_id into account_id;
  if account_id is null then return jsonb_build_object('status','expired'); end if;
  return jsonb_build_object('status','ready','user_id',account_id);
end;
$$;

revoke all on function public.nexus_device_link_approve(text, uuid, text) from public, anon, authenticated;
revoke all on function public.nexus_device_link_redeem(uuid, text) from public, anon, authenticated;
grant execute on function public.nexus_device_link_approve(text, uuid, text) to service_role;
grant execute on function public.nexus_device_link_redeem(uuid, text) to service_role;

-- Not in Realtime: presence and approval must not publish user IDs or codes.
-- Periodic maintenance can remove codes older than a day and attempts older
-- than a day without affecting live five-minute requests.

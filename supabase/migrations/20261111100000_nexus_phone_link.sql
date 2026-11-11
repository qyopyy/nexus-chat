-- Phone Link commands, the computer inbox, and Nexus notification copies.
-- Only the account owner can insert or read them. Sensitive actions stay
-- pending until the phone confirms.

create table if not exists public.nexus_handset_commands (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  device_id    text not null check (char_length(device_id) between 8 and 64),
  kind         text not null check (kind in (
    'open_url', 'note', 'clipboard', 'ring', 'vibrate', 'torch', 'find_stop',
    'play', 'pause', 'next', 'prev', 'volume',
    'camera', 'voice', 'sign_out'
  )),
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending', 'done', 'denied', 'expired')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists nexus_handset_commands_device_idx
  on public.nexus_handset_commands (user_id, device_id, created_at desc);

create table if not exists public.nexus_handset_inbox (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  from_device  text,
  kind         text not null check (kind in ('note', 'link', 'clipboard')),
  body         text not null check (char_length(body) between 1 and 4000),
  created_at   timestamptz not null default now(),
  seen_at      timestamptz
);
create index if not exists nexus_handset_inbox_user_idx
  on public.nexus_handset_inbox (user_id, created_at desc);

create table if not exists public.nexus_device_notices (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  device_id    text,
  title        text not null check (char_length(title) between 1 and 120),
  body         text check (body is null or char_length(body) <= 240),
  href         text check (href is null or char_length(href) <= 300),
  created_at   timestamptz not null default now(),
  seen_at      timestamptz
);
create index if not exists nexus_device_notices_user_idx
  on public.nexus_device_notices (user_id, created_at desc);

alter table public.nexus_handset_commands enable row level security;
alter table public.nexus_handset_inbox enable row level security;
alter table public.nexus_device_notices enable row level security;
revoke all on public.nexus_handset_commands from anon, authenticated;
revoke all on public.nexus_handset_inbox from anon, authenticated;
revoke all on public.nexus_device_notices from anon, authenticated;
grant select, insert, update, delete on public.nexus_handset_commands to authenticated;
grant select, insert, update, delete on public.nexus_handset_inbox to authenticated;
grant select, insert, update, delete on public.nexus_device_notices to authenticated;
grant usage, select on sequence public.nexus_device_notices_id_seq to authenticated;

drop policy if exists nexus_handset_commands_own on public.nexus_handset_commands;
create policy nexus_handset_commands_own on public.nexus_handset_commands
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists nexus_handset_inbox_own on public.nexus_handset_inbox;
create policy nexus_handset_inbox_own on public.nexus_handset_inbox
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists nexus_device_notices_own on public.nexus_device_notices;
create policy nexus_device_notices_own on public.nexus_device_notices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.nexus_handset_command_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  url text;
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.nexus_handsets h
      where h.user_id = new.user_id and h.device_id = new.device_id
    ) then
      raise exception 'That device is not signed in';
    end if;
    if (select count(*) from public.nexus_handset_commands
        where user_id = new.user_id and status = 'pending') >= 40 then
      raise exception 'Too many waiting phone actions';
    end if;
    if new.kind = 'open_url' then
      url := coalesce(new.payload->>'url', '');
      if url ~* '^(javascript|data):' or (url !~* '^https?://' and url !~ '^/[A-Za-z0-9]') then
        raise exception 'Only an https link or a Nexus page can be opened';
      end if;
    end if;
    if new.kind in ('note', 'clipboard') and char_length(coalesce(new.payload->>'text', '')) > 4000 then
      raise exception 'That text is too long';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.resolved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists nexus_handset_command_guard on public.nexus_handset_commands;
create trigger nexus_handset_command_guard
  before insert or update on public.nexus_handset_commands
  for each row execute function public.nexus_handset_command_guard();

alter table public.nexus_handset_commands replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.nexus_handset_commands;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.nexus_handset_inbox;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.nexus_device_notices;
exception when duplicate_object then null; when undefined_object then null;
end $$;

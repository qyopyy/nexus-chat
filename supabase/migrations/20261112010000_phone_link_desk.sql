-- Phone Link desk: clipboard history, per-device grants, focus, and more commands.
-- Owner-only rows (auth.uid()). Sensitive kinds stay pending until the phone confirms.
-- feature_on() is a stub here so later migrations can turn features off in one place.

create or replace function public.feature_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.feature_on(text) from public, anon;
grant execute on function public.feature_on(text) to authenticated;

alter table public.nexus_handsets
  add column if not exists focus_until timestamptz;

alter table public.nexus_handset_commands drop constraint if exists nexus_handset_commands_kind_check;
alter table public.nexus_handset_commands
  add constraint nexus_handset_commands_kind_check
  check (kind in (
    'open_url', 'note', 'clipboard', 'clipboard_pull',
    'ring', 'vibrate', 'torch', 'find_stop',
    'play', 'pause', 'next', 'prev', 'volume', 'seek', 'sleep', 'crossfade', 'ping',
    'camera', 'voice', 'sign_out', 'screenshot', 'gallery'
  ));

alter table public.nexus_handset_inbox drop constraint if exists nexus_handset_inbox_kind_check;
alter table public.nexus_handset_inbox
  add constraint nexus_handset_inbox_kind_check
  check (kind in ('note', 'link', 'clipboard', 'share'));

create table if not exists public.nexus_clipboard (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  device_id   text,
  direction   text not null check (direction in ('to_phone', 'to_computer')),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists nexus_clipboard_user_idx
  on public.nexus_clipboard (user_id, created_at desc);

create table if not exists public.nexus_handset_grants (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  device_id   text not null check (char_length(device_id) between 8 and 64),
  clipboard   boolean not null default true,
  files       boolean not null default true,
  chats       boolean not null default true,
  find        boolean not null default true,
  acetate     boolean not null default true,
  screenshot  boolean not null default false,
  gallery     boolean not null default false,
  focus       boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.nexus_clipboard enable row level security;
alter table public.nexus_handset_grants enable row level security;
revoke all on public.nexus_clipboard from anon, authenticated;
revoke all on public.nexus_handset_grants from anon, authenticated;
grant select, insert, delete on public.nexus_clipboard to authenticated;
grant select, insert, update, delete on public.nexus_handset_grants to authenticated;

drop policy if exists nexus_clipboard_own on public.nexus_clipboard;
create policy nexus_clipboard_own on public.nexus_clipboard
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists nexus_handset_grants_own on public.nexus_handset_grants;
create policy nexus_handset_grants_own on public.nexus_handset_grants
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.nexus_clipboard_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.nexus_clipboard
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'Clipboard history is full for today';
  end if;
  return new;
end;
$$;

drop trigger if exists nexus_clipboard_guard on public.nexus_clipboard;
create trigger nexus_clipboard_guard
  before insert on public.nexus_clipboard
  for each row execute function public.nexus_clipboard_guard();

create or replace function public.nexus_handset_feature_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.feature_on('locator') then
    if new.share_location is true and (tg_op = 'INSERT' or old.share_location is distinct from true) then
      raise exception 'Locator is turned off';
    end if;
    new.share_location := false;
    new.lat := null;
    new.lng := null;
    new.accuracy_m := null;
    new.loc_at := null;
  end if;
  if tg_op = 'UPDATE'
     and new.focus_until is distinct from old.focus_until
     and exists (
       select 1 from public.nexus_handset_grants g
       where g.user_id = new.user_id and g.device_id = new.device_id and g.focus is false
     ) then
    raise exception 'Focus is off for this phone';
  end if;
  return new;
end;
$$;

drop trigger if exists nexus_handset_feature_guard on public.nexus_handsets;
create trigger nexus_handset_feature_guard
  before insert or update on public.nexus_handsets
  for each row execute function public.nexus_handset_feature_guard();

create or replace function public.nexus_handset_command_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  url text;
  g public.nexus_handset_grants;
  seconds numeric;
begin
  if tg_op = 'INSERT' then
    if not public.feature_on('phone_link') then
      raise exception 'Phone Link is turned off';
    end if;
    if not exists (
      select 1 from public.nexus_handsets h
      where h.user_id = new.user_id and h.device_id = new.device_id
    ) then
      raise exception 'That device is not signed in';
    end if;
    if (select count(*) from public.nexus_handset_commands
        where user_id = new.user_id and created_at > now() - interval '1 minute') >= 30 then
      raise exception 'Too many phone actions. Wait a moment.';
    end if;
    if (select count(*) from public.nexus_handset_commands
        where user_id = new.user_id and status = 'pending') >= 40 then
      raise exception 'Too many waiting phone actions';
    end if;
    select * into g from public.nexus_handset_grants
    where user_id = new.user_id and device_id = new.device_id;
    if new.kind in ('clipboard', 'clipboard_pull') and not coalesce(g.clipboard, true) then
      raise exception 'Clipboard is off for that phone';
    end if;
    if new.kind in ('ring', 'vibrate', 'torch', 'find_stop') and not coalesce(g.find, true) then
      raise exception 'Find is off for that phone';
    end if;
    if new.kind in ('play', 'pause', 'next', 'prev', 'volume', 'seek', 'sleep', 'crossfade')
       and not coalesce(g.acetate, true) then
      raise exception 'Acetate control is off for that phone';
    end if;
    if new.kind = 'screenshot' and not coalesce(g.screenshot, false) then
      raise exception 'Screenshots are off for that phone. Turn them on under Phone Link permissions.';
    end if;
    if new.kind = 'gallery' and not coalesce(g.gallery, false) then
      raise exception 'Gallery sends are off for that phone. Turn them on under Phone Link permissions.';
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
    if new.kind = 'seek' then
      seconds := coalesce((new.payload->>'seconds')::numeric, -1);
      if seconds < 0 or seconds > 86400 then
        raise exception 'Bad seek position';
      end if;
    end if;
    if new.kind = 'sleep' then
      seconds := coalesce((new.payload->>'minutes')::numeric, -1);
      if seconds < 0 or seconds > 240 then
        raise exception 'Sleep timer must be 0 to 240 minutes';
      end if;
    end if;
    if new.kind = 'crossfade' then
      seconds := coalesce((new.payload->>'ms')::numeric, -1);
      if seconds < 0 or seconds > 12000 then
        raise exception 'Crossfade must be 0 to 12 seconds';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.resolved_at := now();
  end if;
  return new;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.nexus_clipboard;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.nexus_handset_grants;
exception when duplicate_object then null; when undefined_object then null;
end $$;

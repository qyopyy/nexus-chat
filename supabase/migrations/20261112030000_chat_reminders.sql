-- Chat reminders and conversation snooze. Owner-only. The open app fires reminders.

create table if not exists public.message_reminders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  message_id       uuid not null references public.messages (id) on delete cascade,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  remind_at        timestamptz not null,
  note             text check (note is null or char_length(note) <= 140),
  fired_at         timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists message_reminders_due_idx
  on public.message_reminders (user_id, remind_at)
  where fired_at is null;

create table if not exists public.conversation_snoozes (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  until            timestamptz not null,
  primary key (user_id, conversation_id)
);

alter table public.message_reminders enable row level security;
alter table public.conversation_snoozes enable row level security;
revoke all on public.message_reminders from anon, authenticated;
revoke all on public.conversation_snoozes from anon, authenticated;
grant select, insert, update, delete on public.message_reminders to authenticated;
grant select, insert, update, delete on public.conversation_snoozes to authenticated;

drop policy if exists message_reminders_own on public.message_reminders;
create policy message_reminders_own on public.message_reminders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists conversation_snoozes_own on public.conversation_snoozes;
create policy conversation_snoozes_own on public.conversation_snoozes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.message_reminder_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_conversation_member(new.conversation_id) then
    raise exception 'Not in that chat';
  end if;
  if not exists (
    select 1 from public.messages m
    where m.id = new.message_id and m.conversation_id = new.conversation_id and m.deleted_at is null
  ) then
    raise exception 'Message not found';
  end if;
  if new.remind_at <= now() or new.remind_at > now() + interval '30 days' then
    raise exception 'Pick a reminder in the next 30 days';
  end if;
  if (select count(*) from public.message_reminders
      where user_id = new.user_id and fired_at is null) >= 40 then
    raise exception 'Too many reminders';
  end if;
  return new;
end;
$$;

drop trigger if exists message_reminder_guard on public.message_reminders;
create trigger message_reminder_guard
  before insert on public.message_reminders
  for each row execute function public.message_reminder_guard();

create or replace function public.conversation_snooze_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_conversation_member(new.conversation_id) then
    raise exception 'Not in that chat';
  end if;
  if new.until <= now() or new.until > now() + interval '14 days' then
    raise exception 'Snooze must be within 14 days';
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_snooze_guard on public.conversation_snoozes;
create trigger conversation_snooze_guard
  before insert or update on public.conversation_snoozes
  for each row execute function public.conversation_snooze_guard();

create or replace function public.fire_due_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  out jsonb;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;
  with fired as (
    update public.message_reminders
    set fired_at = now()
    where user_id = auth.uid() and fired_at is null and remind_at <= now()
    returning id, conversation_id, message_id, note
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'conversation_id', conversation_id,
    'message_id', message_id,
    'note', note
  )), '[]'::jsonb) into out
  from fired;
  return out;
end;
$$;

revoke all on function public.fire_due_reminders() from public, anon;
grant execute on function public.fire_due_reminders() to authenticated;

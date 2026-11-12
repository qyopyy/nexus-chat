-- Private scratch notes on a conversation. One row per member.
-- Not applied to the live database by this change.

create table if not exists public.chat_scratch (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 2000),
  updated_at       timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.chat_scratch enable row level security;
revoke all on public.chat_scratch from anon, authenticated;
grant select, insert, update, delete on public.chat_scratch to authenticated;

drop policy if exists chat_scratch_own on public.chat_scratch;
create policy chat_scratch_own on public.chat_scratch
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.chat_scratch_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'Not your note';
  end if;
  if not public.is_conversation_member(new.conversation_id) then
    raise exception 'Not in that chat';
  end if;
  new.body = btrim(new.body);
  if new.body = '' or char_length(new.body) > 2000 then
    raise exception 'Note must be 1 to 2000 characters';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_scratch_guard on public.chat_scratch;
create trigger chat_scratch_guard
  before insert or update on public.chat_scratch
  for each row execute function public.chat_scratch_guard();

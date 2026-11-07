-- Premium HQ chat: messages up to 8,000 characters on Nexus Lighting and up (free stays at 4,000).

-- table cap 4,000 → 8,000 (validated separately so the table isn't locked while it's checked)
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (char_length(content) <= 8000) not valid;
alter table public.messages validate constraint messages_content_check;

-- anything over 4,000 needs a plan (checked on send and on edit; only runs for long messages)
create or replace function public.enforce_message_length()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if char_length(coalesce(new.content, '')) > 4000 and public.tier_of(new.author_id) < 1 then
    raise exception 'Messages over 4,000 characters need Nexus Lighting (up to 8,000)' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_message_length() from public, anon, authenticated;
drop trigger if exists messages_length_by_tier on public.messages;
create trigger messages_length_by_tier
  before insert or update of content on public.messages
  for each row when (char_length(new.content) > 4000)
  execute function public.enforce_message_length();

-- scheduled messages follow the same limits (no more silent cut at 4,000)
alter table public.scheduled_messages drop constraint if exists scheduled_messages_content_check;
alter table public.scheduled_messages add constraint scheduled_messages_content_check check (char_length(content) between 1 and 8000);

create or replace function public.schedule_message(p_conversation uuid, p_content text, p_send_at timestamptz)
returns public.scheduled_messages language plpgsql security definer set search_path = '' as $$
declare r public.scheduled_messages; c text := btrim(coalesce(p_content, '')); lim int;
begin
  if auth.uid() is null or public.is_banned() or public.is_muted() then raise exception 'You can''t send messages right now'; end if;
  if not public.is_conversation_member(p_conversation) then raise exception 'You''re not in that chat'; end if;
  if c = '' then raise exception 'Write a message first'; end if;
  lim := case when public.my_tier() >= 1 then 8000 else 4000 end;
  if char_length(c) > lim then
    raise exception '%', case when lim = 4000 then 'Messages over 4,000 characters need Nexus Lighting (up to 8,000)' else 'Messages can be up to 8,000 characters' end;
  end if;
  if p_send_at < now() + interval '1 minute' then raise exception 'Pick a time at least a minute from now'; end if;
  if p_send_at > now() + interval '90 days' then raise exception 'You can schedule up to 90 days ahead'; end if;
  if (select count(*) from public.scheduled_messages where author_id = auth.uid() and status = 'pending') >= 50 then
    raise exception 'You already have 50 scheduled messages';
  end if;
  insert into public.scheduled_messages (conversation_id, author_id, content, send_at)
  values (p_conversation, auth.uid(), c, p_send_at) returning * into r;
  return r;
end $$;
revoke execute on function public.schedule_message(uuid, text, timestamptz) from public, anon;
grant execute on function public.schedule_message(uuid, text, timestamptz) to authenticated, service_role;

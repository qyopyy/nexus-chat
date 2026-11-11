-- The composer already offers 30s, 1m, 5m, 1h and 6h, but set_message_ttl
-- only accepted 1 day, 1 week, 1 month and 1 year. Allow the same timers the
-- UI shows, and let a member delete messages that have already aged out.
-- Attachment paths are queued for the expire job, which removes the files.

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'conversations'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%message_ttl%'
  loop
    execute format('alter table public.conversations drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.conversations
  add constraint conversations_message_ttl_check
  check (
    message_ttl is null
    or message_ttl in (30, 60, 300, 3600, 21600, 86400, 604800, 2592000, 31536000)
  );

create or replace function public.set_message_ttl(p_conv uuid, p_seconds int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  label text;
begin
  if auth.uid() is null or not public.is_conversation_member(p_conv) then
    raise exception 'Not a member of this chat';
  end if;
  if public.is_banned() then
    raise exception 'You are banned';
  end if;
  select kind into k from public.conversations where id = p_conv;
  if k not in ('dm', 'group') then
    raise exception 'Disappearing messages work in direct messages and groups';
  end if;
  if p_seconds is not null and p_seconds not in (30, 60, 300, 3600, 21600, 86400, 604800, 2592000, 31536000) then
    raise exception 'Pick a timer from the list';
  end if;
  label := case p_seconds
    when 30 then '30 seconds'
    when 60 then '1 minute'
    when 300 then '5 minutes'
    when 3600 then '1 hour'
    when 21600 then '6 hours'
    when 86400 then '1 day'
    when 604800 then '1 week'
    when 2592000 then '1 month'
    when 31536000 then '1 year'
  end;
  update public.conversations set message_ttl = nullif(p_seconds, 0) where id = p_conv;
  insert into public.messages (conversation_id, author_id, content)
  values (
    p_conv,
    auth.uid(),
    case
      when label is null then '⏱ Turned off disappearing messages'
      else '⏱ Set messages to disappear after ' || label
    end
  );
end;
$$;

revoke all on function public.set_message_ttl(uuid, int) from public, anon;
grant execute on function public.set_message_ttl(uuid, int) to authenticated, service_role;

create table if not exists public.message_file_gc (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  path       text not null,
  created_at timestamptz not null default now()
);
alter table public.message_file_gc enable row level security;
revoke all on public.message_file_gc from anon, authenticated;

create or replace function public.purge_expired_messages(p_conv uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  ttl int;
  rec record;
  n int := 0;
  rest text;
  slash int;
begin
  if auth.uid() is null or not public.is_conversation_member(p_conv) then
    return 0;
  end if;
  select c.message_ttl into ttl from public.conversations c where c.id = p_conv;
  if ttl is null then
    return 0;
  end if;
  for rec in
    delete from public.messages
    where id in (
      select m.id
      from public.messages m
      where m.conversation_id = p_conv
        and m.created_at < now() - make_interval(secs => ttl)
      order by m.created_at
      limit 200
    )
    returning attachment_url
  loop
    n := n + 1;
    if rec.attachment_url like 'sb://%/%' then
      rest := substring(rec.attachment_url from 6);
      slash := position('/' in rest);
      if slash > 1 then
        insert into public.message_file_gc (bucket, path)
        values (substring(rest from 1 for slash - 1), substring(rest from slash + 1));
      end if;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.purge_expired_messages(uuid) from public, anon;
grant execute on function public.purge_expired_messages(uuid) to authenticated;

-- =====================================================================
-- Nexus — v9: disappearing messages (1 day / 1 week / 1 month / 1 year) + 100 MB attachments.
-- Applied live as nexus_20_disappearing_messages + nexus_21_expire_cron.
-- The `expire` edge function (every 15 min via pg_cron) deletes expired messages and their files.
-- Bucket limits raised with: update storage.buckets set file_size_limit = 104857600 where id in ('attachments','space-music','artist-media');
-- =====================================================================
create extension if not exists pg_cron;

alter table public.conversations add column if not exists message_ttl int
  check (message_ttl is null or message_ttl between 3600 and 31622400);

create or replace function public.set_message_ttl(p_conv uuid, p_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  k text;
  label text;
begin
  if auth.uid() is null or not public.is_conversation_member(p_conv) then raise exception 'Not a member of this chat'; end if;
  if public.is_banned() then raise exception 'You are banned'; end if;
  select kind into k from public.conversations where id = p_conv;
  if k not in ('dm', 'group') then raise exception 'Disappearing messages work in direct messages and groups'; end if;
  if p_seconds is not null and p_seconds not in (86400, 604800, 2592000, 31536000) then raise exception 'Pick 1 day, 1 week, 1 month or 1 year'; end if;
  label := case p_seconds when 86400 then '1 day' when 604800 then '1 week' when 2592000 then '1 month' when 31536000 then '1 year' end;
  update public.conversations set message_ttl = nullif(p_seconds, 0) where id = p_conv;
  insert into public.messages (conversation_id, author_id, content)
  values (p_conv, auth.uid(), case when label is null then '⏱ Turned off disappearing messages' else '⏱ Set messages to disappear after ' || label end);
end;
$$;

create or replace function public.expired_messages(p_limit int default 1000)
returns table (id uuid, attachment_url text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.attachment_url
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where c.message_ttl is not null
    and m.created_at < now() - make_interval(secs => c.message_ttl)
  order by m.created_at
  limit least(greatest(p_limit, 1), 5000);
$$;
revoke execute on function public.expired_messages(int) from public, anon, authenticated;
grant execute on function public.expired_messages(int) to service_role;

create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at);

revoke execute on function public.set_message_ttl(uuid, int) from public, anon;
grant execute on function public.set_message_ttl(uuid, int) to authenticated, service_role;

select cron.schedule(
  'nexus-expire-messages',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://fcnabeudhdlugruqzezn.supabase.co/functions/v1/expire',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', (select secret from public.push_config where id = 1)),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);

-- Opt-in end-to-end encrypted DMs (ECDH P-256 + AES-GCM, "nx1:" message prefix).
-- The server only ever stores public keys, a passphrase-wrapped private-key backup, and ciphertext.

create table if not exists public.e2ee_public_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_jwk jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.e2ee_key_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  iv text not null,
  wrapped text not null,
  iterations int not null default 600000,
  updated_at timestamptz not null default now()
);
alter table public.e2ee_public_keys enable row level security;
alter table public.e2ee_key_backups enable row level security;

drop policy if exists e2ee_pub_read on public.e2ee_public_keys;
create policy e2ee_pub_read on public.e2ee_public_keys for select to authenticated using (true);
drop policy if exists e2ee_pub_write on public.e2ee_public_keys;
create policy e2ee_pub_write on public.e2ee_public_keys for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists e2ee_bak_own on public.e2ee_key_backups;
create policy e2ee_bak_own on public.e2ee_key_backups for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.e2ee_public_keys, public.e2ee_key_backups from anon;

-- never leak ciphertext (or plaintext) of encrypted messages into inbox rows / chat list
create or replace function public.notification_inbox_on_message()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare member uuid; author_name text; preview text;
begin
  select coalesce(nullif(display_name, ''), username, 'Someone') into author_name from profiles where id = new.author_id;
  preview := case
    when new.content like 'nx1:%' then '🔒 Encrypted message'
    when new.hidden then '🙈 Hidden message'
    when new.spoiler then '⚠️ Spoiler'
    else left(coalesce(nullif(trim(new.content), ''), new.attachment_name, 'Sent an attachment'), 160) end;
  for member in select cm.user_id from conversation_members cm where cm.conversation_id = new.conversation_id and cm.user_id <> new.author_id
  loop
    insert into notification_inbox (user_id, kind, title, body, conversation_id, message_id, actor_id)
    values (member, 'message', author_name, preview, new.conversation_id, new.id, new.author_id);
  end loop;
  return new;
end;
$function$;

create or replace function public.get_conversation_list()
returns table(id uuid, kind text, name text, created_at timestamptz, last_message_at timestamptz, last_message text, last_author_id uuid, other_user_id uuid, member_count integer)
language sql stable security definer set search_path to '' as $function$
  select
    c.id, c.kind, c.name, c.created_at, c.last_message_at,
    case
      when lm.id is null then null
      when lm.content like 'nx1:%' then '🔒 Encrypted message'
      when lm.hidden then '🙈 Hidden message'
      when lm.spoiler then '⚠️ Spoiler'
      when lm.content <> '' then lm.content
      else '📎 ' || coalesce(lm.attachment_name, 'Attachment')
    end,
    lm.author_id,
    (select cm2.user_id from public.conversation_members cm2
      where cm2.conversation_id = c.id and cm2.user_id <> auth.uid() limit 1),
    (select count(*)::int from public.conversation_members cm3 where cm3.conversation_id = c.id)
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid()
  left join lateral (
    select m.id, m.content, m.author_id, m.attachment_name, m.hidden, m.spoiler
    from public.messages m
    where m.conversation_id = c.id and m.deleted_at is null
    order by m.created_at desc
    limit 1
  ) lm on true
  where c.kind in ('dm', 'group')
  order by coalesce(c.last_message_at, c.created_at) desc;
$function$;

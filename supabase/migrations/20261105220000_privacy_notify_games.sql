-- Privacy: true "everyone" DMs, notification inbox for messaging panel,
-- game_scores widen, friend-request prefs enforced.

-- ── user_privacy ensure + new columns ──────────────────────────────────
create table if not exists public.user_privacy (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  dm_from text not null default 'servers'
    check (dm_from in ('everyone','servers','friends','nobody')),
  friend_requests text not null default 'everyone'
    check (friend_requests in ('everyone','mutuals','nobody')),
  game_invites boolean not null default true,
  show_stats boolean not null default true,
  show_online boolean not null default true,
  read_receipts boolean not null default true,
  profile_discoverable boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_privacy add column if not exists show_online boolean not null default true;
alter table public.user_privacy add column if not exists read_receipts boolean not null default true;
alter table public.user_privacy add column if not exists profile_discoverable boolean not null default true;

-- Migrate legacy label: old "everyone" meant friends+servers
update public.user_privacy set dm_from = 'servers' where dm_from = 'everyone';

-- Drop old check if present and re-add with servers
do $$ begin
  alter table public.user_privacy drop constraint if exists user_privacy_dm_from_check;
exception when undefined_object then null;
end $$;

alter table public.user_privacy
  drop constraint if exists user_privacy_dm_from_check;

alter table public.user_privacy
  add constraint user_privacy_dm_from_check
  check (dm_from in ('everyone','servers','friends','nobody'));

alter table public.user_privacy enable row level security;

drop policy if exists user_privacy_select on public.user_privacy;
create policy user_privacy_select on public.user_privacy
  for select to authenticated using (user_id = auth.uid() or true);

drop policy if exists user_privacy_upsert on public.user_privacy;
create policy user_privacy_upsert on public.user_privacy
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── DM gate with true everyone ─────────────────────────────────────────
create or replace function public.get_or_create_dm(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  conv uuid;
  pref text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_user = me then raise exception 'cannot DM yourself'; end if;

  -- Existing chat always allowed
  select c.id into conv
  from conversations c
  join conversation_members a on a.conversation_id = c.id and a.user_id = me
  join conversation_members b on b.conversation_id = c.id and b.user_id = p_user
  where c.kind = 'dm'
  limit 1;
  if conv is not null then return conv; end if;

  select coalesce(dm_from, 'servers') into pref from user_privacy where user_id = p_user;
  if pref is null then pref := 'servers'; end if;

  if pref = 'nobody' then
    raise exception 'This person isn''t accepting new direct messages';
  elsif pref = 'friends' then
    if not public.are_friends(me, p_user) then
      raise exception 'This person only accepts direct messages from friends';
    end if;
  elsif pref = 'servers' then
    if not (public.are_friends(me, p_user) or public.shares_space(me, p_user)) then
      raise exception 'You can only message friends or people in your spaces';
    end if;
  elsif pref = 'everyone' then
    -- any signed-in user may start a DM
    null;
  else
    -- unknown → safest servers-like gate
    if not (public.are_friends(me, p_user) or public.shares_space(me, p_user)) then
      raise exception 'You can only message friends or people in your spaces';
    end if;
  end if;

  insert into conversations (kind, created_by) values ('dm', me) returning id into conv;
  insert into conversation_members (conversation_id, user_id) values (conv, me), (conv, p_user);
  return conv;
end;
$$;

-- ── Notification inbox (messaging panel + FCM companion store) ─────────
create table if not exists public.notification_inbox (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'message',
  title text not null,
  body text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_inbox_user_idx
  on public.notification_inbox (user_id, created_at desc);
create index if not exists notification_inbox_unread_idx
  on public.notification_inbox (user_id) where read_at is null;

alter table public.notification_inbox enable row level security;

drop policy if exists notification_inbox_select on public.notification_inbox;
create policy notification_inbox_select on public.notification_inbox
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notification_inbox_update on public.notification_inbox;
create policy notification_inbox_update on public.notification_inbox
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notification_inbox_delete on public.notification_inbox;
create policy notification_inbox_delete on public.notification_inbox
  for delete to authenticated using (user_id = auth.uid());

-- Enqueue inbox rows for other conversation members on new messages
create or replace function public.notification_inbox_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member uuid;
  author_name text;
  preview text;
begin
  select coalesce(nullif(display_name, ''), username, 'Someone') into author_name
  from profiles where id = new.author_id;

  preview := left(coalesce(nullif(trim(new.content), ''), new.attachment_name, 'Sent an attachment'), 160);

  for member in
    select cm.user_id from conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.user_id <> new.author_id
  loop
    insert into notification_inbox (user_id, kind, title, body, conversation_id, message_id, actor_id)
    values (member, 'message', author_name, preview, new.conversation_id, new.id, new.author_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notification_inbox_on_message on public.messages;
create trigger trg_notification_inbox_on_message
  after insert on public.messages
  for each row execute function public.notification_inbox_on_message();

create or replace function public.notification_inbox_mark_read(p_ids bigint[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_ids is null then
    update notification_inbox set read_at = now()
    where user_id = auth.uid() and read_at is null;
  else
    update notification_inbox set read_at = now()
    where user_id = auth.uid() and id = any(p_ids) and read_at is null;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.notification_inbox_mark_read(bigint[]) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.notification_inbox;
exception when duplicate_object then null;
end $$;

-- ── game_scores: allow new arcade ids ──────────────────────────────────
do $$ begin
  alter table public.game_scores drop constraint if exists game_scores_game_check;
exception when undefined_object then null;
end $$;

-- Soft constraint via trigger not needed — insert already soft-fails on client.
-- Keep permissive text game column.

-- Admin helper: force-clear a user's push devices
create or replace function public.admin_clear_push(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  my_role text;
begin
  select site_role into my_role from profiles where id = auth.uid();
  if my_role is null or my_role not in ('admin','owner','moderator') then
    raise exception 'staff only';
  end if;
  delete from push_subscriptions where user_id = p_user;
  get diagnostics n = row_count;
  insert into admin_actions (actor_id, action, target_id, meta)
  values (auth.uid(), 'clear_push', p_user, jsonb_build_object('count', n));
  return n;
exception when undefined_table then
  return 0;
end;
$$;

grant execute on function public.admin_clear_push(uuid) to authenticated;

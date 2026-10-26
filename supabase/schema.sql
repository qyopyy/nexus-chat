-- =====================================================================
-- Nexus chat — Supabase schema
-- Run once in Supabase → SQL Editor (or `supabase db push` as a migration)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_.]{2,32}$'),
  display_name  text not null,
  avatar_color  text not null default '#5865F2',
  avatar_url    text,
  custom_status text,
  created_at    timestamptz not null default now()
);

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- "Spaces" = Discord servers
create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 64),
  icon_color  text not null default '#5865F2',
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_at  timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id  uuid not null references public.spaces (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index if not exists space_members_user_idx on public.space_members (user_id);

-- Every chat surface is a conversation: DMs, groups (Telegram), text + voice channels (Discord)
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('dm', 'group', 'text', 'voice')),
  name            text,
  space_id        uuid references public.spaces (id) on delete cascade,
  position        int not null default 0,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind in ('text', 'voice')) = (space_id is not null))
);
create index if not exists conversations_space_idx on public.conversations (space_id);

-- Membership for DMs and groups (space channels use space_members)
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  content         text not null default '' check (char_length(content) <= 4000),
  reply_to_id     uuid references public.messages (id) on delete set null,
  attachment_url  text,
  attachment_name text,
  attachment_type text,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at desc);

create table if not exists public.message_reactions (
  message_id      uuid not null references public.messages (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  emoji           text not null check (char_length(emoji) <= 16),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_conv_idx on public.message_reactions (conversation_id);

create table if not exists public.read_states (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

-- Ringing for DM / group calls
create table if not exists public.call_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  caller_id       uuid not null references public.profiles (id) on delete cascade,
  kind            text not null default 'ring' check (kind in ('ring', 'cancel', 'decline')),
  created_at      timestamptz not null default now()
);
create index if not exists call_events_conv_idx on public.call_events (conversation_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helper functions (security definer so RLS policies don't recurse)
-- ---------------------------------------------------------------------

create or replace function public.is_space_member(p_space uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_conversation_member(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conv and user_id = (select auth.uid())
  ) or exists (
    select 1 from public.conversations c
    join public.space_members sm on sm.space_id = c.space_id
    where c.id = p_conv and sm.user_id = (select auth.uid())
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  );
$$;

create or replace function public.shares_space(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.space_members x
    join public.space_members y on y.space_id = x.space_id
    where x.user_id = a and y.user_id = b
  );
$$;

-- ---------------------------------------------------------------------
-- New user → profile
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n int := 0;
  colors text[] := array['#5865F2','#3BA55D','#FAA61A','#ED4245','#EB459E','#2AABEE','#9B59B6','#1ABC9C'];
begin
  base := lower(regexp_replace(
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1), 'user'),
    '[^a-zA-Z0-9_.]', '', 'g'));
  if char_length(base) < 2 then base := 'user' || substr(replace(new.id::text, '-', ''), 1, 6); end if;
  base := substr(base, 1, 28);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_color)
  values (
    new.id,
    candidate,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), candidate),
    colors[1 + floor(random() * array_length(colors, 1))::int]
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep conversations.last_message_at fresh
create or replace function public.bump_last_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.bump_last_message();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

create or replace function public.send_friend_request(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  target uuid;
  existing public.friendships;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select id into target from public.profiles where username = lower(trim(p_username));
  if target is null then raise exception 'No user with that username'; end if;
  if target = me then raise exception 'You cannot add yourself'; end if;

  select * into existing from public.friendships
  where least(requester_id, addressee_id) = least(me, target)
    and greatest(requester_id, addressee_id) = greatest(me, target);

  if existing.id is not null then
    if existing.status = 'accepted' then return 'already_friends'; end if;
    if existing.addressee_id = me then
      update public.friendships set status = 'accepted' where id = existing.id;
      return 'accepted';
    end if;
    return 'already_pending';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, target);
  return 'sent';
end;
$$;

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted'
    where id = p_id and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships
    where id = p_id and (addressee_id = auth.uid() or requester_id = auth.uid());
  end if;
end;
$$;

create or replace function public.remove_friend(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.friendships
  where least(requester_id, addressee_id) = least(auth.uid(), p_user)
    and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_user);
$$;

create or replace function public.get_or_create_dm(p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_user = me then raise exception 'cannot DM yourself'; end if;
  if not (public.are_friends(me, p_user) or public.shares_space(me, p_user)) then
    raise exception 'You can only message friends or people in your spaces';
  end if;

  select c.id into conv
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = me
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = p_user
  where c.kind = 'dm'
  limit 1;

  if conv is null then
    insert into public.conversations (kind, created_by) values ('dm', me) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, p_user);
  end if;
  return conv;
end;
$$;

create or replace function public.create_group(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conv uuid;
  m uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.conversations (kind, name, created_by)
  values ('group', coalesce(nullif(trim(p_name), ''), 'New group'), me)
  returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, me);
  foreach m in array coalesce(p_members, array[]::uuid[]) loop
    if m <> me and public.are_friends(me, m) then
      insert into public.conversation_members (conversation_id, user_id) values (conv, m)
      on conflict do nothing;
    end if;
  end loop;
  return conv;
end;
$$;

create or replace function public.leave_conversation(p_conv uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = p_conv and cm.user_id = auth.uid()
    and c.id = cm.conversation_id and c.kind = 'group';
$$;

create or replace function public.create_space(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sid uuid;
  colors text[] := array['#5865F2','#3BA55D','#FAA61A','#ED4245','#EB459E','#2AABEE','#9B59B6','#1ABC9C'];
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.spaces (name, owner_id, icon_color)
  values (trim(p_name), me, colors[1 + floor(random() * array_length(colors, 1))::int])
  returning id into sid;
  insert into public.space_members (space_id, user_id, role) values (sid, me, 'owner');
  insert into public.conversations (kind, name, space_id, position, created_by) values
    ('text', 'general', sid, 0, me),
    ('text', 'random', sid, 1, me),
    ('voice', 'Lounge', sid, 0, me),
    ('voice', 'Gaming', sid, 1, me);
  return sid;
end;
$$;

create or replace function public.join_space(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into sid from public.spaces where invite_code = trim(p_code);
  if sid is null then raise exception 'Invite code not found'; end if;
  insert into public.space_members (space_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end;
$$;

create or replace function public.create_channel(p_space uuid, p_name text, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  if not exists (
    select 1 from public.space_members
    where space_id = p_space and user_id = auth.uid() and role in ('owner', 'admin')
  ) then
    raise exception 'Only owners/admins can create channels';
  end if;
  if p_kind not in ('text', 'voice') then raise exception 'bad kind'; end if;
  insert into public.conversations (kind, name, space_id, position, created_by)
  values (
    p_kind,
    case when p_kind = 'text' then lower(regexp_replace(trim(p_name), '\s+', '-', 'g')) else trim(p_name) end,
    p_space,
    coalesce((select max(position) + 1 from public.conversations where space_id = p_space and kind = p_kind), 0),
    auth.uid()
  )
  returning id into cid;
  return cid;
end;
$$;

-- Telegram-style chat list: DMs + groups with last message preview
create or replace function public.get_conversation_list()
returns table (
  id uuid,
  kind text,
  name text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message text,
  last_author_id uuid,
  other_user_id uuid,
  member_count int
)
language sql stable security definer set search_path = '' as $$
  select
    c.id, c.kind, c.name, c.created_at, c.last_message_at,
    case
      when lm.id is null then null
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
    select m.id, m.content, m.author_id, m.attachment_name
    from public.messages m
    where m.conversation_id = c.id and m.deleted_at is null
    order by m.created_at desc
    limit 1
  ) lm on true
  where c.kind in ('dm', 'group')
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

create or replace function public.get_unread_counts()
returns table (conversation_id uuid, unread int)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select c.id, coalesce(cm.joined_at, sm.joined_at) as joined
    from public.conversations c
    left join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid()
    left join public.space_members sm on sm.space_id = c.space_id and sm.user_id = auth.uid()
    where cm.user_id is not null or sm.user_id is not null
  )
  select mine.id, count(m.id)::int
  from mine
  join public.messages m on m.conversation_id = mine.id
  left join public.read_states rs on rs.conversation_id = mine.id and rs.user_id = auth.uid()
  where m.author_id <> auth.uid()
    and m.deleted_at is null
    and m.created_at > coalesce(rs.last_read_at, mine.joined)
  group by mine.id;
$$;

create or replace function public.mark_read(p_conv uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.read_states (user_id, conversation_id, last_read_at)
  select auth.uid(), p_conv, now()
  where public.is_conversation_member(p_conv)
  on conflict (user_id, conversation_id) do update set last_read_at = excluded.last_read_at;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.friendships          enable row level security;
alter table public.spaces               enable row level security;
alter table public.space_members        enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.message_reactions    enable row level security;
alter table public.read_states          enable row level security;
alter table public.call_events          enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "friendships own" on public.friendships;
create policy "friendships own" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

drop policy if exists "spaces members read" on public.spaces;
create policy "spaces members read" on public.spaces for select to authenticated
  using (public.is_space_member(id));
drop policy if exists "spaces owner update" on public.spaces;
create policy "spaces owner update" on public.spaces for update to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists "spaces owner delete" on public.spaces;
create policy "spaces owner delete" on public.spaces for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "space_members read" on public.space_members;
create policy "space_members read" on public.space_members for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists "space_members leave" on public.space_members;
create policy "space_members leave" on public.space_members for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'owner');

drop policy if exists "conversations read" on public.conversations;
create policy "conversations read" on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
drop policy if exists "conversations rename group" on public.conversations;
create policy "conversations rename group" on public.conversations for update to authenticated
  using (kind = 'group' and public.is_conversation_member(id));

drop policy if exists "conversation_members read" on public.conversation_members;
create policy "conversation_members read" on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_conversation_member(conversation_id));
drop policy if exists "messages own update" on public.messages;
create policy "messages own update" on public.messages for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

drop policy if exists "reactions read" on public.message_reactions;
create policy "reactions read" on public.message_reactions for select to authenticated
  using (public.is_conversation_member(conversation_id));
drop policy if exists "reactions insert" on public.message_reactions;
create policy "reactions insert" on public.message_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_conversation_member(conversation_id));
drop policy if exists "reactions delete" on public.message_reactions;
create policy "reactions delete" on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "read_states own" on public.read_states;
create policy "read_states own" on public.read_states for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "call_events read" on public.call_events;
create policy "call_events read" on public.call_events for select to authenticated
  using (public.is_conversation_member(conversation_id));
drop policy if exists "call_events insert" on public.call_events;
create policy "call_events insert" on public.call_events for insert to authenticated
  with check (caller_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

-- ---------------------------------------------------------------------
-- Realtime: postgres_changes publication
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['messages','message_reactions','call_events','friendships','conversations','conversation_members','space_members','profiles'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Realtime Authorization: private broadcast/presence channels
--   online        → global presence (who's online, who's in which voice channel)
--   chat:<uuid>   → typing indicators
--   call:<uuid>   → WebRTC signaling for a call
-- ---------------------------------------------------------------------

create or replace function public.can_access_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_topic = 'online' then return true; end if;
  if p_topic like 'call:%' or p_topic like 'chat:%' then
    begin
      v_id := split_part(p_topic, ':', 2)::uuid;
    exception when others then
      return false;
    end;
    return public.is_conversation_member(v_id);
  end if;
  return false;
end;
$$;

drop policy if exists "app topics read" on realtime.messages;
create policy "app topics read" on realtime.messages for select to authenticated
  using (public.can_access_topic((select realtime.topic())));

drop policy if exists "app topics write" on realtime.messages;
create policy "app topics write" on realtime.messages for insert to authenticated
  with check (public.can_access_topic((select realtime.topic())));

-- ---------------------------------------------------------------------
-- Storage: attachments + avatars
-- Paths: attachments/<conversation_id>/<uuid>-<filename>, avatars/<user_id>/<file>
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', true, 562144000), ('avatars', 'avatars', true, 5242880)
on conflict (id) do nothing;

drop policy if exists "attachments upload" on storage.objects;
create policy "attachments upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "avatars upload" on storage.objects;
create policy "avatars upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars update" on storage.objects;
create policy "avatars update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Lock down RPC execution to signed-in users
revoke execute on all functions in schema public from anon;

-- Blocking users · purge a user's recent messages

-- ───────────── blocking ─────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select, delete on public.user_blocks to authenticated;
create policy "own blocks read" on public.user_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "own blocks delete" on public.user_blocks for delete to authenticated using (blocker_id = (select auth.uid()));

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;

-- block: also ends any friendship / pending request between you
create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_user is null or p_user = me then raise exception 'You can''t block yourself'; end if;
  if public.rank_of(p_user) >= 2 then raise exception 'Staff accounts can''t be blocked — report the message instead'; end if;
  if (select count(*) from public.user_blocks where blocker_id = me) >= 1000 then raise exception 'You can block up to 1,000 people'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;
  delete from public.friendships
  where least(requester_id, addressee_id) = least(me, p_user) and greatest(requester_id, addressee_id) = greatest(me, p_user);
end $$;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated, service_role;

-- no new DMs, no messages in an existing DM, no friend requests while either side has blocked the other
create or replace function public.enforce_dm_blocks()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  if not exists (select 1 from public.user_blocks where blocker_id = new.author_id or blocked_id = new.author_id) then return new; end if;
  select m.user_id into other
  from public.conversations c join public.conversation_members m on m.conversation_id = c.id and m.user_id <> new.author_id
  where c.id = new.conversation_id and c.kind = 'dm' limit 1;
  if other is not null and public.is_blocked_between(new.author_id, other) then
    raise exception 'You can''t message this person';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_dm_blocks() from public, anon, authenticated;
drop trigger if exists messages_dm_blocks on public.messages;
create trigger messages_dm_blocks before insert on public.messages for each row execute function public.enforce_dm_blocks();

create or replace function public.enforce_friend_blocks()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_blocked_between(new.requester_id, new.addressee_id) then
    raise exception 'This person isn''t accepting friend requests';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_friend_blocks() from public, anon, authenticated;
drop trigger if exists friendships_blocks on public.friendships;
create trigger friendships_blocks before insert on public.friendships for each row execute function public.enforce_friend_blocks();

create or replace function public.enforce_new_dm_blocks()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k text; creator uuid;
begin
  select kind, created_by into k, creator from public.conversations where id = new.conversation_id;
  if k = 'dm' and creator is not null and new.user_id <> creator and public.is_blocked_between(creator, new.user_id) then
    raise exception 'You can''t message this person';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_new_dm_blocks() from public, anon, authenticated;
drop trigger if exists conversation_members_dm_blocks on public.conversation_members;
create trigger conversation_members_dm_blocks before insert on public.conversation_members for each row execute function public.enforce_new_dm_blocks();

-- ───────────── purge a user's recent messages (spam / raids) ─────────────
create or replace function public.admin_purge_user_messages(p_user uuid, p_hours int)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; h int := greatest(1, least(coalesce(p_hours, 24), 24 * 30));
begin
  perform public.assert_can_moderate(p_user, 2);
  if p_user = auth.uid() then raise exception 'Use this on other accounts'; end if;
  update public.messages set deleted_at = now()
  where author_id = p_user and deleted_at is null and created_at >= now() - make_interval(hours => h);
  get diagnostics n = row_count;
  perform public.log_admin(p_user, 'purge_messages', jsonb_build_object('hours', h, 'count', n));
  return n;
end $$;
revoke execute on function public.admin_purge_user_messages(uuid, int) from public, anon;
grant execute on function public.admin_purge_user_messages(uuid, int) to authenticated, service_role;

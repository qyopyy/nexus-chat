-- Chat polls. The composer and poll card already exist; these tables are what they read.
-- Scheduled messages already ship in 20261107120000_community_features.sql.

create table if not exists public.polls (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  author_id        uuid not null references public.profiles (id) on delete cascade,
  question         text not null check (char_length(question) between 1 and 200),
  options          jsonb not null,
  multi            boolean not null default false,
  closes_at        timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists polls_conversation_idx on public.polls (conversation_id, created_at desc);

create table if not exists public.poll_votes (
  poll_id     uuid not null references public.polls (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  option      int not null check (option >= 0 and option < 12),
  created_at  timestamptz not null default now(),
  primary key (poll_id, user_id, option)
);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
revoke all on public.polls from anon, authenticated;
revoke all on public.poll_votes from anon, authenticated;
grant select, insert, update on public.polls to authenticated;
grant select, insert, delete on public.poll_votes to authenticated;

drop policy if exists polls_member_read on public.polls;
create policy polls_member_read on public.polls
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists polls_member_insert on public.polls;
create policy polls_member_insert on public.polls
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

drop policy if exists polls_author_close on public.polls;
create policy polls_author_close on public.polls
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists poll_votes_read on public.poll_votes;
create policy poll_votes_read on public.poll_votes
  for select to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_id and public.is_conversation_member(p.conversation_id)
    )
  );

drop policy if exists poll_votes_insert on public.poll_votes;
create policy poll_votes_insert on public.poll_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.polls p
      where p.id = poll_id
        and public.is_conversation_member(p.conversation_id)
        and (p.closes_at is null or p.closes_at > now())
        and option < jsonb_array_length(p.options)
    )
  );

drop policy if exists poll_votes_delete on public.poll_votes;
create policy poll_votes_delete on public.poll_votes
  for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.polls_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.options) is distinct from 'array'
     or jsonb_array_length(new.options) < 2
     or jsonb_array_length(new.options) > 10 then
    raise exception 'Add between 2 and 10 options';
  end if;
  if tg_op = 'UPDATE' then
    if new.question is distinct from old.question
       or new.options is distinct from old.options
       or new.multi is distinct from old.multi
       or new.author_id is distinct from old.author_id
       or new.conversation_id is distinct from old.conversation_id then
      raise exception 'Only the close time can change';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists polls_guard on public.polls;
create trigger polls_guard
  before insert or update on public.polls
  for each row execute function public.polls_guard();

create or replace function public.poll_votes_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  multi boolean;
begin
  select p.multi into multi from public.polls p where p.id = new.poll_id;
  if multi is not true then
    delete from public.poll_votes
    where poll_id = new.poll_id and user_id = new.user_id and option is distinct from new.option;
  end if;
  return new;
end;
$$;

drop trigger if exists poll_votes_guard on public.poll_votes;
create trigger poll_votes_guard
  before insert on public.poll_votes
  for each row execute function public.poll_votes_guard();

alter table public.poll_votes replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.polls;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null; when undefined_object then null;
end $$;

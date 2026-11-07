-- Scheduled messages · status auto-clear · server onboarding (auto-roles, welcome post, level rewards) · release countdown

-- ───────────── scheduled messages ─────────────
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  content text not null check (char_length(content) between 1 and 4000),
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  message_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_messages_due_idx on public.scheduled_messages (send_at) where status = 'pending';
create index if not exists scheduled_messages_author_idx on public.scheduled_messages (author_id, conversation_id);
create index if not exists scheduled_messages_conv_fk_idx on public.scheduled_messages (conversation_id);
alter table public.scheduled_messages enable row level security;
revoke all on public.scheduled_messages from anon, authenticated;
grant select, delete on public.scheduled_messages to authenticated;
create policy "own scheduled read" on public.scheduled_messages for select to authenticated using (author_id = (select auth.uid()));
create policy "own scheduled cancel" on public.scheduled_messages for delete to authenticated using (author_id = (select auth.uid()) and status <> 'sent');

create or replace function public.schedule_message(p_conversation uuid, p_content text, p_send_at timestamptz)
returns public.scheduled_messages language plpgsql security definer set search_path = '' as $$
declare r public.scheduled_messages; c text := btrim(coalesce(p_content, ''));
begin
  if auth.uid() is null or public.is_banned() or public.is_muted() then raise exception 'You can''t send messages right now'; end if;
  if not public.is_conversation_member(p_conversation) then raise exception 'You''re not in that chat'; end if;
  if c = '' then raise exception 'Write a message first'; end if;
  if p_send_at < now() + interval '1 minute' then raise exception 'Pick a time at least a minute from now'; end if;
  if p_send_at > now() + interval '90 days' then raise exception 'You can schedule up to 90 days ahead'; end if;
  if (select count(*) from public.scheduled_messages where author_id = auth.uid() and status = 'pending') >= 50 then
    raise exception 'You already have 50 scheduled messages';
  end if;
  insert into public.scheduled_messages (conversation_id, author_id, content, send_at)
  values (p_conversation, auth.uid(), left(c, 4000), p_send_at) returning * into r;
  return r;
end $$;
revoke execute on function public.schedule_message(uuid, text, timestamptz) from public, anon;
grant execute on function public.schedule_message(uuid, text, timestamptz) to authenticated, service_role;

-- ───────────── status auto-clear ─────────────
alter table public.profiles add column if not exists status_until timestamptz;

-- runs every minute: sends due scheduled messages (as their author, so chat rules + AutoMod still apply)
-- and clears custom statuses that have expired
create or replace function public.run_minutely_jobs()
returns void language plpgsql set search_path = '' as $$
declare r record; mid uuid;
begin
  for r in
    select * from public.scheduled_messages where status = 'pending' and send_at <= now()
    order by send_at limit 200 for update skip locked
  loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', r.author_id, 'role', 'authenticated')::text, true);
      if not public.is_conversation_member(r.conversation_id) then raise exception 'You''re no longer in that chat'; end if;
      if public.is_banned() or public.is_muted() then raise exception 'Your account can''t send messages right now'; end if;
      insert into public.messages (conversation_id, author_id, content) values (r.conversation_id, r.author_id, r.content) returning id into mid;
      update public.scheduled_messages set status = 'sent', message_id = mid, error = null where id = r.id;
    exception when others then
      update public.scheduled_messages set status = 'failed', error = left(sqlerrm, 200) where id = r.id;
    end;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set custom_status = null, status_until = null where status_until is not null and status_until <= now();
end $$;
revoke execute on function public.run_minutely_jobs() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('nexus-minutely-jobs');
exception when others then null;
end $$;
select cron.schedule('nexus-minutely-jobs', '* * * * *', 'select public.run_minutely_jobs()');

-- ───────────── server onboarding ─────────────
create table if not exists public.space_onboarding (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  enabled boolean not null default true,
  auto_roles uuid[] not null default '{}',
  welcome_channel uuid references public.conversations(id) on delete set null,
  welcome_text text check (char_length(welcome_text) <= 1000),
  level_rewards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists space_onboarding_channel_fk_idx on public.space_onboarding (welcome_channel);
alter table public.space_onboarding enable row level security;
revoke all on public.space_onboarding from anon, authenticated;
grant select, insert, update, delete on public.space_onboarding to authenticated;
create policy "onboarding staff read" on public.space_onboarding for select to authenticated using (public.is_space_staff(space_id));
create policy "onboarding staff insert" on public.space_onboarding for insert to authenticated with check (public.is_space_staff(space_id));
create policy "onboarding staff update" on public.space_onboarding for update to authenticated using (public.is_space_staff(space_id)) with check (public.is_space_staff(space_id));
create policy "onboarding staff delete" on public.space_onboarding for delete to authenticated using (public.is_space_staff(space_id));

create or replace function public.onboarding_on_join()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cfg public.space_onboarding; sp public.spaces; uname text; n int; txt text;
begin
  select * into cfg from public.space_onboarding where space_id = new.space_id and enabled;
  if not found then return new; end if;
  -- auto roles (only roles of this server)
  insert into public.space_member_roles (space_id, user_id, role_id)
  select new.space_id, new.user_id, r.id from public.space_roles r where r.space_id = new.space_id and r.id = any(cfg.auto_roles)
  on conflict do nothing;
  -- welcome post
  if cfg.welcome_channel is not null and coalesce(cfg.welcome_text, '') <> '' then
    begin
      select * into sp from public.spaces where id = new.space_id;
      select username into uname from public.profiles where id = new.user_id;
      select count(*) into n from public.space_members where space_id = new.space_id;
      txt := replace(replace(replace(cfg.welcome_text, '{user}', '@' || coalesce(uname, 'someone')), '{server}', coalesce(sp.name, 'the server')), '{count}', n::text);
      if exists (select 1 from public.conversations c where c.id = cfg.welcome_channel and c.space_id = new.space_id) then
        perform set_config('nexus.admin_write', 'on', true);
        insert into public.messages (conversation_id, author_id, content, bot_name) values (cfg.welcome_channel, sp.owner_id, left(txt, 2000), 'Welcome');
        perform set_config('nexus.admin_write', 'off', true);
      end if;
    exception when others then
      perform set_config('nexus.admin_write', 'off', true); -- a failed welcome post never blocks joining
    end;
  end if;
  return new;
end $$;
revoke execute on function public.onboarding_on_join() from public, anon, authenticated;
drop trigger if exists space_members_onboarding on public.space_members;
create trigger space_members_onboarding after insert on public.space_members for each row execute function public.onboarding_on_join();

-- level-up role rewards: level = floor(sqrt(xp / 50)) (same curve as the app)
create or replace function public.level_rewards_on_xp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lvl int := floor(sqrt(greatest(new.xp, 0) / 50.0)); old_lvl int := case when tg_op = 'UPDATE' then floor(sqrt(greatest(old.xp, 0) / 50.0)) else -1 end; rw jsonb;
begin
  if lvl <= old_lvl then return new; end if;
  select level_rewards into rw from public.space_onboarding where space_id = new.space_id and enabled;
  if rw is null or jsonb_array_length(rw) = 0 then return new; end if;
  insert into public.space_member_roles (space_id, user_id, role_id)
  select new.space_id, new.user_id, r.id
  from jsonb_array_elements(rw) e
  join public.space_roles r on r.space_id = new.space_id and r.id::text = e ->> 'role_id'
  where (e ->> 'level')::int <= lvl
  on conflict do nothing;
  return new;
end $$;
revoke execute on function public.level_rewards_on_xp() from public, anon, authenticated;
drop trigger if exists space_xp_level_rewards on public.space_xp;
create trigger space_xp_level_rewards after insert or update of xp on public.space_xp for each row execute function public.level_rewards_on_xp();

-- ───────────── release countdown on profiles ─────────────
create or replace function public.upcoming_release(p_user uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('title', r.title, 'artist', r.primary_artist_name, 'release_date', r.release_date, 'type', r.release_type,
                           'link', (select s.slug from public.smart_links s where s.release_id = r.id and s.enabled limit 1))
  from public.dist_releases r
  where r.owner_id = p_user and r.status <> 'draft' and r.release_date is not null
    and r.release_date >= current_date and r.release_date <= current_date + 180
  order by r.release_date limit 1;
$$;
revoke execute on function public.upcoming_release(uuid) from public;
grant execute on function public.upcoming_release(uuid) to anon, authenticated, service_role;

-- Hidden ("invisible ink") and spoiler messages · more profile connections · realtime app-update signal

-- ───────────── message flags ─────────────
alter table public.messages add column if not exists hidden boolean not null default false;
alter table public.messages add column if not exists spoiler boolean not null default false;

-- ───────────── profile connections: 10 → 30 links ─────────────
alter table public.profiles drop constraint if exists profiles_links_check;
alter table public.profiles add constraint profiles_links_check check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 30) not valid;
alter table public.profiles validate constraint profiles_links_check;

-- ───────────── realtime "new version is live" signal ─────────────
-- The first client that loads a new deploy (or the Vercel deploy webhook) announces the build id;
-- every open app hears it over Supabase Realtime and re-checks /api/version, so updates land in seconds.
create table if not exists public.app_releases (
  build text primary key check (char_length(build) between 3 and 64 and build ~ '^[A-Za-z0-9._-]+$'),
  source text not null default 'client' check (source in ('client', 'vercel')),
  created_at timestamptz not null default now()
);
alter table public.app_releases enable row level security;
revoke all on public.app_releases from anon, authenticated;
grant select on public.app_releases to anon, authenticated;
create policy "releases are public" on public.app_releases for select to anon, authenticated using (true);

create or replace function public.announce_release(p_build text, p_source text default 'client')
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_build is null or char_length(p_build) not between 3 and 64 or p_build !~ '^[A-Za-z0-9._-]+$' then return false; end if;
  -- clients double-check /api/version before reloading, so a bogus id is harmless; still cap churn
  if (select count(*) from public.app_releases where created_at > now() - interval '1 hour') >= 30 then return false; end if;
  insert into public.app_releases (build, source) values (p_build, case when p_source = 'vercel' then 'vercel' else 'client' end)
  on conflict (build) do nothing;
  get diagnostics n = row_count;
  delete from public.app_releases where created_at < now() - interval '30 days';
  return n > 0;
end $$;
revoke execute on function public.announce_release(text, text) from public;
grant execute on function public.announce_release(text, text) to anon, authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.app_releases;
exception when duplicate_object then null;
end $$;

-- in-app notification inbox never shows the text of hidden / spoiler messages
create or replace function public.notification_inbox_on_message()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare member uuid; author_name text; preview text;
begin
  select coalesce(nullif(display_name, ''), username, 'Someone') into author_name from profiles where id = new.author_id;
  preview := case
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

-- chat list shows "Hidden message" / "Spoiler" instead of the text
create or replace function public.get_conversation_list()
returns table(id uuid, kind text, name text, created_at timestamptz, last_message_at timestamptz, last_message text, last_author_id uuid, other_user_id uuid, member_count integer)
language sql stable security definer set search_path to '' as $function$
  select
    c.id, c.kind, c.name, c.created_at, c.last_message_at,
    case
      when lm.id is null then null
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

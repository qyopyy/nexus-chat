-- Follow artists → Nexus Bot DMs you when they drop a new release on Spotify.
-- Uses the existing artist_watch list. A pg_cron job asks the `spotify` edge function (via pg_net) for each
-- followed artist's latest releases about every 15 minutes and messages followers about anything new.

alter table public.artist_watch add column if not exists notify boolean not null default true;
create index if not exists artist_watch_spotify_idx on public.artist_watch (spotify_id) where active and notify;

-- one row per followed artist: when it was last checked and whether its back catalog is already known
create table if not exists public.artist_release_state (
  spotify_id text primary key,
  baselined boolean not null default false,
  last_checked timestamptz
);
-- every release we've already seen for an artist (so only *new* ones notify)
create table if not exists public.artist_release_seen (
  spotify_id text not null,
  release_id text not null,
  name text,
  release_date text,
  seen_at timestamptz not null default now(),
  primary key (spotify_id, release_id)
);
-- in-flight pg_net requests
create table if not exists public.artist_release_requests (
  request_id bigint primary key,
  artist_ids text[] not null,
  created_at timestamptz not null default now()
);
-- endpoint + public anon key for the spotify function (the anon key is public — it ships in the web app)
create table if not exists public.artist_release_config (
  id int primary key default 1 check (id = 1),
  function_url text not null,
  anon_key text not null
);
alter table public.artist_release_state enable row level security;
alter table public.artist_release_seen enable row level security;
alter table public.artist_release_requests enable row level security;
alter table public.artist_release_config enable row level security;
revoke all on public.artist_release_state, public.artist_release_seen, public.artist_release_requests, public.artist_release_config from anon, authenticated;
insert into public.artist_release_config (id, function_url, anon_key) values (1,
  'https://fcnabeudhdlugruqzezn.supabase.co/functions/v1/spotify',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmFiZXVkaGRsdWdydXF6ZXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NTQ4NDcsImV4cCI6MjEwODMzMDg0N30.R-ZVERcUM9DIGeVk_jSGP9IL0KRzWTfDbWEWFryqTgk')
on conflict (id) do update set function_url = excluded.function_url, anon_key = excluded.anon_key;

-- members can unfollow (delete) their own rows too
do $$ begin
  create policy "watch own delete" on public.artist_watch for delete to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;
grant delete on public.artist_watch to authenticated;

-- Nexus Bot ⇄ member DM (created on first alert)
create or replace function public.nexus_bot_dm(p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bot constant uuid := '00000000-0000-4000-8000-00000000b001'; conv uuid;
begin
  select c.id into conv from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = bot
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = p_user
  where c.kind = 'dm' limit 1;
  if conv is not null then return conv; end if;
  insert into public.conversations (kind, created_by) values ('dm', bot) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, bot), (conv, p_user);
  return conv;
end $$;
revoke execute on function public.nexus_bot_dm(uuid) from public, anon, authenticated;

create or replace function public.artist_release_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  cfg public.artist_release_config;
  req record; resp record; rel jsonb; art jsonb; f record;
  ids text[]; rid bigint; batch int := 0; conv uuid; inserted int; is_new boolean;
  bot constant uuid := '00000000-0000-4000-8000-00000000b001';
begin
  select * into cfg from public.artist_release_config where id = 1;
  if cfg is null then return; end if;

  -- keep state rows in sync with who's followed
  insert into public.artist_release_state (spotify_id)
  select distinct spotify_id from public.artist_watch where active and notify
  on conflict do nothing;

  -- 1) read finished responses
  for req in select * from public.artist_release_requests order by created_at loop
    select status_code, content into resp from net._http_response where id = req.request_id;
    if not found then
      if req.created_at < now() - interval '10 minutes' then delete from public.artist_release_requests where request_id = req.request_id; end if;
      continue;
    end if;
    if resp.status_code = 200 then
      for rel in select * from jsonb_array_elements(coalesce((resp.content::jsonb) -> 'releases', '[]'::jsonb)) loop
        for art in select * from jsonb_array_elements(coalesce(rel -> 'artists', '[]'::jsonb)) loop
          if not ((art ->> 'id') = any(req.artist_ids)) then continue; end if;
          insert into public.artist_release_seen (spotify_id, release_id, name, release_date)
          values (art ->> 'id', rel ->> 'id', left(rel ->> 'name', 200), rel ->> 'release_date')
          on conflict do nothing;
          get diagnostics inserted = row_count;
          is_new := inserted > 0
            and coalesce((select baselined from public.artist_release_state where spotify_id = art ->> 'id'), false)
            and coalesce(rel ->> 'release_date', '') >= to_char(current_date - 21, 'YYYY-MM-DD');
          if not is_new then continue; end if;
          -- DM every follower who wants alerts
          for f in select w.user_id, w.name from public.artist_watch w
                   where w.spotify_id = art ->> 'id' and w.active and w.notify
                     and not exists (select 1 from public.profiles p where p.id = w.user_id and p.banned_until > now()) loop
            begin
              conv := public.nexus_bot_dm(f.user_id);
              perform set_config('nexus.admin_write', 'on', true);
              insert into public.messages (conversation_id, author_id, content, bot_name)
              values (conv, bot,
                left(format(E'🎵 New %s from **%s**: **%s**%s\n%s',
                  case when rel ->> 'type' = 'album' then 'album' when rel ->> 'type' = 'compilation' then 'compilation' else 'single' end,
                  coalesce(art ->> 'name', f.name), rel ->> 'name',
                  case when coalesce((rel ->> 'total_tracks')::int, 0) > 1 then format(' · %s tracks', rel ->> 'total_tracks') else '' end,
                  coalesce(rel ->> 'url', 'https://open.spotify.com/album/' || (rel ->> 'id'))), 1000),
                'Nexus Bot');
              perform set_config('nexus.admin_write', 'off', true);
            exception when others then
              perform set_config('nexus.admin_write', 'off', true);
            end;
          end loop;
        end loop;
      end loop;
      update public.artist_release_state set baselined = true where spotify_id = any(req.artist_ids);
    end if;
    delete from public.artist_release_requests where request_id = req.request_id;
  end loop;

  -- 2) ask for the next batches (25 artists per call, up to 4 calls per run)
  loop
    exit when batch >= 4;
    select array_agg(spotify_id) into ids from (
      select s.spotify_id from public.artist_release_state s
      where exists (select 1 from public.artist_watch w where w.spotify_id = s.spotify_id and w.active and w.notify)
        and (s.last_checked is null or s.last_checked < now() - interval '15 minutes')
        and not exists (select 1 from public.artist_release_requests r where s.spotify_id = any(r.artist_ids))
      order by s.last_checked nulls first limit 25
    ) x;
    exit when ids is null;
    select net.http_post(
      url := cfg.function_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cfg.anon_key),
      body := jsonb_build_object('action', 'releases', 'ids', to_jsonb(ids)),
      timeout_milliseconds := 30000) into rid;
    insert into public.artist_release_requests (request_id, artist_ids) values (rid, ids);
    update public.artist_release_state set last_checked = now() where spotify_id = any(ids);
    batch := batch + 1;
  end loop;

  delete from public.artist_release_seen where seen_at < now() - interval '400 days';
end $$;
revoke execute on function public.artist_release_tick() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('nexus-artist-releases');
exception when others then null;
end $$;
select cron.schedule('nexus-artist-releases', '*/10 * * * *', 'select public.artist_release_tick()');

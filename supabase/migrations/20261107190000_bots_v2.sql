-- Nexus bots v2: shared game state + three new bots (Utility, Games, Stats) + refreshed bios

create table if not exists public.bot_state (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind text not null check (kind in ('trivia', 'guess', 'riddle')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, kind)
);
alter table public.bot_state enable row level security;
revoke all on public.bot_state from anon, authenticated; -- only the bots function (service role) touches it

-- bot accounts can't sign in (no password, "bot" provider) — same shape as the existing six
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-00000000b007', 'authenticated', 'authenticated', 'utilitybot@bots.nexus.invalid', '',
   '{"provider":"bot","providers":["bot"]}', '{"username":"utilitybot","display_name":"Utility Bot"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-00000000b008', 'authenticated', 'authenticated', 'gamebot@bots.nexus.invalid', '',
   '{"provider":"bot","providers":["bot"]}', '{"username":"gamebot","display_name":"Game Bot"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-00000000b009', 'authenticated', 'authenticated', 'statsbot@bots.nexus.invalid', '',
   '{"provider":"bot","providers":["bot"]}', '{"username":"statsbot","display_name":"Stats Bot"}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, display_name, avatar_color, bio, is_bot)
values
  ('00000000-0000-4000-8000-00000000b007', 'utilitybot', 'Utility Bot', '#00A8FC', 'Tools: /calc /time /weather /define /remind /qr', true),
  ('00000000-0000-4000-8000-00000000b008', 'gamebot', 'Game Bot', '#F23F43', 'Chat games: /guess /wyr /truth /dare /riddle /slots', true),
  ('00000000-0000-4000-8000-00000000b009', 'statsbot', 'Stats Bot', '#FAA61A', 'Chat stats: /stats /top /userinfo', true)
on conflict (id) do update set username = excluded.username, display_name = excluded.display_name, avatar_color = excluded.avatar_color, bio = excluded.bio, is_bot = true;

update public.profiles set bio = case id
  when '00000000-0000-4000-8000-00000000b001' then 'Type /help in any chat · sends your new-release alerts'
  when '00000000-0000-4000-8000-00000000b003' then 'Music: /isrc /song /upc /newreleases /follow /following /unfollow'
  when '00000000-0000-4000-8000-00000000b004' then 'Fun: /joke /fact /rps /rate /ship'
  when '00000000-0000-4000-8000-00000000b005' then 'Trivia night: /trivia /answer — 20+ questions'
  when '00000000-0000-4000-8000-00000000b006' then 'Spotify: /spotify /track /album /artist'
  when '00000000-0000-4000-8000-00000000b002' then 'Premium plans & receipts: /premium /orders'
  else bio end
where id in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000b003',
             '00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-00000000b005', '00000000-0000-4000-8000-00000000b006');

-- bot directory (Bots panel / public bot pages)
create or replace function public.list_public_bots()
returns json language plpgsql security definer set search_path to '' as $function$
declare community json;
begin
  select coalesce(json_agg(json_build_object('kind', 'community', 'id', b.id, 'slug', b.slug, 'name', b.name, 'description', b.description,
    'color', b.color, 'avatar_url', b.avatar_url, 'commands', b.commands, 'uses', b.uses) order by b.created_at desc), '[]'::json)
  into community from public.community_bots b where b.public = true;
  return json_build_object(
    'system', json_build_array(
      json_build_object('kind','system','key','nexus','slug','nexusbot','name','Nexus Bot','description','Dice, 8-ball, choose-one — and your new-release alerts.','color','#5865F2','commands', json_build_array('/help','/roll','/flip','/8ball','/choose')),
      json_build_object('kind','system','key','utility','slug','utilitybot','name','Utility Bot','description','Calculator, world clock, weather, dictionary, reminders and QR codes.','color','#00A8FC','commands', json_build_array('/calc','/time','/weather','/define','/remind','/qr')),
      json_build_object('kind','system','key','games','slug','gamebot','name','Game Bot','description','Number guessing, would-you-rather, truth or dare, riddles and slots.','color','#F23F43','commands', json_build_array('/guess','/wyr','/truth','/dare','/riddle','/reveal','/slots')),
      json_build_object('kind','system','key','stats','slug','statsbot','name','Stats Bot','description','Message counts, top chatters this week and user info.','color','#FAA61A','commands', json_build_array('/stats','/top','/userinfo')),
      json_build_object('kind','system','key','music','slug','musicbot','name','Music Bot','description','ISRCs, track & UPC lookup, new releases and artist follows with release alerts.','color','#EB459E','commands', json_build_array('/isrc','/song','/upc','/newreleases','/follow','/following','/unfollow')),
      json_build_object('kind','system','key','spotify','slug','spotifybot','name','Spotify Bot','description','Search Spotify tracks, albums, and artists.','color','#1DB954','commands', json_build_array('/spotify','/track','/album','/artist')),
      json_build_object('kind','system','key','fun','slug','funbot','name','Fun Bot','description','Jokes, facts, rock-paper-scissors, rates & ships.','color','#FEE75C','commands', json_build_array('/joke','/fact','/rps','/rate','/ship')),
      json_build_object('kind','system','key','trivia','slug','triviabot','name','Trivia Bot','description','20+ music & general trivia questions.','color','#57F287','commands', json_build_array('/trivia','/answer')),
      json_build_object('kind','system','key','orders','slug','orderbot','name','Order Bot','description','Premium plans and your order status.','color','#3BA55D','commands', json_build_array('/premium','/orders'))
    ),
    'community', community);
end;
$function$;

-- servers can install the new system bots
alter table public.space_bot_installs drop constraint if exists space_bot_installs_system_key_check;
alter table public.space_bot_installs add constraint space_bot_installs_system_key_check check (system_key is null or system_key = any (array['nexus','music','orders','fun','trivia','spotify','utility','games','stats']));

-- every upload bucket allows at least 1 GB (attachments & gram stay at 5 GB)
update storage.buckets set file_size_limit = 1073741824
where id in ('artist-media', 'avatars', 'linkbio-music', 'nexus-radio', 'sounds', 'space-music', 'video-thumbs')
  and (file_size_limit is null or file_size_limit < 1073741824);

-- Profile Defender: up to 50 artist profiles for everyone
create or replace function public.defender_limit(p_tier integer)
returns integer language sql immutable set search_path to '' as $$ select 50; $$;

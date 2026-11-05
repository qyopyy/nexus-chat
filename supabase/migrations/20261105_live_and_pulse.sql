-- Nexus Live (Twitch-like) + Pulse (Twitter-like)

create table if not exists public.live_streams (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles (id) on delete cascade,
  title         text not null default 'Live' check (char_length(title) between 1 and 120),
  category      text not null default 'Just Chatting' check (char_length(category) <= 60),
  quality       text not null default '1080p30' check (quality in ('720p30','1080p30','1080p60','1440p30','2160p30','source')),
  source        text not null default 'camera' check (source in ('camera','screen','both')),
  status        text not null default 'live' check (status in ('live','ended')),
  viewer_peak   int not null default 0,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists live_streams_live_idx on public.live_streams (status, started_at desc);

create table if not exists public.live_chat (
  id            bigserial primary key,
  stream_id     uuid not null references public.live_streams (id) on delete cascade,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 500),
  created_at    timestamptz not null default now()
);
create index if not exists live_chat_stream_idx on public.live_chat (stream_id, id desc);

create table if not exists public.pulse_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 500),
  reply_to      uuid references public.pulse_posts (id) on delete set null,
  repost_of     uuid references public.pulse_posts (id) on delete set null,
  like_count    int not null default 0,
  reply_count   int not null default 0,
  repost_count  int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists pulse_posts_feed_idx on public.pulse_posts (created_at desc);

create table if not exists public.pulse_likes (
  post_id uuid not null references public.pulse_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.pulse_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.live_streams enable row level security;
alter table public.live_chat enable row level security;
alter table public.pulse_posts enable row level security;
alter table public.pulse_likes enable row level security;
alter table public.pulse_follows enable row level security;

create policy live_streams_read on public.live_streams for select to authenticated using (true);
create policy live_streams_insert on public.live_streams for insert to authenticated with check (host_id = auth.uid());
create policy live_streams_update on public.live_streams for update to authenticated using (host_id = auth.uid());

create policy live_chat_read on public.live_chat for select to authenticated using (true);
create policy live_chat_insert on public.live_chat for insert to authenticated with check (author_id = auth.uid());

create policy pulse_posts_read on public.pulse_posts for select to authenticated using (true);
create policy pulse_posts_insert on public.pulse_posts for insert to authenticated with check (author_id = auth.uid());
create policy pulse_posts_update on public.pulse_posts for update to authenticated using (true);
create policy pulse_posts_delete on public.pulse_posts for delete to authenticated using (author_id = auth.uid());

create policy pulse_likes_all on public.pulse_likes for all to authenticated using (true) with check (user_id = auth.uid());
create policy pulse_follows_read on public.pulse_follows for select to authenticated using (true);
create policy pulse_follows_write on public.pulse_follows for all to authenticated using (follower_id = auth.uid()) with check (follower_id = auth.uid());

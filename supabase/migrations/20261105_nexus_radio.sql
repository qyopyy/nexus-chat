-- Nexus Radio — global shared queue, synced playback, live jam room

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nexus-radio', 'nexus-radio', false, 104857600, array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/flac','audio/aac','audio/ogg','audio/webm'])
on conflict (id) do nothing;

create table if not exists public.radio_tracks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 200),
  artist        text check (char_length(artist) <= 200),
  url           text not null check (char_length(url) <= 800),
  kind          text not null default 'upload' check (kind in ('upload','url')),
  duration      real check (duration is null or duration >= 0),
  added_by      uuid not null references public.profiles (id) on delete cascade,
  removed_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists radio_tracks_active_idx on public.radio_tracks (created_at) where removed_at is null;

create table if not exists public.radio_player (
  id            text primary key default 'main' check (id = 'main'),
  track_id      uuid references public.radio_tracks (id) on delete set null,
  is_playing    boolean not null default false,
  position      real not null default 0 check (position >= 0),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null
);
insert into public.radio_player (id) values ('main') on conflict (id) do nothing;

create table if not exists public.radio_jam (
  id            text primary key default 'main' check (id = 'main'),
  pattern       jsonb not null default '{}'::jsonb,
  bpm           int not null default 140 check (bpm between 60 and 200),
  root          int not null default 0 check (root between 0 and 11),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null
);
insert into public.radio_jam (id) values ('main') on conflict (id) do nothing;

alter table public.radio_tracks enable row level security;
alter table public.radio_player enable row level security;
alter table public.radio_jam enable row level security;

drop policy if exists radio_tracks_read on public.radio_tracks;
create policy radio_tracks_read on public.radio_tracks for select to authenticated using (true);
drop policy if exists radio_tracks_insert on public.radio_tracks;
create policy radio_tracks_insert on public.radio_tracks for insert to authenticated with check (added_by = auth.uid());
drop policy if exists radio_tracks_update on public.radio_tracks;
create policy radio_tracks_update on public.radio_tracks for update to authenticated using (true) with check (true);

drop policy if exists radio_player_all on public.radio_player;
create policy radio_player_all on public.radio_player for all to authenticated using (true) with check (true);

drop policy if exists radio_jam_all on public.radio_jam;
create policy radio_jam_all on public.radio_jam for all to authenticated using (true) with check (true);

drop policy if exists radio_storage_auth on storage.objects;
create policy radio_storage_auth on storage.objects for all to authenticated
  using (bucket_id = 'nexus-radio')
  with check (bucket_id = 'nexus-radio' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
begin
  begin alter publication supabase_realtime add table public.radio_tracks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.radio_player; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.radio_jam; exception when duplicate_object then null; end;
end $$;

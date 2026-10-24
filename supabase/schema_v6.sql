-- =====================================================================
-- Nexus — v6: music tools
--  • copyright audio check (audio fingerprint via ACRCloud; Audible Magic slot) for tracks, videos and the tool
--  • audio analysis on tracks (BPM, key, loudness, true peak)
--  • royalty split sheets on tracks
-- Applied live as nexus_17_music_tools.
-- =====================================================================

alter table public.dist_tracks add column if not exists bpm numeric(6, 2) check (bpm is null or bpm between 20 and 400);
alter table public.dist_tracks add column if not exists musical_key text check (char_length(musical_key) <= 24);
alter table public.dist_tracks add column if not exists lufs real check (lufs is null or lufs between -90 and 10);
alter table public.dist_tracks add column if not exists true_peak real check (true_peak is null or true_peak between -90 and 20);
alter table public.dist_tracks add column if not exists splits jsonb not null default '[]'::jsonb
  check (jsonb_typeof(splits) = 'array' and jsonb_array_length(splits) <= 30 and pg_column_size(splits) <= 8000);

-- results are written only by the audiocheck edge function (service role)
create table if not exists public.audio_checks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  target_kind  text not null check (target_kind in ('track', 'video', 'tool')),
  target_id    uuid,
  provider     text not null check (char_length(provider) <= 40),
  status       text not null check (status in ('clean', 'match', 'own', 'error')),
  matches      jsonb not null default '[]'::jsonb,
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now()
);
create index if not exists audio_checks_target_idx on public.audio_checks (target_kind, target_id, created_at desc);
create index if not exists audio_checks_user_idx on public.audio_checks (user_id, created_at desc);
alter table public.audio_checks enable row level security;

create policy "audio checks read" on public.audio_checks for select to authenticated using (
  user_id = (select auth.uid())
  or public.my_rank() >= 3
  or (target_kind = 'track' and public.release_visible((select t.release_id from public.dist_tracks t where t.id = target_id)))
  or (target_kind = 'video' and exists (select 1 from public.videos v where v.id = target_id and v.owner_id = (select auth.uid())))
);

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

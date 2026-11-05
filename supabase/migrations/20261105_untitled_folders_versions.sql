-- Untitled v2: track folders, version history, follow lists

alter table public.untitled_tracks
  add column if not exists folder text check (folder is null or char_length(folder) between 1 and 80),
  add column if not exists version int not null default 1 check (version >= 1);

create table if not exists public.untitled_track_versions (
  id            uuid primary key default gen_random_uuid(),
  track_id      uuid not null references public.untitled_tracks (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  path          text not null check (char_length(path) <= 500),
  mime          text check (char_length(mime) <= 100),
  bytes         bigint not null default 0,
  duration      real,
  version       int not null check (version >= 1),
  created_at    timestamptz not null default now()
);
create index if not exists untitled_track_versions_track_idx on public.untitled_track_versions (track_id, version desc);

alter table public.untitled_track_versions enable row level security;
drop policy if exists untitled_versions_owner on public.untitled_track_versions;
create policy untitled_versions_owner on public.untitled_track_versions for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.untitled_follow_list(p_user uuid, p_which text)
returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare ids uuid[];
begin
  if p_which = 'followers' then
    select coalesce(array_agg(follower_id order by created_at desc), '{}') into ids
    from public.untitled_follows where followee_id = p_user;
  else
    select coalesce(array_agg(followee_id order by created_at desc), '{}') into ids
    from public.untitled_follows where follower_id = p_user;
  end if;
  return ids;
end;
$$;

grant execute on function public.untitled_follow_list(uuid, text) to anon, authenticated;

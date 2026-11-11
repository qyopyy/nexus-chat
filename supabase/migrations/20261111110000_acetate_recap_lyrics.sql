-- Personal listening recap for the signed-in account, plus owner-written
-- lyric timestamps. Recap rows are the listener's own history, separate from
-- the catalog owner's acetate_listens log.

create table if not exists public.acetate_recap (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  track_id   uuid,
  title      text not null check (char_length(title) between 1 and 160),
  artist     text check (artist is null or char_length(artist) between 1 and 120),
  album      text check (album is null or char_length(album) between 1 and 160),
  seconds    int not null check (seconds between 5 and 7200),
  played_at  timestamptz not null default now(),
  unique (user_id, session_id)
);
create index if not exists acetate_recap_user_idx on public.acetate_recap (user_id, played_at desc);

alter table public.acetate_recap enable row level security;
revoke all on public.acetate_recap from anon, authenticated;
grant select, insert, update, delete on public.acetate_recap to authenticated;
grant usage, select on sequence public.acetate_recap_id_seq to authenticated;

drop policy if exists acetate_recap_own on public.acetate_recap;
create policy acetate_recap_own on public.acetate_recap
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.acetate_recap_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'Not your recap';
  end if;
  delete from public.acetate_recap
  where id in (
    select id from public.acetate_recap
    where user_id = new.user_id
    order by played_at desc
    offset 500
  );
  return new;
end;
$$;

revoke all on function public.acetate_recap_cap() from public, anon, authenticated;

drop trigger if exists acetate_recap_cap on public.acetate_recap;
create trigger acetate_recap_cap
  after insert on public.acetate_recap
  for each row execute function public.acetate_recap_cap();

create or replace function public.acetate_lyric_cues_ok(cues jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
begin
  if cues is null then
    return true;
  end if;
  if jsonb_typeof(cues) is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(cues) > 400 then
    return false;
  end if;
  for item in select value from jsonb_array_elements(cues)
  loop
    if jsonb_typeof(item) is distinct from 'object' then
      return false;
    end if;
    if (item->>'t') is null or (item->>'t') !~ '^[0-9]+$' then
      return false;
    end if;
    if (item->>'t')::bigint > 7200000 then
      return false;
    end if;
    if (item->>'line') is null or char_length(item->>'line') < 1 or char_length(item->>'line') > 200 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.acetate_lyric_cues_ok(jsonb) from public, anon, authenticated;

alter table public.acetate_tracks
  add column if not exists lyric_cues jsonb;

alter table public.acetate_tracks drop constraint if exists acetate_tracks_lyric_cues_check;
alter table public.acetate_tracks
  add constraint acetate_tracks_lyric_cues_check
  check (public.acetate_lyric_cues_ok(lyric_cues));

-- Profile sounds (Nexus Snap): one Spotify song on your profile for 24 hours, 48 hours for VIP / Moderator / Admin / Owner.
-- The length is decided here, in the database, so a modified app can't give itself longer.

create table if not exists public.profile_sounds (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  track_id    text not null check (track_id ~ '^[A-Za-z0-9]{10,40}$'),
  title       text not null check (char_length(title) between 1 and 200),
  artist      text not null default '' check (char_length(artist) <= 300),
  cover_url   text check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 500)),
  preview_url text check (preview_url is null or (preview_url ~ '^https://' and char_length(preview_url) <= 500)),
  spotify_url text check (spotify_url is null or (spotify_url ~ '^https://open\.spotify\.com/' and char_length(spotify_url) <= 300)),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists profile_sounds_expires_idx on public.profile_sounds (expires_at);

alter table public.profile_sounds enable row level security;

-- anyone signed in can see sounds that are still running; nobody writes the table directly
drop policy if exists profile_sounds_read on public.profile_sounds;
create policy profile_sounds_read on public.profile_sounds
  for select to authenticated
  using (expires_at > now());

revoke insert, update, delete on public.profile_sounds from anon, authenticated;

create or replace function public.profile_sound_hours(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.profiles p where p.id = p_user and p.site_role in ('vip', 'moderator', 'admin', 'owner')
  ) then 48 else 24 end;
$$;

create or replace function public.set_profile_sound(
  p_track_id text,
  p_title text,
  p_artist text default '',
  p_cover_url text default null,
  p_preview_url text default null,
  p_spotify_url text default null
)
returns public.profile_sounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row public.profile_sounds;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  insert into public.profile_sounds as s (user_id, track_id, title, artist, cover_url, preview_url, spotify_url, created_at, expires_at)
  values (
    me,
    p_track_id,
    left(coalesce(nullif(btrim(p_title), ''), 'Untitled'), 200),
    left(coalesce(p_artist, ''), 300),
    nullif(p_cover_url, ''),
    nullif(p_preview_url, ''),
    nullif(p_spotify_url, ''),
    now(),
    now() + make_interval(hours => public.profile_sound_hours(me))
  )
  on conflict (user_id) do update
    set track_id = excluded.track_id,
        title = excluded.title,
        artist = excluded.artist,
        cover_url = excluded.cover_url,
        preview_url = excluded.preview_url,
        spotify_url = excluded.spotify_url,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
  returning * into row;
  return row;
end;
$$;

create or replace function public.clear_profile_sound()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.profile_sounds where user_id = auth.uid();
$$;

revoke all on function public.profile_sound_hours(uuid) from public, anon;
revoke all on function public.set_profile_sound(text, text, text, text, text, text) from public, anon;
revoke all on function public.clear_profile_sound() from public, anon;
grant execute on function public.profile_sound_hours(uuid) to authenticated;
grant execute on function public.set_profile_sound(text, text, text, text, text, text) to authenticated;
grant execute on function public.clear_profile_sound() to authenticated;

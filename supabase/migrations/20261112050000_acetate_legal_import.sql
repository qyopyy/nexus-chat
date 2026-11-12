-- Legal Acetate import tools.
-- format_convert, soundcloud_import, and link_import are admin kill switches on site_settings.
-- Link rows store metadata and official page URLs only. They do not store audio.
-- SoundCloud audio import uses the official download endpoint in the app server, not this database.

alter table public.site_settings
  add column if not exists format_convert boolean not null default true,
  add column if not exists soundcloud_import boolean not null default true,
  add column if not exists link_import boolean not null default true;

create or replace function public.feature_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_key
      when 'phone_link' then s.phone_link
      when 'locator' then s.locator
      when 'live_stage' then s.live_stage
      when 'vault_uploads' then s.vault_uploads
      when 'format_convert' then s.format_convert
      when 'soundcloud_import' then s.soundcloud_import
      when 'link_import' then s.link_import
      else true
    end
    from public.site_settings s
    where s.id = 1
  ), true);
$$;

drop function if exists public.admin_set_flags(boolean, boolean, boolean, boolean);

create or replace function public.admin_set_flags(
  p_phone boolean,
  p_locator boolean,
  p_stage boolean,
  p_vault boolean,
  p_format boolean default true,
  p_soundcloud boolean default true,
  p_links boolean default true
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  update public.site_settings
  set phone_link = p_phone,
      locator = p_locator,
      live_stage = p_stage,
      vault_uploads = p_vault,
      format_convert = p_format,
      soundcloud_import = p_soundcloud,
      link_import = p_links,
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1;
  perform public.log_admin(null, 'set_flags', jsonb_build_object(
    'phone_link', p_phone,
    'locator', p_locator,
    'live_stage', p_stage,
    'vault_uploads', p_vault,
    'format_convert', p_format,
    'soundcloud_import', p_soundcloud,
    'link_import', p_links
  ));
end;
$$;

revoke all on function public.admin_set_flags(boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_set_flags(boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.admin_desk_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  policy public.acetate_storage_policy;
  flags public.site_settings;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select * into policy from public.acetate_storage_policy where id = 1;
  select * into flags from public.site_settings where id = 1;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'active_7d', (select count(distinct author_id) from public.messages where created_at > now() - interval '7 days'),
    'active_1d', (select count(distinct user_id) from public.nexus_handsets where last_seen > now() - interval '1 day'),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'open_content_reports', (select count(*) from public.content_reports where status = 'open'),
    'storage_bytes', (select coalesce(sum(bytes), 0) from public.acetate_stored),
    'vault_bytes', (select coalesce(sum(bytes), 0) from public.acetate_stored where library = 'vault'),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as n
        from public.profiles
        where created_at > now() - interval '14 days'
        group by 1
      ) s
    ), '[]'::jsonb),
    'uploads', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as n
        from public.acetate_versions
        where created_at > now() - interval '14 days'
        group by 1
      ) u
    ), '[]'::jsonb),
    'flags', jsonb_build_object(
      'phone_link', coalesce(flags.phone_link, true),
      'locator', coalesce(flags.locator, true),
      'live_stage', coalesce(flags.live_stage, true),
      'vault_uploads', coalesce(flags.vault_uploads, true),
      'format_convert', coalesce(flags.format_convert, true),
      'soundcloud_import', coalesce(flags.soundcloud_import, true),
      'link_import', coalesce(flags.link_import, true)
    ),
    'policy', jsonb_build_object(
      'shelf_free_bytes', policy.shelf_free_bytes,
      'vault_quota_bytes', policy.vault_quota_bytes,
      'file_bytes', policy.file_bytes
    )
  );
end;
$$;

alter table public.acetate_tracks
  add column if not exists artist text,
  add column if not exists source_url text,
  add column if not exists source_kind text,
  add column if not exists external_art text;

alter table public.acetate_tracks drop constraint if exists acetate_tracks_artist_check;
alter table public.acetate_tracks
  add constraint acetate_tracks_artist_check check (artist is null or char_length(artist) between 1 and 200);
alter table public.acetate_tracks drop constraint if exists acetate_tracks_source_kind_check;
alter table public.acetate_tracks
  add constraint acetate_tracks_source_kind_check check (source_kind is null or source_kind = 'soundcloud');
alter table public.acetate_tracks drop constraint if exists acetate_tracks_source_url_check;
alter table public.acetate_tracks
  add constraint acetate_tracks_source_url_check check (
    source_url is null or (
      char_length(source_url) between 12 and 500
      and source_url ~ '^https://([A-Za-z0-9-]+\.)*soundcloud\.com/[^[:space:]]+$'
    )
  );
alter table public.acetate_tracks drop constraint if exists acetate_tracks_external_art_check;
alter table public.acetate_tracks
  add constraint acetate_tracks_external_art_check check (
    external_art is null or (
      char_length(external_art) between 12 and 500
      and external_art ~ '^https://[A-Za-z0-9.-]+/[^[:space:]]+$'
      and position('javascript:' in lower(external_art)) = 0
    )
  );

create or replace function public.acetate_track_source_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_kind is not null and auth.uid() is distinct from new.owner_id then
    raise exception 'Only the owner can attach a SoundCloud source';
  end if;
  if tg_op = 'INSERT' and new.source_kind is not null and not public.feature_on('soundcloud_import') then
    raise exception 'SoundCloud import is turned off';
  end if;
  if tg_op = 'UPDATE'
     and new.source_kind is not null
     and (new.source_kind is distinct from old.source_kind or new.source_url is distinct from old.source_url)
     and not public.feature_on('soundcloud_import') then
    raise exception 'SoundCloud import is turned off';
  end if;
  return new;
end;
$$;

drop trigger if exists acetate_track_source_guard on public.acetate_tracks;
create trigger acetate_track_source_guard
  before insert or update on public.acetate_tracks
  for each row execute function public.acetate_track_source_guard();

create table if not exists public.acetate_link_lists (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  source       text not null check (source in ('spotify', 'youtube', 'soundcloud')),
  source_url   text not null check (
    char_length(source_url) between 12 and 500
    and source_url ~ '^https://[^[:space:]]+$'
  ),
  artwork_url  text check (
    artwork_url is null or (
      char_length(artwork_url) between 12 and 500
      and artwork_url ~ '^https://[A-Za-z0-9.-]+/[^[:space:]]+$'
    )
  ),
  partial      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists acetate_link_lists_owner_idx
  on public.acetate_link_lists (owner_id, created_at desc);

create table if not exists public.acetate_link_items (
  id             uuid primary key default gen_random_uuid(),
  list_id        uuid not null references public.acetate_link_lists (id) on delete cascade,
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  position       int not null check (position between 1 and 200),
  source         text not null check (source in ('spotify', 'youtube', 'soundcloud')),
  kind           text not null check (kind in ('track', 'album', 'playlist', 'video', 'episode')),
  title          text not null check (char_length(title) between 1 and 200),
  artist         text check (artist is null or char_length(artist) between 1 and 200),
  duration_ms    int check (duration_ms is null or (duration_ms >= 0 and duration_ms < 86400000)),
  artwork_url    text check (
    artwork_url is null or (
      char_length(artwork_url) between 12 and 500
      and artwork_url ~ '^https://[A-Za-z0-9.-]+/[^[:space:]]+$'
    )
  ),
  source_url     text not null check (
    char_length(source_url) between 12 and 500
    and source_url ~ '^https://[^[:space:]]+$'
  ),
  external_id    text check (external_id is null or char_length(external_id) between 1 and 80),
  vault_track_id uuid references public.acetate_tracks (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (list_id, position)
);
create index if not exists acetate_link_items_list_idx on public.acetate_link_items (list_id, position);
create index if not exists acetate_link_items_owner_idx on public.acetate_link_items (owner_id);
create index if not exists acetate_link_items_vault_idx
  on public.acetate_link_items (vault_track_id) where vault_track_id is not null;

alter table public.acetate_link_lists enable row level security;
alter table public.acetate_link_items enable row level security;
revoke all on public.acetate_link_lists from public, anon, authenticated;
revoke all on public.acetate_link_items from public, anon, authenticated;
grant select, insert, update, delete on public.acetate_link_lists to authenticated;
grant select, insert, update, delete on public.acetate_link_items to authenticated;

drop policy if exists acetate_link_lists_own on public.acetate_link_lists;
create policy acetate_link_lists_own on public.acetate_link_lists
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists acetate_link_items_own on public.acetate_link_items;
create policy acetate_link_items_own on public.acetate_link_items
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.acetate_link_host_ok(p_source text, p_url text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  host text;
begin
  if p_url is null or p_url !~ '^https://' then return false; end if;
  host := lower(substring(p_url from '^https://([^/:]+)'));
  if p_source = 'spotify' then
    return host = 'open.spotify.com';
  elsif p_source = 'youtube' then
    return host in ('www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com', 'www.youtube-nocookie.com');
  elsif p_source = 'soundcloud' then
    return host = 'soundcloud.com' or host = 'm.soundcloud.com' or host = 'on.soundcloud.com' or host like '%.soundcloud.com';
  end if;
  return false;
end;
$$;

revoke all on function public.acetate_link_host_ok(text, text) from public, anon;
grant execute on function public.acetate_link_host_ok(text, text) to authenticated;

create or replace function public.acetate_link_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_owner uuid;
begin
  if not public.feature_on('link_import') then
    raise exception 'Link import is turned off';
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'Owner is fixed';
  end if;
  if auth.uid() is distinct from new.owner_id then
    raise exception 'Sign in required';
  end if;
  if tg_table_name = 'acetate_link_lists' then
    if not public.acetate_link_host_ok(new.source, new.source_url) then
      raise exception 'That link is not a Spotify, YouTube, or SoundCloud page';
    end if;
    return new;
  end if;
  select owner_id into parent_owner from public.acetate_link_lists where id = new.list_id;
  if parent_owner is null or parent_owner is distinct from new.owner_id then
    raise exception 'Playlist not found';
  end if;
  if not public.acetate_link_host_ok(new.source, new.source_url) then
    raise exception 'That link is not a Spotify, YouTube, or SoundCloud page';
  end if;
  if new.vault_track_id is not null and not exists (
    select 1 from public.acetate_tracks t
    where t.id = new.vault_track_id and t.owner_id = new.owner_id
  ) then
    raise exception 'That Vault track is not yours';
  end if;
  return new;
end;
$$;

drop trigger if exists acetate_link_lists_guard on public.acetate_link_lists;
create trigger acetate_link_lists_guard
  before insert or update on public.acetate_link_lists
  for each row execute function public.acetate_link_guard();

drop trigger if exists acetate_link_items_guard on public.acetate_link_items;
create trigger acetate_link_items_guard
  before insert or update on public.acetate_link_items
  for each row execute function public.acetate_link_guard();

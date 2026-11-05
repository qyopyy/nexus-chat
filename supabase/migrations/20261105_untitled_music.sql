-- Untitled — WIP music projects, share links, listens, profiles/follows
-- Inspired by untitled.stream patterns; Nexus-native.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('untitled', 'untitled', false, 2147483648, array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/flac','audio/aac','audio/ogg','audio/webm','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create table if not exists public.untitled_projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  title         text not null default 'Untitled' check (char_length(title) between 1 and 120),
  note          text check (char_length(note) <= 2000),
  color         text not null default '#c4a574' check (char_length(color) <= 20),
  visibility    text not null default 'private' check (visibility in ('private','unlisted','public')),
  cover_path    text check (char_length(cover_path) <= 400),
  track_count   int not null default 0 check (track_count >= 0),
  listen_count  int not null default 0 check (listen_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists untitled_projects_owner_idx on public.untitled_projects (owner_id, updated_at desc);
create index if not exists untitled_projects_public_idx on public.untitled_projects (owner_id) where visibility = 'public';

create table if not exists public.untitled_tracks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.untitled_projects (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  path          text not null check (char_length(path) <= 500),
  mime          text check (char_length(mime) <= 100),
  bytes         bigint not null default 0 check (bytes >= 0),
  duration      real check (duration is null or duration >= 0),
  position      int not null default 1 check (position between 1 and 500),
  note          text check (char_length(note) <= 1000),
  listen_count  int not null default 0 check (listen_count >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists untitled_tracks_project_idx on public.untitled_tracks (project_id, position);

create table if not exists public.untitled_shares (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.untitled_projects (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  token         text not null unique default encode(extensions.gen_random_bytes(12), 'hex')
                  check (char_length(token) between 8 and 64),
  permission    text not null default 'listen' check (permission in ('listen','download','edit')),
  label         text check (char_length(label) <= 80),
  pass_hash     text,
  expires_at    timestamptz,
  revoked       boolean not null default false,
  views         int not null default 0,
  listens       int not null default 0,
  last_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists untitled_shares_owner_idx on public.untitled_shares (owner_id, created_at desc);
create index if not exists untitled_shares_project_idx on public.untitled_shares (project_id) where not revoked;

create table if not exists public.untitled_listens (
  id            bigserial primary key,
  project_id    uuid not null references public.untitled_projects (id) on delete cascade,
  track_id      uuid references public.untitled_tracks (id) on delete set null,
  share_id      uuid references public.untitled_shares (id) on delete set null,
  listener_id   uuid references public.profiles (id) on delete set null,
  guest_name    text check (char_length(guest_name) <= 40),
  created_at    timestamptz not null default now()
);
create index if not exists untitled_listens_project_idx on public.untitled_listens (project_id, created_at desc);

create table if not exists public.untitled_follows (
  follower_id   uuid not null references public.profiles (id) on delete cascade,
  followee_id   uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists untitled_follows_followee_idx on public.untitled_follows (followee_id, created_at desc);

alter table public.untitled_projects enable row level security;
alter table public.untitled_tracks enable row level security;
alter table public.untitled_shares enable row level security;
alter table public.untitled_listens enable row level security;
alter table public.untitled_follows enable row level security;

drop policy if exists untitled_projects_owner on public.untitled_projects;
create policy untitled_projects_owner on public.untitled_projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists untitled_projects_public_read on public.untitled_projects;
create policy untitled_projects_public_read on public.untitled_projects for select using (visibility = 'public');

drop policy if exists untitled_tracks_owner on public.untitled_tracks;
create policy untitled_tracks_owner on public.untitled_tracks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists untitled_tracks_public_read on public.untitled_tracks;
create policy untitled_tracks_public_read on public.untitled_tracks for select using (
  exists (select 1 from public.untitled_projects p where p.id = project_id and p.visibility = 'public')
);

drop policy if exists untitled_shares_owner on public.untitled_shares;
create policy untitled_shares_owner on public.untitled_shares for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists untitled_listens_owner on public.untitled_listens;
create policy untitled_listens_owner on public.untitled_listens for select using (
  exists (select 1 from public.untitled_projects p where p.id = project_id and p.owner_id = auth.uid())
);
drop policy if exists untitled_listens_insert on public.untitled_listens;
create policy untitled_listens_insert on public.untitled_listens for insert with check (true);

drop policy if exists untitled_follows_read on public.untitled_follows;
create policy untitled_follows_read on public.untitled_follows for select using (true);
drop policy if exists untitled_follows_write on public.untitled_follows;
create policy untitled_follows_write on public.untitled_follows for all using (follower_id = auth.uid()) with check (follower_id = auth.uid());

-- storage policies for untitled bucket
drop policy if exists untitled_storage_own on storage.objects;
create policy untitled_storage_own on storage.objects for all
  using (bucket_id = 'untitled' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'untitled' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.untitled_bump_track_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.untitled_projects set track_count = track_count + 1, updated_at = now() where id = new.project_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.untitled_projects set track_count = greatest(0, track_count - 1), updated_at = now() where id = old.project_id;
    return old;
  end if;
  return null;
end;
$$;
drop trigger if exists untitled_tracks_count on public.untitled_tracks;
create trigger untitled_tracks_count after insert or delete on public.untitled_tracks
  for each row execute function public.untitled_bump_track_count();

create or replace function public.untitled_share_create(
  p_project uuid,
  p_permission text default 'listen',
  p_password text default null,
  p_expires timestamptz default null,
  p_label text default null
) returns public.untitled_shares
language plpgsql security definer set search_path = '' as $$
declare s public.untitled_shares;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.untitled_projects where id = p_project and owner_id = auth.uid()) then
    raise exception 'Project not found';
  end if;
  if (select count(*) from public.untitled_shares where owner_id = auth.uid() and not revoked) >= 200 then
    raise exception 'Too many share links — revoke some first';
  end if;
  if p_permission not in ('listen','download','edit') then raise exception 'Invalid permission'; end if;
  insert into public.untitled_shares (project_id, owner_id, permission, expires_at, label, pass_hash)
  values (
    p_project, auth.uid(), p_permission, p_expires, nullif(trim(coalesce(p_label, '')), ''),
    case when nullif(trim(coalesce(p_password, '')), '') is null then null
         else extensions.crypt(p_password, extensions.gen_salt('bf')) end
  )
  returning * into s;
  return s;
end;
$$;

create or replace function public.untitled_share_resolve(
  p_token text,
  p_password text default null,
  p_count text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.untitled_shares;
  p public.untitled_projects;
  owner public.profiles;
  tracks jsonb;
begin
  select * into s from public.untitled_shares where token = p_token and not revoked;
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  if s.expires_at is not null and s.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  select * into p from public.untitled_projects where id = s.project_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  select * into owner from public.profiles where id = s.owner_id;

  -- info only (no password attempt): never return storage paths
  if p_count is null then
    return jsonb_build_object(
      'ok', true,
      'password', s.pass_hash is not null,
      'permission', s.permission,
      'title', p.title,
      'owner', owner.username,
      'owner_name', owner.display_name,
      'color', p.color,
      'note', p.note,
      'track_count', p.track_count,
      'download', s.permission in ('download','edit')
    );
  end if;

  if s.pass_hash is not null then
    if p_password is null or s.pass_hash <> extensions.crypt(p_password, s.pass_hash) then
      return jsonb_build_object('ok', false, 'reason', 'password');
    end if;
  end if;

  if p_count = 'view' then
    update public.untitled_shares set views = views + 1, last_at = now() where id = s.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'mime', t.mime, 'bytes', t.bytes,
    'duration', t.duration, 'position', t.position, 'path', t.path
  ) order by t.position, t.created_at), '[]'::jsonb)
  into tracks
  from public.untitled_tracks t where t.project_id = p.id;

  return jsonb_build_object(
    'ok', true, 'password', false, 'permission', s.permission,
    'share_id', s.id, 'project_id', p.id, 'title', p.title, 'note', p.note,
    'color', p.color, 'owner', owner.username, 'owner_name', owner.display_name,
    'owner_id', owner.id, 'tracks', tracks, 'download', s.permission in ('download','edit')
  );
end;
$$;

create or replace function public.untitled_record_listen(
  p_project uuid,
  p_track uuid default null,
  p_share uuid default null,
  p_guest text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.untitled_listens (project_id, track_id, share_id, listener_id, guest_name)
  values (p_project, p_track, p_share, auth.uid(), nullif(trim(coalesce(p_guest, '')), ''));
  update public.untitled_projects set listen_count = listen_count + 1 where id = p_project;
  if p_track is not null then
    update public.untitled_tracks set listen_count = listen_count + 1 where id = p_track;
  end if;
  if p_share is not null then
    update public.untitled_shares set listens = listens + 1, last_at = now() where id = p_share;
  end if;
end;
$$;

create or replace function public.untitled_profile(p_username text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.profiles;
  followers int;
  following int;
  projects jsonb;
  me uuid := auth.uid();
  is_following boolean := false;
  follows_you boolean := false;
begin
  select * into u from public.profiles where lower(username) = lower(trim(p_username));
  if not found then return null; end if;
  select count(*) into followers from public.untitled_follows where followee_id = u.id;
  select count(*) into following from public.untitled_follows where follower_id = u.id;
  if me is not null then
    select exists(select 1 from public.untitled_follows where follower_id = me and followee_id = u.id) into is_following;
    select exists(select 1 from public.untitled_follows where follower_id = u.id and followee_id = me) into follows_you;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'color', p.color, 'note', p.note,
    'track_count', p.track_count, 'listen_count', p.listen_count,
    'visibility', p.visibility, 'updated_at', p.updated_at
  ) order by p.updated_at desc), '[]'::jsonb)
  into projects
  from public.untitled_projects p
  where p.owner_id = u.id
    and (p.visibility = 'public' or p.owner_id = me);
  return jsonb_build_object(
    'id', u.id, 'username', u.username, 'display_name', u.display_name,
    'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color,
    'bio', u.bio, 'followers', followers, 'following', following,
    'is_following', is_following, 'follows_you', follows_you,
    'projects', projects
  );
end;
$$;

grant execute on function public.untitled_share_create(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.untitled_share_resolve(text, text, text) to anon, authenticated;
grant execute on function public.untitled_record_listen(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.untitled_profile(text) to anon, authenticated;

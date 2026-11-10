-- Acetate live library, social graph, and quota tightening.
-- Additive. After 20261110201000_acetate_studio.sql.

alter table public.acetate_tracks
  add column if not exists lyrics text
    check (lyrics is null or char_length(lyrics) <= 8000),
  add column if not exists lyrics_on_share boolean not null default false;

create table if not exists public.acetate_likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  track_id   uuid not null references public.acetate_tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists acetate_likes_track_idx on public.acetate_likes (track_id, created_at desc);

create table if not exists public.acetate_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists acetate_follows_followee_idx on public.acetate_follows (followee_id, created_at desc);

create table if not exists public.acetate_collaborators (
  project_id uuid not null references public.acetate_projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'listener' check (role in ('listener', 'editor')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists acetate_collaborators_user_idx on public.acetate_collaborators (user_id);

create table if not exists public.acetate_notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('comment', 'collab')),
  track_id   uuid references public.acetate_tracks (id) on delete cascade,
  project_id uuid references public.acetate_projects (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 240),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists acetate_notifications_user_idx on public.acetate_notifications (user_id, created_at desc);

alter table public.acetate_likes enable row level security;
alter table public.acetate_follows enable row level security;
alter table public.acetate_collaborators enable row level security;
alter table public.acetate_notifications enable row level security;

-- Owners can see their own byte rows so storage usage can update live.
drop policy if exists acetate_stored_owner_read on public.acetate_stored;
create policy acetate_stored_owner_read on public.acetate_stored
  for select to authenticated
  using (owner_id = (select auth.uid()));
grant select on public.acetate_stored to authenticated;

-- --------------------------------------------------------------------- access helpers

create or replace function public.acetate_track_is_public(p_track uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.acetate_shares s
    where s.listing = 'public'
      and not s.revoked
      and s.pass_hash is null
      and (s.expires_at is null or s.expires_at > now())
      and (
        (s.kind = 'track' and s.track_id = p_track)
        or (
          s.kind = 'project'
          and exists (
            select 1 from public.acetate_memberships m
            where m.project_id = s.project_id and m.track_id = p_track
          )
        )
      )
  );
$$;

create or replace function public.acetate_can_hear(p_track uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.acetate_tracks t where t.id = p_track and t.owner_id = auth.uid())
    or exists (
      select 1
      from public.acetate_memberships m
      join public.acetate_collaborators c on c.project_id = m.project_id
      where m.track_id = p_track and c.user_id = auth.uid()
    )
    or public.acetate_track_is_public(p_track)
  );
$$;

revoke all on function public.acetate_track_is_public(uuid) from public, anon, authenticated;
revoke all on function public.acetate_can_hear(uuid) from public, anon, authenticated;
grant execute on function public.acetate_track_is_public(uuid) to authenticated, current_user;
grant execute on function public.acetate_can_hear(uuid) to authenticated, current_user;

-- --------------------------------------------------------------------- collaborator read (no storage paths)

drop policy if exists acetate_projects_collab_read on public.acetate_projects;
create policy acetate_projects_collab_read on public.acetate_projects
  for select to authenticated
  using (exists (
    select 1 from public.acetate_collaborators c
    where c.project_id = id and c.user_id = (select auth.uid())
  ));

drop policy if exists acetate_tracks_collab_read on public.acetate_tracks;
create policy acetate_tracks_collab_read on public.acetate_tracks
  for select to authenticated
  using (exists (
    select 1
    from public.acetate_memberships m
    join public.acetate_collaborators c on c.project_id = m.project_id
    where m.track_id = acetate_tracks.id and c.user_id = (select auth.uid())
  ));

drop policy if exists acetate_tracks_editor_update on public.acetate_tracks;
create policy acetate_tracks_editor_update on public.acetate_tracks
  for update to authenticated
  using (exists (
    select 1
    from public.acetate_memberships m
    join public.acetate_collaborators c on c.project_id = m.project_id
    where m.track_id = acetate_tracks.id and c.user_id = (select auth.uid()) and c.role = 'editor'
  ))
  with check (exists (
    select 1
    from public.acetate_memberships m
    join public.acetate_collaborators c on c.project_id = m.project_id
    where m.track_id = acetate_tracks.id and c.user_id = (select auth.uid()) and c.role = 'editor'
  ));

create or replace function public.acetate_lock_track_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'A track owner cannot be reassigned';
  end if;
  return new;
end;
$$;

drop trigger if exists acetate_lock_track_owner on public.acetate_tracks;
create trigger acetate_lock_track_owner
  before update on public.acetate_tracks
  for each row execute function public.acetate_lock_track_owner();

drop policy if exists acetate_memberships_collab_read on public.acetate_memberships;
create policy acetate_memberships_collab_read on public.acetate_memberships
  for select to authenticated
  using (exists (
    select 1 from public.acetate_collaborators c
    where c.project_id = acetate_memberships.project_id and c.user_id = (select auth.uid())
  ));

drop policy if exists acetate_memberships_editor_update on public.acetate_memberships;
create policy acetate_memberships_editor_update on public.acetate_memberships
  for update to authenticated
  using (exists (
    select 1 from public.acetate_collaborators c
    where c.project_id = acetate_memberships.project_id and c.user_id = (select auth.uid()) and c.role = 'editor'
  ))
  with check (exists (
    select 1 from public.acetate_collaborators c
    where c.project_id = acetate_memberships.project_id and c.user_id = (select auth.uid()) and c.role = 'editor'
  ));

create or replace function public.acetate_lock_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id or new.track_id is distinct from old.track_id then
    raise exception 'A membership cannot be moved to another cut';
  end if;
  return new;
end;
$$;

drop trigger if exists acetate_lock_membership on public.acetate_memberships;
create trigger acetate_lock_membership
  before update on public.acetate_memberships
  for each row execute function public.acetate_lock_membership();

drop policy if exists acetate_comments_collab_read on public.acetate_comments;
create policy acetate_comments_collab_read on public.acetate_comments
  for select to authenticated
  using (exists (
    select 1
    from public.acetate_memberships m
    join public.acetate_collaborators c on c.project_id = m.project_id
    where m.track_id = acetate_comments.track_id and c.user_id = (select auth.uid())
  ));

drop policy if exists acetate_comments_collab_insert on public.acetate_comments;
create policy acetate_comments_collab_insert on public.acetate_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.acetate_memberships m
      join public.acetate_collaborators c on c.project_id = m.project_id
      where m.track_id = acetate_comments.track_id and c.user_id = (select auth.uid())
    )
  );

-- Versions stay owner-only so collaborators never receive storage paths.

-- --------------------------------------------------------------------- likes, follows, collabs, notices

drop policy if exists acetate_likes_read on public.acetate_likes;
create policy acetate_likes_read on public.acetate_likes
  for select to authenticated
  using (user_id = (select auth.uid()) or public.acetate_track_is_public(track_id));

drop policy if exists acetate_likes_insert on public.acetate_likes;
create policy acetate_likes_insert on public.acetate_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.acetate_can_hear(track_id));

drop policy if exists acetate_likes_delete on public.acetate_likes;
create policy acetate_likes_delete on public.acetate_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists acetate_follows_read on public.acetate_follows;
create policy acetate_follows_read on public.acetate_follows
  for select to authenticated
  using (true);

drop policy if exists acetate_follows_write on public.acetate_follows;
create policy acetate_follows_write on public.acetate_follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()));

drop policy if exists acetate_follows_delete on public.acetate_follows;
create policy acetate_follows_delete on public.acetate_follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));

drop policy if exists acetate_collaborators_read on public.acetate_collaborators;
create policy acetate_collaborators_read on public.acetate_collaborators
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.acetate_projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists acetate_collaborators_owner_write on public.acetate_collaborators;
create policy acetate_collaborators_owner_write on public.acetate_collaborators
  for all to authenticated
  using (exists (
    select 1 from public.acetate_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.acetate_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists acetate_notifications_read on public.acetate_notifications;
create policy acetate_notifications_read on public.acetate_notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists acetate_notifications_update on public.acetate_notifications;
create policy acetate_notifications_update on public.acetate_notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.acetate_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  snippet text;
begin
  select t.owner_id into owner from public.acetate_tracks t where t.id = new.track_id;
  snippet := left(new.body, 140);
  if owner is not null and owner is distinct from new.author_id then
    insert into public.acetate_notifications (user_id, kind, track_id, body)
    values (owner, 'comment', new.track_id, snippet);
  end if;
  insert into public.acetate_notifications (user_id, kind, track_id, project_id, body)
  select c.user_id, 'comment', new.track_id, c.project_id, snippet
  from public.acetate_collaborators c
  join public.acetate_memberships m on m.project_id = c.project_id
  where m.track_id = new.track_id
    and c.user_id is distinct from new.author_id
    and c.user_id is distinct from owner;
  return new;
end;
$$;

drop trigger if exists acetate_notify_comment on public.acetate_comments;
create trigger acetate_notify_comment
  after insert on public.acetate_comments
  for each row execute function public.acetate_notify();

-- --------------------------------------------------------------------- RPCs

create or replace function public.acetate_toggle_like(p_track uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  liked boolean;
  total int;
begin
  if me is null then raise exception 'Sign in required'; end if;
  if not public.acetate_can_hear(p_track) then raise exception 'That cut is private'; end if;
  if exists (select 1 from public.acetate_likes where user_id = me and track_id = p_track) then
    delete from public.acetate_likes where user_id = me and track_id = p_track;
    liked := false;
  else
    insert into public.acetate_likes (user_id, track_id) values (me, p_track);
    liked := true;
  end if;
  select count(*) into total from public.acetate_likes where track_id = p_track;
  return jsonb_build_object('liked', liked, 'count', total);
end;
$$;

create or replace function public.acetate_set_follow(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in required'; end if;
  if me = p_user then raise exception 'You cannot follow yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'No such artist'; end if;
  if p_on then
    insert into public.acetate_follows (follower_id, followee_id) values (me, p_user)
    on conflict do nothing;
  else
    delete from public.acetate_follows where follower_id = me and followee_id = p_user;
  end if;
end;
$$;

create or replace function public.acetate_invite_collaborator(p_project uuid, p_username text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  who uuid;
  title text;
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_role not in ('listener', 'editor') then raise exception 'Unknown role'; end if;
  if not exists (select 1 from public.acetate_projects p where p.id = p_project and p.owner_id = me) then
    raise exception 'Project not found';
  end if;
  select id into who from public.profiles where lower(username) = lower(trim(p_username));
  if who is null then raise exception 'No Nexus user with that name'; end if;
  if who = me then raise exception 'You already own this project'; end if;
  if (select count(*) from public.acetate_collaborators where project_id = p_project) >= 25 then
    raise exception 'This project already has 25 collaborators';
  end if;
  insert into public.acetate_collaborators (project_id, user_id, role)
  values (p_project, who, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
  select p.title into title from public.acetate_projects p where p.id = p_project;
  insert into public.acetate_notifications (user_id, kind, project_id, body)
  values (who, 'collab', p_project, left(coalesce(title, 'A project') || ' — you can ' || p_role, 240));
end;
$$;

create or replace function public.acetate_remove_collaborator(p_project uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.acetate_projects p where p.id = p_project and p.owner_id = auth.uid()) then
    raise exception 'Project not found';
  end if;
  delete from public.acetate_collaborators where project_id = p_project and user_id = p_user;
end;
$$;

create or replace function public.acetate_public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  me uuid := auth.uid();
  tracks jsonb;
begin
  select * into u from public.profiles where lower(username) = lower(trim(coalesce(p_username, '')));
  if not found then return jsonb_build_object('ok', false); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'status', t.status,
    'likes', (select count(*) from public.acetate_likes l where l.track_id = t.id),
    'liked', exists (select 1 from public.acetate_likes l where l.track_id = t.id and l.user_id = me)
  ) order by t.updated_at desc), '[]'::jsonb)
  into tracks
  from public.acetate_tracks t
  where t.owner_id = u.id and public.acetate_track_is_public(t.id);
  return jsonb_build_object(
    'ok', true,
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'followers', (select count(*) from public.acetate_follows f where f.followee_id = u.id),
    'following', (select count(*) from public.acetate_follows f where f.follower_id = u.id),
    'is_following', exists (select 1 from public.acetate_follows f where f.follower_id = me and f.followee_id = u.id),
    'tracks', tracks
  );
end;
$$;

create or replace function public.acetate_mark_notifications(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_id is null then
    update public.acetate_notifications set read_at = now() where user_id = auth.uid() and read_at is null;
  else
    update public.acetate_notifications set read_at = now() where id = p_id and user_id = auth.uid();
  end if;
end;
$$;

-- Share links no longer return the password hash to the browser.
create or replace function public.acetate_share_create(
  p_kind text,
  p_id uuid,
  p_listing text,
  p_password text,
  p_expires timestamptz,
  p_download boolean
) returns public.acetate_shares
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row public.acetate_shares;
  pw text := nullif(trim(coalesce(p_password, '')), '');
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_kind not in ('track','project') then raise exception 'Unknown share'; end if;
  if p_listing not in ('public','unlisted') then raise exception 'Pick public or unlisted'; end if;
  if p_expires is not null and p_expires <= now() then raise exception 'Expiry must be in the future'; end if;
  if (select count(*) from public.acetate_shares where owner_id = me and not revoked) >= 200 then
    raise exception 'Too many share links — revoke some first';
  end if;
  if p_kind = 'track' then
    if not exists (select 1 from public.acetate_tracks t where t.id = p_id and t.owner_id = me) then
      raise exception 'Track not found';
    end if;
  else
    if not exists (select 1 from public.acetate_projects p where p.id = p_id and p.owner_id = me) then
      raise exception 'Project not found';
    end if;
  end if;
  insert into public.acetate_shares (owner_id, kind, track_id, project_id, listing, expires_at, allow_download, pass_hash)
  values (
    me, p_kind,
    case when p_kind = 'track' then p_id else null end,
    case when p_kind = 'project' then p_id else null end,
    p_listing, p_expires, coalesce(p_download, false),
    case when pw is null then null else extensions.crypt(pw, extensions.gen_salt('bf')) end
  )
  returning * into row;
  row.pass_hash := null;
  return row;
end;
$$;

-- Shared pages get lyrics only when the owner opted in, and never the private note.
create or replace function public.acetate_pack_track(p_track uuid, p_position int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'note', null,
    'lyrics', case when t.lyrics_on_share then t.lyrics else null end,
    'position', p_position,
    'artwork_path', t.artwork_path,
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'label', v.label, 'version', v.version, 'path', v.path,
        'mime', v.mime, 'bytes', v.bytes, 'duration', v.duration, 'peaks', v.peaks
      ) order by v.version desc)
      from public.acetate_versions v where v.track_id = t.id
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'at', c.at_seconds, 'body', c.body,
        'name', coalesce(pr.display_name, c.guest_name, 'Listener'),
        'created_at', c.created_at
      ) order by c.at_seconds, c.created_at)
      from public.acetate_comments c
      left join public.profiles pr on pr.id = c.author_id
      where c.track_id = t.id
    ), '[]'::jsonb)
  )
  from public.acetate_tracks t
  where t.id = p_track;
$$;

revoke all on function public.acetate_pack_track(uuid, int) from public, anon, authenticated;
grant execute on function public.acetate_pack_track(uuid, int) to current_user, service_role;

-- A reserved upload with a missing or zero byte size no longer counts as the tiny reservation.
create or replace function public.acetate_upload_allowed(p_name text, p_size bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_size is not null and p_size > 0 and exists (
    select 1
    from public.acetate_reservations r
    where r.path = p_name
      and r.user_id = (select auth.uid())
      and r.expires_at > now()
      and p_size <= r.bytes
  );
$$;

create or replace function public.acetate_storage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  sz bigint := 0;
  reserved bigint;
  used bigint;
  pending bigint;
begin
  if tg_op = 'DELETE' then
    if old.bucket_id is distinct from 'acetate' then
      return old;
    end if;
    delete from public.acetate_stored where path = old.name;
    return old;
  end if;

  if new.bucket_id is distinct from 'acetate' then
    return new;
  end if;

  uid := public.try_uuid((storage.foldername(new.name))[1]);
  if uid is null then
    raise exception 'Acetate files must live in your folder';
  end if;
  if auth.role() is distinct from 'service_role' and auth.uid() is distinct from uid then
    raise exception 'You can only store Acetate files in your own library';
  end if;

  if new.metadata is not null then
    begin
      sz := coalesce((new.metadata->>'size')::bigint, 0);
    exception when others then
      sz := 0;
    end;
    if sz <= 0 then
      begin
        sz := coalesce((new.metadata->>'contentLength')::bigint, 0);
      exception when others then
        sz := 0;
      end;
    end if;
  end if;

  perform pg_advisory_xact_lock(814001, hashtext(uid::text));

  select r.bytes into reserved
  from public.acetate_reservations r
  where r.path = new.name and r.user_id = uid and r.expires_at > now();
  if reserved is null then
    raise exception 'Reserve Acetate space before uploading';
  end if;
  if sz <= 0 then
    raise exception 'Acetate could not read the upload size';
  end if;
  if sz > reserved then
    raise exception 'File is larger than the reserved Acetate upload';
  end if;

  if not public.acetate_premium_active(uid) then
    select coalesce(sum(bytes), 0) into used from public.acetate_stored where owner_id = uid;
    select coalesce(sum(r.bytes), 0) into pending
    from public.acetate_reservations r
    where r.user_id = uid
      and r.expires_at > now()
      and r.path is distinct from new.name
      and not exists (select 1 from public.acetate_stored s where s.path = r.path);
    if used + pending + sz > public.acetate_free_quota() then
      raise exception 'Acetate storage is full (5 GB on the free plan). Premium is unlimited.';
    end if;
  end if;

  insert into public.acetate_stored (path, owner_id, bytes)
  values (new.name, uid, sz)
  on conflict (path) do update set bytes = excluded.bytes, owner_id = excluded.owner_id;
  return new;
end;
$$;

grant execute on function public.acetate_upload_allowed(text, bigint) to authenticated;
grant execute on function public.acetate_toggle_like(uuid) to authenticated;
grant execute on function public.acetate_set_follow(uuid, boolean) to authenticated;
grant execute on function public.acetate_invite_collaborator(uuid, text, text) to authenticated;
grant execute on function public.acetate_remove_collaborator(uuid, uuid) to authenticated;
grant execute on function public.acetate_public_profile(text) to anon, authenticated;
grant execute on function public.acetate_mark_notifications(bigint) to authenticated;
grant execute on function public.acetate_share_create(text, uuid, text, text, timestamptz, boolean) to authenticated;

-- --------------------------------------------------------------------- realtime
-- Postgres changes are still filtered by each table's RLS.

do $$
declare t text;
begin
  foreach t in array array[
    'acetate_projects',
    'acetate_tracks',
    'acetate_memberships',
    'acetate_versions',
    'acetate_comments',
    'acetate_shares',
    'acetate_stored',
    'acetate_entitlements',
    'acetate_listens',
    'acetate_likes',
    'acetate_follows',
    'acetate_collaborators',
    'acetate_notifications'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;

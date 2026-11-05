-- NexusGram saves, reports, admin username + Videos playlists/chapters

create table if not exists public.gram_saves (
  post_id uuid not null references public.gram_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists gram_saves_user_idx on public.gram_saves (user_id, created_at desc);
alter table public.gram_saves enable row level security;
drop policy if exists gram_saves_all on public.gram_saves;
create policy gram_saves_all on public.gram_saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.gram_saves to authenticated;

create table if not exists public.gram_reports (
  id bigserial primary key,
  post_id uuid references public.gram_posts(id) on delete cascade,
  story_id uuid references public.gram_stories(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open','reviewed','removed','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);
create index if not exists gram_reports_open_idx on public.gram_reports (status, created_at desc);
alter table public.gram_reports enable row level security;
drop policy if exists gram_reports_insert on public.gram_reports;
create policy gram_reports_insert on public.gram_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists gram_reports_read on public.gram_reports;
create policy gram_reports_read on public.gram_reports for select to authenticated using (reporter_id = auth.uid() or public.my_rank() >= 2);
drop policy if exists gram_reports_staff on public.gram_reports;
create policy gram_reports_staff on public.gram_reports for update to authenticated using (public.my_rank() >= 2);
grant select, insert on public.gram_reports to authenticated;
grant update (status, reviewed_at, reviewed_by) on public.gram_reports to authenticated;

create or replace function public.admin_set_username(p_user uuid, p_username text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v text := lower(trim(coalesce(p_username, '')));
  old text;
  target_rank int;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_user is null then raise exception 'Missing user'; end if;
  select public.role_rank(site_role) into target_rank from public.profiles where id = p_user;
  if target_rank is null then raise exception 'User not found'; end if;
  if p_user <> auth.uid() and target_rank >= public.my_rank() then
    raise exception 'Cannot rename someone at or above your rank';
  end if;
  perform public.check_username_rules(v);
  select username into old from public.profiles where id = p_user;
  if old = v then return v; end if;
  if exists (select 1 from public.profiles where username = v and id <> p_user)
     or exists (select 1 from public.username_aliases where username = v and user_id <> p_user) then
    raise exception 'That username is taken';
  end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles set username = v where id = p_user;
  perform set_config('nexus.admin_write', 'off', true);
  insert into public.username_changes (user_id, old_name, new_name) values (p_user, old, v);
  insert into public.admin_actions (actor_id, action, target_id, detail)
    values (auth.uid(), 'set_username', p_user, jsonb_build_object('old', old, 'new', v));
  return v;
end;
$$;
revoke all on function public.admin_set_username(uuid, text) from public;
grant execute on function public.admin_set_username(uuid, text) to authenticated;

create or replace function public.mod_remove_gram_post(p_post uuid, p_reason text default '')
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  a uuid;
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  select author_id into a from public.gram_posts where id = p_post;
  if a is null then raise exception 'Post not found'; end if;
  delete from public.gram_posts where id = p_post;
  insert into public.admin_actions (actor_id, action, target_id, detail)
    values (auth.uid(), 'remove_gram_post', a, jsonb_build_object('post_id', p_post, 'reason', coalesce(p_reason,'')));
  update public.gram_reports set status = 'removed', reviewed_at = now(), reviewed_by = auth.uid()
    where post_id = p_post and status = 'open';
  return true;
end;
$$;
revoke all on function public.mod_remove_gram_post(uuid, text) from public;
grant execute on function public.mod_remove_gram_post(uuid, text) to authenticated;

create or replace function public.gram_admin_stats()
returns json
language sql
stable
security definer
set search_path to ''
as $$
  select case when public.my_rank() < 2 then json_build_object('error','staff only') else json_build_object(
    'posts', (select count(*)::int from public.gram_posts),
    'shorts', (select count(*)::int from public.gram_posts where kind = 'short'),
    'stories_live', (select count(*)::int from public.gram_stories where expires_at > now()),
    'follows', (select count(*)::int from public.gram_follows),
    'reports_open', (select count(*)::int from public.gram_reports where status = 'open'),
    'likes', (select count(*)::int from public.gram_likes)
  ) end;
$$;
revoke all on function public.gram_admin_stats() from public;
grant execute on function public.gram_admin_stats() to authenticated;

alter table public.videos add column if not exists chapters jsonb not null default '[]'::jsonb;

create table if not exists public.video_playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  visibility text not null default 'public' check (visibility in ('public','unlisted','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_playlists_owner_idx on public.video_playlists (owner_id, updated_at desc);
alter table public.video_playlists enable row level security;
drop policy if exists video_playlists_read on public.video_playlists;
create policy video_playlists_read on public.video_playlists for select to authenticated
  using (visibility <> 'private' or owner_id = auth.uid() or public.my_rank() >= 2);
drop policy if exists video_playlists_write on public.video_playlists;
create policy video_playlists_write on public.video_playlists for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.video_playlists to authenticated;

create table if not exists public.video_playlist_items (
  playlist_id uuid not null references public.video_playlists(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  position int not null default 0,
  added_at timestamptz not null default now(),
  primary key (playlist_id, video_id)
);
create index if not exists video_playlist_items_pos_idx on public.video_playlist_items (playlist_id, position);
alter table public.video_playlist_items enable row level security;
drop policy if exists video_playlist_items_read on public.video_playlist_items;
create policy video_playlist_items_read on public.video_playlist_items for select to authenticated using (
  exists (select 1 from public.video_playlists p where p.id = playlist_id and (p.visibility <> 'private' or p.owner_id = auth.uid() or public.my_rank() >= 2))
);
drop policy if exists video_playlist_items_write on public.video_playlist_items;
create policy video_playlist_items_write on public.video_playlist_items for all to authenticated using (
  exists (select 1 from public.video_playlists p where p.id = playlist_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.video_playlists p where p.id = playlist_id and p.owner_id = auth.uid())
);
grant select, insert, update, delete on public.video_playlist_items to authenticated;

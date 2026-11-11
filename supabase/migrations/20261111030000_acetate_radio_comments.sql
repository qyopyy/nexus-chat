-- Listener comments on cuts you can hear, plus a radio shelf built from
-- likes and follows. Lyrics stay hidden unless the owner opted in or it is yours.

drop policy if exists acetate_comments_listener_read on public.acetate_comments;
create policy acetate_comments_listener_read on public.acetate_comments
  for select to authenticated
  using (public.acetate_can_hear(track_id));

drop policy if exists acetate_comments_listener_insert on public.acetate_comments;
create policy acetate_comments_listener_insert on public.acetate_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and share_id is null
    and public.acetate_can_hear(track_id)
  );

create or replace function public.acetate_radio()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  likes jsonb;
  following jsonb;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into likes
  from (
    select jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'owner_id', t.owner_id,
      'owner_name', coalesce(p.display_name, p.username),
      'lyrics', case when t.owner_id = me or t.lyrics_on_share then t.lyrics else null end,
      'mine', t.owner_id = me,
      'likes', (select count(*) from public.acetate_likes l2 where l2.track_id = t.id),
      'token', (
        select s.token from public.acetate_shares s
        where s.kind = 'track' and s.track_id = t.id and s.listing = 'public'
          and not s.revoked and s.pass_hash is null
          and (s.expires_at is null or s.expires_at > now())
        order by s.created_at desc limit 1
      )
    ) as item
    from public.acetate_likes l
    join public.acetate_tracks t on t.id = l.track_id
    join public.profiles p on p.id = t.owner_id
    where l.user_id = me
    order by l.created_at desc
    limit 40
  ) q;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into following
  from (
    select jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'owner_id', t.owner_id,
      'owner_name', coalesce(p.display_name, p.username),
      'lyrics', case when t.lyrics_on_share then t.lyrics else null end,
      'mine', false,
      'likes', (select count(*) from public.acetate_likes l2 where l2.track_id = t.id),
      'token', (
        select s.token from public.acetate_shares s
        where s.kind = 'track' and s.track_id = t.id and s.listing = 'public'
          and not s.revoked and s.pass_hash is null
          and (s.expires_at is null or s.expires_at > now())
        order by s.created_at desc limit 1
      )
    ) as item
    from public.acetate_follows f
    join public.acetate_tracks t on t.owner_id = f.followee_id
    join public.profiles p on p.id = t.owner_id
    where f.follower_id = me and public.acetate_track_is_public(t.id)
    order by t.updated_at desc
    limit 40
  ) q;

  return jsonb_build_object('likes', likes, 'following', following);
end;
$$;

revoke all on function public.acetate_radio() from public, anon;
grant execute on function public.acetate_radio() to authenticated;

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
    'lyrics', case when t.lyrics_on_share then t.lyrics else null end,
    'likes', (select count(*) from public.acetate_likes l where l.track_id = t.id),
    'comments', (select count(*) from public.acetate_comments c where c.track_id = t.id),
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

revoke all on function public.acetate_public_profile(text) from public;
grant execute on function public.acetate_public_profile(text) to anon, authenticated;

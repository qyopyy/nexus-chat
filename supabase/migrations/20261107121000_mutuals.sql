-- Mutual friends & servers shown on profile cards (only things you're both part of).
create or replace function public.profile_mutuals(p_user uuid)
returns json language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  my_friends as (
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end as uid
    from public.friendships f, me where f.status = 'accepted' and me.id in (f.requester_id, f.addressee_id)
  ),
  their_friends as (
    select case when f.requester_id = p_user then f.addressee_id else f.requester_id end as uid
    from public.friendships f where f.status = 'accepted' and p_user in (f.requester_id, f.addressee_id)
  ),
  friends as (select uid from my_friends intersect select uid from their_friends),
  servers as (
    select s.id, s.name, s.icon_url, s.icon_color from public.spaces s
    where exists (select 1 from public.space_members a, me where a.space_id = s.id and a.user_id = me.id)
      and exists (select 1 from public.space_members b where b.space_id = s.id and b.user_id = p_user)
  )
  select case when (select id from me) is null or (select id from me) = p_user then json_build_object('friends', '[]'::json, 'friend_count', 0, 'servers', '[]'::json)
  else json_build_object(
    'friends', coalesce((select json_agg(uid) from (select uid from friends limit 8) x), '[]'::json),
    'friend_count', (select count(*) from friends),
    'servers', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'icon_url', icon_url, 'icon_color', icon_color)) from (select * from servers limit 12) y), '[]'::json)
  ) end;
$$;
revoke execute on function public.profile_mutuals(uuid) from public, anon;
grant execute on function public.profile_mutuals(uuid) to authenticated, service_role;

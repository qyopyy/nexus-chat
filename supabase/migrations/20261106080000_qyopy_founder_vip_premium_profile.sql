-- Founder / VIP / Premium badges for public Gram profiles + qyopy profile polish.

insert into public.badges (key, name, icon, color, priority, description)
values ('founder', 'Founder', '👑', '#F0B232', 120, 'Founded Nexus')
on conflict (key) do update set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color,
  priority = excluded.priority,
  description = excluded.description;

update public.badges
set key = 'premium', name = 'Premium', icon = '⭐', color = '#FAA61A', priority = 110, description = 'Nexus Lighting Premium'
where name = 'Premium' and (key is null or key = 'premium');

insert into public.badges (key, name, icon, color, priority, description)
values ('vip', 'VIP', '💎', '#EB459E', 85, 'VIP member')
on conflict (key) do nothing;

with u as (select id from public.profiles where username = 'qyopy' limit 1),
b as (
  select id from public.badges
  where key in ('founder','vip','premium','verified','partner','artist','developer','producer','og','early','high_profile','admin')
)
insert into public.user_badges (user_id, badge_id)
select u.id, b.id from u cross join b
on conflict do nothing;

update public.user_badges ub
set revoked_at = null
from public.profiles p, public.badges b
where ub.user_id = p.id and ub.badge_id = b.id
  and p.username = 'qyopy'
  and b.key in ('founder','vip','premium','verified','partner','artist','developer','producer','og','early','high_profile','admin')
  and ub.revoked_at is not null;

update public.profiles set
  site_role = 'owner',
  premium_tier = 'dist_video',
  premium_until = '2099-12-31 23:59:59+00',
  bio = E'Founder of Nexus · Artist & Record Label CEO from Hungary\nBuilding the social home for chat, music & creators.\n\n🔗 nexusproject.cc',
  links = jsonb_build_array(
    jsonb_build_object('type','website','url','https://nexusproject.cc','label','Nexus Project'),
    jsonb_build_object('type','instagram','url','https://instagram.com/qyopyprod','label','Instagram · @qyopyprod'),
    jsonb_build_object('type','youtube','url','https://youtube.com/@qyopyproductions','label','YouTube · @qyopyproductions'),
    jsonb_build_object('type','tiktok','url','https://tiktok.com/@qyopy','label','TikTok · @qyopy'),
    jsonb_build_object('type','x','url','https://x.com/qyopyprod','label','X · @qyopyprod'),
    jsonb_build_object('type','x','url','https://x.com/nexusproject_chat','label','X · @nexusproject_chat'),
    jsonb_build_object('type','telegram','url','https://t.me/qyopy','label','Telegram'),
    jsonb_build_object('type','soundcloud','url','https://soundcloud.com/qyopy','label','SoundCloud · qyopy'),
    jsonb_build_object('type','website','url','https://qyopy.com','label','qyopy.com')
  ),
  profile_effect = 'aurora',
  profile_border = 'gold',
  profile_theme = 'midnight'
where username = 'qyopy';

create or replace function public.gram_profile(p_username text)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare p public.profiles; me uuid := auth.uid();
begin
  select * into p from public.profiles where username = lower(trim(p_username));
  if p.id is null or (p.banned_until is not null and p.banned_until > now()) then return null; end if;
  return json_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'avatar_color', p.avatar_color,
    'banner_url', p.banner_url,
    'banner_color', p.banner_color,
    'bio', p.bio,
    'links', coalesce(p.links, '[]'::jsonb),
    'verified', p.site_role in ('owner', 'admin')
      or exists (
        select 1 from public.user_badges ub
        join public.badges b on b.id = ub.badge_id
        where ub.user_id = p.id and ub.revoked_at is null and b.key = 'verified'
      )
      or (p.premium_until is not null and p.premium_until > now() and p.premium_tier is not null),
    'role', p.site_role,
    'premium_tier', case when p.premium_until is not null and p.premium_until > now() then p.premium_tier else null end,
    'premium_until', p.premium_until,
    'badges', coalesce((
      select json_agg(json_build_object(
        'key', b.key,
        'name', b.name,
        'icon', b.icon,
        'color', b.color,
        'description', b.description,
        'priority', b.priority
      ) order by b.priority desc nulls last)
      from public.user_badges ub
      join public.badges b on b.id = ub.badge_id
      where ub.user_id = p.id and ub.revoked_at is null and b.key is not null
    ), '[]'::json),
    'followers', (select count(*) from public.gram_follows f where f.followee_id = p.id),
    'following', (select count(*) from public.gram_follows f where f.follower_id = p.id),
    'posts', (select count(*) from public.gram_posts g where g.author_id = p.id),
    'likes', coalesce((select sum(g.like_count) from public.gram_posts g where g.author_id = p.id), 0),
    'is_following', me is not null and exists (select 1 from public.gram_follows f where f.follower_id = me and f.followee_id = p.id),
    'follows_you', me is not null and exists (select 1 from public.gram_follows f where f.follower_id = p.id and f.followee_id = me),
    'grid', coalesce((select json_agg(x order by x.created_at desc) from (
        select g.id, g.kind, g.media -> 0 as cover, jsonb_array_length(g.media) as count, g.like_count, g.comment_count, g.view_count, g.created_at
        from public.gram_posts g where g.author_id = p.id order by g.created_at desc limit 60) x), '[]'::json),
    'stories', coalesce((select json_agg(s order by s.created_at) from (
        select st.id, st.media, st.caption, st.created_at, st.expires_at, st.like_count
        from public.gram_stories st where st.author_id = p.id and st.expires_at > now()) s), '[]'::json)
  );
end;
$function$;

grant execute on function public.gram_profile(text) to anon, authenticated;

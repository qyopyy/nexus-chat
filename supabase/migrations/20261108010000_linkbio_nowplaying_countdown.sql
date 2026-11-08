-- Nexus Link: live "Listening on Spotify" card, release countdown, scheduled links (start/end live in each link object)

alter table public.linkbio_pages add column if not exists show_now_playing boolean not null default true;
alter table public.linkbio_pages add column if not exists countdown_at timestamptz;
alter table public.linkbio_pages add column if not exists countdown_label text check (char_length(countdown_label) <= 60);
alter table public.linkbio_pages add column if not exists countdown_url text check (char_length(countdown_url) <= 500);

-- what the owner is playing right now (written by the `nowplaying` function only when they share it)
create or replace function public.linkbio_now_playing_for(r public.linkbio_pages)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when not coalesce(r.show_now_playing, true) or coalesce(r.password_enabled, false) or coalesce(r.suspended, false) then null
    else (select p.now_playing from public.profiles p where p.id = r.owner_id
          and p.now_playing is not null
          and coalesce((p.now_playing->>'at')::timestamptz, now()) > now() - interval '20 minutes')
  end;
$$;
revoke execute on function public.linkbio_now_playing_for(public.linkbio_pages) from public, anon, authenticated;

-- polled by the public page every ~15 s
create or replace function public.linkbio_now_playing(p_username text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.linkbio_pages;
begin
  select * into r from public.linkbio_pages where username = lower(trim(p_username)) and published = true;
  if r.id is null then return null; end if;
  return jsonb_build_object('show', coalesce(r.show_now_playing, true), 'now', public.linkbio_now_playing_for(r));
end $$;
revoke execute on function public.linkbio_now_playing(text) from public;
grant execute on function public.linkbio_now_playing(text) to anon, authenticated;

-- owner-only setters for the new fields (keeps linkbio_save untouched)
create or replace function public.linkbio_save_extras(p jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.linkbio_pages; u text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.linkbio_pages where owner_id = me;
  if r.id is null then raise exception 'create page first'; end if;
  if coalesce(r.suspended, false) then raise exception 'page suspended — contact Nexus Link admin'; end if;
  if p ? 'show_now_playing' then r.show_now_playing := coalesce((p->>'show_now_playing')::boolean, true); end if;
  if p ? 'countdown_at' then r.countdown_at := nullif(p->>'countdown_at', '')::timestamptz; end if;
  if p ? 'countdown_label' then r.countdown_label := nullif(left(btrim(p->>'countdown_label'), 60), ''); end if;
  if p ? 'countdown_url' then
    u := nullif(btrim(p->>'countdown_url'), '');
    if u is not null and (u !~* '^https://' or not public.linkbio_url_is_safe(u)) then raise exception 'countdown link blocked by malware protection'; end if;
    r.countdown_url := left(u, 500);
  end if;
  update public.linkbio_pages set show_now_playing = r.show_now_playing, countdown_at = r.countdown_at, countdown_label = r.countdown_label,
    countdown_url = r.countdown_url, updated_at = now() where id = r.id returning * into r;
  return public.linkbio_page_json(r, true);
end $$;
revoke execute on function public.linkbio_save_extras(jsonb) from public, anon;
grant execute on function public.linkbio_save_extras(jsonb) to authenticated;

create or replace function public.linkbio_page_json(r public.linkbio_pages, p_owner boolean default false)
returns json language plpgsql stable set search_path to '' as $function$
declare
  owner_role text;
  prest json;
begin
  select site_role into owner_role from public.profiles where id = r.owner_id;
  begin
    prest := public.linkbio_presence(r.username);
  exception when others then
    prest := json_build_object('status', 'offline');
  end;
  return json_build_object(
    'id', r.id,
    'owner_id', case when p_owner then r.owner_id else null end,
    'username', r.username,
    'display_name', r.display_name,
    'bio', r.bio,
    'avatar_url', r.avatar_url,
    'links', coalesce(r.links, '[]'::jsonb),
    'theme', r.theme,
    'background', r.background,
    'animated_bg', r.animated_bg,
    'font', r.font,
    'glow', r.glow,
    'accent', r.accent,
    'premium', public.linkbio_is_premium(r),
    'premium_until', case when p_owner then r.premium_until else null end,
    'published', r.published,
    'suspended', coalesce(r.suspended, false),
    'suspend_reason', case when p_owner then r.suspend_reason else null end,
    'view_count', r.view_count,
    'password_enabled', r.password_enabled,
    'password_protected', r.password_enabled and r.page_password_hash is not null,
    'button_style', r.button_style,
    'layout', r.layout,
    'show_views', r.show_views,
    'show_branding', r.show_branding,
    'show_presence', coalesce(r.show_presence, true),
    'nsfw', r.nsfw,
    'seo_title', r.seo_title,
    'seo_description', r.seo_description,
    'banner_url', r.banner_url,
    'music_url', r.music_url,
    'custom_status', r.custom_status,
    'verified', public.linkbio_owner_verified(r.owner_id),
    'site_role', owner_role,
    'badges', public.linkbio_owner_badges(r.owner_id),
    'presence', prest,
    'show_now_playing', coalesce(r.show_now_playing, true),
    'now_playing', public.linkbio_now_playing_for(r),
    'countdown_at', r.countdown_at,
    'countdown_label', r.countdown_label,
    'countdown_url', r.countdown_url,
    'created_at', case when p_owner then r.created_at else null end,
    'updated_at', case when p_owner then r.updated_at else null end
  );
end;
$function$;

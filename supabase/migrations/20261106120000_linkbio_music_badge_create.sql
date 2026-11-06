-- Nexus Link: public music uploads + badge create with stable key.
-- Unlock music_url for all Link pages (Spotify embeds + uploaded audio).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'linkbio-music',
  'linkbio-music',
  true,
  20971520,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
    'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/webm',
    'audio/flac', 'audio/x-m4a', 'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "linkbio music read" on storage.objects;
create policy "linkbio music read"
  on storage.objects for select
  to public
  using (bucket_id = 'linkbio-music');

drop policy if exists "linkbio music insert own" on storage.objects;
create policy "linkbio music insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'linkbio-music'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "linkbio music update own" on storage.objects;
create policy "linkbio music update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'linkbio-music'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "linkbio music delete own" on storage.objects;
create policy "linkbio music delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'linkbio-music'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop function if exists public.admin_create_badge(text, text, text, text);
drop function if exists public.admin_create_badge(text, text, text, text, text);

create or replace function public.admin_create_badge(
  p_name text,
  p_icon text,
  p_color text,
  p_description text default null,
  p_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  bid uuid;
  k text := nullif(lower(trim(coalesce(p_key, ''))), '');
begin
  perform public.assert_can_moderate(null, 3);
  if k is not null then
    if k !~ '^[a-z0-9_]{2,32}$' then
      raise exception 'invalid badge key';
    end if;
    if exists (select 1 from public.badges where key = k and archived_at is null) then
      raise exception 'badge key taken';
    end if;
  else
    k := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '_', 'g'));
    k := trim(both '_' from k);
    if char_length(k) < 2 then
      k := 'badge_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end if;
    k := left(k, 28);
    if exists (select 1 from public.badges where key = k and archived_at is null) then
      k := left(k, 20) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
  end if;

  insert into public.badges (key, name, icon, color, description, priority)
  values (k, trim(p_name), trim(p_icon), p_color, nullif(trim(coalesce(p_description, '')), ''), 10)
  returning id into bid;

  perform public.log_admin(null, 'create_badge', jsonb_build_object('badge', p_name, 'key', k));
  return bid;
end;
$$;

grant execute on function public.admin_create_badge(text, text, text, text, text) to authenticated;

-- Re-issue linkbio_save with music unlocked + longer URL for public storage links.
create or replace function public.linkbio_save(p jsonb)
returns json
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  me uuid := auth.uid();
  r public.linkbio_pages;
  new_user text;
  pw text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.linkbio_pages where owner_id = me;
  if r.id is null then raise exception 'create page first'; end if;

  if p ? 'username' then
    new_user := lower(trim(p->>'username'));
    if new_user !~ '^[a-z0-9_]{2,24}$' then raise exception 'invalid username'; end if;
    if exists (select 1 from public.linkbio_pages where username = new_user and id <> r.id) then
      raise exception 'username taken';
    end if;
    r.username := new_user;
  end if;

  if p ? 'display_name' then r.display_name := left(trim(p->>'display_name'), 48); end if;
  if p ? 'bio' then r.bio := nullif(left(trim(p->>'bio'), 280), ''); end if;
  if p ? 'avatar_url' then r.avatar_url := nullif(left(trim(p->>'avatar_url'), 500), ''); end if;
  if p ? 'links' then
    if jsonb_typeof(p->'links') <> 'array' then raise exception 'links must be array'; end if;
    if jsonb_array_length(p->'links') > 20 then raise exception 'too many links'; end if;
    r.links := p->'links';
  end if;
  if p ? 'theme' then r.theme := p->>'theme'; end if;
  if p ? 'background' then
    if (p->>'background') in ('999','waves') and not public.linkbio_is_premium(r) then
      raise exception 'premium theme background';
    end if;
    r.background := p->>'background';
  end if;
  if p ? 'animated_bg' then r.animated_bg := (p->>'animated_bg')::boolean; end if;
  if p ? 'font' then
    if (p->>'font') = 'juice' and not public.linkbio_is_premium(r) then
      raise exception 'premium font';
    end if;
    r.font := p->>'font';
  end if;
  if p ? 'glow' then r.glow := (p->>'glow')::boolean; end if;
  if p ? 'accent' then r.accent := nullif(p->>'accent', ''); end if;
  if p ? 'published' then r.published := (p->>'published')::boolean; end if;

  if p ? 'button_style' then r.button_style := p->>'button_style'; end if;
  if p ? 'layout' then r.layout := p->>'layout'; end if;
  if p ? 'show_views' then r.show_views := (p->>'show_views')::boolean; end if;
  if p ? 'show_branding' then
    if (p->>'show_branding')::boolean = false and not public.linkbio_is_premium(r) then
      raise exception 'premium: hide branding';
    end if;
    r.show_branding := (p->>'show_branding')::boolean;
  end if;
  if p ? 'nsfw' then r.nsfw := (p->>'nsfw')::boolean; end if;
  if p ? 'seo_title' then r.seo_title := nullif(left(trim(p->>'seo_title'), 80), ''); end if;
  if p ? 'seo_description' then r.seo_description := nullif(left(trim(p->>'seo_description'), 200), ''); end if;
  if p ? 'banner_url' then r.banner_url := nullif(left(trim(p->>'banner_url'), 500), ''); end if;
  if p ? 'music_url' then
    -- Spotify / SoundCloud / Apple Music / uploaded audio — available to all Link pages
    r.music_url := nullif(left(trim(p->>'music_url'), 800), '');
  end if;
  if p ? 'custom_status' then r.custom_status := nullif(left(trim(p->>'custom_status'), 80), ''); end if;

  if p ? 'password_enabled' then
    r.password_enabled := (p->>'password_enabled')::boolean;
    if not r.password_enabled then r.page_password_hash := null; end if;
  end if;
  if p ? 'page_password' then
    pw := p->>'page_password';
    if pw is null or pw = '' then
      r.page_password_hash := null;
      r.password_enabled := false;
    else
      if char_length(pw) < 4 then raise exception 'page password too short'; end if;
      r.page_password_hash := extensions.crypt(pw, extensions.gen_salt('bf'));
      r.password_enabled := true;
    end if;
  end if;

  update public.linkbio_pages set
    username = r.username,
    display_name = r.display_name,
    bio = r.bio,
    avatar_url = r.avatar_url,
    links = r.links,
    theme = r.theme,
    background = r.background,
    animated_bg = r.animated_bg,
    font = r.font,
    glow = r.glow,
    accent = r.accent,
    published = r.published,
    password_enabled = r.password_enabled,
    page_password_hash = r.page_password_hash,
    button_style = r.button_style,
    layout = r.layout,
    show_views = r.show_views,
    show_branding = r.show_branding,
    nsfw = r.nsfw,
    seo_title = r.seo_title,
    seo_description = r.seo_description,
    banner_url = r.banner_url,
    music_url = r.music_url,
    custom_status = r.custom_status,
    updated_at = now()
  where id = r.id
  returning * into r;

  return public.linkbio_page_json(r, true);
end;
$fn$;

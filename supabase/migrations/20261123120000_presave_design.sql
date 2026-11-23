-- Expanded pre-save appearance settings. Apply after the pre-save service
-- migration; existing campaigns retain their original theme and gain defaults.
begin;

alter table public.presave_campaigns
  drop constraint presave_campaigns_theme_check,
  add constraint presave_campaigns_theme_check check (theme in (
    'midnight', 'paper', 'aurora', 'sunset', 'galaxy', 'nebula', 'starlight',
    'ocean', 'forest', 'rose', 'ember', 'arctic', 'lavender', 'monochrome',
    'neon', 'champagne', 'custom'
  )),
  add column background_url text check (public.presave_valid_https(background_url)),
  add column background_overlay integer not null default 55 check (background_overlay between 0 and 90),
  add column background_motion boolean not null default true,
  add column background_color text not null default '#101019' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  add column text_color text not null default '#f5f5fb' check (text_color ~ '^#[0-9a-fA-F]{6}$'),
  add column button_style text not null default 'rounded' check (button_style in ('rounded', 'pill', 'square')),
  add column font_style text not null default 'modern' check (font_style in ('modern', 'editorial', 'mono'));

-- Keep the narrow public projection. Drafts, owner identities and provider
-- credentials remain private; the original campaign RLS/MFA policies apply.
create or replace function public.presave_public(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', c.slug, 'title', c.title, 'artist', c.artist, 'description', c.description,
    'release_at', c.release_at, 'artwork_url', c.artwork_url, 'theme', c.theme,
    'layout', c.layout, 'accent', c.accent, 'button_label', c.button_label,
    'spotify_uri', c.spotify_uri, 'links', c.links, 'show_countdown', c.show_countdown,
    'background_url', c.background_url, 'background_overlay', c.background_overlay,
    'background_motion', c.background_motion, 'background_color', c.background_color,
    'text_color', c.text_color, 'button_style', c.button_style, 'font_style', c.font_style
  ) from public.presave_campaigns c where c.slug = p_slug and c.published;
$$;
revoke all on function public.presave_public(text) from public;
grant execute on function public.presave_public(text) to anon, authenticated, service_role;

commit;

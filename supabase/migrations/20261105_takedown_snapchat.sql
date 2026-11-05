-- Add Snapchat alongside TikTok for copyright takedown notices.
alter table public.takedown_notices drop constraint if exists takedown_notices_platform_check;
alter table public.takedown_notices
  add constraint takedown_notices_platform_check
  check (platform in (
    'spotify',
    'apple',
    'deezer',
    'youtube',
    'youtube_music',
    'soundcloud',
    'tidal',
    'amazon',
    'tiktok',
    'snapchat'
  ));

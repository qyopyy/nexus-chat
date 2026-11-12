# Changelog

## Nexus 1.9.0

- Private scratch notes on a chat, visible only to you, synced with your account.
- A drop stays in the inbox until the file actually opens.
- Phone Link keeps a command pending until the phone finishes it, and two tabs won't both run it.
- Poll votes roll back when they don't save. A poll that never posts is deleted.
- Wump: search timers clear when you leave, a renamed pin no longer clears a route, the live count matches pin age, and friend pins keep the right person.
- Locator stops its web location watch if you leave before it starts. Sharing off on another device is picked up within a minute.
- Cloud sync continues after one file fails. Canceling a scheduled message reports a failure.
- Chat place cards open in Wump. The iOS shell allows the map tile hosts used by the MapLibre basemap.
- In-app What's new for 1.9.0.
- Patch and minor dependency updates: Next 16.4.6, lucide-react 1.72, Tailwind 4.3.5, Zustand 5.1, Supabase CLI 3.1. MapLibre stays on 5.x.

Migration (not applied to the live database): `supabase/migrations/20261112153000_chat_scratch.sql`.

## Acetate 1.2.0

- Owned Vault tracks can be kept on the device and played from that copy. Account lists them.
- Queue reorder, an empty queue syncs to other devices, and the queue restores after reload.
- The Projects tab opens projects. Project order can move up and down.
- Vault uploads name the current file and keep going when one file fails.
- Bring: SoundCloud import confirms, conversions save with a format label, partial playlists are explained.
- Separate iOS identity: bundle `hu.qyopy.acetate`, display name Acetate, its own icon and launch splash, user agent `AcetateApp`, artifact `Acetate-ipa`.

No new Acetate environment variables. SoundCloud, Spotify, and YouTube keys are unchanged, and audio from Spotify or YouTube is still never downloaded.

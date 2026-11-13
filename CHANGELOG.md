# Changelog

## Nexus 1.9.1

- Panel entry in the server rail, the chat sidebar, Apps, You, and Settings. It explains the distribution dashboard and opens it.
- On the web the panel opens in a new tab. In the iOS shell it opens in the in-app browser so the panel sign-in persists.
- Admin desk quick links for the panel, plus a Distribution panel switch (default on).
- Shell 1.9.1 includes `@capacitor/browser` and lists `panel.nexusproject.cc` in allowNavigation.

Migration (not applied): `supabase/migrations/20261113120000_distribution_panel.sql`.

Optional env: `NEXT_PUBLIC_DISTRIBUTION_PANEL_URL` (defaults to `https://panel.nexusproject.cc`).

## Acetate 1.2.1

- Distribution in the desktop sidebar, the phone tab bar and menu, and Account.
- Landing page at `/panel` with sign-in, sign-up, releases, and splits. Those paths were checked on the live panel.
- Same in-app browser on the Acetate iOS shell. The entry hides when the admin switch is off.

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
- Wump Wilds: catch original creatures on a street block and invite friends with a code.
- Phone voice memos record as M4A when the phone supports it, instead of an empty or unplayable WebM.

Migration (not applied): `supabase/migrations/20261112170000_wump_wilds.sql`.

Migration (not applied to the live database): `supabase/migrations/20261112153000_chat_scratch.sql`.

## Acetate 1.2.0

- Owned Vault tracks can be kept on the device and played from that copy. Account lists them.
- Queue reorder, an empty queue syncs to other devices, and the queue restores after reload.
- The Projects tab opens projects. Project order can move up and down.
- Vault uploads name the current file and keep going when one file fails.
- Bring: SoundCloud import confirms, conversions save with a format label, partial playlists are explained.
- Separate iOS identity: bundle `hu.qyopy.acetate`, display name Acetate, its own icon and launch splash, user agent `AcetateApp`, artifact `Acetate-ipa`.

No new Acetate environment variables. SoundCloud, Spotify, and YouTube keys are unchanged, and audio from Spotify or YouTube is still never downloaded.

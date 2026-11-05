# Nexus — Discord × Telegram web client

Next.js 16 + Supabase + WebRTC. Chat, voice/video calls, screen sharing, servers ("spaces") and friends — with a Discord layout (server rail, channels, voice panel, member list) and Telegram chat feel (chat list with previews + folders, bubbles, wallpaper, reply bars).

## Features

**Chat**
- DMs, group chats, and server text channels
- Telegram-style chat list: search, folders (All / Personal / Groups / Unread), last-message previews, unread badges
- Bubbles with tails, date pills, "NEW" divider, replies (click to jump), edit (↑ to edit last), delete, reactions + emoji picker
- Image / video / audio / file attachments (button, paste, or drag & drop, 25 MB)
- Typing indicators, link detection, big emoji-only messages, infinite scroll history
- Desktop notifications + sounds (silenced by Do Not Disturb)

**Calls (Discord-style)**
- 1:1 and group calls with ringing (accept / accept with video / decline), voice channels anyone in the space can drop into
- Mute, deafen, camera, **screen share with audio** (720p30 / 1080p30 / 1080p60 / source)
- **Per-user volume 0–200%** and local mute (right-click a tile or hover → volume)
- Speaking indicators, focus/spotlight a tile, fullscreen, call timer
- Voice settings: input/output device, input/output volume, mic test meter, voice activity sensitivity, **push-to-talk** with custom keybind, noise suppression, echo cancellation, auto gain, camera picker
- Who's in each voice channel (with mute/LIVE/video badges) visible in the sidebar, "Active Now" on the friends page

**Staff & identity**
- Site roles: 👑 Owner, 🛡️ Admin, 🔨 Moderator, 💎 VIP — animated gradient names, shown everywhere
- Permanent badges (Verified, Producer, Artist, OG, Booster… or create your own with any emoji + color)
- Admin Panel (Settings → Admin Panel): stats, member search, give roles/badges, timeouts (60s → 1 week), bans with reason, profile reset, full audit log
- Moderators can delete anyone's messages and time out/ban members ranked below them; everything is enforced in the database, not just the UI
- **The first account that registers becomes the Owner**

**Customization**
- 10 themes (Discord, Telegram Night, AMOLED, Nord, Dracula, Catppuccin, Rosé Pine, Cyberpunk, Forest, Sunset), custom accent color
- Custom background image (URL or upload) with blur / brightness / see-through panels, like modded Discord
- 12 fonts, UI zoom, message text size, compact mode, reduce motion
- QuickCSS box for your own CSS or `@import`ed BetterDiscord-style themes
- Animated avatars (GIF / animated WebP), 8 animated avatar decorations, profile banners, "About me"

**Access**
- Dedicated `/login` and `/register` pages, password strength meter, forgot/reset password

**Social**
- Friends by username (requests, accept/ignore, remove), online / idle / DND / invisible status, custom status, avatar upload + profile color
- Spaces with invite codes, text + voice channels, member list with owner crown

## Quick start (backend already set up)

The Supabase project **Nexus Chat** (`fcnabeudhdlugruqzezn`, Frankfurt) is live with the full schema, realtime policies, storage buckets and the `signup` function, and `.env.local` is already filled in:

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Create account**. The first account becomes the 👑 Owner — that's you, so register first. Then open **Settings → Admin Panel** to give friends VIP / Moderator / badges.

Registration no longer needs the old site password. The live `signup` function was redeployed without that gate (and with a soft rate limit + honeypot).

Before sharing a deployed URL: Supabase → Authentication → URL Configuration → set **Site URL** to it (used by password-reset emails).

### Stability, cache purge & anti-malware

- **`GET /api/health`** — liveness + Supabase reachability for uptime monitors.
- **`GET|POST /api/cache/purge`** — clears in-memory API caches (followers/unfurl). Vercel Cron runs it **daily** at 04:00 UTC (`vercel.json`) — Hobby plans reject hourly crons and fail the whole deploy. On Pro you can change the schedule to `0 * * * *`. Set `CRON_SECRET` for manual calls (`Authorization: Bearer …`).
- **Anti-malware upload gate** (`src/lib/malwareGuard.ts`) blocks executables, scripts, SVG/HTML, dangerous extensions, and mismatched image magic bytes before chat/radio/music/Gram/Cutroom uploads. Complements Nexus Shield (copyright), not a full AV engine.
- App Router `error.tsx` / `global-error.tsx` + ErrorBoundaries keep one broken panel from blanking the whole app.

## Setup from scratch (another Supabase project)

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Run the schema:** Supabase → SQL Editor → run `supabase/schema.sql`, then `supabase/schema_v2.sql`.
   They create tables, RLS, RPCs, roles/badges/moderation, realtime authorization for private channels, and storage buckets.
3. **Deploy the signup function** (creates confirmed accounts, so no confirmation emails / email rate limits):
   ```bash
   npx supabase functions deploy signup --no-verify-jwt --project-ref YOUR-REF
   ```
   Redeploy it if an older copy is already live. Older copies reject registration unless the caller presents the removed site-password token.
4. **Password reset emails:** Authentication → URL Configuration → set Site URL to your deployed URL.
5. **Env vars:**
   ```bash
   cp .env.local.example .env.local
   # fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (Settings → API)
   ```
6. **Run it:**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000, register (first account = Owner), register a second account in a private window, add each other by username, and call.

## Deploying

Push to GitHub and import into Vercel (or any Node host), adding the same env vars.
Camera, microphone and screen sharing only work on **HTTPS** (or `localhost`).

### TURN server (recommended for real-world use)
Calls connect peer-to-peer using public STUN. Around 10–20% of networks (mobile carriers, corporate Wi-Fi) need a TURN relay. Add one via env:
```
NEXT_PUBLIC_TURN_URL=turn:your.turn.server:3478
NEXT_PUBLIC_TURN_USERNAME=...
NEXT_PUBLIC_TURN_CREDENTIAL=...
```
Options: Cloudflare Calls TURN, Metered.ca, Twilio, or self-hosted coturn.

## Phone apps (APK + IPA)

`mobile/` is a Capacitor shell (iOS + Android) that opens the live site, so every web deploy updates the apps instantly. The shell ships the current Nexus app icon from `mobile/resources/icon-1024.png`.

- **Get the .apk / .ipa:** GitHub → Actions → **Android app (.apk / .aab)** or **iOS app (.ipa)** → Run workflow (optional URL). Builds also start automatically when `mobile/` changes land on `main`, and each run publishes a GitHub Release (`android-<n>` / `ios-<n>`).
- **Android install:** download `Nexus.apk` from the latest Android release → allow “Install unknown apps” → open the file.
- **iPhone install:** open **Sideloadly** on your Mac, plug in your iPhone, drag in `Nexus.ipa`, sign in with your Apple ID → Start. On the iPhone: Settings → General → VPN & Device Management → trust your Apple ID. With a free Apple ID the app must be re-signed every 7 days (Sideloadly can auto-refresh).
- Voice/video calls, chat, notifications sounds, themes all work. **Screen sharing isn't available on iPhone** (iOS doesn't allow it in apps like this) — the button hides automatically.
- Alternatively: open the site in Safari → Share → **Add to Home Screen** for an app-like icon with no install needed.

## How it works

| Piece | Tech |
|---|---|
| UI | Next.js App Router, React 19, Tailwind v4, zustand, lucide icons |
| Accounts, data, files | Supabase Auth, Postgres with RLS, Storage |
| Live messages, reactions, friend requests, ringing | Supabase Realtime `postgres_changes` (RLS-filtered) |
| Online status + who's in voice | Realtime presence on private channel `online` |
| Typing | Realtime broadcast on private `chat:<id>` |
| Call signaling | Realtime broadcast + presence on private `call:<id>` (members only, enforced by policy) |
| Media | WebRTC mesh with "perfect negotiation" (add/remove camera & screen anytime); Web Audio graph for per-user gain, deafen, VAD/PTT gate, speaking detection |

Mesh calls work best up to ~6–8 people. For bigger rooms, swap `src/lib/call.ts` for an SFU such as LiveKit.

## Project layout

```
supabase/schema.sql          database, RLS, RPCs, realtime + storage policies
src/lib/call.ts              call engine (WebRTC + audio graph)
src/lib/realtime.ts          live subscriptions, presence, typing
src/lib/data.ts              data actions (friends, chats, spaces, messages)
src/store/                   zustand stores (app + open chat)
src/components/layout/       server rail, Telegram chat list, space channels, user/voice panel, member list
src/components/chat/         chat view, header, messages, composer, friends page
src/components/call/         call stage, video tiles, volume menu, incoming call
src/components/modals/       settings (account / voice & video / notifications), spaces, groups, channels
```

## Notes
- Chat data is protected by Supabase accounts and row-level security. Public pages (smart links, gram profiles, vault shares) do not require a signed-in session.
- The `attachments` and `avatars` buckets are public-read with random, unguessable paths. Switch to signed URLs if you need stricter privacy.
- Any signed-in user can see who is online (presence). Restrict `can_access_topic('online')` if you want friends-only presence.
- Push-to-talk works while the tab is focused (browsers can't capture global keys).

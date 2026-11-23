# Nexus Chat & Media Workspace (`qyopyy/nexus-chat`)

A full-stack modular creative workspace combining **Wump Community Chat**, **SubVito & Universal Media Hub**, **[untitled] Music Studio & DSP Engine**, and an automatic **MOV/MKV → MP4 Video Transcoder**.

## Modules Included

### Nexus Drop

Open **Nexus Drop** in the desktop sidebar or mobile tools for AirDrop-style browser sharing. Create a sharing room, open its invitation on another device, then send files, links, or notes with explicit recipient approval.

- Direct encrypted WebRTC transfers, progress, cancellation, delivery acknowledgement, and explicit downloads.
- Up to 20 files / 100 MB per transfer, or an 8,000-character note. No account is required for a pairing room.
- Invitation-based device discovery, file selection and drag-and-drop, plus same-browser local-tab fallback when the pairing service is offline.
- Repairs the existing Phone Link cloud inbox's popup, error-reporting, and transfer-permission bugs.

Next.js entry: **`/drop/index.html`**. Legacy static entry: **`/public/drop/index.html`**. Both devices must keep the page open; some networks require a TURN relay, which is not provisioned here. This does not use Apple's AirDrop or Bluetooth discovery. See [Nexus Drop setup, security, migration, and verification](docs/nexus-drop.md).

### Nexus Pre-save

Create **unlimited, independent pre-save campaigns** with your existing Nexus account. Open **Pre-save links** from the workspace navigation or mobile tools.

- Choose from **16 preset themes plus a custom palette**, including animated Galaxy, Nebula, and Starlight backgrounds. Motion respects visitors' reduced-motion preferences.
- Customize cover artwork and background images (upload or HTTPS URL), image shading, background/text/accent colors, three typography styles, three button shapes, two layouts, countdown, and button text. Check the result in live, mobile, and desktop previews.
- Set your title, artist, description, release time, and link name. Reset the appearance independently of your release details.
- Create, search, edit, duplicate, publish, unpublish, and delete campaigns. There is no distribution-release requirement or campaign-count paywall.
- Share public pages with fans; drafts remain private. Campaigns and analytics are stored in Supabase.
- Spotify pre-saves use real PKCE authorization and a scheduled library-save worker once the service is configured. Other destinations are ordinary outbound links.

In the Next.js app, open **`/presave/index.html`**. The optional legacy static server serves the same files at **`/public/presave/index.html`**. Public campaign URLs add `?slug=your-release`.

**Deployment is required before publishing working links:** fresh installations apply the original pre-save service migration followed by `20261123120000_presave_design.sql`. Existing installations apply only the new design migration if the original is already recorded as applied. Then redeploy the pre-save Edge Function and publish the frontend assets, in that order. Configure the public URL; Spotify authorization additionally needs a Spotify developer application and the release worker. See [the complete pre-save setup guide](docs/presave-service.md) and [verification instructions](tests/README.md).

1. **SubVito & Universal Media Hub (`js/media-hub.js`)**
   - Pre-loaded **South Park Season 29** Hungarian archive (`subvito.eu/29-evad/...`) with 1-click episode launching (`29x01`, `29x02`, `29x03`, etc.).
   - Custom Season & Episode Slug Route Builder for `subvito.eu`.
   - **Smart Multi-Platform Embed Parser**: Paste any `subvito.eu`, `videa.hu`, `indavideo.hu`, `youtube.com`, `open.spotify.com`, or `soundcloud.com` link and it automatically transforms into a responsive embedded player.
   - Stage controls: Tall Embed Mode (720px) vs 16:9 Theater Mode, Sandbox Popup Blocker Toggle, and 1-Click Share to `#watch-party`.

2. **Wump Community Chat (`js/wump-app.js`)**
   - Multi-channel real-time chat (`#watch-party`, `#general`, `#beats-showcase`, `#subvito-discuss`).
   - Automatic inline media card detection with 1-click **"Launch in Theater Stage"** integration.
   - Automatic `.mov` and `.mkv` chat attachment interception and conversion to `.mp4` (H.264/AAC).

3. **[untitled] Music Studio (`js/untitled-app.js` & `js/audio-engine.js`)**
   - 60FPS Web Audio API Spectrum Visualizer.
   - Real-time DSP FX Engine (Nightcore, Slowed + Reverb, Bass Boost, Clean Master).
   - Shareable custom track links (`nexus.chat/u/mxteen/...`) and artist profile verification badges.

4. **MOV / MKV → MP4 Video Converter (`js/video-converter.js`)**
   - Default H.264 / AAC faststart transcoding pipeline for chat attachments and standalone studio exports.

## Quick Start

Use Node.js 22.18 or newer.

```bash
git clone https://github.com/qyopyy/nexus-chat.git
cd nexus-chat
npm ci
cp .env.local.example .env.local
# Fill in the existing project's public Supabase URL and publishable key.
npm run dev
```

The main application runs with Next.js. Open `http://localhost:3000`; the pre-save dashboard is at `http://localhost:3000/presave/index.html`.

For a production build, run `npm run build`, then `npm start`. Validate changes with `npm run typecheck` and `npm test`.

To run the legacy root `index.html` workspace instead, use `npm run start:static` (or `npm run dev:static` for live reload). Its pre-save entry is `http://localhost:3000/public/presave/index.html`.

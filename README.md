# Nexus Chat & Media Workspace (`qyopyy/nexus-chat`)

A full-stack modular creative workspace combining **Wump Community Chat**, **SubVito & Universal Media Hub**, **[untitled] Music Studio & DSP Engine**, and an automatic **MOV/MKV → MP4 Video Transcoder**.

## Modules Included

### Nexus Pre-save

Create **unlimited, independent pre-save campaigns** with your existing Nexus account. Open **Pre-save links** from the workspace navigation or mobile tools.

- Customize artwork (upload or HTTPS URL), title, artist, description, release time, link name, four themes, two layouts, accent color, countdown, and button text.
- Create, search, edit, duplicate, publish, unpublish, and delete campaigns. There is no distribution-release requirement or campaign-count paywall.
- Share public pages with fans; drafts remain private. Campaigns and analytics are stored in Supabase.
- Spotify pre-saves use real PKCE authorization and a scheduled library-save worker once the service is configured. Other destinations are ordinary outbound links.

With the current static server, open **`/public/presave/index.html`**. A Next.js deployment serves the same files at **`/presave/index.html`**. Public campaign URLs add `?slug=your-release`.

**Deployment is required before publishing working links:** apply the pre-save migration, deploy its Edge Function, and configure the public URL. Spotify authorization additionally needs a Spotify developer application and the release worker. See [the complete pre-save setup guide](docs/presave-service.md) and [verification instructions](tests/README.md).

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

```bash
git clone https://github.com/qyopyy/nexus-chat.git
cd nexus-chat
npm install
npm start
```

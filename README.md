# Nexus Chat & Media Workspace (`qyopyy/nexus-chat`)

A full-stack modular creative workspace combining **Wump Community Chat**, **SubVito & Universal Media Hub**, **[untitled] Music Studio & DSP Engine**, and an automatic **MOV/MKV → MP4 Video Transcoder**.

## Modules Included

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
npx serve .
```

Or open `index.html` directly in any modern browser.

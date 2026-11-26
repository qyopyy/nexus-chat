# Configuration

The server reads environment variables once at startup (`src/adapters/config/env-config.ts`). `bun start` also loads `.env` from the repository root (Bun does this on its own). On a deployed host, non-secret settings go in `.env` and secrets in `~/Library/Application Support/playgta/server.env` (mode 600), which the LaunchAgent loads after `.env`.

Invalid or inconsistent values stop the server and print every problem at once. Variables that come in pairs must be set together. Booleans accept `on/off`, `true/false`, `yes/no` and `1/0`.

## Server

| Variable        | Default     | Description                                                                                                                                                                                             |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`          | `127.0.0.1` | Interface to bind. Keep loopback behind a tunnel; `0.0.0.0` opens it to the network.                                                                                                                    |
| `PORT`          | `3000`      | HTTP and WebSocket port.                                                                                                                                                                                |
| `PUBLIC_URL`    |             | Public address, e.g. `https://play.example.com`. Used for the OAuth redirect URL, the WebSocket origin check (only this exact origin may connect) and HSTS. Without it, the Origin must match the Host. |
| `TRUSTED_PROXY` | `none`      | What sits in front of the server. `cloudflare`: a Cloudflare Tunnel, so `CF-Connecting-IP` identifies visitors. `none`: the header is ignored. `ADMIN_TOKEN` with `PUBLIC_URL` requires `cloudflare`.   |

## Player page

| Variable          | Default | Description                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KEYBOARD_LAYOUT` | `gta`   | Keyboard and mouse controls on the bundled page. `gta`: GTA-style PC keys on the PlayStation layout, mouse look after a click on the video (Esc frees the mouse) and a driving toggle (G) that turns W/S into R2/L2. `generic`: keys name console buttons (WASD and IJKL sticks), for any game. Gamepads work the same with both. |

## Line and turns

| Variable                  | Default     | Description                                                                                                      |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `TURN_MINUTES`            | `10`        | Length of a turn.                                                                                                |
| `EXTENSION_MINUTES`       | `5`         | Extra time when a turn ends and nobody waits.                                                                    |
| `IDLE_TURN_SECONDS`       | `20`        | A controller doing nothing for this long loses the turn, if someone waits. The last 10 seconds show a countdown. |
| `RECONNECT_GRACE_SECONDS` | `30`        | A dropped connection keeps its place this long.                                                                  |
| `MAX_LINE`                | `500`       | Longest waiting line; `0` = unlimited.                                                                           |
| `MAX_PLAYERS_PER_IP`      | `1`         | Places one IPv4 address or IPv6 /56 may hold (with login on, the limit is per account).                          |
| `MAX_CONNECTIONS_PER_IP`  | `6`         | Open WebSockets per visitor network; `0` = unlimited. Across all visitors the cap is 1000 sockets.               |
| `BLOCKED_BUTTONS`         | `ps,create` | Buttons never forwarded (comma-separated button names, or `none`).                                               |

Button names: `cross circle square triangle l1 r1 l2 r2 create options l3 r3 up down left right ps touchpad`.

## Console and video

| Variable                                 | Default                                          | Description                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONSOLE`                                | `simulated`                                      | `simulated` (a dot the left stick drives, for development) or `chiaki`.                                                                             |
| `CONSOLE_HOST`                           |                                                  | The console's LAN IP address. Required as an IP with `CONSOLE=chiaki` and `VIDEO=webrtc`: viewers' SDP offers may never use it as an ICE candidate. |
| `CHIAKI_INPUT_PORT`                      | `9370`                                           | Loopback UDP port of the patched chiaki-ng.                                                                                                         |
| `CHIAKI_NICKNAME`, `CHIAKI_PASSCODE`     |                                                  | Used by `deploy/macos/run-chiaki.sh` to connect without the window. The passcode ends up on chiaki-ng's command line: prefer none.                  |
| `VIDEO`                                  | `off`                                            | `webrtc` enables the WHEP proxy at `/api/video`.                                                                                                    |
| `VIDEO_MAX_SPECTATORS`                   | `5`                                              | Direct video slots besides the controller. With `KICK_CHANNEL` set, they go to the next players in line and everyone else watches the restream.     |
| `VIDEO_HIDE_IPV6`                        | `off`                                            | Strip IPv6 ICE candidates both ways (more private; IPv6-only viewers get no video).                                                                 |
| `STUN_URLS`                              | `stun:stun.l.google.com:19302`                   | Comma-separated STUN servers for browsers, or `none`.                                                                                               |
| `MEDIAMTX_API_USER`, `MEDIAMTX_API_PASS` |                                                  | MediaMTX API credentials (stream health). The installer generates them in `mediamtx-api.env`.                                                       |
| `MEDIAMTX_URL`, `MEDIAMTX_API_URL`       | `http://127.0.0.1:8889`, `http://127.0.0.1:9997` | Where MediaMTX listens. Only tests that run next to a live MediaMTX change them.                                                                    |

## Persistence and admin

| Variable      | Default            | Description                                                                                                                                                                           |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STATE_FILE`  | `state/state.json` | The line, the controller's time left and logins, saved at most every 5 seconds and on shutdown. `off` disables it. A save older than 10 minutes restores the logins but not the line. |
| `ADMIN_TOKEN` |                    | Turns on `/api/admin/*` (direct local requests only), used by `bun run admin`. At least 16 characters.                                                                                |

## Kick login

| Variable                               | Default | Description                                                                                                                                                                      |
| -------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` |         | Require "Log in with Kick" to join. Needs `PUBLIC_URL`. Register the app in Kick's developer settings with the redirect URL `PUBLIC_URL/auth/kick/callback`. Logins last 7 days. |
| `KICK_CHANNEL`                         |         | Restream channel linked for spectators without a direct video slot.                                                                                                              |

## Admin CLI

`bun run admin <command>` talks to the admin API of a running server on this machine (see [protocol.md](protocol.md#admin-api)). Add `--json` for the raw response. It reads these variables from the environment or `.env`:

| Variable      | Default                  | Description                                                                         |
| ------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `ADMIN_TOKEN` |                          | Must match the server's.                                                            |
| `ADMIN_URL`   | `http://127.0.0.1:$PORT` | The server's local address. Only `localhost`, `127.0.0.1` and `[::1]` are accepted. |

| Command            | Does                                                    |
| ------------------ | ------------------------------------------------------- |
| `status`           | The controller, the line with player ids, connections.  |
| `skip` (or `next`) | Ends the current turn.                                  |
| `pause`, `resume`  | Freezes or restarts the turn clock (the site stays up). |
| `kick <player-id>` | Removes a player from the line.                         |

## Paused mode

| Variable | Default | Description                                                                                                                                                                        |
| -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAUSED` | `off`   | Every public route answers with `public/paused.html` (or `503` for anything else): no line, logins or video. The local admin API still works. The restream streams a paused slate. |

## Host scripts

Read by `deploy/macos/*.sh` and the overlay renderer, not by the server.

| Variable                             | Default        | Description                                                                                 |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------- |
| `KICK_STREAM_URL`, `KICK_STREAM_KEY` |                | RTMPS ingest. Keep them in `kick.env` in the config folder (mode 600).                      |
| `OVERLAY_TITLE`                      | `Viewers play` | Title on the overlay and slates.                                                            |
| `CLOUDFLARE_TUNNEL_TOKEN`            |                | Token for a dashboard-managed tunnel, in `tunnel.env` (or use `~/.cloudflared/config.yml`). |

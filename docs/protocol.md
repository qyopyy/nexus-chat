# Protocol

Everything a client needs to build its own UI. The bundled page (`public/`) is a small reference client that uses exactly what is listed here.

A client does four things: read `/config.json`, open the WebSocket at `/ws`, send binary input frames while it is in control, and (optionally) post a WebRTC offer to `/api/video`. The admin API is separate and local only.

## HTTP endpoints for players

| Method and path        | Purpose                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /config.json`     | Public settings, see below.                                                                                |
| `GET /auth/me`         | `{ "login": "kick" \| "none", "name": string \| null }`: the logged-in account, if any.                    |
| `GET /auth/kick/login` | Starts "Log in with Kick" (a redirect). Back on `/` with `?login=cancelled` or `?login=failed` on failure. |
| `POST /auth/logout`    | Ends the login session (`204`).                                                                            |
| `POST /api/video`      | WHEP offer, see [Video](#video).                                                                           |
| `DELETE /api/video`    | Ends this player's video session (`204`).                                                                  |

`/config.json` fields:

| Field                             | Meaning                                                               |
| --------------------------------- | --------------------------------------------------------------------- |
| `name`                            | Project name to show.                                                 |
| `login`                           | `kick` when joining needs a Kick login, else `none`.                  |
| `console`                         | `simulated` or `chiaki`.                                              |
| `video`                           | `webrtc` when `/api/video` is available, else `off`.                  |
| `iceServers`                      | `RTCPeerConnection` ICE servers to use.                               |
| `kickChannel`                     | Kick channel of the public restream, or empty.                        |
| `videoSpectators`                 | With a restream, how many players next in line also get direct video. |
| `turnMinutes`, `extensionMinutes` | Turn length, and the extension a turn gets when nobody is waiting.    |
| `keyboardLayout`                  | `gta` or `generic`: the keyboard and mouse layout to offer.           |

While the site is paused (`PAUSED=on`), every page answers with the paused page, everything else with `503`, and the WebSocket refuses to open.

## WebSocket

Open `ws(s)://<host>/ws`. To keep your identity (and place in line) across a reload or a dropped connection, add `?resume=<resumeToken>` from the last `hello`. With a `PUBLIC_URL`, only that exact origin may open the socket; otherwise the `Origin` must match the `Host`.

Text frames are JSON objects with a `type`. Binary frames carry controller input. A frame larger than 4 KiB closes the connection with code `1009`; more than 300 messages a second, or too many sockets from one address, with code `1008` and reason `rate-limit` or `too-many-connections`. Reconnect with backoff and jitter.

### Client to server

| Message                             | Meaning                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `{ "type": "join", "name": "Ana" }` | Join the line. The name is cleaned and shortened; with a Kick login the account name is used instead. |
| `{ "type": "leave" }`               | Leave the line (or give up the turn). `join` and `leave` are ignored when sent less than 1 s apart.   |
| `{ "type": "ping", "t": 123 }`      | Answered with `pong` echoing `t`. Send one every ~25 s to keep proxies from closing an idle socket.   |
| `{ "type": "video-stalled" }`       | The controller's picture froze; the server asks the console for a keyframe (rate-limited).            |
| binary, 15 bytes                    | Controller state, see [Input encoding](#input-encoding). Ignored unless you are in control.           |

### Server to client

| Message         | To         | Fields                                                                                                                               |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `hello`         | you        | `id` (your player id), `videoToken` (private, for `/api/video`), `resumeToken` (private, for `?resume=`), `resumed` (identity kept). |
| `queue`         | everyone   | `serverNow` (ms), `current` (`{ id, name, endsAt }` or `null`), `waiting` (first 20 `{ name }`), `total` waiting, `paused`.          |
| `count`         | everyone   | `total`: only the number waiting changed.                                                                                            |
| `position`      | you        | `position`: `0` in control, `1..n` waiting, `null` not in line.                                                                      |
| `idle`          | controller | `kickAt` (server ms when the idle turn is lost, `null` clears it), `serverNow`.                                                      |
| `kicked`        | you        | Removed by the host, or `reason: "idle"`.                                                                                            |
| `join-rejected` | you        | `reason`: `line-full`, `login-required`, `origin-full` (someone on your network is in line), `account-in-line`.                      |
| `frame`         | everyone   | Simulated console only: `x`, `y` (0..1), `heading`, `pressed` buttons, `sticks`, `triggers`. About 20 per second.                    |
| `pong`          | you        | `t` from your `ping`.                                                                                                                |

`paused` in `queue` is `null` while turns run, or `{ reasons, remainingMs }` while the turn clock is frozen: `reasons` holds `admin` (the host paused it) and/or `stream` (the video is down), `remainingMs` the controller's frozen time left.

You are in control when `queue.current.id` equals your `hello.id` (or `position` is `0`). Time left is `current.endsAt - serverNow`, using the offset between `queue.serverNow` and your clock; while paused, use `paused.remainingMs`.

On connect the server sends `hello`, then `queue` and `position`.

## Input encoding

While in control, send the full controller state as one binary frame whenever it changes (the reference client sends at most every 8 ms) and at least every 200 ms as a heartbeat. After 750 ms without a frame the server releases every button. The codec is `public/js/input-codec.js`, shared with the server.

| Bytes | Content                                                                                   |
| ----- | ----------------------------------------------------------------------------------------- |
| 0     | Frame type, always `1`.                                                                   |
| 1-4   | `uint32` little endian button mask: bit `i` is button `i` in the order below.             |
| 5     | L2 pressure, 0-255.                                                                       |
| 6     | R2 pressure, 0-255.                                                                       |
| 7-14  | `int16` little endian sticks `lx`, `ly`, `rx`, `ry`, -32767..32767; up and left negative. |

Button order (bit 0 first): `cross`, `circle`, `square`, `triangle`, `l1`, `r1`, `l2`, `r2`, `create`, `options`, `l3`, `r3`, `up`, `down`, `left`, `right`, `ps`, `touchpad`. The server blocks `ps` and `create` (they open system menus). A frame of any other length or type is ignored.

## Video

The controller always gets direct video. Spectators do too, up to a cap; with a restream (`kickChannel`), the cap goes to the next `videoSpectators` players in line and everyone else should watch the restream.

1. Create a receive-only `RTCPeerConnection` with `config.iceServers` and a `video` and an `audio` transceiver.
2. `POST /api/video` with the SDP offer as the body, `content-type: application/sdp` and `x-video-token: <hello.videoToken>`.
3. `201` returns the SDP answer. Other answers: `401` (unknown token: reconnect the socket first), `429` (no free slot), `503` (console stream offline), `410` (the socket closed meanwhile).
4. `DELETE /api/video` with the same header when you stop.

The token is tied to the socket: a new `hello` brings a new one. Video sessions end when the socket closes.

## Admin API

Local only: the server answers only to direct loopback requests (`Host` is `localhost`, `127.0.0.1` or `[::1]`, no proxy headers) and returns `404` to anything else, including requests through a tunnel. Every request also needs `Authorization: Bearer <ADMIN_TOKEN>` (`401` without it). The API exists only with `ADMIN_TOKEN` set. `bun run admin` is a CLI for it (see [configuration](configuration.md#admin-cli)).

| Method and path          | Body                      | Answer                                                                               |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/admin/state`   |                           | `200` with `current`, `waiting` (all, with ids), `paused`, `connected`, `serverNow`. |
| `POST /api/admin/skip`   |                           | `204` ends the current turn; `409` when nobody is playing.                           |
| `POST /api/admin/pause`  |                           | `204`: freezes the turn clock (pause reason `admin`).                                |
| `POST /api/admin/resume` |                           | `204`: restarts it.                                                                  |
| `POST /api/admin/kick`   | `{ "id": "<player id>" }` | `204`; `404` when the player is not in line; `400` without an id.                    |

Other routes return `404`. Bodies are JSON, at most 4 KiB (`413` above that).


## Admin macros (Nexus addition)

`POST /api/admin/macro` plays a button sequence on the console, for example an in-game cheat code. Body: `{ "steps": [{ "buttons": ["r1", "r2"], "ms": 90 }, { "buttons": [], "ms": 90 }] }` with 1-160 steps, `ms` 30-2000, and no `ps` or `create`. Answers `202` (started), `409` (one is already running) or `400` (invalid). Players' input is ignored while it plays. Like every admin route it needs the bearer token and a direct local request; the panel at `/admin` uses it.

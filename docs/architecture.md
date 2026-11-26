# Architecture

PlayGTA is one Bun process (the server) plus a few cooperating programs on the same host: a patched chiaki-ng, MediaMTX, an ffmpeg restream and a tunnel. This page covers the server's structure and the data flows between the pieces.

## Processes

| Process                                      | Role                                                                                                                 | Talks to                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Server (`src/main.ts`)                       | Line, turns, input relay, WHEP proxy, logins, admin API, static files                                                | Browsers (HTTP and WebSocket), chiaki-ng (UDP), MediaMTX (HTTP), Kick (HTTPS) |
| chiaki-ng, patched                           | PlayStation Remote Play client: receives input on loopback UDP, publishes the console's own H.264 and Opus over RTSP | Console, MediaMTX                                                             |
| MediaMTX                                     | RTSP ingest, WebRTC (WHEP) egress                                                                                    | chiaki-ng, browsers (media only), the server (signaling and API)              |
| Restream (`deploy/macos/run-kick.sh`)        | ffmpeg from RTSP to Kick, with overlay PNGs and slates                                                               | MediaMTX, Kick, the overlay renderer                                          |
| Overlay renderer (`scripts/kick-overlay.ts`) | Draws the overlay and slates as PNGs from `/overlay.json`                                                            | Server (loopback)                                                             |
| cloudflared                                  | Exposes the server's port                                                                                            | Server (loopback)                                                             |

## Server layers

```
src/
  domain/        Pure rules, no I/O: TurnQueue, controller state, name cleaning.
  application/   Use cases and ports: PlaySession (turns, input, idle kick), Lobby (the live
                 line as players experience it), Presence, LoginSessions, persistence
                 snapshots, video access rules, rate limits, overlay read model.
  adapters/      I/O at the edges: config from env, HTTP server and routes, WebSocket gateway,
                 chiaki-ng and simulated consoles, MediaMTX (WHEP and health), Kick OAuth,
                 the state file.
  main.ts        Composition root: builds everything from the config and wires it together.
```

Dependencies point inward: adapters import application and domain code, never the other way around. The application layer defines the ports it needs:

- `ConsoleAdapter` (`application/ports.ts`): `apply`, `release`, optional `requestKeyframe`. Implemented by `ChiakiConsole` and `SimulatedConsole`.
- `Notifier` (`application/lobby.ts`): `toPlayer`, `toAll`. Implemented by `PlayerGateway` (WebSocket).
- `AdminBackend` (`adapters/http/admin-api.ts`): what the admin API (and its CLI, `scripts/admin.ts`) may do, implemented in `main.ts` on top of the Lobby.
- `IdentityProvider`: the login provider (Kick), so other providers can be added.

Time is injected (`Clock`) into every stateful class, so tests drive it with a fake clock.

## A turn, end to end

1. The browser opens `/ws`. The gateway checks the Origin, the per-visitor budget and the connection limit, then asks `Presence` for an identity (or resumes one from the `resume` token in the URL). It sends `hello` with the player id, a private video token and the resume token.
2. The browser sends `{ "type": "join", "name": ... }`. `Lobby.join` checks the line length, the login requirement and the places-per-origin limit, then `PlaySession.join` adds the player to the `TurnQueue`.
3. Line changes are coalesced: at most one `queue` broadcast per second, carrying the controller and the first 20 names. Each player gets their own `position` message only when it changes.
4. The controller's page samples input every 4 ms and sends a 15-byte frame when it changes (at most every 8 ms) and as a heartbeat every 200 ms (`public/js/input-codec.js`). `PlaySession.input` drops it unless the sender is in control, strips blocked buttons and forwards it to the console. If input goes silent for 750 ms, the console is released.
5. The page posts a WebRTC offer to `/api/video` with its video token. `WhepProxy` checks `VideoAccess` (the controller always; spectators up to the cap), sanitizes the SDP (only public IP and mDNS candidates, never the console) and relays it to MediaMTX. Media then flows directly between MediaMTX and the browser.
6. Every second `Lobby.tick` advances turns and expires disconnected players; four times a second `Lobby.fastTick` releases stale input and updates the idle countdown, which only the controller receives.

## Persistence

`captureState` (application) builds a versioned snapshot: the players in order, the controller's time left and the login sessions. Resume tokens and login cookies are stored only as SHA-256 hashes. `SaveScheduler` writes it at most every 5 seconds and on SIGTERM/SIGINT, atomically (temp file and rename, mode 600).

On startup, `parseState` validates the file field by field and rejects anything malformed or from another version (a half-restored line would be worse than an empty one); fields it no longer uses, left by older versions, are ignored. A save older than 10 minutes keeps logins but drops the line. Restored players are disconnected until their browser reconnects with its resume token; they leave the line if that takes more than 90 seconds.

## Messages and web client

The WebSocket messages, the binary input frame, the video signaling and the admin API are specified in [protocol.md](protocol.md), so anyone can build their own UI.

`public/` is a small reference client: plain HTML, one CSS file and ES modules with no build step. `app.js` wires the page (connection, line status, video); `input.js` samples the keyboard, mouse and gamepad; `video-player.js` does WHEP playback. The pure helpers (`input-codec.js`, `line-view.js`, `keymap.js`, `mouse-look.js`, `press-latch.js`) have no DOM access; all but `press-latch.js` are tested under Bun and have a `.d.ts` for the type checker, and `input-codec.js` is shared with the server. `keymap.js` holds the keyboard layouts (`KEYBOARD_LAYOUT`): the server only names one, and the input still goes through the same frame, clamping and button blocking. The admin client is a CLI, `scripts/admin.ts` (`bun run admin`).

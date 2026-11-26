# Security

PlayGTA hands a piece of your home network (a console, a computer, an upload link) to anonymous internet visitors. This page describes what it protects, how, where the limits are, and how to run it on a dedicated, isolated macOS account.

## Threat model

**Assets**: the host computer and the personal data on it; other devices on the home network (router, NAS, cameras); the console and the account signed in on it; the owner's secrets (stream key, API tokens); visitors' identities (IP addresses, login sessions).

**Adversaries**: anonymous visitors (curious, abusive or automated), a visitor who finds a bug in the server, and web pages that try to use a visitor's browser against the server (CSRF, cross-site WebSockets, DNS rebinding).

**Out of scope**: an attacker with physical access or an admin account on the host; compromise of the console, Kick or Cloudflare; what the game itself lets players do.

| Threat                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote access to the admin API              | `/api/admin/*` answers only to direct loopback requests whose Host is `localhost` and that carry no proxy headers. Through a tunnel it returns 404. The admin panel page (`/admin`, `public/admin.html`) is served under the same local-only rule (404 through a tunnel); the other client is the `bun run admin` CLI, which refuses to send the token to a non-loopback URL. A bearer token (compared in constant time) is also required. See "Proxies" below. |
| Spoofed visitor addresses                   | `CF-Connecting-IP` is read only with `TRUSTED_PROXY=cloudflare`, and only on loopback connections.                                                                                                                                                                                                                                                          |
| Leaving the game for the console's menus    | `ps` and `create` are blocked by default (`BLOCKED_BUTTONS`).                                                                                                                                                                                                                                                                                               |
| Stuck input when a browser freezes          | The console is released after 750 ms without input; chiaki-ng also releases on its own when the server goes quiet.                                                                                                                                                                                                                                          |
| Line flooding and spam                      | One place per IP (IPv6 per /56) or per account; connection caps per visitor and 1000 WebSockets (2000 sockets) in total; token-bucket rate limits on HTTP requests, video offers and WebSocket messages; one join or leave per second per socket; maximum line length; optional Kick login.                                                                 |
| Cross-site WebSocket hijacking              | With `PUBLIC_URL`, only that exact origin may open a socket; otherwise the Origin must match the Host.                                                                                                                                                                                                                                                      |
| Viewers aiming ICE checks at local services | SDP offers keep only candidates that are public IP literals or mDNS (`.local`) names. Loopback, private, shared, link-local (including `fe80::/10`), multicast and the console's address are dropped, at most 16 candidates are kept, and `CONSOLE_HOST` must be an IP. Signaling always goes through the server.                                           |
| Replacing the console video                 | Publishing MediaMTX's `console` path needs the API user's password, which chiaki-ng gets in its environment. The MediaMTX API sends no CORS headers.                                                                                                                                                                                                        |
| Leaking secrets from the saved state        | Resume tokens and login cookies are stored only as SHA-256 hashes; the file is written with mode 600.                                                                                                                                                                                                                                                       |
| Personal data in logs                       | Kick errors log shapes, not values. MediaMTX runs at `warn` so it does not log viewers' addresses. chiaki-ng logs its publish URL without credentials.                                                                                                                                                                                                      |
| Clickjacking, script injection              | A strict Content-Security-Policy (only own scripts and styles, `frame-src 'none'`, `frame-ancestors 'none'`), `nosniff`, `no-referrer`. Names are rendered with `textContent` only.                                                                                                                                                                         |
| Login CSRF                                  | The OAuth state must come back to the browser that started the login (HttpOnly, path-scoped cookie); PKCE protects the code exchange. Kick login requires `PUBLIC_URL`, so the redirect URL never comes from a request header.                                                                                                                              |
| Paused site leaking functionality           | With `PAUSED=on` every public route, `/auth/*` included, gets the paused page (or `503`) before any other handler runs.                                                                                                                                                                                                                                     |
| A compromised server process                | See the isolation kit below: no access to personal files, other local services or the LAN.                                                                                                                                                                                                                                                                  |

### Proxies

The supported setup is a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/): `cloudflared` runs on the host, connects to the server over loopback and adds `CF-Connecting-IP` to every request. Set `TRUSTED_PROXY=cloudflare` (the macOS kit does).

The admin gate can only tell relayed requests from local ones when the proxy marks them. A proxy that rewrites `Host` to `localhost` and adds no forwarding header would make internet requests look local. So the server refuses to start with `ADMIN_TOKEN` and `PUBLIC_URL` unless `TRUSTED_PROXY=cloudflare`. With any other proxy, leave `ADMIN_TOKEN` unset, or make sure the proxy always adds `X-Forwarded-For` or `Forwarded`.

### Known limits

- **Command lines are public on macOS.** Any local account can read other processes' arguments with `ps`. ffmpeg only takes the Kick stream key inside its output URL, and chiaki-ng only takes `CHIAKI_PASSCODE` as `--passcode`, so both are visible to other local accounts while those programs run. Environment variables are not visible to other users, which is how the MediaMTX password and the tunnel token travel. Run the host with no untrusted local accounts, prefer no console passcode, and rotate the stream key if in doubt.
- **Reading the console video is open on loopback.** Any local process may read MediaMTX's `console` path (the server and the restream need it without a password, and ffmpeg would take a password only on its command line). pf blocks other loopback services for the service user, not reads by other local users.
- **WebRTC reveals the host's public IP** to viewers with direct video.
- **Seatbelt profiles are allow-by-default.** They deny reads under `/Users` and `/Volumes`, all writes but the state file, and running other programs; the rest of the file system stays readable. They cannot filter HTTPS by host name, so with online features on, the server may reach any HTTPS server. Seatbelt (`sandbox-exec`) is deprecated by Apple but still enforced.
- **chiaki-ng and the restream are not jailed**: chiaki-ng is a GUI application that needs the window server, and ffmpeg needs the hardware encoder. They still run as the service user and under the pf anchor.

## The macOS isolation kit

Files in `deploy/macos/`:

| File                                       | What it does                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-user.sh`                           | Creates a standard (non-admin) user for the services, with a private home. Run from an admin account.                                                      |
| `install.sh`, `uninstall.sh`               | Render `launchd/*.plist.template` into LaunchAgents for the service user and load them, or remove them. `install.sh --dry-run DIR` only writes the plists. |
| `sandbox/*.sb`                             | Seatbelt profiles: `server.sb` (bun), `video.sb` (MediaMTX), `tunnel.sb` (cloudflared).                                                                    |
| `pf/anchor.conf.template`, `pf-isolate.sh` | A pf anchor, parameterized with the console IP, that limits what the service user may reach on the network.                                                |
| `run-*.sh`, `resume.sh`, `status.sh`       | LaunchAgent entry points and day-to-day helpers. `status.sh` warns when no pf anchor is installed.                                                         |

### Layers

1. **A separate macOS user.** The services run as a standard user with its own home (mode 700). Your account's files, keychain and browser sessions are out of reach by ordinary Unix permissions.
2. **Seatbelt profiles.** Under `/Users` and `/Volumes`, each jailed service may read only the repository files and settings it needs. It may write only its own state file, run only its own binary, and on loopback talk only to the ports it needs. Signals to other processes, Apple events and launching apps are denied. Outside `/Users` and `/Volumes` the file system stays readable (see Known limits).
3. **A pf anchor.** For the service user only: on loopback, it may open connections only to the server's own ports (web, RTSP, WHEP, MediaMTX API, chiaki-ng input), so databases or dev tools running for other users are refused. Answers from its listeners leave only through state created by the incoming connection, so it cannot reach other ports by picking a source port. On the LAN it may reach only the console, never the router or other devices. The internet stays reachable (viewers, STUN, Kick). The boot job logs to `/var/log/local.playgta.pf.log` and fails loudly if the anchor does not load.
4. **Secrets outside the repository.** Tokens live in `~/Library/Application Support/playgta/` (mode 700, files mode 600): `server.env` for the server, `kick.env` for the stream key, `tunnel.env` for the tunnel token only (the only secret cloudflared's profile may read), and `mediamtx-api.env`, generated by the installer. MediaMTX itself only gets the password's SHA-256; curl gets it through a pipe and chiaki-ng through its environment. The stream key is redacted from ffmpeg's output (but see Known limits).

### Setup

From your admin account:

```bash
deploy/macos/create-user.sh              # creates the "playgta" user
```

As the service user (log in once, then keep the session open: chiaki-ng needs it):

```bash
git clone <repository> ~/playgta && cd ~/playgta
brew install oven-sh/bun/bun mediamtx ffmpeg cloudflared
bun install --frozen-lockfile
scripts/build-chiaki.sh                  # then open chiaki-ng once and register the console
scripts/build-mediamtx.sh                # optional, recommended for PlayStation video
cp .env.example .env                     # non-secret settings; CONSOLE_HOST must be an IP
mkdir -p ~/Library/Application\ Support/playgta
$EDITOR ~/Library/Application\ Support/playgta/server.env   # secrets; chmod 600
$EDITOR ~/Library/Application\ Support/playgta/tunnel.env   # CLOUDFLARE_TUNNEL_TOKEN=...; chmod 600
deploy/macos/install.sh
deploy/macos/status.sh
```

Back in your admin account, isolate the network. Run `pf-isolate.sh` from a checkout your admin account owns, not from the service user's clone: it installs files as root, so whoever can edit them could get root. The script refuses to run when a file in `deploy/macos/` is owned or writable by another user. Replace the IP with your console's:

```bash
git clone <repository> ~/playgta-admin && cd ~/playgta-admin
deploy/macos/pf-isolate.sh install 192.0.2.10 playgta
deploy/macos/pf-isolate.sh status        # fails if the anchor has no rules
```

Allow chiaki-ng through the macOS application firewall if it asks, and reserve the console's IP in your router so the pf rule keeps matching.

To undo everything: `deploy/macos/uninstall.sh` as the service user, `deploy/macos/pf-isolate.sh uninstall` from an admin account, then delete the user in System Settings.

### Renaming

The user name, launchd labels (`local.playgta.*`) and config folder come from `APP_ID` and `LABEL_PREFIX` in `deploy/macos/lib.sh` (overridable with `PLAYGTA_APP_ID` and `PLAYGTA_LABEL_PREFIX`). If you change `APP_ID`, also change the API user name in `mediamtx/mediamtx.yml` and `scripts/mediamtx-scratch-config.ts`.

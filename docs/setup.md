# Setup guide

From a Mac and a PS5 to friends playing your console from their browsers. Follow the steps in order: each one ends with a check, so a problem shows up where it starts.

1. [What you need](#1-what-you-need)
2. [Try it with the simulated console](#2-try-it-with-the-simulated-console)
3. [Prepare the PS5](#3-prepare-the-ps5)
4. [Build chiaki-ng and MediaMTX](#4-build-chiaki-ng-and-mediamtx)
5. [Register the console in chiaki-ng](#5-register-the-console-in-chiaki-ng)
6. [Play it yourself on localhost](#6-play-it-yourself-on-localhost)
7. [Put it online for friends](#7-put-it-online-for-friends)
8. [Optional extras](#8-optional-extras)
9. [An always-on, isolated host](#9-an-always-on-isolated-host)
10. [Controls](#10-controls)
11. [Troubleshooting](#11-troubleshooting)

Before you invite anyone, read the [disclaimer](../README.md#disclaimer): sharing a console, an account or a game this way may break the terms of Sony, the game's publisher or the streaming platform, and can get an account suspended. Keep it to friends, and never charge for it.

## Set it up with an AI agent

Clone the repository, open your coding agent (Claude Code, Codex or similar) in it and paste this:

```text
Help me set up this repository on this Mac so friends can play my PS5 from their browsers.
1. Read AGENTS.md and docs/setup.md first. docs/setup.md is the source of truth.
2. Check the prerequisites in its section 1 and tell me what is missing before installing anything.
3. Go stage by stage, in this order: simulated console (section 2), build chiaki-ng and
   MediaMTX (4), real console on localhost (5 and 6), tunnel (7). Run the guide's
   "You should now see" check after each stage and do not move on until it passes.
4. Ask me to do what only I can do: settings on the PS5, signing in to PSN and finding my
   Account ID, reading the code on the PS5's Link Device screen, logging in to Cloudflare,
   and anything with Kick. Tell me which file a secret goes in (mode 600, as the guide says)
   and let me put it there myself. Never ask me to paste a secret into this chat.
5. Do not disable, skip or loosen any security or isolation step (credentials, firewall,
   sandbox, TRUSTED_PROXY, PUBLIC_URL). Do not run anything with sudo or launchctl unless
   I say so.
6. If a command fails or a check does not pass, stop, show me the error and what the guide's
   troubleshooting table says. Do not improvise workarounds or edit the project's code.
```

## 1. What you need

**Hardware**

- A PS5 signed in to a PlayStation Network account.
- A Mac on the same home network. Apple silicon is the tested path: the host scripts look for Homebrew in `/opt/homebrew` first. The Kick restream uses the Mac's hardware video encoder.
- A wired connection for both if you can. Remote Play over Wi-Fi works, but frames arrive in bursts and input feels late.

**Upload bandwidth (rough guidance)**

The console's video is forwarded as is, without re-encoding, so every viewer with direct video costs about one Remote Play stream of upload. You pick that bitrate in chiaki-ng's settings (resolution and bitrate). Add it up:

- The player in control always gets direct video.
- Up to `VIDEO_MAX_SPECTATORS` people at the front of the line (default 5) can watch directly too.
- A Kick restream, if you run one, adds 6000 kbps plus audio.

As a rough figure, a few friends at 720p want 20 to 30 Mbit/s of upload. With less, set `VIDEO_MAX_SPECTATORS=0` or `1` and lower chiaki-ng's resolution.

**Software**

- [Homebrew](https://brew.sh) and the Xcode command line tools (`xcode-select --install`), for git, a compiler and `python3`.
- [Bun](https://bun.sh) 1.4 or newer: `brew install oven-sh/bun/bun`.
- MediaMTX and Go, to build the patched MediaMTX: `brew install mediamtx go`.
- To put it online: `brew install cloudflared`. A quick tunnel needs no account; a stable address needs a free Cloudflare account and a domain on Cloudflare.

`scripts/build-chiaki.sh` installs chiaki-ng's build dependencies from Homebrew on its own (`qt@6 ffmpeg opus openssl@3 cmake ninja nasm protobuf@29 speexdsp libplacebo json-c miniupnpc libevent sdl2-compat pkgconf`) and never changes your global Homebrew links. That includes ffmpeg, which the Kick restream needs.

## 2. Try it with the simulated console

No console needed. This checks Bun, the server and the page.

```bash
git clone <this repository> playgta && cd playgta
bun install
bun start
```

**You should now see** `playgta listening on http://localhost:3000 (simulated console)` in the terminal. Open http://localhost:3000, type a name and join the line. You are in control at once: WASD moves the white dot and pressed buttons show at the bottom. A second browser (or a private window) shows the line from a second player's side. It cannot join yet: every tab on this Mac is the same visitor, and each visitor gets one place in line. To try the line with two players, start the server with `MAX_PLAYERS_PER_IP=2 bun start`.

Stop the server with Ctrl+C.

## 3. Prepare the PS5

These are settings on the console itself; the names are Sony's and can move between system updates.

1. **Settings → System → Remote Play → Enable Remote Play**: on.
2. **Settings → System → Power Saving → Features Available in Rest Mode**: turn on **Stay Connected to the Internet** and **Enable Turning On PS5 from Network**, so chiaki-ng can wake it.
3. Sign in with the PSN account you will play on. If that profile has a login passcode, note it; no passcode is simpler (see `CHIAKI_PASSCODE` in [configuration.md](configuration.md)).
4. Give the console a fixed IP address: reserve it in your router's DHCP settings. The server needs it as an IP (`CONSOLE_HOST`; a host name is refused), and the isolated host's firewall rule matches that address.

**You should now see** the console's IP in your router's reserved addresses.

## 4. Build chiaki-ng and MediaMTX

**chiaki-ng.** The project ships two patches for [chiaki-ng](https://github.com/streetpea/chiaki-ng), the open-source Remote Play client: one takes controller input from the server over loopback UDP, the other publishes the console's own video and audio to MediaMTX. The script fetches a pinned chiaki-ng commit into `vendor/chiaki-ng`, applies the patches and builds it. The first run takes a while:

```bash
bun run chiaki:build              # same as scripts/build-chiaki.sh
bun run chiaki:test-netinput      # controller input over loopback UDP
bun run chiaki:test-stream-out    # video out; needs mediamtx, ffmpeg and Google Chrome
```

**MediaMTX.** Stock MediaMTX drops H.264 frames made of more than 50 pieces (NAL units) when it repackages them for WebRTC, and PlayStation keyframes have about 80, which shows as green or smeared video. `scripts/build-mediamtx.sh` builds the version Homebrew installed (or the one you pass, such as `scripts/build-mediamtx.sh v1.x.y`) with a limit of 256:

```bash
scripts/build-mediamtx.sh
```

**You should now see** the build print `==> Done: .../vendor/chiaki-ng/build/gui/chiaki.app` (the exact `.app` name may differ; the scripts find whichever is there), both tests pass, and `vendor/mediamtx/mediamtx --version` print a version.

## 5. Register the console in chiaki-ng

chiaki-ng has to be paired with the console once, like the official Remote Play app. This project does not automate it: you do it in chiaki-ng's window. Open it:

```bash
open vendor/chiaki-ng/build/gui/*.app
```

1. With the console on (or in rest mode) on the same network, it shows up in chiaki-ng's window. Select it to register.
2. chiaki-ng asks for the **PSN Account ID** of the account signed in on the PS5. That is not your sign-in name or email. How to get it is covered in [chiaki-ng's documentation](https://github.com/streetpea/chiaki-ng).
3. On the PS5, open **Settings → System → Remote Play → Link Device**. Enter the code it shows into chiaki-ng. The code expires after a short while; ask for a new one if it does.
4. In chiaki-ng's settings, set the PS5 **video codec to H264**. The patch only forwards H.264, because browsers cannot reliably play HEVC over WebRTC; with HEVC, chiaki-ng logs `StreamOut: the session uses HEVC, but browsers need H.264` and the page stays black. Pick the resolution and frame rate here too (see the bandwidth notes above).
5. Close chiaki-ng without starting a stream. If macOS asks whether chiaki-ng may accept connections or use the local network, allow it.

chiaki-ng keeps the registration and these settings in its own preferences, per macOS user. If you later run the services as a separate user (step 9), register again as that user.

Find the nickname chiaki-ng gave the console:

```bash
deploy/macos/run-chiaki.sh list
```

Then put the console's details in `.env`, which `bun start` and the scripts in `deploy/macos/` both read:

```bash
cp .env.example .env
```

Add these lines to `.env`, with your values:

```ini
CONSOLE=chiaki
VIDEO=webrtc
CONSOLE_HOST=192.168.1.50
CHIAKI_NICKNAME=PS5-123
```

Keep comments on their own lines. Bun ignores a `# comment` after a value, but the `deploy/macos/` scripts do not, so `CHIAKI_NICKNAME=PS5-123  # mine` would make `run-chiaki.sh` look for a console named `PS5-123  # mine`.

**You should now see** your console's nickname in the output of `run-chiaki.sh list`.

## 6. Play it yourself on localhost

Three programs run side by side, each in its own terminal: MediaMTX, chiaki-ng and the server.

**MediaMTX credentials, once.** Publishing the console video and reading MediaMTX's API need a password. Create it the same way the host installer does, in a file only you can read:

```bash
bash -c 'source deploy/macos/lib.sh && ensure_mediamtx_api_env'
```

That writes `~/Library/Application Support/playgta/mediamtx-api.env` (mode 600) with `MEDIAMTX_API_USER=playgta-api` and a random `MEDIAMTX_API_PASS`. It keeps the file if it already exists.

**Terminal 1: MediaMTX.** It gets only a hash of the password, through `MTX_AUTHINTERNALUSERS_1_PASS`:

```bash
set -a; source ~/Library/Application\ Support/playgta/mediamtx-api.env; set +a
export MTX_AUTHINTERNALUSERS_1_PASS="sha256:$(printf %s "$MEDIAMTX_API_PASS" | openssl dgst -sha256 -binary | base64)"
vendor/mediamtx/mediamtx mediamtx/mediamtx.yml
```

`mediamtx/mediamtx.yml` offers WebRTC addresses from the `en0` network interface. If your Mac reaches the network on another one (check with `route get default | grep interface`), change `webrtcIPsFromInterfacesList` in that file.

**Terminal 2: chiaki-ng.** The script reads the credentials file and `.env`, turns on both patches and connects to the console:

```bash
deploy/macos/run-chiaki.sh
```

Its output should include `NetInput: listening for controller input on 127.0.0.1: 9370` and, once the stream starts, `StreamOut: publishing H.264 + Opus to rtsp://127.0.0.1:8554/console`. Keep its window open; you can minimize it. Without `CHIAKI_NICKNAME` and `CONSOLE_HOST` in `.env` it opens the normal window instead, and you start the stream by hand.

**Terminal 3: the server.** It reads `.env` on its own; the credentials come from the shell:

```bash
set -a; source ~/Library/Application\ Support/playgta/mediamtx-api.env; set +a
bun start
```

It should print `playgta listening on http://localhost:3000 (chiaki-ng)`. The server keeps checking MediaMTX's API; without the credentials it sees no stream, logs `Video stream is down: turns paused.` and freezes the turn clock.

**You should now see** `"ready":true` from:

```bash
bash -c 'source deploy/macos/lib.sh && mediamtx_api /v3/paths/get/console'
```

Then open http://localhost:3000, join the line and play. Click the video to use the mouse; the controls are in [section 10](#10-controls).

## 7. Put it online for friends

The server listens only on `127.0.0.1`. A [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) gives it a public HTTPS address without opening a port for the web page. Video is different: it goes straight from MediaMTX to each browser over UDP (see below).

Point the tunnel at `http://127.0.0.1:3000`, not `localhost`: `localhost` can resolve to the IPv6 address `::1`, where the server does not listen.

**Quick tunnel (no account, the address changes every run).** In a fourth terminal:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

It prints an address like `https://some-words.trycloudflare.com`. Restart the server in terminal 3 (Ctrl+C) with it:

```bash
PUBLIC_URL=https://some-words.trycloudflare.com TRUSTED_PROXY=cloudflare bun start
```

`PUBLIC_URL` pins the WebSocket origin check to that address. `TRUSTED_PROXY=cloudflare` makes the server read each visitor's real IP from Cloudflare's `CF-Connecting-IP` header, so the one-place-per-visitor rule works; without it every friend looks like the same local visitor.

**Your own domain (stable).** In the Cloudflare dashboard, create a tunnel, add a public hostname such as `play.example.com` with the service `http://127.0.0.1:3000`, and copy the tunnel token. Save it where `deploy/macos/run-tunnel.sh` looks for it, in a file only you can read. Open it in an editor rather than typing the token on a command line, which ends up in your shell history:

```bash
mkdir -p ~/Library/Application\ Support/playgta
touch ~/Library/Application\ Support/playgta/tunnel.env
chmod 600 ~/Library/Application\ Support/playgta/tunnel.env
open -e ~/Library/Application\ Support/playgta/tunnel.env   # one line: CLOUDFLARE_TUNNEL_TOKEN=...
deploy/macos/run-tunnel.sh
```

The script hands the token to cloudflared in its environment (`TUNNEL_TOKEN`), not on its command line. A locally managed tunnel in `~/.cloudflared/config.yml` works too and wins when present. Then add `PUBLIC_URL=https://play.example.com` and `TRUSTED_PROXY=cloudflare` to `.env` and restart the server.

**Video through your router.** MediaMTX sends media over UDP. `mediamtx/mediamtx.yml` uses one local UDP port, 8189, and a STUN server (`stun.l.google.com:19302`) that both MediaMTX and the browsers use to learn their public addresses. Per [MediaMTX's docs](https://github.com/bluenviron/mediamtx), STUN lets most home routers connect through UDP hole punching without opening a port. If friends see the page and the line but the video never starts:

1. Forward UDP port 8189 on your router to the Mac.
2. Add your public IP (or a DNS name for it) to `webrtcAdditionalHosts` in `mediamtx/mediamtx.yml`, next to `127.0.0.1`, and restart MediaMTX.

This repository ships no TURN relay. Behind carrier-grade NAT, where inbound connections cannot work, direct video may not reach some friends; the Kick restream still does.

**You should now see** cloudflared log `Registered tunnel connection`, and the page load on the public address from a phone on mobile data, with video.

Send your friends the address. One player controls the console at a time; the rest wait in line.

## 8. Optional extras

| What                  | How                                                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turn length and idle  | `TURN_MINUTES` (default 10), `IDLE_TURN_SECONDS` (default 20). See [configuration.md](configuration.md).                                                                                                                                                                                           |
| Admin CLI             | Set `ADMIN_TOKEN` (16+ characters) in the environment of both `bun start` and `bun run admin`, then run `bun run admin status`, `skip`, `pause`, `resume` or `kick <id>` on the same machine. With `PUBLIC_URL` it needs `TRUSTED_PROXY=cloudflare`. On the isolated host it goes in `server.env`. |
| Log in with Kick      | Register an app in Kick's developer settings with the redirect URL `PUBLIC_URL/auth/kick/callback`, then set `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET`. Needs `PUBLIC_URL`. One place per account instead of per IP.                                                                               |
| Restream to Kick      | Put `KICK_STREAM_URL` and `KICK_STREAM_KEY` in `~/Library/Application Support/playgta/kick.env` (mode 600), set `KICK_CHANNEL` so spectators get a link, and run `deploy/macos/run-kick.sh` (needs ffmpeg). Details and the overlay: [streaming.md](streaming.md).                                 |
| Paused mode           | `PAUSED=on` shows only the paused page: no line, logins or video. The admin CLI keeps working.                                                                                                                                                                                                     |
| Controls for any game | `KEYBOARD_LAYOUT=generic` swaps the GTA-style keyboard and mouse controls for a plain layout where keys name console buttons.                                                                                                                                                                      |

## 9. An always-on, isolated host

Running it by hand from your own account is fine for an evening with friends. To leave it running, use the macOS isolation kit in `deploy/macos/`: a separate standard user, Seatbelt profiles, a pf firewall anchor that keeps the services away from the rest of your network, and LaunchAgents that start everything at login and restart what crashes.

The service user has its own home, so you repeat the steps above as that user, in its own clone: the builds, chiaki-ng registration, `.env` and the files in its `~/Library/Application Support/playgta/` (the installer creates `mediamtx-api.env` there). The LaunchAgents set `CONSOLE=chiaki`, `VIDEO=webrtc` and `TRUSTED_PROXY=cloudflare` for you.

Follow [security.md](security.md#setup), which also covers what the kit protects and its known limits.

**You should now see** every service running in `deploy/macos/status.sh`, `video live`, and `pf anchor installed`.

## 10. Controls

Gamepads work the same with every layout: a player connects one to their own computer and presses a button so the browser sees it.

With the default `KEYBOARD_LAYOUT=gta`, the keyboard and mouse follow GTA's PC controls, mapped onto the PlayStation buttons GTA uses. Click the video to capture the mouse; Esc frees it.

| Key                | Button   | In GTA                             |
| ------------------ | -------- | ---------------------------------- |
| W A S D            | L stick  | Move (Alt walks)                   |
| Mouse (or I J K L) | R stick  | Look                               |
| Right click        | L2       | Aim (brake in a vehicle)           |
| Left click         | R2       | Shoot (accelerate in a vehicle)    |
| Shift              | ✕        | Sprint                             |
| Space              | □        | Jump                               |
| F                  | △        | Enter or exit a vehicle            |
| R                  | ○        | Reload, melee                      |
| Q                  | R1       | Cover                              |
| Tab                | L1       | Weapon wheel                       |
| X                  | L3       | Crouch                             |
| C                  | R3       | Look behind                        |
| M                  | Touchpad | Map                                |
| Enter              | Options  | Pause                              |
| Arrows             | D-pad    | Up opens the phone                 |
| G                  |          | Driving keys on or off (see below) |

**Driving keys.** On a pad, cars accelerate with R2 and brake with L2, not with the stick. Press G after getting in a vehicle: W becomes R2 (gas), S becomes L2 (brake and reverse) and Space becomes R1 (handbrake), while A and D still steer. Press G again when you get out. The line under the video always says whether driving keys are on. It is a toggle on purpose: guessing from F would go wrong when F finds no vehicle, and on foot R2 shoots, so W would open fire. A new turn always starts with driving keys off.

Two keys differ from the PC game: Enter pauses, because Esc is the browser's key to free the mouse, and X crouches instead of Ctrl, because browsers do not let a page block Ctrl+W, so Ctrl and W together would close the tab.

## 11. Troubleshooting

| Symptom                                   | What to check                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration fails in chiaki-ng           | Mac and console on the same network and subnet (guest Wi-Fi often isolates devices). The Account ID of the account signed in on the PS5. A fresh Link Device code. Console awake with Remote Play enabled. See [chiaki-ng](https://github.com/streetpea/chiaki-ng).                                                                               |
| `run-chiaki.sh` does not connect          | `CHIAKI_NICKNAME` matches `run-chiaki.sh list` exactly and `CONSOLE_HOST` is the console's IP, both without trailing comments. If it says `standby: the console ended Remote Play`, run `deploy/macos/resume.sh`.                                                                                                                                 |
| The page says the console is offline      | MediaMTX is running. chiaki-ng printed `StreamOut: publishing` and no `cannot publish ... retrying` (that means MediaMTX's hash does not match `mediamtx-api.env`: restart terminal 1 from the same file). The chiaki-ng window shows the console's picture.                                                                                      |
| Black video, but chiaki-ng shows the game | chiaki-ng warns about HEVC: set its codec to H264 (step 5). Server logs `Video stream is down: turns paused.`: start it with the credentials loaded (terminal 3).                                                                                                                                                                                 |
| Video works on localhost, not for friends | The UDP steps in [section 7](#7-put-it-online-for-friends), and `webrtcIPsFromInterfacesList` names the interface you are online with.                                                                                                                                                                                                            |
| Green, smeared or frozen video            | Use the MediaMTX from `scripts/build-mediamtx.sh` (`vendor/mediamtx/mediamtx`). Brief freezes heal on the next keyframe, which the page asks for on its own.                                                                                                                                                                                      |
| High latency or stutter                   | Wire the console and the Mac. Lower chiaki-ng's resolution or bitrate, and `VIDEO_MAX_SPECTATORS`, until the upload keeps up. Distance adds each friend's own network delay.                                                                                                                                                                      |
| Input does not reach the console          | Only the player in control sends input, and keys do nothing while the name box has focus: click the video. chiaki-ng printed `NetInput: listening ... 9370`; `CHIAKI_INPUT_PORT`, if set, is in `.env` so both read it. `bun run chiaki:test-netinput` checks the patch. PS and Create are blocked on purpose (`BLOCKED_BUTTONS`, and the patch). |
| The mouse does not turn the camera        | Mouse look needs the GTA layout (the default) and a click on the video while you are in control. Some browsers refuse pointer lock for a second after Esc: wait and click again.                                                                                                                                                                  |
| The page loads but keeps reconnecting     | `PUBLIC_URL` must match the address in the browser exactly (scheme and host, no path). Quick tunnel addresses change every time cloudflared restarts.                                                                                                                                                                                             |
| Tunnel shows an error page                | The tunnel's service is `http://127.0.0.1:3000` and the server is running.                                                                                                                                                                                                                                                                        |
| Server refuses to start                   | It prints every invalid setting at once. `ADMIN_TOKEN` with `PUBLIC_URL` needs `TRUSTED_PROXY=cloudflare`. [configuration.md](configuration.md) lists each variable and its accepted values.                                                                                                                                                      |

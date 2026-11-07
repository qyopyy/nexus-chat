# Audible Magic relay for Nexus (Shield 360)

Audible Magic doesn't offer a public cloud API — identification runs through their licensed
**Toolkit** (command-line `identify`, `analyze`, `identifyStream`) plus a config file they issue to
customers. This tiny relay runs next to the Toolkit so Nexus can use it as a second engine beside
ACRCloud ("360 scan").

## Setup

1. Get the Toolkit + config file from Audible Magic (helpdesk@audiblemagic.com).
2. Put them on a Linux server, e.g. `/opt/audiblemagic/identify` and `/opt/audiblemagic/config.cfg`.
3. Pick a long random token: `openssl rand -hex 24`.
4. Run the relay:
   ```sh
   RELAY_TOKEN=<token> node server.mjs
   # or
   docker build -t am-relay . && docker run -d -p 8787:8787 -e RELAY_TOKEN=<token> -v /opt/audiblemagic:/opt/audiblemagic:ro am-relay
   ```
5. Put it behind HTTPS (Caddy: `am.yourdomain.com { reverse_proxy localhost:8787 }`).
6. In Nexus: **Studio → Distribution settings → Copyright check → Audible Magic 360**, paste the HTTPS URL and
   the token. Nexus calls `/health` to confirm before saving.

## Settings

| Env | Default | |
|---|---|---|
| `RELAY_TOKEN` | — | required, 16+ chars |
| `AM_IDENTIFY_BIN` | `/opt/audiblemagic/identify` | Toolkit `identify` binary |
| `AM_CONFIG` | `/opt/audiblemagic/config.cfg` | config file from Audible Magic |
| `AM_IDENTIFY_ARGS` | `-c {config} {file}` | adjust to your Toolkit version's flags |
| `AM_TIMEOUT_MS` | `20000` | |

Nexus sends a ~12 s mono WAV clip; the relay returns the Toolkit's compliance JSON
(`statusCode`, `matches[]` with `ruleCode`, `metadata.Title/Artist/ISRC/Label/AlbumUPC`). A match
whose `ruleCode` says block/deny is hard-blocked when the global Content ID block is on.

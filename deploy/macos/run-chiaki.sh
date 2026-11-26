#!/usr/bin/env bash
# LaunchAgent entry point for the patched chiaki-ng. Settings (.env / server.env):
#   CHIAKI_NICKNAME    console nickname as chiaki-ng registered it (see: run-chiaki.sh list)
#   CONSOLE_HOST       console IP address on the home network
#   CHIAKI_PASSCODE    optional PlayStation login passcode. chiaki-ng only takes it on its command
#                      line, which other local accounts can read with ps(1): prefer none.
#   CHIAKI_INPUT_PORT  UDP port the server sends controller input to (default 9370)
# The video goes to MediaMTX's "console" path with the API user's credentials (mediamtx-api.env),
# passed in the environment, which other users cannot read, so no other local process can publish.
# With CHIAKI_NICKNAME and CONSOLE_HOST set, chiaki-ng connects on its own; otherwise it opens its
# normal window. When the console itself ends the session (standby, lib.sh) this does not
# reconnect: it idles until resume.sh clears standby.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

BIN="$(chiaki_binary)"
[[ -n "$BIN" ]] || { echo "chiaki-ng is not built yet: run scripts/build-chiaki.sh" >&2; exit 1; }
if [[ "${1:-}" == list ]]; then exec "$BIN" list; fi

nickname="$(setting CHIAKI_NICKNAME)"
host="$(setting CONSOLE_HOST)"
passcode="$(setting CHIAKI_PASSCODE)"
if [[ -n "$nickname" && -n "$host" ]] && ! standby_active && tail -c 262144 "$CHIAKI_LOG" 2>/dev/null | console_ended; then
  standby_enter "$(date +%s)"
fi
# From this line on, the log belongs to this run (console_ended reads only the last run).
echo "$(date '+%F %T') chiaki-ng binary: $BIN"
if [[ -n "$nickname" && -n "$host" ]] && standby_active; then
  echo "$(date '+%F %T') standby: the console ended Remote Play; not reconnecting until deploy/macos/resume.sh"
  exec sleep 31536000
fi

port="$(setting CHIAKI_INPUT_PORT)"
export CHIAKI_NET_INPUT_PORT="${port:-9370}"
publisher="$(ENV_FILE="$MEDIAMTX_API_ENV" env_value MEDIAMTX_API_USER)"
publish_pass="$(ENV_FILE="$MEDIAMTX_API_ENV" env_value MEDIAMTX_API_PASS)"
[[ -n "$publisher" ]] || { echo "No $MEDIAMTX_API_ENV: run deploy/macos/install.sh" >&2; exit 1; }
export CHIAKI_STREAM_OUT_URL="rtsp://$publisher:$publish_pass@127.0.0.1:8554/console"
unset publish_pass

args=()
if [[ -n "$nickname" && -n "$host" ]]; then
  [[ -n "$passcode" ]] && args+=("--passcode=$passcode")
  args+=(stream "$nickname" "$host")
  echo "$(date '+%F %T') Streaming from '$nickname', input on 127.0.0.1:$CHIAKI_NET_INPUT_PORT, video to rtsp://127.0.0.1:8554/console"
else
  echo "$(date '+%F %T') Opening the chiaki-ng window (set CHIAKI_NICKNAME and CONSOLE_HOST to auto-connect)"
fi
# The ${args[@]+...} form keeps macOS's bash 3.2 happy with an empty array under `set -u`.
exec "$BIN" ${args[@]+"${args[@]}"}

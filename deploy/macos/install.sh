#!/usr/bin/env bash
# Installs (or reinstalls, which also restarts) the LaunchAgents for the logged-in service user:
#   video   MediaMTX (Seatbelt jail)
#   server  the web server, CONSOLE=chiaki VIDEO=webrtc (Seatbelt jail)
#   chiaki  the patched chiaki-ng (skipped until built)
#   kick    the restream (idles until a stream key is set)
#   tunnel  cloudflared (Seatbelt jail; only when a tunnel is configured)
# The jails pin the resolved Homebrew binaries: run this again after `brew upgrade`.
# Usage: install.sh [--dry-run DIR]   (--dry-run writes the plists into DIR and loads nothing)
set -euo pipefail
source "$(dirname "$0")/lib.sh"

DRY_RUN_DIR=""
case "${1:-}" in
  --dry-run) DRY_RUN_DIR="${2:?--dry-run needs a directory}" ;;
  "") ;;
  -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac
OUT_DIR="${DRY_RUN_DIR:-$AGENTS_DIR}"

if [[ -z "$DRY_RUN_DIR" ]] && dseditgroup -o checkmember -m "$(id -un)" admin >/dev/null 2>&1; then
  echo "Refusing to install as an administrator: run this as the service user (deploy/macos/create-user.sh)." >&2
  exit 1
fi

# resolve COMMAND [FORMULA]: COMMAND's real path on the service PATH; a dry run falls back to a
# placeholder path. FORMULA is the Homebrew formula to suggest when it is missing.
resolve() {
  local found
  found="$(PATH="$SERVICE_PATH:$PATH" command -v "$1" || true)"
  if [[ -n "$found" ]]; then realpath "$found" 2>/dev/null || printf '%s' "$found"
  elif [[ -n "$DRY_RUN_DIR" ]]; then printf '/opt/homebrew/bin/%s' "$1"
  else echo "Missing '$1': brew install ${2:-$1}" >&2; exit 1; fi
}

http_port="$(setting PORT)"; http_port="${http_port:-3000}"
input_port="$(setting CHIAKI_INPUT_PORT)"; input_port="${input_port:-9370}"
COMMON=("LABEL_PREFIX=$LABEL_PREFIX" "REPO=$REPO_ROOT" "HOME=$HOME" "CONFIG_DIR=$CONFIG_DIR" "LOG_DIR=$LOG_DIR"
  "SERVICE_PATH=$SERVICE_PATH" "HTTP_PORT=$http_port" "CHIAKI_INPUT_PORT=$input_port")

# install_agent NAME KEY=VALUE...: renders launchd/NAME.plist.template and (re)loads it.
install_agent() {
  local name="$1" label="$LABEL_PREFIX.$1" file="$OUT_DIR/$LABEL_PREFIX.$1.plist"; shift
  render_template "$DEPLOY_DIR/launchd/$name.plist.template" --xml "NAME=$name" "${COMMON[@]}" "$@" >"$file"
  plutil -lint -s "$file" >/dev/null || { echo "Invalid plist: $file" >&2; exit 1; }
  echo "  wrote $file"
  [[ -n "$DRY_RUN_DIR" ]] && return 0
  launchctl bootout "gui/$UID/$label" 2>/dev/null || true
  # bootout returns before the old job is gone; bootstrapping too early fails with error 5.
  local waited=0
  while launchctl print "gui/$UID/$label" >/dev/null 2>&1 && ((waited < 30)); do sleep 0.5; waited=$((waited + 1)); done
  launchctl enable "gui/$UID/$label"
  launchctl bootstrap "gui/$UID" "$file"
  echo "  loaded $label"
}

drop_agent() {
  local label="$LABEL_PREFIX.$1"
  [[ -n "$DRY_RUN_DIR" ]] || launchctl bootout "gui/$UID/$label" 2>/dev/null || true
  rm -f "$OUT_DIR/$label.plist"
}

mkdir -p "$OUT_DIR"
[[ -n "$DRY_RUN_DIR" ]] || { mkdir -p "$LOG_DIR" "$CONFIG_DIR"; chmod 700 "$CONFIG_DIR"; }
[[ -f "$SERVER_ENV" ]] && chmod 600 "$SERVER_ENV"
[[ -f "$KICK_ENV" ]] && chmod 600 "$KICK_ENV"
[[ -f "$TUNNEL_ENV" ]] && chmod 600 "$TUNNEL_ENV"
echo "==> Repository: $REPO_ROOT"
echo "==> Writing LaunchAgents to $OUT_DIR"

# A local build (scripts/build-mediamtx.sh) wins over Homebrew's: see that script for why.
MEDIAMTX_BIN="$REPO_ROOT/vendor/mediamtx/mediamtx"
[[ -x "$MEDIAMTX_BIN" ]] || MEDIAMTX_BIN="$(resolve mediamtx)"
[[ -n "$DRY_RUN_DIR" ]] || ensure_mediamtx_api_env
api_pass="$(ENV_FILE="$MEDIAMTX_API_ENV" env_value MEDIAMTX_API_PASS)"
[[ -n "$api_pass" ]] || api_pass="$(openssl rand -hex 32)" # dry run: a throwaway password
install_agent video "MEDIAMTX=$MEDIAMTX_BIN" "API_USER=$MEDIAMTX_API_USER" "API_PASS_HASH=$(mediamtx_pass_hash "$api_pass")"
unset api_pass

# Kick login needs HTTPS out; the jail allows it only when it is set.
outbound_https=0
[[ -n "$(setting KICK_CLIENT_ID)" ]] && outbound_https=1
install_agent server "BUN=$(resolve bun oven-sh/bun/bun)" "OUTBOUND_HTTPS=$outbound_https"

if [[ -z "$DRY_RUN_DIR" && -z "$(chiaki_binary)" ]]; then
  echo "  skipped chiaki: not built yet (scripts/build-chiaki.sh)"; drop_agent chiaki
else
  # Installing is the owner (re)starting things: leave any standby so chiaki-ng connects.
  [[ -n "$DRY_RUN_DIR" ]] || standby_clear
  install_agent chiaki
fi

install_agent kick

if [[ -n "$DRY_RUN_DIR" ]] || tunnel_configured; then
  install_agent tunnel "CLOUDFLARED=$(resolve cloudflared)"
else
  echo "  skipped tunnel: no ~/.cloudflared/config.yml or CLOUDFLARE_TUNNEL_TOKEN in $TUNNEL_ENV"; drop_agent tunnel
fi

if [[ -n "$DRY_RUN_DIR" ]]; then echo "==> Dry run: nothing loaded"
else echo "==> Done. Check with deploy/macos/status.sh. Logs: $LOG_DIR"; fi

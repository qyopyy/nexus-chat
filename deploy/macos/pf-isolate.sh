#!/usr/bin/env bash
# Network isolation of the service user with a pf anchor: it may reach only the server's own
# loopback ports and, on the home network, only the console. Needs sudo.
#
# Run it from an admin account, from a checkout that account owns (not the service user's clone):
# it renders files from this folder and installs them as root, so anyone who can edit them could
# get root. It refuses to run when a file here is owned or writable by someone else.
#
# Usage: pf-isolate.sh install CONSOLE_IP [SERVICE_USER] | uninstall | status
#   Environment: HTTP_PORT (default 3000), CHIAKI_INPUT_PORT (default 9370), PF_INTERFACE (default en0).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
me="$(id -un)"
# Checked before lib.sh is sourced: sourcing a tampered file would already run it.
untrusted="$(find "$here" \( ! -user "$me" ! -user root \) -o -perm -g+w -o -perm -o+w | head -5)"
if [[ -n "$untrusted" ]]; then
  echo "Refusing to run: these files are owned or writable by another user:" >&2
  echo "$untrusted" >&2
  echo "Run this from a checkout your admin account owns (see docs/security.md)." >&2
  exit 1
fi
source "$here/lib.sh"

ANCHOR="$LABEL_PREFIX"
RULES="/etc/pf.anchors/$ANCHOR"
DAEMON_LABEL="$LABEL_PREFIX.pf"
DAEMON="/Library/LaunchDaemons/$DAEMON_LABEL.plist"

usage() { echo "Usage: $0 install CONSOLE_IP [SERVICE_USER] | uninstall | status" >&2; exit 2; }
is_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535)); }
is_ipv4() {
  local IFS=. octet
  [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  for octet in $1; do ((10#$octet <= 255)) || return 1; done
}
anchor_rules() { sudo pfctl -a "com.apple/$ANCHOR" -s rules 2>/dev/null; }

case "${1:-status}" in
  install)
    console_ip="${2:-}"
    service_user="${3:-$APP_ID}"
    http_port="${HTTP_PORT:-3000}"
    input_port="${CHIAKI_INPUT_PORT:-9370}"
    interface="${PF_INTERFACE:-en0}"
    is_ipv4 "$console_ip" || { echo "CONSOLE_IP must be an IPv4 address (got '$console_ip')" >&2; usage; }
    [[ "$service_user" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Invalid user name: $service_user" >&2; exit 2; }
    [[ "$service_user" != "$me" ]] || { echo "Run this from an admin account, not as $service_user" >&2; exit 2; }
    is_port "$http_port" || { echo "HTTP_PORT must be a port number (got '$http_port')" >&2; exit 2; }
    is_port "$input_port" || { echo "CHIAKI_INPUT_PORT must be a port number (got '$input_port')" >&2; exit 2; }
    [[ "$interface" =~ ^[a-z]+[0-9]+$ ]] || { echo "PF_INTERFACE must be an interface name like en0 (got '$interface')" >&2; exit 2; }
    id "$service_user" >/dev/null 2>&1 || { echo "No such user: $service_user (run create-user.sh first)" >&2; exit 1; }
    tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
    render_template "$DEPLOY_DIR/pf/anchor.conf.template" \
      "SERVICE_USER=$service_user" "CONSOLE_IP=$console_ip" "HTTP_PORT=$http_port" \
      "CHIAKI_INPUT_PORT=$input_port" "INTERFACE=$interface" >"$tmp"
    sudo pfctl -n -f "$tmp" # syntax check before touching anything
    sudo install -m 644 -o root -g wheel "$tmp" "$RULES"
    render_template "$DEPLOY_DIR/pf/daemon.plist.template" --xml "LABEL=$DAEMON_LABEL" "ANCHOR=$ANCHOR" "RULES=$RULES" >"$tmp"
    plutil -lint -s "$tmp" >/dev/null
    sudo install -m 644 -o root -g wheel "$tmp" "$DAEMON"
    sudo launchctl bootout "system/$DAEMON_LABEL" 2>/dev/null || true
    sudo launchctl bootstrap system "$DAEMON"
    sleep 1
    rules="$(anchor_rules)"
    if [[ -z "$rules" ]]; then
      echo "ERROR: the anchor loaded no rules: the service user is NOT isolated. See /var/log/$DAEMON_LABEL.log" >&2
      exit 1
    fi
    printf '%s\n' "$rules" ;;
  uninstall)
    sudo launchctl bootout "system/$DAEMON_LABEL" 2>/dev/null || true
    sudo pfctl -a "com.apple/$ANCHOR" -F rules 2>/dev/null || true
    sudo rm -f "$DAEMON" "$RULES"
    echo "Rules removed. pf itself stays enabled until reboot: sudo pfctl -d" ;;
  status)
    sudo pfctl -s info | head -1
    rules="$(anchor_rules)"
    if [[ -z "$rules" ]]; then
      echo "WARNING: the anchor com.apple/$ANCHOR has no rules: the service user is NOT isolated." >&2
      exit 1
    fi
    printf '%s\n' "$rules" ;;
  *) usage ;;
esac

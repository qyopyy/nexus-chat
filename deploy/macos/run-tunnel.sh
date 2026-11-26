#!/usr/bin/env bash
# LaunchAgent entry point for cloudflared: ~/.cloudflared/config.yml when present, otherwise
# CLOUDFLARE_TUNNEL_TOKEN from tunnel.env in the config folder (mode 600). That file holds only the
# tunnel token: the jail (sandbox/tunnel.sb) lets cloudflared read it, not the server's secrets.
set -euo pipefail
# Runs inside sandbox/tunnel.sb, which only allows bash, date and cloudflared: no dirname.
if [[ "$0" == */* ]]; then source "${0%/*}/lib.sh"; else source ./lib.sh; fi

if [[ -f "$HOME/.cloudflared/config.yml" ]]; then
  echo "$(date '+%F %T') Starting cloudflared with ~/.cloudflared/config.yml"
  exec cloudflared --no-autoupdate tunnel run
fi
token="$(ENV_FILE="$TUNNEL_ENV" env_value CLOUDFLARE_TUNNEL_TOKEN)"
[[ -n "$token" ]] || { echo "No tunnel configured: add ~/.cloudflared/config.yml or CLOUDFLARE_TUNNEL_TOKEN in $TUNNEL_ENV" >&2; exit 1; }
# cloudflared reads TUNNEL_TOKEN from its environment, so the token stays off its command line.
export TUNNEL_TOKEN="$token"
echo "$(date '+%F %T') Starting cloudflared with the configured token"
exec cloudflared --no-autoupdate tunnel run

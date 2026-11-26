#!/usr/bin/env bash
# Creates the standard (non-admin) macOS user that runs the services, so nothing they run can read
# your own files. Run from an admin account; asks for sudo. Safe to run again.
# Usage: create-user.sh [SERVICE_USER]
set -euo pipefail
source "$(dirname "$0")/lib.sh"
user="${1:-$APP_ID}"
[[ "$user" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Invalid user name: $user" >&2; exit 2; }

if id "$user" >/dev/null 2>&1; then
  echo "==> User $user exists (uid $(id -u "$user"))"
else
  echo "==> Creating standard user $user. Choose a password when asked."
  sudo sysadminctl -addUser "$user" -fullName "$APP_ID service" -password -
fi
if dseditgroup -o checkmember -m "$user" admin >/dev/null 2>&1; then
  echo "WARNING: $user is an administrator. Make it a standard user in System Settings → Users & Groups." >&2
fi
home="$(dscl . -read "/Users/$user" NFSHomeDirectory | awk '{print $2}')"
[[ -d "$home/Library" ]] || sudo createhomedir -c -u "$user"
# Nobody else may look inside the service user's home.
sudo chmod 700 "$home"

cat <<NEXT

Done. Next, as $user (log in once at the machine or over Screen Sharing, and keep it logged in so
chiaki-ng has a GUI session):
  1. git clone <this repository> ~/$APP_ID && cd ~/$APP_ID && bun install --frozen-lockfile
  2. scripts/build-chiaki.sh, then open chiaki-ng once to register the console (do not stream).
  3. Copy .env.example to .env (non-secret settings) and put secrets in
     ~/Library/Application Support/$APP_ID/server.env (mode 600).
  4. deploy/macos/install.sh
Then, from your admin account: deploy/macos/pf-isolate.sh install <console IP> $user
NEXT

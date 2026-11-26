#!/usr/bin/env bash
# Leaves standby (the console ended Remote Play) and restarts chiaki-ng, which connects again and
# takes the console from whoever is holding it. Run as the service user.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
if standby_active; then echo "==> Leaving standby"; else echo "==> Not in standby: restarting chiaki-ng anyway"; fi
standby_clear
launchctl kickstart -k "gui/$(id -u)/$LABEL_PREFIX.chiaki"
echo "==> chiaki-ng restarted (log: $CHIAKI_LOG)"

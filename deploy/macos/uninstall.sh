#!/usr/bin/env bash
# Stops and removes every LaunchAgent of this project for the current user. Logs and the config
# folder (settings, saved state) are kept.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
for name in "${SERVICES[@]}"; do
  label="$LABEL_PREFIX.$name"
  file="$AGENTS_DIR/$label.plist"
  launchctl bootout "gui/$UID/$label" 2>/dev/null && echo "  stopped $label"
  [[ -f "$file" ]] && rm -f "$file" && echo "  removed $file"
done
echo "==> LaunchAgents removed. Kept: $LOG_DIR and $CONFIG_DIR"

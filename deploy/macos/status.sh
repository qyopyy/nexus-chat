#!/usr/bin/env bash
# Shows whether each service is loaded and running, and whether the console video is live.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
for name in "${SERVICES[@]}"; do
  label="$LABEL_PREFIX.$name"
  if info="$(launchctl print "gui/$UID/$label" 2>/dev/null)"; then
    state="$(awk '/^\tstate = / { print $3; exit }' <<<"$info")"
    printf '  %-8s %s\n' "$name" "${state:-loaded}"
  else
    printf '  %-8s not installed\n' "$name"
  fi
done
if mediamtx_api "/v3/paths/get/console" 2>/dev/null | grep -q '"ready":true'; then echo "  video    live"
else echo "  video    offline"; fi
standby_active && echo "  standby  on ($(standby_left "$(date +%s)") s of slate left)"
# Only root can list pf rules; the installed rules file is world-readable. An empty or missing file
# means pf-isolate.sh never ran (or failed): the service user can reach the whole LAN.
if [[ -s "/etc/pf.anchors/$LABEL_PREFIX" ]]; then
  echo "  pf       anchor installed (check it is loaded: sudo deploy/macos/pf-isolate.sh status)"
else
  echo "  pf       WARNING: no anchor at /etc/pf.anchors/$LABEL_PREFIX: the network is NOT isolated" >&2
fi
exit 0

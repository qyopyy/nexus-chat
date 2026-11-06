#!/usr/bin/env bash
# Give every embedded .framework a unique CFBundleIdentifier.
# Sideloadly / installd reject IPAs when Cordova + Capacitor plugins all inherit
# the app's PRODUCT_BUNDLE_IDENTIFIER (DuplicateIdentifier).
set -euo pipefail

APP="${1:-}"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "usage: $0 /path/to/App.app" >&2
  exit 2
fi

python3 - "$APP" <<'PY'
import os, pathlib, subprocess, sys

app = pathlib.Path(sys.argv[1])
PB = os.environ.get("PLIST_BUDDY", "/usr/libexec/PlistBuddy")

def pb_print(plist):
    try:
        return subprocess.check_output(
            [PB, "-c", "Print :CFBundleIdentifier", str(plist)],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return None

def pb_set(plist, value):
    r = subprocess.run(
        [PB, "-c", "Set :CFBundleIdentifier %s" % value, str(plist)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if r.returncode != 0:
        subprocess.check_call(
            [PB, "-c", "Add :CFBundleIdentifier string %s" % value, str(plist)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

def find_plist(bundle):
    for cand in (
        bundle / "Info.plist",
        bundle / "Resources" / "Info.plist",
        bundle / "Versions" / "Current" / "Resources" / "Info.plist",
        bundle / "Versions" / "A" / "Resources" / "Info.plist",
    ):
        if cand.is_file():
            return cand
    return None

app_plist = app / "Info.plist"
app_id = pb_print(app_plist)
if not app_id:
    print("Could not read CFBundleIdentifier from %s" % app_plist, file=sys.stderr)
    sys.exit(1)

bundles = sorted(list(app.glob("Frameworks/*.framework")) + list(app.glob("PlugIns/*.appex")))
if not bundles:
    print("No Frameworks/PlugIns in %s — nothing to fix" % app)
    sys.exit(0)

seen = {app_id: "App"}
fixed = 0
for bundle in bundles:
    name = bundle.stem
    plist = find_plist(bundle)
    if not plist:
        print("skip %s (no Info.plist)" % bundle.name)
        continue
    cur = pb_print(plist)
    want = "%s.fw.%s" % (app_id, name)
    # Keep existing id only if unique vs app + other frameworks
    if cur and cur != app_id and cur not in seen:
        seen[cur] = bundle.name
        print("ok   %s → %s" % (bundle.name, cur))
        continue
    pb_set(plist, want)
    now = pb_print(plist) or want
    print("fix  %s → %s (was %s)" % (bundle.name, now, cur or "missing"))
    seen[now] = bundle.name
    fixed += 1

# Final duplicate check
ids = {}
for bundle in bundles:
    plist = find_plist(bundle)
    if not plist:
        continue
    i = pb_print(plist)
    if not i:
        continue
    ids.setdefault(i, []).append(bundle.name)
dups = {k: v for k, v in ids.items() if len(v) > 1}
if dups:
    print("ERROR: duplicate CFBundleIdentifier still present:", file=sys.stderr)
    for k, v in dups.items():
        print("  %s: %s" % (k, v), file=sys.stderr)
    sys.exit(1)

print("Framework bundle ids uniquified (changed=%s, app=%s, unique=%s)" % (fixed, app_id, len(ids)))
PY

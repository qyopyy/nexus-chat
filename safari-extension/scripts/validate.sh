#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Validating Nexus Safari Extension Manager…"

python3 - <<'PY'
import json, pathlib
root = pathlib.Path("NexusSafariExtension/Resources")
manifest = json.loads((root / "manifest.json").read_text())
assert manifest["manifest_version"] == 3
json.loads((root / "rules/tracker_block.json").read_text())
for name in ("background.js", "content.js", "popup.html", "popup.js", "popup.css"):
    assert (root / name).is_file(), name
for size in (48, 96, 128, 256, 512):
    assert (root / f"images/icon-{size}.png").is_file()
for size in (16, 19, 32, 38):
    assert (root / f"images/toolbar-icon-{size}.png").is_file()
print("✔ resources")
PY

test -f project.yml
test -f NexusSafariManager/NexusSafariManagerApp.swift
test -f NexusSafariExtension/SafariWebExtensionHandler.swift
for f in ci_scripts/*.sh; do sh -n "$f"; done
echo "✔ all checks passed"

#!/usr/bin/env bash
set -euo pipefail

echo "⟹ Nexus Safari Manager — ci_pre_xcodebuild"

ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"
EXT_DIR="$ROOT/safari-extension"

cd "$EXT_DIR"

# Ensure the Xcode project exists (re-generate if a custom workflow skipped post_clone).
if [ ! -d "NexusSafariManager.xcodeproj" ]; then
  echo "Project missing — regenerating with XcodeGen…"
  command -v xcodegen >/dev/null 2>&1 || brew install xcodegen
  xcodegen generate --spec project.yml
fi

# Stamp marketing / build versions from Xcode Cloud env when provided.
if [ -n "${CI_BUILD_NUMBER:-}" ]; then
  echo "CI_BUILD_NUMBER=$CI_BUILD_NUMBER"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${CI_BUILD_NUMBER}" \
    NexusSafariManager/Info.plist || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${CI_BUILD_NUMBER}" \
    NexusSafariExtension/Info.plist || true
fi

echo "Validating extension Resources…"
test -f NexusSafariExtension/Resources/manifest.json
test -f NexusSafariExtension/Resources/background.js
test -f NexusSafariExtension/Resources/content.js
test -f NexusSafariExtension/Resources/popup.html
test -f NexusSafariExtension/Resources/rules/tracker_block.json

python3 - <<'PY'
import json, pathlib, sys
manifest = pathlib.Path("NexusSafariExtension/Resources/manifest.json")
data = json.loads(manifest.read_text())
assert data.get("manifest_version") == 3, "manifest_version must be 3"
assert "background" in data and "content_scripts" in data and "action" in data
rules = pathlib.Path("NexusSafariExtension/Resources/rules/tracker_block.json")
json.loads(rules.read_text())
print("✔ manifest + rules JSON OK")
PY

echo "✔ Pre-xcodebuild checks passed"

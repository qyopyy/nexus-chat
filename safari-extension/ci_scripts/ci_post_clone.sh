#!/usr/bin/env bash
set -euo pipefail

echo "⟹ Nexus Safari Manager — ci_post_clone"
echo "CI_PRIMARY_REPOSITORY_PATH=${CI_PRIMARY_REPOSITORY_PATH:-}"
echo "CI_WORKSPACE=${CI_WORKSPACE:-}"
echo "PWD=$(pwd)"

ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"
EXT_DIR="$ROOT/safari-extension"

if [ ! -d "$EXT_DIR" ]; then
  echo "error: safari-extension/ not found under $ROOT" >&2
  exit 1
fi

cd "$EXT_DIR"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "Installing XcodeGen via Homebrew…"
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: Homebrew is required to install XcodeGen on Xcode Cloud" >&2
    exit 1
  fi
  brew install xcodegen
fi

echo "Generating NexusSafariManager.xcodeproj…"
xcodegen generate --spec project.yml

if [ ! -d "NexusSafariManager.xcodeproj" ]; then
  echo "error: XcodeGen did not produce NexusSafariManager.xcodeproj" >&2
  exit 1
fi

echo "✔ Project ready at $EXT_DIR/NexusSafariManager.xcodeproj"
ls -la NexusSafariManager.xcodeproj

#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
exec "$ROOT/safari-extension/ci_scripts/ci_post_xcodebuild.sh"

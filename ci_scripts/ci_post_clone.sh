#!/usr/bin/env bash
# Repo-root Xcode Cloud entrypoint → Safari Extension Manager hooks.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
exec "$ROOT/safari-extension/ci_scripts/ci_post_clone.sh"

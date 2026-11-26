#!/usr/bin/env bash
# Black-box test of the chiaki-ng stream-out patch: feeds it a real H.264 + Opus stream, publishes
# into a scratch MediaMTX on free ports (built from mediamtx/mediamtx.yml) and watches it in
# headless Chrome through the WHEP proxy. Needs the patched source, mediamtx, ffmpeg and Chrome.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/vendor/chiaki-ng"
OUT="$ROOT/vendor/streamout-test-build"
[[ -f "$SRC/gui/src/streamout.cpp" ]] || { echo "Run bun run chiaki:build first" >&2; exit 1; }
cmake -S "$ROOT/chiaki/test/stream-out" -B "$OUT" -G Ninja -DCHIAKI_SRC="$SRC" -DCHIAKI_BUILD="$SRC/build" >/dev/null
cmake --build "$OUT" >/dev/null
exec bun "$ROOT/chiaki/test/stream-out/e2e.ts" "$OUT/streamout_test"

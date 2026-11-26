#!/usr/bin/env bash
# Black-box test of the chiaki-ng network-input patch (real UDP on loopback).
# Requires the patched source from scripts/build-chiaki.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/vendor/chiaki-ng"
OUT="$ROOT/vendor/netinput-test-build"
[[ -f "$SRC/gui/src/netinput.cpp" ]] || { echo "Run bun run chiaki:build first" >&2; exit 1; }
cmake -S "$ROOT/chiaki/test" -B "$OUT" -G Ninja -DCHIAKI_SRC="$SRC" -DCHIAKI_BUILD="$SRC/build" \
  -DCMAKE_PREFIX_PATH="$(brew --prefix)/opt/qt@6" >/dev/null
cmake --build "$OUT" >/dev/null
"$OUT/netinput_test"

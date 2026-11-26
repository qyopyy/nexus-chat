#!/usr/bin/env bash
# Builds MediaMTX into vendor/mediamtx/mediamtx with a higher per-frame NAL unit limit.
# Stock MediaMTX drops every H.264 frame made of more than 50 NAL units when it repackages RTSP for
# WebRTC; PlayStation consoles encode keyframes as ~80 slices, so browsers would never get a clean
# keyframe (green, smeared video). The installer prefers this binary when it exists.
# Needs Go and network access. Usage: build-mediamtx.sh [VERSION] (default: the installed version)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-v$(mediamtx --version 2>/dev/null | sed -E 's/^v?([0-9.]+).*/\1/')}"
MAX_NALUS=256
OUT="$ROOT/vendor/mediamtx"
command -v go >/dev/null || { echo "Go is not installed (brew install go)" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'chmod -R u+w "$WORK" 2>/dev/null; rm -rf "$WORK"' EXIT
export GOTOOLCHAIN=auto GOFLAGS=-mod=mod GOPATH="$WORK/gopath" GOCACHE="$WORK/gocache"

echo "==> MediaMTX $VERSION with MaxNALUsPerAccessUnit = $MAX_NALUS"
git clone -q --depth 1 --branch "$VERSION" https://github.com/bluenviron/mediamtx.git "$WORK/mediamtx"
cd "$WORK/mediamtx"
go mod download github.com/bluenviron/mediacommon/v2
cp -R "$(go list -m -f '{{.Dir}}' github.com/bluenviron/mediacommon/v2)" "$WORK/mediacommon"
chmod -R u+w "$WORK/mediacommon"
H264="$WORK/mediacommon/pkg/codecs/h264/h264.go"
sed -i '' -E "s/MaxNALUsPerAccessUnit = [0-9]+/MaxNALUsPerAccessUnit = $MAX_NALUS/" "$H264"
grep -q "MaxNALUsPerAccessUnit = $MAX_NALUS" "$H264" || { echo "Could not patch $H264" >&2; exit 1; }
go mod edit -replace "github.com/bluenviron/mediacommon/v2=$WORK/mediacommon"
go generate ./... >/dev/null
mkdir -p "$OUT"
CGO_ENABLED=0 go build -o "$OUT/mediamtx" .
echo "==> Built $OUT/mediamtx ($("$OUT/mediamtx" --version))"

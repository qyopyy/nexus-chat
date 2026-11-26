#!/usr/bin/env bash
# Builds chiaki-ng for macOS with this project's patches (chiaki/*.patch, AGPL-3.0):
#   net-input.patch   controller input over loopback UDP (CHIAKI_NET_INPUT_PORT)
#   stream-out.patch  publishes the console's own H.264/Opus over RTSP (CHIAKI_STREAM_OUT_URL);
#                     inactive unless that variable is set
# Output: vendor/chiaki-ng/build/gui/chiaki.app. CHIAKI_SRC=DIR overrides the source tree.
# Mirrors chiaki-ng's own macOS CI but never changes global Homebrew links: OpenSSL 3, Qt 6 and
# protobuf 29 are passed by path.
set -euo pipefail

CHIAKI_REPO="https://github.com/streetpea/chiaki-ng.git"
CHIAKI_COMMIT="43728af2e639fecb8a7af1cd68c29820a40de973"
SUBMODULES=(third-party/nanopb third-party/jerasure third-party/gf-complete third-party/curl)
BREW_DEPS=(qt@6 ffmpeg opus openssl@3 cmake ninja nasm protobuf@29 speexdsp libplacebo json-c miniupnpc libevent sdl2-compat pkgconf)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${CHIAKI_SRC:-$ROOT/vendor/chiaki-ng}"
VENV="$ROOT/vendor/.chiaki-venv"
PATCHES=("$ROOT/chiaki/net-input.patch" "$ROOT/chiaki/stream-out.patch")

command -v brew >/dev/null || { echo "Homebrew is required: https://brew.sh" >&2; exit 1; }
BREW="$(brew --prefix)"

echo "==> Homebrew dependencies"
missing=()
for dep in "${BREW_DEPS[@]}"; do brew list --versions "$dep" >/dev/null 2>&1 || missing+=("$dep"); done
if ((${#missing[@]})); then HOMEBREW_NO_AUTO_UPDATE=1 brew install "${missing[@]}"; fi

echo "==> chiaki-ng source at $CHIAKI_COMMIT"
if [[ ! -d "$SRC/.git" ]]; then
  git init -q "$SRC"
  git -C "$SRC" remote add origin "$CHIAKI_REPO"
fi
if [[ "$(git -C "$SRC" rev-parse HEAD 2>/dev/null)" != "$CHIAKI_COMMIT" ]]; then
  git -C "$SRC" fetch -q --depth 1 origin "$CHIAKI_COMMIT"
  git -C "$SRC" checkout -q --force "$CHIAKI_COMMIT"
fi
git -C "$SRC" submodule update -q --init --depth 1 "${SUBMODULES[@]}"

# Applied in order; each one can be reverted on its own with git apply --reverse.
for patch in "${PATCHES[@]}"; do
  echo "==> $(basename "$patch")"
  if git -C "$SRC" apply --reverse --check "$patch" 2>/dev/null; then echo "    already applied"
  else git -C "$SRC" apply "$patch"; fi
done

# nanopb runs protoc from PATH, and the Python protobuf runtime must not be older than that protoc
# (protoc 29.x writes code for Python protobuf 5.29.x). Use protobuf@29's protoc whatever Homebrew
# links, and a runtime that matches it.
echo "==> Python protobuf for the nanopb generator (isolated venv)"
PROTOC_BIN="$BREW/opt/protobuf@29/bin"
PROTOC_VERSION="$("$PROTOC_BIN/protoc" --version | awk '{print $2}')"
[[ -x "$VENV/bin/python3" ]] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q "protobuf>=5.$PROTOC_VERSION,<6" 'setuptools==75.8.0'
export PATH="$VENV/bin:$PROTOC_BIN:$PATH"

echo "==> Configure"
OPENSSL="$BREW/opt/openssl@3"
cmake -S "$SRC" -B "$SRC/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCHIAKI_ENABLE_CLI=OFF \
  -DCHIAKI_ENABLE_TESTS=OFF \
  -DCHIAKI_ENABLE_STEAMDECK_NATIVE=OFF \
  -DCHIAKI_ENABLE_STEAM_SHORTCUT=OFF \
  -DPython3_EXECUTABLE="$VENV/bin/python3" \
  -DOPENSSL_ROOT_DIR="$OPENSSL" \
  -DOPENSSL_INCLUDE_DIR="$OPENSSL/include" \
  -DOPENSSL_CRYPTO_LIBRARY="$OPENSSL/lib/libcrypto.dylib" \
  -DOPENSSL_SSL_LIBRARY="$OPENSSL/lib/libssl.dylib" \
  -DCMAKE_PREFIX_PATH="$OPENSSL;$BREW/opt/qt@6;$BREW/opt/protobuf@29" \
  -DCMAKE_PROJECT_INCLUDE="$ROOT/chiaki/prefer-openssl3.cmake"

echo "==> Build"
export CPATH="$BREW/opt/ffmpeg/include"
cmake --build "$SRC/build" --target chiaki
echo "==> Done: $(find "$SRC/build/gui" -maxdepth 1 -name '*.app' | head -1)"

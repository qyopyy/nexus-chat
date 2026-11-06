#!/usr/bin/env bash
# Fail if an IPA is missing Payload/*/embedded.mobileprovision (Transporter 90174).
set -euo pipefail

IPA="${1:?usage: verify-ipa-provisioning.sh <file.ipa>}"
if [ ! -f "$IPA" ]; then
  echo "::error::IPA not found: $IPA"
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

unzip -q -o "$IPA" -d "$TMP"
APP="$(find "$TMP/Payload" -maxdepth 1 -name '*.app' -type d | head -1 || true)"
if [ -z "$APP" ]; then
  echo "::error::IPA has no Payload/*.app — corrupt archive"
  unzip -l "$IPA" | head -40
  exit 1
fi

PROVISION="$APP/embedded.mobileprovision"
if [ ! -f "$PROVISION" ]; then
  echo "::error::Missing embedded.mobileprovision (Transporter / ASC error 90174)."
  echo "This IPA is unsigned or was not exported with an App Store provisioning profile."
  echo "Use Actions → “iOS App Store (signed)” → download Nexus-AppStore.ipa."
  echo "Do NOT upload Sideloadly releases (ios-N / Nexus.ipa) to Transporter."
  ls -la "$APP" | head -40
  exit 1
fi

echo "embedded.mobileprovision present ($(wc -c < "$PROVISION") bytes)"
if security cms -D -i "$PROVISION" > "$TMP/profile.plist" 2>/dev/null; then
  echo "Profile name: $(plutil -extract Name raw "$TMP/profile.plist" 2>/dev/null || echo '?')"
  echo "Profile UUID: $(plutil -extract UUID raw "$TMP/profile.plist" 2>/dev/null || echo '?')"
  echo "Team: $(plutil -extract TeamName raw "$TMP/profile.plist" 2>/dev/null || echo '?')"
  echo "App ID name: $(plutil -extract AppIDName raw "$TMP/profile.plist" 2>/dev/null || echo '?')"
fi

if command -v codesign >/dev/null 2>&1; then
  codesign -d --verbose=2 "$APP" 2>&1 | head -20 || true
fi

echo "Provisioning OK — safe for Transporter / App Store Connect."

#!/usr/bin/env python3
"""Ensure Nexus iOS Info.plist has App Store privacy purpose strings.

Capgo Cloud Build zips mobile/ios as-is (no GitHub Actions PlistBuddy step),
so these keys must already exist in Info.plist before `build request`.

Usage:
  python3 scripts/patch-ios-info-plist.py [path/to/Info.plist]
"""

from __future__ import annotations

import plistlib
import sys
from pathlib import Path

DEFAULT_PLIST = Path(__file__).resolve().parents[1] / "ios" / "App" / "App" / "Info.plist"

# Keep strings aligned with .github/workflows/ipa.yml / ipa-appstore.yml
STRING_KEYS: dict[str, str] = {
    "NSLocationWhenInUseUsageDescription": (
        "Nexus uses your location for Bump so you can find friends and family nearby. "
        "Location is rounded and expires after 20 minutes."
    ),
    "NSLocationAlwaysAndWhenInUseUsageDescription": (
        "Nexus can refresh your Bump pin in the background while you are Live, "
        "so family can keep finding you nearby. Turn Live off anytime to stop sharing."
    ),
    "NSMicrophoneUsageDescription": "Nexus uses your microphone for voice calls.",
    "NSCameraUsageDescription": "Nexus uses your camera for video calls.",
    "NSPhotoLibraryUsageDescription": "Choose photos and videos to send in chats.",
    "NSPhotoLibraryAddUsageDescription": "Save photos and videos from chats.",
    "UIUserInterfaceStyle": "Dark",
    "NSHumanReadableCopyright": "© 2026 qyopy",
}

BACKGROUND_MODES = [
    "audio",
    "voip",
    "remote-notification",
    "fetch",
    "location",
]


def patch(path: Path) -> list[str]:
    if not path.is_file():
        raise FileNotFoundError(f"Info.plist not found: {path}")

    with path.open("rb") as f:
        data = plistlib.load(f)

    changed: list[str] = []

    for key, value in STRING_KEYS.items():
        if data.get(key) != value:
            data[key] = value
            changed.append(key)

    modes = list(data.get("UIBackgroundModes") or [])
    for mode in BACKGROUND_MODES:
        if mode not in modes:
            modes.append(mode)
            changed.append(f"UIBackgroundModes:{mode}")
    data["UIBackgroundModes"] = modes

    if data.get("ITSAppUsesNonExemptEncryption") is not False:
        data["ITSAppUsesNonExemptEncryption"] = False
        changed.append("ITSAppUsesNonExemptEncryption")

    if data.get("CFBundleDisplayName") != "Nexus":
        data["CFBundleDisplayName"] = "Nexus"
        changed.append("CFBundleDisplayName")

    # App Store / iOS 26+: armv7-only marks the binary as 32-bit
    caps = list(data.get("UIRequiredDeviceCapabilities") or [])
    if caps != ["arm64"]:
        data["UIRequiredDeviceCapabilities"] = ["arm64"]
        changed.append("UIRequiredDeviceCapabilities")

    with path.open("wb") as f:
        plistlib.dump(data, f, sort_keys=False)

    return changed


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PLIST
    changed = patch(path)
    if changed:
        print(f"Patched {path}")
        for key in changed:
            print(f"  + {key}")
    else:
        print(f"Already up to date: {path}")
    # Always verify location keys exist (ITMS-90683)
    with path.open("rb") as f:
        data = plistlib.load(f)
    for key in (
        "NSLocationWhenInUseUsageDescription",
        "NSLocationAlwaysAndWhenInUseUsageDescription",
    ):
        if not data.get(key):
            print(f"ERROR: missing {key}", file=sys.stderr)
            return 1
        print(f"OK {key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

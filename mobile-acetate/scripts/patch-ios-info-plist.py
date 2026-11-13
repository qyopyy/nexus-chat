#!/usr/bin/env python3
"""Acetate Info.plist: display name, background audio, and photo purpose strings.

Acetate does not request location. Do not copy Nexus location keys onto this app.
"""

from __future__ import annotations

import plistlib
import sys
from pathlib import Path

STRING_KEYS = {
    "CFBundleDisplayName": "Acetate",
    "CFBundleName": "Acetate",
    "NSPhotoLibraryUsageDescription": "Choose cover art for a track you own in Acetate.",
    "NSPhotoLibraryAddUsageDescription": "Save cover art from Acetate.",
    "NSMicrophoneUsageDescription": "Acetate uses the microphone only if you record a voice memo into Vault.",
    "UIUserInterfaceStyle": "Dark",
    "NSHumanReadableCopyright": "© 2026 qyopy",
}


def patch(path: Path) -> None:
    with path.open("rb") as handle:
        data = plistlib.load(handle)
    data.update(STRING_KEYS)
    data["CFBundleIdentifier"] = "hu.qyopy.acetate"
    data["ITSAppUsesNonExemptEncryption"] = False
    data["UIRequiredDeviceCapabilities"] = ["arm64"]
    modes = [mode for mode in (data.get("UIBackgroundModes") or []) if mode != "location"]
    if "audio" not in modes:
        modes.append("audio")
    data["UIBackgroundModes"] = modes
    for key in (
        "NSLocationWhenInUseUsageDescription",
        "NSLocationAlwaysAndWhenInUseUsageDescription",
        "NSLocationAlwaysUsageDescription",
    ):
        data.pop(key, None)
    with path.open("wb") as handle:
        plistlib.dump(data, handle)
    print(f"patched {path}")


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "ios/App/App/Info.plist")
    patch(target)

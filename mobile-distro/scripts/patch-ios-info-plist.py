#!/usr/bin/env python3
"""Distro Info.plist: display name and artwork purpose strings.

Distro does not request location. Do not copy Nexus location keys onto this app.
"""

from __future__ import annotations

import plistlib
import sys
from pathlib import Path

STRING_KEYS = {
    "CFBundleDisplayName": "Distro",
    "CFBundleName": "Distro",
    "NSPhotoLibraryUsageDescription": "Choose artwork for a release in Distro.",
    "NSPhotoLibraryAddUsageDescription": "Save artwork from Distro.",
    "UIUserInterfaceStyle": "Dark",
    "NSHumanReadableCopyright": "© 2026 qyopy",
}


def patch(path: Path) -> None:
    with path.open("rb") as handle:
        data = plistlib.load(handle)
    data.update(STRING_KEYS)
    data["CFBundleIdentifier"] = "hu.qyopy.distro"
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

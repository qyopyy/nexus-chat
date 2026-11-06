#!/usr/bin/env python3
from __future__ import annotations
import plistlib, sys
from pathlib import Path
DEFAULT = Path(__file__).resolve().parents[1] / "ios" / "App" / "App" / "Info.plist"
STRING_KEYS = {'NSMicrophoneUsageDescription': 'Nexus Browser may use the microphone for web pages that request it.', 'NSCameraUsageDescription': 'Nexus Browser may use the camera for web pages that request it.', 'NSPhotoLibraryUsageDescription': 'Choose photos to upload in Nexus Browser.', 'NSPhotoLibraryAddUsageDescription': 'Save photos from Nexus Browser.', 'UIUserInterfaceStyle': 'Dark', 'NSHumanReadableCopyright': '© 2026 qyopy'}
BACKGROUND = ['audio', 'remote-notification', 'fetch']
DISPLAY = 'Nexus Browser'

def patch(path: Path):
    data = plistlib.load(path.open("rb"))
    for k,v in STRING_KEYS.items():
        data[k]=v
    modes=list(data.get("UIBackgroundModes") or [])
    for m in BACKGROUND:
        if m not in modes: modes.append(m)
    data["UIBackgroundModes"]=modes
    data["ITSAppUsesNonExemptEncryption"]=False
    data["CFBundleDisplayName"]=DISPLAY
    data["UIRequiredDeviceCapabilities"]=["arm64"]
    plistlib.dump(data, path.open("wb"), sort_keys=False)
    print("OK", path)
    for k in STRING_KEYS:
        if "Location" in k:
            assert data.get(k), k

if __name__ == "__main__":
    patch(Path(sys.argv[1]) if len(sys.argv)>1 else DEFAULT)

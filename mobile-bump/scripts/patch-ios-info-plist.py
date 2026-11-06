#!/usr/bin/env python3
from __future__ import annotations
import plistlib, sys
from pathlib import Path
DEFAULT = Path(__file__).resolve().parents[1] / "ios" / "App" / "App" / "Info.plist"
STRING_KEYS = {'NSLocationWhenInUseUsageDescription': 'Wump uses your location so friends and family can find you nearby. Location is rounded and expires after 20 minutes.', 'NSLocationAlwaysAndWhenInUseUsageDescription': 'Wump can refresh your pin in the background while you are Live, so family can keep finding you nearby. Turn Live off anytime to stop sharing.', 'NSMicrophoneUsageDescription': 'Wump may use the microphone for in-app voice features.', 'NSCameraUsageDescription': 'Wump may use the camera for profile photos and sharing.', 'NSPhotoLibraryUsageDescription': 'Choose photos to share in Wump.', 'NSPhotoLibraryAddUsageDescription': 'Save photos from Wump.', 'UIUserInterfaceStyle': 'Dark', 'NSHumanReadableCopyright': '© 2026 qyopy'}
BACKGROUND = ['audio', 'voip', 'remote-notification', 'fetch', 'location']
DISPLAY = 'Wump'

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

#!/usr/bin/env python3
"""Enable closed-app push (APNs) in a fresh `npx cap add ios` project.

1. AppDelegate.swift: forward the APNs device token to Capacitor (required by @capacitor/push-notifications).
2. If the provisioning profile carries `aps-environment`, write App.entitlements with it and point
   CODE_SIGN_ENTITLEMENTS at it. Profiles without the Push capability are left alone so the build never breaks.

usage: patch-ios-push.py <ios/App dir> <profile.plist>
"""
import plistlib, re, subprocess, sys
from pathlib import Path

app_dir = Path(sys.argv[1])
profile_plist = Path(sys.argv[2]) if len(sys.argv) > 2 else None

delegate = app_dir / "App" / "AppDelegate.swift"
if delegate.exists():
    src = delegate.read_text()
    if "capacitorDidRegisterForRemoteNotifications" not in src:
        hook = '''
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
'''
        idx = src.rstrip().rfind("}")
        src = src[:idx] + hook + src[idx:]
        delegate.write_text(src)
        print("AppDelegate: APNs token forwarding added")

aps = None
if profile_plist and profile_plist.exists():
    with profile_plist.open("rb") as f:
        aps = (plistlib.load(f).get("Entitlements") or {}).get("aps-environment")

if not aps:
    print("::warning::Provisioning profile has no Push Notifications capability — closed-app push disabled for this build. "
          "Enable Push Notifications on the App ID (developer.apple.com → Identifiers), regenerate the App Store profile and update the secret.")
    sys.exit(0)

ent = app_dir / "App" / "App.entitlements"
data = {}
if ent.exists():
    with ent.open("rb") as f:
        data = plistlib.load(f)
data["aps-environment"] = aps
with ent.open("wb") as f:
    plistlib.dump(data, f)

pbx = app_dir / "App.xcodeproj" / "project.pbxproj"
txt = pbx.read_text()
if "CODE_SIGN_ENTITLEMENTS" not in txt:
    txt = re.sub(r"(\n(\s*)PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)", r"\1\n\2CODE_SIGN_ENTITLEMENTS = App/App.entitlements;", txt)
    pbx.write_text(txt)
print(f"Push entitlements enabled (aps-environment={aps})")

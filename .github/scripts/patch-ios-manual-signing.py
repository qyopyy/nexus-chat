#!/usr/bin/env python3
"""Force Capacitor's generated Xcode project onto Manual signing for App Store CI.

Capacitor scaffolds CODE_SIGN_STYLE = Automatic. Cloud signing must pin the App
target to Manual + the Distribution profile UUID/name, without stamping
PRODUCT_BUNDLE_IDENTIFIER onto embedded frameworks (that causes Sideloadly /
ASC identity collisions and can drop embedded.mobileprovision).
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys


APP_MARKERS = (
    "INFOPLIST_FILE = App/Info.plist",
    "INFOPLIST_FILE = App/App/Info.plist",
    'INFOPLIST_FILE = "App/Info.plist"',
    'INFOPLIST_FILE = "App/App/Info.plist"',
)


def is_app_target_settings(block: str) -> bool:
    if any(m in block for m in APP_MARKERS):
        return True
    if "PRODUCT_BUNDLE_IDENTIFIER" in block and "PRODUCT_NAME = App" in block:
        return True
    return False


def set_or_add(block: str, key: str, value: str) -> str:
    line = f"\t\t\t\t{key} = {value};"
    pattern = re.compile(rf"^[ \t]*{re.escape(key)} = .*?;[ \t]*$", re.M)
    if pattern.search(block):
        return pattern.sub(line, block)
    return block.replace("\n\t\t\t};", "\n" + line + "\n\t\t\t};", 1)


def patch_pbxproj(text: str, *, bundle_id: str, team_id: str, profile_uuid: str, profile_name: str) -> str:
    text = text.replace("CODE_SIGN_STYLE = Automatic;", "CODE_SIGN_STYLE = Manual;")

    out: list[str] = []
    pos = 0
    for m in re.finditer(r"buildSettings = \{.*?\n\t\t\t\};", text, re.S):
        out.append(text[pos : m.start()])
        block = m.group(0)
        if is_app_target_settings(block):
            block = set_or_add(block, "CODE_SIGN_STYLE", "Manual")
            block = set_or_add(block, "DEVELOPMENT_TEAM", team_id)
            block = set_or_add(block, "CODE_SIGN_IDENTITY", '"Apple Distribution"')
            block = set_or_add(block, '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"', '"Apple Distribution"')
            block = set_or_add(block, "PROVISIONING_PROFILE", profile_uuid)
            block = set_or_add(block, "PROVISIONING_PROFILE_SPECIFIER", f'"{profile_name}"')
            block = set_or_add(block, "PRODUCT_BUNDLE_IDENTIFIER", bundle_id)
        out.append(block)
        pos = m.end()
    out.append(text[pos:])
    return "".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pbxproj", type=pathlib.Path)
    ap.add_argument("--bundle-id", required=True)
    ap.add_argument("--team-id", required=True)
    ap.add_argument("--profile-uuid", required=True)
    ap.add_argument("--profile-name", required=True)
    args = ap.parse_args()

    raw = args.pbxproj.read_text(encoding="utf-8")
    patched = patch_pbxproj(
        raw,
        bundle_id=args.bundle_id,
        team_id=args.team_id,
        profile_uuid=args.profile_uuid,
        profile_name=args.profile_name,
    )
    args.pbxproj.write_text(patched, encoding="utf-8")
    manuals = patched.count("CODE_SIGN_STYLE = Manual")
    profiles = patched.count("PROVISIONING_PROFILE = ")
    print(f"patched {args.pbxproj}: CODE_SIGN_STYLE Manual×{manuals}, PROVISIONING_PROFILE×{profiles}")
    if manuals < 1:
        print("warning: expected at least one Manual CODE_SIGN_STYLE", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

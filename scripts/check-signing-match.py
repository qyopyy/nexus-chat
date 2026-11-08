#!/usr/bin/env python3
"""Fail early (with a clear message) when the imported .p12 and the App Store profile don't belong together.

usage: check-signing-match.py PROFILE_PLIST KEYCHAIN TEAM_ID

Most common real-world cause of signing failures after "Missing Provisioning Profile (90174)":
a NEW Apple Distribution certificate was created, but the App Store provisioning profiles were
made earlier (they embed the certificates they were created with) — so xcodebuild can't pair them.
"""
import datetime
import hashlib
import plistlib
import subprocess
import sys


def err(msg: str) -> None:
    print(f"::error::{msg}")
    sys.exit(1)


plist_path, keychain, team = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "").strip()
with open(plist_path, "rb") as f:
    prof = plistlib.load(f)

name = prof.get("Name", "?")
exp = prof.get("ExpirationDate")
if isinstance(exp, datetime.datetime):
    now = datetime.datetime.now(exp.tzinfo) if exp.tzinfo else datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    if exp < now:
        err(f'Provisioning profile "{name}" expired on {exp:%Y-%m-%d}. Regenerate it at developer.apple.com → Profiles and update the GitHub secret.')

teams = prof.get("TeamIdentifier") or []
if team and teams and team not in teams:
    err(f'Profile "{name}" belongs to team {", ".join(teams)} but APPLE_TEAM_ID is {team}.')

prof_certs = {hashlib.sha1(c).hexdigest().upper(): c for c in prof.get("DeveloperCertificates", [])}

out = subprocess.run(["security", "find-certificate", "-a", "-Z", keychain], capture_output=True, text=True).stdout
mine = []
cur_hash = None
for line in out.splitlines():
    line = line.strip()
    if line.startswith("SHA-1 hash:"):
        cur_hash = line.split(":", 1)[1].strip().upper()
    elif line.startswith('"labl"') and cur_hash and "Distribution" in line:
        mine.append((cur_hash, line.split("=", 1)[1].strip().strip('"')))
        cur_hash = None

if not mine:
    err("No Apple Distribution certificate found in APPLE_CERTIFICATE_BASE64. It must be a .p12 that contains the certificate AND its private key (a .cer alone can't sign).")

matched = [m for m in mine if m[0] in prof_certs]
print(f'Profile "{name}" contains {len(prof_certs)} certificate(s); keychain has: ' + ", ".join(f"{label} [{h[:8]}]" for h, label in mine))
if not matched:
    err(
        f'The App Store profile "{name}" was not created with the Apple Distribution certificate in APPLE_CERTIFICATE_BASE64 '
        f"({', '.join(h[:8] for h, _ in mine)}). This happens after creating a new certificate: open developer.apple.com → Profiles, "
        "edit (or recreate) the App Store profile, tick the NEW certificate, download it and replace the profile secret."
    )
print(f"Signing pair OK: {matched[0][1]}")

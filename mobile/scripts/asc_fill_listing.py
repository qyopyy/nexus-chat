#!/usr/bin/env python3
"""Fill App Store Connect listing fields + upload required screenshots via ASC API."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

import jwt
import requests
from cryptography.hazmat.primitives import serialization

KEY_ID = os.environ.get("ASC_KEY_ID", "P3HXUXF73M")
ISSUER_ID = os.environ.get("ASC_ISSUER_ID", "773af25b-c581-4ae9-8734-ed2fdc93f0c6")
P8_PATH = Path(os.environ.get("ASC_P8_PATH", "/home/ubuntu/capgo-keys/AuthKey_P3HXUXF73M.p8"))
BUNDLE_ID = "hu.qyopy.nexus.B44X8B76QR"
BASE = "https://api.appstoreconnect.apple.com/v1"

DESCRIPTION = """Nexus is your social home for chatting with friends, joining communities, and staying nearby — with music, maps, and useful tools built in.

CHAT & COMMUNITIES
• Instant messaging with friends and servers
• Voice and video calls
• Share photos, files, and links
• Stay in sync across iPhone, Android, and the web

WUMP — LIVE PLACES
• Share your Live pin with friends or family when you choose
• OpenStreetMap-based map with privacy controls
• Invite links for people you trust
• Turn Live off anytime — location sharing stops

MUSIC & CREATIVE APPS
• Listen and discover inside Nexus
• Nexus Link — link-in-bio pages with themes
• Image studio, docs tools, QR maker, and more

BUILT-IN BROWSER
• Search the web without leaving Nexus
• Shields and private DNS options for safer browsing

ONE ACCOUNT, EVERYWHERE
• Same login on web, iPhone, and Android
• Your chats, friends, and apps travel with you

PRIVACY YOU CONTROL
• Location is only shared while Live is on
• Choose friends, family, or a short everyone flash
• Review privacy settings anytime at https://nexusproject.cc/privacy

Nexus is built by qyopy. Support: https://nexusproject.cc"""

KEYWORDS = "chat,friends,messaging,map,location,social,music,calls,community,voice"
SUPPORT_URL = "https://nexusproject.cc"
PRIVACY_URL = "https://nexusproject.cc/privacy"
MARKETING_URL = "https://nexusproject.cc"
COPYRIGHT = "© 2026 qyopy"
SUBTITLE = "Chat · friends · places"
PROMO = (
    "Stay close to friends with chat, voice, Live places on Wump, music, and more — "
    "one Nexus home on iPhone."
)

SHOT_DIR = Path("/opt/cursor/artifacts/app-store-screenshots")


def token() -> str:
    key = serialization.load_pem_private_key(P8_PATH.read_bytes(), password=None)
    now = int(time.time())
    payload = {"iss": ISSUER_ID, "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, key, algorithm="ES256", headers={"alg": "ES256", "kid": KEY_ID})


class Asc:
    def __init__(self) -> None:
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})

    def refresh(self) -> None:
        self.s.headers["Authorization"] = f"Bearer {token()}"

    def get(self, path: str, **params):
        self.refresh()
        r = self.s.get(f"{BASE}{path}", params=params or None)
        if not r.ok:
            raise RuntimeError(f"GET {path} -> {r.status_code} {r.text[:800]}")
        return r.json()

    def patch(self, path: str, body: dict):
        self.refresh()
        r = self.s.patch(f"{BASE}{path}", data=json.dumps(body))
        if not r.ok:
            raise RuntimeError(f"PATCH {path} -> {r.status_code} {r.text[:1200]}")
        return r.json()

    def post(self, path: str, body: dict):
        self.refresh()
        r = self.s.post(f"{BASE}{path}", data=json.dumps(body))
        if not r.ok:
            raise RuntimeError(f"POST {path} -> {r.status_code} {r.text[:1200]}")
        return r.json()


def find_app(api: Asc) -> str:
    data = api.get("/apps", **{"filter[bundleId]": BUNDLE_ID})
    apps = data.get("data") or []
    if not apps:
        raise RuntimeError("App not found for bundle id")
    return apps[0]["id"]


def latest_ios_version(api: Asc, app_id: str) -> dict:
    data = api.get(
        f"/apps/{app_id}/appStoreVersions",
        **{"filter[platform]": "IOS", "limit": 10},
    )
    versions = data.get("data") or []
    if not versions:
        raise RuntimeError("No iOS App Store versions")
    # Prefer editable states
    prefer = {
        "PREPARE_FOR_SUBMISSION",
        "DEVELOPER_REJECTED",
        "REJECTED",
        "METADATA_REJECTED",
        "WAITING_FOR_REVIEW",
        "INVALID_BINARY",
    }
    for v in versions:
        if v["attributes"].get("appStoreState") in prefer or v["attributes"].get("appVersionState") in prefer:
            return v
    return versions[0]


def ensure_localization(api: Asc, version_id: str) -> str:
    data = api.get(f"/appStoreVersions/{version_id}/appStoreVersionLocalizations")
    locs = data.get("data") or []
    for loc in locs:
        if loc["attributes"].get("locale") == "en-US":
            return loc["id"]
    # create en-US
    body = {
        "data": {
            "type": "appStoreVersionLocalizations",
            "attributes": {"locale": "en-US", "description": DESCRIPTION},
            "relationships": {
                "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}
            },
        }
    }
    created = api.post("/appStoreVersionLocalizations", body)
    return created["data"]["id"]


def patch_localization(api: Asc, loc_id: str) -> None:
    body = {
        "data": {
            "type": "appStoreVersionLocalizations",
            "id": loc_id,
            "attributes": {
                "description": DESCRIPTION,
                "keywords": KEYWORDS,
                "supportUrl": SUPPORT_URL,
                "marketingUrl": MARKETING_URL,
                "promotionalText": PROMO,
            },
        }
    }
    # subtitle may be on localization too
    try:
        body["data"]["attributes"]["subtitle"] = SUBTITLE
        api.patch(f"/appStoreVersionLocalizations/{loc_id}", body)
    except RuntimeError:
        body["data"]["attributes"].pop("subtitle", None)
        api.patch(f"/appStoreVersionLocalizations/{loc_id}", body)
    print(f"Updated localization {loc_id}")


def patch_copyright(api: Asc, version_id: str) -> None:
    body = {
        "data": {
            "type": "appStoreVersions",
            "id": version_id,
            "attributes": {"copyright": COPYRIGHT},
        }
    }
    api.patch(f"/appStoreVersions/{version_id}", body)
    print(f"Updated copyright on version {version_id}")


def patch_privacy_and_category(api: Asc, app_id: str) -> None:
    infos = api.get(f"/apps/{app_id}/appInfos")
    info_list = infos.get("data") or []
    if not info_list:
        print("No appInfos found")
        return
    # Prefer the one for prepare for submission / locale
    info = info_list[0]
    for candidate in info_list:
        state = (candidate.get("attributes") or {}).get("appStoreState") or ""
        if "PREPARE" in state or "READY" in state or not state:
            info = candidate
            break
    info_id = info["id"]

    # Primary category SOCIAL_NETWORKING
    cats = api.get("/appCategories", **{"filter[platforms]": "IOS", "limit": 200})
    social_id = None
    lifestyle_id = None
    for c in cats.get("data") or []:
        attr = c.get("attributes") or {}
        # id often equals the category type string
        cid = c["id"]
        if cid == "SOCIAL_NETWORKING" or attr.get("name") == "Social Networking":
            social_id = cid
        if cid == "LIFESTYLE" or attr.get("name") == "Lifestyle":
            lifestyle_id = cid
    if not social_id:
        social_id = "SOCIAL_NETWORKING"
    print(f"Categories social={social_id} lifestyle={lifestyle_id}")

    rel: dict = {
        "primaryCategory": {"data": {"type": "appCategories", "id": social_id}},
    }
    if lifestyle_id:
        rel["secondaryCategory"] = {"data": {"type": "appCategories", "id": lifestyle_id}}
    try:
        api.patch(
            f"/appInfos/{info_id}",
            {"data": {"type": "appInfos", "id": info_id, "relationships": rel}},
        )
        print(f"Set primary category on appInfo {info_id}")
    except RuntimeError as e:
        print(f"Category patch note: {e}")

    locs = api.get(f"/appInfos/{info_id}/appInfoLocalizations")
    en = None
    for loc in locs.get("data") or []:
        if loc["attributes"].get("locale") == "en-US":
            en = loc
            break
    if not en and (locs.get("data") or []):
        en = locs["data"][0]
    if not en:
        print("No appInfoLocalizations for privacy URL")
        return
    loc_id = en["id"]
    api.patch(
        f"/appInfoLocalizations/{loc_id}",
        {
            "data": {
                "type": "appInfoLocalizations",
                "id": loc_id,
                "attributes": {"privacyPolicyUrl": PRIVACY_URL},
            }
        },
    )
    print(f"Set privacyPolicyUrl on {loc_id}")


def upload_file(api: Asc, operations: list, file_path: Path) -> None:
    raw = file_path.read_bytes()
    offset = 0
    for op in operations:
        length = int(op["length"])
        chunk = raw[offset : offset + length]
        offset += length
        headers = {h["name"]: h["value"] for h in op.get("requestHeaders") or []}
        method = op.get("method", "PUT").upper()
        url = op["url"]
        # Upload URLs are pre-signed — do not send ASC auth
        r = requests.request(method, url, data=chunk, headers=headers, timeout=120)
        if not r.ok:
            raise RuntimeError(f"Upload failed {r.status_code} {r.text[:300]}")


def ensure_screenshot_set(api: Asc, loc_id: str, display_type: str) -> str:
    sets = api.get(
        f"/appStoreVersionLocalizations/{loc_id}/appScreenshotSets",
        **{"filter[screenshotDisplayType]": display_type},
    )
    existing = sets.get("data") or []
    if existing:
        return existing[0]["id"]
    created = api.post(
        "/appScreenshotSets",
        {
            "data": {
                "type": "appScreenshotSets",
                "attributes": {"screenshotDisplayType": display_type},
                "relationships": {
                    "appStoreVersionLocalization": {
                        "data": {"type": "appStoreVersionLocalizations", "id": loc_id}
                    }
                },
            }
        },
    )
    return created["data"]["id"]


def clear_screenshots(api: Asc, set_id: str) -> None:
    shots = api.get(f"/appScreenshotSets/{set_id}/appScreenshots")
    for shot in shots.get("data") or []:
        api.refresh()
        r = api.s.delete(f"{BASE}/appScreenshots/{shot['id']}")
        if not r.ok and r.status_code != 404:
            print(f"Warn delete screenshot {shot['id']}: {r.status_code}")


def upload_screenshots(api: Asc, loc_id: str, display_type: str, paths: list[Path]) -> None:
    set_id = ensure_screenshot_set(api, loc_id, display_type)
    clear_screenshots(api, set_id)
    for i, path in enumerate(paths, 1):
        raw = path.read_bytes()
        created = api.post(
            "/appScreenshots",
            {
                "data": {
                    "type": "appScreenshots",
                    "attributes": {"fileName": path.name, "fileSize": len(raw)},
                    "relationships": {
                        "appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": set_id}}
                    },
                }
            },
        )
        shot_id = created["data"]["id"]
        # Fetch upload operations
        detail = api.get(f"/appScreenshots/{shot_id}")
        ops = (detail["data"]["attributes"].get("uploadOperations") or [])
        if not ops:
            # sometimes returned on create
            ops = created["data"]["attributes"].get("uploadOperations") or []
        upload_file(api, ops, path)
        api.patch(
            f"/appScreenshots/{shot_id}",
            {
                "data": {
                    "type": "appScreenshots",
                    "id": shot_id,
                    "attributes": {
                        "uploaded": True,
                        "sourceFileChecksum": __import__("hashlib").md5(raw).hexdigest(),
                    },
                }
            },
        )
        print(f"Uploaded {path.name} -> {display_type} ({i}/{len(paths)})")


def discover_display_types(api: Asc, loc_id: str) -> list[str]:
    """Probe which screenshot display types ASC accepts for this localization."""
    candidates = [
        # Newer Dynamic Island medium
        "APP_IPHONE_61",
        "APP_IPHONE_65",
        "APP_IPHONE_67",
        "APP_IPHONE_69",
        # iPad 13"
        "APP_IPAD_PRO_3GEN_129",
        "APP_IPAD_PRO_129",
        "APP_IPAD_129",
    ]
    ok = []
    for dt in candidates:
        try:
            ensure_screenshot_set(api, loc_id, dt)
            ok.append(dt)
            print(f"display type OK: {dt}")
        except RuntimeError as e:
            msg = str(e)
            if "ENTITY_ERROR.ATTRIBUTE.INVALID" in msg or "not a valid" in msg.lower() or "409" in msg or "400" in msg:
                print(f"display type skip: {dt}")
            else:
                print(f"display type error {dt}: {e}")
    return ok


def main() -> int:
    if not P8_PATH.is_file():
        print(f"Missing p8: {P8_PATH}", file=sys.stderr)
        return 1
    api = Asc()
    app_id = find_app(api)
    print(f"App id: {app_id}")
    version = latest_ios_version(api, app_id)
    version_id = version["id"]
    print(
        f"Version: {version['attributes'].get('versionString')} "
        f"state={version['attributes'].get('appStoreState') or version['attributes'].get('appVersionState')} id={version_id}"
    )

    loc_id = ensure_localization(api, version_id)
    patch_localization(api, loc_id)
    patch_copyright(api, version_id)
    patch_privacy_and_category(api, app_id)

    # Screenshots
    iphone = sorted(SHOT_DIR.glob("iphone-medium-1206x2622-*.jpg"))[:4]
    ipad = sorted(SHOT_DIR.glob("ipad-13-2064x2752-*.jpg"))[:4]
    if not iphone or not ipad:
        print("Screenshot files missing", file=sys.stderr)
        return 1

    # Prefer known mappings for 1206x2622 (medium DI) and 13" iPad
    iphone_types = ["APP_IPHONE_61", "APP_IPHONE_65", "APP_IPHONE_67"]
    ipad_types = ["APP_IPAD_PRO_3GEN_129", "APP_IPAD_PRO_129"]

    iphone_ok = None
    for dt in iphone_types:
        try:
            upload_screenshots(api, loc_id, dt, iphone)
            iphone_ok = dt
            break
        except RuntimeError as e:
            print(f"iPhone set {dt} failed: {e}")
    if not iphone_ok:
        print("ERROR: could not upload iPhone screenshots", file=sys.stderr)
        return 1

    ipad_ok = None
    for dt in ipad_types:
        try:
            upload_screenshots(api, loc_id, dt, ipad)
            ipad_ok = dt
            break
        except RuntimeError as e:
            print(f"iPad set {dt} failed: {e}")
    if not ipad_ok:
        print("ERROR: could not upload iPad screenshots", file=sys.stderr)
        return 1

    print("DONE")
    print(f"iphone_display_type={iphone_ok}")
    print(f"ipad_display_type={ipad_ok}")
    print(f"privacy={PRIVACY_URL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

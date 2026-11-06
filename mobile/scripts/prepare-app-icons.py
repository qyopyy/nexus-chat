#!/usr/bin/env python3
"""Build AppIcon.appiconset for Nexus iOS.

Prefer macOS `sips` (GitHub Actions) + the committed opaque master
`resources/icon-1024-opaque.png` so CI never needs pip/Pillow.
Falls back to Pillow only if sips is unavailable.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

BG = (0x1E, 0x1F, 0x22)


def run(cmd: list[str]) -> None:
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def with_sips(src: Path, iconset: Path, images: list[dict]) -> None:
    for img in images:
        sw, _ = img["size"].split("x")
        scale = int(img["scale"].replace("x", ""))
        px = int(round(float(sw) * scale))
        out = iconset / img["filename"]
        run(["sips", "-z", str(px), str(px), str(src), "--out", str(out)])
        # Force PNG without alpha when possible (marketing slot must be opaque RGB)
        run(["sips", "-s", "format", "png", str(out), "--out", str(out)])
        print(out.name, px, "sips")


def with_pillow(src: Path, iconset: Path, images: list[dict]) -> None:
    from PIL import Image  # type: ignore

    base = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", base.size, (*BG, 255))
    flat = Image.alpha_composite(bg, base).convert("RGB")
    for img in images:
        sw, _ = img["size"].split("x")
        scale = int(img["scale"].replace("x", ""))
        px = int(round(float(sw) * scale))
        out = iconset / img["filename"]
        flat.resize((px, px), Image.Resampling.LANCZOS).save(out, format="PNG", optimize=True)
        print(out.name, px, "pillow")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    opaque = root / "resources" / "icon-1024-opaque.png"
    rgba = root / "resources" / "icon-1024.png"
    contents = root / "resources" / "AppIcon.Contents.json"
    iconset = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "ios/App/App/Assets.xcassets/AppIcon.appiconset"
    iconset.mkdir(parents=True, exist_ok=True)

    src = opaque if opaque.exists() else rgba
    if not src.exists():
        raise SystemExit(f"missing icon master: {opaque} or {rgba}")

    data = json.loads(contents.read_text())
    (iconset / "Contents.json").write_text(json.dumps(data, indent=2) + "\n")
    images = data["images"]

    if shutil.which("sips"):
        # If only RGBA master exists, flatten via JPEG round-trip then PNG
        work = src
        if src == rgba:
            tmp_jpg = iconset / ".flatten.jpg"
            tmp_png = iconset / ".flatten.png"
            run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "100", str(rgba), "--out", str(tmp_jpg)])
            run(["sips", "-s", "format", "png", str(tmp_jpg), "--out", str(tmp_png)])
            work = tmp_png
            # Also refresh opaque master for future CI
            shutil.copyfile(tmp_png, opaque)
        with_sips(work, iconset, images)
        for p in iconset.glob(".flatten.*"):
            p.unlink(missing_ok=True)
    else:
        with_pillow(src, iconset, images)

    marketing = iconset / "AppIcon-1024.png"
    assert marketing.exists() and marketing.stat().st_size > 1000, "missing marketing icon"
    # Best-effort mode check when `file` exists
    try:
        info = subprocess.check_output(["file", str(marketing)], text=True)
        print("marketing:", info.strip())
        if "RGBA" in info and "RGB" not in info.replace("RGBA", ""):
            print("WARNING: marketing icon may still have alpha")
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    print("OK", iconset)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

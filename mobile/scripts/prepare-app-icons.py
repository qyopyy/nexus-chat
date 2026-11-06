#!/usr/bin/env python3
"""Build AppIcon.appiconset from icon-1024.png with opaque RGB (App Store safe)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

BG = (0x1E, 0x1F, 0x22)  # Nexus shell background


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    src = root / "resources" / "icon-1024.png"
    contents = root / "resources" / "AppIcon.Contents.json"
    iconset = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "ios/App/App/Assets.xcassets/AppIcon.appiconset"
    iconset.mkdir(parents=True, exist_ok=True)

    base = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", base.size, (*BG, 255))
    flat = Image.alpha_composite(bg, base).convert("RGB")

    data = json.loads(contents.read_text())
    (iconset / "Contents.json").write_text(json.dumps(data, indent=2) + "\n")

    for img in data["images"]:
        sw, _ = img["size"].split("x")
        scale = int(img["scale"].replace("x", ""))
        px = int(round(float(sw) * scale))
        out = iconset / img["filename"]
        flat.resize((px, px), Image.Resampling.LANCZOS).save(out, format="PNG", optimize=True)
        print(out.name, px, "opaque-rgb")

    marketing = iconset / "AppIcon-1024.png"
    assert marketing.exists() and marketing.stat().st_size > 1000
    # Also write opaque master for debugging / ASC uploads
    opaque = root / "resources" / "icon-1024-opaque.png"
    flat.save(opaque, format="PNG", optimize=True)
    print("wrote", opaque)
    print("OK", iconset)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

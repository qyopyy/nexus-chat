#!/usr/bin/env python3
"""Resize resources/icon-1024*.png into AppIcon.appiconset when Contents.json exists."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

src = Path("resources/icon-1024-opaque.png")
if not src.exists():
    src = Path("resources/icon-1024.png")
if not src.exists():
    raise SystemExit(0)

iconset = Path("ios/App/App/Assets.xcassets/AppIcon.appiconset")
iconset.mkdir(parents=True, exist_ok=True)
contents = Path("resources/AppIcon.Contents.json")
if contents.exists():
    (iconset / "Contents.json").write_text(contents.read_text(), encoding="utf-8")
data = json.loads((iconset / "Contents.json").read_text(encoding="utf-8"))
for img in data["images"]:
    w, _h = img["size"].split("x")
    scale = int(img["scale"].replace("x", ""))
    px = int(round(float(w) * scale))
    out = iconset / img["filename"]
    subprocess.check_call(
        ["sips", "-z", str(px), str(px), str(src), "--out", str(out)],
        stdout=subprocess.DEVNULL,
    )
    print(out.name, px)

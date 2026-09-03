#!/usr/bin/env python3
"""Capture reproducible diagnostics for Tornau's public-domain 1598-1682 Muscovite sheet.

Research-only: this script does not promote raster pixels to History Core geometry.
It pins the downloaded bytes, dimensions, palette and coarse connected colour extents
so later production tracing can be reviewed against an explicit source artifact.
"""
from __future__ import annotations

import hashlib
import json
import urllib.request
from collections import Counter
from io import BytesIO
from pathlib import Path

from PIL import Image

SOURCE_PAGE = "https://commons.wikimedia.org/wiki/File:Historical_map_of_Russian,_1598-1682.gif"
SOURCE_URL = "https://commons.wikimedia.org/wiki/Special:Redirect/file/Historical_map_of_Russian,_1598-1682.gif"
OUT = Path("tornau-tsardom-1598-1682-diagnostics")


def fetch() -> bytes:
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "rulers-of-russia-history-core/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raw = fetch()
    sha256 = hashlib.sha256(raw).hexdigest()
    raster = OUT / "tornau-1598-1682.gif"
    raster.write_bytes(raw)

    image = Image.open(BytesIO(raw))
    width, height = image.size
    rgb = image.convert("RGB")
    # Exclude a narrow scan/page edge while retaining the map body and inset legends.
    crop = rgb.crop((35, 35, width - 35, height - 35))
    colors = Counter(crop.getdata()).most_common(48)

    report = {
        "schemaVersion": 1,
        "purpose": "research-only Tornau 1598-1682 production-source diagnostics; no geometry promotion",
        "source": {
            "page": SOURCE_PAGE,
            "download": SOURCE_URL,
            "title": "Historical map of Russian, 1598-1682",
            "author": "N. N. Tornau",
            "publicationYear": 1910,
            "rightsStatus": "public-domain",
            "rightsNote": "Wikimedia Commons marks the 1910 Tornau sheet as public domain / free of known copyright restrictions.",
            "sha256": sha256,
            "bytes": len(raw),
            "width": width,
            "height": height,
            "mode": image.mode,
        },
        "topExactRgb": [
            {"rank": rank, "rgb": list(color), "pixelCount": count}
            for rank, (color, count) in enumerate(colors, start=1)
        ],
        "warning": "Do not promote any colour or boundary to production geometry until legend meaning, same-sheet georeferencing, spatial controls and source-period interpretation are reviewed.",
    }
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

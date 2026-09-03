#!/usr/bin/env python3
"""Fetch and fingerprint the 1867 U.S. Coast Survey Alaska cession map.

Research-only capture. A later commit may promote a traced polygon only after
same-sheet georeferencing and spatial controls pass.
"""
from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path
from PIL import Image

URL = "https://upload.wikimedia.org/wikipedia/commons/0/03/Northwestern_America_showing_the_territory_ceded_by_Russia_to_the_United_States._LOC_98687109.jpg"
OUT = Path("alaska-1867-diagnostics")
RASTER = OUT / "alaska-cession-1867-lindenkohl.jpg"
REPORT = OUT / "capture-report.json"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(URL, headers={"User-Agent": "RulersOfRussia-HistoryCore/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        payload = response.read()
    RASTER.write_bytes(payload)
    with Image.open(RASTER) as image:
        width, height = image.size
        mode = image.mode
    report = {
        "sourceUrl": URL,
        "sourcePage": "https://commons.wikimedia.org/wiki/File:Northwestern_America_showing_the_territory_ceded_by_Russia_to_the_United_States._LOC_98687109.jpg",
        "libraryOfCongressItem": "https://www.loc.gov/item/98687109/",
        "sha256": hashlib.sha256(payload).hexdigest(),
        "bytes": len(payload),
        "width": width,
        "height": height,
        "mode": mode,
        "rightsStatus": "public-domain",
        "rightsEvidence": [
            "Library of Congress Geography and Map Division digitized collections are free to use and reuse absent a contrary Rights Advisory.",
            "Wikimedia Commons marks this faithful reproduction/publication as public domain."
        ]
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

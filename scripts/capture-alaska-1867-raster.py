#!/usr/bin/env python3
"""Fetch and fingerprint the 1867 U.S. Coast Survey Alaska cession map.

Research-only capture. A later commit may promote a traced polygon only after
same-sheet georeferencing and spatial controls pass. The source raster is
hash- and dimension-pinned so a silently replaced upstream image cannot be
used as a different geometric source in a later registration run.
"""
from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path
from PIL import Image

URL = "https://upload.wikimedia.org/wikipedia/commons/0/03/Northwestern_America_showing_the_territory_ceded_by_Russia_to_the_United_States._LOC_98687109.jpg"
EXPECTED_SHA256 = "1342d6e363cc5f8f2dbeefc9f49e35b0da1f18961ede630192ba57197b1e3973"
EXPECTED_SIZE = (11170, 7113)
OUT = Path("alaska-1867-diagnostics")
RASTER = OUT / "alaska-cession-1867-lindenkohl.jpg"
REPORT = OUT / "capture-report.json"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(URL, headers={"User-Agent": "RulersOfRussia-HistoryCore/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        payload = response.read()

    sha256 = hashlib.sha256(payload).hexdigest()
    if sha256 != EXPECTED_SHA256:
        raise RuntimeError(
            f"Alaska 1867 source raster drifted: expected sha256 {EXPECTED_SHA256}, got {sha256}"
        )

    RASTER.write_bytes(payload)
    with Image.open(RASTER) as image:
        width, height = image.size
        mode = image.mode

    if (width, height) != EXPECTED_SIZE:
        raise RuntimeError(
            "Alaska 1867 source raster dimensions drifted: "
            f"expected {EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}, got {width}x{height}"
        )

    report = {
        "sourceUrl": URL,
        "sourcePage": "https://commons.wikimedia.org/wiki/File:Northwestern_America_showing_the_territory_ceded_by_Russia_to_the_United_States._LOC_98687109.jpg",
        "libraryOfCongressItem": "https://www.loc.gov/item/98687109/",
        "sha256": sha256,
        "expectedSha256": EXPECTED_SHA256,
        "sourceIdentityVerified": True,
        "bytes": len(payload),
        "width": width,
        "height": height,
        "expectedWidth": EXPECTED_SIZE[0],
        "expectedHeight": EXPECTED_SIZE[1],
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

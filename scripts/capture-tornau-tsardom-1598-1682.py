#!/usr/bin/env python3
"""Capture reproducible diagnostics for Tornau's public-domain 1598-1682 Muscovite sheet.

Research-only: this script does not promote raster pixels to History Core geometry.
It pins the downloaded bytes, dimensions and palette, then isolates the printed
legend swatch for «Московское гос. въ 1598 г.» so later production tracing can
be tied to an explicit legend sample rather than a visually guessed pink fill.
"""
from __future__ import annotations

import hashlib
import json
import urllib.request
from collections import Counter, deque
from io import BytesIO
from pathlib import Path

from PIL import Image

SOURCE_PAGE = "https://commons.wikimedia.org/wiki/File:Historical_map_of_Russian,_1598-1682.gif"
SOURCE_URL = "https://commons.wikimedia.org/wiki/Special:Redirect/file/Historical_map_of_Russian,_1598-1682.gif"
OUT = Path("tornau-tsardom-1598-1682-diagnostics")

# Pixel bounds are on the pinned 1800x2207 original. The box is deliberately
# inside the printed sample rectangle next to «Московское гос. въ 1598 г.» and
# excludes the surrounding legend text/border. The swatch is hatched, so a
# histogram is more faithful than pretending it has one exact RGB value.
STATE_1598_SWATCH = (103, 209, 154, 229)

# Main-map body only. This excludes the title/legend and both lower insets, so
# colour overlap statistics are not inflated by page furniture or inset maps.
MAIN_MAP_BODY = (430, 82, 1395, 1390)


def fetch() -> bytes:
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "rulers-of-russia-history-core/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def ranked_palette(image: Image.Image, limit: int) -> list[dict]:
    return [
        {"rank": rank, "rgb": list(color), "pixelCount": count}
        for rank, (color, count) in enumerate(Counter(image.getdata()).most_common(limit), start=1)
    ]


def connected_components(image: Image.Image, palette: set[tuple[int, int, int]], limit: int = 40) -> list[dict]:
    """Return largest exact-palette components without interpreting them as historical geometry."""
    width, height = image.size
    pixels = image.load()
    candidate = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            if pixels[x, y] in palette:
                candidate[row + x] = 1

    visited = bytearray(width * height)
    components: list[dict] = []
    for y0 in range(height):
        for x0 in range(width):
            start = y0 * width + x0
            if not candidate[start] or visited[start]:
                continue
            visited[start] = 1
            queue = deque([(x0, y0)])
            count = 0
            min_x = max_x = x0
            min_y = max_y = y0
            while queue:
                x, y = queue.popleft()
                count += 1
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        idx = ny * width + nx
                        if candidate[idx] and not visited[idx]:
                            visited[idx] = 1
                            queue.append((nx, ny))
            components.append({
                "pixelCount": count,
                "bodyPixelBox": [min_x, min_y, max_x + 1, max_y + 1],
                "sourcePixelBox": [
                    MAIN_MAP_BODY[0] + min_x,
                    MAIN_MAP_BODY[1] + min_y,
                    MAIN_MAP_BODY[0] + max_x + 1,
                    MAIN_MAP_BODY[1] + max_y + 1,
                ],
            })
    components.sort(key=lambda item: item["pixelCount"], reverse=True)
    return components[:limit]


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

    swatch = rgb.crop(STATE_1598_SWATCH)
    swatch_counter = Counter(swatch.getdata())
    # Ignore near-black hatch/outline pixels when ranking candidate fill colours,
    # but preserve the complete swatch histogram separately in the report.
    swatch_fill = Counter({
        color: count for color, count in swatch_counter.items()
        if sum(color) >= 180
    })
    swatch_top = swatch_fill.most_common(24)
    swatch_colors = {color for color, _ in swatch_top}

    map_body = rgb.crop(MAIN_MAP_BODY)
    body_counter = Counter(map_body.getdata())
    overlap = [
        {
            "rgb": list(color),
            "legendPixelCount": int(swatch_fill[color]),
            "mainMapPixelCount": int(body_counter.get(color, 0)),
        }
        for color, _ in swatch_top
        if body_counter.get(color, 0) > 0
    ]
    overlap.sort(key=lambda item: (item["mainMapPixelCount"], item["legendPixelCount"]), reverse=True)

    # Also expose all map-body colours that are exact members of the dominant
    # legend palette, useful for connected-component tracing in a later reviewed step.
    legend_matched_map_pixels = sum(body_counter.get(color, 0) for color in swatch_colors)
    components = connected_components(map_body, swatch_colors)

    report = {
        "schemaVersion": 3,
        "purpose": "research-only Tornau 1598-1682 production-source and signed-legend diagnostics; no geometry promotion",
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
        "state1598Legend": {
            "label": "Московское гос. въ 1598 г.",
            "swatchPixelBox": list(STATE_1598_SWATCH),
            "swatchPixelCount": swatch.width * swatch.height,
            "dominantNonDarkRgb": ranked_palette(swatch, 32),
            "mainMapBodyPixelBox": list(MAIN_MAP_BODY),
            "dominantLegendColorsPresentInMainMap": overlap,
            "legendMatchedMainMapPixelCount": int(legend_matched_map_pixels),
            "largestExactPaletteConnectedComponents": components,
            "connectedComponentInterpretation": "These are diagnostic exact-colour islands only. Bounding boxes expose whether the legend palette forms coherent map regions or is dispersed through scan/terrain/background colours; they are not polygons and must not be promoted directly.",
            "interpretation": "The printed 1598 state swatch is hatched/multi-colour. Candidate production pixels must be selected from this exact swatch palette and then reviewed as spatial components; no single RGB is declared to equal the historical state.",
        },
        "warning": "Do not promote any colour or boundary to production geometry until legend meaning, same-sheet georeferencing, connected-component review, spatial controls and source-period interpretation are reviewed.",
    }
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

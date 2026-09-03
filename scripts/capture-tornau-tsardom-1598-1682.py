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

# Specificity diagnostics intentionally stay conservative. A colour must be
# represented by several pixels in the printed legend sample and be at least
# twice as concentrated there as it is across the map body. This does not make
# it territory geometry; it only removes ubiquitous paper/base-fill colours
# from the next connected-component review.
SPECIFICITY_MIN_SWATCH_PIXELS = 5
SPECIFICITY_MIN_ENRICHMENT = 2.0


def fetch() -> bytes:
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "rulers-of-russia-history-core/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def pixel_counter(image: Image.Image) -> Counter:
    """Count pixels without relying on Pillow's deprecated Image.getdata path."""
    if hasattr(image, "get_flattened_data"):
        return Counter(image.get_flattened_data())
    return Counter(image.getdata())


def ranked_palette(image: Image.Image, limit: int) -> list[dict]:
    return [
        {"rank": rank, "rgb": list(color), "pixelCount": count}
        for rank, (color, count) in enumerate(pixel_counter(image).most_common(limit), start=1)
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


def palette_specificity(
    swatch_fill: Counter,
    body_counter: Counter,
    swatch_pixel_count: int,
    body_pixel_count: int,
) -> list[dict]:
    """Rank legend colours by normalized concentration relative to the map body."""
    ranked = []
    for color, legend_count in swatch_fill.items():
        if legend_count < SPECIFICITY_MIN_SWATCH_PIXELS:
            continue
        body_count = int(body_counter.get(color, 0))
        if body_count <= 0:
            continue
        legend_share = legend_count / swatch_pixel_count
        body_share = body_count / body_pixel_count
        enrichment = legend_share / body_share if body_share else None
        ranked.append({
            "rgb": list(color),
            "legendPixelCount": int(legend_count),
            "mainMapPixelCount": body_count,
            "legendShare": round(legend_share, 8),
            "mainMapShare": round(body_share, 8),
            "legendToMapEnrichment": round(enrichment, 4),
            "passesSpecificityGate": enrichment >= SPECIFICITY_MIN_ENRICHMENT,
        })
    ranked.sort(
        key=lambda item: (
            item["legendToMapEnrichment"],
            item["legendPixelCount"],
            -item["mainMapPixelCount"],
        ),
        reverse=True,
    )
    return ranked


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
    colors = pixel_counter(crop).most_common(48)

    swatch = rgb.crop(STATE_1598_SWATCH)
    swatch_counter = pixel_counter(swatch)
    # Ignore near-black hatch/outline pixels when ranking candidate fill colours,
    # but preserve the complete swatch histogram separately in the report.
    swatch_fill = Counter({
        color: count for color, count in swatch_counter.items()
        if sum(color) >= 180
    })
    swatch_top = swatch_fill.most_common(24)
    swatch_colors = {color for color, _ in swatch_top}

    map_body = rgb.crop(MAIN_MAP_BODY)
    body_counter = pixel_counter(map_body)
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

    # Exact palette overlap is intentionally retained as a broad diagnostic so
    # we can measure how much the specificity gate removes rather than hiding
    # the original ambiguity.
    legend_matched_map_pixels = sum(body_counter.get(color, 0) for color in swatch_colors)
    components = connected_components(map_body, swatch_colors)

    specificity = palette_specificity(
        swatch_fill,
        body_counter,
        swatch.width * swatch.height,
        map_body.width * map_body.height,
    )
    specific_colors = {
        tuple(item["rgb"])
        for item in specificity
        if item["passesSpecificityGate"]
    }
    specificity_matched_map_pixels = sum(body_counter.get(color, 0) for color in specific_colors)
    specificity_components = connected_components(map_body, specific_colors)

    report = {
        "schemaVersion": 4,
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
            "paletteSpecificity": {
                "method": "normalized legend-share divided by normalized main-map-share for each exact RGB",
                "minimumLegendPixels": SPECIFICITY_MIN_SWATCH_PIXELS,
                "minimumEnrichment": SPECIFICITY_MIN_ENRICHMENT,
                "rankedColors": specificity,
                "passingColorCount": len(specific_colors),
                "matchedMainMapPixelCount": int(specificity_matched_map_pixels),
                "largestPassingPaletteConnectedComponents": specificity_components,
                "interpretation": "The gate removes colours that are common across the whole sheet even when they occur in the 1598 swatch. Passing colours remain research candidates only; spatial controls and same-sheet georeferencing are still mandatory before any trace can be promoted.",
            },
            "interpretation": "The printed 1598 state swatch is hatched/multi-colour. Candidate production pixels must be selected from this exact swatch palette, ranked for legend specificity, and then reviewed as spatial components; no single RGB is declared to equal the historical state.",
        },
        "warning": "Do not promote any colour or boundary to production geometry until legend meaning, same-sheet georeferencing, specificity/component review, spatial controls and source-period interpretation are reviewed.",
    }
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

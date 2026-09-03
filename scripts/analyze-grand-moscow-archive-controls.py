#!/usr/bin/env python3
"""Research-only spatial controls for captured Grand Moscow archive geometries.

This script never promotes archive data. It reports whether historically meaningful
settlement controls fall inside candidate OHM captures so a separate corroboration
step can reject anachronistic period envelopes before any History Core recipe is made.
"""

from __future__ import annotations

import json
from pathlib import Path

ARCHIVE = Path("public/data/territory/archive/grand-moscow.geojson")

CONTROLS = {
    "moscow": [37.6173, 55.7558],
    "novgorod": [31.2755, 58.5229],
    "tver": [35.9119, 56.8587],
    "vyatka": [50.0614, 58.6036],
    "pskov": [28.3318, 57.8193],
    "smolensk": [32.0453, 54.7826],
    "ryazan": [39.74, 54.6296],
    "nizhny-novgorod": [44.0059, 56.3269],
    "kazan": [49.1221, 55.7887],
    "vilnius": [25.2797, 54.6872],
    "kyiv": [30.5234, 50.4501],
}

CANDIDATES = [
    ("1485", "1521"),
    ("1521", "1537"),
]


def ring_contains(point, ring):
    x, y = point
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and x < ((xj - xi) * (y - yi)) / ((yj - yi) or 1e-15) + xi:
            inside = not inside
        j = i
    return inside


def polygon_contains(point, polygon):
    return bool(polygon and ring_contains(point, polygon[0]) and not any(ring_contains(point, hole) for hole in polygon[1:]))


def geometry_contains(point, geometry):
    if geometry.get("type") == "Polygon":
        return polygon_contains(point, geometry["coordinates"])
    if geometry.get("type") == "MultiPolygon":
        return any(polygon_contains(point, polygon) for polygon in geometry["coordinates"])
    raise ValueError(f"Unsupported geometry type {geometry.get('type')}")


def main():
    archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
    report = {"archive": str(ARCHIVE), "candidates": []}
    for start_date, end_date in CANDIDATES:
        matches = [
            feature for feature in archive.get("features", [])
            if str(feature.get("properties", {}).get("start_date")) == start_date
            and str(feature.get("properties", {}).get("end_date")) == end_date
        ]
        item = {"start_date": start_date, "end_date": end_date, "match_count": len(matches)}
        if len(matches) == 1:
            feature = matches[0]
            item["name"] = feature.get("properties", {}).get("name")
            item["source_ids"] = feature.get("properties", {}).get("source_ids", [])
            item["geometry_type"] = feature.get("geometry", {}).get("type")
            item["controls"] = {
                key: geometry_contains(lon_lat, feature["geometry"])
                for key, lon_lat in CONTROLS.items()
            }
        report["candidates"].append(item)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Validate an independent same-sheet georeference for Tornau's 1598–1682 map.

This is a strict research gate. It does not promote any historical boundary.
The fit uses city symbols manually reviewed on the target sheet itself, then
checks geographically distributed city symbols that were not used by the fit.
This replaces the failed attempt to transfer control points from Tornau's 862
sheet and therefore does not depend on cross-sheet SIFT registration.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

OUT = Path("tornau-tsardom-1598-1682-diagnostics")
REPORT = OUT / "independent-gcp-report.json"

# Pixel locations are centers of printed city symbols on the pinned
# 1800x2207 Tornau original, reviewed directly on the 1598–1682 sheet.
# Geographic coordinates are modern city-center coordinates; the resulting
# few-kilometre semantic uncertainty is deliberately small relative to the
# conservative 100 km historical-raster gate used here.
FIT_GCPS = [
    ("Moscow", 834.0, 789.0, 37.6173, 55.7558),
    ("Yaroslavl", 899.0, 696.0, 39.8845, 57.6261),
    ("Vladimir", 916.0, 774.0, 40.4070, 56.1291),
    ("Arkhangelsk", 950.0, 348.0, 40.5169, 64.5399),
    ("Kazan", 1198.0, 800.0, 49.1064, 55.7961),
    ("Samara", 1230.0, 915.0, 50.1500, 53.1959),
    ("Kyiv", 584.0, 1044.0, 30.5234, 50.4501),
    ("Saratov", 1110.0, 1028.0, 46.0343, 51.5336),
]

# These symbols are never included in the fit. They are the independent gate.
HOLDOUT_GCPS = [
    ("Ryazan", 897.0, 859.0, 39.7343, 54.6296),
    ("Vologda", 904.0, 613.0, 39.8915, 59.2205),
    ("Nizhny Novgorod", 1053.0, 772.0, 44.0059, 56.3269),
    ("Voronezh", 903.0, 1043.0, 39.2003, 51.6608),
    ("Smolensk", 661.0, 828.0, 32.0453, 54.7826),
]

MAX_HOLDOUT_ERROR_KM = 100.0
MAX_HOLDOUT_MEDIAN_KM = 50.0
MAX_FIT_ERROR_KM = 25.0


def features(x: float, y: float) -> list[float]:
    # A second-order polynomial is sufficient for the mildly curved printed
    # graticule while avoiding a high-order warp that could overfit 8 anchors.
    return [1.0, x, y, x * x, x * y, y * y]


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0088
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return 2.0 * r * math.asin(math.sqrt(a))


def fit_model(points: list[tuple[str, float, float, float, float]]) -> tuple[np.ndarray, np.ndarray]:
    matrix = np.array([features(x, y) for _, x, y, _, _ in points], dtype=float)
    lon = np.array([p[3] for p in points], dtype=float)
    lat = np.array([p[4] for p in points], dtype=float)
    lon_coeff, *_ = np.linalg.lstsq(matrix, lon, rcond=None)
    lat_coeff, *_ = np.linalg.lstsq(matrix, lat, rcond=None)
    return lon_coeff, lat_coeff


def evaluate(points, lon_coeff, lat_coeff):
    rows = []
    for name, x, y, lon, lat in points:
        f = np.array(features(x, y), dtype=float)
        predicted_lon = float(f @ lon_coeff)
        predicted_lat = float(f @ lat_coeff)
        error_km = haversine_km(predicted_lon, predicted_lat, lon, lat)
        rows.append(
            {
                "id": name,
                "pixel": [x, y],
                "lonLat": [lon, lat],
                "predictedLonLat": [round(predicted_lon, 6), round(predicted_lat, 6)],
                "errorKm": round(error_km, 3),
            }
        )
    return rows


def stats(rows):
    values = np.array([row["errorKm"] for row in rows], dtype=float)
    return {
        "count": int(values.size),
        "medianKm": round(float(np.median(values)), 3),
        "p95Km": round(float(np.percentile(values, 95)), 3),
        "maxKm": round(float(np.max(values)), 3),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    lon_coeff, lat_coeff = fit_model(FIT_GCPS)
    fit_rows = evaluate(FIT_GCPS, lon_coeff, lat_coeff)
    holdout_rows = evaluate(HOLDOUT_GCPS, lon_coeff, lat_coeff)
    fit_stats = stats(fit_rows)
    holdout_stats = stats(holdout_rows)

    passes = (
        fit_stats["maxKm"] <= MAX_FIT_ERROR_KM
        and holdout_stats["maxKm"] <= MAX_HOLDOUT_ERROR_KM
        and holdout_stats["medianKm"] <= MAX_HOLDOUT_MEDIAN_KM
    )

    report = {
        "schemaVersion": 1,
        "purpose": "independent same-sheet georeference gate for Tornau 1598-1682; no boundary promotion",
        "sourceRaster": {
            "width": 1800,
            "height": 2207,
            "expectedSha1": "5b78566787732141ad81726380a83f06b9aff491",
            "rightsStatus": "public-domain",
        },
        "model": {
            "type": "second-order polynomial pixel-to-WGS84",
            "terms": ["1", "x", "y", "x^2", "xy", "y^2"],
            "longitudeCoefficients": [round(float(x), 12) for x in lon_coeff],
            "latitudeCoefficients": [round(float(x), 12) for x in lat_coeff],
        },
        "fitControls": fit_rows,
        "fitStats": fit_stats,
        "independentHoldouts": holdout_rows,
        "holdoutStats": holdout_stats,
        "gate": {
            "passes": passes,
            "maxFitErrorKm": MAX_FIT_ERROR_KM,
            "maxHoldoutErrorKm": MAX_HOLDOUT_ERROR_KM,
            "maxHoldoutMedianKm": MAX_HOLDOUT_MEDIAN_KM,
            "interpretation": "Passing this gate validates the raster georeference only. Legend/state extraction, historical-period interpretation, polygon topology, and History Core spatial controls remain mandatory before production geometry promotion.",
        },
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not passes:
        raise SystemExit("Independent Tornau same-sheet georeference gate failed")


if __name__ == "__main__":
    main()

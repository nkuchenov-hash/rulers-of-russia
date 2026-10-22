#!/usr/bin/env python3
"""Audit independent same-sheet GCPs before medieval Tornau geometry promotion.

The 1054-1240 and 1240-1533 sheets must not inherit production GCPs merely from
cross-sheet image registration. This gate requires manually identified target-
sheet anchors with geographic coordinates and measures affine residuals. Until
a reviewed control file exists and passes the thresholds, promotion remains
explicitly blocked.
"""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CONTROL = ROOT / "public/data/history-core/research/tornau-medieval-independent-gcps.json"
REPORT = ROOT / "tornau-medieval-independent-gcp-audit.json"
TARGETS = ("1054-1240", "1240-1533")
MIN_GCPS = 6
MAX_MEDIAN_RESIDUAL_PX = 8.0
MAX_P95_RESIDUAL_PX = 18.0


def fit_residuals(gcps: list[dict]) -> dict:
    # Geographic lon/lat -> raster pixel affine fit. This is a diagnostic gate,
    # not the final production transform; final recipes may use triangulation.
    geo = np.array([[float(g["lonLat"][0]), float(g["lonLat"][1]), 1.0] for g in gcps])
    px = np.array([[float(g["pixel"][0]), float(g["pixel"][1])] for g in gcps])
    coeff, *_ = np.linalg.lstsq(geo, px, rcond=None)
    pred = geo @ coeff
    residual = np.linalg.norm(pred - px, axis=1)
    return {
        "medianResidualPx": round(float(np.median(residual)), 3),
        "p95ResidualPx": round(float(np.percentile(residual, 95)), 3),
        "maxResidualPx": round(float(np.max(residual)), 3),
    }


def main() -> None:
    if not CONTROL.exists():
        report = {
            "schemaVersion": 1,
            "promotionAllowed": False,
            "reason": "independent target-sheet GCP control file is missing",
            "requiredControlFile": str(CONTROL.relative_to(ROOT)),
            "requirements": {
                "minimumReviewedGcpsPerSheet": MIN_GCPS,
                "maximumMedianAffineResidualPx": MAX_MEDIAN_RESIDUAL_PX,
                "maximumP95AffineResidualPx": MAX_P95_RESIDUAL_PX,
                "anchorBasis": "recognizable geography identified directly on each target sheet; not transferred from another Tornau sheet",
            },
        }
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    data = json.loads(CONTROL.read_text())
    results = []
    all_pass = True
    for target in TARGETS:
        gcps = [g for g in data.get("gcps", []) if g.get("sheet") == target and g.get("reviewStatus") == "reviewed"]
        independent = [g for g in gcps if g.get("basis") == "direct-target-sheet-identification"]
        enough = len(independent) >= MIN_GCPS
        stats = fit_residuals(independent) if enough else None
        passed = bool(enough and stats["medianResidualPx"] <= MAX_MEDIAN_RESIDUAL_PX and stats["p95ResidualPx"] <= MAX_P95_RESIDUAL_PX)
        all_pass &= passed
        results.append({"sheet": target, "reviewedIndependentGcpCount": len(independent), "residuals": stats, "passed": passed})

    report = {"schemaVersion": 1, "promotionAllowed": all_pass, "targets": results}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

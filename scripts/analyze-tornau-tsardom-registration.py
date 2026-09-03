#!/usr/bin/env python3
"""Research-only raster registration for Tornau's 1598–1682 Tsardom sheet.

The goal is to measure whether the same-atlas 1598 sheet can inherit candidate
geographic control points from the already pinned 862 Tornau reference by
feature-based raster registration. The output is diagnostic only: no raster
pixel, transferred GCP or derived boundary is production geometry by itself.
"""
from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path

import cv2
import numpy as np

REFERENCE = {
    "id": "862",
    "url": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Historical_map_of_Rus%27%2C_862.gif",
    "sha256": "d0cd3dedfec309a9a2ce670f2e8de1b17b5ce03ae0abca8e4ef9fde68620496c",
    "width": 1800,
    "height": 2207,
}
TARGET = {
    "id": "1598-1682",
    "url": "https://commons.wikimedia.org/wiki/Special:Redirect/file/Historical_map_of_Russian,_1598-1682.gif",
    "sha1": "5b78566787732141ad81726380a83f06b9aff491",
    "width": 1800,
    "height": 2207,
}
OUT = Path("tornau-tsardom-1598-1682-diagnostics")
REFERENCE_GCPS = [
    ("lake-ladoga-center", 340, 1470, 31.5, 60.83),
    ("lake-onega-center", 480, 1450, 35.5, 61.7),
    ("pskov-label-anchor", 373, 1565, 28.3318, 57.8193),
    ("novgorod-label-anchor", 452, 1565, 31.2755, 58.5229),
    ("belozersk-label-anchor", 545, 1528, 37.8078, 60.0308),
    ("rostov-label-anchor", 570, 1614, 39.4139, 57.1859),
    ("murom-label-anchor", 575, 1672, 42.0426, 55.575),
    ("smolensk-label-anchor", 425, 1690, 32.0453, 54.7826),
    ("vitebsk-label-anchor", 400, 1654, 30.2049, 55.1904),
    ("polotsk-label-anchor", 355, 1635, 28.784, 55.487),
    ("turov-label-anchor", 330, 1743, 27.735, 52.068),
    ("pinsk-label-anchor", 285, 1740, 26.095, 52.115),
    ("kyiv-label-anchor", 418, 1808, 30.5234, 50.4501),
    ("chernihiv-label-anchor", 440, 1782, 31.2849, 51.4982),
    ("oka-volga-confluence", 605, 1640, 44.0, 56.33),
    ("volodymyr-label-anchor", 235, 1765, 24.32, 50.85),
]

def request_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={
        "User-Agent": "RulersOfRussiaHistoryCore/1.0 (historical-map research; github.com/nkuchenov-hash/rulers-of-russia)",
        "Accept": "image/*,*/*;q=0.5",
    })
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()

def decode_gray(data: bytes, spec: dict) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise RuntimeError(f"Could not decode {spec['id']}")
    height, width = image.shape[:2]
    if (width, height) != (spec["width"], spec["height"]):
        raise RuntimeError(f"Unexpected dimensions for {spec['id']}: {width}x{height}")
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(image)

def error_stats(values: np.ndarray) -> dict:
    if not len(values):
        return {"median": None, "p95": None, "max": None}
    return {"median": round(float(np.median(values)), 3), "p95": round(float(np.percentile(values, 95)), 3), "max": round(float(np.max(values)), 3)}

def align(reference: np.ndarray, target: np.ndarray) -> dict:
    sift = cv2.SIFT_create(nfeatures=16000, contrastThreshold=0.018, edgeThreshold=12)
    kp_ref, des_ref = sift.detectAndCompute(reference, None)
    kp_target, des_target = sift.detectAndCompute(target, None)
    if des_ref is None or des_target is None:
        return {"candidateReusable": False, "reason": "no descriptors"}
    pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(des_ref, des_target, k=2)
    good = [m for m, n in pairs if m.distance < 0.72 * n.distance]
    if len(good) < 12:
        return {"candidateReusable": False, "keypoints": {"reference": len(kp_ref), "target": len(kp_target)}, "goodMatches": len(good), "reason": "too few ratio-test matches"}
    ref_pts = np.float32([kp_ref[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    target_pts = np.float32([kp_target[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, mask = cv2.findHomography(ref_pts, target_pts, cv2.RANSAC, 4.0, maxIters=12000, confidence=0.999)
    if H is None or mask is None:
        return {"candidateReusable": False, "goodMatches": len(good), "reason": "homography failed"}
    inliers = mask.ravel().astype(bool)
    inlier_ref = ref_pts[inliers]
    inlier_target = target_pts[inliers]
    predicted = cv2.perspectiveTransform(inlier_ref.reshape(-1, 1, 2), H).reshape(-1, 2)
    actual = inlier_target.reshape(-1, 2)
    forward_error = np.linalg.norm(predicted - actual, axis=1)
    H_inv = np.linalg.inv(H)
    roundtrip = cv2.perspectiveTransform(cv2.perspectiveTransform(inlier_ref.reshape(-1, 1, 2), H), H_inv).reshape(-1, 2)
    roundtrip_error = np.linalg.norm(roundtrip - inlier_ref.reshape(-1, 2), axis=1)
    inlier_count = int(inliers.sum())
    ratio = inlier_count / len(good)
    determinant = float(np.linalg.det(H[:2, :2]))
    fstats, rstats = error_stats(forward_error), error_stats(roundtrip_error)
    reusable = (len(good) >= 80 and inlier_count >= 50 and ratio >= 0.30 and fstats["median"] is not None and fstats["median"] <= 3.0 and fstats["p95"] is not None and fstats["p95"] <= 8.0 and rstats["median"] is not None and rstats["median"] <= 0.1 and 0.65 <= abs(determinant) <= 1.45)
    transferred = []
    for gcp_id, x, y, lon, lat in REFERENCE_GCPS:
        px = cv2.perspectiveTransform(np.float32([[[x, y]]]), H)[0, 0]
        transferred.append({"id": gcp_id, "sourceReferencePixel": [x, y], "targetCandidatePixel": [round(float(px[0]), 2), round(float(px[1]), 2)], "lonLat": [lon, lat], "basis": "candidate transferred from pinned 862 Tornau GCP by SIFT/RANSAC raster homography"})
    return {
        "candidateReusable": reusable,
        "keypoints": {"reference": len(kp_ref), "target": len(kp_target)},
        "goodMatches": len(good), "inliers": inlier_count, "inlierRatio": round(ratio, 4),
        "forwardReprojectionErrorPx": fstats, "roundtripErrorPx": rstats,
        "linearDeterminant": round(determinant, 6),
        "homographyReferenceToTarget": [[round(float(v), 10) for v in row] for row in H],
        "transferredGcps": transferred,
        "warning": "Transferred GCPs are research candidates only. Independently validate recognizable anchors on the 1598 sheet before any georeferenced trace can be promoted.",
    }

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    reference_bytes, target_bytes = request_bytes(REFERENCE["url"]), request_bytes(TARGET["url"])
    reference_sha256 = hashlib.sha256(reference_bytes).hexdigest()
    if reference_sha256 != REFERENCE["sha256"]:
        raise RuntimeError(f"862 reference SHA-256 mismatch: {reference_sha256}")
    target_sha1 = hashlib.sha1(target_bytes).hexdigest()
    if target_sha1 != TARGET["sha1"]:
        raise RuntimeError(f"1598 target SHA-1 mismatch: {target_sha1}")
    registration = align(decode_gray(reference_bytes, REFERENCE), decode_gray(target_bytes, TARGET))
    report = {
        "schemaVersion": 1,
        "purpose": "research-only same-atlas registration candidate for Tornau 1598-1682; no geometry promotion",
        "reference": {**REFERENCE, "observedBytes": len(reference_bytes), "observedSha256": reference_sha256},
        "target": {**TARGET, "observedBytes": len(target_bytes), "observedSha1": target_sha1, "rightsStatus": "public-domain", "rightsBasis": "Wikimedia Commons file page / Public Domain Mark; published 1910"},
        "registration": registration,
        "promotionGate": {"automaticPromotionAllowed": False, "requirements": ["registration candidateReusable must be true", "transferred anchors must be independently checked against recognizable target-sheet geography", "1598 legend-specific spatial components must be reviewed against those controls", "derived boundary must pass History Core spatial and strict completion audits"]},
    }
    (OUT / "registration-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()

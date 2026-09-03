#!/usr/bin/env python3
"""Research-only registration and palette diagnostics for the public-domain Tornau 1910 sheets.

Exact original raster hashes are already pinned in History Core. This diagnostic
tries the originals first; if Wikimedia rate-limits GitHub-hosted runners, it
uses a same-dimension visual proxy only for raster-to-raster registration and
palette reconnaissance. Proxy bytes are never accepted as source evidence and
this script never promotes geometry by itself.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
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

TARGETS = [
    {
        "id": "1054-1240",
        "url": "https://upload.wikimedia.org/wikipedia/commons/3/32/Historical_map_of_the_Rus%2C_1054-1240.gif",
        "sha256": "8aec8ad5be66444a638342f4cdc083122596dfe7ff98536f8bbda9dd7435bc85",
        "width": 1800,
        "height": 2207,
    },
    {
        "id": "1240-1533",
        "url": "https://upload.wikimedia.org/wikipedia/commons/1/18/Historical_map_of_Rus%27%2C_1240-1533.gif",
        "sha256": "be3f8afa9867b1734150c6b9eac5389c8e1f983a11c90626d738256c763793db",
        "width": 1800,
        "height": 2207,
    },
]

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

MOSCOW_SHEET_SAMPLES = [
    ("inside-1462-north", 830, 680),
    ("inside-1462-center", 850, 760),
    ("inside-1462-east", 980, 770),
    ("novgorod", 620, 685),
    ("pskov", 545, 720),
    ("smolensk", 650, 850),
    ("moscow", 830, 840),
    ("tver", 725, 740),
    ("nizhny-novgorod", 1090, 790),
    ("ryazan", 1000, 890),
    ("vyatka-approx", 1160, 650),
]


def request_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "RulersOfRussiaHistoryCore/1.0 (historical-map research; github.com/nkuchenov-hash/rulers-of-russia)",
            "Accept": "image/*,*/*;q=0.5",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def proxy_url(spec: dict) -> str:
    source = spec["url"].removeprefix("https://")
    encoded = urllib.parse.quote(source, safe="/%")
    return (
        "https://images.weserv.nl/?url=" + encoded
        + f"&w={spec['width']}&h={spec['height']}&fit=fill&output=png"
    )


def download_registration_image(spec: dict, root: Path) -> tuple[Path, str]:
    target = root / f"tornau-{spec['id']}.img"
    mode = "exact-original"
    try:
        data = request_bytes(spec["url"])
        digest = hashlib.sha256(data).hexdigest()
        if digest != spec["sha256"]:
            raise RuntimeError(f"SHA mismatch for {spec['id']}: {digest}")
        print(f"Verified exact raster {spec['id']}: sha256={digest}, bytes={len(data)}", flush=True)
    except urllib.error.HTTPError as error:
        if error.code != 429:
            raise
        mode = "visual-proxy-fallback"
        purl = proxy_url(spec)
        print(f"Wikimedia 429 for {spec['id']}; using same-dimension proxy for registration only", flush=True)
        data = request_bytes(purl)
    target.write_bytes(data)
    return target, mode


def decode_image(path: Path, mode: int) -> np.ndarray:
    raw = np.frombuffer(path.read_bytes(), dtype=np.uint8)
    image = cv2.imdecode(raw, mode)
    if image is None:
        raise RuntimeError(f"Could not decode {path}")
    return image


def read_gray(path: Path, spec: dict) -> np.ndarray:
    image = decode_image(path, cv2.IMREAD_GRAYSCALE)
    height, width = image.shape[:2]
    if (width, height) != (spec["width"], spec["height"]):
        raise RuntimeError(f"Unexpected dimensions for {spec['id']}: {width}x{height}")
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(image)


def palette_diagnostics(path: Path, spec: dict) -> dict:
    """Return machine-readable colour/component clues for manual tracing.

    The 1910 GIF is palette-based. Exact-colour counts and connected components
    are therefore useful for locating the legend fills, but remain diagnostics:
    production pixel rings still require explicit visual/historical review.
    """
    bgr = decode_image(path, cv2.IMREAD_COLOR)
    height, width = bgr.shape[:2]
    if (width, height) != (spec["width"], spec["height"]):
        raise RuntimeError(f"Unexpected colour dimensions for {spec['id']}: {width}x{height}")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    # Central map body, excluding most title/legend margins and page furniture.
    x0, y0, x1, y1 = 420, 430, 1380, 1280
    crop = rgb[y0:y1, x0:x1]
    counter = Counter(map(tuple, crop.reshape(-1, 3).tolist()))
    top = counter.most_common(32)

    palette = []
    for rank, (color, count) in enumerate(top, start=1):
        mask = np.all(rgb == np.array(color, dtype=np.uint8), axis=2).astype(np.uint8)
        labels, _, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        components = []
        for label in range(1, labels):
            x, y, w, h, area = [int(v) for v in stats[label]]
            if area < 100:
                continue
            cx, cy = [round(float(v), 1) for v in centroids[label]]
            components.append({"area": area, "bbox": [x, y, w, h], "centroid": [cx, cy]})
        components.sort(key=lambda item: item["area"], reverse=True)
        palette.append({
            "rank": rank,
            "rgb": list(color),
            "cropPixelCount": int(count),
            "componentsAreaGte100": components[:12],
        })

    samples = []
    if spec["id"] == "1240-1533":
        for sample_id, x, y in MOSCOW_SHEET_SAMPLES:
            color = rgb[y, x].tolist()
            # Neighborhood mode is more robust than the exact label/line pixel.
            r = 9
            patch = rgb[max(0, y-r):min(height, y+r+1), max(0, x-r):min(width, x+r+1)]
            mode_color, mode_count = Counter(map(tuple, patch.reshape(-1, 3).tolist())).most_common(1)[0]
            samples.append({
                "id": sample_id,
                "pixel": [x, y],
                "rgb": color,
                "neighborhoodModeRgb": list(mode_color),
                "neighborhoodModeCount": int(mode_count),
                "neighborhoodPixels": int(patch.shape[0] * patch.shape[1]),
            })

    return {
        "sheet": spec["id"],
        "crop": [x0, y0, x1, y1],
        "topExactRgb": palette,
        "samples": samples,
        "warning": "Palette/component output is research-only. Do not promote a colour component without visual legend identification and historical review.",
    }


def error_stats(values: np.ndarray) -> dict:
    if not len(values):
        return {"median": None, "p95": None, "max": None}
    return {
        "median": round(float(np.median(values)), 3),
        "p95": round(float(np.percentile(values, 95)), 3),
        "max": round(float(np.max(values)), 3),
    }


def align(reference: np.ndarray, target: np.ndarray, target_id: str) -> dict:
    sift = cv2.SIFT_create(nfeatures=12000, contrastThreshold=0.02, edgeThreshold=12)
    kp_ref, des_ref = sift.detectAndCompute(reference, None)
    kp_target, des_target = sift.detectAndCompute(target, None)
    if des_ref is None or des_target is None:
        return {"target": target_id, "candidateReusable": False, "reason": "no descriptors"}

    matcher = cv2.BFMatcher(cv2.NORM_L2)
    pairs = matcher.knnMatch(des_ref, des_target, k=2)
    good = [m for m, n in pairs if m.distance < 0.72 * n.distance]
    if len(good) < 12:
        return {
            "target": target_id,
            "candidateReusable": False,
            "keypoints": {"reference": len(kp_ref), "target": len(kp_target)},
            "goodMatches": len(good),
            "reason": "too few ratio-test matches",
        }

    ref_pts = np.float32([kp_ref[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    target_pts = np.float32([kp_target[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, mask = cv2.findHomography(ref_pts, target_pts, cv2.RANSAC, 4.0, maxIters=10000, confidence=0.999)
    if H is None or mask is None:
        return {"target": target_id, "candidateReusable": False, "goodMatches": len(good), "reason": "homography failed"}

    inliers = mask.ravel().astype(bool)
    inlier_ref = ref_pts[inliers]
    inlier_target = target_pts[inliers]
    predicted = cv2.perspectiveTransform(inlier_ref.reshape(-1, 1, 2), H).reshape(-1, 2)
    actual = inlier_target.reshape(-1, 2)
    forward_error = np.linalg.norm(predicted - actual, axis=1)
    H_inv = np.linalg.inv(H)
    roundtrip = cv2.perspectiveTransform(cv2.perspectiveTransform(inlier_ref.reshape(-1, 1, 2), H), H_inv).reshape(-1, 2)
    roundtrip_error = np.linalg.norm(roundtrip - inlier_ref.reshape(-1, 2), axis=1)

    transferred = []
    for gcp_id, x, y, lon, lat in REFERENCE_GCPS:
        px = cv2.perspectiveTransform(np.float32([[[x, y]]]), H)[0, 0]
        transferred.append({
            "id": gcp_id,
            "pixel": [round(float(px[0]), 2), round(float(px[1]), 2)],
            "lonLat": [lon, lat],
            "basis": "candidate transferred from verified 862 GCP via raster-to-raster RANSAC homography",
        })

    determinant = float(np.linalg.det(H[:2, :2]))
    inlier_count = int(inliers.sum())
    ratio = inlier_count / len(good)
    fstats = error_stats(forward_error)
    rstats = error_stats(roundtrip_error)
    reusable = (
        len(good) >= 80 and inlier_count >= 50 and ratio >= 0.30
        and fstats["median"] is not None and fstats["median"] <= 3.0
        and fstats["p95"] is not None and fstats["p95"] <= 8.0
        and rstats["median"] is not None and rstats["median"] <= 0.1
        and 0.65 <= abs(determinant) <= 1.45
    )
    return {
        "target": target_id,
        "candidateReusable": reusable,
        "keypoints": {"reference": len(kp_ref), "target": len(kp_target)},
        "goodMatches": len(good),
        "inliers": inlier_count,
        "inlierRatio": round(ratio, 4),
        "forwardReprojectionErrorPx": fstats,
        "roundtripErrorPx": rstats,
        "linearDeterminant": round(determinant, 6),
        "homographyReferenceToTarget": [[round(float(v), 10) for v in row] for row in H],
        "transferredGcps": transferred,
        "warning": "Transferred GCPs are candidates only; independently validate anchors before production use.",
    }


def main() -> None:
    palette_reports = []
    with tempfile.TemporaryDirectory(prefix="tornau-registration-") as tmp:
        root = Path(tmp)
        ref_path, ref_mode = download_registration_image(REFERENCE, root)
        ref = read_gray(ref_path, REFERENCE)
        results = []
        modes = {REFERENCE["id"]: ref_mode}
        for spec in TARGETS:
            target_path, mode = download_registration_image(spec, root)
            modes[spec["id"]] = mode
            target = read_gray(target_path, spec)
            results.append(align(ref, target, spec["id"]))
            palette_reports.append(palette_diagnostics(target_path, spec))

    report = {
        "schemaVersion": 3,
        "purpose": "research-only batch registration/palette diagnostics; does not promote History Core geometry",
        "sourceIntegrity": "Original SHA-256 values are pinned in History Core; any visual proxy fallback is registration-only and cannot satisfy source provenance.",
        "imageModes": modes,
        "reference": {"id": REFERENCE["id"], "sha256": REFERENCE["sha256"]},
        "targets": results,
        "paletteDiagnostics": palette_reports,
        "allCandidateReusable": all(item.get("candidateReusable") is True for item in results),
    }
    Path("tornau-medieval-registration-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("TORNAU_MEDIEVAL_REGISTRATION_REPORT")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

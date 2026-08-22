# One-shot bootstrap trigger. Delete this script immediately after archive materialization.
import json
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.validation import make_valid

SOURCE_URL = "https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/cliopatria.geojson.zip"
SOURCE_ID = "capture:cliopatria-v0.2.0"
ARCHIVE = Path("public/data/territory/archive")
MANIFEST_PATH = ARCHIVE / "manifest.json"
SOURCES_PATH = ARCHIVE / "sources.json"

TARGETS = {
    "kievan-rus": {
        "wikidata": {"Q1108445"},
        "names": {"Kievan Rus'", "Kievan Rus", "Kyivan Rus'", "Kyivan Rus"},
    },
    "novgorodian-land": {
        "wikidata": {"Q9324216"},
        "names": {"Novgorodian Land", "Novgorodian Rus"},
    },
    "grand-vladimir": {
        "wikidata": {"Q83546"},
        "names": {"Vladimir-Suzdal", "Grand Duchy of Vladimir", "Grand Principality of Vladimir"},
    },
    "russian-empire": {
        "wikidata": {"Q34266"},
        "names": {"Russian Empire"},
    },
    "rsfsr": {
        "wikidata": {"Q2184"},
        "names": {"Russian Soviet Federative Socialist Republic", "Russian SFSR", "RSFSR"},
    },
    "ussr": {
        "wikidata": {"Q15180"},
        "names": {"Soviet Union", "Union of Soviet Socialist Republics", "USSR"},
    },
}


def prop(props, *names):
    for name in names:
        if name in props and props[name] not in (None, ""):
            return props[name]
    return None


def target_for(props):
    wikidata = str(prop(props, "Wikidata", "wikidata", "WikidataID") or "").strip()
    name = str(prop(props, "Name", "name") or "").strip()
    for polity_id, target in TARGETS.items():
        if wikidata in target["wikidata"] or name in target["names"]:
            return polity_id
    return None


def normalize(feature, polity_id):
    props = feature.get("properties") or {}
    geometry = shape(feature["geometry"])
    if not geometry.is_valid:
        geometry = make_valid(geometry)
    geometry = geometry.simplify(0.018, preserve_topology=True)
    from_year = prop(props, "FromYear", "fromyear", "from_year")
    to_year = prop(props, "ToYear", "toyear", "to_year")
    wikidata = prop(props, "Wikidata", "wikidata", "WikidataID")
    name = prop(props, "Name", "name")
    wikipedia = prop(props, "Wikipedia", "wikipedia")
    seshat_id = prop(props, "SeshatID", "seshatid")
    area = prop(props, "Area", "area")

    return {
        "type": "Feature",
        "properties": {
            "polity_id": polity_id,
            "name": name,
            "start_date": from_year,
            "end_date": to_year,
            "status": "provisional-secondary-capture",
            "confidence": "unreviewed",
            "legal_basis": [],
            "source_ids": [SOURCE_ID],
            "provenance": {
                "capture_source": "Cliopatria / Seshat Global History Databank",
                "capture_version": "v0.2.0-compatible main snapshot",
                "wikidata": wikidata,
                "wikipedia": wikipedia,
                "seshat_id": seshat_id,
                "source_area_km2": area,
                "captured_at": "2026-08-22",
            },
            "notes": "Bootstrap geometry only. Must be checked against Russian legal, treaty, atlas and scholarly sources before verified status.",
        },
        "geometry": mapping(geometry),
    }


ARCHIVE.mkdir(parents=True, exist_ok=True)
manifest = json.loads(MANIFEST_PATH.read_text("utf-8"))
sources = json.loads(SOURCES_PATH.read_text("utf-8")) if SOURCES_PATH.exists() else {"schema_version": 1, "sources": []}

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    archive_path = tmp / "cliopatria.geojson.zip"
    print(f"Downloading one-time source capture: {SOURCE_URL}")
    urllib.request.urlretrieve(SOURCE_URL, archive_path)
    with zipfile.ZipFile(archive_path) as zf:
        candidates = [name for name in zf.namelist() if name.lower().endswith(".geojson")]
        if not candidates:
            raise RuntimeError(f"No GeoJSON found in archive; entries: {zf.namelist()[:20]}")
        geojson_name = candidates[0]
        print(f"Using archive member: {geojson_name}")
        zf.extract(geojson_name, tmp)
    dataset = json.loads((tmp / geojson_name).read_text("utf-8"))

captured = {polity_id: [] for polity_id in TARGETS}
for feature in dataset.get("features", []):
    polity_id = target_for(feature.get("properties") or {})
    if polity_id and feature.get("geometry"):
        captured[polity_id].append(normalize(feature, polity_id))

for polity_id, features in captured.items():
    features.sort(key=lambda item: (int(item["properties"].get("start_date") or -99999), int(item["properties"].get("end_date") or 99999)))
    if not features:
        print(f"{polity_id}: no matching Cliopatria features")
        continue

    target_path = ARCHIVE / f"{polity_id}.geojson"
    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "dataset": "Rulers of Russia Territory Archive",
            "polity_id": polity_id,
            "project_owned_runtime_data": True,
            "external_runtime_dependencies": [],
            "review_status": "unreviewed-secondary-capture",
            "bootstrap_source": "Cliopatria / Seshat Global History Databank",
            "license": "CC BY 4.0",
            "changed_from_source": True,
        },
        "features": features,
    }
    target_path.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
    print(f"{polity_id}: wrote {len(features)} snapshot feature(s)")

    for entry in manifest.get("polities", []):
        if entry.get("polity_id") == polity_id:
            entry["file"] = target_path.name
            entry["features"] = len(features)
            entry["status"] = "source-captured-unreviewed"
            entry["bootstrap_source"] = "cliopatria-v0.2.0"
            break

if not any(source.get("id") == SOURCE_ID for source in sources.get("sources", [])):
    sources.setdefault("sources", []).append({
        "id": SOURCE_ID,
        "kind": "one-time-secondary-geometry-capture",
        "name": "Cliopatria / Seshat Global History Databank",
        "version": "v0.2.0-compatible main snapshot",
        "captured_at": "2026-08-22",
        "runtime_dependency": False,
        "authoritative": False,
        "license": "CC BY 4.0",
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "source_repository": "https://github.com/Seshat-Global-History-Databank/cliopatria",
        "notes": "Used once to fill gaps in the initial project archive. Geometry was simplified and must be verified against project historical sources before verified status.",
    })

manifest["bootstrap_complete"] = all(
    entry.get("file") for entry in manifest.get("polities", [])
    if entry.get("polity_id") not in {"russian-federation"}
)
MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
SOURCES_PATH.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + "\n", "utf-8")

print("One-time Cliopatria capture finished. No runtime dependency was added.")

# Territory Archive

This directory defines the data contract for the historical territory engine. Runtime geometry lives in `public/data/territory/archive/` and belongs to the project.

## Non-negotiable rules

1. The website must not fetch historical state boundaries from any external map provider at runtime.
2. Modern territorial composition and borders are represented according to the current legislation of the Russian Federation.
3. Historical boundaries change only on a source-supported date. Do not interpolate or morph through invented intermediate borders.
4. A captured geometry is not automatically authoritative. Imported/captured shapes remain `source-captured-unreviewed` until checked against project sources.
5. Prefer Russian legal acts, treaty texts, official archival material, published historical atlases and scholarly historical works when validating or correcting a snapshot.
6. Every verified snapshot must retain its effective date, sources/legal basis, confidence and editorial notes.
7. When a correction is made, replace or supersede the local project snapshot. Do not re-sync from the original capture source.

## Storage model

`public/data/territory/archive/manifest.json` is the index. Each polity points to a local GeoJSON file. A feature represents a dated territorial state and carries:

- `start_date` / `end_date`
- `polity_id`
- `status`
- `confidence`
- `legal_basis[]`
- `source_ids[]`
- optional provenance for the original geometry capture
- editorial `notes`

## Editorial workflow

`source-captured-unreviewed` → research and compare sources → correct geometry if needed → attach Russian/legal/historical sources → mark the snapshot `verified`.

If later research changes a boundary, keep the old record as `superseded` in editorial history and publish the corrected geometry as the active snapshot.

## Modern Russia

The initially captured modern geometry is explicitly marked as requiring an override. It must not be treated as authoritative until replaced/verified against the territorial composition and borders used by the project under Russian law.

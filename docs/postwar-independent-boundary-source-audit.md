# Postwar USSR boundary: independent reference and licensing gate (2026-11-08)

## What is actually tested
`scripts/postwar-controls.test.mjs` checks eight point-in-polygon controls against the repository's `1945.geojson` USSR feature. This is an **internal consistency test**, not an independent boundary comparison, not a proof of historical accuracy for 1946–1950, and not a license to reuse a reference polygon.

The 2026-11-08 GitHub Actions run 42453940009 passed 9/9 tests and all eight city controls (Moscow, Kyiv, Vilnius, Kaliningrad, Yuzhno-Sakhalinsk, Vladivostok inside; Warsaw, Helsinki outside). A city test cannot detect a wrong border away from those points.

## Candidate independent reference: CShapes 2.0
* Publisher: ETH Zurich, International Conflict Research, https://icr.ethz.ch/data/cshapes/
* Dataset description: historical state and dependency borders, 1886–2019; temporal records and source codebook. CShapes 2.0 is suitable for investigating postwar USSR borders, **subject to date/definition alignment**.
* Library of Congress catalog: https://www.loc.gov/item/2023592015/ (GeoJSON and shapefile listed).
* Required citation: Schvitz, Rüegger, Girardin, Cederman, Weidmann & Gleditsch (2022), *Mapping the International System, 1886–2019: The CShapes 2.0 Dataset*, Journal of Conflict Resolution 66(1), 144–161.
* **Dataset license: CC BY-NC-SA 4.0**, per ETH publisher and Library of Congress. Noncommercial and share-alike restrictions apply; do not copy contours into production or redistribute them without reviewing compatibility with this project's intended uses. The R package's GPL license does not supersede the underlying dataset license.
* Intended download: https://icr.ethz.ch/data/cshapes/CShapes-2.0.zip . The working container could not resolve icr.ethz.ch on 2026-11-08; no bytes were retrieved, hashed, or compared.

## Acceptance gate (not yet met)
1. Obtain the official reference, record download date, exact version, file hash, attribution and permitted usage. Do not commit third-party geometry until rights are cleared.
2. Identify USSR record(s) with exact validity intervals. Compare equivalent **dated** borders, not merely the 1945 snapshot against arbitrary 1946–1950 years.
3. Normalize coordinate reference systems, antimeridian splitting, multipolygons, islands and holes; retain originals and log transformations.
4. Compute geodesic symmetric-difference area, IoU and both directed boundary-distance statistics; record denominator, units and uncertainty. Keep the existing acceptance tolerances unchanged.
5. Investigate each mismatch with dated primary or authoritative secondary historical evidence; avoid accepting CShapes as infallible. Re-test the globe and flat map separately.
6. Keep historical errors and reference outages visible as blockers. No source available means **not verified**, not passed.

Current independent quantitative comparisons for this candidate: **0**. Existing 1520–1599 historical regression failures: **26/26** (previously reported, not retested here).

## Source recheck (2026-11-10): version and population-selection hazards

Official publisher page: https://icr.ethz.ch/data/cshapes/ confirms CShapes 2.0 covers 1886–2019 and retains **CC BY-NC-SA 4.0**. Its separate beta page https://icr.ethz.ch/data/cshapes/beta.html advertises **CShapes 2.1** covering 1886–2023. These are distinct versions: do not silently mix them or assume the beta is the downloaded 2.0 archive. No reference geometry has been imported here.

The CShapes R documentation (https://www.stat.ethz.ch/CRAN/web/packages/cshapes/refman/cshapes.html) specifies `cshp(date, useGW, dependencies)`: `useGW=true` chooses Gleditsch–Ward state membership, `false` Correlates of War; `dependencies=false` excludes dependent units. These switches may change the geometry/feature population. Any USSR comparison must record the chosen state-system definition, dependencies setting, and precise snapshot date alongside source version and hash. A passing comparison with an unspecified switch is not independently reproducible.

A separate CShapes-powered OGC API description at https://github.com/ldproxy/demo/blob/main/doc/cshapes.md explicitly documents dated filtering (e.g. `datetime=1980-01-01`) and the same noncommercial share-alike license. It is a secondary service, not an authoritative substitute for publisher bytes or permission to redistribute contours.

**Status:** official source and license text rechecked, but 0 geometry files fetched, 0 licensed independent boundary comparisons executed, and no new historical correctness claim. The existing 26/26 failures for 1520–1599 remain unresolved. Before a comparison, select an explicit version (2.0 vs beta 2.1), dated USSR records, GW/COW definition, dependencies policy, and usage rights; record each as comparison metadata.

# Map completion status — 2026-10-03

The map is **not yet fully geographically verified**. The History Core documentary
completion audit and a successful site build are necessary but insufficient.

## Verified changes in PR #307

- Sharded Runivers checks preserve the canonical 13,980-month index.
- A failed check cannot reuse an obsolete passing report.
- Reference loading supports the component MVT endpoint and explicit WGS84
  GeoJSON exports, dissolving internal feature edges on both transports.
- Political-border comparison uses physical coastlines rather than the union of
  historical political polygons. Reports include coordinates of worst mismatches.
- RF maritime source envelopes and displaced offshore components are repaired
  reproducibly using the pinned Natural Earth physical land surface. Historical
  mainland borders and legal dates come from the existing dated sources. The
  full-world physical mask is dissolved before clipping, so modern country
  boundaries are not substituted for historical borders. Runivers geometry is
  never incorporated into production data.
- The RF recipes check sea exclusions, actual island interiors, mainland cities,
  and exclusion of Crimea before 2014. Both source archives are pinned by SHA.
- Next is updated to 16.3.8, resolving the dependency audit failure.

## Evidence

GitHub run 37150635463, commit 163efe4bc58ba12abe404876057b57d0d83a77da:
1992–2020 passed 4 of 4 comparisons with no overrides (job 111283700586).
Local archive recipe validation passed all 75 recipes, including the coastline
controls; History Core validation passed 254 documents and 112 fragments.

The canonical 13,980-month core audit is a documentary/reconstruction coverage
claim, not proof of agreement with an independent historical map.

## Remaining work

- Resolve external comparison failures before 1992. Do not relax tolerances or
  add blanket overrides to produce green checks.
- Correct reference scope before interpreting every early-period difference as
  a production geometry error: e.g. the 1462 reference includes separately named
  Tver, Novgorod, Ryazan and dependent territories alongside Moscow. The current
  reference loader unions those features. Status/name selection must be grounded
  in the source's semantics and the historical track being compared, not fitted
  to the desired result.
- Verify within-year transition dates independently: Runivers year-level layers
  cannot resolve which side of a monthly transition they represent. Excluded
  transition years are explicitly reported by each shard.
- Complete Chromium interaction checks on the changed data, then rerun all
  gates and deploy only a reviewed result. PR #307 has not been merged or deployed.

The local full-range cached diagnostic is incomplete because 56 references were
not cached. Its totals must not be reported as a complete external audit.

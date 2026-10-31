# Runivers 1520–1599: dated source-identity triage (2026-10-31)

**Research only; NOT a geographic acceptance or a license to use Runivers geometry.** This note records the observed source identities and distances without reproducing source coordinates, polygon vertices, or images. It does not establish which map is correct.

## Reproducible evidence

- [GitHub Actions run 41146583131, 1520–1599 shard](https://github.com/nkuchenov-hash/rulers-of-russia/actions/runs/41146583131), artifact `runivers-geometric-regression-1520-1599` (ID 13020789296), generated 2026-10-30 23:59:56 UTC.
- 26 bilateral comparisons; **0 passed, 26 failed**. 26 overlapping source layers were discovered but only 23 audited. Three layers (resource 5397, 1552–1553; 5403, 1556–1557; 5427, 1595–1596) have no eligible unambiguous full-year History Core state and remain **uncompared**, not passed.
- No reference-export failures in this shard. Other periods have independent Runivers outages. The comparison tolerance and History Core production geometry were not changed.

## Concrete failed-boundary clusters

| Dated resources / state range | Observed maximum mismatch | Source identity at the worst reference-side sample | Investigation |
| --- | ---: | --- | --- |
| 5383–5395, 1510–1552 (9 comparisons, including reused states) | 983,475 m | Selected `Московское княжество` cat 51 (later `Российское царство` cat 767); excluded `Обдорское княжество` cat 488 occurs at the same boundary sample | Lower Ob / Yugra: distinguish intermittent tribute, overlordship and title from direct administration; do not equate coincident boundaries with legal sovereignty |
| 5399, 5401, 1553–1556 | 1,111,421 m | Selected `Российское царство` cat 767; excluded `Зона русской колонизации` cat 522 | Clarify the source's definition of a colonization zone versus state border |
| 5405–5417, 1557–1584 (8 comparisons) | 552,000 m (rounded) | Selected `Российское царство` cats 767/912; excluded colonization zone cats 523/689 | Test whether the mismatch is a source-scope or a dated territorial error |
| 5419–5433, 1584–1600 (7 comparisons) | 1,154,300 m (rounded) | Selected `Российское царство` cat 767; most worst samples have no separately named excluded polity | Requires independent dated contour evidence; do not infer a fix from the absence of an excluded feature |

Counts and distances are comparisons, **not independent historical confirmations**. The selected and excluded source features meeting at a boundary point may merely share an edge; this does not by itself prove overlapping sovereignty. The 1552, 1556 and 1595 transitions cannot be resolved by year-granular Runivers snapshots.

## Historical-source caution: Yugra

N. V. Pertsev, *The 1499 Moscow campaign in Yugra in the context of domestic and foreign policy* (2018), DOI [10.25136/2409-868X.2018.2.25381](https://doi.org/10.25136/2409-868X.2018.2.25381), explicitly notes disagreement in the literature about the results and objectives of the campaign. The historical collection [*Yugra through the centuries*](https://xn----dtbdzdfqbczhet1kob.xn--p1ai/wp-content/uploads/2021/06/yugra-mnogovekovaya.pdf), in its treatment of 1455–1499 political relations, distinguishes campaigns, claims and tribute from evidence of permanent Moscow governors. Neither source provides a georeferenced, licensed polygon adequate for direct production replacement.

**Decision:** keep the 983 km discrepancy as a failure; do not automatically add the lower Ob to the Moscow sovereign polygon, subtract it from the Runivers reference, or adjust thresholds. Obtain primary documents and an independently licensed, dated boundary reconstruction before changing any contour.

## New repeatable diagnostic

`node scripts/summarize-runivers-source-conflicts.mjs tmp/runivers-regression/report.json > tmp/runivers-regression/source-triage.json`

The summary groups actual worst reference-side boundary samples by bounded original source identities, preserving sample severity, reference IDs, missing attribution and unmatched resource IDs. It never emits boundary coordinates or raw polygons. It is **diagnostic only** and cannot turn a failed geographic comparison into a pass.

## Directed maximum attribution guard (2026-10-31)

The research-only summary now records `reportedMaximumMatches` and `reportedMaximumUnmatched` for each source-identity group, plus `unmatchedReportedMaximumByDirection` across the report. A sampled boundary identity is **not** asserted to explain the report's maximum directed distance unless its sample matches that reported maximum (allowing only 1 m for numeric serialization rounding). Missing samples remain separately counted in `unattributedByDirection`. This prevents assigning the largest geographic discrepancy to an unrelated source object when the detailed sample list is incomplete. It does not change the Runivers acceptance gate, geographic tolerances, source geometry, or the map.

## Dated identity separation (2026-10-31)

Source-conflict grouping now preserves the original feature's `lwdate` and `status` when available, in addition to its `cat` and `name`. Two source records named `Российское царство` with the same category but different effective dates or statuses must not be treated as one historical transition. Missing dates/statuses remain explicitly unknown rather than being invented. The summary contains only bounded scalar metadata, never Runivers polygon coordinates. This is a **triage correction**, not a new independent geographic pass or an assertion that the source's date represents a legally effective annexation.

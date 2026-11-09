# USSR 1945: antimeridian seam contact in topology audit (2026-11-09)

## Reproducible evidence

GitHub Actions diagnostic run [42534636485](https://github.com/nkuchenov-hash/rulers-of-russia/actions/runs/42534636485), head `4d0801c8f7142ddd4b5a157d8cacbf1adcd58643`, reports **29 passed / 1 failed**. The failing case is the repository 1945 USSR snapshot (not an independent historical reference). The diagnostic CLI also exits 2.

Exact conflicting source-derived segments, after unwrapping/translation by the diagnostic:

- outer edge index **1031**: `[[180,65.3816333636797],[180,65.96313055606251]]`
- hole edge index **0**, longitude translation **+360°**: `[[180,66.96313055606251],[180,65.96313055606251]]`
- shared endpoint: **(180°, 65.96313055606251° N)**.

The two edges are collinear along the ±180° seam and meet at one endpoint. This is **not a proper interior crossing** of those two segments. The strict validator rejects both crossings and touches, correctly under its current planar polygon topology contract. Whether this seam touch is an artifact of splitting a valid spherical polygon or an invalid ring assignment in the source snapshot is **not established**.

## Interpretation and safe investigation

A seam-clipped representation may encode the same physical boundary in separate rings, which can create touching ring endpoints even when the intended spherical region is coherent. Conversely, a hole touching its parent shell violates strict polygon-ring separation; suppressing the error merely because longitude equals 180° could hide real invalid geometry. No tolerance changes, exception lists, automatic seam rewrites, or historical contour edits are justified by this single contact.

Before changing the validator or geometry:

1. Extract the entire parent polygon and hole from the *exact* snapshot SHA; record their ring indices, winding, bounding boxes, seam vertices and nearby points, plus whether other rings share the same seam.
2. Reconstruct topology on the longitude-periodic surface and compare the filled region on both sides of the seam. Test that repair preserves point containment and geodesic area; distinguish a clipping seam from a genuine hole touching the shell.
3. If the data are malformed, trace the geometry's provenance and licensing before editing; if the validator is wrong, add adversarial seam-contact and true non-seam-contact tests before making a narrowly justified correction.
4. Keep the failing historical-snapshot regression active until resolved. A green synthetic suite cannot replace it.
5. Compare dated borders with a rights-cleared independent reference; currently **zero** such quantitative comparisons for this case. The 26/26 failures for 1520–1599 remain unresolved.

This report is a topology diagnosis, **not** proof of geographic accuracy or permission to redistribute historical contours.

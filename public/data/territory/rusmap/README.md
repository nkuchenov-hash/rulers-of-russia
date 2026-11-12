# Dated Muscovy / Russian Tsardom provisional geometry

**Visible in the 3D globe only when no geometry-verified History Core snapshot applies.**

- Upstream publisher: [Историческая карта России — rusmap.org](https://rusmap.org/data/).
- Source: [state-muscovy.geojson](https://rusmap.org/data/state-muscovy.geojson) (17 dated versions, 1485–1720).
- License for the imported dataset and adapted database: [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/) (ODbL). Preserve required attribution and the ODbL license for derivative databases.
- Recorded SHA-256 of the original upstream response: `72b7bff7f2fcdc7127620fa7da62a2269b7813237bc2b4ad624f66e4b7066703`.
- Reproducible one-time import: `node scripts/vendor-rusmap-muscovy.mjs`. The GitHub Actions vendoring workflow commits the resulting GeoJSON rather than requiring the public application to call a third-party host at runtime.
- All original geometry coordinates and upstream feature properties (`from`, `to`, `certainty`, `sources`) are preserved. The adapter adds `start_date`, `end_date` and status labels for the existing History Core viewer.
- **Display date policy:** when `from` contains a year only, it is mapped to December of that year **for the monthly view**, not asserted to be the actual historical date. The upstream year remains in `from`. A precise `YYYY-MM` or `YYYY-MM-DD` is retained without adding a day.
- The import uses the source's `documented` or `schematic` label to describe source confidence, not independent geographic correctness. Even `documented` remains `reconstruction-provisional`; `schematic` is shown at low confidence.
- First use: 1485-12–1546-12 provisional Moscow states and 1547-01–1720-12 provisional Tsardom states. Existing verified History Core geometries always take precedence. State names and period transitions still come from our local chronology.
- **Do not use** this data as an authority for exact borders, dates, territorial control, or international recognition. Independent comparison, chronology audit and historical legal-source verification remain necessary. In particular, 1520–1599 Runivers baseline comparisons previously failed 26/26 and this import does not automatically change that result.

Neither this data import nor the source's `documented` label certifies that the historical map is correct. Do not remove this notice or the accompanying database license if redistributing the imported geometry.

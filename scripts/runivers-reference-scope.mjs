import polygonClipping from 'polygon-clipping';

// Runivers's early layers contain multiple separately named polities. Moscow
// and the Tsardom must not be compared with the union of Russia, independent
// khanates, neighboring principalities and other territories in the layer.
// USSR layers likewise include explicitly named occupation and lease zones;
// select named Soviet/Russian territory, without treating the source styling
// status as sovereignty: some mainland features named Russia have status 6.
// This is selection by source identity, not a geometric fit or an override.
const moscowNames = new Set(['Московское княжество', 'Великое княжество Московское', 'Московское государство', 'Россия']);
// The Tsardom continues Moscow's state identity. Select only explicitly named
// Russian-state features; unknown and independently named polities must never
// be silently unioned into a sovereign border. Missing identity fails closed.
const tsardomNames = new Set([...moscowNames, 'Русское царство', 'Российское царство', 'Царство Русское', 'Царство Московское']);
// The 1750-1799 Runivers source layers contain independently named Kalmyk,
// Kazakh and Caucasian polities alongside Russia. Comparing their union to
// the Empire invents a sovereign outer border. Only source-labeled Russia
// and Russian America (a distinct colonial-control label) are selected.
// This does not certify their contours or settle colonial sovereignty.
const empireNames = new Set(['Россия', 'Российская империя', 'Русская Америка']);
// Identified unnamed Soviet additions in the original source records. Source
// The selected status-6 records explicitly describe Soviet additions; the
// inspected status-7 Polish transfers are cessions, not resulting territory.
// Match both cat and event date, never a bounding box or geometric similarity.
const sovietAdditions = new Set(['369:1922-12-30','731:1922-12-30',
  '578:1924-10-27','709:1945-08-02','713:1945-09-02',
  '710:1945-06-29','205:1944-09-19']);
// All named-polity scope metadata is written to public CI artifacts. The
// original Runivers features stay in memory for geometry and attribution;
// only bounded, scalar examples may cross into the JSON report.
const MAX_SCOPE_EXAMPLES = 20;
const sourceScalar = value => typeof value === 'string' ? value.slice(0, 160)
  : typeof value === 'number' && Number.isFinite(value) ? value : null;
function boundedDistinct(values) {
  const unique = [...new Set(values.map(sourceScalar).filter(value => value !== null))];
  return {examples: unique.slice(0, MAX_SCOPE_EXAMPLES), truncated: unique.length > MAX_SCOPE_EXAMPLES};
}
function sourceRecord(feature) {
  return {
    featureId: sourceScalar(feature?.id),
    cat: sourceScalar(feature?.properties?.cat),
    name: sourceScalar(feature?.properties?.name),
    lwdate: sourceScalar(feature?.properties?.lwdate),
    status: sourceScalar(feature?.properties?.status),
  };
}
// GeoJSON permits nested GeometryCollections. The reference validator accepts
// their polygons, so polity scoping must not silently discard those borders.
// Non-polygon members are not sovereign areas and are intentionally ignored.
function polygonsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates ?? [];
  if (geometry.type === 'GeometryCollection') return Array.isArray(geometry.geometries)
    ? geometry.geometries.flatMap(polygonsFromGeometry) : [];
  return [];
}

export function referenceForPolity(payload, polityId) {
  const names = polityId === 'grand-moscow' ? moscowNames
    : polityId === 'russian-tsardom' ? tsardomNames
    : polityId === 'russian-empire' ? empireNames
    : polityId === 'ussr' ? new Set(['СССР', 'Россия', 'РСФСР']) : null;
  if (!names) {
    // For later historical polities the entire reference layer is selected.
    // Preserve its ORIGINAL source features for diagnostic attribution too:
    // otherwise non-Moscow failures show coordinates but no source IDs.
    // This stays in memory; only bounded feature identities enter reports.
    const hasOriginalFeatures = Array.isArray(payload.referenceSourceFeatures)
      && payload.referenceSourceFeatures.length > 0;
    const features = hasOriginalFeatures ? payload.referenceSourceFeatures
      : Array.isArray(payload.features) ? payload.features : [];
    // Whole-layer comparison is not a polity-identity check. Expose bounded
    // source metadata for failed-comparison triage, especially when one
    // Runivers layer contains several named entities. Never export polygons.
    // A merged payload fallback is NOT original feature-level provenance.
    const named = features.map(feature => sourceScalar(feature?.properties?.name))
      .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim());
    const names = [...new Set(named)].sort((a, b) => a.localeCompare(b, 'ru'));
    const sourceRecordExamples = hasOriginalFeatures ? features.slice(0, MAX_SCOPE_EXAMPLES).map(sourceRecord) : [];
    return {payload, scope: {
      kind: 'whole-reference-layer', diagnosticOnly: true,
      sourceProvenance: hasOriginalFeatures ? 'original-source-features' : 'merged-payload-fallback',
      sourceFeatureCount: features.length,
      namedFeatureCount: named.length,
      distinctNameCount: names.length,
      sourceNameExamples: names.slice(0, 20),
      sourceNamesTruncated: names.length > 20,
      sourceRecordExamples,
      sourceRecordsTruncated: hasOriginalFeatures && features.length > 20,
    }, sourceFeatures: {selected: features, excluded: []}};
  }
  const label = polityId === 'grand-moscow' ? 'Moscow' : polityId === 'russian-tsardom' ? 'Tsardom'
    : polityId === 'russian-empire' ? 'Empire' : 'USSR';
  const features = payload.referenceSourceFeatures;
  if (!Array.isArray(features) || !features.length) throw new Error(`${label} reference requires original named source features; refresh the reference cache`);
  const selected = features.filter(f => {
    const p = f.properties ?? {};
    return names.has(String(p.name ?? '').trim()) || (polityId === 'ussr'
      && !p.name && Number(p.status) === 6 && sovietAdditions.has(`${p.cat}:${p.lwdate}`));
  });
  if (!selected.length) throw new Error(`Runivers layer has no named ${label} polity; source scope needs review`);
  // Keep the original selected/excluded source records in memory for research
  // attribution. The public regression report receives only identifiers,
  // never the licensed reference geometry itself.
  const excluded = features.filter(f => !selected.includes(f));
  const polygons = selected.flatMap(f => polygonsFromGeometry(f.geometry));
  if (!polygons.length) throw new Error(`Named ${label} reference contains no polygon geometry`);
  return {
    payload: {type: 'FeatureCollection', features: [{type: 'Feature',
      properties: {sourceProperties: selected.map(f => f.properties)},
      geometry: {type: 'MultiPolygon', coordinates: polygonClipping.union(...polygons)}}]},
    sourceFeatures: {selected, excluded},
    scope: {kind: 'named-polity', polityId, selectedFeatures: selected.length, totalFeatures: features.length,
      selectedNames: boundedDistinct(selected.map(f => f.properties?.name)).examples,
      selectedNamesTruncated: boundedDistinct(selected.map(f => f.properties?.name)).truncated,
      selectedSourceCats: boundedDistinct(selected.map(f => f.properties?.cat)).examples,
      selectedSourceCatsTruncated: boundedDistinct(selected.map(f => f.properties?.cat)).truncated,
      // These are bounded diagnostic examples, not the full licensed source.
      // Source features remain in memory for actual boundary comparisons.
      selectedSourceRecords: selected.slice(0, MAX_SCOPE_EXAMPLES).map(sourceRecord),
      selectedSourceRecordsMatchedCount: selected.length,
      selectedSourceRecordsTruncated: selected.length > MAX_SCOPE_EXAMPLES,
      excludedNames: boundedDistinct(excluded.map(f => f.properties?.name)).examples,
      excludedNamesTruncated: boundedDistinct(excluded.map(f => f.properties?.name)).truncated},
  };
}

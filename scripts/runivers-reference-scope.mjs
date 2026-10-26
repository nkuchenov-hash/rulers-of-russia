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
// Identified unnamed Soviet additions in the original source records. Source
// The selected status-6 records explicitly describe Soviet additions; the
// inspected status-7 Polish transfers are cessions, not resulting territory.
// Match both cat and event date, never a bounding box or geometric similarity.
const sovietAdditions = new Set(['369:1922-12-30','731:1922-12-30',
  '578:1924-10-27','709:1945-08-02','713:1945-09-02',
  '710:1945-06-29','205:1944-09-19']);
export function referenceForPolity(payload, polityId) {
  const names = polityId === 'grand-moscow' ? moscowNames
    : polityId === 'russian-tsardom' ? tsardomNames
    : polityId === 'ussr' ? new Set(['СССР', 'Россия', 'РСФСР']) : null;
  if (!names) return {payload, scope: {kind: 'whole-reference-layer'}};
  const label = polityId === 'grand-moscow' ? 'Moscow' : polityId === 'russian-tsardom' ? 'Tsardom' : 'USSR';
  const features = payload.referenceSourceFeatures;
  if (!Array.isArray(features) || !features.length) throw new Error(`${label} reference requires original named source features; refresh the reference cache`);
  const selected = features.filter(f => {
    const p = f.properties ?? {};
    return names.has(String(p.name ?? '').trim()) || (polityId === 'ussr'
      && !p.name && Number(p.status) === 6 && sovietAdditions.has(`${p.cat}:${p.lwdate}`));
  });
  if (!selected.length) throw new Error(`Runivers layer has no named ${label} polity; source scope needs review`);
  const polygons = selected.flatMap(f => f.geometry?.type === 'Polygon' ? [f.geometry.coordinates]
    : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : []);
  if (!polygons.length) throw new Error(`Named ${label} reference contains no polygon geometry`);
  return {
    payload: {type: 'FeatureCollection', features: [{type: 'Feature',
      properties: {sourceProperties: selected.map(f => f.properties)},
      geometry: {type: 'MultiPolygon', coordinates: polygonClipping.union(...polygons)}}]},
    scope: {kind: 'named-polity', polityId, selectedFeatures: selected.length, totalFeatures: features.length,
      selectedNames: [...new Set(selected.map(f => f.properties.name ?? null))],
      selectedSourceCats: [...new Set(selected.map(f => f.properties.cat).filter(x => x != null))],
      excludedNames: [...new Set(features.filter(f => !selected.includes(f)).map(f => f.properties?.name ?? null))]},
  };
}

import polygonClipping from 'polygon-clipping';

// Runivers's early layers contain multiple separately named polities. Moscow
// must not be compared with the union of Moscow, Novgorod, Tver and Ryazan.
// This is selection by source identity, not a geometric fit or an override.
const moscowNames = new Set(['Московское княжество', 'Великое княжество Московское', 'Московское государство', 'Россия']);
export function referenceForPolity(payload, polityId) {
  if (polityId !== 'grand-moscow') return {payload, scope: {kind: 'whole-reference-layer'}};
  const features = payload.referenceSourceFeatures;
  if (!Array.isArray(features) || !features.length) throw new Error('Moscow reference requires original named source features; refresh the reference cache');
  const selected = features.filter(f => moscowNames.has(String(f.properties?.name ?? '').trim()));
  if (!selected.length) throw new Error('Runivers layer has no named Moscow polity; source scope needs review');
  const polygons = selected.flatMap(f => f.geometry?.type === 'Polygon' ? [f.geometry.coordinates]
    : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : []);
  if (!polygons.length) throw new Error('Named Moscow reference contains no polygon geometry');
  return {
    payload: {type: 'FeatureCollection', features: [{type: 'Feature',
      properties: {sourceProperties: selected.map(f => f.properties)},
      geometry: {type: 'MultiPolygon', coordinates: polygonClipping.union(...polygons)}}]},
    scope: {kind: 'named-polity', polityId, selectedFeatures: selected.length, totalFeatures: features.length,
      selectedNames: [...new Set(selected.map(f => f.properties.name))],
      excludedNames: [...new Set(features.filter(f => !selected.includes(f)).map(f => f.properties?.name ?? null))]},
  };
}

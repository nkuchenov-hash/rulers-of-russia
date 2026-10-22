import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import polygonClipping from 'polygon-clipping';

const cache = new Map();
const polygonsOf = geometry => geometry?.type === 'Polygon' ? [geometry.coordinates]
  : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];

function selectComponents(polygons, indices, label) {
  assert(Array.isArray(indices) && indices.length > 0, `${label}: missing component indices`);
  assert.equal(new Set(indices).size, indices.length, `${label}: duplicate component index`);
  return indices.map(index => {
    assert(Number.isInteger(index) && index >= 0 && index < polygons.length, `${label}: component ${index} out of range`);
    return polygons[index];
  });
}

// This operation repairs a maritime source capture, not its political history.
// Mainland borders come only from the dated archive. The full-world land union
// erases modern political borders before clipping; named offshore components
// supply physical island outlines under the recipe's independent legal evidence.
export function repairArchiveCoastline(polygons, repair, root = process.cwd()) {
  if (!repair) return polygons;
  assert.equal(polygons.length, repair.expectedSourceComponentCount, 'Coastline repair: source component count changed');
  assert(repair.note && repair.evidenceDocumentId, 'Coastline repair: missing provenance');
  const file = path.resolve(root, repair.archivePath);
  const bytes = fs.readFileSync(file);
  const digest = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  assert.equal(digest, repair.archiveBlobSha1, 'Coastline repair: land archive SHA mismatch');
  let source = cache.get(digest);
  if (!source) {
    const archive = JSON.parse(bytes);
    assert(archive.type === 'FeatureCollection' && archive.features.length > 0, 'Coastline repair: missing land features');
    source = {archive, land: polygonClipping.union(...archive.features.flatMap(f => polygonsOf(f.geometry)))};
    cache.set(digest, source);
  }
  const features = source.archive.features.filter(f => Object.entries(repair.islandSelector ?? {}).every(([k,v]) => f.properties?.[k] === v));
  assert.equal(features.length, 1, 'Coastline repair: island selector must match one feature');
  const islandSource = polygonsOf(features[0].geometry);
  assert.equal(islandSource.length, repair.expectedIslandSourceComponentCount, 'Coastline repair: island component count changed');
  const mainland = selectComponents(polygons, repair.preserveComponentIndices, 'Mainland');
  const islands = selectComponents(islandSource, repair.islandComponentIndices, 'Islands');
  const clipped = polygonClipping.intersection(mainland, source.land);
  assert(clipped.length > 0, 'Coastline repair: land clip removed all geometry');
  return polygonClipping.union(clipped, ...islands);
}

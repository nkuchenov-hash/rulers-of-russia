import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Pbf from 'pbf';

const cwd = process.cwd();
const originalFetch = globalThis.fetch;
const previousDiscovery = process.env.RUNIVERS_DISCOVERY_FILE;
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'runivers-json-'));
const geometry = {type: 'Polygon', coordinates: [[[30, 50], [31, 50], [31, 51], [30, 51], [30, 50]]]};
const adjacent = {type: 'Polygon', coordinates: [[[31, 50], [32, 50], [32, 51], [31, 51], [31, 50]]]};
// Minimal real MVT wire format: an empty layer or a rectangle encoded using
// MoveTo, LineTo and ClosePath commands. No external tile service is needed.
const makeTile = (withPolygon, degenerate = false) => {
  const pbf = new Pbf();
  pbf.writeMessage(3, (data, writer) => {
    writer.writeStringField(1, 'historical');
    if (data) writer.writeMessage(2, (_, feature) => {
      feature.writeVarintField(1, 1);
      feature.writeVarintField(3, 3); // POLYGON
      feature.writePackedVarint(4, degenerate
        ? [9, 4600, 3000, 26, 200, 0, 200, 0, 399, 0, 15] // closed, collinear: zero area
        : [9, 4600, 3000, 26, 200, 0, 0, 200, 199, 0, 15]);
    }, null);
    writer.writeVarintField(5, 4096);
    writer.writeVarintField(15, 2);
  }, withPolygon);
  return pbf.finish();
};
try {
  process.chdir(fixture);
  const discovery = path.join(fixture, 'baseline.json');
  fs.writeFileSync(discovery, JSON.stringify({host: 'https://example.invalid', vectorLayers:
    [1, 2, 3, 4, 5, 6].map(id => ({id, fromYear: 1992, toYear: 2020}))}));
  // The first 5,001 WGS84 points are valid, but the next source feature
  // contains projected metres. A prefix-only coordinate check missed it.
  const longLine = {type: 'MultiLineString',
    coordinates: [Array.from({length: 5001}, (_, i) => [30 + i / 100000, 50])]};
  const badPoint = {type: 'Point', coordinates: [4000000, 7000000]};
  const feature = geom => ({type: 'Feature', geometry: geom, properties: {name: 'Россия'}});
  const invalidExports = {
    3: {type: 'FeatureCollection', features: [feature(longLine), feature(badPoint)]},
    4: {type: 'FeatureCollection', features: [feature({type: 'Point', coordinates: [37, 55]})]},
    5: {type: 'FeatureCollection', features: [feature(geometry),
      feature({type: 'GeometryCollection', geometries: [
        {type: 'GeometryCollection', geometries: [badPoint]}]})]},
  };
  const requestedRecovery = new Set();
  process.env.RUNIVERS_DISCOVERY_FILE = discovery;
  let requestedGeojson = false;
  let requestedComponentMvt = false;
  let requestedDegenerateRecovery = false;
  let requestedDegenerateJson = false;
  let requestedSecondJson = false;
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname === '/api/resource/2/0/0/0.mvt') {
      return new Response(makeTile(false), {status: 200}); // Valid MVT, no polygon
    }
    if (url.pathname === '/api/component/feature_layer/mvt' && url.searchParams.get('resource') === '2') {
      requestedComponentMvt = true;
      return new Response(makeTile(true), {status: 200});
    }
    if (url.pathname === '/api/resource/6/0/0/0.mvt') {
      return new Response(makeTile(true, true), {status: 200}); // A polygon label with zero enclosed area
    }
    if (url.pathname === '/api/component/feature_layer/mvt' && url.searchParams.get('resource') === '6') {
      requestedDegenerateRecovery = true;
      return new Response(makeTile(true), {status: 200});
    }
    if (url.pathname.startsWith('/api/resource/6/')) {
      requestedDegenerateJson = true;
      return new Response('', {status: 404});
    }
    if (url.pathname.startsWith('/api/resource/2/')) {
      requestedSecondJson = true;
      return new Response('', {status: 404});
    }
    const referenceId = Number(url.pathname.match(/^\/api\/resource\/(\d+)\//)?.[1]);
    if (invalidExports[referenceId] && url.pathname.endsWith('/feature/')) {
      return Response.json(invalidExports[referenceId]);
    }
    if (invalidExports[referenceId] && url.pathname.endsWith('/export')) {
      requestedRecovery.add(referenceId);
      return Response.json({type: 'FeatureCollection', features: [feature(geometry)]});
    }
    if (url.pathname === '/api/resource/1/feature/') {
      requestedGeojson = url.searchParams.get('geom_format') === 'geojson' && url.searchParams.get('srs') === '4326';
      return Response.json([
        {id: 101, geom: requestedGeojson ? geometry : 'POLYGON ((30 50,31 50,31 51,30 50))', fields: {name: 'Россия', cat: 767}},
        {id: 102, geom: requestedGeojson ? adjacent : 'POLYGON ((31 50,32 50,32 51,31 50))', fields: {name: 'adjacent', cat: 912}},
      ]);
    }
    return new Response('', {status: 404});
  };
  await import('./runivers-fetch-cache.mjs');
  const response = await fetch('https://example.invalid/api/resource/1/geojson');
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(requestedGeojson, true, 'NextGIS otherwise defaults to WKT');
  const data = await response.json();
  assert.equal(data.features.length, 1);
  assert.deepEqual(data.referenceSourceFeatures.map(f => f.geometry), [geometry, adjacent]);
  assert.deepEqual(data.referenceSourceFeatures.map(f => f.properties.name), ['Россия', 'adjacent']);
  assert.deepEqual(data.referenceSourceFeatures.map(f => f.id), [101, 102],
    'NextGIS JSON feature IDs must survive normalization for source-level mismatch diagnostics');
  const {referenceForPolity} = await import('./runivers-reference-scope.mjs');
  const scoped = referenceForPolity(data, 'russian-tsardom');
  assert.deepEqual(scoped.scope.selectedSourceRecords.map(f => [f.featureId, f.cat, f.name]),
    [[101, 767, 'Россия']], 'JSON fallback must retain original source record identity after polity scoping');
  assert.deepEqual(data.features[0].geometry, {type: 'MultiPolygon', coordinates:
    [[[[30, 50], [32, 50], [32, 51], [30, 51], [30, 50]]]]});
  assert.equal(data.features[0].properties.sourceProperties.length, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync('tmp/runivers-regression/reference-cache/1.geojson')), data);
  const second = await fetch('https://example.invalid/api/resource/2/geojson');
  assert.equal(second.status, 200, await second.clone().text());
  const mvt = await second.json();
  assert.equal(requestedComponentMvt, true, 'an empty canonical MVT must trigger the component MVT fallback');
  assert.equal(requestedSecondJson, false, 'a populated component MVT must not fall through to JSON');
  assert.equal(mvt.features[0].properties.runiversReferenceTransport, 'component-feature-layer-mvt');
  assert.equal(mvt.referenceSourceFeatures.length, 1);
  assert.equal(mvt.features[0].geometry.type, 'MultiPolygon');
  assert.ok(mvt.features[0].geometry.coordinates.length > 0);
  const degenerateResponse = await fetch('https://example.invalid/api/resource/6/geojson');
  assert.equal(degenerateResponse.status, 200, await degenerateResponse.clone().text());
  const degenerateMvt = await degenerateResponse.json();
  assert.equal(requestedDegenerateRecovery, true,
    'a non-empty but zero-area canonical polygon must trigger the component MVT fallback');
  assert.equal(requestedDegenerateJson, false,
    'a usable alternate MVT should not require a JSON export');
  assert.equal(degenerateMvt.features[0].properties.runiversReferenceTransport, 'component-feature-layer-mvt');
  for (const id of [3, 4, 5]) {
    const response = await fetch(`https://example.invalid/api/resource/${id}/geojson`);
    assert.equal(response.status, 200, await response.clone().text());
    assert.ok(requestedRecovery.has(id),
      `resource ${id}: invalid/point-only first export must trigger the next WGS84 endpoint`);
    const recovered = await response.json();
    assert.equal(recovered.referenceSourceFeatures.length, 1);
    assert.deepEqual(recovered.referenceSourceFeatures[0].geometry, geometry);
  }
  console.log('Runivers fallbacks passed: empty and zero-area MVT alternatives, complete WGS84 coordinate scan, nested projected features and point-only JSON recovery.');
} finally {
  globalThis.fetch = originalFetch;
  process.chdir(cwd);
  if (previousDiscovery === undefined) delete process.env.RUNIVERS_DISCOVERY_FILE;
  else process.env.RUNIVERS_DISCOVERY_FILE = previousDiscovery;
  fs.rmSync(fixture, {recursive: true, force: true});
}

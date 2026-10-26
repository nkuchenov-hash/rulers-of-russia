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
const makeTile = withPolygon => {
  const pbf = new Pbf();
  pbf.writeMessage(3, (data, writer) => {
    writer.writeStringField(1, 'historical');
    if (data) writer.writeMessage(2, (_, feature) => {
      feature.writeVarintField(1, 1);
      feature.writeVarintField(3, 3); // POLYGON
      feature.writePackedVarint(4, [9, 4600, 3000, 26, 200, 0, 0, 200, 199, 0, 15]);
    }, null);
    writer.writeVarintField(5, 4096);
    writer.writeVarintField(15, 2);
  }, withPolygon);
  return pbf.finish();
};
try {
  process.chdir(fixture);
  const discovery = path.join(fixture, 'baseline.json');
  fs.writeFileSync(discovery, JSON.stringify({host: 'https://example.invalid', vectorLayers: [{id: 1, fromYear: 1992, toYear: 2020}, {id: 2, fromYear: 1992, toYear: 2020}]}));
  process.env.RUNIVERS_DISCOVERY_FILE = discovery;
  let requestedGeojson = false;
  let requestedComponentMvt = false;
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
    if (url.pathname.startsWith('/api/resource/2/')) {
      requestedSecondJson = true;
      return new Response('', {status: 404});
    }
    if (url.pathname === '/api/resource/1/feature/') {
      requestedGeojson = url.searchParams.get('geom_format') === 'geojson' && url.searchParams.get('srs') === '4326';
      return Response.json([
        {geom: requestedGeojson ? geometry : 'POLYGON ((30 50,31 50,31 51,30 50))', fields: {name: 'test'}},
        {geom: requestedGeojson ? adjacent : 'POLYGON ((31 50,32 50,32 51,31 50))', fields: {name: 'adjacent'}},
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
  assert.deepEqual(data.referenceSourceFeatures.map(f => f.properties.name), ['test', 'adjacent']);
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
  console.log('Runivers fallbacks passed: WGS84 JSON when MVT unavailable, populated component MVT after an empty canonical MVT.');
} finally {
  globalThis.fetch = originalFetch;
  process.chdir(cwd);
  if (previousDiscovery === undefined) delete process.env.RUNIVERS_DISCOVERY_FILE;
  else process.env.RUNIVERS_DISCOVERY_FILE = previousDiscovery;
  fs.rmSync(fixture, {recursive: true, force: true});
}

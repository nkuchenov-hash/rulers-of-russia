import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cwd = process.cwd();
const originalFetch = globalThis.fetch;
const previousDiscovery = process.env.RUNIVERS_DISCOVERY_FILE;
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'runivers-json-'));
const geometry = {type: 'Polygon', coordinates: [[[30, 50], [31, 50], [31, 51], [30, 51], [30, 50]]]};
const adjacent = {type: 'Polygon', coordinates: [[[31, 50], [32, 50], [32, 51], [31, 51], [31, 50]]]};
try {
  process.chdir(fixture);
  const discovery = path.join(fixture, 'baseline.json');
  fs.writeFileSync(discovery, JSON.stringify({host: 'https://example.invalid', vectorLayers: [{id: 1, fromYear: 1992, toYear: 2020}]}));
  process.env.RUNIVERS_DISCOVERY_FILE = discovery;
  let requestedGeojson = false;
  globalThis.fetch = async input => {
    const url = new URL(input);
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
  console.log('Runivers JSON fallback passed with MVT unavailable and an explicit GeoJSON geometry request.');
} finally {
  globalThis.fetch = originalFetch;
  process.chdir(cwd);
  if (previousDiscovery === undefined) delete process.env.RUNIVERS_DISCOVERY_FILE;
  else process.env.RUNIVERS_DISCOVERY_FILE = previousDiscovery;
  fs.rmSync(fixture, {recursive: true, force: true});
}

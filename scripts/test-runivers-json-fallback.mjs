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
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => ({id, fromYear: 1992, toYear: 2020}))}));
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
  let requestedMalformedSourceRecovery = false;
  let requestedForeignHostRecovery = false;
  let requestedWrongResourceRecovery = false;
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
    if (url.pathname === '/api/resource/7/feature/') {
      requestedMalformedSourceRecovery = true;
      return Response.json([
        {id: 701, geom: geometry, fields: {name: 'Россия', cat: 767}},
        {id: 702, geom: {type: 'Point', coordinates: [37, 55]},
          fields: {name: 'auxiliary label', cat: 912}},
        {id: 703, geom: adjacent, fields: {name: 'Ногайская Орда', cat: 913}},
      ]);
    }
    if (url.pathname === '/api/resource/8/feature/') {
      requestedForeignHostRecovery = true;
      return Response.json([
        {id: 801, geom: {type: 'GeometryCollection', geometries: [
          {type: 'Point', coordinates: [37, 55]}, geometry]},
          fields: {name: 'Россия', cat: 767}},
        {id: 802, geom: {type: 'LineString', coordinates: [[34, 55], [35, 55]]},
          fields: {name: 'auxiliary line', cat: 914}},
      ]);
    }
    if (url.pathname === '/api/resource/9/feature/') {
      requestedWrongResourceRecovery = true;
      return Response.json([{id: 901, geom: geometry, fields: {name: 'Россия', cat: 767}}]);
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
  // A previous run may leave a nonempty cache with invalid or partial
  // geometry. The source identity alone must not make it trustworthy.
  const staleCachePath = path.join(fixture, 'tmp/runivers-regression/reference-cache/1.geojson');
  fs.mkdirSync(path.dirname(staleCachePath), {recursive: true});
  fs.writeFileSync(staleCachePath, JSON.stringify({
    type: 'FeatureCollection',
    referenceCacheProvenance: {host: 'https://example.invalid', resourceId: 1},
    referenceSourceFeatures: [feature(geometry)],
    features: [feature({type: 'Polygon', coordinates: [
      [[4000000, 7000000], [4001000, 7000000], [4001000, 7001000],
        [4000000, 7001000], [4000000, 7000000]],
    ]})],
  }));
  // A stale cache can have a valid merged border but an unclosed hole in
  // an original named polity polygon. Source scoping would later consume that
  // malformed original feature, bypassing the merged-border validation.
  const staleSourceCachePath = path.join(fixture, 'tmp/runivers-regression/reference-cache/7.geojson');
  const malformedSourcePolygon = {type: 'Polygon', coordinates: [
    geometry.coordinates[0],
    [[30.2, 50.2], [30.4, 50.2], [30.4, 50.4], [30.2, 50.4]],
  ]};
  fs.writeFileSync(staleSourceCachePath, JSON.stringify({
    type: 'FeatureCollection',
    referenceCacheProvenance: {host: 'https://example.invalid', resourceId: 7},
    features: [feature(geometry)],
    referenceSourceFeatures: [{
      type: 'Feature', id: 799, geometry: malformedSourcePolygon,
      properties: {name: 'Россия', cat: 767},
    }],
  }));
  // A geometrically valid cache is still untrustworthy when its source
  // server or numeric resource ID differs from the active discovery.
  // Neither case may silently replace an independent dated reference.
  const cacheDir = path.join(fixture, 'tmp/runivers-regression/reference-cache');
  for (const [id, provenance] of [
    [8, {host: 'https://different.invalid', resourceId: 8}],
    [9, {host: 'https://example.invalid', resourceId: 999}],
  ]) {
    fs.writeFileSync(path.join(cacheDir, `${id}.geojson`), JSON.stringify({
      type: 'FeatureCollection',
      referenceCacheProvenance: provenance,
      features: [feature(geometry)],
      referenceSourceFeatures: [{...feature(geometry), id: 899}],
    }));
  }
  await import('./runivers-fetch-cache.mjs');
  const response = await fetch('https://example.invalid/api/resource/1/geojson');
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(requestedGeojson, true, 'NextGIS otherwise defaults to WKT');
  const data = await response.json();
  assert.equal(data.features.length, 1);
  assert.deepEqual(data.referenceCacheProvenance,
    {host: 'https://example.invalid', resourceId: 1},
    'newly fetched reference must retain its host and resource provenance');
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
  // Mixed polygon + point/line exports must retain all original source
  // records, but compare only actual polygon borders. Nested collections
  // must contribute their polygons without turning point labels into borders.
  for (const id of [7, 8]) {
    const response = await fetch(`https://example.invalid/api/resource/${id}/geojson`);
    assert.equal(response.status, 200, await response.clone().text());
    const mixed = await response.json();
    assert.equal(mixed.features.length, 1, 'mixed geometry must dissolve to one polygon boundary');
    assert.equal(mixed.features[0].geometry.type, 'MultiPolygon');
    assert.deepEqual(mixed.referenceSourceFeatures.map(f => f.id),
      id === 7 ? [701, 702, 703] : [801, 802],
      'original source records, including auxiliary features, must survive JSON fallback');
    const scopedMixed = referenceForPolity(mixed, 'russian-tsardom');
    assert.deepEqual(scopedMixed.scope.selectedSourceRecords.map(record => record.featureId),
      [id === 7 ? 701 : 801], 'only named Russian features may define the scoped border');
    assert.deepEqual(scopedMixed.payload.features[0].geometry.coordinates, [geometry.coordinates],
      'scoped border must match the Russian polygon, not the adjacent polity or annotations');
  }
  assert.equal(requestedMalformedSourceRecovery, true,
    'a valid cached merged border must not hide an invalid original source ring');
  assert.equal(requestedForeignHostRecovery, true,
    'valid polygons cached from another NextGIS host must be fetched again');
  assert.equal(requestedWrongResourceRecovery, true,
    'valid polygons tagged with another resource ID must be fetched again');
  const corrected = await fetch('https://example.invalid/api/resource/9/geojson');
  assert.equal(corrected.status, 200);
  const correctedPayload = await corrected.json();
  assert.deepEqual(correctedPayload.referenceSourceFeatures.map(f => f.id), [901],
    'stale foreign-resource source identities must not survive cache refresh');
  for (const id of [3, 4, 5]) {
    const response = await fetch(`https://example.invalid/api/resource/${id}/geojson`);
    assert.equal(response.status, 200, await response.clone().text());
    assert.ok(requestedRecovery.has(id),
      `resource ${id}: invalid/point-only first export must trigger the next WGS84 endpoint`);
    const recovered = await response.json();
    assert.equal(recovered.referenceSourceFeatures.length, 1);
    assert.deepEqual(recovered.referenceSourceFeatures[0].geometry, geometry);
  }
  console.log('Runivers fallbacks passed: empty and zero-area MVT alternatives, complete WGS84 coordinate scan, source-host/resource cache binding, stale malformed source-ring refresh, nested projected features, mixed-source scoping and point-only JSON recovery.');
} finally {
  globalThis.fetch = originalFetch;
  process.chdir(cwd);
  if (previousDiscovery === undefined) delete process.env.RUNIVERS_DISCOVERY_FILE;
  else process.env.RUNIVERS_DISCOVERY_FILE = previousDiscovery;
  fs.rmSync(fixture, {recursive: true, force: true});
}

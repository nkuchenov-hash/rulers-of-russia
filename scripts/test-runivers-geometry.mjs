import assert from 'node:assert/strict';
import {samplePayload, buildCoastIndex, buildPointIndex, distanceToIndex, comparePoliticalGeometry, requireComparablePoliticalGeometry, politicalBorderSamples, prepareScopedReference, layerContainsYear, requireUsableReferenceGeometry, fetchRuniversGeoJson, historyStates, indexStateCoverageByMonth} from './validate-runivers-regression.mjs';

// A global stride must not skip a small disconnected island or enclave just
// because the preceding continental ring has thousands of candidates.
const largeComponent = {type: 'Feature', geometry: {type: 'Polygon', coordinates: [[
  [0,0],[30,0],[30,1],[0,1],[0,0],
]]}, properties: {}};
const tinyComponent = {type: 'Feature', geometry: {type: 'Polygon', coordinates: [[
  [70,0],[70.01,0],[70.01,.01],[70,.01],[70,0],
]]}, properties: {}};
const disconnected = {type: 'FeatureCollection', features: [largeComponent, tinyComponent]};
const sparseSamples = samplePayload(disconnected, 1000, 5);
assert.ok(sparseSamples.length <= 5, 'sample cap must still be respected');
assert.ok(sparseSamples.some(([lon]) => lon < 31), 'mainland ring must be sampled');
assert.ok(sparseSamples.some(([lon]) => lon >= 70), 'small disconnected ring must never be dropped');
assert.throws(() => samplePayload(disconnected, 1000, 1), /Cannot sample all 2 boundary rings/,
  'when even one sample per ring is impossible, the geographic audit must fail closed');
console.log('Runivers component sampling tests passed: disconnected borders survive capped sampling.');

const coast = buildCoastIndex();
// This is a physical coastline, not the edges of individual political states.
assert.ok(distanceToIndex([37.62, 55.75], coast.index) > 100000, 'Moscow must be inland');
assert.ok(distanceToIndex([131.89, 43.12], coast.index) < 100000, 'Vladivostok must be coastal');
assert.ok(distanceToIndex([158.65, 53.04], coast.index) < 100000, 'Kamchatka must be present');
assert.ok(distanceToIndex([54.713, 41.164], coast.index) < 100000, 'Caspian physical lake shore must be excluded too');
assert.ok(distanceToIndex([109.10588, 53.93523], coast.index) < 100000, 'Baikal shores must not become international borders');
const points = [[40, 50], [41, 50], [42, 50]];
const same = comparePoliticalGeometry({points, allCount: 3}, {points, allCount: 3}, {hasPolygon: true, types: ['Polygon']});
assert.equal(same.symmetricMaxMeters, 0);
// A valid Runivers polygon does not imply a usable bilateral comparison.
// In a multi-layer shard, silently skipping a coast-masked History Core state
// could allow other layers to hide this missing geographic evidence.
assert.throws(() => requireComparablePoliticalGeometry(
  {points: [[40, 50]], allCount: 1},
  {points: [], allCount: 0},
  {hasPolygon: true, types: ['Polygon']},
), /No bilateral political-border comparison: 1 Runivers inland samples and 0 History Core inland samples/);
assert.throws(() => requireComparablePoliticalGeometry(
  {points: [], allCount: 0},
  {points: [[40, 50]], allCount: 1},
  {hasPolygon: true, types: ['Polygon']},
), /No bilateral political-border comparison: 0 Runivers inland samples and 1 History Core inland samples/);
assert.equal(requireComparablePoliticalGeometry(
  {points, allCount: 3}, {points, allCount: 3},
  {hasPolygon: true, types: ['Polygon']},
).symmetricMaxMeters, 0, 'complete bilateral sampling must still pass');
const extra = [...points, [60, 50]];
const mismatch = comparePoliticalGeometry({points, allCount: 3}, {points: extra, allCount: 4}, {hasPolygon: true, types: ['Polygon']});
assert.ok(mismatch.currentToReferenceMaxMeters > 1000000, 'extra distant boundaries must still fail');
assert.deepEqual(mismatch.worstCurrentSamples[0].lonLat, [60, 50]);
assert.equal(layerContainsYear({fromYear: 1992, toYear: 2004}, 2004, 2020), false);
assert.equal(layerContainsYear({fromYear: 2014, toYear: 2020}, 2020, 2020), true);
console.log('Runivers geometry tests passed: physical coast, symmetric mismatch, diagnostic locations, half-open and terminal years.');

const {referenceForPolity} = await import('./runivers-reference-scope.mjs');
const feature = (name, x) => ({type:'Feature',properties:{name},geometry:{type:'Polygon',coordinates:[[[x,50],[x+1,50],[x+1,51],[x,51],[x,50]]]}});
const source = {type:'FeatureCollection',referenceSourceFeatures:[feature('Московское княжество',30),feature('Тверское княжество',31)],features:[]};
const scoped = referenceForPolity(source,'grand-moscow');
assert.equal(scoped.scope.selectedFeatures,1);
assert.deepEqual(scoped.scope.excludedNames,['Тверское княжество']);
assert.deepEqual(scoped.payload.features[0].geometry.coordinates, [source.referenceSourceFeatures[0].geometry.coordinates]);
assert.throws(()=>referenceForPolity({features:[]},'grand-moscow'),/original named/);
assert.throws(()=>referenceForPolity({...source,referenceSourceFeatures:[feature('Тверское княжество',31)]},'grand-moscow'),/no named Moscow/);
// Runivers's Tsardom-era layers may include independent khanates and other
// polities. Comparing the entire layer would invent sovereign territory.
const tsardomSource = {type:'FeatureCollection',referenceSourceFeatures:[
  feature('Россия',30), feature('Казанское ханство',31),
  feature('Ногайская Орда',32), feature('Русское царство',33),
],features:[feature('union-of-all-polities',40)]};
const tsardomScope = referenceForPolity(tsardomSource,'russian-tsardom');
assert.equal(tsardomScope.scope.kind,'named-polity');
assert.equal(tsardomScope.scope.selectedFeatures,2);
assert.deepEqual(tsardomScope.scope.selectedNames,['Россия','Русское царство']);
assert.deepEqual(tsardomScope.scope.excludedNames,['Казанское ханство','Ногайская Орда']);
const sourceRecord = feature('Россия',30);
sourceRecord.id = 777;
sourceRecord.properties = {...sourceRecord.properties,cat:767,lwdate:'1557-01-01',status:6};
const provenanceScope = referenceForPolity({referenceSourceFeatures:[sourceRecord]},'russian-tsardom');
assert.deepEqual(provenanceScope.scope.selectedSourceRecords,[
  {featureId:777,cat:767,name:'Россия',lwdate:'1557-01-01',status:6},
], 'each selected contour must retain its original dated source identity');
assert.deepEqual(tsardomScope.payload.features[0].geometry.coordinates,
  [tsardomSource.referenceSourceFeatures[0].geometry.coordinates,
    tsardomSource.referenceSourceFeatures[3].geometry.coordinates]);
// Nested GeometryCollections are accepted by the Runivers geometry validator.
// Scoping must retain their polygons, while ignoring points and other polities.
const nestedRussian = {type:'Feature',id:901,properties:{name:'Россия',cat:767},
  geometry:{type:'GeometryCollection',geometries:[
    {type:'Point',coordinates:[37,55]},
    {type:'GeometryCollection',geometries:[feature('nested-Russia',36).geometry]},
  ]}};
const nestedPolityScope = referenceForPolity({referenceSourceFeatures:[
  nestedRussian,feature('Казанское ханство',42),
]},'russian-tsardom');
assert.equal(nestedPolityScope.scope.selectedFeatures,1);
assert.deepEqual(nestedPolityScope.scope.excludedNames,['Казанское ханство']);
assert.deepEqual(nestedPolityScope.scope.selectedSourceRecords.map(f => [f.featureId,f.cat,f.name]),
  [[901,767,'Россия']]);
assert.deepEqual(nestedPolityScope.payload.features[0].geometry.coordinates,
  [feature('nested-Russia',36).geometry.coordinates],
  'nested Russian polygon must survive named-polity scoping');
assert.throws(()=>referenceForPolity({referenceSourceFeatures:[{
  ...nestedRussian,geometry:{type:'GeometryCollection',geometries:[{type:'Point',coordinates:[37,55]}]},
}]},'russian-tsardom'),/contains no polygon geometry/,
  'a point-only named feature must not masquerade as a national boundary');
assert.throws(()=>referenceForPolity({features:[feature('Россия',30)]},'russian-tsardom'),/original named/);
assert.throws(()=>referenceForPolity({referenceSourceFeatures:[feature('Казанское ханство',31)]},'russian-tsardom'),/no named Tsardom/);
const soviet = feature('СССР', 50); soviet.properties.status = 1;
const occupation = feature('Советская зона оккупации Германии', 51); occupation.properties.status = 2;
const lease = feature('Аренда Россией района Порккала', 52); lease.properties.status = 3;
const inheritedMainland = feature('Россия', 53); inheritedMainland.properties.status = 6;
const sovietScope = referenceForPolity({referenceSourceFeatures:[soviet, inheritedMainland, occupation, lease]}, 'ussr');
assert.equal(sovietScope.scope.selectedFeatures, 2);
assert.deepEqual(sovietScope.scope.excludedNames, [occupation.properties.name, lease.properties.name]);
assert.throws(() => referenceForPolity({referenceSourceFeatures:[occupation]}, 'ussr'), /no named USSR/);
assert.equal(referenceForPolity(source,'russian-empire').payload,source);
console.log('Runivers scope tests passed: independent polities remain separate, missing identity fails closed.');

// A surrounding independent polity can hide the target's entire border when
// the unscoped polygons are dissolved first. The whole-layer outer border is
// masked as coast in this synthetic fixture, but the named Russian-state
// border is inland and must still be compared.
const rectangle = (name, min, max) => ({type:'Feature',properties:{name},
  geometry:{type:'Polygon',coordinates:[[[min,min],[max,min],[max,max],[min,max],[min,min]]]}});
const syntheticCoastPoints = [];
for (let n = 0; n <= 40; n += 1) {
  const p = n / 4;
  syntheticCoastPoints.push([p,0],[p,10],[0,p],[10,p]);
}
const syntheticCoastIndex = buildPointIndex(syntheticCoastPoints);
const nestedPolities = {referenceSourceFeatures:[
  rectangle('Россия',4,6), rectangle('Ногайская Орда',0,10),
]};
const wholePolities = {type:'FeatureCollection',features:nestedPolities.referenceSourceFeatures};
assert.equal(politicalBorderSamples(wholePolities,syntheticCoastIndex).points.length,0,
  'dissolving the entire layer erases the target border behind the surrounding polity');
const scopedInland = prepareScopedReference(nestedPolities,'russian-tsardom',syntheticCoastIndex);
assert.equal(scopedInland.scope.selectedFeatures,1);
assert.ok(scopedInland.samples.points.length >= 20,
  'named Russian border must remain available even when the whole-layer border is coast-masked');
assert.throws(()=>prepareScopedReference({referenceSourceFeatures:[
  rectangle('Ногайская Орда',0,10)]},'russian-tsardom',syntheticCoastIndex),/no named Tsardom/);
console.log('Runivers pre-scope coast-mask regression passed: independent surrounding polity cannot hide Russian inland border.');


// A corresponding target point just inside the coast cutoff must remain a
// distance target, even though it is not itself a measured inland sample.
const cutoffMetric = comparePoliticalGeometry(
  {points:[[40,50]],allPoints:[[40,50],[41,50]],allCount:2},
  {points:[[41,50]],allPoints:[[40,50],[41,50]],allCount:2},
  {hasPolygon:true,types:['Polygon']});
assert.equal(cutoffMetric.symmetricMaxMeters,0);
const outer = feature('state', 40);
const inner = {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[40.2,50.2],[40.3,50.2],[40.3,50.3],[40.2,50.3],[40.2,50.2]]]}};
const alone = politicalBorderSamples(outer, coast.index);
const nested = politicalBorderSamples({type:'FeatureCollection',features:[outer,inner]},coast.index);
assert.deepEqual(nested,alone,'Interior components cannot add an exterior sovereign border');
const unrelatedAnnotation = {type:'Feature',properties:{name:'label/road'},
  geometry:{type:'LineString',coordinates:[[80,50],[81,50]]}};
const mixedWithAnnotation = politicalBorderSamples(
  {type:'FeatureCollection',features:[outer,unrelatedAnnotation]},coast.index);
assert.deepEqual(mixedWithAnnotation,alone,
  'an auxiliary line in a polygon layer must not become a sovereign border');
const lineOnlySamples = politicalBorderSamples({type:'FeatureCollection',features:[unrelatedAnnotation]},coast.index);
assert.equal(lineOnlySamples.points.length,0,
  'a line-only layer must never supply certifiable territorial exterior samples');

const addition = feature('', 54); addition.properties = {cat:578,status:6,lwdate:'1924-10-27'};
const cession = feature('', 55); cession.properties = {cat:712,status:7,lwdate:'1945-08-16'};
const transitional = referenceForPolity({referenceSourceFeatures:[soviet,addition,cession]}, 'ussr');
assert.equal(transitional.scope.selectedFeatures,2,'Identified unnamed addition is retained, cession is not');
assert.equal(referenceForPolity({referenceSourceFeatures:[soviet,{...addition,properties:{...addition.properties,lwdate:'1900-01-01'}}]},'ussr').scope.selectedFeatures,1,'Addition identity must match its date');


// HTTP 200 may contain an empty or point-only export. Such references must
// remain visible as failed exports, never silently disappear from the audit.
assert.throws(() => requireUsableReferenceGeometry({type:'FeatureCollection',features:[]}, 5383), /resource 5383.*no usable.*types: none/);
assert.throws(() => requireUsableReferenceGeometry({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[37,55]},properties:{}}]}, 5385), /resource 5385.*types: Point/);
assert.equal(requireUsableReferenceGeometry({type:'FeatureCollection',features:[feature('Moscow',30)]}, 5387).hasPolygon,true);
const boundaryLineOnly = {type:'FeatureCollection',features:[{type:'Feature',properties:{},
  geometry:{type:'LineString',coordinates:[[30,50],[31,50]]}}]};
assert.throws(() => requireUsableReferenceGeometry(boundaryLineOnly,5389), /line-only reference/,
  'a valid line cannot certify an entire sovereign polygon');
assert.equal(comparePoliticalGeometry({points:[[30,50]],allPoints:[[30,50]]},
  {points:[[30,50]],allPoints:[[30,50]]},{hasPolygon:false}).usable,false,
  'the comparison API must not allow a line-only reference to pass');
console.log('Runivers empty/unsupported and line-only reference exports fail closed.');

// A declared polygon/line with no actual geographic border must not suppress
// the alternative WGS84 export. Nested valid polygons remain usable.
const collection = {type:'FeatureCollection',features:[{type:'Feature',properties:{},
  geometry:{type:'GeometryCollection',geometries:[{type:'Point',coordinates:[37,55]},
    feature('nested',30).geometry]}}]};
const nestedClass = requireUsableReferenceGeometry(collection,5390);
assert.equal(nestedClass.hasPolygon,true);
assert.ok(nestedClass.types.includes('GeometryCollection') && nestedClass.types.includes('Polygon'));
const emptyPolygon = {type:'FeatureCollection',features:[{type:'Feature',properties:{},
  geometry:{type:'Polygon',coordinates:[]}}]};
const collapsedLine = {type:'FeatureCollection',features:[{type:'Feature',properties:{},
  geometry:{type:'LineString',coordinates:[[37,55],[37,55]]}}]};
const projectedPolygon = {type:'FeatureCollection',features:[{type:'Feature',properties:{},
  geometry:{type:'Polygon',coordinates:[[[4000000,7000000],[4001000,7000000],
    [4001000,7001000],[4000000,7001000],[4000000,7000000]]]}}]};
const collinearPolygon = {type:'FeatureCollection',features:[{type:'Feature',properties:{},
  geometry:{type:'Polygon',coordinates:[[[30,50],[31,50],[32,50],[30,50]]]}}]};
for (const [label, payload] of Object.entries({emptyPolygon,collapsedLine,projectedPolygon,collinearPolygon})) {
  assert.throws(() => requireUsableReferenceGeometry(payload,5391), /no usable polygon or line geometry/,
    label + ' must not be accepted on type label alone');
}
console.log('Runivers coordinate validity tests passed: nested GeometryCollection, empty/collapsed, projected and collinear borders.');

// One sound outer ring does not make malformed holes or a second broken
// polygon safe to dissolve. These must fail closed before the distance metric.
const malformedHole = {type:'FeatureCollection',features:[{type:'Feature',properties:{},
  geometry:{type:'Polygon',coordinates:[feature('Россия',30).geometry.coordinates[0],
    [[30.2,50.2],[30.4,50.2],[30.4,50.4]]]} // unclosed interior ring
}]};
const mixedBrokenPolygon = {type:'FeatureCollection',features:[
  feature('Россия',30),
  {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[]}},
]};
const brokenMultiPolygon = {type:'FeatureCollection',features:[{type:'Feature',properties:{},
  geometry:{type:'MultiPolygon',coordinates:[feature('Россия',30).geometry.coordinates, []]}}]};
for (const [label, payload] of Object.entries({malformedHole,mixedBrokenPolygon,brokenMultiPolygon})) {
  assert.throws(() => requireUsableReferenceGeometry(payload,5392), /malformed polygon rings|no usable polygon or line geometry/,
    label + ' must not pass because another ring or feature is valid');
}
console.log('Runivers malformed-ring regression passed: invalid holes and mixed polygon parts cannot certify borders.');





// The same file can reappear after a different state, a missing month, or a
// change in historical certification. These must remain distinct comparisons.
const testMonth = (month, geometryFile, polityId = 'ussr', certificationId = 'cert-1') =>
  ({month, geometryFile, polityId, certificationId, status: 'geometry-verified'});
const recurring = historyStates({months: [
  testMonth('1991-11','A.geojson'), testMonth('1991-12','A.geojson'),
  testMonth('1992-01','A.geojson'), testMonth('1992-02','B.geojson'),
  testMonth('1992-03','A.geojson'), testMonth('1992-04','A.geojson'),
  testMonth('1992-06','A.geojson'), testMonth('1992-07','A.geojson','ussr','cert-2'),
  testMonth('1992-08','A.geojson','russian-empire','cert-2'),
]});
assert.deepEqual(recurring.map(s => [s.firstMonth, s.lastMonth]), [
  ['1991-11','1992-01'], ['1992-02','1992-02'], ['1992-03','1992-04'],
  ['1992-06','1992-06'], ['1992-07','1992-07'], ['1992-08','1992-08'],
]);
assert.equal(new Set(recurring.map(s => s.key)).size, recurring.length, 'each historical interval needs a unique comparison key');
const byMonth = indexStateCoverageByMonth(recurring);
assert.equal(byMonth.get('1992-01').firstMonth,'1991-11');
assert.equal(byMonth.get('1992-03').firstMonth,'1992-03','a reused geometry must not inherit an earlier comparison');
assert.equal(byMonth.get('1992-05'),undefined,'missing months must not be treated as covered');
assert.throws(() => indexStateCoverageByMonth([recurring[0], recurring[0]]), /Overlapping Runivers history states/);
for (const [field, value] of [
  ['track', 'different-track'],
  ['territorialModel', 'different-model'],
  ['uncertaintyGeometryFile', 'uncertainty.geojson'],
  ['confidence', 'reconstruction'],
  ['evidenceDocumentIds', ['new-document']],
  ['derivedFromChangeIds', ['new-event']],
]) {
  const months = [testMonth('1992-01','A.geojson'),testMonth('1992-02','A.geojson')];
  months[1][field] = value;
  assert.equal(historyStates({months}).length,2,
    `${field}: source or interpretation change must split history state coverage`);
}
console.log('Runivers temporal-state tests passed: year rollover, repeated geometry, missing months, provenance changes, certification and polity changes, no coverage aliasing.');


// Regression: NextGIS may return HTTP 200 with an empty or point-only
// GeoJSON export while its WGS84 feature endpoint still has usable borders.
// The first successful HTTP status must never suppress the second endpoint.
const originalReferenceFetch = globalThis.fetch;
const validReference = {type:'FeatureCollection',features:[feature('Россия',30)]};
const emptyReference = {type:'FeatureCollection',features:[]};
const pointReference = {type:'FeatureCollection',features:[
  {type:'Feature',geometry:{type:'Point',coordinates:[37,55]},properties:{name:'Россия'}},
]};
try {
  for (const unusable of [emptyReference, pointReference, emptyPolygon, collapsedLine, projectedPolygon, collinearPolygon, malformedHole, mixedBrokenPolygon, brokenMultiPolygon]) {
    const requested = [];
    globalThis.fetch = async input => {
      const pathname = new URL(input).pathname;
      requested.push(pathname);
      return Response.json(pathname.endsWith('/geojson') ? unusable : validReference);
    };
    const recovered = await fetchRuniversGeoJson('https://runivers.invalid',5383);
    assert.deepEqual(recovered,validReference);
    assert.deepEqual(requested, ['/api/resource/5383/geojson','/api/resource/5383/feature/'],
      'HTTP 200 without a usable border must fall back to the WGS84 feature endpoint');
  }
  const requested = [];
  globalThis.fetch = async input => {
    requested.push(new URL(input).pathname);
    return Response.json(emptyReference);
  };
  await assert.rejects(
    fetchRuniversGeoJson('https://runivers.invalid',5383),
    error => error.message.includes('/geojson:') && error.message.includes('/feature/?srs=4326')
      && error.message.includes('no usable polygon or line geometry'),
    'two unusable HTTP 200 responses must produce an explicit reference failure');
  assert.equal(requested.length,2,'both JSON transports must be checked before declaring a reference failure');
} finally {
  globalThis.fetch = originalReferenceFetch;
}
console.log('Runivers JSON fallback regression passed: empty/point-only HTTP 200 cannot hide an alternate reference.');


// Research diagnostics for issue #326: identify which ORIGINAL Runivers
// source records contain a failed contour hotspot. These are not geographic
// passes, legal sovereignty tests, or a replacement for licensed cartography.
const {geojsonLocation, diagnoseEarlyRussiaHotspots} = await import('./runivers-hotspot-diagnostics.mjs');
const diagnosticPolygon = (name, id, left, bottom, right, top) => ({
  type: 'Feature', id, properties: {name, cat: 767, lwdate: '1553-01-01', status: 6},
  geometry: {type: 'Polygon', coordinates: [[
    [left,bottom],[right,bottom],[right,top],[left,top],[left,bottom],
  ]]},
});
const diagnosticSelected = diagnosticPolygon('Россия', 7701, 40, 53, 42, 55);
const diagnosticExcluded = diagnosticPolygon('Ногайская Орда', 7702, 40.5, 53, 41, 55);
const diagnosticHistory = {type: 'FeatureCollection', features: [
  diagnosticPolygon('History Core', 7703, 39.5, 53, 40.9, 55),
]};
const diagnosticScope = referenceForPolity({
  referenceSourceFeatures: [diagnosticSelected, diagnosticExcluded],
}, 'russian-tsardom');
assert.equal(diagnosticScope.sourceFeatures.selected.length, 1);
assert.equal(diagnosticScope.sourceFeatures.excluded.length, 1);
const hotspotDiagnostics = diagnoseEarlyRussiaHotspots({
  year: 1553, referencePayload: diagnosticScope.payload,
  historyPayload: diagnosticHistory,
  selectedSourceFeatures: diagnosticScope.sourceFeatures.selected,
  excludedSourceFeatures: diagnosticScope.sourceFeatures.excluded,
});
assert.equal(hotspotDiagnostics.length, 1);
assert.equal(hotspotDiagnostics[0].clusterId, 'central-1553-1556');
assert.equal(hotspotDiagnostics[0].diagnosticOnly, true);
assert.equal(hotspotDiagnostics[0].probes[0].scopedReferenceLocation, 'inside');
assert.equal(hotspotDiagnostics[0].probes[0].historyLocation, 'inside');
assert.equal(hotspotDiagnostics[0].probes[1].scopedReferenceLocation, 'inside');
assert.equal(hotspotDiagnostics[0].probes[1].historyLocation, 'outside',
  'a 0.25-degree east probe must expose the synthetic border discrepancy');
assert.deepEqual(hotspotDiagnostics[0].selectedSourceRecordsAtCenter.map(row => row.featureId), [7701]);
assert.deepEqual(hotspotDiagnostics[0].excludedSourceRecordsAtCenter.map(row => row.featureId), [7702]);
assert.ok(!JSON.stringify(hotspotDiagnostics).includes('"coordinates"'),
  'the report must contain source identifiers and point probes, never original source geometry');
assert.deepEqual(diagnoseEarlyRussiaHotspots({
  year: 1600, referencePayload: diagnosticScope.payload, historyPayload: diagnosticHistory,
}), [], 'fixed early-Russia hotspots must not be projected into unrelated epochs');
const donut = {type: 'Polygon', coordinates: [
  [[40,53],[42,53],[42,55],[40,55],[40,53]],
  [[40.5,53.25],[41,53.25],[41,54],[40.5,54],[40.5,53.25]],
]};
assert.equal(geojsonLocation([40.75,53.5], donut), 'outside', 'polygon holes must remain outside');
assert.equal(geojsonLocation([40,54], donut), 'boundary', 'exact contour probes are ambiguous');
assert.equal(geojsonLocation([41.5,54], donut), 'inside');
assert.equal(geojsonLocation([179,15], {type:'Polygon',coordinates:[
  [[170,10],[-170,10],[-170,20],[170,20],[170,10]],
]}), 'inside', 'antimeridian crossing must not become a world-spanning polygon');
assert.equal(geojsonLocation([0,15], {type:'Polygon',coordinates:[
  [[170,10],[-170,10],[-170,20],[170,20],[170,10]],
]}), 'outside');
assert.equal(geojsonLocation([41.5,54], {type:'GeometryCollection',geometries:[
  {type:'Point',coordinates:[40,53]},donut,
]}), 'inside', 'nested geometry must retain polygon containment');

assert.equal(geojsonLocation([41.5,54], {type:'FeatureCollection',features:[]}), 'unavailable',
  'an empty independent reference must not be reported as outside');
assert.equal(geojsonLocation([41.5,54], {type:'MultiPolygon',coordinates:[]}), 'unavailable',
  'an empty multipolygon must not imply absence of sovereignty');
assert.equal(geojsonLocation([41.5,54], {type:'GeometryCollection',geometries:[]}), 'unavailable');
assert.equal(geojsonLocation([41.5,54], {type:'FeatureCollection',features:[
  diagnosticSelected, {type:'Feature',geometry:null,properties:{}},
]}), 'unavailable', 'a valid feature cannot conceal an unusable sibling');
assert.equal(geojsonLocation([41.5,54], {type:'Polygon',coordinates:[
  [[40,53],[42,53],[42,55],[40,55]],
]}), 'unavailable', 'unclosed polygon rings cannot establish a territory');
assert.equal(geojsonLocation([41.5,54], {type:'Polygon',coordinates:[
  [[4000000,7000000],[4001000,7000000],[4001000,7001000],[4000000,7000000]],
]}), 'unavailable', 'projected metres must not be treated as WGS84');
assert.equal(geojsonLocation([41.5,54], {type:'Polygon',coordinates:[
  [[40,53],[41,53],[42,53],[40,53]],
]}), 'unavailable', 'collinear rings cannot establish sovereign area');
assert.equal(geojsonLocation([NaN,54], donut), 'unavailable', 'invalid probe coordinates are not outside');

// A malformed interior ring invalidates the entire source polygon, not only
// probes that happen to fall inside the outer ring. A second malformed hole
// must not be hidden by an earlier valid hole containing the probe.
const brokenHole = [[40.2,53.2],[40.4,53.2],[40.4,53.4]];
const brokenDonut = {type:'Polygon',coordinates:[
  [[40,53],[42,53],[42,55],[40,55],[40,53]], brokenHole,
]};
assert.equal(geojsonLocation([45,54], brokenDonut), 'unavailable',
  'outside an otherwise valid exterior cannot hide an invalid hole');
assert.equal(geojsonLocation([41.5,54], brokenDonut), 'unavailable',
  'inside an exterior cannot hide an invalid hole');
const brokenSecondHole = {type:'Polygon',coordinates:[
  [[40,53],[42,53],[42,55],[40,55],[40,53]],
  [[40.5,53.25],[41,53.25],[41,54],[40.5,54],[40.5,53.25]],
  brokenHole,
]};
assert.equal(geojsonLocation([40.75,53.5], brokenSecondHole), 'unavailable',
  'an earlier valid hole containing the probe cannot hide a later malformed hole');
assert.equal(geojsonLocation([45,54], donut), 'outside',
  'valid polygon holes still allow a definitive exterior result');
assert.equal(geojsonLocation([45,54], {type:'MultiPolygon',coordinates:[
  donut.coordinates,brokenDonut.coordinates,
]}), 'unavailable', 'an invalid sibling polygon cannot hide behind a valid exterior');

assert.equal(geojsonLocation([41.5,54], {type:'UnrecognizedPolygon',coordinates:donut.coordinates}),
  'unavailable', 'unknown geometry types must not be reported as sovereign absence');
assert.equal(geojsonLocation([41.5,54], {type:'MultiPolygon',coordinates:{invalid:true}}),
  'unavailable', 'malformed multipolygon coordinates must not crash diagnostics');
assert.equal(geojsonLocation([41.5,54], {type:'GeometryCollection',geometries:{invalid:true}}),
  'unavailable', 'malformed geometry collections must not crash diagnostics');
assert.equal(geojsonLocation([41.5,54], {type:'FeatureCollection',features:{invalid:true}}),
  'unavailable', 'malformed feature collections must not crash diagnostics');
assert.equal(geojsonLocation([41.5,54], {type:'FeatureCollection',features:[null]}),
  'unavailable', 'null source features must fail closed');
assert.equal(geojsonLocation([41.5,54], {type:'Point',coordinates:[41.5,54]}),
  'outside', 'valid non-area source features still cannot establish territory');



console.log('Runivers hotspot attribution tests passed: five dated clusters, named/excluded source IDs, offset probes, holes, boundaries, antimeridian, no licensed geometry export.');


// Fixed hotspots can become stale after source-scope corrections. Attribute
// both actual worst-distance directions, with bounded source IDs and no source
// geometry in the report. An excluded feature overlapping the selected one
// must remain visible as an investigation lead, not silently be called Russian.
const {diagnoseFailedBoundarySamples} = await import('./runivers-hotspot-diagnostics.mjs');
const worstAttribution = diagnoseFailedBoundarySamples({
  referenceSamples: [
    {lonLat: [40.75, 54], distanceMeters: 900000},
    {lonLat: [40.25, 54], distanceMeters: 700000},
    {lonLat: [40.5, 54], distanceMeters: 600000},
    {lonLat: [40.9, 54], distanceMeters: 500000},
  ],
  currentSamples: [{lonLat: [39.5, 54], distanceMeters: 400000}],
  referencePayload: diagnosticScope.payload,
  historyPayload: diagnosticHistory,
  selectedSourceFeatures: diagnosticScope.sourceFeatures.selected,
  excludedSourceFeatures: diagnosticScope.sourceFeatures.excluded,
});
assert.equal(worstAttribution.length, 4, 'limit to three actual worst samples in each direction');
assert.deepEqual(worstAttribution.map(row => row.sampledBoundary),
  ['runivers-reference','runivers-reference','runivers-reference','history-core']);
assert.equal(worstAttribution[0].distanceMeters, 900000, 'retain measured distances without changing tolerances');
assert.equal(worstAttribution[0].scopedReferenceLocation, 'inside');
assert.equal(worstAttribution[0].historyLocation, 'inside');
assert.deepEqual(worstAttribution[0].selectedSourceRecords.map(row => row.featureId), [7701]);
assert.deepEqual(worstAttribution[0].excludedSourceRecords.map(row => row.featureId), [7702],
  'overlapping excluded source identities must be retained for scrutiny');
assert.equal(worstAttribution[3].scopedReferenceLocation, 'outside');
assert.equal(worstAttribution[3].historyLocation, 'boundary');
assert.ok(worstAttribution.every(row => row.diagnosticOnly));
assert.ok(!JSON.stringify(worstAttribution).includes('"coordinates"'),
  'do not copy unlicensed reference polygons into diagnostic reports');
assert.deepEqual(diagnoseFailedBoundarySamples({
  referenceSamples: [{lonLat: [NaN, 54], distanceMeters: 1}],
}), [], 'invalid sample coordinates cannot be attributed');

const retainedValidSamples = diagnoseFailedBoundarySamples({
  referenceSamples: [
    {lonLat:[NaN,54],distanceMeters:900000},
    {lonLat:[181,54],distanceMeters:800000},
    {lonLat:[40,54],distanceMeters:-1},
    {lonLat:[40.25,54],distanceMeters:700000},
    {lonLat:[40.5,54],distanceMeters:600000},
    {lonLat:[40.75,54],distanceMeters:500000},
    {lonLat:[41,54],distanceMeters:400000},
  ],
  referencePayload: diagnosticScope.payload,
  historyPayload: diagnosticHistory,
});
assert.deepEqual(retainedValidSamples.map(row => row.lonLat),
  [[40.25,54],[40.5,54],[40.75,54]],
  'invalid leading samples must not suppress three valid worst-distance records');
assert.ok(retainedValidSamples.every(row => row.diagnosticOnly));

console.log('Runivers live worst-sample attribution passed: both directions, overlap, cap, invalid points, no geometry export.');

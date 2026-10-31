import assert from 'node:assert/strict';
import {samplePayload, buildCoastIndex, buildPointIndex, distanceToIndex, comparePoliticalGeometry, requireComparablePoliticalGeometry, politicalBorderSamples, prepareScopedReference, isReferenceApproximate, layerContainsYear, requireUsableReferenceGeometry, fetchRuniversGeoJson, historyStates, indexStateCoverageByMonth, unmatchedReferenceLayers, overrideFor, publicComparisonMetric} from './validate-runivers-regression.mjs';

// A one-month documentary exception must never silently exempt a full
// year (or several years) of failed independent boundary comparisons.
const overrideState = {
  firstMonth: '1599-01', lastMonth: '1603-12', polityId: 'russian-tsardom',
  snapshotId: 'verified-1600', certificationId: 'cert-1600',
};
const overrideLayer = {id: 123, fromYear: 1598, toYear: 1602};
const overrideItem = {
  runiversResourceId: 123, startMonth: '1599-01', endMonth: '1601-12',
  polityId: 'russian-tsardom', snapshotId: 'verified-1600',
  certificationId: 'cert-1600',
};
const findOverride = (item, state = overrideState, layer = overrideLayer, terminal = 2020) =>
  overrideFor({overrides: [item]}, state, layer, terminal);
assert.equal(findOverride(overrideItem), overrideItem,
  'a documentary exception spanning every compared year can be applied');
for (const item of [
  {...overrideItem, startMonth: '1600-01'},
  {...overrideItem, endMonth: '1600-12'},
  {...overrideItem, startMonth: '1599-02'},
  {...overrideItem, endMonth: '1601-11'},
  {...overrideItem, runiversResourceId: 124},
  {...overrideItem, polityId: 'ussr'},
  {...overrideItem, snapshotId: 'another-snapshot'},
  {...overrideItem, certificationId: 'another-certification'},
]) {
  assert.equal(findOverride(item), null,
    'partial-year, partial-range or wrong-identity exception cannot mask a geographic failure');
}
assert.equal(findOverride(overrideItem, {...overrideState, firstMonth: '1602-02', lastMonth: '1603-12'}), null,
  'no fully overlapping year means no eligible override');
const terminalState = {
  firstMonth: '2019-01', lastMonth: '2020-12', polityId: 'russian-federation',
};
const terminalLayer = {id: 999, fromYear: 2019, toYear: 2020};
assert.equal(findOverride({
  runiversResourceId: 999, startMonth: '2019-01', endMonth: '2019-12',
}, terminalState, terminalLayer, 2020), null,
'terminal Runivers year is inclusive and cannot be omitted from exception coverage');
const terminalOverride = {runiversResourceId: 999, startMonth: '2019-01', endMonth: '2020-12'};
assert.equal(findOverride(terminalOverride, terminalState, terminalLayer, 2020), terminalOverride);
const halfOpenOverride = {runiversResourceId: 999, startMonth: '2019-01', endMonth: '2019-12'};
assert.equal(findOverride(halfOpenOverride, terminalState, terminalLayer, 2021), halfOpenOverride,
  'nonterminal layer ending in 2020 covers 2019 only');
console.log('Runivers documentary override scope tests passed: complete year intersections only.');

// Approximation metadata raises the existing Runivers tolerance from the
// year-specific limit to 100 km. A negative flag or a field name alone must
// never silently make a historical contour easier to certify.
const referenceWithMetadata = properties => ({type:'FeatureCollection',features:[
  {type:'Feature',properties,geometry:{type:'Polygon',coordinates:[[[30,50],[31,50],[31,51],[30,51],[30,50]]]}},
]});
for (const properties of [
  {approximate:false}, {reconstructed:false}, {uncertain:0},
  {approximate:'false'}, {approximate:'no'}, {approximate:'0'},
  {description:'not approximate'}, {metadata:{reconstruction:false}},
  {name:'Russia',notes:'surveyed border'},
  // A descriptive NEGATION with trailing explanation is not an affirmative
  // source declaration. The former exact-match check silently raised the
  // geographic tolerance to 100 km for these surveyed contours.
  {description:'not approximate: surveyed boundary'},
  {notes:'surveyed; not approximate according to archive'},
  {description:'non-approximate surveyed map'},
  {description:'no uncertain borders'},
  {description:'не приблизительные границы, точная съёмка'},
  {notes:'не условные границы'},
  {description:'not approximate but reconstructed (conflicting source note)'},
]) {
  assert.equal(isReferenceApproximate(referenceWithMetadata(properties)),false,
    'negative or unrelated Runivers metadata cannot activate 100 km tolerance: '+JSON.stringify(properties));
}
for (const properties of [
  {approximate:true}, {reconstructed:1}, {approximate:'yes'},
  {description:'Approximate historical border'},
  {metadata:{uncertain:true}}, {notes:['modern map','условные границы']},
]) {
  assert.equal(isReferenceApproximate(referenceWithMetadata(properties)),true,
    'affirmative approximation evidence must retain the existing 100 km policy: '+JSON.stringify(properties));
}
// An explicit negative source field must win over an affirmative flag in
// another field of the SAME original feature. Previously .some() accepted
// these contradictory records and silently raised the limit to 100 km.
for (const properties of [
  {approximate: true, notes: 'not approximate: surveyed boundary'},
  {approximate: 'yes', uncertain: false},
  {metadata: {approximate: true}, source: {reconstructed: 'no'}},
  {approximate: true, description: 'не приблизительные границы'},
  {notes: ['approximate borders', 'not approximate']},
  {reconstructed: 1, metadata: {uncertain: 0}},
]) {
  assert.equal(isReferenceApproximate(referenceWithMetadata(properties)), false,
    'conflicting approximation evidence must retain strict tolerance: ' + JSON.stringify(properties));
}
assert.equal(isReferenceApproximate(referenceWithMetadata({
  approximate: true, description: 'no copyright restrictions mentioned',
})), true, 'unrelated negative prose must not invalidate genuine approximation metadata');

console.log('Runivers approximation metadata tests passed: negative flags cannot inflate border tolerances.');

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
const tinySamples = sparseSamples.filter(([lon]) => lon >= 70);
assert.ok(tinySamples.length >= 2, 'small disconnected ring must retain two separate border anchors');
assert.ok(new Set(tinySamples.map(point => point.join(','))).size >= 2,
  'a single matching vertex must not stand in for the opposite shore of an island');
assert.throws(() => samplePayload(disconnected, 1000, 3), /Cannot sample all 2 boundary rings with 4 minimum anchors/,
  'when the cap cannot cover both ends of every ring, the geographic audit must fail closed');
assert.throws(() => samplePayload(disconnected, 1000, 1), /Cannot sample all 2 boundary rings/,
  'when even one sample per ring is impossible, the geographic audit must fail closed');
console.log('Runivers component sampling tests passed: disconnected borders survive capped sampling.');

// Geographic comparison must fail closed on projected coordinates or invalid
// latitudes, including a malformed island after an otherwise valid mainland.
// Haversine periodicity would otherwise make impossible coordinates look real.
const polygonPayload = ring => ({type: 'FeatureCollection', features: [
  {type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: [ring]}},
]});
const projectedRing = [[200,10],[201,10],[201,11],[200,11],[200,10]];
const invalidLatitudeRing = [[30,91],[31,91],[31,92],[30,92],[30,91]];
for (const ring of [projectedRing, invalidLatitudeRing]) {
  assert.throws(() => samplePayload(polygonPayload(ring), 1000, 20),
    /invalid WGS84 coordinates/, 'non-WGS84 border must never be sampled');
  assert.throws(() => samplePayload({type:'FeatureCollection', features:[
    largeComponent, ...polygonPayload(ring).features,
  ]}, 1000, 20), /invalid WGS84 coordinates/,
  'a valid mainland cannot hide an invalid disconnected component');
}
const datelineRing = [[179,10],[-179,10],[-179,11],[179,11],[179,10]];
assert.ok(samplePayload(polygonPayload(datelineRing), 100000, 10).length >= 2,
  'valid antimeridian geometry remains sampleable');
console.log('Runivers WGS84 sampling tests passed: invalid coordinates fail closed.');



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
const publicMismatch = publicComparisonMetric(mismatch);
assert.equal(publicMismatch.symmetricMaxMeters, mismatch.symmetricMaxMeters,
  'redaction must preserve independent geographic distances');
assert.equal(publicMismatch.referenceToCurrentP95Meters, mismatch.referenceToCurrentP95Meters,
  'public diagnostics must retain the actual reference-to-current error');
assert.equal(publicMismatch.currentToReferenceMaxMeters, mismatch.currentToReferenceMaxMeters,
  'public diagnostics must retain the actual current-to-reference error');
const injectedMetric = publicComparisonMetric({
  ...mismatch,
  sourceBoundaryCoordinates: [[66.1, 55.2]],
  futureNestedDiagnostics: {coordinates: [[66.1, 55.2]]},
});
assert.deepEqual(injectedMetric, publicMismatch,
  'new in-memory fields must not automatically leak through public metric serialization');
assert.ok(!Object.hasOwn(publicMismatch, 'worstReferenceSamples')
  && !Object.hasOwn(publicMismatch, 'worstCurrentSamples'),
  'failed comparison reports must not contain sampled Runivers or History Core border points');
assert.equal(layerContainsYear({fromYear: 1992, toYear: 2004}, 2004, 2020), false);
assert.equal(layerContainsYear({fromYear: 2014, toYear: 2020}, 2020, 2020), true);
const unmatched = unmatchedReferenceLayers([
  {id: 1, fromYear: 1519, toYear: 1520}, // half-open: ended before 1520
  {id: 2, fromYear: 1520, toYear: 1521}, // covers 1520
  {id: 3, fromYear: 1521, toYear: 1522}, // begins after 1520
  {id: 4, fromYear: 2020, toYear: 2020}, // terminal inclusive, but no 2020 state
], [{firstMonth: '1520-01', lastMonth: '1520-12'}], 2020);
assert.deepEqual(unmatched.map(row => row.runiversResourceId), [1, 3, 4],
  'uncompared dated layers must be explicit failures, not silent successes');
assert.ok(unmatched.every(row => row.reason.includes('no independent comparison attempted')));
assert.deepEqual(unmatchedReferenceLayers(
  [{id: 4, fromYear: 2020, toYear: 2020}],
  [{firstMonth: '2020-01', lastMonth: '2020-12'}], 2020,
), [], 'the final Runivers year must still be included when a verified state exists');

// Runivers snapshots describe calendar years, not arbitrary verified months.
// A partial-year state (or two different states splitting a transition year)
// must be reported as UNCOMPARED rather than compared to a full-year layer.
const datedLayer = [{id: 5397, fromYear: 1520, toYear: 1521}];
const missingYear = states => unmatchedReferenceLayers(datedLayer, states, 2020).map(row => row.runiversResourceId);
assert.deepEqual(missingYear([{firstMonth:'1520-03',lastMonth:'1520-11'}]), [5397],
  'a March-November polygon is not evidence for all of 1520');
assert.deepEqual(missingYear([
  {firstMonth:'1520-01',lastMonth:'1520-06'},
  {firstMonth:'1520-07',lastMonth:'1520-12'},
]), [5397], 'two different half-year contours cannot certify one annual reference');
assert.deepEqual(missingYear([{firstMonth:'1519-07',lastMonth:'1521-06'}]), [],
  'a multi-year state still qualifies when it contains all twelve months of 1520');
assert.deepEqual(missingYear([{firstMonth:'1519-07',lastMonth:'1520-11'}]), [5397],
  'the layer year must be fully covered even if an earlier year was complete');
assert.deepEqual(unmatchedReferenceLayers(
  [{id: 9000, fromYear: 2020, toYear: 2020}],
  [{firstMonth:'2020-02',lastMonth:'2020-12'}], 2020,
).map(row => row.runiversResourceId), [9000],
  'terminal-inclusive Runivers year still requires January-December verification');
console.log('Runivers full-year coverage tests passed: partial and split-year states remain unverified.');

console.log('Runivers geometry tests passed: physical coast, symmetric mismatch, diagnostic locations, half-open and terminal years.');

const {referenceForPolity} = await import('./runivers-reference-scope.mjs');
// Whole-layer source metadata must distinguish original feature identities
// even when their first 160 characters coincide. Prefix-only truncation
// previously undercounted distinct names and hid dated-source conflicts.
const originalNamePrefix = 'Moscow-source-'.repeat(13);
const originalFeaturePrefix = 'source-feature-'.repeat(12);
const longScope = referenceForPolity({
  referenceSourceFeatures: ['-SECRET_A', '-SECRET_B'].map(suffix => ({
    id: originalFeaturePrefix + suffix,
    properties: {name: originalNamePrefix + suffix, cat: 51, lwdate: '1553-01-01'},
    geometry: {type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]]},
  })),
}, 'kievan-rus').scope;
assert.equal(longScope.distinctNameCount, 2,
  'long original names must not be merged by public metadata bounds');
assert.notEqual(longScope.sourceRecordExamples[0].featureId,
  longScope.sourceRecordExamples[1].featureId,
  'distinct long feature IDs must retain unique bounded fingerprints');
assert.notEqual(longScope.sourceRecordExamples[0].name,
  longScope.sourceRecordExamples[1].name);
const scopeSerialized = JSON.stringify(longScope);
assert.ok(scopeSerialized.includes('#sha256='), 'long scalar identities must be fingerprinted');
assert.ok(!scopeSerialized.includes('SECRET_A') && !scopeSerialized.includes('SECRET_B'),
  'public scope diagnostics must not disclose overlong source values');
assert.ok(!scopeSerialized.includes('coordinates'),
  'public scope diagnostics must not contain source polygons');

const feature = (name, x) => ({type:'Feature',properties:{name},geometry:{type:'Polygon',coordinates:[[[x,50],[x+1,50],[x+1,51],[x,51],[x,50]]]}});
const source = {type:'FeatureCollection',referenceSourceFeatures:[feature('Московское княжество',30),feature('Тверское княжество',31)],features:[]};
const scoped = referenceForPolity(source,'grand-moscow');
assert.equal(scoped.scope.selectedFeatures,1);
// Mixed-quality source polygons cannot globally acquire the more permissive
// 100 km threshold from just one approximate component.
const imperialFeature = (name, x, approximate) => ({
  ...feature(name, x),
  properties: {name, approximate},
});
const mixedQualityEmpire = referenceForPolity({
  referenceSourceFeatures: [
    imperialFeature('Россия', 30, false),
    imperialFeature('Русская Америка', 80, true),
  ],
}, 'russian-empire');
assert.equal(isReferenceApproximate(mixedQualityEmpire.payload), false,
  'an approximate colonial feature must not relax the exact mainland tolerance');
const fullyApproximateEmpire = referenceForPolity({
  referenceSourceFeatures: [
    imperialFeature('Россия', 30, true),
    imperialFeature('Русская Америка', 80, true),
  ],
}, 'russian-empire');
assert.equal(isReferenceApproximate(fullyApproximateEmpire.payload), true,
  'all independently labeled source features explicitly approximate may use the existing policy');
assert.equal(isReferenceApproximate(referenceWithMetadata({approximate:true})), true,
  'single-source approximation policy must remain unchanged');
assert.equal(isReferenceApproximate({type:'FeatureCollection',features:[]}), false,
  'missing source features cannot justify an increased geographic tolerance');
// Polities without a reviewed source-name scope still expose whole-layer
// diagnostics; those cannot establish an independent Russian-state boundary.
const wholeLayer = referenceForPolity(source, 'russian-republic');
assert.equal(wholeLayer.payload, source, 'diagnostics must not alter the reference polygon');
assert.equal(wholeLayer.scope.kind, 'whole-reference-layer');
assert.equal(wholeLayer.scope.sourceProvenance, 'original-source-features');
assert.equal(wholeLayer.scope.sourceFeatureCount, 2);
assert.equal(wholeLayer.scope.distinctNameCount, 2);
assert.deepEqual(wholeLayer.scope.sourceNameExamples, ['Московское княжество', 'Тверское княжество']);
assert.equal(wholeLayer.scope.diagnosticOnly, true);
assert.throws(() => prepareScopedReference(source, 'russian-republic', coast.index),
  /no reviewed source-identity scope/,
  'a diagnostic-only whole reference layer cannot certify a sovereign border');

assert.equal(wholeLayer.scope.sourceRecordExamples.length, 2);
assert.equal(wholeLayer.scope.sourceRecordExamples[0].name, 'Московское княжество');
assert.equal(wholeLayer.scope.sourceRecordExamples[0].geometry, undefined,
  'public attribution must never embed licensed source polygons');
assert.equal(wholeLayer.sourceFeatures.selected.length, 2,
  'whole-layer diagnostics must retain original source features');
assert.equal(wholeLayer.sourceFeatures.excluded.length, 0);
const fallbackLayer = referenceForPolity({type:'FeatureCollection',features:[feature('Россия',40)]}, 'rsfsr');
assert.equal(fallbackLayer.sourceFeatures.selected.length, 1,
  'whole-layer diagnostics must also work without referenceSourceFeatures metadata');
assert.equal(fallbackLayer.scope.sourceProvenance, 'merged-payload-fallback');
assert.deepEqual(fallbackLayer.scope.sourceRecordExamples, [],
  'a dissolved fallback polygon must not masquerade as original source records');
const emptyOriginalLayer = referenceForPolity({
  type:'FeatureCollection', referenceSourceFeatures: [], features:[feature('Россия',40)],
}, 'russian-republic');
assert.equal(emptyOriginalLayer.scope.sourceProvenance, 'merged-payload-fallback');
assert.equal(emptyOriginalLayer.scope.sourceFeatureCount, 1,
  'an empty original feature array must not hide the available fallback geometry');
const manyFeatures = Array.from({length: 25}, (_, i) => feature('Полития '+i, 30 + i));
const manyLayer = referenceForPolity({referenceSourceFeatures: manyFeatures, features:[]}, 'russian-republic');
assert.equal(manyLayer.scope.sourceRecordExamples.length, 20);
assert.equal(manyLayer.scope.sourceRecordsTruncated, true);
assert.equal(manyLayer.scope.sourceNamesTruncated, true);
assert.equal(manyLayer.scope.distinctNameCount, 25);
const untrustedMetadata = feature('Н'.repeat(1000), 80);
untrustedMetadata.id = {coordinates:[1,2]};
untrustedMetadata.properties.cat = {geometry:[1,2]};
const sanitized = referenceForPolity({referenceSourceFeatures:[untrustedMetadata]}, 'russian-republic');
assert.ok(sanitized.scope.sourceNameExamples[0].length <= 160);
assert.ok(sanitized.scope.sourceNameExamples[0].includes('#sha256='),
  'overlong source labels must retain a bounded identity fingerprint');
assert.ok(sanitized.scope.sourceRecordExamples[0].name.length <= 160);
assert.ok(sanitized.scope.sourceRecordExamples[0].name.includes('#sha256='));
assert.equal(sanitized.scope.sourceRecordExamples[0].featureId, null);
assert.equal(sanitized.scope.sourceRecordExamples[0].cat, null,
  'source diagnostics must never serialize arbitrary nested source metadata');
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
// A live 1750-1799 Runivers report (resource 5581) contains Russia and
// Russian America alongside Kalmyk and Kazakh polities. The latter must not
// contribute to an imperial border comparison merely because they share a
// source layer. Preserve source identities without exporting their polygons.
const empireSource = {type:'FeatureCollection',referenceSourceFeatures:[
  feature('Россия',30), feature('Средний жуз',40),
  feature('Младший жуз',50), feature('Калмыцкое ханство',60),
  feature('Русская Америка',70), feature('Российская империя',80),
],features:[feature('unscoped merged layer',90)]};
const empireScope = referenceForPolity(empireSource,'russian-empire');
assert.equal(empireScope.scope.kind,'named-polity');
assert.equal(empireScope.scope.selectedFeatures,3);
assert.equal(empireScope.scope.totalFeatures,6);
assert.deepEqual(empireScope.scope.selectedNames,['Россия','Русская Америка','Российская империя']);
assert.deepEqual(empireScope.scope.excludedNames,['Средний жуз','Младший жуз','Калмыцкое ханство']);
assert.deepEqual(empireScope.payload.features[0].geometry.coordinates,[
  empireSource.referenceSourceFeatures[0].geometry.coordinates,
  empireSource.referenceSourceFeatures[4].geometry.coordinates,
  empireSource.referenceSourceFeatures[5].geometry.coordinates,
], 'unrelated Runivers political components must not alter the Empire border');
assert.equal(empireScope.sourceFeatures.selected.length,3);
assert.equal(empireScope.sourceFeatures.excluded.length,3);
assert.ok(!JSON.stringify(empireScope.scope).includes('coordinates'),
  'source polygon coordinates must remain in memory only');
assert.throws(()=>referenceForPolity({features:[feature('Россия',30)]},'russian-empire'),/original named/,
  'a dissolved layer cannot certify Empire source identity');
assert.throws(()=>referenceForPolity({referenceSourceFeatures:[feature('Калмыцкое ханство',60)]},'russian-empire'),/no named Empire/,
  'unrelated source polities cannot stand in for Russia');

// Modern Russia must be selected by explicit source identity; a neighboring
// post-Soviet country in the same Runivers layer cannot be part of the RF.
const federationSource = {type:'FeatureCollection',referenceSourceFeatures:[
  feature('Россия',30), feature('Украина',40), feature('Российская Федерация',50),
],features:[feature('unscoped modern layer',60)]};
const federationScope = referenceForPolity(federationSource,'russian-federation');
assert.equal(federationScope.scope.kind,'named-polity');
assert.equal(federationScope.scope.selectedFeatures,2);
assert.deepEqual(federationScope.scope.selectedNames,['Россия','Российская Федерация']);
assert.deepEqual(federationScope.scope.excludedNames,['Украина']);
assert.deepEqual(federationScope.payload.features[0].geometry.coordinates,[
  federationSource.referenceSourceFeatures[0].geometry.coordinates,
  federationSource.referenceSourceFeatures[2].geometry.coordinates,
]);
assert.throws(()=>referenceForPolity({features:[feature('Россия',30)]},'russian-federation'),/original named/);
assert.throws(()=>referenceForPolity({referenceSourceFeatures:[feature('Украина',40)]},'russian-federation'),/no named Russian Federation/);

const sourceRecord = feature('Россия',30);
sourceRecord.id = 777;
sourceRecord.properties = {...sourceRecord.properties,cat:767,lwdate:'1557-01-01',status:6};
const provenanceScope = referenceForPolity({referenceSourceFeatures:[sourceRecord]},'russian-tsardom');
assert.deepEqual(provenanceScope.scope.selectedSourceRecords,[
  {featureId:777,cat:767,name:'Россия',lwdate:'1557-01-01',status:6},
], 'each selected contour must retain its original dated source identity');

const selectedOverflow = Array.from({length: 25}, (_, i) => {
  const item = feature('Россия', 20 + i);
  item.id = i;
  item.properties.cat = i;
  return item;
});
const excludedOverflow = Array.from({length: 25}, (_, i) => feature('Иная полития '+i, 60 + i));
const boundedNamed = referenceForPolity({
  referenceSourceFeatures: [...selectedOverflow, ...excludedOverflow],
}, 'russian-tsardom');
assert.equal(boundedNamed.scope.selectedFeatures, 25);
assert.equal(boundedNamed.scope.selectedSourceRecords.length, 20);
assert.equal(boundedNamed.scope.selectedSourceRecordsMatchedCount, 25);
assert.equal(boundedNamed.scope.selectedSourceRecordsTruncated, true);
assert.equal(boundedNamed.scope.selectedSourceCats.length, 20);
assert.equal(boundedNamed.scope.selectedSourceCatsTruncated, true);
assert.equal(boundedNamed.scope.excludedNames.length, 20);
assert.equal(boundedNamed.scope.excludedNamesTruncated, true);
assert.equal(boundedNamed.sourceFeatures.selected.length, 25,
  'report caps must not remove reference polygons from in-memory comparison');
const unsafeSelected = feature('Россия', 30);
unsafeSelected.id = {coordinates:[37,55]};
unsafeSelected.properties.cat = {geometry:{coordinates:[37,55]}};
unsafeSelected.properties.lwdate = 'D'.repeat(400);
unsafeSelected.properties.status = ['not a scalar'];
const unsafeExcluded = feature('E'.repeat(400), 40);
unsafeExcluded.properties.cat = {geometry:[1,2]};
const safeNamed = referenceForPolity({
  referenceSourceFeatures: [unsafeSelected, unsafeExcluded],
}, 'russian-tsardom');
assert.equal(safeNamed.scope.selectedSourceRecords[0].featureId, null);
assert.equal(safeNamed.scope.selectedSourceRecords[0].cat, null);
assert.equal(safeNamed.scope.selectedSourceRecords[0].status, null);
assert.ok(safeNamed.scope.selectedSourceRecords[0].lwdate.length <= 160);
assert.ok(safeNamed.scope.selectedSourceRecords[0].lwdate.includes('#sha256='));
assert.ok(safeNamed.scope.excludedNames[0].length <= 160);
assert.ok(safeNamed.scope.excludedNames[0].includes('#sha256='));
assert.ok(!JSON.stringify(safeNamed.scope).includes('coordinates'),
  'nested source metadata and geometry must never enter the public named-polity report');

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
// A source export may contain one complete Russian polygon and another
// source-labeled Russian feature with only a point, line, or null geometry.
// Comparing just the first polygon would falsely certify a partial border.
const partialNamedSource = [
  feature('Россия', 36),
  {type:'Feature',properties:{name:'Русское царство'},
    geometry:{type:'Point',coordinates:[38,55]}},
];
assert.throws(() => referenceForPolity({
  referenceSourceFeatures: partialNamedSource,
}, 'russian-tsardom'), /selected source features without polygon geometry/,
  'one valid polygon cannot hide a second named polity feature without area');
assert.throws(() => referenceForPolity({
  referenceSourceFeatures: [feature('Россия',36),
    {type:'Feature',properties:{name:'Россия'},geometry:null}],
}, 'russian-tsardom'), /selected source features without polygon geometry/,
  'a missing named source geometry must block independent border acceptance');
assert.throws(() => referenceForPolity({
  referenceSourceFeatures: [feature('Россия',36),
    {type:'Feature',properties:{name:'Россия'},
      geometry:{type:'GeometryCollection',geometries:[
        {type:'LineString',coordinates:[[38,55],[39,55]]},
        {type:'Point',coordinates:[38,55]},
      ]}}],
}, 'russian-tsardom'), /selected source features without polygon geometry/,
  'non-area GeometryCollections must not disappear from a named border');
assert.equal(referenceForPolity({
  referenceSourceFeatures: [...partialNamedSource.slice(0,1),
    {...partialNamedSource[1],properties:{name:'Тверское княжество'}}],
}, 'russian-tsardom').scope.selectedFeatures, 1,
  'unrelated non-area source features are excluded by reviewed polity identity');
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
assert.equal(referenceForPolity(source,'russian-republic').payload,source);
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
assert.deepEqual(nested,alone,'Overlapping same-state components cannot add a spurious sovereign border');
// An inland enclave is the opposite case: its hole is a real political
// boundary, not an exterior-coast artifact. Filling that hole would falsely
// accept a History Core state that annexed the enclave. The independent
// physical-coast mask must still remove lakes and shorelines separately.
const enclaveHole = [
  [40.2,50.2],[40.2,50.8],[40.8,50.8],[40.8,50.2],[40.2,50.2],
];
const withEnclave = {type:'Feature',properties:{},geometry:{
  type:'Polygon',coordinates:[outer.geometry.coordinates[0],enclaveHole],
}};
const enclaveSamples = politicalBorderSamples(withEnclave,coast.index);
assert.ok(enclaveSamples.points.length > alone.points.length,
  'an inland enclave ring must contribute political-border samples');
assert.ok(enclaveSamples.points.some(([lon,lat]) => Math.abs(lon-40.2)<0.05 && lat>=50.2 && lat<=50.8),
  'inland enclave boundary must survive the physical-coast mask');
const enclaveMismatch = comparePoliticalGeometry(
  enclaveSamples,alone,{hasPolygon:true,types:['Polygon']});
assert.ok(enclaveMismatch.symmetricMaxMeters > 20000,
  'a filled-in enclave must be detected as a geographic discrepancy');
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
  ['politicalPolityId', 'russian-tsardom'],
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
assert.ok(!JSON.stringify(hotspotDiagnostics).includes('"lonLat"'),
  'fixed source-derived hotspot coordinates must remain in memory, not public reports');
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
assert.ok(worstAttribution.every(row => !Object.hasOwn(row, 'lonLat')),
  'never publish source-derived worst-boundary sample coordinates');
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
assert.deepEqual(retainedValidSamples.map(row => row.distanceMeters),
  [700000,600000,500000],
  'invalid leading samples must not suppress three valid worst-distance records');
assert.ok(retainedValidSamples.every(row => !Object.hasOwn(row, 'lonLat')),
  'valid source samples must be attributed without publishing their coordinates');
assert.ok(retainedValidSamples.every(row => row.diagnosticOnly));

// Diagnostic callers may return samples in arbitrary order. The audit must
// report the largest discrepancies, not merely the first three valid points.
const unsortedSamples = diagnoseFailedBoundarySamples({
  referenceSamples: [
    {lonLat:[40.1,54],distanceMeters:100},
    {lonLat:[40.2,54],distanceMeters:900},
    {lonLat:[40.3,54],distanceMeters:200},
    {lonLat:[40.4,54],distanceMeters:800},
    {lonLat:[40.5,54],distanceMeters:700},
  ],
  currentSamples: [
    {lonLat:[39.1,54],distanceMeters:1},
    {lonLat:[39.2,54],distanceMeters:300},
    {lonLat:[39.3,54],distanceMeters:100},
    {lonLat:[39.4,54],distanceMeters:200},
  ],
  referencePayload: diagnosticScope.payload,
  historyPayload: diagnosticHistory,
});
assert.deepEqual(unsortedSamples.map(row => row.distanceMeters),
  [900,800,700,300,200,100],
  'each direction must retain its actual three worst finite distances');
assert.deepEqual(unsortedSamples.map(row => row.sampledBoundary),
  ['runivers-reference','runivers-reference','runivers-reference',
    'history-core','history-core','history-core']);
assert.ok(!JSON.stringify(unsortedSamples).includes('"coordinates"'),
  'all-era diagnostic attribution must not export reference geometry');
assert.ok(!JSON.stringify(unsortedSamples).includes('"lonLat"'),
  'all-era diagnostic attribution must not export sampled source coordinates');

// NextGIS source properties are not guaranteed to be scalar. An embedded
// object could carry unlicensed geometry into a public failure report, and
// hundreds of overlapping features could make the artifact unbounded.
const hostileSourceRecords = Array.from({length: 25}, (_, i) => ({
  ...feature('Россия', 40),
  id: i === 0 ? {coordinates: [[1, 2]]} : i + 1,
  properties: {
    name: 'Р'.repeat(500),
    cat: {coordinates: [[3, 4]]},
    lwdate: '1521-01-01',
    status: Number.POSITIVE_INFINITY,
  },
}));
const boundedAttribution = diagnoseFailedBoundarySamples({
  referenceSamples: [{lonLat: [40.5, 50.5], distanceMeters: 100000}],
  selectedSourceFeatures: hostileSourceRecords,
});
assert.equal(boundedAttribution.length, 1);
assert.equal(boundedAttribution[0].selectedSourceRecordsMatchedCount, 25);
assert.equal(boundedAttribution[0].selectedSourceRecords.length, 20);
assert.equal(boundedAttribution[0].selectedSourceRecordsTruncated, true);
assert.equal(boundedAttribution[0].selectedSourceRecords[0].featureId, null);
assert.equal(boundedAttribution[0].selectedSourceRecords[0].cat, null);
assert.equal(boundedAttribution[0].selectedSourceRecords[0].status, null);
assert.ok(boundedAttribution[0].selectedSourceRecords[0].name.length <= 160);
assert.ok(boundedAttribution[0].selectedSourceRecords[0].name.includes('#sha256='));
assert.equal(boundedAttribution[0].selectedSourceRecords[1].featureId, 2);
assert.ok(!JSON.stringify(boundedAttribution).includes('"coordinates"'),
  'nested source properties and source geometry must never enter CI reports');
assert.equal(worstAttribution[0].selectedSourceRecordsMatchedCount, 1);
assert.equal(worstAttribution[0].selectedSourceRecordsTruncated, false);
console.log('Runivers attribution safety passed: scalar-only metadata, bounded identity fingerprints, 20-record cap with truthful truncation counts.');

console.log('Runivers live worst-sample attribution passed: both directions, sorted severity, overlap, cap, invalid points, no geometry export.');


// Third-party fetch/geometry exceptions can contain exact boundary coordinates,
// and a discovery layer may acquire nested licensed metadata in the future.
// Neither is safe to publish as a GitHub Actions JSON artifact.
const {publicReferenceFailure} = await import('./runivers-public-reference-failures.mjs');
const untrustedFailure = {
  layer: {id: 5391, fromYear: 1553, toYear: 1557,
    displayName: 'source boundary 37.12345,55.98765',
    geometry: {coordinates: [[[37.12345, 55.98765]]]},
    properties: {rawLicensedPayload: {coordinates: [[37.12345,55.98765]]}}},
  polityId: 'russian-tsardom',
  stage: 'reference-geometry',
  error: 'TopologyException at 37.12345,55.98765',
  futureSourceDiagnostics: {coordinates: [[37.12345,55.98765]]},
};
const publicFailure = publicReferenceFailure(untrustedFailure);
assert.deepEqual(publicFailure, {
  runiversResourceId: 5391, runiversFromYear: 1553, runiversToYear: 1557,
  historyPolityId: 'russian-tsardom', stage: 'reference-geometry',
});
assert.ok(!JSON.stringify(publicFailure).includes('37.12345'),
  'third-party source geometry and raw exception text must not enter public failures');
assert.deepEqual(publicReferenceFailure({
  layer: {id: {coordinates: [[37,55]]}, fromYear: '1553', toYear: Infinity},
  polityId: {coordinates: [[37,55]]}, stage: 'unreviewed', error: '37,55',
}), {
  runiversResourceId: null, runiversFromYear: null, runiversToYear: null,
  historyPolityId: null, stage: 'unclassified',
}, 'unexpected nested metadata, stages, and invalid IDs must fail closed');
console.log('Runivers reference-failure redaction passed: no source layers or exception coordinates in CI artifacts.');

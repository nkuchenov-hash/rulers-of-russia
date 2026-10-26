import assert from 'node:assert/strict';
import {buildCoastIndex, distanceToIndex, comparePoliticalGeometry, politicalBorderSamples, layerContainsYear, requireUsableReferenceGeometry, historyStates, indexStateCoverageByMonth} from './validate-runivers-regression.mjs';

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
assert.deepEqual(tsardomScope.payload.features[0].geometry.coordinates,
  [tsardomSource.referenceSourceFeatures[0].geometry.coordinates,
    tsardomSource.referenceSourceFeatures[3].geometry.coordinates]);
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
console.log('Runivers empty/unsupported reference exports fail closed.');


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
console.log('Runivers temporal-state tests passed: year rollover, repeated geometry, missing months, certification and polity changes, no coverage aliasing.');

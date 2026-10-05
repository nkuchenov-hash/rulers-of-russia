import assert from 'node:assert/strict';
import {buildCoastIndex, distanceToIndex, comparePoliticalGeometry, politicalBorderSamples, layerContainsYear} from './validate-runivers-regression.mjs';

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
const soviet = feature('СССР', 50); soviet.properties.status = 1;
const occupation = feature('Советская зона оккупации Германии', 51); occupation.properties.status = 2;
const lease = feature('Аренда Россией района Порккала', 52); lease.properties.status = 3;
const sovietScope = referenceForPolity({referenceSourceFeatures:[soviet, occupation, lease]}, 'ussr');
assert.equal(sovietScope.scope.selectedFeatures, 1);
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

import assert from 'node:assert/strict';
import {buildCoastIndex, distanceToIndex, comparePoliticalGeometry, layerContainsYear} from './validate-runivers-regression.mjs';

const coast = buildCoastIndex();
// This is a physical coastline, not the edges of individual political states.
assert.ok(distanceToIndex([37.62, 55.75], coast.index) > 100000, 'Moscow must be inland');
assert.ok(distanceToIndex([131.89, 43.12], coast.index) < 100000, 'Vladivostok must be coastal');
assert.ok(distanceToIndex([158.65, 53.04], coast.index) < 100000, 'Kamchatka must be present');
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
assert.equal(referenceForPolity(source,'ussr').payload,source);
console.log('Runivers scope tests passed: independent polities remain separate, missing identity fails closed.');

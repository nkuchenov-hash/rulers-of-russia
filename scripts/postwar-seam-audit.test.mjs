import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSeam} from './postwar-seam-audit.mjs';
const fixture=coordinates=>({type:'FeatureCollection',features:[{type:'Feature',properties:{NAME:'USSR'},geometry:{type:'Polygon',coordinates}}]});
test('reports antimeridian outer/hole seam contact with original ring indices',()=>{
 const outer=[[179,60],[180,60],[180,65],[179,65],[179,60]];
 const hole=[[180,65],[180,64],[179.5,64],[180,65]];
 const result=inspectSeam(fixture([outer,hole]));
 assert.equal(result.seamRingCount,2);
 assert.equal(result.contacts.length,2); // closed ring duplicates one seam vertex
 assert.equal(result.contacts[0].latitude,65);
 assert.equal(result.rings[0].seamEdges[0].index,1);
 assert.equal(result.rings[1].kind,'hole');
});
test('distinct seam latitudes do not generate false contacts',()=>{
 const result=inspectSeam(fixture([[[179,60],[180,60],[180,65],[179,65],[179,60]],[[179.5,61],[180,61],[180,62],[179.5,62],[179.5,61]]]));
 assert.deepEqual(result.contacts,[]);
});
test('invalid coordinates and ambiguous selection fail closed',()=>{
 assert.throws(()=>inspectSeam(fixture([[[180,0],[181,0],[180,1],[180,0]]])),/Invalid coordinate/);
 const f=fixture([[[0,0],[1,0],[1,1],[0,0]]]);f.features.push(f.features[0]);
 assert.throws(()=>inspectSeam(f),/exactly one/);
});

test('signed antimeridian aliases count as one physical contact',()=>{
 const outer=[[179,60],[180,65],[-180,65],[-179,60],[179,60]];
 const hole=[[179.5,64],[180,65],[-180,65],[179.5,64]];
 const result=inspectSeam(fixture([outer,hole]));
 assert.equal(result.contacts.length,4,'retain all source vertex pairings');
 assert.equal(result.uniqueContactCount,1,'+180 and -180 identify one physical point');
 assert.equal(result.uniqueContacts[0].latitude,65);
});

test('near-equal seam latitudes use the same tolerance for contacts and deduplication',()=>{
 const outer=[[179,60],[180,65],[179,66],[179,60]];
 const hole=[[179.5,64],[180,65+5e-10],[180,65+7e-10],[179.5,64]];
 const result=inspectSeam(fixture([outer,hole]));
 assert.equal(result.contacts.length,2,'retain both distinct source vertex indices');
 assert.equal(result.uniqueContactCount,1,'sub-nanodegree latitude jitter is one seam location');
});

test('nearby but distinct seam locations are not collapsed',()=>{
 const outer=[[179,60],[180,65],[180,65+2e-9],[179,66],[179,60]];
 const hole=[[179.5,64],[180,65],[180,65+2e-9],[179.5,64]];
 const result=inspectSeam(fixture([outer,hole]));
 assert.equal(result.uniqueContactCount,2);
});

test('reports positive-length seam overlap even with zero coincident vertices',()=>{
 const outer=[[179,59],[180,60],[180,70],[179,71],[179,59]];
 const other=[[179,61],[-180,62],[-180,68],[179,69],[179,61]];
 const doc={type:'FeatureCollection',features:[{type:'Feature',properties:{NAME:'USSR'},geometry:{type:'MultiPolygon',coordinates:[[outer],[other]]}}]};
 const result=inspectSeam(doc);
 assert.equal(result.contacts.length,0,'vertex-only contacts cannot see nested seam edges');
 assert.deepEqual(result.seamEdgeOverlaps,[{a:[0,0,1],b:[1,0,1],latitudeInterval:[62,68]}]);
});
test('endpoint-only seam contacts do not count as positive-length overlap',()=>{
 const outer=[[179,59],[180,60],[180,65],[179,66],[179,59]];
 const hole=[[179.5,64],[180,65],[180,68],[179.5,69],[179.5,64]];
 const result=inspectSeam(fixture([outer,hole]));
 assert.equal(result.seamEdgeOverlaps.length,0);
 assert.ok(result.contacts.length>0);
});
test('disjoint seam intervals remain distinct',()=>{
 const outer=[[179,59],[180,60],[180,61],[179,62],[179,59]];
 const hole=[[179.5,63],[180,64],[180,65],[179.5,66],[179.5,63]];
 const result=inspectSeam(fixture([outer,hole]));
 assert.deepEqual(result.seamEdgeOverlaps,[]);
});

test('union of subdivided seam edges measures coverage once',()=>{
 const outer=[[179,59],[180,60],[180,65],[180,70],[179,71],[179,59]];
 const other=[[179,61],[-180,62],[-180,68],[179,69],[179,61]];
 const doc={type:'FeatureCollection',features:[{type:'Feature',properties:{NAME:'USSR'},geometry:{type:'MultiPolygon',coordinates:[[outer],[other]]}}]};
 const result=inspectSeam(doc);
 assert.equal(result.seamEdgeOverlaps.length,2,'two edge pairs cover one shared interval');
 assert.deepEqual(result.mergedSeamOverlapIntervals,[[62,68]]);
 assert.equal(result.seamOverlapLatitudeDegrees,6,'do not sum overlapping edge-pair coverage twice');
});
test('non-overlapping seam edge pairs preserve separate merged intervals',()=>{
 const outer=[[179,59],[180,60],[180,63],[179,64],[179,59]];
 const hole=[[179.5,60],[180,61],[180,62],[179.5,63],[179.5,60]];
 const result=inspectSeam(fixture([outer,hole]));
 assert.deepEqual(result.mergedSeamOverlapIntervals,[[61,62]]);
 assert.equal(result.seamOverlapLatitudeDegrees,1);
});

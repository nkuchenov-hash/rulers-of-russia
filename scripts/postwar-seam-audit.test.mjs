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

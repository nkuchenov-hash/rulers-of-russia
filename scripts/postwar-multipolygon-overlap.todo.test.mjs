import test from 'node:test';
import assert from 'node:assert/strict';
import {contains} from './postwar-controls.mjs';

// Diagnostic blocker: GeoJSON MultiPolygon members must have disjoint interiors.
// The current implementation validates rings and holes individually but does not
// compare outer rings across separate polygon members. Two overlapping squares
// therefore silently produce a boolean rather than an invalid-topology error.
// This synthetic example is NOT independent historical-boundary evidence.
const square=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];

test.todo('reject overlapping MultiPolygon outer interiors',()=>{
 const geometry={type:'MultiPolygon',coordinates:[
  [square(0,0,10,10)],
  [square(5,5,15,15)]
 ]};
 assert.throws(()=>contains(geometry,7,7),/overlap|invalid topology/i);
});

test.todo('reject MultiPolygon component entirely inside another component',()=>{
 const geometry={type:'MultiPolygon',coordinates:[
  [square(0,0,20,20)],
  [square(5,5,10,10)]
 ]};
 assert.throws(()=>contains(geometry,7,7),/overlap|invalid topology/i);
});

test('disjoint MultiPolygon components remain supported',()=>{
 const geometry={type:'MultiPolygon',coordinates:[
  [square(0,0,10,10)],
  [square(20,20,30,30)]
 ]};
 assert.equal(contains(geometry,7,7),true);
 assert.equal(contains(geometry,25,25),true);
 assert.equal(contains(geometry,15,15),false);
});

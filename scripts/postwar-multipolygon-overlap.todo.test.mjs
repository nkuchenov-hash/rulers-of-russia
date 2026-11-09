import test from 'node:test';
import assert from 'node:assert/strict';
import {contains} from './postwar-controls.mjs';

// Diagnostic blocker: GeoJSON MultiPolygon members must have disjoint interiors.
// The current implementation validates rings and holes individually but does not
// compare outer rings across separate polygon members. Two overlapping squares
// therefore silently produce a boolean rather than an invalid-topology error.
// This synthetic example is NOT independent historical-boundary evidence.
const square=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];

test('reject overlapping MultiPolygon outer interiors',()=>{
 const geometry={type:'MultiPolygon',coordinates:[
  [square(0,0,10,10)],
  [square(5,5,15,15)]
 ]};
 assert.throws(()=>contains(geometry,7,7),/overlap|invalid topology/i);
});

test('reject MultiPolygon component entirely inside another component',()=>{
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

test('MultiPolygon island entirely within a hole remains valid',()=>{
 const geometry={type:'MultiPolygon',coordinates:[
  [square(0,0,20,20),square(4,4,16,16)],
  [square(7,7,10,10)]
 ]};
 assert.equal(contains(geometry,8,8),true);
 assert.equal(contains(geometry,5,5),false);
 assert.equal(contains(geometry,2,2),true);
});
test('MultiPolygon members touching at a boundary are rejected',()=>{
 const geometry={type:'MultiPolygon',coordinates:[
  [square(0,0,10,10)],
  [square(10,2,15,8)]
 ]};
 assert.throws(()=>contains(geometry,12,5),/topology/i);
});

test('cross-component boundary diagnostic never mislabels an outer ring as a hole',()=>{
 const geometry={type:'MultiPolygon',coordinates:[
  [square(0,0,10,10)],
  [square(10,2,15,8)]
 ]};
 assert.throws(()=>contains(geometry,12,5),error=>{
  assert.match(error.message,/MultiPolygon component boundaries cross or touch/);
  assert.doesNotMatch(error.message,/polygon hole crosses/);
  assert.match(error.message,/outer edge \d+, inner edge \d+, longitude shift/);
  return true;
 });
});

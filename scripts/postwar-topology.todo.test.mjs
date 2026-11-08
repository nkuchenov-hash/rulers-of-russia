import test from 'node:test';
import assert from 'node:assert/strict';
import {contains} from './postwar-controls.mjs';

// Regression: previously accepted nonzero-area self-intersection. The signed shoelace twice-area is +12, not zero.
// This ring crosses itself at (2,2), so a nonzero-area check cannot validate it.
// BVH validation must reject this without O(n^2) work on dense rings.
test('reject nonzero-area self-intersecting historical polygon ring',()=>{
 const ring=[[0,0],[4,4],[0,4],[4,0],[4,3],[0,0]];
 const twiceArea=ring.slice(1).reduce((sum,p,i)=>{
  const a=ring[i]; return sum+a[0]*p[1]-p[0]*a[1];
 },0);
 assert.equal(twiceArea,12);
 const geometry={type:'Polygon',coordinates:[ring]};
 assert.throws(()=>contains(geometry,1,1),/self.intersect|invalid.*topology/i);
});

test('reject crossing edges, but accept valid dense rings',()=>{
 const crossing={type:'Polygon',coordinates:[[[0,0],[5,5],[0,5],[5,0],[5,4],[0,0]]]};
 assert.throws(()=>contains(crossing,1,1),/self-intersecting/);
 const square={type:'Polygon',coordinates:[[[0,0],[5,0],[5,5],[0,5],[0,0]]]};
 assert.equal(contains(square,2,2),true);
});

test('crossing-hole diagnostic identifies the exact edge pair and longitude shift',()=>{
 const outer=[[0,0],[8,0],[8,8],[0,8],[0,0]];
 const crossingHole=[[6,6],[10,6],[10,10],[6,10],[6,6]];
 const geometry={type:'Polygon',coordinates:[outer,crossingHole]};
 assert.throws(()=>contains(geometry,2,2),error=>{
  assert.match(error.message,/Polygon 0 hole 1:/);
  assert.match(error.message,/outer edge \d+, inner edge \d+, longitude shift -?\d+/);
  return true;
 });
});

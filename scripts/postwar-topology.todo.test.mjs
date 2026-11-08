import test from 'node:test';
import assert from 'node:assert/strict';
import {contains} from './postwar-controls.mjs';

// Known unresolved topology defect. The signed shoelace area is +6, not zero.
// This ring crosses itself at (2,2), so a nonzero-area check cannot validate it.
// A future sweep-line intersection validator should reject this without O(n^2)
// runtime on the existing 140,000-vertex regression fixture.
test.todo('reject nonzero-area self-intersecting historical polygon ring',()=>{
 const ring=[[0,0],[4,4],[0,4],[4,0],[4,3],[0,0]];
 const twiceArea=ring.slice(1).reduce((sum,p,i)=>{
  const a=ring[i]; return sum+a[0]*p[1]-p[0]*a[1];
 },0);
 assert.equal(twiceArea,6);
 const geometry={type:'Polygon',coordinates:[ring]};
 assert.throws(()=>contains(geometry,1,1),/self.intersect|invalid.*topology/i);
});

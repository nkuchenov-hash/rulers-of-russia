import test from 'node:test';
import assert from 'node:assert/strict';
import {contains,audit} from './postwar-controls.mjs';
const square=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]];
test('polygon interior, exterior, hole',()=>{
 const g={type:'Polygon',coordinates:[square(0,0,10,10),square(2,2,4,4)]};
 assert.equal(contains(g,1,1),true);
 assert.equal(contains(g,3,3),false);
 assert.equal(contains(g,11,1),false);
});
test('multipolygon disjoint parts',()=>{
 const g={type:'MultiPolygon',coordinates:[[square(0,0,1,1)],[square(5,5,6,6)]]};
 assert.equal(contains(g,5.5,5.5),true);
 assert.equal(contains(g,3,3),false);
});
test('Warsaw included is detected as failed historical control',()=>{
 const feature={type:'Feature',properties:{NAME:'USSR'},geometry:{type:'Polygon',coordinates:[square(15,40,45,65)]}};
 const result=audit({type:'FeatureCollection',features:[feature]});
 assert.ok(result.failed.some(p=>p.name==='Warsaw'&&p.actual===true));
});
test('ambiguous polity selector rejected',()=>{
 const f={type:'Feature',properties:{NAME:'USSR'},geometry:{type:'Polygon',coordinates:[square(0,0,1,1)]}};
 assert.throws(()=>audit({type:'FeatureCollection',features:[f,f]}),/exactly one/);
});
test('antimeridian short crossing and opposite hemisphere',()=>{
 const g={type:'Polygon',coordinates:[[[179,10],[-179,10],[-179,20],[179,20],[179,10]]]};
 assert.equal(contains(g,179.5,15),true);
 assert.equal(contains(g,-179.5,15),true);
 assert.equal(contains(g,0,15),false);
 assert.equal(contains(g,170,15),false);
});
test('antimeridian multipolygon with hole',()=>{
 const outer=[[178,0],[-178,0],[-178,10],[178,10],[178,0]];
 const hole=[[179,3],[-179,3],[-179,7],[179,7],[179,3]];
 const g={type:'MultiPolygon',coordinates:[[outer,hole],[square(30,30,32,32)]]};
 assert.equal(contains(g,179.5,5),false);
 assert.equal(contains(g,-178.5,5),true);
 assert.equal(contains(g,31,31),true);
 assert.equal(contains(g,0,5),false);
});
test('invalid and ambiguous rings fail closed',()=>{
 assert.throws(()=>contains({type:'Polygon',coordinates:[[[0,0],[180,0],[180,1],[0,1],[0,0]]]},1,0.5),/Ambiguous/);
 assert.throws(()=>contains({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]},0.5,0.5),/Unclosed/);
 assert.throws(()=>contains({type:'Polygon',coordinates:[[[0,0],[181,0],[1,1],[0,0]]]},0.5,0.5),/Invalid/);
});

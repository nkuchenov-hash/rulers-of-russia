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
test('select only canonical NAME, never incidental metadata aliases',()=>{
 const g={type:'Polygon',coordinates:[square(35,50,40,60)]};
 const f={type:'Feature',properties:{NAME:'USSR'},geometry:g};
 const unrelated={type:'Feature',properties:{NAME:'OTHER',NOTE:'USSR'},geometry:g};
 const result=audit({type:'FeatureCollection',features:[f,unrelated]});
 assert.equal(result.selectedFeatures,1);
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

test('repository 1945 snapshot satisfies 1946–1950 USSR city controls (internal diagnostic only)', async()=>{
 const {readFile} = await import('node:fs/promises');
 const {fileURLToPath} = await import('node:url');
 const snapshot=fileURLToPath(new URL('../public/data/territory/world-history/snapshots/1945.geojson',import.meta.url));
 const source=JSON.parse(await readFile(snapshot,'utf8'));
 const result=audit(source,'USSR');
 assert.equal(result.selectedFeatures,1);
 assert.equal(result.controls.length,8);
 assert.deepEqual(result.failed.map(p=>p.name),[],JSON.stringify(result.failed));
});

test('densely sampled boundary does not exceed JavaScript argument limit',()=>{
 const ring=[];
 for(let i=0;i<=140000;i++) ring.push([i/14000,0]);
 ring.push([10,10],[0,10],[0,0]);
 const g={type:'Polygon',coordinates:[ring]};
 assert.equal(contains(g,5,5),true);
 assert.equal(contains(g,15,5),false);
});

test('zero-area collinear outer ring fails closed',()=>{
 const g={type:'Polygon',coordinates:[[[0,0],[1,1],[2,2],[0,0]]]};
 assert.throws(()=>contains(g,1,1),/Degenerate zero-area/);
});
test('zero-area inner hole fails closed instead of silently accepting it',()=>{
 const g={type:'Polygon',coordinates:[square(0,0,10,10),[[2,2],[3,3],[4,4],[2,2]]]};
 assert.throws(()=>contains(g,3,3),/Degenerate zero-area/);
});

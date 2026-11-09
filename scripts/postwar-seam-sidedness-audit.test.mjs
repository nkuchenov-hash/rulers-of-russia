import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditSeamSidedness} from './postwar-seam-sidedness-audit.mjs';
const feature=coordinates=>({type:'FeatureCollection',features:[{type:'Feature',properties:{NAME:'USSR'},geometry:{type:'MultiPolygon',coordinates}}]});
const west=[[[170,65],[180,65],[180,69],[170,69],[170,65]]];
const east=[[[-180,65],[-170,65],[-170,69],[-180,69],[-180,65]]];
test('opposite-side seam contact is not interior overlap',()=>{
 const result=auditSeamSidedness(feature([west,east]));
 assert.equal(result.samples.length,1);
 assert.equal(result.summary['opposite-side-contact'],1);
 assert.equal(result.samples[0].probes.length,3);
 assert.deepEqual(result.samples[0].probes.map(p=>p.latitude),[66,67,68]);
 assert.ok(result.samples[0].probes.every(p=>p.classification==='opposite-side-contact'));
 assert.deepEqual(result.samples[0].sides.map(({west,east})=>[west,east]),[[true,false],[false,true]]);
});
test('same-side duplicate is classified as overlap',()=>{
 // Duplicate a valid GeoJSON ring on the same side; longitude -190 is invalid.
 const duplicate=west.map(ring=>ring.map(([x,y])=>[x,y]));
 const result=auditSeamSidedness(feature([west,duplicate]));
 assert.equal(result.summary['same-side-overlap'],1);
 assert.ok(result.samples[0].probes.every(p=>p.classification==='same-side-overlap'));
});
test('real 1945 USSR seam produces classifications for all seven edge pairs',()=>{
 const path=new URL('../public/data/territory/world-history/snapshots/1945.geojson',import.meta.url);
 const result=auditSeamSidedness(JSON.parse(readFileSync(path,'utf8')));
 assert.equal(result.samples.length,7);
 assert.equal(result.samples.flatMap(s=>s.probes).length,21);
 assert.ok(result.samples.every(s=>s.probes.every(p=>p.classification==='opposite-side-contact')));
 assert.equal(Object.values(result.summary).reduce((a,b)=>a+b,0),7);
 assert.ok(result.samples.every(s=>s.sides.length===2));
 assert.deepEqual(result.summary,{'opposite-side-contact':7,'same-side-overlap':0,'inconclusive':0});
 assert.ok(result.samples.every(s=>s.sides.some(x=>x.west&&!x.east)&&s.sides.some(x=>!x.west&&x.east)));
 assert.equal(result.samples[0].latitudeInterval[0],65.25922735782032);
 assert.equal(result.samples.at(-1).latitudeInterval[1],68.91692694278126);
});

test('real 1945 seam classifications are stable across three probe offsets',()=>{
 // Probe sensitivity is a diagnostic robustness check, NOT an independent reference.
 // A single offset can conceal a narrow overlap or numerical boundary artifact.
 const path=new URL('../public/data/territory/world-history/snapshots/1945.geojson',import.meta.url);
 const snapshot=JSON.parse(readFileSync(path,'utf8'));
 const offsets=[0.00001,0.0001,0.001];
 const results=offsets.map(delta=>auditSeamSidedness(snapshot,'USSR',delta));
 for(const [i,result] of results.entries()){
  assert.equal(result.delta,offsets[i]);
  assert.equal(result.samples.length,7);
  assert.equal(result.samples.flatMap(s=>s.probes).length,21);
  assert.deepEqual(result.summary,{'opposite-side-contact':7,'same-side-overlap':0,'inconclusive':0});
 }
 const signatures=results.map(result=>result.samples.map(s=>s.probes.map(p=>p.classification).join(',')));
 assert.deepEqual(signatures[0],signatures[1]);
 assert.deepEqual(signatures[1],signatures[2]);
});

// Regression against the checked-in 1945 snapshot, not an independent historical reference.
// Detect changes to antimeridian split geometry without declaring seam contacts valid.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectSeam} from './postwar-seam-audit.mjs';

const snapshot=new URL('../public/data/territory/world-history/snapshots/1945.geojson',import.meta.url);
test('1945 USSR seam contacts remain explicitly unresolved and indexed',()=>{
 const evidence=inspectSeam(JSON.parse(readFileSync(snapshot,'utf8')),'USSR');
 assert.equal(evidence.polygonCount,24);
 assert.equal(evidence.seamRingCount,2);
 assert.equal(evidence.contacts.length,5);
 assert.equal(evidence.seamEdgeOverlaps.length,7,'real 1945 seam has seven positive-length source-edge overlaps');
 assert.deepEqual(evidence.seamEdgeOverlaps.map(x=>[x.a[2],x.b[2]]),[
  [1029,3],[1030,1],[1030,2],[1031,1],[1032,0],[1033,83],[1034,82]
 ]);
 assert.ok(evidence.seamEdgeOverlaps.every(x=>x.a[0]===1&&x.b[0]===2));

 // Vertex 0 and closing vertex 84 of component 2 represent one physical point.
 assert.equal(evidence.uniqueContactCount,4);
 assert.deepEqual(evidence.uniqueContacts.map(c=>c.latitude),[
  65.31103094668751,65.96313055606251,66.96313055606251,67.96313055606251
 ]);
 assert.deepEqual(evidence.contacts.map(({a,b,latitude})=>({a,b,latitude})),[
  {a:[1,0,1030],b:[2,0,3],latitude:65.31103094668751},
  {a:[1,0,1032],b:[2,0,1],latitude:65.96313055606251},
  {a:[1,0,1033],b:[2,0,0],latitude:66.96313055606251},
  {a:[1,0,1033],b:[2,0,84],latitude:66.96313055606251},
  {a:[1,0,1034],b:[2,0,83],latitude:67.96313055606251}
 ]);
 assert.ok(evidence.contacts.every(c=>c.a[0]!==c.b[0]),'contacts must be between distinct components, not holes');
 assert.ok(evidence.rings.every(r=>r.ringIndex===0),'only outer rings meet the seam in this fixture');
});

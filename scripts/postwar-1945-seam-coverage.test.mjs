import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectSeam} from './postwar-seam-audit.mjs';

// Regression fingerprint for the repository's 1945 USSR snapshot, NOT an
// independent historical boundary comparison or proof of valid topology.
const snapshot=new URL('../public/data/territory/world-history/snapshots/1945.geojson',import.meta.url);
test('1945 USSR seam overlap has reproducible union coverage and gaps',()=>{
 const result=inspectSeam(JSON.parse(fs.readFileSync(snapshot,'utf8')),'USSR');
 assert.equal(result.polygonCount,24);
 assert.equal(result.seamRingCount,2);
 assert.equal(result.seamEdgeOverlaps.length,7);
 assert.equal(result.uniqueContactCount,5);
 const intervals=result.mergedSeamOverlapIntervals;
 assert.equal(intervals.length,3,'small discontinuities in seam coverage must not be silently filled');
 assert.ok(Math.abs(intervals[0][0]-65.25922735782032)<1e-9);
 assert.ok(Math.abs(intervals.at(-1)[1]-68.91692694278126)<1e-9);
 const sum=intervals.reduce((n,[a,b])=>n+b-a,0);
 assert.ok(Math.abs(sum-result.seamOverlapLatitudeDegrees)<1e-10);
 assert.ok(sum>3.5&&sum<3.7,'unexpected 1945 seam latitude coverage');
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'runivers-gate-'));
const script=path.resolve('scripts/require-runivers-regression.mjs');
const summary={runiversLayersDiscovered:1,datedLayersAudited:1,usableReferenceLayers:1,comparisons:1,passingComparisons:1,overrides:0,failedComparisons:0,referenceFailures:0,missingStates:0,uncoveredMonths:0};
try {
 fs.mkdirSync(path.join(root,'tmp/runivers-regression'),{recursive:true});
 const completeShard={rangeMonthCount:12,comparedMonthCount:12,excludedMonthCount:0};
 const run=(s,shard=completeShard)=>{fs.writeFileSync(path.join(root,'tmp/runivers-regression/report.json'),JSON.stringify({summary:s,shard}));return spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});};
 assert.equal(run(summary).status,0);
 const skippedLayer=run({...summary,runiversLayersDiscovered:2,datedLayersAudited:2});
 assert.equal(skippedLayer.status,1,
   'A passing comparison with one untested dated reference layer cannot certify the shard');
 assert.match(skippedLayer.stderr,/only 1 yielded comparable borders/,
   'The incomplete dated-layer coverage must be diagnosed explicitly');
 assert.equal(run({...summary,datedLayersAudited:0}).status,1,
   'A shard with zero audited dated reference layers must fail closed');
 assert.equal(run({...summary,datedLayersAudited:2}).status,1,
   'Audited dated layers cannot exceed the discovered layer inventory');
 assert.equal(run({...summary,datedLayersAudited:undefined}).status,1,
   'Missing dated-layer counts cannot be treated as full coverage');
 assert.equal(run({...summary,runiversLayersDiscovered:undefined}).status,1,
   'Missing discovery counts cannot be treated as full coverage');
 assert.equal(run(summary,null).status,1,
   'A validator report without shard metadata must not certify complete dated coverage');
 assert.equal(run(summary,{}).status,1,
   'A shard with no coverage counters must fail closed');
 assert.equal(run(summary,{rangeMonthCount:0,comparedMonthCount:0,excludedMonthCount:0}).status,1,
   'Zero audited months must never pass geographic acceptance');
 assert.equal(run(summary,{rangeMonthCount:12,comparedMonthCount:0,excludedMonthCount:12}).status,1,
   'A shard with no compared months must not pass geographic acceptance');
 assert.equal(run({...summary,usableReferenceLayers:0,comparisons:0,passingComparisons:0,referenceFailures:5}).status,1,'A source outage must not pass readiness');
 assert.equal(run({...summary,referenceFailures:1}).status,1);
 assert.equal(run({...summary,passingComparisons:0,failedComparisons:1}).status,1);
 assert.equal(run({...summary,comparisons:2}).status,1,'All comparisons must be accounted for');
 assert.equal(run({...summary,missingStates:undefined}).status,1,'Missing counters must not silently become zero');
 assert.equal(run({...summary,uncoveredMonths:1}).status,1);
 assert.equal(run({...summary,passingComparisons:0,overrides:1}).status,1,
   'An override must not masquerade as an independently passing comparison');
 assert.equal(run(summary,{rangeMonthCount:12,comparedMonthCount:11,excludedMonthCount:1}).status,1,
   'Uncompared transition months must block full geographic certification');
 // When a shard has multiple blockers, the CI log must identify the actual
 // contour mismatch or source outage before reporting secondary year exclusions.
 // All conditions still fail closed; only diagnostic precedence changes.
 const mismatchAndTransition=run({...summary,comparisons:26,passingComparisons:0,failedComparisons:26},
   {rangeMonthCount:960,comparedMonthCount:912,excludedMonthCount:48});
 assert.equal(mismatchAndTransition.status,1);
 assert.match(mismatchAndTransition.stderr,/26 contour failures/);
 const outageAndTransition=run({...summary,usableReferenceLayers:0,comparisons:0,
   passingComparisons:0,referenceFailures:8},
   {rangeMonthCount:552,comparedMonthCount:492,excludedMonthCount:60});
 assert.equal(outageAndTransition.status,1);
 assert.match(outageAndTransition.stderr,/external-source outage/);
 assert.equal(run(summary,{rangeMonthCount:12,comparedMonthCount:11,excludedMonthCount:0}).status,1,
   'Inconsistent shard coverage counters must fail closed');
 assert.equal(run(summary,{rangeMonthCount:12,comparedMonthCount:13,excludedMonthCount:-1}).status,1,
   'Negative exclusion counters must fail closed');
 console.log('Runivers gate tests passed: complete dated-layer inventory, success, outage, partial coverage, contour failure, override-only comparisons, unverified transition months and malformed totals.');
} finally {fs.rmSync(root,{recursive:true,force:true});}

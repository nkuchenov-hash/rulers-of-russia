import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'runivers-gate-'));
const script=path.resolve('scripts/require-runivers-regression.mjs');
const summary={usableReferenceLayers:1,comparisons:1,passingComparisons:1,overrides:0,failedComparisons:0,referenceFailures:0,missingStates:0,uncoveredMonths:0};
try {
 fs.mkdirSync(path.join(root,'tmp/runivers-regression'),{recursive:true});
 const completeShard={rangeMonthCount:12,comparedMonthCount:12,excludedMonthCount:0};
 const run=(s,shard=completeShard)=>{fs.writeFileSync(path.join(root,'tmp/runivers-regression/report.json'),JSON.stringify({summary:s,shard}));return spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});};
 assert.equal(run(summary).status,0);
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
 assert.equal(run(summary,{rangeMonthCount:12,comparedMonthCount:11,excludedMonthCount:0}).status,1,
   'Inconsistent shard coverage counters must fail closed');
 assert.equal(run(summary,{rangeMonthCount:12,comparedMonthCount:13,excludedMonthCount:-1}).status,1,
   'Negative exclusion counters must fail closed');
 console.log('Runivers gate tests passed: success, outage, partial coverage, contour failure, override-only comparisons, unverified transition months and malformed totals.');
} finally {fs.rmSync(root,{recursive:true,force:true});}

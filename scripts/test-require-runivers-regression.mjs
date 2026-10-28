import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'runivers-gate-'));
const script=path.resolve('scripts/require-runivers-regression.mjs');
const summary={auditedRange:{startMonth:'1520-01',endMonth:'1520-12'},runiversLayersDiscovered:1,datedLayersAudited:1,usableReferenceLayers:1,comparisons:1,passingComparisons:1,overrides:0,failedComparisons:0,referenceFailures:0,missingStates:0,uncoveredMonths:0};
try {
 fs.mkdirSync(path.join(root,'tmp/runivers-regression'),{recursive:true});
 const completeShard={startMonth:'1520-01',endMonth:'1520-12',rangeMonthCount:12,comparedMonthCount:12,excludedMonthCount:0};
 // Synthetic reports must carry the same coordinate-free distance ledger
 // that the real validator emits. This is NOT a real geographic pass.
 const metricRow = status => ({
   status, runiversResourceId: 5455, runiversFromYear: 1920,
   historyFirstMonth: '1920-01', runiversApproximate: false,
   historyGeometryFile: 'test-only.geojson',
   referenceSamples: 100, currentSamples: 100,
   symmetricP95Meters: status === 'pass' ? 10000 : 16000,
   symmetricMaxMeters: status === 'pass' ? 30000 : 61000,
   toleranceMeters: 15000, maxToleranceMeters: 60000,
 });
 const evidenceFor = s => [
   ...Array.from({length: s.passingComparisons ?? 0}, () => metricRow('pass')),
   ...Array.from({length: s.failedComparisons ?? 0}, () => metricRow('fail')),
   ...Array.from({length: s.overrides ?? 0}, () => metricRow('override')),
 ];
 const run=(s,shard=completeShard,expected={},comparisonEvidence=evidenceFor(s))=>{
   fs.writeFileSync(path.join(root,'tmp/runivers-regression/report.json'),JSON.stringify({summary:s,shard,comparisonEvidence}));
   return spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',env:{...process.env,RUNIVERS_START_MONTH:'1520-01',RUNIVERS_END_MONTH:'1520-12',...expected}});
 };
 assert.equal(run(summary).status,0);
 // A successful summary without independently inspectable numeric comparisons
 // must fail, even if every counter and date is internally consistent.
 assert.equal(run(summary,completeShard,{},undefined).status,0,
   'default ledger should be accepted only with valid symmetric distances');
 assert.equal(run(summary,completeShard,{},[]).status,1,
   'green counts with no actual comparison evidence cannot certify geography');
 assert.equal(run(summary,completeShard,{},[metricRow('fail')]).status,1,
   'passing summary cannot be backed by a failed metric row');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),symmetricMaxMeters:61000}]).status,1,
   'a pass outside the unchanged maximum tolerance must be rejected');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),symmetricP95Meters:16000}]).status,1,
   'a pass outside the unchanged p95 tolerance must be rejected');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),referenceSamples:0}]).status,1,
   'a comparison without actual source border samples cannot pass');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),currentSamples:0}]).status,1,
   'a comparison without History Core border samples cannot pass');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversResourceId:null}]).status,1,
   'every comparison must identify its source layer');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),symmetricP95Meters:NaN}]).status,1,
   'non-finite metric evidence must fail closed');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),toleranceMeters:1000000,maxToleranceMeters:4000000}]).status,1,
   'inflated distance tolerances must not turn a comparison into a pass');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),maxToleranceMeters:1000000}]).status,1,
   'maximum tolerance cannot be relaxed independently of p95');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),symmetricP95Meters:40000,symmetricMaxMeters:30000}]).status,1,
   'p95 distance cannot exceed the maximum distance');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),historyFirstMonth:'invalid'}]).status,1,
   'the source comparison date must be independently inspectable');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversApproximate:null}]).status,1,
   'missing approximation class must not allow unverified tolerances');
 // The matrix provides its expected interval independently of the report.
 // A self-consistent report from another shard must not be accepted.
 const wrongExpectedShard=run(summary,completeShard,{RUNIVERS_START_MONTH:'1521-01',RUNIVERS_END_MONTH:'1521-12'});
 assert.equal(wrongExpectedShard.status,1);
 assert.match(wrongExpectedShard.stderr,/not the requested shard/);
 assert.equal(run(summary,completeShard,{RUNIVERS_END_MONTH:'1520-13'}).status,1,
   'Invalid expected dates must not be accepted as a shard identity');
 assert.equal(run(summary,completeShard,{RUNIVERS_END_MONTH:''}).status,1,
   'Missing expected end date must not certify the interval');
 const skippedLayer=run({...summary,runiversLayersDiscovered:2,datedLayersAudited:2});
 assert.equal(skippedLayer.status,1,
   'A passing comparison with one untested dated reference layer cannot certify the shard');
 assert.match(skippedLayer.stderr,/only 1 yielded comparable borders/,
   'The incomplete dated-layer coverage must be diagnosed explicitly');
 const omittedDiscoveredLayer=run({...summary,runiversLayersDiscovered:2});
 assert.equal(omittedDiscoveredLayer.status,1,
   'Auditing one passing layer out of two overlapping discovered layers cannot certify the shard');
 assert.match(omittedDiscoveredLayer.stderr,/discovered 2 overlapping dated layers but audited only 1/);
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
 // Reject a green report that actually covers a different or shorter
 // calendar interval, even when its compared/excluded counters add up.
 const wrongDates=run(summary,{...completeShard,startMonth:'1519-01'});
 assert.equal(wrongDates.status,1);
 assert.match(wrongDates.stderr,/disagrees with the validator audited range/);
 const truncatedRange=run({...summary,auditedRange:{startMonth:'1520-01',endMonth:'1521-12'}},
   {...completeShard,endMonth:'1521-12'},{RUNIVERS_END_MONTH:'1521-12'});
 assert.equal(truncatedRange.status,1);
 assert.match(truncatedRange.stderr,/12 reported months but 24 calendar months/);
 const invalidEnd=run({...summary,auditedRange:{startMonth:'1520-01',endMonth:'1520-13'}},
   {...completeShard,endMonth:'1520-13'});
 assert.equal(invalidEnd.status,1);
 assert.match(invalidEnd.stderr,/date range is invalid/);
 assert.equal(run({...summary,auditedRange:undefined}).status,1,
   'Missing validator date metadata cannot certify a shard');
 assert.equal(run(summary,{...completeShard,startMonth:'1521-01',endMonth:'1520-12'}).status,1,
   'Reversed shard dates cannot pass geographic acceptance');
 console.log('Runivers gate tests passed: complete dated-layer inventory, success, outage, partial coverage, contour failure, override-only comparisons, unverified transition months and malformed totals.');
} finally {fs.rmSync(root,{recursive:true,force:true});}

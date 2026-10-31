import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'runivers-gate-'));
const script=path.resolve('scripts/require-runivers-regression.mjs');
const summary={auditedRange:{startMonth:'1920-01',endMonth:'1920-12'},runiversLayersDiscovered:1,datedLayersAudited:1,usableReferenceLayers:1,comparisons:1,passingComparisons:1,overrides:0,failedComparisons:0,referenceFailures:0,missingStates:0,uncoveredMonths:0};
try {
 fs.mkdirSync(path.join(root,'tmp/runivers-regression'),{recursive:true});
 const completeShard={startMonth:'1920-01',endMonth:'1920-12',rangeMonthCount:12,comparedMonthCount:12,excludedMonthCount:0};
 // Synthetic reports must carry the same coordinate-free distance ledger
 // that the real validator emits. This is NOT a real geographic pass.
 const metricRow = status => ({
   status, runiversResourceId: 5455, runiversFromYear: 1920,
   runiversToYear: 1921, runiversIntervalSemantics: 'half-open',
   historyFirstMonth: '1920-01', historyLastMonth: '1920-12',
   runiversApproximate: false,
   historyGeometryFile: 'test-only.geojson',
   // Synthetic scope metadata: this fixture is not an actual 1920 border pass.
   historyPolityId: 'russian-republic', referenceScopeKind: 'named-polity',
   referenceScopePolityId: 'russian-republic',
   referenceScopeSelectedFeatures: 1, referenceScopeTotalFeatures: 2,
   referenceSamples: 100, currentSamples: 100,
   referenceToCurrentP95Meters: status === 'pass' ? 10000 : 16000,
   referenceToCurrentMaxMeters: status === 'pass' ? 30000 : 61000,
   currentToReferenceP95Meters: status === 'pass' ? 9000 : 15000,
   currentToReferenceMaxMeters: status === 'pass' ? 25000 : 50000,
   symmetricP95Meters: status === 'pass' ? 10000 : 16000,
   symmetricMaxMeters: status === 'pass' ? 30000 : 61000,
   toleranceMeters: 15000, maxToleranceMeters: 60000,
 });
 const evidenceFor = s => [
   ...Array.from({length: s.passingComparisons ?? 0}, () => metricRow('pass')),
   ...Array.from({length: s.failedComparisons ?? 0}, () => metricRow('fail')),
   ...Array.from({length: s.overrides ?? 0}, () => metricRow('override')),
 ].map((row, index) => ({...row, runiversResourceId: row.runiversResourceId + index}));
 // The production validator emits comparedFirstYear/comparedLastYear.
 // Derive them for synthetic fixtures unless a test explicitly supplies a
 // forged value. No synthetic pass is evidence of real historical geography.
 const run=(s,shard=completeShard,expected={},comparisonEvidence=evidenceFor(s))=>{
   const ledger = comparisonEvidence?.map(row => {
     const firstMonth = String(row.historyFirstMonth ?? '');
     const lastMonth = String(row.historyLastMonth ?? '');
     const sourceLastYear = Number(row.runiversToYear)
       - (row.runiversIntervalSemantics === 'half-open' ? 1 : 0);
     return {
       ...row,
       comparedFirstYear: Object.hasOwn(row,'comparedFirstYear') ? row.comparedFirstYear
         : Math.max(Number(firstMonth.slice(0,4)) + (firstMonth.slice(5,7) === '01' ? 0 : 1),
           Number(row.runiversFromYear)),
       comparedLastYear: Object.hasOwn(row,'comparedLastYear') ? row.comparedLastYear
         : Math.min(Number(lastMonth.slice(0,4)) - (lastMonth.slice(5,7) === '12' ? 0 : 1),
           sourceLastYear),
     };
   });
   fs.writeFileSync(path.join(root,'tmp/runivers-regression/report.json'),JSON.stringify({summary:s,shard,comparisonEvidence:ledger}));
   return spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',env:{...process.env,RUNIVERS_START_MONTH:'1920-01',RUNIVERS_END_MONTH:'1920-12',...expected}});
 };
 assert.equal(run(summary).status,0);
 // The real preflight outage report contains no comparisons. It must fail
 // with an explicit source-availability reason rather than a misleading
 // "missing comparison evidence" error.
 const actualOutage = run({...summary,usableReferenceLayers:0,comparisons:0,
   passingComparisons:0,referenceFailures:7,externalOutage:true},
   {...completeShard,externalOutage:true},{},[]);
 assert.equal(actualOutage.status,1);
 assert.match(actualOutage.stderr,/preflight external-source outage/);
 // Neither a fabricated green ledger nor a clean summary may override an
 // outage marker written by the shard runner.
 const forgedGreenOutage = run({...summary,externalOutage:true});
 assert.equal(forgedGreenOutage.status,1);
 assert.match(forgedGreenOutage.stderr,/preflight external-source outage/);
 const shardFlaggedOutage = run(summary,{...completeShard,externalOutage:true});
 assert.equal(shardFlaggedOutage.status,1);
 assert.match(shardFlaggedOutage.stderr,/preflight external-source outage/);
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
 // The producer must publish both directed distance metrics. A symmetric
 // aggregate alone cannot prove that both border directions were measured.
 for (const key of [
   'referenceToCurrentP95Meters', 'referenceToCurrentMaxMeters',
   'currentToReferenceP95Meters', 'currentToReferenceMaxMeters',
 ]) {
   const missing = {...metricRow('pass')};
   delete missing[key];
   const result = run(summary,completeShard,{},[missing]);
   assert.equal(result.status,1, key + ' must be present');
   assert.match(result.stderr,/bilateral directed measurements/);
 }
 for (const forged of [
   {referenceToCurrentP95Meters:16000},
   {currentToReferenceMaxMeters:61000},
   {currentToReferenceP95Meters:40000},
   {referenceToCurrentMaxMeters:-1},
   {currentToReferenceP95Meters:0.5},
   {symmetricP95Meters:9000},
   {symmetricMaxMeters:25000},
 ]) {
   const result = run(summary,completeShard,{},[{...metricRow('pass'),...forged}]);
   assert.equal(result.status,1, 'contradictory directed and symmetric metrics must fail');
   assert.match(result.stderr,/bilateral directed measurements/);
 }
 // Either direction may dominate; the symmetric score is the maximum of
 // both, not necessarily the reference-to-current distance.
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),
   referenceToCurrentP95Meters:9000, referenceToCurrentMaxMeters:25000,
   currentToReferenceP95Meters:10000, currentToReferenceMaxMeters:30000,
 }]).status,0, 'valid reverse-dominant bilateral metrics must still pass');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversResourceId:null}]).status,1,
   'every comparison must identify its source layer');
 // A successful numeric distance against a dissolved whole-layer polygon
 // cannot certify the target sovereign polity without original named scope.
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),referenceScopeKind:'whole-reference-layer'}]).status,1,
   'whole-layer diagnostics must never become an independent geography pass');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),referenceScopeKind:undefined}]).status,1,
   'missing source scope must fail closed');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),referenceScopePolityId:'ussr'}]).status,1,
   'a different named polity cannot certify the target state');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),historyPolityId:undefined}]).status,1,
   'missing target polity identity cannot be certified');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),referenceScopeSelectedFeatures:0}]).status,1,
   'zero original selected source features cannot establish a border');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),referenceScopeTotalFeatures:0}]).status,1,
   'source-scope selected count cannot exceed original feature count');
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
 // Numeric metrics from a different century must not certify this
 // shard even if the report's summary counters and dates look consistent.
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),historyFirstMonth:'1919-01'}]).status,1,
   'a comparison beginning before the requested shard must fail');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),historyLastMonth:'1921-01'}]).status,1,
   'a comparison ending after the requested shard must fail');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversFromYear:1910,runiversToYear:1911}]).status,1,
   'an older non-overlapping source layer cannot certify a later historical state');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversFromYear:1921,runiversToYear:1922}]).status,1,
   'a future non-overlapping source layer cannot certify an earlier state');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversToYear:1920}]).status,1,
   'a half-open source ending in 1920 does not cover 1920');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversToYear:1920,
   runiversIntervalSemantics:'terminal-inclusive'}]).status,0,
   'a terminal-inclusive source ending in 1920 may cover that year');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversFromYear:1910}]).status,0,
   'a dated source beginning before the state may still overlap it');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversToYear:undefined}]).status,1,
   'source end year must be present');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),historyLastMonth:undefined}]).status,1,
   'history state end month must be present');
 assert.equal(run(summary,completeShard,{},[{...metricRow('pass'),runiversIntervalSemantics:undefined}]).status,1,
   'source interval semantics must be present');
 assert.equal(run({...summary,comparisons:2,passingComparisons:2},completeShard,{},[
   metricRow('pass'),metricRow('pass'),
 ]).status,1,'duplicate source/state evidence must not inflate successful comparisons');
 // A single source may cover multiple distinct states; it still counts as
 // only one independently usable Runivers reference, not two dated layers.
 const twoStatesSameResource = [
   metricRow('pass'),
   {...metricRow('pass'),historyGeometryFile:'second-state.geojson'},
 ];
 assert.equal(run({...summary,comparisons:2,passingComparisons:2},completeShard,{},twoStatesSameResource).status,0,
   'multiple state comparisons against one resource remain valid when counted as one source');
 const falselyCountedSources = run({
   ...summary,runiversLayersDiscovered:2,datedLayersAudited:2,
   usableReferenceLayers:2,comparisons:2,passingComparisons:2,
 },completeShard,{},twoStatesSameResource);
 assert.equal(falselyCountedSources.status,1,
   'two state comparisons against one source must not certify two independently usable reference layers');
 assert.match(falselyCountedSources.stderr,/1 distinct resource IDs/);
 assert.equal(run({
   ...summary,runiversLayersDiscovered:2,datedLayersAudited:2,
   usableReferenceLayers:2,comparisons:2,passingComparisons:2,
 },completeShard,{},[metricRow('pass'),{...metricRow('pass'),runiversResourceId:5456}]).status,0,
   'two genuinely distinct reference resources must still be accepted');

 // The matrix provides its expected interval independently of the report.
 // A self-consistent report from another shard must not be accepted.
 const wrongExpectedShard=run(summary,completeShard,{RUNIVERS_START_MONTH:'1921-01',RUNIVERS_END_MONTH:'1921-12'});
 assert.equal(wrongExpectedShard.status,1);
 assert.match(wrongExpectedShard.stderr,/not the requested shard/);
 assert.equal(run(summary,completeShard,{RUNIVERS_END_MONTH:'1920-13'}).status,1,
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
 const wrongDates=run(summary,{...completeShard,startMonth:'1919-01'});
 assert.equal(wrongDates.status,1);
 assert.match(wrongDates.stderr,/disagrees with the validator audited range/);
 const truncatedRange=run({...summary,auditedRange:{startMonth:'1920-01',endMonth:'1921-12'}},
   {...completeShard,endMonth:'1921-12'},{RUNIVERS_END_MONTH:'1921-12'});
 assert.equal(truncatedRange.status,1);
 assert.match(truncatedRange.stderr,/12 reported months but 24 calendar months/);
 const invalidEnd=run({...summary,auditedRange:{startMonth:'1920-01',endMonth:'1920-13'}},
   {...completeShard,endMonth:'1920-13'});
 assert.equal(invalidEnd.status,1);
 assert.match(invalidEnd.stderr,/date range is invalid/);
 assert.equal(run({...summary,auditedRange:undefined}).status,1,
   'Missing validator date metadata cannot certify a shard');
 // A year-level reference only covers its declared years, even when the
 // History Core polygon is reused across a longer two-year state. Previous
 // checks trusted uncoveredMonths=0 and could accept this shortened evidence.
 const twoYearSummary = {...summary,auditedRange:{startMonth:'1920-01',endMonth:'1921-12'}};
 const twoYearShard = {startMonth:'1920-01',endMonth:'1921-12',
   rangeMonthCount:24,comparedMonthCount:24,excludedMonthCount:0};
 const twoYearEvidence = {...metricRow('pass'),historyLastMonth:'1921-12'};
 const partialYearEvidence = run(twoYearSummary,twoYearShard,
   {RUNIVERS_END_MONTH:'1921-12'},[twoYearEvidence]);
 assert.equal(partialYearEvidence.status,1,
   'a source covering only 1920 cannot certify a 1920–1921 History Core state');
 assert.match(partialYearEvidence.stderr,/does not cover 12\/24 shard months/);
 assert.equal(run(twoYearSummary,twoYearShard,
   {RUNIVERS_END_MONTH:'1921-12'},[{...twoYearEvidence,runiversToYear:1922}]).status,0,
   'the same state is accepted when its source really covers both full years');

 // Each dated source must independently cover its own overlapping months.
 // Two sources both spanning 1920-1921 cannot certify the period by checking
 // only 1920 against the first and only 1921 against the second.
 const twoResourceSummary = {...twoYearSummary,runiversLayersDiscovered:2,
   datedLayersAudited:2,usableReferenceLayers:2,comparisons:2,passingComparisons:2};
 const firstResourceOneYear = {...metricRow('pass'),runiversToYear:1922};
 const secondResourceOneYear = {...metricRow('pass'),runiversResourceId:5456,
   runiversToYear:1922,historyFirstMonth:'1921-01',historyLastMonth:'1921-12'};
 const substitutedSource = run(twoResourceSummary,twoYearShard,
   {RUNIVERS_END_MONTH:'1921-12'},[firstResourceOneYear,secondResourceOneYear]);
 assert.equal(substitutedSource.status,1,
   'a passing second source must not fill the first source\'s missing year');
 assert.match(substitutedSource.stderr,/reference resource 5455 lacks 12 dated month/);
 assert.equal(run(twoResourceSummary,twoYearShard,{RUNIVERS_END_MONTH:'1921-12'},[
   {...firstResourceOneYear,historyLastMonth:'1921-12'},
   {...secondResourceOneYear,historyFirstMonth:'1920-01'},
 ]).status,0,'two sources may pass after each covers its own full dated overlap');

 // One resource ID must not be represented with contradictory date bounds:
 // that could make a short reference appear to cover extra years.
 const inconsistentResource = run({...summary,comparisons:2,passingComparisons:2},
   completeShard,{},[
     {...metricRow('pass'),historyGeometryFile:'first-state.geojson'},
     {...metricRow('pass'),runiversFromYear:1919,
       historyGeometryFile:'second-state.geojson'},
   ]);
 assert.equal(inconsistentResource.status,1);
 assert.match(inconsistentResource.stderr,/inconsistent dated interval metadata/);

 // A year-granular source cannot certify two different states that each
 // occupy only part of the same calendar year. The old gate added their
 // partial months and could report a false complete-year geographic pass.
 const stitchedPartialYears = run({...summary,comparisons:2,passingComparisons:2},
   completeShard,{},[
     {...metricRow('pass'),historyLastMonth:'1920-06'},
     {...metricRow('pass'),historyFirstMonth:'1920-07',
       historyGeometryFile:'second-half-only.geojson'},
   ]);
 assert.equal(stitchedPartialYears.status,1,
   'two partial-year state comparisons cannot certify a full Runivers year');
 assert.match(stitchedPartialYears.stderr,/complete-calendar-year/);
 // Even a correctly dated full-year state must not accept invented or
 // omitted compared-year bounds in the public evidence ledger.
 for (const forged of [
   {comparedFirstYear:1919}, {comparedLastYear:1921},
   {comparedFirstYear:null}, {comparedLastYear:null},
 ]) {
   const result = run(summary,completeShard,{},[{...metricRow('pass'),...forged}]);
   assert.equal(result.status,1,'invalid compared-year evidence must fail closed');
   assert.match(result.stderr,/complete-calendar-year/);
 }
 // A partial final year must not select a stricter later-year tolerance.
 // The complete year 1899 remains the only valid annual comparison.
 {
   const startMonth='1899-01', endMonth='1899-12';
   const rangeSummary={...summary,auditedRange:{startMonth,endMonth}};
   const rangeShard={startMonth,endMonth,rangeMonthCount:12,
     comparedMonthCount:12,excludedMonthCount:0};
   const row={...metricRow('pass'),runiversFromYear:1899,
     runiversToYear:1901,historyFirstMonth:'1899-01',
     historyLastMonth:'1900-06',toleranceMeters:25000,maxToleranceMeters:100000};
   // The state extends past the shard and is intentionally rejected by the
   // existing shard-boundary rule; a complete 1899-only state remains valid.
   assert.equal(run(rangeSummary,rangeShard,
     {RUNIVERS_START_MONTH:startMonth,RUNIVERS_END_MONTH:endMonth},
     [{...row,historyLastMonth:'1899-12'}]).status,0);
 }

 // The validator applies the strictest year of the actual source/state
 // overlap, not the first year of a multi-year source. The acceptance gate
 // must agree at every historical tolerance transition, without allowing
 // an older, looser limit to certify a later year.
 for (const [firstYear, lastYear, strictLimit, oldLimit] of [
   [1699, 1700, 35000, 50000],
   [1849, 1850, 25000, 35000],
   [1899, 1900, 15000, 25000],
 ]) {
   const startMonth = String(firstYear) + '-01';
   const endMonth = String(lastYear) + '-12';
   const rangeSummary = {...summary, auditedRange:{startMonth,endMonth}};
   const rangeShard = {startMonth,endMonth,rangeMonthCount:24,
     comparedMonthCount:24,excludedMonthCount:0};
   const row = {...metricRow('pass'),runiversFromYear:firstYear,
     runiversToYear:lastYear+1,historyFirstMonth:startMonth,
     historyLastMonth:endMonth,toleranceMeters:strictLimit,
     maxToleranceMeters:strictLimit*4};
   const env = {RUNIVERS_START_MONTH:startMonth,RUNIVERS_END_MONTH:endMonth};
   assert.equal(run(rangeSummary,rangeShard,env,[row]).status,0,
     firstYear+'–'+lastYear+': the strict later-year tolerance must be accepted');
   const inflated = run(rangeSummary,rangeShard,env,[{...row,
     toleranceMeters:oldLimit,maxToleranceMeters:oldLimit*4}]);
   assert.equal(inflated.status,1,
     firstYear+'–'+lastYear+': the earlier, looser tolerance must be rejected');
   assert.match(inflated.stderr,/changes the historical distance limits/);
 }
 // A long-lived source must not extend the tolerance beyond the actual
 // History Core state; use the last year of the INTERSECTION, not the
 // source's end year or the state's first year.
 {
   const rangeSummary = {...summary,auditedRange:{startMonth:'1699-01',endMonth:'1700-12'}};
   const rangeShard = {startMonth:'1699-01',endMonth:'1700-12',
     rangeMonthCount:24,comparedMonthCount:24,excludedMonthCount:0};
   const row = {...metricRow('pass'),runiversFromYear:1690,
     runiversToYear:1710,historyFirstMonth:'1699-01',
     historyLastMonth:'1700-12',toleranceMeters:35000,maxToleranceMeters:140000};
   assert.equal(run(rangeSummary,rangeShard,
     {RUNIVERS_START_MONTH:'1699-01',RUNIVERS_END_MONTH:'1700-12'},[row]).status,0,
     'the latest year of the actual overlap must govern the tolerance');
 }

 assert.equal(run(summary,{...completeShard,startMonth:'1921-01',endMonth:'1920-12'}).status,1,
   'Reversed shard dates cannot pass geographic acceptance');
 console.log('Runivers gate tests passed: complete dated-layer inventory, success, outage, partial coverage, contour failure, override-only comparisons, unverified transition months and malformed totals.');
} finally {fs.rmSync(root,{recursive:true,force:true});}

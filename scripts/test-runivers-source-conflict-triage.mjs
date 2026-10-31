import assert from 'node:assert/strict';
import {summarizeRuniversSourceConflicts} from './summarize-runivers-source-conflicts.mjs';

const sample = (distanceMeters, selectedName, excludedName, sampledBoundary = 'runivers-reference') => ({
  sampledBoundary,
  distanceMeters,
  selectedSourceRecords: [{cat: 51, name: selectedName, geometry: {coordinates: [[10,20]]}}],
  excludedSourceRecords: [{cat: 488, name: excludedName, geometry: {coordinates: [[30,40]]}}],
  selectedSourceRecordsMatchedCount: 1,
  excludedSourceRecordsMatchedCount: 1,
  lonLat: [66.97265625, 67.57571742],
});
const report = {
  summary: {auditedRange: {startMonth:'1520-01',endMonth:'1599-12'}},
  failedComparisons: [
    {runiversResourceId:5383,historyFirstMonth:'1520-01',
      symmetricMaxMeters:983475,symmetricP95Meters:718014,
      referenceToCurrentMaxMeters:983475,currentToReferenceMaxMeters:700000,
      boundarySampleAttribution:[
        sample(500000, 'not the worst sample', 'not the worst excluded'),
        sample(983475, 'Московское княжество', 'Обдорское княжество'),
        sample(700000, 'Российское царство', 'Зона русской колонизации', 'history-core'),
      ],rawGeometry:{coordinates:[[1,2]]}},
    {runiversResourceId:5385,historyFirstMonth:'1520-01',
      symmetricMaxMeters:900000,symmetricP95Meters:700000,
      referenceToCurrentMaxMeters:900000,currentToReferenceMaxMeters:500000,
      boundarySampleAttribution:[sample(900000,'Московское княжество','Обдорское княжество')]},
    {runiversResourceId:5399,historyFirstMonth:'1553-01',
      symmetricMaxMeters:1111421,symmetricP95Meters:1054800,
      boundarySampleAttribution:[]},
  ],
  referenceFailures:[{reason:'outage',geometry:{coordinates:[[9,9]]}}],
  unmatchedReferenceLayers:[{runiversResourceId:5397},{runiversResourceId:5397},{runiversResourceId:5403}],
};
const result = summarizeRuniversSourceConflicts(report);
assert.equal(result.schemaVersion,1);
assert.equal(result.diagnosticOnly,true);
assert.match(result.acceptance,/NOT A GEOGRAPHIC PASS/);
assert.deepEqual(result.auditedRange,{startMonth:'1520-01',endMonth:'1599-12'});
assert.equal(result.failedComparisons,3);
assert.equal(result.unattributedComparisons,1);
assert.equal(result.referenceFailureCount,1);
assert.deepEqual(result.unmatchedReferenceResourceIds,[5397,5403]);
assert.equal(result.clusters.length,2);
const ob = result.clusters[0];
assert.equal(ob.comparisons,2);
assert.equal(ob.maxSymmetricErrorMeters,983475);
assert.equal(ob.maxSymmetricP95Meters,718014);
assert.equal(ob.selectedSourceIdentities,'51:Московское княжество');
assert.equal(ob.excludedSourceIdentities,'488:Обдорское княжество');
assert.equal(ob.coincidentSelectedExcludedAtWorstSample,true);
assert.deepEqual(ob.resourceIds,[5383,5385]);
assert.deepEqual(ob.historyStateStarts,['1520-01']);
assert.equal(result.clusters[1].selectedSourceIdentities,'unknown');
assert.equal(result.clusters[1].excludedSourceIdentities,'unknown');
// Both directed failures must be visible independently: a History Core
// overhang cannot be misdiagnosed as a Runivers reference-side boundary.
assert.deepEqual(result.unattributedByDirection, {'runivers-reference':1,'history-core':2});
assert.deepEqual(result.unmatchedReportedMaximumByDirection, {'runivers-reference':0,'history-core':0});
assert.equal(result.directionalHotspots.length,2);
const referenceSide = result.directionalHotspots.find(row => row.sampledBoundary === 'runivers-reference');
const historySide = result.directionalHotspots.find(row => row.sampledBoundary === 'history-core');
assert.equal(referenceSide.comparisons,2);
assert.equal(referenceSide.maxAttributedSampleDistanceMeters,983475);
assert.equal(referenceSide.maxReportedDirectionalMeters,983475);
assert.equal(referenceSide.reportedMaximumMatches,2);
assert.equal(referenceSide.reportedMaximumUnmatched,0);
assert.deepEqual(referenceSide.resourceIds,[5383,5385]);
assert.equal(historySide.comparisons,1);
assert.equal(historySide.maxAttributedSampleDistanceMeters,700000);
assert.equal(historySide.maxReportedDirectionalMeters,700000);
assert.equal(historySide.reportedMaximumMatches,1);
assert.equal(historySide.selectedSourceIdentities,'51:Российское царство');
assert.equal(historySide.excludedSourceIdentities,'488:Зона русской колонизации');
assert.deepEqual(historySide.resourceIds,[5383]);
assert.deepEqual(historySide.historyStateStarts,['1520-01']);
const serialized = JSON.stringify(result);
assert.ok(!serialized.includes('66.97265625') && !serialized.includes('67.57571742'),
  'licensed boundary sample positions must not be serialized');
assert.ok(!serialized.includes('coordinates') && !serialized.includes('not the worst sample'),
  'raw geometry and lower-severity source records must not be serialized');
assert.ok(!serialized.includes('lonLat') && !serialized.includes('rawGeometry'),
  'neither directional hotspot may publish coordinates or raw geometry');
assert.throws(()=>summarizeRuniversSourceConflicts({summary:{}}),/lacks failedComparisons/);
const malicious = summarizeRuniversSourceConflicts({failedComparisons:[{
  runiversResourceId:1,historyFirstMonth:'not-a-month',
  boundarySampleAttribution:[{
    sampledBoundary:'runivers-reference',distanceMeters:42,
    selectedSourceRecords:[{cat:{coordinates:[1,2]},name:'R'.repeat(1000)}],
    excludedSourceRecords:[],
  }],
}]});
assert.equal(malicious.clusters[0].selectedSourceIdentities,'?:'+'R'.repeat(120));
assert.deepEqual(malicious.clusters[0].historyStateStarts,[]);
assert.deepEqual(malicious.unmatchedReportedMaximumByDirection,
  {'runivers-reference':1,'history-core':0}, 'missing directed metric cannot be claimed as an attributed maximum');
assert.equal(malicious.directionalHotspots[0].maxReportedDirectionalMeters,null,
  'missing directed metric must not be reported as zero or a pass');
assert.ok(!JSON.stringify(malicious).includes('coordinates'),
  'nested source metadata must never escape into public artifacts');
// A source name attached to the worst *sampled* point is not proof that it
// explains the larger comparison-level maximum (or a missing metric).
const incompleteAttribution = summarizeRuniversSourceConflicts({failedComparisons:[{
  runiversResourceId:5401, historyFirstMonth:'1553-01',
  referenceToCurrentMaxMeters:1111421, currentToReferenceMaxMeters:200,
  boundarySampleAttribution:[
    sample(400000, 'Российское царство', 'Зона русской колонизации'),
    sample(200, 'Российское царство', 'Зона русской колонизации', 'history-core'),
  ],
}]});
assert.deepEqual(incompleteAttribution.unmatchedReportedMaximumByDirection,
  {'runivers-reference':1,'history-core':0});
const unmatched = incompleteAttribution.directionalHotspots.find(row => row.sampledBoundary === 'runivers-reference');
assert.equal(unmatched.maxAttributedSampleDistanceMeters,400000);
assert.equal(unmatched.maxReportedDirectionalMeters,1111421);
assert.equal(unmatched.reportedMaximumMatches,0);
assert.equal(unmatched.reportedMaximumUnmatched,1);
assert.equal(incompleteAttribution.directionalHotspots.find(row => row.sampledBoundary === 'history-core').reportedMaximumMatches,1);
assert.equal(incompleteAttribution.auditedRange.startMonth,null);
const invalidMonth = summarizeRuniversSourceConflicts({failedComparisons:[{
  historyFirstMonth:'1520-13', boundarySampleAttribution:[],
}]});
assert.deepEqual(invalidMonth.clusters[0].historyStateStarts,[],
  'invalid calendar month must never enter dated source triage');
console.log('Runivers source-conflict triage tests passed: two-sided attribution, severity grouping, missing evidence, redaction, no acceptance override.');

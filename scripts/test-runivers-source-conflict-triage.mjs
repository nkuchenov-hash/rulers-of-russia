import assert from 'node:assert/strict';
import {summarizeRuniversSourceConflicts} from './summarize-runivers-source-conflicts.mjs';

const sample = (distanceMeters, selectedName, excludedName) => ({
  sampledBoundary: 'runivers-reference',
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
      boundarySampleAttribution:[
        sample(500000, 'not the worst sample', 'not the worst excluded'),
        sample(983475, 'Московское княжество', 'Обдорское княжество'),
      ],rawGeometry:{coordinates:[[1,2]]}},
    {runiversResourceId:5385,historyFirstMonth:'1520-01',
      symmetricMaxMeters:900000,symmetricP95Meters:700000,
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
const serialized = JSON.stringify(result);
assert.ok(!serialized.includes('66.97265625') && !serialized.includes('67.57571742'),
  'licensed boundary sample positions must not be serialized');
assert.ok(!serialized.includes('coordinates') && !serialized.includes('not the worst sample'),
  'raw geometry and lower-severity source records must not be serialized');
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
assert.ok(!JSON.stringify(malicious).includes('coordinates'),
  'nested source metadata must never escape into public artifacts');
console.log('Runivers source-conflict triage tests passed: severity grouping, missing evidence, redaction, no acceptance override.');

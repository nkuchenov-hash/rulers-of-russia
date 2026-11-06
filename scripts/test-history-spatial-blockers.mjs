import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./report-history-spatial-blockers.mjs', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'history-spatial-audit-'));
const data = path.join(tmp, 'public', 'data', 'history-core');
fs.mkdirSync(data, {recursive: true});
const write = (name, value) => fs.writeFileSync(path.join(data, name), JSON.stringify(value));
const baseChange = {
  id: 'change-1',
  geometryAction: 'replace',
  reviewStatus: 'needs-review',
  effectiveDate: {normalized: '1550-01-01', precision: 'day'},
};
const certificate = {changeId: 'change-1', uncertaintyMeters: 1000, evidenceDocumentIds: ['document-1']};
function run(model, changes, certs) {
  write('territory-model.json', model);
  write('changes.json', {territoryChanges: changes});
  write('completion-certifications.json', {spatialChangeCertifications: certs});
  return spawnSync(process.execPath, [script], {cwd: tmp, encoding: 'utf8'});
}
const model = {changeFiles: ['changes.json']};
function rejects(name, modelArg, changes, certs, expected) {
  const result = run(modelArg, changes, certs);
  assert.notEqual(result.status, 0, name + ': unexpectedly passed');
  assert.match(result.stderr, expected, name);
}
try {
  let result = run(model, [baseChange], []);
  assert.equal(result.status, 0, result.stderr);
  let report = JSON.parse(fs.readFileSync(path.join(data, 'generated', 'spatial-blockers.json')));
  assert.equal(report.totalSpatialBlockers, 1);
  assert.equal(report.totalTerritoryChanges, 1);
  assert.equal(report.metadataOnlyChanges, 0);
  assert.equal(report.geometryVerifiedChanges, 0);
  assert.equal(report.certifiedReconstructionChanges, 0);

  result = run(model, [baseChange], [certificate]);
  assert.equal(result.status, 0, result.stderr);
  report = JSON.parse(fs.readFileSync(path.join(data, 'generated', 'spatial-blockers.json')));
  assert.equal(report.totalSpatialBlockers, 0);
  assert.equal(report.certifiedReconstructionChanges, 1);
  assert.equal(report.totalTerritoryChanges, 1);
  assert.match(report.definition, /does not independently verify documentary evidence, historical boundary accuracy/);

  // Non-spatial and already verified changes must not be counted as blockers.
  result = run(model, [
    {...baseChange, geometryAction: 'metadata-only'},
    {...baseChange, id: 'change-2', reviewStatus: 'geometry-verified'},
  ], []);
  assert.equal(result.status, 0, result.stderr);
  report = JSON.parse(fs.readFileSync(path.join(data, 'generated', 'spatial-blockers.json')));
  assert.equal(report.totalSpatialBlockers, 0);
  assert.equal(report.certifiedReconstructionChanges, 0);
  assert.equal(report.totalTerritoryChanges, 2);
  assert.equal(report.metadataOnlyChanges, 1);
  assert.equal(report.geometryVerifiedChanges, 1);
  assert.equal(report.totalTerritoryChanges, report.metadataOnlyChanges + report.geometryVerifiedChanges + report.totalSpatialBlockers + report.certifiedReconstructionChanges);

  // A failed audit must invalidate the previous successful zero-blocker report.
  // Otherwise downstream consumers may incorrectly accept stale results.
  const reportPath = path.join(data, 'generated', 'spatial-blockers.json');
  assert.equal(fs.existsSync(reportPath), true, 'successful report missing');
  rejects('invalid model invalidates old report', {}, [baseChange], [], /Invalid territory model changeFiles/);
  assert.equal(fs.existsSync(reportPath), false, 'stale successful report survived failed audit');

  // A missing manifest must not be interpreted as an empty certificate list.
  fs.rmSync(path.join(data, 'completion-certifications.json'));
  const missingManifest = spawnSync(process.execPath, [script], {cwd: tmp, encoding: 'utf8'});
  assert.notEqual(missingManifest.status, 0, 'missing manifest unexpectedly passed');
  assert.match(missingManifest.stderr, /Missing completion-certifications.json/);

  rejects('null model', null, [baseChange], [], /Invalid territory model: expected an object/);
  rejects('array model', [], [baseChange], [], /Invalid territory model: expected an object/);
  for (const malformedRoot of [null, []]) {
    run(model, [baseChange], []);
    write('completion-certifications.json', malformedRoot);
    const invalidManifest = spawnSync(process.execPath, [script], {cwd: tmp, encoding: 'utf8'});
    assert.notEqual(invalidManifest.status, 0, 'malformed certification root unexpectedly passed');
    assert.match(invalidManifest.stderr, /Invalid completion certifications: expected an object/);
  }
  run(model, [baseChange], []);
  write('changes.json', null);
  const invalidChangePayload = spawnSync(process.execPath, [script], {cwd: tmp, encoding: 'utf8'});
  assert.notEqual(invalidChangePayload.status, 0, 'null change-file root unexpectedly passed');
  assert.match(invalidChangePayload.stderr, /Invalid territoryChanges array/);
  rejects('missing certificate array', model, [baseChange], undefined, /Invalid spatialChangeCertifications/);
  rejects('empty change ID', model, [{...baseChange, id: ''}], [], /Missing territory change ID/);
  rejects('null change record', model, [null], [], /Invalid territory change record/);
  rejects('array change record', model, [[]], [], /Invalid territory change record/);
  rejects('null certification record', model, [baseChange], [null], /Invalid spatial reconstruction certification record/);
  rejects('numeric change record', model, [42], [], /Invalid territory change record/);
  rejects('string change record', model, ['change-1'], [], /Invalid territory change record/);
  rejects('array certification record', model, [baseChange], [[]], /Invalid spatial reconstruction certification record/);
  rejects('numeric certification record', model, [baseChange], [42], /Invalid spatial reconstruction certification record/);
  assert.equal(fs.existsSync(reportPath), false, 'malformed records left stale successful report');
  rejects('padded change ID', model, [{...baseChange, id: ' change-1 '}], [], /Non-canonical territory change ID/);
  rejects('padded certificate ID', model, [baseChange], [{...certificate, changeId: ' change-1 '}], /Non-canonical spatial reconstruction certification changeId/);
  rejects('empty certificate ID', model, [baseChange], [{...certificate, changeId: ''}], /Missing spatial reconstruction certification changeId/);
  rejects('certificate on verified change', model, [{...baseChange, reviewStatus: 'geometry-verified'}], [certificate], /does not match an unresolved geometry change/);
  rejects('certificate on metadata-only change', model, [{...baseChange, geometryAction: 'metadata-only'}], [certificate], /does not match an unresolved geometry change/);
  rejects('non-finite uncertainty', model, [baseChange], [{...certificate, uncertaintyMeters: 'Infinity'}], /Invalid spatial reconstruction uncertaintyMeters/);
  rejects('blank evidence ID', model, [baseChange], [{...certificate, evidenceDocumentIds: ['  ']}], /Missing spatial reconstruction evidenceDocumentIds/);
  rejects('padded evidence ID', model, [baseChange], [{...certificate, evidenceDocumentIds: [' document-1 ']}], /Missing spatial reconstruction evidenceDocumentIds/);
  rejects('duplicate evidence IDs', model, [baseChange], [{...certificate, evidenceDocumentIds: ['document-1', 'document-1']}], /Missing spatial reconstruction evidenceDocumentIds/);
  assert.equal(fs.existsSync(reportPath), false, 'invalid evidence IDs left stale successful report');

  // A valid relative filename may still escape the data root via a symlink.
  // Restore valid model and certification fixtures so containment is the first failure.
  write('territory-model.json', model);
  write('completion-certifications.json', {spatialChangeCertifications: []});
  write('changes.json', {territoryChanges: [baseChange]});
  const outsideFile = path.join(tmp, 'outside-changes.json');
  fs.writeFileSync(outsideFile, JSON.stringify({territoryChanges: [baseChange]}));
  fs.rmSync(path.join(data, 'changes.json'));
  fs.symlinkSync(outsideFile, path.join(data, 'changes.json'));
  const symlinkResult = spawnSync(process.execPath, [script], {cwd: tmp, encoding: 'utf8'});
  assert.notEqual(symlinkResult.status, 0, 'escaping symlink unexpectedly passed');
  assert.match(symlinkResult.stderr, /resolves outside history-core data root/);
  fs.rmSync(path.join(data, 'changes.json'));

  // Two distinct manifest entries may alias the same on-disk file.
  // This must fail before duplicate change IDs are used as a fallback guard.
  write('changes.json', {territoryChanges: [baseChange]});
  fs.symlinkSync(path.join(data, 'changes.json'), path.join(data, 'alias-changes.json'));
  rejects('symlink alias of change file', {changeFiles: ['changes.json', 'alias-changes.json']},
    [baseChange], [], /Duplicate resolved territory changeFile/);
  assert.equal(fs.existsSync(reportPath), false, 'symlink alias left stale audit report');
  fs.rmSync(path.join(data, 'alias-changes.json'));

  // Hard links bypass realpath-based alias detection while sharing one inode.
  write('changes.json', {territoryChanges: [baseChange]});
  fs.linkSync(path.join(data, 'changes.json'), path.join(data, 'hardlink-changes.json'));
  rejects('hardlink alias of change file', {changeFiles: ['changes.json', 'hardlink-changes.json']},
    [baseChange], [], /Duplicate physical territory changeFile/);
  assert.equal(fs.existsSync(reportPath), false, 'hardlink alias left stale audit report');
  fs.rmSync(path.join(data, 'hardlink-changes.json'));

  rejects('padded change file path', {changeFiles: [' changes.json ']}, [baseChange], [], /Invalid territory model changeFile path/);
  rejects('trailing-space change file path', {changeFiles: ['changes.json ']}, [baseChange], [], /Invalid territory model changeFile path/);
  rejects('duplicate change file path', {changeFiles: ['changes.json', 'changes.json']}, [baseChange], [], /Duplicate territory model changeFile path/);
  rejects('parent traversal path', {changeFiles: ['../changes.json']}, [baseChange], [], /Invalid territory model changeFile path/);
  rejects('absolute change file path', {changeFiles: ['/tmp/changes.json']}, [baseChange], [], /Invalid territory model changeFile path/);
  rejects('windows traversal path', {changeFiles: ['..\\\\changes.json']}, [baseChange], [], /Invalid territory model changeFile path/);
  rejects('missing change files', {}, [baseChange], [], /Invalid territory model changeFiles/);
  rejects('missing territory changes', model, undefined, [], /Invalid territoryChanges array/);
  rejects('all change files empty', model, [], [], /No territory changes found across model changeFiles/);
  assert.equal(fs.existsSync(reportPath), false, 'empty input left a successful audit report');
  // Duplicate IDs across separate change files must not reuse one certificate.
  // The audit must classify every file together, not reset its ID set per file.
  write('second-changes.json', {territoryChanges: [{...baseChange, id: 'change-2'}]});
  result = run({changeFiles: ['changes.json', 'second-changes.json']}, [baseChange], []);
  assert.equal(result.status, 0, result.stderr);
  report = JSON.parse(fs.readFileSync(reportPath));
  assert.equal(report.totalTerritoryChanges, 2);
  assert.equal(report.totalSpatialBlockers, 2);
  write('second-changes.json', {territoryChanges: [{...baseChange}]});
  rejects('duplicate IDs across change files', {changeFiles: ['changes.json', 'second-changes.json']},
    [baseChange], [certificate], /Duplicate territory change ID/);
  assert.equal(fs.existsSync(reportPath), false, 'cross-file duplicate left stale audit report');

  rejects('duplicate change IDs', model, [baseChange, {...baseChange}], [], /Duplicate territory change ID/);
  rejects('duplicate certificate IDs', model, [baseChange], [certificate, certificate], /Duplicate spatial reconstruction certification changeId/);
  rejects('orphan certificate', model, [baseChange], [{...certificate, changeId: 'missing'}], /does not match an unresolved geometry change/);
  rejects('missing evidence', model, [baseChange], [{...certificate, evidenceDocumentIds: []}], /Missing spatial reconstruction evidenceDocumentIds/);
  rejects('invalid uncertainty', model, [baseChange], [{...certificate, uncertaintyMeters: 0}], /Invalid spatial reconstruction uncertaintyMeters/);
  console.log('Spatial audit fail-closed regression tests passed');
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}

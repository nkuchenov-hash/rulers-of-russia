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
  assert.equal(report.certifiedReconstructionChanges, 0);

  result = run(model, [baseChange], [certificate]);
  assert.equal(result.status, 0, result.stderr);
  report = JSON.parse(fs.readFileSync(path.join(data, 'generated', 'spatial-blockers.json')));
  assert.equal(report.totalSpatialBlockers, 0);
  assert.equal(report.certifiedReconstructionChanges, 1);

  rejects('missing change files', {}, [baseChange], [], /Invalid territory model changeFiles/);
  rejects('missing territory changes', model, undefined, [], /Invalid territoryChanges array/);
  rejects('duplicate change IDs', model, [baseChange, {...baseChange}], [], /Duplicate territory change ID/);
  rejects('duplicate certificate IDs', model, [baseChange], [certificate, certificate], /Duplicate spatial reconstruction certification changeId/);
  rejects('orphan certificate', model, [baseChange], [{...certificate, changeId: 'missing'}], /does not match an unresolved geometry change/);
  rejects('missing evidence', model, [baseChange], [{...certificate, evidenceDocumentIds: []}], /Missing spatial reconstruction evidenceDocumentIds/);
  rejects('invalid uncertainty', model, [baseChange], [{...certificate, uncertaintyMeters: 0}], /Invalid spatial reconstruction uncertaintyMeters/);
  console.log('Spatial audit fail-closed regression tests passed');
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}

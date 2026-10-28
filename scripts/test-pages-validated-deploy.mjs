import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

// Exercise the actual shell bodies in pages.yml against a local Git remote.
// No GitHub token, network access or historical geometry is needed.
const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
assert.doesNotMatch(workflow, /^  workflow_dispatch:\s*$/m,
  'manual Pages dispatch must not bypass successful main validation');
assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/,
  'Pages deployment must require a successful main validation');
function stepScript(name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert(start >= 0, `Missing Pages step: ${name}`);
  const next = workflow.indexOf('\n      - name: ', start + marker.length);
  const step = workflow.slice(start, next < 0 ? undefined : next);
  const lines = step.split('\n');
  const run = lines.indexOf('        run: |');
  assert(run >= 0, `Pages step has no shell script: ${name}`);
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (!line.startsWith('          ') && line.trim()) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

const pin = stepScript('Pin the exact validated main revision');
const guard = stepScript('Refuse superseded Pages deployment');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-validated-sha-'));
const remote = path.join(root, 'remote.git');
const work = path.join(root, 'work');
function git(...args) {
  return execFileSync('git', args, {cwd: work, encoding: 'utf8'}).trim();
}
function run(script, validatedSha) {
  return spawnSync('bash', ['-c', script], {
    cwd: work, encoding: 'utf8',
    env: {...process.env, VALIDATED_SHA: validatedSha},
  });
}
function commit(label) {
  fs.writeFileSync(path.join(work, 'revision.txt'), label);
  git('add', 'revision.txt');
  git('commit', '-m', label);
  git('push', 'origin', 'main');
  return git('rev-parse', 'HEAD');
}
try {
  execFileSync('git', ['init', '--bare', remote], {stdio: 'ignore'});
  execFileSync('git', ['init', '-b', 'main', work], {stdio: 'ignore'});
  git('config', 'user.name', 'Pages Test');
  git('config', 'user.email', 'pages-test@example.invalid');
  git('remote', 'add', 'origin', remote);

  const a = commit('validated A');
  assert.equal(run(pin, a).status, 0, 'matching validated main must be pinned');
  assert.equal(git('rev-parse', 'HEAD'), a);
  assert.equal(run(guard, a).status, 0, 'matching validated main may deploy');
  git('checkout', 'main');

  const b = commit('unvalidated B');
  const obsoletePin = run(pin, a);
  assert.notEqual(obsoletePin.status, 0, 'an old successful workflow must not publish newer unvalidated main');
  assert.match(obsoletePin.stdout + obsoletePin.stderr, /superseded/);
  assert.equal(run(pin, b).status, 0, 'newly validated main can be pinned');
  assert.equal(git('rev-parse', 'HEAD'), b);
  git('checkout', 'main');

  commit('unvalidated C');
  const staleDeploy = run(guard, b);
  assert.notEqual(staleDeploy.status, 0, 'a main update during build must block the stale deployment');
  assert.match(staleDeploy.stdout + staleDeploy.stderr, /newer main must pass its own validation/);
  console.log('Pages SHA safety passed: exact revision pin, superseded workflow rejection, and pre-deploy race guard.');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}

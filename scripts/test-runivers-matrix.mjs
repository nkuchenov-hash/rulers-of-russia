import assert from 'node:assert/strict';
import fs from 'node:fs';

// A Runivers matrix change must not silently omit or duplicate historical
// years. Year-level reference data cannot resolve intra-year transitions, so
// every CI shard is deliberately aligned to complete calendar years.
const workflow = fs.readFileSync(new URL('../.github/workflows/runivers-baseline-discovery.yml', import.meta.url), 'utf8');
const rows = [...workflow.matchAll(/^\s+- id: (\d{4}-\d{4})\r?\n\s+start: (\d{4}-\d{2})\r?\n\s+end: (\d{4}-\d{2})/gm)]
  .map(([, id, start, end]) => ({id, start, end}));
assert.ok(rows.length >= 12, 'Runivers matrix must contain the complete set of dated shards');
assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'Runivers shard IDs must be unique');

for (const row of rows) {
  assert.match(row.start, /^\d{4}-01$/, row.id + ': shard must start in January');
  assert.match(row.end, /^\d{4}-12$/, row.id + ': shard must end in December');
  assert.ok(row.start <= row.end, row.id + ': reversed shard range');
  assert.equal(row.id, row.start.slice(0, 4) + '-' + row.end.slice(0, 4),
    row.id + ': ID must describe its actual interval');
}

for (let year = 1462; year <= 2020; year += 1) {
  const start = String(year).padStart(4, '0') + '-01';
  const end = String(year).padStart(4, '0') + '-12';
  const owners = rows.filter(row => row.start <= start && row.end >= end);
  assert.equal(owners.length, 1,
    year + ': each historical calendar year must belong to exactly one Runivers shard');
}
assert.ok(rows.every(row => row.start >= '1462-01' && row.end <= '2020-12'),
  'no matrix shard may silently extend outside the independent reference audit range');

// Run 40576855305 reached the 30-minute timeout on the old 39-layer
// 1800–1849 shard after a successful HTTP preflight. The split keeps all
// 600 months, without changing any geometry, tolerance or acceptance rule.
const nineteenthCentury = rows.filter(row => row.start <= '1849-12' && row.end >= '1800-01')
  .sort((a, b) => a.start.localeCompare(b.start));
assert.deepEqual(nineteenthCentury.map(row => row.id),
  ['1800-1816', '1817-1833', '1834-1849'],
  'the timed-out 1800–1849 interval must stay in three bounded full-year jobs');

console.log('Runivers CI matrix integrity passed: 1462–2020 has exactly one shard per year; 1800–1849 split into three timeout-safe jobs.');

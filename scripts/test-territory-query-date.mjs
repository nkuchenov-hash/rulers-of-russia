import assert from 'node:assert/strict';
import {parseTerritoryQueryDate} from '../src/app/territory/territoryQueryDate.ts';

const parse = search => parseTerritoryQueryDate(search, 862, 2026);
assert.deepEqual(parse(''), {valid:true, year:2026, month:null});
assert.deepEqual(parse('?year=0862&month=01'), {valid:true, year:862, month:1});
assert.deepEqual(parse('?year=1721&month=11'), {valid:true, year:1721, month:11});
assert.deepEqual(parse('?year=1922&month=12'), {valid:true, year:1922, month:12});
assert.deepEqual(parse('?month=7'), {valid:true, year:2026, month:7});
for (const query of [
  '?year=1', '?year=2027', '?year=0', '?year=', '?year=NaN',
  '?year=1721.5', '?year=-1', '?year=9007199254740993',
  '?year=1721&year=1922', '?year=1721&month=0',
  '?year=1721&month=13', '?year=1721&month=',
  '?year=1721&month=1.5', '?year=1721&month=2&month=11',
]) {
  const result = parse(query);
  assert.equal(result.valid, false, query + ' must not silently render another date');
  assert.ok(result.error, query + ' must display a diagnostic');
}
console.log('Territory deep links reject unsupported, malformed and ambiguous dates instead of clamping them to another historical state.');

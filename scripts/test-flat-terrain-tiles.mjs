import assert from 'node:assert/strict';
import fs from 'node:fs';
import {visibleTerrainCopies} from '../src/app/territory/flatTerrainTiles.mjs';

const copies = visibleTerrainCopies;
assert.deepEqual(copies(0, 400, 400), [0], 'aligned world needs one draw');
assert.deepEqual(copies(-100, 400, 400), [0, 1], 'crossing the right seam needs two');
assert.deepEqual(copies(100, 400, 400), [-1, 0], 'crossing the left seam needs two');
assert.deepEqual(copies(-1600, 400, 400), [4], 'panning four full worlds remains visible');
assert.deepEqual(copies(2000, 400, 400), [-5], 'reverse panning five worlds remains visible');
assert.deepEqual(copies(-135, 400, 1200), [0, 1, 2, 3], 'wide viewport covers all copies');
assert.deepEqual(copies(100, 3000, 400), [-1, 0], 'high zoom draws only visible copies');
assert.deepEqual(copies(0, 3000, 400), [0], 'high zoom does not draw five giant textures');
for (const [left, worldWidth, width] of [
  [-100, 400, 400], [0, 400, 400], [2000, 400, 400],
  [-1000, 3000, 400], [450, 300, 1300],
  [-7000, 1200, 1920], [-135, 400, 1200],
]) {
  const result = copies(left, worldWidth, width);
  assert.ok(result.length <= Math.ceil(width / worldWidth) + 1);
  assert.ok(left + result[0] * worldWidth <= 0, 'first tile reaches left edge');
  assert.ok(left + (result.at(-1) + 1) * worldWidth >= width, 'last tile reaches right edge');
  for (const n of result) {
    assert.ok(left + (n + 1) * worldWidth > 0 && left + n * worldWidth < width,
      'no completely offscreen terrain draws');
  }
}
for (const args of [[NaN, 400, 400], [0, 0, 400], [0, Infinity, 400], [0, 400, -1]]) {
  assert.deepEqual(copies(...args), [], 'invalid viewport/scale must not allocate tiles');
}
const flat = fs.readFileSync(new URL('../src/app/territory/HistoricalTerritoryFlatMap.jsx', import.meta.url), 'utf8');
assert.match(flat, /import \{visibleTerrainCopies\} from '\.\/flatTerrainTiles\.mjs'/);
assert.match(flat, /for\(const repeat of visibleTerrainCopies\(x0,fullWidth,width\)\)/);
assert.doesNotMatch(flat, /for\(let repeat=-2;repeat<=2;repeat\+\+\)/,
  'the fixed five-copy terrain loop must not regress');
console.log('2D terrain draws only visible wrapped copies, including extreme pan and zoom.');

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
// The vector projection is clipped to one world. Terrain-only repetition
// leaves Russian borders and background states blank after a long pan.
// Verify that the same visible-copy selection wraps every vector layer,
// and that labels are culled using their repeated SCREEN coordinate.
for (const [dx, width, height, zoom] of [
  [0, 400, 400, 1], [-1600, 400, 400, 1],
  [2000, 400, 400, 1], [-9000, 1400, 600, 2],
  [4000, 1400, 600, 8],
]) {
  const scale = Math.min(width / (2 * Math.PI), height / Math.PI) * zoom;
  const worldWidth = 2 * Math.PI * scale;
  const tx = width / 2 + dx;
  const vectorCopies = copies(tx - Math.PI * scale, worldWidth, width);
  assert.ok(vectorCopies.length > 0 && vectorCopies.length <= Math.ceil(width / worldWidth) + 1);
  assert.ok(vectorCopies.some(n => {
    const left = tx - Math.PI * scale + n * worldWidth;
    return left < width && left + worldWidth > 0;
  }), 'wrapped state polygons must intersect the visible canvas');
}
assert.match(flat, /for\(const repeat of visibleTerrainCopies\(tx-Math\.PI\*scale,fullWidth,width\)\)\{/,
  'world vectors must use the visible projected-world copies, not terrain texture origin');
assert.match(flat, /ctx\.translate\(repeat\*fullWidth,0\)/,
  'graticule, states, History Core, verified boundaries and labels must share the same wrap');
assert.match(flat, /screenX=point\?\.\[0\]\+repeat\*fullWidth/,
  'labels on repeated worlds must not be culled using their unwrapped coordinates');
assert.match(flat, /ctx\.restore\(\);\s*\}/,
  'canvas transforms must be restored after each wrapped vector copy');
console.log('2D projected state vectors and labels repeat across multiple world pans.');

console.log('2D terrain draws only visible wrapped copies, including extreme pan and zoom.');

import assert from 'node:assert/strict';
import {zoomFlatCameraAt,flatWheelZoomFactor} from '../src/app/territory/flatCameraZoom.mjs';
import {readFileSync} from 'node:fs';

const almost = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);

// Geographic point beneath an off-center wheel or pinch anchor stays put.
for (const camera of [
  {zoom: 1, dx: 0, dy: 0},
  {zoom: 2.4, dx: -140, dy: 75},
  {zoom: 11.9, dx: 30, dy: -80},
]) {
  for (const factor of [0.7, 1.15, 2]) {
    const anchor = [220, -115];
    const geographic = [(anchor[0] - camera.dx) / camera.zoom,
      (anchor[1] - camera.dy) / camera.zoom];
    const next = zoomFlatCameraAt(camera, factor, ...anchor);
    assert.ok(next.zoom >= 1 && next.zoom <= 12);
    almost(next.dx + next.zoom * geographic[0], anchor[0], 'longitude anchor');
    almost(next.dy + next.zoom * geographic[1], anchor[1], 'latitude anchor');
  }
}
assert.deepEqual(zoomFlatCameraAt({zoom: 1, dx: 3, dy: 4}, 0.5, 200, 100),
  {zoom: 1, dx: 3, dy: 4}, 'lower zoom limit must not pan');
assert.deepEqual(zoomFlatCameraAt({zoom: 12, dx: 3, dy: 4}, 2, 200, 100),
  {zoom: 12, dx: 3, dy: 4}, 'upper zoom limit must not pan');
const translated = zoomFlatCameraAt({zoom: 2, dx: 10, dy: 20}, 1.5, 200, 100);
almost(translated.dx + 3 * ((200 - 10) / 2) + 17, 217, 'pinch translation x');
almost(translated.dy + 3 * ((100 - 20) / 2) - 8, 92, 'pinch translation y');


// Pixel-based trackpads must not zoom 15% for a one-pixel wheel event.
const tiny = flatWheelZoomFactor(-1, 0);
assert.ok(tiny > 1 && tiny < 1.01, 'one-pixel trackpad scroll must zoom smoothly');
const notch = flatWheelZoomFactor(-120, 0);
assert.ok(notch > 1.15 && notch < 1.25, 'ordinary wheel notch must still zoom perceptibly');
almost(notch * flatWheelZoomFactor(120, 0), 1, 'opposite wheel directions are symmetric');
almost(flatWheelZoomFactor(-3, 1), notch, 'three wheel lines match 120 CSS pixels');
assert.ok(flatWheelZoomFactor(-1, 2) <= Math.exp(0.4), 'page wheel event must be bounded');
assert.ok(flatWheelZoomFactor(-1, 0, true) > tiny, 'ctrl+wheel pinch must respond to fine input');
assert.ok(flatWheelZoomFactor(-1e8, 0) <= Math.exp(0.4), 'huge wheel delta must be capped');
assert.ok(flatWheelZoomFactor(1e8, 0) >= Math.exp(-0.4), 'huge reverse delta must be capped');
for (const value of [0, NaN, Infinity, -Infinity]) {
  assert.equal(flatWheelZoomFactor(value, 0), 1, 'zero or invalid delta is inert');
}
assert.equal(flatWheelZoomFactor(1, 3), 1, 'unknown deltaMode is inert');
const flatMap = readFileSync(new URL('../src/app/territory/HistoricalTerritoryFlatMap.jsx', import.meta.url), 'utf8');
assert.match(flatMap, /flatWheelZoomFactor\(e\.deltaY,e\.deltaMode,e\.ctrlKey\)/,
  'production 2D map must normalize the native wheel delta');
assert.match(flatMap, /if\(factor===1\)\{/,
  'zero vertical delta must be handled separately from zoom');
assert.match(flatMap, /if\(Number\.isFinite\(e\.deltaX\)&&e\.deltaX!==0\)\{\s*e\.preventDefault\(\)/,
  'horizontal trackpad swipes must be canceled to avoid scrolling the page');
assert.match(flatMap, /dx:prev\.dx-e\.deltaX\*unit/,
  'horizontal trackpad swipes must pan the map instead of being discarded');
assert.doesNotMatch(flatMap, /const factor=e\.deltaY>0\?\.85:1\.15/,
  'fixed-per-event zoom must not return');
console.log('2D wheel, trackpad and browser pinch zoom are continuous and bounded.');

console.log('Flat map cursor-anchored zoom preserves location, pan and clamped limits.');

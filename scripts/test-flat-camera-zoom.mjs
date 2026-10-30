import assert from 'node:assert/strict';
import {zoomFlatCameraAt} from '../src/app/territory/flatCameraZoom.mjs';

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
console.log('Flat map cursor-anchored zoom preserves location, pan and clamped limits.');

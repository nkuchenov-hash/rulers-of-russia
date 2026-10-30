import assert from 'node:assert/strict';
import {createGlobeTextureLoadGuard} from '../src/app/territory/globeTextureLoadGuard.mjs';

const guard = createGlobeTextureLoadGuard();
let applied = 0;
let disposed = 0;
const texture = () => ({dispose() {disposed++;}});
assert.equal(guard.isActive(), true);
assert.equal(guard.accept(texture(), () => {applied++;}), true);
assert.equal(applied, 1);
assert.equal(disposed, 0);

// Simulate a TextureLoader callback arriving after React effect cleanup.
guard.stop();
guard.stop();
assert.equal(guard.isActive(), false);
assert.equal(guard.accept(texture(), () => {applied++;}), false);
assert.equal(applied, 1, 'late callback must not update disposed WebGL resources');
assert.equal(disposed, 1, 'late texture must be released');
console.log('Late globe texture callbacks are disposed after unmount.');

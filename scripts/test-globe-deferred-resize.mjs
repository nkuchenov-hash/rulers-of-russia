import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scheduleMountedGlobeResize} from '../src/app/territory/globeDeferredResize.mjs';

let queued = new Map(), nextId = 0, canceled = [];
const request = callback => {const id = ++nextId; queued.set(id, callback); return id;};
const cancel = id => {canceled.push(id); queued.delete(id);};
const run = id => {const callback = queued.get(id); queued.delete(id); callback?.();};
const renderer = {domElement:{isConnected:true}};
let resized = 0;
const live = {renderer, resize:()=>{resized++;}};
let current = live;

const finish = scheduleMountedGlobeResize(live, () => current, request, cancel);
run(nextId);
assert.equal(resized, 1, 'live mounted globe must still resize on the next frame');
finish();
assert.deepEqual(canceled, [], 'completed frame needs no cancellation');

const cleanup = scheduleMountedGlobeResize(live, () => current, request, cancel);
const lateCallback = queued.get(nextId);
cleanup();
assert.equal(queued.size, 0, 'React effect cleanup cancels pending frame');
lateCallback();
assert.equal(resized, 1, 'callback racing cleanup must not touch disposed WebGL');

scheduleMountedGlobeResize(live, () => current, request, cancel);
current = {renderer:{domElement:{isConnected:true}},resize:()=>{throw Error('replacement renderer resized')}};
run(nextId);
assert.equal(resized, 1, 'replaced runtime must not receive a stale resize');
current = live;
scheduleMountedGlobeResize(live, () => current, request, cancel);
renderer.domElement.isConnected = false;
run(nextId);
assert.equal(resized, 1, 'detached canvas must not be resized');
renderer.domElement.isConnected = true;
scheduleMountedGlobeResize(live, () => current, request, cancel);
run(nextId);
assert.equal(resized, 2, 'a subsequent live resize still works');

const source = fs.readFileSync(new URL('../src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx',import.meta.url),'utf8');
assert.match(source, /scheduleMountedGlobeResize\(r,\(\)=>sceneRef\.current,/,
  'production globe must use the guarded deferred resize');
assert.match(source, /return cancelDeferredResize;/,
  'React effect must cancel a pending frame during cleanup');
console.log('Deferred globe resize is canceled on cleanup and guarded against stale/disconnected WebGL runtimes.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {observeMountedGlobeVisibility,scheduleMountedGlobeResize} from '../src/app/territory/globeDeferredResize.mjs';

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

// Projection restore must not depend exclusively on a throttled animation
// frame: render once during the layout effect and once after the commit task.
// The existing guarded scheduler prevents the second render after unmount.
const projectionEffect = source.slice(
  source.indexOf('  useLayoutEffect(()=>{'),
  source.indexOf('  },[projection]);') + '  },[projection]);'.length
);
assert.match(projectionEffect, /runtime\.resize\?\.\(\)/,
  'returning to the globe must draw synchronously during the layout effect');
assert.match(projectionEffect, /return scheduleMountedGlobeResize\(/,
  'returning to the globe must schedule a guarded post-commit redraw');
assert.match(projectionEffect, /window\.setTimeout\(callback,0\)/,
  'post-commit redraw must not depend on requestAnimationFrame');
assert.match(projectionEffect, /window\.clearTimeout\(timer\)/,
  'post-commit redraw must be canceled on projection change/unmount');

const pendingTasks = new Map();
let taskId = 0, postCommitRenders = 0;
const scheduleTask = cb => {const id = ++taskId; pendingTasks.set(id,cb); return id;};
const cancelTask = id => pendingTasks.delete(id);
const restored = {renderer:{domElement:{isConnected:true}},resize:()=>{postCommitRenders++;}};
let currentRestored = restored;
const finishRestore = scheduleMountedGlobeResize(
  restored,()=>currentRestored,scheduleTask,cancelTask
);
assert.equal(postCommitRenders,0,'second redraw must wait until after commit');
pendingTasks.get(taskId)();
assert.equal(postCommitRenders,1,'mounted globe must receive the post-commit redraw');
finishRestore();
const abandonRestore = scheduleMountedGlobeResize(
  restored,()=>currentRestored,scheduleTask,cancelTask
);
const abandonedTask = pendingTasks.get(taskId);
abandonRestore();
currentRestored = null;
abandonedTask();
assert.equal(postCommitRenders,1,'a canceled post-commit task must not render a removed globe');
// A ResizeObserver cannot detect visibility:hidden -> visible. A host style
// mutation must redraw exactly on restoration, without touching stale scenes.
let visibility = 'visible', lastObserver = null, visibilityRenders = 0;
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; this.disconnected = false; lastObserver = this; }
  observe(host, options) {
    assert.equal(host, visibilityHost);
    assert.deepEqual(options, {attributes: true, attributeFilter: ['style']});
  }
  disconnect() { this.disconnected = true; }
}
const visibilityHost = {};
const visibleRuntime = {renderer:{domElement:{isConnected:true}},resize:()=>{visibilityRenders++;}};
let activeRuntime = visibleRuntime;
const stopObserving = observeMountedGlobeVisibility(
  visibleRuntime,visibilityHost,()=>activeRuntime,FakeMutationObserver,()=>visibility
);
const observer = lastObserver;
observer.callback();
assert.equal(visibilityRenders,0,'initial visible host must not redraw');
visibility = 'hidden'; observer.callback();
visibility = 'visible'; observer.callback();
assert.equal(visibilityRenders,1,'host restoration must redraw once');
observer.callback();
assert.equal(visibilityRenders,1,'duplicate visible mutations must not redraw');
visibility = 'hidden'; observer.callback();
activeRuntime = {renderer:{domElement:{isConnected:true}}};
visibility = 'visible'; observer.callback();
assert.equal(visibilityRenders,1,'replaced runtime must never redraw');
visibility = 'hidden'; observer.callback();
activeRuntime = visibleRuntime;
visibleRuntime.renderer.domElement.isConnected = false;
visibility = 'visible'; observer.callback();
assert.equal(visibilityRenders,1,'detached WebGL canvas must never redraw');
visibleRuntime.renderer.domElement.isConnected = true;
visibility = 'hidden'; observer.callback();
visibility = 'visible'; observer.callback();
assert.equal(visibilityRenders,2,'mounted runtime must recover on the next restore');
stopObserving();
assert.equal(observer.disconnected,true,'cleanup must disconnect visibility observer');
visibility = 'hidden'; observer.callback();
visibility = 'visible'; observer.callback();
assert.equal(visibilityRenders,2,'late callbacks after cleanup must be ignored');
assert.match(source,/observeMountedGlobeVisibility\(runtime,host,\(\)=>sceneRef\.current,MutationObserver,/,
  'production globe must observe the live host visibility');
assert.match(source,/ro\.disconnect\(\);stopVisibilityObserver\(\);/,
  'React cleanup must disconnect both resize and visibility observers');
console.log('Globe redraw is synchronous on projection restore, with a guarded cancellable post-commit task.');

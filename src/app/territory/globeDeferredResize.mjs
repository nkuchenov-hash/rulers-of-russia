// Keep a deferred WebGL resize tied to the live renderer instance.
// A queued frame must never resize a disposed globe after a projection
// change, React cleanup, or replacement of the WebGL canvas.
export function scheduleMountedGlobeResize(runtime, currentRuntime, requestFrame, cancelFrame) {
  if (!runtime || typeof currentRuntime !== 'function'
    || typeof requestFrame !== 'function' || typeof cancelFrame !== 'function') {
    return () => {};
  }
  let pending = true;
  const frame = requestFrame(() => {
    if (!pending) return;
    pending = false;
    if (currentRuntime() === runtime && runtime.renderer?.domElement?.isConnected) {
      runtime.resize?.();
    }
  });
  return () => {
    if (!pending) return;
    pending = false;
    cancelFrame(frame);
  };
}

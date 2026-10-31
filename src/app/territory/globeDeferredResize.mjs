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


// A visibility-only projection switch does not notify ResizeObserver.
// Observe the host's React style commit independently of RAF and effects,
// and redraw only on a genuine hidden -> visible transition. This is a
// guarded fallback for the intermittent flat -> globe missed-frame case.
export function observeMountedGlobeVisibility(runtime, host, currentRuntime, ObserverCtor, getVisibility) {
  if (!runtime || !host || typeof currentRuntime !== 'function'
    || typeof ObserverCtor !== 'function' || typeof getVisibility !== 'function') {
    return () => {};
  }
  let active = true;
  let wasVisible = getVisibility(host) === 'visible';
  const observer = new ObserverCtor(() => {
    if (!active) return;
    const visible = getVisibility(host) === 'visible';
    if (visible && !wasVisible && currentRuntime() === runtime
      && runtime.renderer?.domElement?.isConnected) {
      runtime.resize?.();
    }
    wasVisible = visible;
  });
  observer.observe(host, {attributes: true, attributeFilter: ['style']});
  return () => {
    active = false;
    observer.disconnect();
  };
}

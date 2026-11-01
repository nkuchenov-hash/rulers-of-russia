// A zoom around a screen-space anchor must preserve the geographic point
// beneath that anchor, including when the requested scale hits the limits.
// Camera offsets are measured from the center of the 2D map host.
export function zoomFlatCameraAt(camera, factor, anchorX, anchorY) {
  const zoom = Math.min(12, Math.max(1, camera.zoom * factor));
  const ratio = zoom / camera.zoom;
  return {
    ...camera,
    zoom,
    dx: camera.dx + (1 - ratio) * (anchorX - camera.dx),
    dy: camera.dy + (1 - ratio) * (anchorY - camera.dy),
  };
}

// Native wheel events report pixels (trackpads), lines (mouse wheels), or
// pages. A fixed 15% zoom for every event makes one-pixel trackpad gestures
// jump as much as a full mouse-wheel notch. Keep zoom continuous and bounded;
// ctrl+wheel is Chromium's pinch gesture and needs a finer-input response.
export function flatWheelZoomFactor(deltaY, deltaMode = 0, ctrlKey = false) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const unit = deltaMode === 0 ? 1 : deltaMode === 1 ? 40 : deltaMode === 2 ? 400 : null;
  if (unit === null) return 1;
  const exponent = Math.min(Math.abs(deltaY * unit) * (ctrlKey ? 0.01 : 0.0015), 0.4);
  return Math.exp(-Math.sign(deltaY) * exponent);
}

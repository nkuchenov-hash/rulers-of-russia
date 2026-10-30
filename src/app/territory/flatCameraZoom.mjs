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

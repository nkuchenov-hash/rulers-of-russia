// Shared fail-closed WGS84 line integrity for Runivers transport and research diagnostics.
// Geometry is inspected only in memory; no source coordinates are exported.
const validPoint = point => Array.isArray(point) && point.length >= 2
  && Number.isFinite(point[0]) && Number.isFinite(point[1])
  && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;

export function hasValidWgs84Line(line) {
  if (!Array.isArray(line) || line.length < 2 || !line.every(validPoint)) return false;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const lonSeparation = Math.abs(b[0] - a[0]);
    // Exactly half a world has two equally short directions; neither is
    // a defensible inferred boundary without additional source metadata.
    if (lonSeparation === 180) return false;
    // +180 and -180 represent one meridian; at either pole all longitudes
    // represent the same physical point. Such zero-length segments can hide
    // an incomplete reference even when another segment is nonzero.
    if (a[1] === b[1] && (lonSeparation === 0 || lonSeparation === 360
      || Math.abs(a[1]) === 90)) return false;
  }
  return true;
}

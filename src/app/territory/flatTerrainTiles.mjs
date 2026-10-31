// Only draw equirectangular terrain copies that intersect the visible 2D
// canvas. A fixed [-2, 2] range wastes texture draws at high zoom and leaves
// the map blank after users pan across more than two world widths.
// Render-only: no changes to historical or reference geometry.
export function visibleTerrainCopies(left, worldWidth, viewportWidth) {
  if (![left, worldWidth, viewportWidth].every(Number.isFinite)
    || worldWidth <= 0 || viewportWidth <= 0) return [];
  const first = Math.floor(-left / worldWidth);
  const last = Math.ceil((viewportWidth - left) / worldWidth) - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last < first) return [];
  return Array.from({length: last - first + 1}, (_, i) => first + i);
}

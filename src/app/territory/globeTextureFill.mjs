// Shared drawing primitive for the globe's equirectangular state texture.
// geoPath performs geographic antimeridian clipping before writing to Canvas.
// Projecting raw ring vertices with Path2D instead joins +179° to -179°
// through the middle of the world, painting false territorial bands.
export function fillProjectedFeature(ctx, path, feature, fillStyle, opacity) {
  ctx.beginPath();
  path(feature);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = fillStyle;
  // Preserve interior holes even when source ring winding varies.
  ctx.fill('evenodd');
}

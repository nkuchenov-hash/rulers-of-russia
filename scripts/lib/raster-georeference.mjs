const EPS = 1e-9;

const finitePair = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

function barycentric(point, a, b, c) {
  const [x, y] = point;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const [x3, y3] = c;
  const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  if (Math.abs(det) < EPS) return null;
  const w1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
  const w2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
  const w3 = 1 - w1 - w2;
  return [w1, w2, w3];
}

const insideWeights = weights => weights && weights.every(weight => weight >= -EPS && weight <= 1 + EPS);

export function validateRasterGeoreference(georef, raster) {
  if (!raster || !Number.isInteger(raster.width) || !Number.isInteger(raster.height) || raster.width <= 0 || raster.height <= 0) {
    throw new Error('Raster georeference requires positive integer source raster width/height');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(raster.sha256 ?? ''))) {
    throw new Error('Raster georeference requires source raster SHA-256');
  }
  if (georef?.method !== 'piecewise-affine-triangulation') {
    throw new Error(`Unsupported raster georeference method ${georef?.method ?? '<missing>'}`);
  }
  if (!Array.isArray(georef.gcps) || georef.gcps.length < 3) {
    throw new Error('Raster georeference requires at least three GCPs');
  }
  georef.gcps.forEach((gcp, index) => {
    if (!finitePair(gcp.pixel) || !finitePair(gcp.lonLat)) throw new Error(`Invalid GCP ${index}`);
    const [x, y] = gcp.pixel;
    const [lon, lat] = gcp.lonLat;
    if (x < 0 || x > raster.width - 1 || y < 0 || y > raster.height - 1) throw new Error(`GCP ${index} lies outside source raster`);
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new Error(`GCP ${index} has invalid geographic coordinates`);
  });
  if (!Array.isArray(georef.triangles) || georef.triangles.length === 0) {
    throw new Error('Raster georeference requires explicit GCP triangulation');
  }
  georef.triangles.forEach((triangle, index) => {
    if (!Array.isArray(triangle) || triangle.length !== 3 || !triangle.every(Number.isInteger)) throw new Error(`Invalid triangle ${index}`);
    if (new Set(triangle).size !== 3 || triangle.some(i => i < 0 || i >= georef.gcps.length)) throw new Error(`Triangle ${index} references invalid GCPs`);
    const points = triangle.map(i => georef.gcps[i].pixel);
    if (!barycentric(points[0], points[0], points[1], points[2])) throw new Error(`Triangle ${index} is degenerate`);
  });
  if (!Number.isFinite(georef.uncertaintyKm) || georef.uncertaintyKm <= 0) {
    throw new Error('Raster georeference requires a positive uncertaintyKm');
  }
}

export function transformRasterPoint(point, georef, raster) {
  validateRasterGeoreference(georef, raster);
  if (!finitePair(point)) throw new Error('Invalid traced raster point');
  const [x, y] = point;
  if (x < 0 || x > raster.width - 1 || y < 0 || y > raster.height - 1) throw new Error(`Traced raster point ${JSON.stringify(point)} lies outside source raster`);

  for (let triangleIndex = 0; triangleIndex < georef.triangles.length; triangleIndex += 1) {
    const triangle = georef.triangles[triangleIndex];
    const pixelTriangle = triangle.map(i => georef.gcps[i].pixel);
    const weights = barycentric(point, ...pixelTriangle);
    if (!insideWeights(weights)) continue;
    const target = triangle.map(i => georef.gcps[i].lonLat);
    const lon = weights[0] * target[0][0] + weights[1] * target[1][0] + weights[2] * target[2][0];
    const lat = weights[0] * target[0][1] + weights[1] * target[1][1] + weights[2] * target[2][1];
    return {lonLat: [lon, lat], triangleIndex, weights};
  }
  throw new Error(`Traced raster point ${JSON.stringify(point)} lies outside explicit georeference triangulation`);
}

export function transformRasterPath(points, georef, raster) {
  return points.map(point => transformRasterPoint(point, georef, raster).lonLat);
}

export function rasterTraceSourcePoints(recipe, geometryType) {
  if (geometryType === 'LineString' || geometryType === 'MultiPoint') return recipe.pixelPoints ?? [];
  if (geometryType === 'Polygon') return (recipe.pixelRings ?? []).flat();
  if (geometryType === 'MultiPolygon') return (recipe.pixelPolygons ?? []).flat(2);
  return [];
}

export function materializeRasterGeometry(recipe, geometryType) {
  const georef = recipe.georeference;
  const raster = recipe.sourceRaster;
  validateRasterGeoreference(georef, raster);
  const close = ring => {
    const transformed = transformRasterPath(ring, georef, raster);
    if (transformed.length && (Math.abs(transformed[0][0] - transformed.at(-1)[0]) > EPS || Math.abs(transformed[0][1] - transformed.at(-1)[1]) > EPS)) {
      transformed.push([...transformed[0]]);
    }
    return transformed;
  };
  if (geometryType === 'LineString') return {type: geometryType, coordinates: transformRasterPath(recipe.pixelPoints, georef, raster)};
  if (geometryType === 'MultiPoint') return {type: geometryType, coordinates: transformRasterPath(recipe.pixelPoints, georef, raster)};
  if (geometryType === 'Polygon') return {type: geometryType, coordinates: recipe.pixelRings.map(close)};
  if (geometryType === 'MultiPolygon') return {type: geometryType, coordinates: recipe.pixelPolygons.map(polygon => polygon.map(close))};
  throw new Error(`Unsupported raster geometry type ${geometryType}`);
}

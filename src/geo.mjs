// Geometry helpers: real-world (lat/lon) polylines and schematic (grid) polylines.

const LAT0 = 43.7;
const LON0 = -79.4;
const KY = 110540;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);

export const toMeters = (lat, lon) => [(lon - LON0) * KX, (lat - LAT0) * KY];

function prep(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, length: cum[cum.length - 1] };
}

/** Real-world polyline from [lat, lon] pairs, measured in metres. */
export function geoPolyline(latLons) {
  return prep(latLons.map(([lat, lon]) => toMeters(lat, lon)));
}

/** Schematic polyline from [x, y] grid pairs. */
export function gridPolyline(pts) {
  return prep(pts.map((p) => [p[0], p[1]]));
}

/** Nearest point on a geo polyline: returns distance (m) and arclength s (m). */
export function snapToGeo(poly, lat, lon) {
  const [px, py] = toMeters(lat, lon);
  let best = { dist: Infinity, s: 0 };
  for (let i = 1; i < poly.pts.length; i++) {
    const [ax, ay] = poly.pts[i - 1];
    const [bx, by] = poly.pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best.dist) best = { dist: d, s: poly.cum[i - 1] + t * Math.sqrt(len2) };
  }
  return best;
}

function locate(poly, s) {
  const c = Math.max(0, Math.min(poly.length, s));
  let i = 1;
  while (i < poly.pts.length - 1 && poly.cum[i] < c) i++;
  const seg = poly.cum[i] - poly.cum[i - 1];
  return { i, t: seg === 0 ? 0 : (c - poly.cum[i - 1]) / seg };
}

/** Point and heading (radians) at arclength s along a polyline (clamped). */
export function pointAt(poly, s) {
  const { i, t } = locate(poly, s);
  const [ax, ay] = poly.pts[i - 1];
  const [bx, by] = poly.pts[i];
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, angle: Math.atan2(by - ay, bx - ax) };
}

/**
 * Offset a polyline sideways by `d` (positive = to the right of travel; screen y points down),
 * with mitred corners. The result keeps the vertex count, so it stays parallel to the original.
 */
export function offsetPoints(pts, d) {
  const normals = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const len = Math.hypot(dx, dy) || 1;
    normals.push([-dy / len, dx / len]);
  }
  return pts.map((p, i) => {
    const a = normals[i - 1] ?? normals[i];
    const b = normals[i] ?? normals[i - 1];
    const k = 1 + a[0] * b[0] + a[1] * b[1];
    const m = k < 0.2 ? a : [(a[0] + b[0]) / k, (a[1] + b[1]) / k]; // near-reversal: don't spike
    return [p[0] + m[0] * d, p[1] + m[1] * d];
  });
}

/** Point on an offset copy of `poly` (see offsetPoints) at the position matching arclength s of `poly`. */
export function laneAt(poly, lanePts, s) {
  const { i, t } = locate(poly, s);
  const [ax, ay] = lanePts[i - 1];
  const [bx, by] = lanePts[i];
  const [px, py] = poly.pts[i - 1];
  const [qx, qy] = poly.pts[i];
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, angle: Math.atan2(qy - py, qx - px) };
}

/** Arclength of the vertex of `poly` closest to the given grid point (used to place pinned nodes). */
export function vertexS(poly, x, y) {
  for (let i = 0; i < poly.pts.length; i++) if (poly.pts[i][0] === x && poly.pts[i][1] === y) return poly.cum[i];
  throw new Error(`no vertex at ${x},${y}`);
}

/** Piecewise-linear map y(x) through sorted knots [[x0,y0],[x1,y1],…], clamped at the ends. */
export function interpolate(knots, x) {
  if (x <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    if (x <= knots[i][0]) {
      const [x0, y0] = knots[i - 1];
      const [x1, y1] = knots[i];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return knots[knots.length - 1][1];
}

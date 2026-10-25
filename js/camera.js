/**
 * Camera presets for reading the city.
 *
 *  plan  — 2D plan, pitch 0 (table/legend reading, choropleth).
 *  city  — 3D overview: a conventional perspective, pitched, looking a little
 *          east of north so the three Bangkok cores spread across a wide screen.
 *  model — close-up "architectural model": the vertical field of view is
 *          narrowed to 14° so the camera sits far away and perspective
 *          convergence almost disappears — building verticals stay upright,
 *          like an axonometric drawing or a white massing model. MapLibre has
 *          no orthographic camera, but a narrow FOV is the standard way to get
 *          the look (setVerticalFieldOfView, MapLibre ≥ 4.7).
 *  eye   — two-point perspective for one venue: a strongly pitched camera
 *          (pitch 75°) with a narrow field of view (24°), so verticals stay
 *          within a few degrees of upright while horizontals still converge —
 *          the classic architectural rendering camera.
 *          Constraint (verified live on MapLibre 5.6.2, 2026-10-22): once the
 *          horizon enters the viewport (pitch > 90° − fov/2) fill-extrusion
 *          layers are drawn displaced or not at all, so the eye preset keeps the
 *          horizon just outside the frame: 90 − 24/2 − 3° margin = 75°.
 *
 * Fitting a pitched camera to a bounding box: MapLibre's cameraForBounds assumes
 * a flat view, so fitPitched starts from that answer and zooms out in 0.1 steps
 * until every corner of the box projects inside the padded viewport.
 *
 * Venue view (owner instruction 2026-10-25 18:49: “tap a pin or a building → the 3D building
 * in two-point perspective, zoomed to fit the viewport, always”): fitBuilding turns the eye
 * camera corner-on to the building — bearing = dominant wall direction + 45°, so two faces and
 * two vanishing points show — and re-centres and zooms until the projected box of every
 * footprint and roof vertex fills the free part of the map (below the toolbar, above the
 * bottom card or sheet, clear of the zoom control). Padding stays zero so the principal point
 * is the canvas centre and the horizon stays outside the frame (75° + 24°/2 < 90°).
 */
export const DEFAULT_FOV = 36.87;

export const CAMERA = Object.freeze({
  plan: {pitch: 0, bearing: 0, fov: DEFAULT_FOV},
  city: {pitch: 56, bearing: 28, fov: DEFAULT_FOV, fitShift: 0.2},
  model: {pitch: 60, bearing: 28, fov: 14, fitShift: 0.16},
  eye: {pitch: 75, bearing: 28, fov: 24, fitShift: 0.1},
});
// bearing 28°: the Siam → Chit Lom → Phrom Phong axis (azimuth ≈ 120°) runs left-to-right
// across a wide screen; the compass control keeps north legible.

export function presetFor({view3d, mode, twoPoint = false}) {
  if (!view3d) return 'plan';
  if (mode === 'overview') return 'city';
  return twoPoint ? 'eye' : 'model';
}

/** Vertical padding that moves the principal point: positive shift pushes the map centre down the screen. */
export function shiftPadding(map, shift = 0) {
  const h = map.getContainer().clientHeight;
  return shift > 0 ? {top: Math.round(h * shift), bottom: 0, left: 0, right: 0} : {top: 0, bottom: 0, left: 0, right: 0};
}

function setFov(map, fov) {
  if (typeof map.setVerticalFieldOfView === 'function' && Math.abs(map.getVerticalFieldOfView?.() - fov) > 0.01) map.setVerticalFieldOfView(fov);
}

/** Apply a preset's pitch/bearing/FOV (centre and zoom unchanged unless given). */
export function applyPreset(map, name, {animate = true, duration = 650, ...rest} = {}) {
  const p = CAMERA[name] || CAMERA.plan;
  setFov(map, p.fov);
  const options = {pitch: p.pitch, bearing: p.bearing, padding: shiftPadding(map, p.shift || 0), ...rest};
  if (animate) map.easeTo({...options, duration}); else map.jumpTo(options);
  return p;
}

/** Corners of a LngLatBounds as [lng, lat] pairs. */
export function boundsCorners(b) {
  return [[b.getWest(), b.getSouth()], [b.getEast(), b.getSouth()], [b.getEast(), b.getNorth()], [b.getWest(), b.getNorth()]];
}

/**
 * Screen position of [lng, lat, altitudeMetres]. MapLibre's map.project() is
 * ground-only, so elevated points (roof vertices) go through the transform's
 * view-projection matrix (world pixels, z in metres → clip space), exactly as
 * fill-extrusion vertices do. Falls back to map.project for ground points.
 */
export function projectPoint(map, point) {
  const [lng, lat, alt = 0] = point;
  const t = map.transform;
  const M = t?.modelViewProjectionMatrix;
  if (!alt || !M || !Number.isFinite(t.worldSize) || !globalThis.maplibregl?.MercatorCoordinate) return map.project([lng, lat]);
  const mc = globalThis.maplibregl.MercatorCoordinate.fromLngLat([lng, lat]);
  const x = mc.x * t.worldSize, y = mc.y * t.worldSize, z = alt;
  const w = M[3] * x + M[7] * y + M[11] * z + M[15];
  if (!(w > 0)) return {x: NaN, y: NaN};
  const cx = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w, cy = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w;
  return {x: (cx + 1) / 2 * t.width, y: (1 - cy) / 2 * t.height};
}

function cornersInside(map, corners, padding) {
  const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
  return corners.every(c => {
    const p = c.length > 2 && c[2] ? projectPoint(map, c) : map.project([c[0], c[1]]);
    return p.x >= padding.left && p.x <= w - padding.right && p.y >= padding.top && p.y <= h - padding.bottom;
  });
}

/**
 * Frame `bounds` under a preset. Computes the final camera with instantaneous
 * jumps (no frame is rendered in between), restores the start camera and then
 * animates to the result. Returns the camera used. `points` may carry a third
 * value (altitude in metres) so a building's roof is framed, not only its
 * footprint. `apply: false` only computes the target and restores the start.
 */
export function fitPitched(map, bounds, {preset = 'city', padding = {top: 24, bottom: 24, left: 24, right: 24}, maxZoom = 16, animate = true, duration = 650, minZoom = 10, points = null, shift = null, apply = true} = {}) {
  const p = CAMERA[preset] || CAMERA.plan;
  const start = {center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding()};
  setFov(map, p.fov);
  // A pitched camera sees much more ground above the centre than below it, so the
  // box is centred lower on the screen (view padding at the top) before fitting.
  const view = shiftPadding(map, shift ?? (p.shift || p.fitShift || 0));
  map.jumpTo({pitch: p.pitch, bearing: p.bearing, padding: view});
  const flat = map.cameraForBounds(bounds, {padding, bearing: p.bearing, maxZoom});
  if (!flat) { map.jumpTo(start); return null; }
  let zoom = Math.min(maxZoom, flat.zoom);
  // Containment is tested on the actual outline vertices when given (a diagonal band
  // of areas leaves its bounding-box corners empty), otherwise on the box corners.
  const corners = points && points.length ? points : boundsCorners(bounds);
  map.jumpTo({center: flat.center, zoom, pitch: p.pitch, bearing: p.bearing, padding: view});
  let guard = 0;
  if (p.pitch > 0) {
    // Zoom out until every vertex is inside the padded viewport…
    while (!cornersInside(map, corners, padding) && zoom > minZoom && guard++ < 60) { zoom -= 0.1; map.jumpTo({zoom}); }
    // …then zoom in while they all still fit (foreshortening leaves room the flat fit did not use).
    while (zoom + 0.1 <= maxZoom && guard++ < 120) {
      map.jumpTo({zoom: zoom + 0.1});
      if (!cornersInside(map, corners, padding)) { map.jumpTo({zoom}); break; }
      zoom += 0.1;
    }
    zoom = Math.round(zoom * 100) / 100;
  }
  const target = {center: map.getCenter(), zoom, pitch: p.pitch, bearing: p.bearing, padding: view};
  if (!apply) { map.jumpTo(start); return target; }
  if (animate) { map.jumpTo(start); map.easeTo({...target, duration}); } else map.jumpTo(target);
  return target;
}

/* ---------- two-point view of one building ---------- */

const RAD = Math.PI / 180;
const norm180 = deg => { const d = ((deg % 360) + 540) % 360 - 180; return d === -180 ? 180 : d; };

/**
 * Compass azimuth (degrees in [0, 90)) of the dominant wall direction of footprint rings
 * ([[lng, lat]…]), weighting each edge by its length; walls 90° apart count as one direction
 * (angles ×4 on the circle). null when the rings have no edge.
 */
export function wallAzimuth(rings) {
  let c = 0, s = 0;
  for (const ring of rings || []) {
    if (!Array.isArray(ring) || ring.length < 2) continue;
    const kx = 111320 * Math.cos((ring[0][1] || 0) * RAD), ky = 110574; // metres per degree
    for (let i = 0; i < ring.length - 1; i++) {
      const dx = (ring[i + 1][0] - ring[i][0]) * kx, dy = (ring[i + 1][1] - ring[i][1]) * ky;
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      const a = Math.atan2(dx, dy); // clockwise from north
      c += len * Math.cos(4 * a); s += len * Math.sin(4 * a);
    }
  }
  if (Math.hypot(c, s) < 1e-9) return null;
  const deg = Math.atan2(s, c) / 4 / RAD;
  return ((deg % 90) + 90) % 90;
}

/**
 * How much of the target the drawn buildings in `obstacles` ([{ring, height}]) would hide when the
 * camera looks along `bearing` under the eye pitch: an obstacle counts when it stands between the
 * camera and the target, overlaps it sideways and rises above the sight line to the target's foot
 * (tan(90° − pitch) per metre of gap). Ground metres round the target's first vertex.
 */
export function occlusionScore(rings, obstacles, bearing, pitch = CAMERA.eye.pitch) {
  const all = (rings || []).flat();
  if (!all.length || !obstacles?.length) return 0;
  const [lon0, lat0] = all[0];
  const kx = 111320 * Math.cos(lat0 * RAD), ky = 110574;
  const b = bearing * RAD, fwd = [Math.sin(b), Math.cos(b)], right = [Math.cos(b), -Math.sin(b)];
  const along = ([lng, lat]) => {
    const e = (lng - lon0) * kx, n = (lat - lat0) * ky;
    return [e * right[0] + n * right[1], e * fwd[0] + n * fwd[1]];
  };
  const extent = pts => pts.map(along).reduce((m, [x, y]) => [Math.min(m[0], x), Math.max(m[1], x), Math.min(m[2], y), Math.max(m[3], y)], [Infinity, -Infinity, Infinity, -Infinity]);
  const [x0, x1, y0] = extent(all);
  const slope = Math.tan((90 - pitch) * RAD);
  let score = 0;
  for (const o of obstacles) {
    if (!Array.isArray(o?.ring) || o.ring.length < 3) continue;
    const [ox0, ox1, , oy1] = extent(o.ring);
    if (oy1 > y0 + 1) continue; // not in front of the target
    const overlap = Math.min(x1, ox1) - Math.max(x0, ox0);
    if (overlap <= 0) continue;
    const rise = (Number(o.height) || 3) - slope * (y0 - oy1);
    if (rise > 0) score += overlap * rise;
  }
  return score;
}

/**
 * Bearing for a two-point (corner-on) view of rings: the dominant wall direction + 45°. Of the four
 * diagonals, the one where the other drawn buildings (`obstacles`) hide least of the target wins;
 * ties go to the one nearest `current`, so the camera turns as little as possible.
 */
export function twoPointBearing(rings, current = 0, obstacles = []) {
  const wall = wallAzimuth(rings);
  if (wall == null) return norm180(current);
  const candidates = [0, 1, 2, 3].map(k => {
    const b = norm180(wall + 45 + k * 90);
    return {b, turn: Math.abs(norm180(b - current)), hidden: occlusionScore(rings, obstacles, b)};
  });
  const least = Math.min(...candidates.map(c => c.hidden));
  const best = candidates.filter(c => c.hidden <= least * 1.05 + 1).sort((a, c) => a.turn - c.turn)[0];
  return Math.round(best.b * 10) / 10;
}

/** Screen box of [lng, lat, altitude] points under the current camera; null when one is behind the camera. */
export function screenBounds(map, points, project = projectPoint) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of points) {
    const p = q[2] ? project(map, q) : map.project([q[0], q[1]]);
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return null;
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return Number.isFinite(minX) ? {minX, minY, maxX, maxY} : null;
}

/** Ground metres per pixel at zoom z (512-px tiles). */
const metresPerPixel = (lat, z) => (40075016.686 * Math.cos(lat * RAD)) / (512 * 2 ** z);

/**
 * Fit 3D points (a building's footprint and roof vertices, [lng, lat, altitude m]) into `box`
 * ({left, top, right, bottom}, map-container pixels) under the eye preset at `bearing`. The
 * camera is panned (the ground point under the box's offset becomes the anchor's place — exact
 * for ground points) and zoomed (log2 of the size ratio) until the projected box of every point
 * fills `fill` of the box. Computes with instant jumps, restores the start camera, then animates
 * (flyTo when the target is far). `project` is injectable for tests. Returns the target camera.
 */
export function fitBuilding(map, points, {box, bearing = 0, preset = 'eye', minZoom = 14, maxZoom = 19.5, fill = 0.94, animate = true, duration = 900, apply = true, project = projectPoint} = {}) {
  if (!points?.length || !box) return null;
  const p = CAMERA[preset] || CAMERA.eye;
  const start = {center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding()};
  setFov(map, p.fov);
  const zero = {top: 0, bottom: 0, left: 0, right: 0};
  const ground = points.filter(q => !q[2]);
  const base = ground.length ? ground : points;
  const anchor = [base.reduce((s, q) => s + q[0], 0) / base.length, base.reduce((s, q) => s + q[1], 0) / base.length];
  const tw = Math.max(40, (box.right - box.left) * fill), th = Math.max(40, (box.bottom - box.top) * fill);
  const tx = (box.left + box.right) / 2, ty = (box.top + box.bottom) / 2;
  // Start from the footprint's size: metres per pixel that would fit its larger side.
  const kx = Math.cos(anchor[1] * RAD);
  const span = Math.max(20, ...base.map(q => Math.hypot((q[0] - anchor[0]) * 111320 * kx, (q[1] - anchor[1]) * 110574) * 2));
  const clampZ = z => Math.min(maxZoom, Math.max(minZoom, z));
  let zoom = clampZ(Math.log2((40075016.686 * kx * Math.min(tw, th)) / (512 * span)) - 0.4);
  map.jumpTo({center: anchor, zoom, pitch: p.pitch, bearing, padding: zero});
  const pan = b => {
    const dx = tx - (b.minX + b.maxX) / 2, dy = ty - (b.minY + b.maxY) / 2;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return 0;
    const pa = map.project(anchor), g = map.unproject([pa.x + dx, pa.y + dy]), c = map.getCenter();
    map.jumpTo({center: [c.lng + anchor[0] - g.lng, c.lat + anchor[1] - g.lat]});
    return Math.hypot(dx, dy);
  };
  for (let i = 0; i < 30; i++) {
    let b = screenBounds(map, points, project);
    if (!b) { zoom = clampZ(zoom - 0.5); map.jumpTo({zoom}); continue; }
    const moved = pan(b);
    b = screenBounds(map, points, project);
    if (!b) { zoom = clampZ(zoom - 0.5); map.jumpTo({zoom}); continue; }
    const scale = Math.min(tw / Math.max(1, b.maxX - b.minX), th / Math.max(1, b.maxY - b.minY));
    const next = clampZ(zoom + Math.log2(scale));
    const dz = next - zoom;
    zoom = next; map.jumpTo({zoom});
    if (Math.abs(dz) < 0.004 && moved < 1) break;
  }
  const last = screenBounds(map, points, project);
  if (last) pan(last);
  const target = {center: map.getCenter(), zoom: Math.round(map.getZoom() * 1000) / 1000, pitch: p.pitch, bearing, padding: zero};
  map.jumpTo(start);
  if (!apply) return target;
  if (!animate) { map.jumpTo(target); return target; }
  // Far (another part of the city or a big zoom change): flyTo arcs out and back in; near: a plain ease.
  const distance = Math.hypot((start.center.lng - target.center.lng) * kx * 111320, (start.center.lat - target.center.lat) * 110574);
  const far = Math.abs(start.zoom - target.zoom) > 2.5 || distance > metresPerPixel(anchor[1], start.zoom) * 1500;
  if (far) map.flyTo({...target, duration: Math.max(duration, 1400), essential: false});
  else map.easeTo({...target, duration});
  return target;
}

/** Fly to a point under a preset keeping at least `zoom`; `offset` lifts the target (mobile sheet). */
export function framePoint(map, lngLat, {preset = 'model', zoom = 16, offset = [0, 0], animate = true, duration = 650} = {}) {
  const p = CAMERA[preset] || CAMERA.plan;
  setFov(map, p.fov);
  const options = {center: lngLat, zoom: Math.max(map.getZoom(), zoom), pitch: p.pitch, bearing: p.bearing, padding: shiftPadding(map, p.shift || 0), offset};
  if (animate) map.flyTo({...options, duration}); else map.jumpTo(options);
  return options;
}

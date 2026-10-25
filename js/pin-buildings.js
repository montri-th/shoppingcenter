/**
 * Pin buildings — the building each venue pin stands in, read from the basemap's own
 * OpenMapTiles `building` layer (OpenFreeMap z14 tiles, © OpenStreetMap contributors).
 *
 * Owner instruction 2026-10-25: every counted venue pin, all eight groups, shows its 3D
 * building whenever one can be mapped — operator confirmed or not. A building is mapped when
 * the pin lies inside its footprint, or within PIN_TOLERANCE_M of the footprint edge (the
 * precision of z14 tile geometry). Never by name, never the nearest building further away.
 * Validated host geometry (buildings.js, the registry's link table) wins where it exists.
 *
 * What counts as "the building":
 *  - every solid part that contains the pin (a podium and its tower are both kept);
 *  - when the pin is inside an outline that has building:parts (OpenMapTiles hide_3d), the
 *    parts inside that outline, not the outline;
 *  - the same building's piece in a neighbouring tile (tiles are clipped with a buffer), found
 *    by a real interior overlap, so a building on a tile edge is not cut in half;
 *  - nothing larger than MAX_PART_AREA_M2 (a site or campus polygon is not one venue).
 *
 * OpenFreeMap merges buildings of equal height into one MultiPolygon feature per tile, so
 * everything here works per polygon part, never per feature id.
 *
 * Display: each part is drawn enclosing the basemap's own copy (offset DRAW_OFFSET_M outward,
 * lifted DRAW_LIFT_M) so the two never z-fight. Heights are OpenMapTiles render_height /
 * render_min_height: context for the picture, not a measurement.
 */

import {lonLatToTile} from './mvt.js';

export const PIN_TOLERANCE_M = 3;
export const MAX_PART_AREA_M2 = 150000;
export const MIN_PART_AREA_M2 = 12;
export const DRAW_OFFSET_M = 0.8;
export const DRAW_LIFT_M = 0.4;
export const MIN_DISPLAY_HEIGHT_M = 3;
export const PIN_TILE_ZOOM = 14;
const CELL_DEG = 0.0015;
const DEEP_M = 0.6;

const RAD = Math.PI / 180;
/** Metres per degree of longitude / latitude at a latitude (local equirectangular frame). */
export const metresPerDegree = lat => ({kx: 111320 * Math.cos(lat * RAD), ky: 110574});

function ringArea(ring, kx, ky) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
  return a / 2;
}

function bboxOf(ring) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance in metres from a lon/lat point to a ring's edges. */
export function distanceToRingM(point, ring) {
  const {kx, ky} = metresPerDegree(point[1]);
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][0] - point[0]) * kx, ay = (ring[i][1] - point[1]) * ky;
    const bx = (ring[i + 1][0] - point[0]) * kx, by = (ring[i + 1][1] - point[1]) * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

const insidePart = (point, part) => pointInRing(point, part.outer) && !part.holes.some(h => pointInRing(point, h));

/** A point well inside a part (not on its boundary): the pin, the centroid, or a diagonal midpoint. */
export function interiorPoint(part) {
  const r = part.outer, n = r.length - 1;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += r[i][0]; cy += r[i][1]; }
  const c = [cx / n, cy / n];
  if (insidePart(c, part)) return c;
  for (let k = 2; k < n; k++) {
    const m = [(r[0][0] + r[k][0]) / 2, (r[0][1] + r[k][1]) / 2];
    if (insidePart(m, part)) return m;
  }
  return [r[0][0], r[0][1]];
}

/**
 * Polygon parts of querySourceFeatures output. Keeps z14 pieces only when z14 is loaded (a
 * retained parent tile would duplicate them); the tile comes from tileOf(). Each part: {fid, tile, outer, holes, bbox,
 * areaM2, height, base, hide3d}.
 */
/** Tile of a querySourceFeatures result: MapLibre 5 sets `tile: {z, x, y}`; older builds had _z/_x/_y. */
export const tileOf = f => (f?.tile && Number.isFinite(f.tile.z) ? f.tile : Number.isFinite(f?._z) ? {z: f._z, x: f._x, y: f._y} : null);

export function explodeParts(features, {zoom = PIN_TILE_ZOOM} = {}) {
  const list = Array.isArray(features) ? features : [];
  const hasZoom = list.some(f => tileOf(f)?.z === zoom);
  const parts = [];
  for (const f of list) {
    if (!f || (hasZoom && tileOf(f)?.z !== zoom)) continue;
    let g;
    try { g = f.geometry; } catch { continue; }
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const p = f.properties || {};
    const height = Number(p.render_height), base = Number(p.render_min_height) || 0;
    const t = tileOf(f);
    const tile = t ? `${t.z}/${t.x}/${t.y}` : '';
    for (const poly of polys) {
      const outer = poly?.[0];
      if (!Array.isArray(outer) || outer.length < 4) continue;
      const bbox = bboxOf(outer);
      const {kx, ky} = metresPerDegree((bbox[1] + bbox[3]) / 2);
      const holes = poly.slice(1).filter(h => Array.isArray(h) && h.length >= 4);
      const areaM2 = Math.abs(ringArea(outer, kx, ky)) - holes.reduce((s, h) => s + Math.abs(ringArea(h, kx, ky)), 0);
      parts.push({fid: f.id ?? null, tile, outer, holes, bbox, areaM2, height: Number.isFinite(height) ? height : null, base, hide3d: p.hide_3d === true});
    }
  }
  return parts;
}

/** Uniform grid over part bounding boxes. */
export function indexParts(parts, cell = CELL_DEG) {
  const grid = new Map();
  parts.forEach((part, i) => {
    const [w, s, e, n] = part.bbox;
    for (let ix = Math.floor(w / cell); ix <= Math.floor(e / cell); ix++) {
      for (let iy = Math.floor(s / cell); iy <= Math.floor(n / cell); iy++) {
        const key = `${ix}:${iy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(i); else grid.set(key, [i]);
      }
    }
  });
  return {parts, grid, cell};
}

function candidatesInBox(index, [w, s, e, n]) {
  const out = new Set();
  const {grid, cell} = index;
  for (let ix = Math.floor(w / cell); ix <= Math.floor(e / cell); ix++) {
    for (let iy = Math.floor(s / cell); iy <= Math.floor(n / cell); iy++) for (const i of grid.get(`${ix}:${iy}`) || []) out.add(i);
  }
  return [...out].map(i => index.parts[i]).filter(p => p.bbox[0] <= e && p.bbox[2] >= w && p.bbox[1] <= n && p.bbox[3] >= s);
}

/**
 * True when a vertex or an edge midpoint of one part lies inside the other at least `minM`
 * from its edges: a real overlap (a tile piece and its continuation share a buffer strip),
 * not a shared wall. Midpoints matter: a piece clipped at a tile edge has its clip vertices on
 * the building's own walls, but the middle of the clip edge is inside the building.
 */
export function deepOverlap(a, b, minM = DEEP_M) {
  const probes = ring => ring.slice(0, -1).flatMap((v, i) => [v, [(v[0] + ring[i + 1][0]) / 2, (v[1] + ring[i + 1][1]) / 2]]);
  const test = (from, into) => probes(from.outer).some(v => insidePart(v, into) && distanceToRingM(v, into.outer) >= minM && into.holes.every(h => distanceToRingM(v, h) >= minM));
  return test(a, b) || test(b, a);
}

const sizeOK = p => p.areaM2 >= MIN_PART_AREA_M2 && p.areaM2 <= MAX_PART_AREA_M2;

/**
 * The building parts a pin stands in. Returns {parts, method: 'inside' | 'edge'} or null.
 * index: from indexParts(explodeParts(features)).
 */
export function matchVenue(point, index, {toleranceM = PIN_TOLERANCE_M} = {}) {
  if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  const {kx, ky} = metresPerDegree(point[1]);
  const dLon = toleranceM / kx, dLat = toleranceM / ky;
  const near = candidatesInBox(index, [point[0] - dLon, point[1] - dLat, point[0] + dLon, point[1] + dLat]).filter(sizeOK);
  let method = 'inside';
  let containing = near.filter(p => insidePart(point, p));
  if (!containing.length) {
    const edge = near.map(p => ({p, d: distanceToRingM(point, p.outer)})).filter(x => x.d <= toleranceM).sort((a, b) => a.d - b.d);
    if (!edge.length) return null;
    containing = [edge[0].p];
    method = 'edge';
  }
  const outlines = containing.filter(p => p.hide3d).sort((a, b) => a.areaM2 - b.areaM2);
  let members = containing.filter(p => !p.hide3d);
  if (outlines.length) {
    const outline = outlines[0];
    const inside = candidatesInBox(index, outline.bbox).filter(p => !p.hide3d && sizeOK(p) && insidePart(interiorPoint(p), outline));
    members = [...new Set([...members, ...inside])];
    if (!members.length) members = [outline];
  }
  // The same building continued in a neighbouring tile (tiles are clipped with a buffer).
  const all = new Set(members);
  for (const m of members) {
    if (!m.tile) continue;
    for (const q of candidatesInBox(index, m.bbox)) {
      if (all.has(q) || q.tile === m.tile || q.hide3d || !sizeOK(q)) continue;
      if (deepOverlap(m, q)) all.add(q);
    }
  }
  return {parts: [...all], method};
}

/* ---------- display shapes ---------- */

function segmentIntersection(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

/**
 * Grow a closed lon/lat ring by d metres away from its own interior (negative d shrinks it).
 * Mitred corners, bevelled beyond 2.5·d so a spike never shoots out.
 */
export function growRingM(ring, d) {
  const pts = ring.slice(0, -1), n = pts.length;
  if (n < 3 || !d) return ring.map(p => [p[0], p[1]]);
  const lat0 = pts[0][1], lon0 = pts[0][0];
  const {kx, ky} = metresPerDegree(lat0);
  const xy = pts.map(([x, y]) => [(x - lon0) * kx, (y - lat0) * ky]);
  let area = 0;
  for (let i = 0; i < n; i++) { const a = xy[i], b = xy[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1; // counter-clockwise (y up): interior on the left, outward on the right
  const normals = [];
  for (let i = 0; i < n; i++) {
    const a = xy[i], b = xy[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    normals.push([(s * dy) / len, (-s * dx) / len]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = xy[(i + n - 1) % n], p = xy[i], next = xy[(i + 1) % n];
    const nPrev = normals[(i + n - 1) % n], nNext = normals[i];
    const a1 = [prev[0] + nPrev[0] * d, prev[1] + nPrev[1] * d], a2 = [p[0] + nPrev[0] * d, p[1] + nPrev[1] * d];
    const b1 = [p[0] + nNext[0] * d, p[1] + nNext[1] * d], b2 = [next[0] + nNext[0] * d, next[1] + nNext[1] * d];
    const x = segmentIntersection(a1, a2, b1, b2);
    if (x && Math.hypot(x[0] - p[0], x[1] - p[1]) <= 2.5 * Math.abs(d)) out.push(x);
    else { out.push(a2); out.push(b1); }
  }
  const lonlat = out.map(([x, y]) => [lon0 + x / kx, lat0 + y / ky]);
  lonlat.push([lonlat[0][0], lonlat[0][1]]);
  return lonlat;
}

/**
 * GeoJSON features for one venue's matched parts, in the property shape buildings.js draws
 * (render_as extrusion, display_height_m / display_base_m) plus the pin semantics.
 */
export function pinFeatures(venueId, match) {
  if (!match?.parts?.length) return [];
  return match.parts.map((part, i) => {
    const height = Number.isFinite(part.height) && part.height > 0 ? part.height : null;
    const base = Math.max(0, part.base || 0);
    const top = Math.max(base + MIN_DISPLAY_HEIGHT_M, height ?? MIN_DISPLAY_HEIGHT_M);
    return {
      type: 'Feature',
      geometry: {type: 'Polygon', coordinates: [growRingM(part.outer, DRAW_OFFSET_M), ...part.holes.map(h => growRingM(h, -DRAW_OFFSET_M))]},
      properties: {
        host_id: `pin:${venueId}:${i}`, venue_ids: [venueId], selected_venue_ids: [venueId],
        geometry_role: 'pin_building_basemap', render_as: 'extrusion', match_method: match.method,
        height_status: 'basemap_render_height', height_m: height, base_m: base,
        display_height_m: top + DRAW_LIFT_M, display_base_m: base,
        source: 'OpenMapTiles building (OpenFreeMap) © OpenStreetMap contributors',
      },
      // Exact basemap rings, for the massing tiers to recognise the same building.
      _ring: part.outer,
    };
  });
}

/* ---------- live installer ---------- */

/**
 * Match pins to basemap buildings whenever the map settles. `onChange({byVenue, features})`
 * fires when the matched set changes. Venue rows: [{id, lon, lat}]. A venue is matched once its
 * z14 tile is on screen (the map is idle with the pin inside the viewport) and then kept; a
 * venue with no building there is remembered as `null` so the panel can say so.
 */
export function installPinBuildings(map, {sourceId = 'openmaptiles', minZoom = PIN_TILE_ZOOM, onChange = null, limit = 3000} = {}) {
  let rows = [], enabled = true, disposed = false, timer = 0, signature = '';
  const cache = new Map(); // venueId → match | null

  function emit() {
    const byVenue = new Map();
    const features = [];
    for (const r of rows) {
      if (!cache.has(r.id)) continue;
      const match = cache.get(r.id);
      byVenue.set(r.id, match ? match.method : null);
      if (match) features.push(...pinFeatures(r.id, match));
    }
    const next = [...byVenue].map(([id, m]) => `${id}:${m || '-'}`).join('|');
    if (next === signature) return;
    signature = next;
    if (typeof onChange === 'function') { try { onChange({byVenue, features}); } catch (e) { console.warn('Pin buildings', e); } }
  }

  function recompute() {
    if (disposed || !enabled || !map.getSource(sourceId)) return;
    if (map.getZoom() < minZoom) { emit(); return; }
    const bounds = map.getBounds();
    const visible = rows.filter(r => !cache.has(r.id) && bounds.contains([r.lon, r.lat]));
    if (!visible.length) { emit(); return; }
    let features;
    try { features = map.querySourceFeatures(sourceId, {sourceLayer: 'building'}); } catch { return; }
    const parts = explodeParts(features, {zoom: PIN_TILE_ZOOM});
    const index = indexParts(parts);
    const read = new Set(parts.map(p => p.tile));
    for (const r of visible) {
      const match = matchVenue([r.lon, r.lat], index);
      const t = lonLatToTile(r.lon, r.lat, PIN_TILE_ZOOM);
      // "No building here" is only remembered when the pin's own z14 tile was read; a distant
      // part of a pitched view may still be drawn from a coarser tile.
      if (match || read.has(`${t.z}/${t.x}/${t.y}`)) cache.set(r.id, match);
    }
    while (cache.size > limit) cache.delete(cache.keys().next().value);
    emit();
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(recompute, 160); };
  const onIdle = () => schedule();
  map.on('idle', onIdle);

  function update(next = {}) {
    if ('rows' in next) rows = (next.rows || []).filter(r => r && Number.isFinite(r.lon) && Number.isFinite(r.lat));
    if ('enabled' in next) enabled = Boolean(next.enabled);
    emit();
    schedule();
  }
  function dispose() {
    disposed = true;
    clearTimeout(timer);
    map.off('idle', onIdle);
  }
  /** 'inside' | 'edge' when matched, null when the pin's tile was read and no building is there, undefined when not read yet. */
  const stateOf = id => (cache.has(id) ? (cache.get(id)?.method || null) : undefined);
  return {update, dispose, recompute, stateOf, get size() { return cache.size; }};
}

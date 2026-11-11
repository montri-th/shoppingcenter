/**
 * City massing in two tiers — context everywhere, detail only where focused.
 *
 *  1. CITY (quiet): a MapLibre fill-extrusion layer straight from the basemap's
 *     OpenMapTiles `building` source-layer (OpenFreeMap tiles). Pale, no
 *     outline, vertical gradient only. Covers the whole city from zoom 13.
 *  2. FOCUS (detail): for the focused areas only (whole districts, or rings round
 *     the focused venues in large districts), the same tile data is
 *     fetched again (same URLs, so the browser cache serves them), decoded with
 *     js/mvt.js and re-shaped with js/geometry.js — corners rounded and the
 *     footprint offset outward by a few metres so the rounded "model" fully
 *     encloses the original drawn by tier 1 (no z-fighting, no seams). This is
 *     the display answer to MapLibre's missing polygon corner radius
 *     (maplibre/maplibre-style-spec#1047); it changes nothing in the data.
 *
 * Host buildings (buildings.js, map.activeLayer role) stay a separate layer:
 * tile buildings that overlap a host are dropped from the focus tier, so the host
 * silhouette is never swallowed by a taller OSM outline. Pin buildings
 * (pin-buildings.js) are the basemap's own polygons or CityMETER buildings: the
 * focus tier drops exactly those (same building = an interior point of one lies
 * inside the other, so a neighbour sharing a wall stays).
 *
 * Buildings per area (owner 2026-11-05 00:34, the rule of CityMETER · Hotel 0.3.0; js/building-units.js): inside a
 * CityMETER unit — an อปท. (in Bangkok a เขต) where CityMETER Building V4 holds at least 1.15 × the OpenStreetMap
 * buildings — the focus tier also reads that unit's CityMETER buildings (shapeCmTile, same z14 grid, same rounded shape;
 * `height_m` is the dataset's model estimate), OpenStreetMap first and CityMETER only where OSM has no building (D35,
 * owner 2026-11-07 16:35, js/building-choice.js): every OSM building stays (a default 5 m OSM height takes the
 * CityMETER height of the same building); a CityMETER building is drawn only when no OSM building stands for it — its
 * interior point is in no OSM building, no OSM building's interior point is in it, and OSM buildings cover less than
 * COVER_MIN of it. The OSM buildings mapped in parts (LOD2) stay, the CityMETER buildings standing in their outlines are
 * left out, and an outline OSM gives a podium height under its towers is drawn as that podium (podiumIndex, everywhere,
 * not only in CityMETER units). Where a CityMETER tile is missing the area stays on OSM. A credit source names CityMETER
 * Building V4 in the map attribution while any of its buildings (or heights) is drawn.
 *
 * OpenFreeMap merges buildings of equal height into one MultiPolygon feature per tile (thousands of default-height
 * houses share one id in the suburbs). The city tier hides a replaced (or host- or pin-covered) feature as a whole —
 * MapLibre filters features, not polygons — and every other polygon of that feature comes back: inside the focus in
 * the focus tier, outside it in a context layer drawn like the city tier (quiet, faded), so no building blanks out.
 * The city tier's distance fade is taken from a feature's nearest part, not its first vertex — otherwise a whole
 * suburb fades out with one far-away house — and is measured from the focus anchors (venue points) and from the
 * camera centre, so wherever the user zooms in, the city around the centre of the view is there.
 *
 * Heights are OpenMapTiles render_height / render_min_height (OSM tags where present, otherwise the schema's default)
 * or CityMETER `height_m` (model estimate). They are context, never a claim.
 */
import {parseVectorTile, tileToLonLat, lonLatToTileUnits, tilesForBBox, metresPerTileUnit} from './mvt.js';
import {clipRingToBox, offsetRing, roundRing, isClockwise, ringsIntersect, cleanRing, signedArea, pointInRing, ringBBox} from './geometry.js';
import {GEOJSON_MAXZOOM} from './map-layers.js';
import {chooseSource, podiumHeight, CM_GAP_M} from './building-choice.js';

export const CITY_LAYER = 'city-massing';
export const FOCUS_SOURCE = 'focus-massing';
export const FOCUS_LAYER = 'focus-massing-3d';
/** Polygons of hidden city-tier features outside the focus, drawn like the city tier. */
export const CONTEXT_SOURCE = 'focus-context';
export const CONTEXT_LAYER = 'focus-context-3d';
/** Attribution carrier for CityMETER Building V4 (a hidden layer: the map credits a source while a layer uses it). */
export const CM_CREDIT_SOURCE = 'cm-buildings-credit';
export const CM_CREDIT_LAYER = 'cm-buildings-credit';
/** Focus-tier buildings that stand between the camera and the venue (see-through). */
export const OCCLUDER_LAYER = 'focus-massing-occluding';
/**
 * Scene opacities. `eye` is the venue-level two-point view (owner decision
 * 2026-10-22): the surroundings go very quiet and anything that would hide the
 * venue becomes see-through; the venue's own host building (buildings.js) stays
 * opaque because it is the data layer.
 */
export const SCENE = Object.freeze({
  default: {city: 0.22, focus: 1, occluder: 0.18},
  eye: {city: 0.16, focus: 0.62, occluder: 0.14},
});
/**
 * Distance fade of the city tier (owner decision 2026-10-22: buildings outside
 * the focus are almost transparent and fade out with distance). MapLibre has no
 * camera-distance expression, so each building's distance to the nearest focus
 * anchor (area centroid) is written to feature-state once; the colour then
 * interpolates from the quiet tone to the ground tone (= invisible).
 */
export const FADE_NEAR_M = 500;
export const FADE_FAR_M = 2200;
/** The camera centre becomes a fade anchor once it has moved this far (m) and the view is at city zoom. */
export const CAMERA_ANCHOR_STEP_M = 300;
export const CAMERA_ANCHOR_MIN_ZOOM = 12.5;
export const TILE_ZOOM = 14;
/** Bound on z14 tiles fetched for the focus tier; a larger focus keeps the tiles nearest the camera (tilesForRegions). */
export const MAX_TILES = 16;
/** The city tier comes straight from basemap tiles, which carry no buildings below zoom 13. */
export const CITY_MIN_ZOOM = 13;
/**
 * The focus tier is fetched at z14 whatever the camera zoom, so in 3D it can draw from zoom 12 (CityMETER · Hotel
 * 0.3) — only when every tile of the focus is loaded: a truncated focus would show a cut block, so it waits for 13.
 */
export const FOCUS_MIN_ZOOM = 12;
export const HEIGHT_LIFT_M = 0.35;

/**
 * Stable, unique id of one focus building: its z14 tile and the ordinal of the polygon among ALL building polygons
 * of that tile, counted before any focus or host filtering (< 2^52, exact in JS) — the same building keeps its id
 * whatever the focus or the zoom. One OpenFreeMap feature can carry hundreds of polygons, so neither the OSM id nor a
 * per-feature polygon index is a key.
 */
export function focusFeatureId(tile, ordinal) {
  return (tile.x * 16384 + tile.y) * 16777216 + (ordinal % 16777216);
}
/** Podium ordinals (outlines drawn under their parts, D35) count from here, apart from the tile's building polygons. */
export const PODIUM_ORDINAL_BASE = 2 ** 23;

/**
 * CityMETER Building V4 in the focus tier. Its tiles carry no feature ids, so a building's id is its z14 tile, the
 * national slot of the tile unit it was read with (data/building-units: one index per อปท. or แขวง, whatever the
 * focus) and its ordinal in that response — from 2^52 up, apart from every OSM id (focusFeatureId < 2^52 at z14), and
 * below 2^53 (exact): 24 bits of tile, 13 of slot, 15 of ordinal.
 */
export const CM_ID_BASE = 2 ** 52;
export const CM_SLOTS = 8192;
const CM_ORDINALS = 32768; // per tile unit and z14 tile (a dense z14 tile holds about 3,000)
export function cmFeatureId(tile, slot, ordinal) {
  return CM_ID_BASE + (((tile.x % 4096) * 4096 + (tile.y % 4096)) * CM_SLOTS + (slot % CM_SLOTS)) * CM_ORDINALS + (ordinal % CM_ORDINALS);
}
/** Bound on CityMETER tile requests of one focus (tile × tile unit), nearest the camera first. */
export const MAX_CM_REQUESTS = 40;
/** Height of a CityMETER building: `height_m` (a model estimate, sent as text); else this. */
export const DEFAULT_CM_HEIGHT_M = 3;
export function cmHeight(properties = {}) {
  const h = Number(properties.height_m);
  return Number.isFinite(h) && h > 0 ? h : DEFAULT_CM_HEIGHT_M;
}

/** [west, south, east, north] of a tile. */
export function tileBox(tile) {
  const [w, n] = tileToLonLat(0, 0, tile, 4096), [e, s] = tileToLonLat(4096, 4096, tile, 4096);
  return [w, s, e, n];
}
const boxesMeet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
function ringBox(ring) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}

/** Zones (js/building-units.js) meeting a tile, as tile-unit polygons with their box. */
function zonesInTile(zones, tile, extent) {
  if (!zones?.length) return [];
  const tb = tileBox(tile);
  return zones.filter(z => boxesMeet(z.bbox, tb)).map(z => {
    const polys = z.polygons.map(p => p.map(ring => ring.map(([lon, lat]) => lonLatToTileUnits(lon, lat, tile, extent))));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polys) for (const [x, y] of p[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return {zone: z, polys, box: {minX, minY, maxX, maxY}};
  });
}
const inZones = (pt, zoneRings) => zoneRings.some(z => pt[0] >= z.box.minX && pt[0] <= z.box.maxX && pt[1] >= z.box.minY && pt[1] <= z.box.maxY &&
  z.polys.some(p => pointInRing(pt, p[0]) && !p.slice(1).some(h => pointInRing(pt, h))));

/**
 * CityMETER tiles of a focus: one request per tile of the focus tier and tile unit (อปท., or a แขวง of a Bangkok
 * เขต) of a zone whose box meets it — tiles nearest `center` first, at most `max`. A zone is drawn from CityMETER in
 * a tile only when every request of the zone for that tile is planned (and, later, loaded); otherwise OSM stays there.
 * Returns {requests: [{tile, zone, tileUnit, tileType, slot, key}], zonesByTile: Map(tile key → Set(zone id)), truncated}.
 */
export function planCmRequests(tiles, zones, {max = MAX_CM_REQUESTS, center = null} = {}) {
  const requests = [], zonesByTile = new Map();
  if (!zones?.length || !tiles?.length) return {requests, zonesByTile, truncated: false};
  let order = tiles;
  if (Array.isArray(center) && center.every(Number.isFinite)) {
    const [cx, cy] = tileXY(center, tiles[0].z);
    const dist = t => (t.x + 0.5 - cx) ** 2 + (t.y + 0.5 - cy) ** 2;
    order = [...tiles].sort((a, b) => dist(a) - dist(b) || a.x - b.x || a.y - b.y);
  }
  let truncated = false;
  for (const t of order) {
    const tb = tileBox(t), units = [];
    for (const z of zones) {
      if (!boxesMeet(z.bbox, tb)) continue;
      const tus = (z.tileUnits || []).filter(u => boxesMeet(u.bbox, tb));
      if (tus.length) units.push({zone: z, tus});
    }
    if (!units.length) continue;
    // The national slot of a tile unit (data/building-units); a file without one falls back to the order in the tile.
    const local = units.flatMap(u => u.tus.map(tu => tu.id)).sort();
    const slotOf = tu => (Number.isInteger(tu.slot) && tu.slot >= 0 && tu.slot < CM_SLOTS ? tu.slot : local.indexOf(tu.id));
    const tileKey = `${t.z}/${t.x}/${t.y}`;
    for (const {zone, tus} of units) {
      if (requests.length + tus.length > max) { truncated = true; continue; }
      for (const tu of tus) requests.push({tile: t, zone, tileUnit: tu, tileType: zone.tileType, slot: slotOf(tu), key: `${tileKey}|${tu.id}`});
      if (!zonesByTile.has(tileKey)) zonesByTile.set(tileKey, new Set());
      zonesByTile.get(tileKey).add(zone.id);
    }
  }
  return {requests, zonesByTile, truncated};
}

/** Display radius (m) for corner rounding at a map zoom: ~4 px, kept within 3–12 m. */
export function roundingRadiusM(zoom, latitude = 13.75) {
  const metresPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return Math.min(12, Math.max(3, 4 * metresPerPixel));
}

/** Outward offset (m) that keeps a fillet of radius r enclosing the original (see geometry.roundRing). */
export const encloseOffsetM = r => Math.max(1, r / 2.5);

function bboxOfRings(rings) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) { if (x < west) west = x; if (x > east) east = x; if (y < south) south = y; if (y > north) north = y; }
  return [west, south, east, north];
}

/** Outer rings of a Polygon/MultiPolygon feature in lon/lat. */
export function outerRings(feature) {
  const g = feature?.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates[0]];
  if (g.type === 'MultiPolygon') return g.coordinates.map(p => p[0]);
  return [];
}

/** A point inside a closed ring: the vertex centroid when inside, else a diagonal midpoint. */
export function ringInteriorPoint(ring) {
  const n = ring.length - 1;
  if (n < 3) return ring[0];
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1]; }
  const c = [cx / n, cy / n];
  if (pointInRing(c, ring)) return c;
  for (let k = 2; k < n; k++) {
    const m = [(ring[0][0] + ring[k][0]) / 2, (ring[0][1] + ring[k][1]) / 2];
    if (pointInRing(m, ring)) return m;
  }
  return ring[0];
}

/** Same building drawn twice (tile vs pin copy): an interior point of either lies inside the other. */
export function sameBuilding(a, b) {
  const ba = ringBBox(a), bb = ringBBox(b);
  if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxY < bb.minY || bb.maxY < ba.minY) return false;
  return pointInRing(ringInteriorPoint(b), a) || pointInRing(ringInteriorPoint(a), b);
}

/* ---------- decoding (once per layer) and the z14 frame shared by both sources ---------- */
const polygonCache = new WeakMap();
/** Polygons of a decoded MVT layer, decoded once per layer object: [{f, polygons: [{outer, holes}]}] in tile units. */
export function layerPolygons(layer) {
  if (!layer?.features) return [];
  let out = polygonCache.get(layer);
  if (out) return out;
  out = [];
  for (const f of layer.features) {
    if (f.type !== 3) continue;
    const polygons = [];
    for (const raw of f.rings()) {
      const ring = cleanRing(raw);
      if (!ring) continue;
      if (isClockwise(ring)) polygons.push({outer: ring, holes: []});
      else if (polygons.length) polygons[polygons.length - 1].holes.push(ring);
    }
    out.push({f, polygons});
  }
  polygonCache.set(layer, out);
  return out;
}
/**
 * One planar frame for every z14 tile: global tile units (4096 per tile). OSM (OpenFreeMap) and CityMETER tiles are both
 * MVT on the same z14 grid, so a building read from two tiles has the same coordinates here and containment tests
 * between the sources need no reprojection.
 */
const GLOBAL_EXTENT = 4096;
const scaleOf = tile => GLOBAL_EXTENT * 2 ** (TILE_ZOOM - tile.z);
export const toGlobal = (tile, extent = 4096) => { const k = scaleOf(tile); return ([px, py]) => [(tile.x + px / extent) * k, (tile.y + py / extent) * k]; };
export const fromGlobal = (tile, extent = 4096) => { const k = scaleOf(tile); return ([gx, gy]) => [(gx / k - tile.x) * extent, (gy / k - tile.y) * extent]; };
const globalBox = (ring, g) => { const b = ringBBox(ring), lo = g([b.minX, b.minY]), hi = g([b.maxX, b.maxY]); return [lo[0], lo[1], hi[0], hi[1]]; };
const areaM2Of = (poly, m2) => Math.max(0, Math.abs(signedArea(poly.outer)) - poly.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)) * m2;
/** Key of one CityMETER building: its height and first two vertices in the z14 frame (exact: MVT coordinates are integers). */
const cmKey = (height, outer, g) => { const a = g(outer[0]), b = g(outer[1]); return `${height}|${outer.length}|${a[0].toFixed(1)},${a[1].toFixed(1)}|${b[0].toFixed(1)},${b[1].toFixed(1)}`; };
/** Buildings under this many m² neither split nor stand for another building in the source choice. */
export const CHOICE_MIN_AREA_M2 = 12;

const CELL = 128; // z14 frame units (~75 m in Thailand)
function gridAdd(grid, [w, s, e, n], item) {
  for (let ix = Math.floor(w / CELL); ix <= Math.floor(e / CELL); ix++) {
    for (let iy = Math.floor(s / CELL); iy <= Math.floor(n / CELL); iy++) {
      const k = `${ix}:${iy}`, bucket = grid.get(k);
      if (bucket) bucket.push(item); else grid.set(k, [item]);
    }
  }
}
function gridQuery(grid, [w, s, e, n]) {
  const out = new Set();
  for (let ix = Math.floor(w / CELL); ix <= Math.floor(e / CELL); ix++) {
    for (let iy = Math.floor(s / CELL); iy <= Math.floor(n / CELL); iy++) for (const item of grid.get(`${ix}:${iy}`) || []) out.add(item);
  }
  return out;
}

/**
 * The CityMETER Building V4 buildings of a focus, once each, for the source choice (D35, js/building-choice.js).
 * entries: [{tile, layer}] — every CityMETER tile that will be drawn. Returns {size, pointsIn(ring, tile, extent),
 * containing(point in the z14 frame)}; each building: {key, areaM2, height}.
 */
export function indexCmBuildings(entries = []) {
  const points = new Map(), boxes = new Map(), seen = new Set();
  let size = 0;
  for (const {tile, layer} of entries) {
    if (!layer?.features?.length) continue;
    const extent = layer.extent || 4096, g = toGlobal(tile, extent), m2 = metresPerTileUnit(tile, extent) ** 2;
    for (const {f, polygons} of layerPolygons(layer)) {
      const height = cmHeight(f.properties);
      for (const poly of polygons) {
        const key = cmKey(height, poly.outer, g);
        if (seen.has(key)) continue;
        seen.add(key);
        const areaM2 = areaM2Of(poly, m2);
        if (areaM2 < CHOICE_MIN_AREA_M2) continue;
        const at = g(ringInteriorPoint(poly.outer));
        const rec = {key, areaM2, height, tile, extent, outer: poly.outer, at};
        gridAdd(points, [at[0], at[1], at[0], at[1]], rec);
        gridAdd(boxes, globalBox(poly.outer, g), rec);
        size++;
      }
    }
  }
  return {
    size,
    /** CityMETER buildings whose interior point stands in a ring (tile units of `tile`). */
    pointsIn(ring, tile, extent = 4096) {
      const g = toGlobal(tile, extent), back = fromGlobal(tile, extent);
      return [...gridQuery(points, globalBox(ring, g))].filter(r => pointInRing(back(r.at), ring));
    },
    /** The smallest CityMETER building holding a point of the z14 frame, or null. */
    containing(point) {
      let best = null;
      for (const r of gridQuery(boxes, [point[0], point[1], point[0], point[1]])) {
        if ((!best || r.areaM2 < best.areaM2) && pointInRing(fromGlobal(r.tile, r.extent)(point), r.outer)) best = r;
      }
      return best;
    },
  };
}

/**
 * The OSM building footprints of the focus tiles that meet CityMETER units — every polygon, solid or an outline mapped in
 * parts, cut pieces included — for the last test of D35: a CityMETER building that overlaps an OSM building is one OSM
 * already draws (offset or cut differently), and one closer than CM_GAP_M to an OSM building stands in a block OSM has
 * mapped; neither is drawn. entries: [{tile, layer, zones}]. Returns {size, covers(point in the z14 frame) → boolean,
 * near(ring in the z14 frame, gap in z14 units) → boolean}.
 */
export function indexOsmBuildings(entries = []) {
  const boxes = new Map();
  let size = 0;
  for (const {tile, layer, zones} of entries) {
    if (!layer?.features?.length || !zones?.length) continue;
    const extent = layer.extent || 4096, g = toGlobal(tile, extent);
    for (const {f, polygons} of layerPolygons(layer)) {
      if (f.properties.hide_3d !== true && !(Number(f.properties.render_height) > 0)) continue;
      for (const poly of polygons) {
        let global = null;
        const box = globalBox(poly.outer, g);
        gridAdd(boxes, box, {tile, extent, outer: poly.outer, box, get ring() { return global ??= poly.outer.map(g); }});
        size++;
      }
    }
  }
  return {
    size,
    covers(point) {
      for (const r of gridQuery(boxes, [point[0], point[1], point[0], point[1]])) if (pointInRing(fromGlobal(r.tile, r.extent)(point), r.outer)) return true;
      return false;
    },
    near(ring, gap) {
      const b = ringBBox(ring);
      for (const r of gridQuery(boxes, [b.minX - gap, b.minY - gap, b.maxX + gap, b.maxY + gap])) {
        // Boxes further apart than the gap cannot hold closer rings (cheap test first).
        if (r.box[0] - b.maxX > gap || b.minX - r.box[2] > gap || r.box[1] - b.maxY > gap || b.minY - r.box[3] > gap) continue;
        if (ringsWithin(ring, r.ring, gap)) return true;
      }
      return false;
    },
  };
}

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}
/** Shortest distance between two closed rings in one planar frame (0 when a vertex of one lies inside the other). */
export function ringDistance(a, b) {
  let best = Infinity;
  for (const [from, to] of [[a, b], [b, a]]) {
    for (const v of from) {
      if (pointInRing(v, to)) return 0;
      for (let i = 0; i < to.length - 1; i++) best = Math.min(best, segmentDistance(v, to[i], to[i + 1]));
    }
  }
  return best;
}
/** True when two closed rings come within `gap` of each other (stops at the first close pair). */
export function ringsWithin(a, b, gap) {
  for (const [from, to] of [[a, b], [b, a]]) {
    for (const v of from) {
      if (pointInRing(v, to)) return true;
      for (let i = 0; i < to.length - 1; i++) if (segmentDistance(v, to[i], to[i + 1]) <= gap) return true;
    }
  }
  return false;
}

/**
 * Podium heights of the OSM buildings mapped in parts in the focus tiles (D35): an outline (hide_3d) whose own height is
 * a podium under its tallest part (js/building-choice.js#podiumHeight) is drawn as that podium; OpenMapTiles draws only
 * the parts, which left the podium of Samyan Mitrtown a 5 m slab. Pieces of one outline in several tiles share its id,
 * so the parts of every piece count. entries: [{tile, layer}]. Returns Map(feature id → podium height).
 */
export function podiumIndex(entries = []) {
  const outlines = new Map(), parts = [];
  for (const {tile, layer} of entries) {
    if (!layer?.features?.length) continue;
    const extent = layer.extent || 4096, g = toGlobal(tile, extent);
    for (const {f, polygons} of layerPolygons(layer)) {
      const height = Number(f.properties.render_height), base = Number(f.properties.render_min_height) || 0;
      if (f.properties.hide_3d === true) {
        if (f.id == null) continue;
        for (const poly of polygons) {
          if (!outlines.has(f.id)) outlines.set(f.id, {height, base, pieces: []});
          outlines.get(f.id).pieces.push({tile, extent, outer: poly.outer, box: globalBox(poly.outer, g)});
        }
      } else if (height > 0) {
        for (const poly of polygons) parts.push({at: g(ringInteriorPoint(poly.outer)), height});
      }
    }
  }
  const out = new Map();
  if (!outlines.size) return out;
  const grid = new Map();
  parts.forEach(p => gridAdd(grid, [p.at[0], p.at[1], p.at[0], p.at[1]], p));
  for (const [id, o] of outlines) {
    const inside = [];
    for (const piece of o.pieces) {
      const back = fromGlobal(piece.tile, piece.extent);
      for (const p of gridQuery(grid, piece.box)) if (pointInRing(back(p.at), piece.outer)) inside.push(p);
    }
    const h = podiumHeight(o, inside);
    if (h) out.set(id, h);
  }
  return out;
}

/**
 * Pure: turn one decoded tile into focus features for the given regions.
 * regions/hosts/pins are arrays of lon/lat rings (hosts: any overlap drops a tile building;
 * pins: only the same building). Returns {features, hiddenIds, context, partOutlines, taken, kept, dropped, replaced,
 * osmFirst, cmHeights, rules}.
 *
 * `zones` (js/building-units.js, only those whose CityMETER tiles for this tile loaded): inside a zone every OSM building
 * is drawn (D35, OSM first, js/building-choice.js) and stands for the CityMETER buildings of the same place (`cm`, from
 * indexCmBuildings): `taken` collects their keys for shapeCmTile to leave out, and a default OSM height takes the
 * CityMETER one. A part of a building OSM maps in parts whose outline falls in the zone stays (LOD2), and the outline
 * comes back in `partOutlines` (lon/lat) so the CityMETER buildings standing in it are left out (shapeCmTile
 * `skipRings`). `podiums` (from podiumIndex): outlines drawn as the podium under their parts. The city tier hides a host-
 * or pin-covered tile feature as a whole — one OpenFreeMap feature can carry many buildings — so its polygons outside
 * the focus come back as `context` features, unshaped, to be drawn like the city tier. `replaced` stays 0 (D32 let
 * CityMETER replace an OSM building; D35 never does).
 */
export function shapeTile(tile, layer, {regions = [], hosts = [], pins = [], radiusM, offsetM, segments = 3, zones = [], cm = null, podiums = null} = {}) {
  const extent = layer.extent || 4096;
  const mpu = metresPerTileUnit(tile, extent), m2 = mpu * mpu;
  const r = radiusM / mpu, d = offsetM / mpu;
  const box = {minX: 0, minY: 0, maxX: extent, maxY: extent};
  const toTile = ring => ring.map(([lon, lat]) => lonLatToTileUnits(lon, lat, tile, extent));
  const toLonLat = ring => ring.map(([px, py]) => tileToLonLat(px, py, tile, extent));
  const g = toGlobal(tile, extent);
  const regionRings = regions.map(toTile), hostRings = hosts.map(toTile), pinRings = pins.map(toTile);
  const zoneRings = zonesInTile(zones, tile, extent);
  const decoded = layerPolygons(layer);
  const features = [], hiddenIds = new Set(), context = [], partOutlines = [], taken = new Set(), rules = {};
  let kept = 0, dropped = 0, replaced = 0, ordinal = 0, osmFirst = 0, cmHeights = 0;
  // Outlines of buildings OSM maps in parts that fall in a zone: their parts stay (LOD2).
  const zoneOutlines = [];
  if (zoneRings.length) {
    for (const {f, polygons} of decoded) {
      if (f.properties.hide_3d !== true) continue;
      for (const {outer: ring} of polygons) {
        if (inZones(ringInteriorPoint(ring), zoneRings)) {
          zoneOutlines.push(ring);
          const outer = clipRingToBox(ring, box);
          if (outer && regionRings.some(region => ringsIntersect(outer, region))) partOutlines.push(toLonLat(outer));
        }
      }
    }
  }
  const inPartOutline = pt => zoneOutlines.some(o => pointInRing(pt, o));
  /** D35: an OSM building inside a zone is drawn and stands for the CityMETER buildings of its place (js/building-choice.js). */
  function choose(poly, at, height, base) {
    const inside = cm ? cm.pointsIn(poly.outer, tile, extent) : [];
    const host = !inside.length && cm ? cm.containing(g(at)) : null;
    return chooseSource({areaM2: areaM2Of(poly, m2), height, base}, {inside, host});
  }
  let podiumOrdinal = PODIUM_ORDINAL_BASE;
  for (const {f, polygons} of decoded) {
    // An outline mapped in parts is drawn only as the podium OSM gives it under its towers (podiumIndex).
    const podium = f.properties.hide_3d === true ? (f.id != null && podiums?.get(f.id)) || null : null;
    if (f.properties.hide_3d === true && !podium) continue;
    const height = podium || Number(f.properties.render_height);
    const base = podium ? 0 : Number(f.properties.render_min_height) || 0;
    if (!Number.isFinite(height) || height <= 0) continue;
    // Every polygon is placed first: the city tier hides a tile feature as a whole.
    const items = [];
    for (const poly of polygons) {
      // Counted before the focus/host/zone filters: stable per building. Podiums count apart, so the ids of every other
      // building are those of 0.1.20.
      const id = focusFeatureId(tile, podium ? podiumOrdinal++ : ordinal++);
      const outer = clipRingToBox(poly.outer, box);
      if (!outer) continue;
      let place = regionRings.some(region => ringsIntersect(outer, region)) ? 'focus' : 'outside', drawHeight = height;
      if (place === 'focus' && (hostRings.some(host => ringsIntersect(outer, host)) || pinRings.some(pin => sameBuilding(outer, pin)))) place = 'host';
      else if (place === 'focus' && zoneRings.length && !podium) {
        const at = ringInteriorPoint(poly.outer);
        if (inZones(at, zoneRings) && !inPartOutline(at)) {
          const choice = choose(poly, at, height, base);
          rules[choice.rule] = (rules[choice.rule] || 0) + 1;
          osmFirst++;
          for (const c of choice.take) taken.add(c.key);
          if (choice.height) { drawHeight = choice.height; cmHeights++; }
        }
      }
      // The city tier never draws an outline: a podium outside the focus has nothing to bring back.
      if (podium && place === 'outside') continue;
      items.push({id, poly, outer, place, drawHeight});
    }
    const hidden = !podium && items.some(it => it.place === 'host');
    if (hidden && f.id != null) hiddenIds.add(f.id);
    for (const {id, poly, outer, place, drawHeight} of items) {
      if (place === 'host') { dropped++; continue; }
      if (place === 'replaced') { replaced++; continue; }
      const holes = poly.holes.map(h => clipRingToBox(h, box)).filter(Boolean);
      if (place === 'outside') {
        // The city tier no longer draws this feature: its buildings outside the focus are drawn as context.
        if (hidden && f.id != null) context.push({type: 'Feature', id, geometry: {type: 'Polygon', coordinates: [outer, ...holes].map(toLonLat)}, properties: {height, base}});
        continue;
      }
      // Outer rings are clockwise and holes counter-clockwise (MVT, y-down), so the
      // same normal sign pushes outers outward and holes inward: the model encloses.
      const shapedOuter = roundRing(offsetRing(outer, d, 1), r, segments, {encloseOffset: d});
      const shapedHoles = holes.map(h => roundRing(offsetRing(h, d, 1), r, segments, {encloseOffset: d}))
        .filter(h => Math.abs(signedArea(h)) > 0);
      const coordinates = [shapedOuter, ...shapedHoles].map(toLonLat);
      const properties = {osm_id: f.id ?? null, height: drawHeight + HEIGHT_LIFT_M, base, render_height: drawHeight};
      if (drawHeight !== height) properties.height_source = 'cm';
      if (podium) properties.podium = true;
      features.push({type: 'Feature', id, geometry: {type: 'Polygon', coordinates}, properties});
      kept++;
    }
  }
  return {features, hiddenIds, context, partOutlines, taken, kept, dropped, replaced, osmFirst, cmHeights, rules};
}

/**
 * Pure: one CityMETER Building V4 tile, read for one tile unit, into focus features. The production API sends every
 * building that touches the tile whole, so a building is drawn once — from the tile that holds its interior point —
 * and a building two requests share (`seen`, by geometry) once. Only buildings meeting the focus regions are drawn,
 * minus those an OSM building is drawn in place of (`taken`, keys from shapeTile; D35 OSM first), those whose interior
 * point stands in an outline OSM maps in parts (`skipRings`, lon/lat; their parts are drawn instead), those that overlap
 * or stand within CM_GAP_M of an OSM building (`osm`, from indexOsmBuildings: the same building drawn a little apart, or
 * a block OSM has mapped), those overlapping
 * a host building and the venue's own pin building (`pins`, the same building) — the host layer draws those. The
 * shape is the focus tier's (offset, rounded corners); the height is `height_m`, the dataset's model estimate
 * (cmHeight). Returns {features, kept, away, shared, inParts, osmFirst, dropped}.
 */
export function shapeCmTile(tile, layer, {regions = [], hosts = [], pins = [], radiusM, offsetM, segments = 3, slot = 0, skipRings = [], taken = null, osm = null, seen = new Set()} = {}) {
  const features = [];
  let kept = 0, away = 0, shared = 0, inParts = 0, osmFirst = 0, dropped = 0, ordinal = 0;
  if (!layer?.features?.length) return {features, kept, away, shared, inParts, osmFirst, dropped};
  const extent = layer.extent || 4096;
  const mpu = metresPerTileUnit(tile, extent);
  const r = radiusM / mpu, d = offsetM / mpu;
  const toTile = ring => ring.map(([lon, lat]) => lonLatToTileUnits(lon, lat, tile, extent));
  const toLonLat = ring => ring.map(([px, py]) => tileToLonLat(px, py, tile, extent));
  const g = toGlobal(tile, extent);
  const regionRings = regions.map(toTile), hostRings = hosts.map(toTile), pinRings = pins.map(toTile);
  const tb = tileBox(tile), skip = skipRings.filter(ring => boxesMeet(ringBox(ring), tb)).map(toTile);
  const gapUnits = (CM_GAP_M * scaleOf(tile)) / (mpu * extent); // CM_GAP_M in z14-frame units
  for (const {f, polygons} of layerPolygons(layer)) {
    const height = cmHeight(f.properties);
    for (const poly of polygons) {
      const id = cmFeatureId(tile, slot, ordinal++);
      const at = ringInteriorPoint(poly.outer);
      if (!(at[0] >= 0 && at[0] < extent && at[1] >= 0 && at[1] < extent)) { away++; continue; }
      const key = cmKey(height, poly.outer, g);
      if (seen.has(key)) { shared++; continue; }
      seen.add(key);
      if (!regionRings.some(region => ringsIntersect(poly.outer, region))) continue;
      if (taken?.has(key)) { osmFirst++; continue; }
      if (skip.some(o => pointInRing(at, o))) { inParts++; continue; }
      // D35: OSM draws this building already (offset or cut differently: they overlap), or OSM has mapped the block it
      // stands in (an OSM building within CM_GAP_M) — the gap test holds the coverage test, since overlapping rings are 0 apart.
      if (osm?.size && osm.near(poly.outer.map(g), gapUnits)) { osmFirst++; continue; }
      if (hostRings.some(host => ringsIntersect(poly.outer, host)) || pinRings.some(pin => sameBuilding(poly.outer, pin))) { dropped++; continue; }
      const shapedOuter = roundRing(offsetRing(poly.outer, d, 1), r, segments, {encloseOffset: d});
      const shapedHoles = poly.holes.map(h => roundRing(offsetRing(h, d, 1), r, segments, {encloseOffset: d}))
        .filter(h => Math.abs(signedArea(h)) > 0);
      features.push({type: 'Feature', id, geometry: {type: 'Polygon', coordinates: [shapedOuter, ...shapedHoles].map(toLonLat)},
        properties: {source: 'cm', height: height + HEIGHT_LIFT_M, base: 0, render_height: height}});
      kept++;
    }
  }
  return {features, kept, away, shared, inParts, osmFirst, dropped};
}

/** Fractional tile coordinates of a lon/lat at zoom z (Web Mercator). */
function tileXY([lon, lat], z) {
  const n = 2 ** z, rad = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n];
}

/**
 * Tiles needed for a set of lon/lat regions (deduplicated, bounded by `max`). Over the bound, the tiles
 * nearest `center` (the camera, [lon, lat]) are kept, so the detail follows the part of a large เขต/อำเภอ
 * being looked at; without a centre the order is the regions' own.
 */
export function tilesForRegions(regions, z = TILE_ZOOM, max = MAX_TILES, center = null) {
  const keys = new Map();
  for (const ring of regions) for (const t of tilesForBBox(bboxOfRings([ring]), z)) keys.set(`${t.z}/${t.x}/${t.y}`, t);
  let tiles = [...keys.values()];
  if (tiles.length > max && Array.isArray(center) && center.every(Number.isFinite)) {
    const [cx, cy] = tileXY(center, z);
    const dist = t => (t.x + 0.5 - cx) ** 2 + (t.y + 0.5 - cy) ** 2;
    tiles = tiles.sort((a, b) => dist(a) - dist(b) || a.x - b.x || a.y - b.y);
  }
  return {tiles: tiles.slice(0, max), truncated: tiles.length > max, total: tiles.length};
}

/** A turn for input and frames between tiles of one update (Phase 0, 2026-11-11): resolves in a new task. */
const SLICE_MS = 12;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const breathe = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Install both tiers on a loaded style. `sourceId` is the basemap vector source
 * (OpenMapTiles schema). `tileUrl(tile)` returns the URL of one tile; the app
 * reads it from the same TileJSON MapLibre uses. `cmLoad(request)` reads one CityMETER Building V4 tile
 * (js/building-units.js#createCmTileLoader) and `cmAttribution` credits it while drawn.
 */
export function installMassing(map, {sourceId = 'openmaptiles', beforeId, colors, tileUrl, cmLoad = null, cmAttribution = '', fetchImpl = (...a) => fetch(...a), onResult = null} = {}) {
  const palette = {quiet: '#ECEBE5', focus: '#E6E3DA', ground: '#EEF1EE', ...colors};
  const cityColor = () => ['interpolate', ['linear'], ['coalesce', ['feature-state', 'fade'], 1], 0, palette.quiet, 1, palette.ground];
  // Context features carry their fade as a property (written at shaping time and when the anchors change).
  const contextColor = () => ['interpolate', ['linear'], ['coalesce', ['get', 'fade'], 1], 0, palette.quiet, 1, palette.ground];
  let enabled = true, hiddenIds = [], disposed = false, token = 0, lastKey = '', lastBucket = -1, lastTruncated = false;
  let lastInput = {regions: [], hosts: [], pins: [], latitude: 13.75, city: true, zones: []};
  const cache = new Map();

  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  if (map.getSource(sourceId) && !map.getLayer(CITY_LAYER)) {
    map.addLayer({
      id: CITY_LAYER, type: 'fill-extrusion', source: sourceId, 'source-layer': 'building', minzoom: CITY_MIN_ZOOM,
      filter: cityFilter(),
      paint: {
        'fill-extrusion-color': cityColor(),
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': SCENE.default.city,
        'fill-extrusion-vertical-gradient': true,
      },
    }, before);
  }
  // Hidden city-tier features: their buildings outside the focus, drawn the city tier's way (quiet, faded).
  map.addSource(CONTEXT_SOURCE, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, maxzoom: GEOJSON_MAXZOOM});
  map.addLayer({
    id: CONTEXT_LAYER, type: 'fill-extrusion', source: CONTEXT_SOURCE, minzoom: CITY_MIN_ZOOM,
    paint: {
      'fill-extrusion-color': contextColor(),
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-opacity': SCENE.default.city,
      'fill-extrusion-vertical-gradient': true,
    },
  }, before);
  // CityMETER Building V4 is credited in the attribution while one of its buildings is drawn (visibility toggles).
  if (cmAttribution) {
    map.addSource(CM_CREDIT_SOURCE, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, maxzoom: GEOJSON_MAXZOOM, attribution: cmAttribution});
    map.addLayer({id: CM_CREDIT_LAYER, type: 'circle', source: CM_CREDIT_SOURCE, minzoom: CITY_MIN_ZOOM, layout: {visibility: 'none'}, paint: {'circle-radius': 0, 'circle-opacity': 0}}, before);
  }
  let credited = false, creditPins = false;
  function setCredit(on) {
    const next = Boolean(on || creditPins);
    if (next === credited || !map.getLayer(CM_CREDIT_LAYER)) return;
    credited = next;
    map.setLayoutProperty(CM_CREDIT_LAYER, 'visibility', next ? 'visible' : 'none');
  }
  let creditFocus = false;
  map.addSource(FOCUS_SOURCE, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, maxzoom: GEOJSON_MAXZOOM});
  let occluderIds = [], scene = 'default', targets = [];
  map.addLayer({
    id: FOCUS_LAYER, type: 'fill-extrusion', source: FOCUS_SOURCE, minzoom: CITY_MIN_ZOOM,
    filter: ['!', ['in', ['id'], ['literal', occluderIds]]],
    paint: {
      'fill-extrusion-color': palette.focus,
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-opacity': SCENE.default.focus,
      'fill-extrusion-vertical-gradient': true,
    },
  }, before);
  map.addLayer({
    id: OCCLUDER_LAYER, type: 'fill-extrusion', source: FOCUS_SOURCE, minzoom: CITY_MIN_ZOOM,
    filter: ['in', ['id'], ['literal', occluderIds]],
    paint: {
      'fill-extrusion-color': palette.focus,
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-opacity': SCENE.default.occluder,
      'fill-extrusion-vertical-gradient': false,
    },
  }, before);

  // `match` looks a label up by hash: thousands of hidden ids cost no more per building than a few.
  function cityFilter() {
    return hiddenIds.length ? ['all', ['!=', ['get', 'hide_3d'], true], ['match', ['id'], hiddenIds, false, true]] : ['all', ['!=', ['get', 'hide_3d'], true]];
  }
  function setHidden(ids) {
    const next = [...new Set(ids)].filter(id => Number.isInteger(id)).sort((a, b) => a - b);
    if (next.length === hiddenIds.length && next.every((v, i) => v === hiddenIds[i])) return;
    hiddenIds = next;
    if (map.getLayer(CITY_LAYER)) map.setFilter(CITY_LAYER, cityFilter());
  }
  /* ---------- context features (hidden city-tier features outside the focus) ---------- */
  let contextFeatures = [];
  function setContext(list) {
    contextFeatures = list;
    writeContext();
  }
  function writeContext() {
    for (const f of contextFeatures) f.properties.fade = Math.round(fadeForGeometry(f.geometry) * 20) / 20;
    // Fully faded buildings take the ground colour (invisible): not drawn at all (they come back if the anchors move).
    map.getSource(CONTEXT_SOURCE)?.setData({type: 'FeatureCollection', features: contextFeatures.filter(f => f.properties.fade < 1)});
  }
  async function loadTile(tile) {
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    if (cache.has(key)) return cache.get(key);
    const task = (async () => {
      const r = await fetchImpl(tileUrl(tile));
      if (!r.ok) throw new Error(`tile ${key} ${r.status}`);
      const parsed = parseVectorTile(await r.arrayBuffer(), {only: ['building']});
      return parsed.layers.building || {extent: 4096, features: []};
    })();
    cache.set(key, task);
    task.catch(() => cache.delete(key));
    if (cache.size > 24) cache.delete(cache.keys().next().value);
    return task;
  }

  /** Lowest zoom of the focus tiers: FOCUS_MIN_ZOOM in 3D when the whole focus is loaded, else CITY_MIN_ZOOM. */
  let focusMinZoom = CITY_MIN_ZOOM;
  function setFocusMinZoom(z) {
    if (z === focusMinZoom || typeof map.setLayerZoomRange !== 'function') return;
    focusMinZoom = z;
    for (const id of [FOCUS_LAYER, OCCLUDER_LAYER]) if (map.getLayer(id)) map.setLayerZoomRange(id, z, 24);
  }

  /**
   * regions: lon/lat outer rings of the focused areas; hosts: rings of host buildings currently drawn by buildings.js;
   * pins: rings of pin buildings (same building only); zoom: current map zoom; city: the city tier is shown (3D);
   * zones: CityMETER units (js/building-units.js) meeting the regions, drawn from CityMETER Building V4.
   */
  async function update({regions = lastInput.regions, hosts = lastInput.hosts, pins = lastInput.pins, zoom = map.getZoom(), enabled: on = enabled, city = lastInput.city ?? enabled, latitude = lastInput.latitude, anchors: nextAnchors = null, center = null, zones = lastInput.zones} = {}) {
    enabled = on;
    lastInput = {regions, hosts, pins, latitude, city, zones};
    if (nextAnchors) setAnchors(nextAnchors);
    // In plan view (pitch 0) the focus tier still draws as flat rounded footprints; the city tier is hidden.
    for (const id of [CITY_LAYER, CONTEXT_LAYER]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', enabled && city ? 'visible' : 'none');
    for (const id of [FOCUS_LAYER, OCCLUDER_LAYER]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none');
    const bucket = Math.floor(zoom);
    const camera = center || (typeof map.getCenter === 'function' ? toArray(map.getCenter()) : null);
    const {tiles, truncated} = tilesForRegions(regions, TILE_ZOOM, MAX_TILES, camera);
    const ready = typeof tileUrl === 'function' && tiles.length > 0 && tiles.every(t => Boolean(tileUrl(t)));
    const plan = typeof cmLoad === 'function' ? planCmRequests(tiles, zones, {center: camera}) : {requests: [], zonesByTile: new Map(), truncated: false};
    const ringKey = rings => `${rings.length}:${rings.map(r => r.length + ':' + r[0]?.map(v => v.toFixed(6)).join(',')).join('|')}`;
    const key = `${enabled}|${ready}|${bucket}|${city}|${ringKey(regions)}|${ringKey(hosts)}|${ringKey(pins)}|${tiles.map(t => `${t.x}/${t.y}`).join(',')}|${plan.requests.map(q => q.key).join(',')}`;
    if (key === lastKey) return {features: 0, tiles: 0, cached: true};
    lastKey = key; lastBucket = bucket; lastTruncated = truncated;
    if (!enabled || !regions.length || !ready) {
      map.getSource(FOCUS_SOURCE)?.setData({type: 'FeatureCollection', features: []}); setHidden([]); setContext([]); creditFocus = false; setCredit(false);
      currentFeatures = []; setOccluders([]); setFocusMinZoom(CITY_MIN_ZOOM);
      const empty = {features: 0, tiles: 0, ready};
      if (typeof onResult === 'function') { try { onResult(empty); } catch (e) { console.warn('Massing onResult', e); } }
      return empty;
    }
    const my = ++token;
    const radiusM = roundingRadiusM(Math.max(zoom, 14.5), latitude), offsetM = encloseOffsetM(radiusM);
    const [layers, cmLayers] = await Promise.all([
      Promise.all(tiles.map(t => loadTile(t).catch(e => { console.warn('Massing tile unavailable', e.message || e); return null; }))),
      Promise.all(plan.requests.map(q => cmLoad(q).catch(e => { console.warn('CityMETER building tile unavailable', e.message || e); return null; }))),
    ]);
    if (my !== token || disposed) return {features: 0, tiles: 0, stale: true};
    // Shaping thousands of footprints is main-thread work: never during a camera move (it would stall
    // the animation of an area-to-area move); the previous tier stays on screen until the move ends.
    if (typeof map.isMoving === 'function' && map.isMoving()) {
      await new Promise(resolve => map.once('moveend', resolve));
      if (my !== token || disposed) return {features: 0, tiles: 0, stale: true};
    }
    // A zone is drawn from CityMETER in a tile only when every one of its requests for that tile arrived.
    const failed = new Map();
    plan.requests.forEach((q, i) => {
      if (cmLayers[i]) return;
      const k = `${q.tile.z}/${q.tile.x}/${q.tile.y}`;
      if (!failed.has(k)) failed.set(k, new Set());
      failed.get(k).add(q.zone.id);
    });
    const zonesOfTile = t => {
      const k = `${t.z}/${t.x}/${t.y}`, ids = plan.zonesByTile.get(k), bad = failed.get(k);
      return ids ? zones.filter(z => ids.has(z.id) && !bad?.has(z.id)) : [];
    };
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // D35 (OSM first, js/building-choice.js): the CityMETER buildings that will be drawn, and the OSM footprints of the
    // zone tiles, indexed once in the z14 frame; the podiums of the OSM buildings mapped in parts, for every focus tile.
    const drawnCm = plan.requests.map((q, i) => ({q, layer: cmLayers[i]}))
      .filter(({q, layer}) => layer && !failed.get(`${q.tile.z}/${q.tile.x}/${q.tile.y}`)?.has(q.zone.id));
    const cmIndex = drawnCm.length ? indexCmBuildings(drawnCm.map(({q, layer}) => ({tile: q.tile, layer}))) : null;
    const osmIndex = cmIndex ? indexOsmBuildings(layers.map((layer, i) => (layer ? {tile: tiles[i], layer, zones: zonesOfTile(tiles[i])} : null)).filter(Boolean)) : null;
    const podiums = podiumIndex(layers.map((layer, i) => (layer ? {tile: tiles[i], layer} : null)).filter(Boolean));
    const features = [], hidden = new Set(), context = [], partOutlines = [], taken = new Set(), rules = {};
    let kept = 0, dropped = 0, replaced = 0, osmFirst = 0, cmHeights = 0;
    // One tile per task (Phase 0, 2026-11-11): shaping is main-thread work, so input and frames get a turn between
    // tiles once a slice has run for SLICE_MS ms; a newer update still supersedes this one.
    let sliceStart = now();
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer) continue;
      const shaped = shapeTile(tiles[i], layer, {regions, hosts, pins, radiusM, offsetM, zones: zonesOfTile(tiles[i]), cm: cmIndex, podiums});
      features.push(...shaped.features); context.push(...shaped.context); partOutlines.push(...shaped.partOutlines);
      shaped.hiddenIds.forEach(id => hidden.add(id)); shaped.taken.forEach(k => taken.add(k));
      kept += shaped.kept; dropped += shaped.dropped; replaced += shaped.replaced; osmFirst += shaped.osmFirst; cmHeights += shaped.cmHeights;
      for (const [rule, n] of Object.entries(shaped.rules)) rules[rule] = (rules[rule] || 0) + n;
      if (now() - sliceStart > SLICE_MS) {
        await breathe();
        if (my !== token || disposed) return {features: 0, tiles: 0, stale: true};
        sliceStart = now();
      }
    }
    const cm = {requests: plan.requests.length, failed: cmLayers.filter(l => !l).length, truncated: plan.truncated, kept: 0, away: 0, shared: 0, inParts: 0, osmFirst: 0, dropped: 0};
    const seen = new Set();
    for (const {q, layer} of drawnCm) {
      const shaped = shapeCmTile(q.tile, layer, {regions, hosts, pins, radiusM, offsetM, slot: q.slot, skipRings: partOutlines, taken, osm: osmIndex, seen});
      features.push(...shaped.features);
      cm.kept += shaped.kept; cm.away += shaped.away; cm.shared += shaped.shared; cm.inParts += shaped.inParts; cm.osmFirst += shaped.osmFirst; cm.dropped += shaped.dropped;
    }
    // Ids are stable per tile building (focusFeatureId, cmFeatureId); the OSM id stays in properties.
    currentFeatures = features;
    map.getSource(FOCUS_SOURCE)?.setData({type: 'FeatureCollection', features});
    setHidden(hidden);
    setContext(context);
    // CityMETER is credited while one of its buildings, or one of its heights on an OSM outline, is drawn.
    creditFocus = cm.kept > 0 || cmHeights > 0; setCredit(creditFocus);
    setFocusMinZoom(city && !truncated ? FOCUS_MIN_ZOOM : CITY_MIN_ZOOM);
    updateOcclusion();
    const result = {features: kept + cm.kept, osm: kept, droppedForHosts: dropped, replaced, context: context.length, cm, tiles: tiles.length, truncated, minZoom: focusMinZoom, radiusM, offsetM, occluders: occluderIds.length,
      osmFirst: {kept: osmFirst, cmHeights, rules}, shapeMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)};
    // Every applied result (including zoom-triggered rebuilds) reaches the host app through onResult,
    // so a caller whose own update was superseded still sees the figures that are on screen.
    if (typeof onResult === 'function') { try { onResult(result); } catch (e) { console.warn('Massing onResult', e); } }
    return result;
  }
  const toArray = c => (typeof c?.toArray === 'function' ? c.toArray() : Number.isFinite(c?.lng) ? [c.lng, c.lat] : null);

  function retheme(next = {}) {
    Object.assign(palette, next);
    if (map.getLayer(CITY_LAYER)) map.setPaintProperty(CITY_LAYER, 'fill-extrusion-color', cityColor());
    if (map.getLayer(CONTEXT_LAYER)) map.setPaintProperty(CONTEXT_LAYER, 'fill-extrusion-color', contextColor());
    for (const id of [FOCUS_LAYER, OCCLUDER_LAYER]) if (map.getLayer(id)) map.setPaintProperty(id, 'fill-extrusion-color', palette.focus);
  }

  /* ---------- distance fade of the city tier ---------- */
  let focusAnchors = [], cameraAnchor = null, anchors = [], anchorKey = '';
  const stated = new Map(); // feature id → fade already written
  const metresBetween = (a, b) => { const kx = 111320 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), ky = 110574; return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky); };
  /** One representative vertex per polygon part (a merged feature has many parts). */
  const partPoints = g => {
    if (g?.type === 'Polygon') return g.coordinates?.[0]?.[0] ? [g.coordinates[0][0]] : [];
    if (g?.type === 'MultiPolygon') return (g.coordinates || []).map(p => p?.[0]?.[0]).filter(Boolean);
    return [];
  };
  function distanceToAnchors(point) {
    let d = Infinity;
    for (const a of anchors) d = Math.min(d, metresBetween(point, a));
    return d;
  }
  const fadeOf = d => Math.min(1, Math.max(0, (d - FADE_NEAR_M) / (FADE_FAR_M - FADE_NEAR_M)));
  /** Fade of a feature from its nearest part (stops early once a part is inside the near radius). */
  function fadeForGeometry(g) {
    if (!anchors.length) return 0;
    let d = Infinity;
    for (const p of partPoints(g)) { d = Math.min(d, distanceToAnchors(p)); if (d <= FADE_NEAR_M) break; }
    return Number.isFinite(d) ? fadeOf(d) : 1;
  }
  /** Write fade for buildings in the loaded tiles that have not been stated yet (cheap, incremental; never during a move). */
  function updateFade() {
    if (disposed || !map.getLayer(CITY_LAYER) || !map.getSource(sourceId)) return 0;
    if (typeof map.isMoving === 'function' && map.isMoving()) return 0; // moveend schedules it again
    let features;
    try { features = map.querySourceFeatures(sourceId, {sourceLayer: 'building'}); } catch { return 0; }
    let n = 0;
    for (const f of features) {
      if (f.id == null || stated.has(f.id)) continue;
      let g;
      try { g = f.geometry; } catch { continue; }
      const fade = Math.round(fadeForGeometry(g) * 20) / 20;
      try { map.setFeatureState({source: sourceId, sourceLayer: 'building', id: f.id}, {fade}); } catch { continue; }
      stated.set(f.id, fade); n++;
    }
    return n;
  }
  function applyAnchors() {
    const next = [...focusAnchors, ...(cameraAnchor ? [cameraAnchor] : [])];
    const key = next.map(a => a.map(v => +v.toFixed(5)).join(',')).join('|');
    if (key === anchorKey) return;
    anchorKey = key; anchors = next;
    stated.clear();
    try { map.removeFeatureState({source: sourceId, sourceLayer: 'building'}); } catch {}
    if (contextFeatures.length) writeContext();
    updateFade();
  }
  /** New focus anchors (venue points of the focus) invalidate every stated value. */
  function setAnchors(next = []) {
    focusAnchors = next.filter(a => Array.isArray(a) && a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])).slice(0, 80);
    applyAnchors();
  }
  /** The camera centre is an anchor too: the city reads around whatever the user is looking at. */
  function followCamera() {
    if (disposed || typeof map.getCenter !== 'function' || map.getZoom() < CAMERA_ANCHOR_MIN_ZOOM) return;
    const c = map.getCenter(), p = [c.lng, c.lat];
    if (cameraAnchor && metresBetween(cameraAnchor, p) < CAMERA_ANCHOR_STEP_M) return;
    cameraAnchor = p;
    applyAnchors();
  }
  let fadeTimer = 0;
  const scheduleFade = () => { clearTimeout(fadeTimer); fadeTimer = setTimeout(() => { followCamera(); updateFade(); }, 120); };
  const onSourceData = e => { if (e.sourceId === sourceId && e.isSourceLoaded) scheduleFade(); };
  map.on('sourcedata', onSourceData);
  map.on('moveend', scheduleFade);

  /* ---------- scene (venue-level two-point view) and occlusion ---------- */
  let currentFeatures = [];
  function setOccluders(ids) {
    const next = [...ids];
    if (next.length === occluderIds.length && next.every((v, i) => v === occluderIds[i])) return;
    occluderIds = next;
    if (map.getLayer(FOCUS_LAYER)) map.setFilter(FOCUS_LAYER, ['!', ['in', ['id'], ['literal', occluderIds]]]);
    if (map.getLayer(OCCLUDER_LAYER)) map.setFilter(OCCLUDER_LAYER, ['in', ['id'], ['literal', occluderIds]]);
  }
  /**
   * Screen-space box of a building: ground vertices plus their tops, where a
   * vertex's top is lifted by height × local pixels-per-metre × sin(pitch).
   * MapLibre projects ground points only, so this is the standard approximation.
   * Also returns the mean ground y (larger = nearer the camera in a pitched view).
   */
  function screenBox(ring, height) {
    const sinPitch = Math.sin(map.getPitch() * Math.PI / 180);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, sumY = 0, n = 0;
    for (const [lon, lat] of ring) {
      const p = map.project([lon, lat]);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const q = map.project([lon + 1e-5, lat]);
      const metres = 1.11320 * Math.cos(lat * Math.PI / 180); // 1e-5° of longitude in metres
      const ppm = Math.hypot(q.x - p.x, q.y - p.y) / metres;
      const top = p.y - height * ppm * sinPitch;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, top, p.y); maxY = Math.max(maxY, p.y);
      sumY += p.y; n++;
    }
    return n ? {minX, minY, maxX, maxY, groundY: sumY / n} : null;
  }
  const overlaps = (a, b) => a && b && a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
  /** Focus buildings whose screen box overlaps a target and whose ground is nearer the camera → see-through. */
  function updateOcclusion() {
    if (scene !== 'eye' || !targets.length || !currentFeatures.length || map.getPitch() < 30) { setOccluders([]); return; }
    const boxes = targets.map(t => screenBox(t.ring, t.height)).filter(Boolean);
    if (!boxes.length) { setOccluders([]); return; }
    const ids = [];
    for (const f of currentFeatures) {
      const box = screenBox(f.geometry.coordinates[0], f.properties.height);
      if (box && boxes.some(t => overlaps(box, t) && box.groundY > t.groundY + 1)) ids.push(f.id);
    }
    setOccluders(ids);
  }
  /**
   * scene: 'default' | 'eye'. targets: [{ring: [[lon,lat]…], height}] — the venue's
   * host building rings (data layer) the camera is looking at.
   */
  function setScene(next = 'default', nextTargets = []) {
    scene = SCENE[next] ? next : 'default';
    targets = Array.isArray(nextTargets) ? nextTargets.filter(t => Array.isArray(t?.ring) && t.ring.length >= 4) : [];
    const o = SCENE[scene];
    for (const id of [CITY_LAYER, CONTEXT_LAYER]) if (map.getLayer(id)) map.setPaintProperty(id, 'fill-extrusion-opacity', o.city);
    if (map.getLayer(FOCUS_LAYER)) map.setPaintProperty(FOCUS_LAYER, 'fill-extrusion-opacity', o.focus);
    if (map.getLayer(OCCLUDER_LAYER)) map.setPaintProperty(OCCLUDER_LAYER, 'fill-extrusion-opacity', o.occluder);
    updateOcclusion();
    return {scene, targets: targets.length, occluders: occluderIds.length};
  }
  // Coalesced: a camera fit jumps the map many times in one task (each jump fires moveend/zoomend);
  // occlusion and the zoom re-shape run once, after the last one.
  let occlusionTimer = 0, zoomTimer = 0, retileTimer = 0;
  const onMoveEnd = () => { clearTimeout(occlusionTimer); occlusionTimer = setTimeout(() => { if (!disposed && scene === 'eye' && targets.length) updateOcclusion(); }, 40); };
  map.on('moveend', onMoveEnd);
  const onZoomEnd = () => { clearTimeout(zoomTimer); zoomTimer = setTimeout(() => { if (!disposed && enabled && lastInput.regions.length && Math.floor(map.getZoom()) !== lastBucket) update({zoom: map.getZoom()}); }, 40); };
  map.on('zoomend', onZoomEnd);
  // A focus larger than MAX_TILES follows the camera: after a move the tiles nearest the new centre are
  // planned again (an unchanged plan is a cached no-op inside update).
  const onRetile = () => { clearTimeout(retileTimer); retileTimer = setTimeout(() => { if (!disposed && enabled && lastTruncated && lastInput.regions.length) update({zoom: map.getZoom()}); }, 120); };
  map.on('moveend', onRetile);

  function dispose() {
    disposed = true;
    clearTimeout(fadeTimer); clearTimeout(occlusionTimer); clearTimeout(zoomTimer); clearTimeout(retileTimer);
    map.off('zoomend', onZoomEnd);
    map.off('moveend', onMoveEnd);
    map.off('moveend', onRetile);
    map.off('moveend', scheduleFade);
    map.off('sourcedata', onSourceData);
    try { map.removeFeatureState({source: sourceId, sourceLayer: 'building'}); } catch {}
    for (const id of [OCCLUDER_LAYER, FOCUS_LAYER, CM_CREDIT_LAYER, CONTEXT_LAYER, CITY_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of [FOCUS_SOURCE, CM_CREDIT_SOURCE, CONTEXT_SOURCE]) if (map.getSource(id)) map.removeSource(id);
    contextFeatures = [];
  }
  /** Pin buildings drawn from CityMETER Building V4 (js/pin-buildings.js) keep the credit on too. */
  function creditPinBuildings(on) { creditPins = Boolean(on); setCredit(creditFocus); }
  return {update, retheme, setScene, setAnchors, updateFade, dispose, creditPinBuildings,
    layerIds: {city: CITY_LAYER, context: CONTEXT_LAYER, focus: FOCUS_LAYER, occluder: OCCLUDER_LAYER, credit: CM_CREDIT_LAYER},
    get occluders() { return occluderIds.slice(); }, get faded() { return stated.size; }, get anchors() { return anchors.slice(); },
    get hidden() { return hiddenIds.slice(); }, get context() { return contextFeatures.length; }, get credited() { return credited; }};
}

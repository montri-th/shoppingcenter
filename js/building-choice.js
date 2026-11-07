/**
 * OpenStreetMap first, CityMETER Building V4 as the fallback — which source draws one building inside a CityMETER unit
 * (D32, owner 7 Nov 2026 08:31: “ถ้ามี อาคารจาก OSM ที่รายละเอียดดีกว่า ให้ใช้ OSM ก่อน CityMETER ใช้ เป็น fallback นะ”).
 *
 * What the two sources hold (probe of 8 z14 tiles in CityMETER units, 7 Nov 2026 — PARC Bangna, Esplanade Ratchada,
 * LIVE Ramintra, Ubon, Khon Kaen, Phuket, Hat Yai, Korat; 9,302 OSM buildings of 12 m² or more): CityMETER Building V4
 * carries the same outline as OpenStreetMap for 97 % of them (same corners in most pairs, area ratio median 1.00) and
 * adds its own buildings where OSM has none — those are the boxy ones. Before 0.1.18 a CityMETER unit replaced every
 * OSM building, so the 1.4 % that CityMETER does not hold were not drawn at all. The rule looks only at the places where
 * the two differ:
 *  1. one source maps as one building what the other maps as two or more (together at least half of it) → the source
 *     with more buildings;
 *  2. the same single building in both → OpenStreetMap when its outline is more detailed (more corners, and not under
 *     half of CityMETER's footprint) or covers more than twice CityMETER's footprint; otherwise CityMETER;
 *  3. only one source has a building there → that source.
 * An OSM building drawn in place of a CityMETER one keeps the CityMETER height when its own is the OpenMapTiles
 * default (5 m: no height or levels tag); either height is display context (a CityMETER height is a model estimate).
 * A building OSM maps in parts (building:part, LOD2) is decided before this: its parts stay OSM.
 *
 * Pure functions on plain records, shared by the focus tier (js/massing.js) and the pin buildings (js/pin-buildings.js).
 */

/** OpenMapTiles render_height when a building has no height or levels tag. */
export const OSM_DEFAULT_HEIGHT_M = 5;
export const isDefaultOsmHeight = (height, base = 0) => Number(height) === OSM_DEFAULT_HEIGHT_M && !Number(base);
/** Pieces under half of a building's footprint are pieces of it, not the same building drawn another way. */
export const SAME_SIZE_MIN = 0.5;
/** An OSM footprint over twice the CityMETER one holds more of the building than CityMETER does. */
export const LARGER_FACTOR = 2;
/** A vertex counts as a corner when the outline turns there by more than this (collinear points add no detail). */
export const CORNER_TURN_DEG = 10;

const CM = Object.freeze({use: 'cm', take: [], height: null, rule: 'cm'});
const OSM_ONLY = Object.freeze({use: 'osm', take: [], height: null, rule: 'osm-only'});

/** Corners of a closed ring (any planar frame): vertices where the outline turns by more than CORNER_TURN_DEG. */
export function corners(ring) {
  const n = Array.isArray(ring) ? ring.length - 1 : 0;
  if (n < 3) return Math.max(0, n);
  const limit = Math.sin((CORNER_TURN_DEG * Math.PI) / 180);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[(i + n - 1) % n], b = ring[i], c = ring[(i + 1) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], wx = c[0] - b[0], wy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lw = Math.hypot(wx, wy);
    if (!lu || !lw) continue;
    const cross = (ux * wy - uy * wx) / (lu * lw), dot = (ux * wx + uy * wy) / (lu * lw);
    if (Math.abs(cross) > limit || dot < 0) count++;
  }
  return count;
}

/** True when the OSM building is the more detailed drawing of the same single building (rule 2). */
export function osmFiner(o, c) {
  if (o.areaM2 > LARGER_FACTOR * c.areaM2) return true;
  return !o.cut && o.corners > c.corners && o.areaM2 >= SAME_SIZE_MIN * c.areaM2;
}

/**
 * The source of one OSM building inside a CityMETER unit.
 * o: {corners, areaM2, height, base, cut} — cut: the piece is crossed by its tile's edge (OpenFreeMap clips per tile),
 *    so its corners and area are the tile's: it never wins on corners and does not count towards rule 1.
 * inside: CityMETER buildings whose interior point stands in it ({corners, areaM2, height, key});
 * host: the CityMETER building holding its interior point, or null; hostOsm: {count, areaM2} of the whole OSM buildings
 *    whose interior point stands in that host (it included).
 * Returns {use: 'osm' | 'cm', take: the CityMETER buildings it is drawn in place of, height: the CityMETER height to draw
 * it with (its own is the OSM default) or null, rule}.
 */
export function chooseSource(o, {inside = [], host = null, hostOsm = null} = {}) {
  const insideArea = inside.reduce((sum, c) => sum + c.areaM2, 0);
  if (inside.length >= 2 && insideArea >= SAME_SIZE_MIN * o.areaM2) return CM; // rule 1: CityMETER has more buildings
  if (!inside.length && host && hostOsm && hostOsm.count >= 2 && hostOsm.areaM2 >= SAME_SIZE_MIN * host.areaM2) {
    return osmFor(o, [host], host, 'osm-more-buildings'); // rule 1: OSM has more buildings
  }
  const c = inside.length ? inside.reduce((a, b) => (b.areaM2 > a.areaM2 ? b : a)) : host;
  if (!c) return OSM_ONLY; // rule 3
  return osmFiner(o, c) ? osmFor(o, inside.length ? inside : [c], c, 'osm-finer') : CM; // rule 2
}
function osmFor(o, take, c, rule) {
  const height = isDefaultOsmHeight(o.height, o.base) && Number.isFinite(c.height) && c.height > 0 ? c.height : null;
  return {use: 'osm', take, height, rule};
}

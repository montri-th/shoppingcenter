/**
 * OpenStreetMap first, everywhere; CityMETER Building V4 only where OpenStreetMap has no building (D35, owner
 * 7 Nov 2026 16:35: “เช็คดีๆเรื่องการใช้ 3d building mass จาก OSM ที่ LOD สูงกว่าเป็นหลัก แล้วใช้ จาก CityMETER เป็น fallback
 * เท่านั้น บังคับเรื่องนี้ให้ทั่วทั้งเวบ”). It replaces the per-building choice of D32 (0.1.18), which let CityMETER draw a
 * building when it held two or more blocks inside one OSM building, or when its single box had more corners: at Samyan
 * Mitrtown that drew eight CityMETER blocks of 15–785 m² over one podium with two towers.
 *
 * The order, for the focus tier (js/massing.js), the pin and site buildings (js/pin-buildings.js) alike:
 *  1. OSM building parts (LOD2, building:part) — the parts; the outline itself as the podium under them when OSM gives
 *     the outline its own height and that height is lower than its tallest part (podiumHeight);
 *  2. an OSM building (LOD1) — always that building. Its height is OpenMapTiles render_height; only when that is the
 *     default (5 m: no height or levels tag) does it take the CityMETER height of the same building (a model estimate);
 *  3. a CityMETER building — only where OSM has none: never when its interior point stands in an OSM building, an OSM
 *     building's interior point stands in it, or OSM buildings cover COVER_MIN of its footprint (coveredShare). Around
 *     the venues (the focus tier) it is not drawn either within CM_GAP_M of an OSM building: OSM has mapped that block.
 *     A venue's own buildings follow the research: the building its pin stands in is never dropped (D28), and a site
 *     point's building is dropped next to OSM buildings only as a model artifact (isNarrowTall, or next to an OSM
 *     building mapped in 3D parts).
 *
 * Pure functions on plain records (any planar frame).
 */

/** OpenMapTiles render_height when a building has no height or levels tag. */
export const OSM_DEFAULT_HEIGHT_M = 5;
export const isDefaultOsmHeight = (height, base = 0) => Number(height) === OSM_DEFAULT_HEIGHT_M && !Number(base);
/** A CityMETER building with this share of its footprint under OSM buildings is a building OSM already draws. */
export const COVER_MIN = 0.3;
/**
 * A CityMETER building closer than this to an OSM building is not drawn: OSM has mapped that block, and the CityMETER
 * blocks it does not hold there are mostly trees, shadows and pieces of the same buildings (probe of 7 Nov 2026, D35:
 * Samyan Mitrtown's six CityMETER blocks of 15–785 m² and 31–92 m stand 0–17 m from its OSM podium; in its z14 tile 469
 * of 597 CityMETER-only buildings lie within 20 m of an OSM building, against 161 of 1,312 at PARC Bangna and 54 of 5,832
 * at LIVE Ramintra, where OSM maps few buildings and CityMETER fills the gaps).
 */
export const CM_GAP_M = 20;
/**
 * A site point (one building of a venue's research site, data/venue-sites.json) keeps its CityMETER building next to
 * OSM buildings — the research holds it as one of the venue's buildings, as the owner asked for Mega Bangna — unless it
 * is a model artifact: within CM_GAP_M of an OSM building and narrow and tall (at least CM_ARTIFACT_HEIGHT_M high on
 * less than CM_ARTIFACT_AREA_M2: a shadow, a tree, a pole or a sign), or within CM_GAP_M of a building OSM maps in 3D
 * parts (its mapper modelled the whole complex: Samyan Mitrtown's six blocks, one of them 92 m on 785 m², stand
 * 0–17 m from its LOD2 podium). Of Mega Bangna's 23 CityMETER site buildings next to OSM buildings this drops eleven
 * narrow ones of 19–281 m² and 15–46 m and keeps twelve, the wings and podiums of 1,700–2,500 m² among them (probe of
 * 7 Nov 2026 on the live tiles: 89 site points → 38 OSM, 40 CityMETER, 11 artifacts).
 */
export const CM_ARTIFACT_HEIGHT_M = 15;
export const CM_ARTIFACT_AREA_M2 = 300;
export const isNarrowTall = c => Number(c.height) >= CM_ARTIFACT_HEIGHT_M && c.areaM2 < CM_ARTIFACT_AREA_M2;
/** An outline lower than its tallest part by more than this is the podium the parts stand on. */
export const PODIUM_MARGIN_M = 3;
/** A vertex counts as a corner when the outline turns there by more than this (collinear points add no detail). */
export const CORNER_TURN_DEG = 10;

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

/**
 * The source of one OSM building inside a CityMETER unit: always OSM (D35).
 * o: {areaM2, height, base}; inside: CityMETER buildings whose interior point stands in it ({areaM2, height, key});
 * host: the CityMETER building holding its interior point, or null.
 * Returns {use: 'osm', take: the CityMETER buildings it is drawn in place of, height: the CityMETER height to draw it with
 * (its own is the OSM default) or null, rule: 'osm-first' (it stands for CityMETER buildings) | 'osm-only'}.
 */
export function chooseSource(o, {inside = [], host = null} = {}) {
  const take = inside.length ? inside : host ? [host] : [];
  const c = inside.length ? inside.reduce((a, b) => (b.areaM2 > a.areaM2 ? b : a)) : host;
  const height = c && isDefaultOsmHeight(o.height, o.base) && Number.isFinite(c.height) && c.height > 0 ? c.height : null;
  return {use: 'osm', take, height, rule: take.length ? 'osm-first' : 'osm-only'};
}

/**
 * The podium height of an OSM building mapped in parts, or null. OSM's Simple 3D Buildings scheme gives the outline
 * either the height of the whole building (its tallest part) or its own base mass; only the second is drawn: a real
 * height (not the default) lower than the tallest part by more than PODIUM_MARGIN_M. outline, parts: {height, base}.
 */
export function podiumHeight(outline, parts = []) {
  const h = Number(outline?.height);
  if (!(h > 0) || isDefaultOsmHeight(h, outline.base) || Number(outline.base) > 0 || !parts.length) return null;
  const top = Math.max(...parts.map(p => Number(p.height) || 0));
  return h < top - PODIUM_MARGIN_M ? h : null;
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Up to k × k grid points inside a closed ring (any planar frame), for coverage tests; the ring's own interior first. */
export function ringSamples(ring, k = 5) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  const out = [];
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const p = [w + ((e - w) * (i + 0.5)) / k, s + ((n - s) * (j + 0.5)) / k];
      if (pointInRing(p, ring)) out.push(p);
    }
  }
  return out;
}

/** Share of `samples` that `covered(point)` says stand in an OSM building (0 without samples). */
export function coveredShare(samples, covered) {
  if (!samples.length) return 0;
  let hit = 0;
  for (const p of samples) if (covered(p)) hit++;
  return hit / samples.length;
}

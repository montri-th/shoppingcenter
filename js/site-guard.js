/**
 * Separate venues (D42, owner 8 Nov 2026 08:22, with a phone screenshot of Emporium: “เลือก Emporium แล้วมันขึ้น 2 อาคาร
 * รวม EmQuatier ด้วย ต้องแยกกัน … แก้ไขเคสนี้ทุก venue ทั่วประเทศ”): a venue's research site (data/venue-sites.json) never
 * draws another venue's building.
 *
 * Cause: an OpenStreetMap outline can hold more than one venue (Emporium's, “The Em District”, crosses Sukhumvit Road to
 * EmQuartier). The D28 draft check looked only for another venue's pin inside the outline; EmQuartier's pin stands
 * 19 m outside its own building, so the outline passed as `clean` and the site took EmQuartier's building.
 * The research rows were corrected (scripts/separate-sites.py: Emporium, Central Eastville, Malin Plaza); this is the
 * page's own guard for what a site point maps to in the live tiles (js/pin-buildings.js), so a site row written later
 * cannot bring the case back.
 *
 * A site part — never the building the venue's own pin stands in — is another venue's when
 *  - another venue's point stands in it, or within PIN_TOLERANCE_M of its edge (the page's own pin rule), or
 *  - it and another venue's validated host footprint (data/venue-buildings.geojson) cover FOOTPRINT_SHARE of each other
 *    (either way, sampled).
 * Another venue: a counted venue, or a component of another family, with a point; never the venue's own family (its
 * parent, its components, its sister components) nor a row held as a duplicate or with the same name.
 *
 * Pure functions on plain records; lon/lat in, metres in a local frame inside.
 */
import {pointInRing, ringSamples, coveredShare} from './building-choice.js';

export const GUARD_PIN_M = 3;          // js/pin-buildings.js PIN_TOLERANCE_M
export const FOOTPRINT_SHARE = 0.3;    // scripts/separate-sites.py FOOTPRINT_SHARE
export const GUARD_REACH_M = 800;      // other venues considered round the venue's point (sites reach 600 m)
const SAMPLES = 6;                     // a 6 × 6 grid of samples per ring

const RAD = Math.PI / 180;
const frame = lat => ({kx: 111320 * Math.cos(lat * RAD), ky: 110574});
const asList = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const hasPoint = r => Number.isFinite(r?.lon) && Number.isFinite(r?.lat);

/** The venue and its family: parent, the parent's components, its own components (listed or pointing at it). */
export function familyOf(venue, rows) {
  const fam = new Set([venue.id]);
  const byId = rows instanceof Map ? rows : new Map(rows.map(r => [r.id, r]));
  if (venue.parentId) {
    fam.add(venue.parentId);
    for (const c of asList(byId.get(venue.parentId)?.children)) fam.add(typeof c === 'string' ? c : c?.id);
  }
  for (const c of asList(venue.children)) fam.add(typeof c === 'string' ? c : c?.id);
  for (const r of byId.values()) if (r.parentId === venue.id) fam.add(r.id);
  fam.delete(undefined);
  return fam;
}

/** Another venue for the guard: counted, or a component of another family; never the family or a held duplicate. */
export function isOtherVenue(venue, w, family) {
  if (!w || family.has(w.id) || !hasPoint(w)) return false;
  if (w.countHold === 'duplicate' || (w.name && w.name === venue.name)) return false;
  return Boolean(w.countable) || (w.countHold === 'component' && !family.has(w.parentId));
}

const bboxOf = ring => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
};
const outerRingsOf = geometry => (geometry?.type === 'Polygon' ? [geometry.coordinates[0]]
  : geometry?.type === 'MultiPolygon' ? geometry.coordinates.map(p => p[0]) : []).filter(r => Array.isArray(r) && r.length >= 4);

/**
 * What a venue's site must not draw: `pins` (other venues' points within GUARD_REACH_M) and `hosts` (outer rings of other
 * venues' validated host footprints with a vertex within GUARD_REACH_M). `rows`: every venue row (array or Map by id);
 * `hostFeatures`: data/venue-buildings.geojson features. Null when nothing is near.
 */
export function siteExclusions(venue, rows, hostFeatures = []) {
  if (!hasPoint(venue)) return null;
  const all = rows instanceof Map ? [...rows.values()] : rows;
  const family = familyOf(venue, rows instanceof Map ? rows : new Map(all.map(r => [r.id, r])));
  const {kx, ky} = frame(venue.lat);
  const near = ([lon, lat]) => Math.hypot((lon - venue.lon) * kx, (lat - venue.lat) * ky) <= GUARD_REACH_M;
  const pins = all.filter(w => isOtherVenue(venue, w, family) && near([w.lon, w.lat])).map(w => ({id: w.id, point: [w.lon, w.lat]}));
  const hosts = [];
  for (const f of hostFeatures || []) {
    if (f?.properties?.geometry_role !== 'host_building_footprint_not_shop_unit') continue;
    const ids = asList(f.properties.venue_ids);
    if (!ids.length || ids.some(id => family.has(id))) continue;
    for (const ring of outerRingsOf(f.geometry)) if (ring.some(near)) hosts.push({ids, ring, bbox: bboxOf(ring)});
  }
  return pins.length || hosts.length ? {pins, hosts} : null;
}

/** Distance in metres from a lon/lat point to a lon/lat ring's edges. */
function edgeDistanceM(p, ring) {
  const {kx, ky} = frame(p[1]);
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][0] - p[0]) * kx, ay = (ring[i][1] - p[1]) * ky, bx = (ring[i + 1][0] - p[0]) * kx, by = (ring[i + 1][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

const inPart = (p, part) => pointInRing(p, part.outer) && !(part.holes || []).some(h => pointInRing(p, h));
const boxesMeet = (a, b, padX = 0, padY = 0) => a[0] - padX <= b[2] && b[0] - padX <= a[2] && a[1] - padY <= b[3] && b[1] - padY <= a[3];

/**
 * Why a site part is another venue's ({id, why: 'pin'|'host'}), or null. `part`: {outer, holes?} in lon/lat (the shape
 * js/pin-buildings.js matches); `ex`: from siteExclusions.
 */
export function otherVenueOf(part, ex) {
  if (!ex || !Array.isArray(part?.outer) || part.outer.length < 4) return null;
  const box = bboxOf(part.outer);
  const {kx, ky} = frame((box[1] + box[3]) / 2);
  const padX = (GUARD_PIN_M + 1) / kx, padY = (GUARD_PIN_M + 1) / ky;
  for (const {id, point} of ex.pins || []) {
    if (point[0] < box[0] - padX || point[0] > box[2] + padX || point[1] < box[1] - padY || point[1] > box[3] + padY) continue;
    if (inPart(point, part) || edgeDistanceM(point, part.outer) <= GUARD_PIN_M) return {id, why: 'pin'};
  }
  let samples = null;
  for (const host of ex.hosts || []) {
    if (!boxesMeet(box, host.bbox)) continue;
    samples ||= ringSamples(part.outer, SAMPLES).filter(p => !(part.holes || []).some(h => pointInRing(p, h)));
    if (coveredShare(samples, p => pointInRing(p, host.ring)) >= FOOTPRINT_SHARE
      || coveredShare(ringSamples(host.ring, SAMPLES), p => inPart(p, part)) >= FOOTPRINT_SHARE) return {id: host.ids[0], why: 'host'};
  }
  return null;
}

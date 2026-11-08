// Site drafts from OpenStreetMap outlines, for the site research helper (scripts/site-candidates.mjs `draft`).
// Owner 2026-11-05 20:38: “ลองตามที่พี่แนะนำได้เลย เริ่มที่ ราว 130 ศูนย์ที่ร่างได้เลย ตรวจแห่งละ 3–5 นาที ก่อน” — Claude drafts each
// site from the OpenStreetMap area that holds the venue's pin (landuse=retail, a shop=mall area that is not a building,
// or amenity=marketplace) and the CityMETER buildings the map draws; the research team reviews every draft before a
// row of the site tab becomes `checked`. An outline is someone's map of the shopping area, not a title deed, the deed
// area or ownership. Pure functions with no packages and no node: imports, so the same code runs in the helper (Node)
// and in a browser (the classification of all venues was run from this file on GitHub Pages).
// Research tool only: nothing here enters the page.
import {pointInRing, interiorPoint} from '../js/pin-buildings.js';
import {ringSamples, coveredShare} from '../js/building-choice.js';
import {familyOf, isOtherVenue, FOOTPRINT_SHARE} from '../js/site-guard.js';

export const DRAFT_MAX_M = 600;     // scripts/build-venue-sites.py SITE_MAX_M and js/app.js SITE_MAX_M
export const DRAFT_MARGIN_M = 50;   // reach of the candidates beyond the outline's farthest vertex
export const NEAR_M = 30;           // an outline this close to a pin that stands outside it is listed as `near`
export const OSM_ONLY_MIN_M2 = 100; // smaller OpenStreetMap buildings are not suggested as --osm-point
export const DRAFT_CLASSES = ['clean', 'shared', 'beyond_600m', 'near', 'commercial', 'mall_building', 'none'];

export const metresAt = lat => ({kx: 111320 * Math.cos((lat * Math.PI) / 180), ky: 110574});
const round6 = v => Math.round(v * 1e6) / 1e6;
const closeRing = ring => {
  const r = ring.map(p => [round6(p[0]), round6(p[1])]);
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([r[0][0], r[0][1]]);
  return r;
};

/** The tags that make an OpenStreetMap area a site outline: the shopping area itself, never a building. */
export const isSiteTag = (t = {}) => !t.building && !t['building:part'] && (t.landuse === 'retail' || t.shop === 'mall' || t.amenity === 'marketplace');
const isCommercial = (t = {}) => !t.building && !t['building:part'] && t.landuse === 'commercial';
const isMallBuilding = (t = {}) => Boolean(t.building) && (t.shop === 'mall' || t.shop === 'department_store' || t.building === 'retail');

/** Polygons [[outer, ...holes], ...] of a GeoJSON Polygon, MultiPolygon, Feature or FeatureCollection (rings closed, 6 decimals). */
export function outlinePolys(g) {
  if (!g) return [];
  if (g.type === 'FeatureCollection') return g.features.flatMap(f => outlinePolys(f));
  if (g.type === 'Feature') return outlinePolys(g.geometry);
  if (g.type === 'Polygon') return [g.coordinates.map(closeRing)];
  if (g.type === 'MultiPolygon') return g.coordinates.map(p => p.map(closeRing));
  return [];
}

/** GeoJSON of polygons (the helper writes it as sites/<venue_id>/draft-site.geojson; `row --site` reads it). */
export const polysGeoJson = (polys, properties = {}) => ({type: 'FeatureCollection', features: [{type: 'Feature', properties,
  geometry: {type: 'MultiPolygon', coordinates: polys}}]});

const sameXY = (a, b) => a[0] === b[0] && a[1] === b[1];
/** Closed rings from way pieces joined end to end (multipolygon members); pieces that never close are dropped. */
function joinRings(pieces) {
  const pool = pieces.filter(w => w.length >= 2).map(w => w.slice()), rings = [];
  while (pool.length) {
    let ring = pool.shift();
    while (!sameXY(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const i = pool.findIndex(w => sameXY(w[0], end) || sameXY(w[w.length - 1], end));
      if (i < 0) break;
      let w = pool.splice(i, 1)[0];
      if (!sameXY(w[0], end)) w = w.reverse();
      ring = ring.concat(w.slice(1));
    }
    if (ring.length >= 4 && sameXY(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

/** Polygons of one Overpass `out geom` element (a closed way, or a multipolygon relation), or null. */
export function polysFromOverpass(e) {
  const pts = g => (g || []).map(p => [round6(p.lon), round6(p.lat)]);
  if (e?.type === 'way') {
    const r = pts(e.geometry);
    return r.length >= 4 && sameXY(r[0], r[r.length - 1]) ? [[r]] : null;
  }
  if (e?.type !== 'relation') return null;
  const ways = (e.members || []).filter(m => m.type === 'way' && m.geometry);
  const outers = joinRings(ways.filter(m => m.role !== 'inner').map(m => pts(m.geometry)));
  const inners = joinRings(ways.filter(m => m.role === 'inner').map(m => pts(m.geometry)));
  if (!outers.length) return null;
  const polys = outers.map(o => [o]);
  for (const h of inners) { const p = polys.find(q => pointInRing(h[0], q[0])); if (p) p.push(h); }
  return polys;
}

/** A point stands in the polygons (in an outer ring and in none of its holes) — the rule of `row --site`. */
export const inPolys = (p, polys) => polys.some(([outer, ...holes]) => pointInRing(p, outer) && !holes.some(h => pointInRing(p, h)));

const ringM2 = (ring, lat0) => {
  const {kx, ky} = metresAt(lat0);
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
  return Math.abs(a) / 2;
};
function distToSegmentsM(p, ring) {
  const {kx, ky} = metresAt(p[1]);
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][0] - p[0]) * kx, ay = (ring[i][1] - p[1]) * ky, bx = (ring[i + 1][0] - p[0]) * kx, by = (ring[i + 1][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Size of an outline round a venue's point: farthest outer vertex, area, bbox, and the pin's distance to it (0 inside). */
export function outlineStats(row, polys) {
  const {kx, ky} = metresAt(row.lat);
  let maxDistM = 0, areaM2 = 0, w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [outer, ...holes] of polys) {
    for (const [x, y] of outer) {
      maxDistM = Math.max(maxDistM, Math.hypot((x - row.lon) * kx, (y - row.lat) * ky));
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
    }
    areaM2 += ringM2(outer, row.lat) - holes.reduce((a, h) => a + ringM2(h, row.lat), 0);
  }
  const pin = [row.lon, row.lat];
  const pinM = inPolys(pin, polys) ? 0 : Math.min(...polys.flatMap(p => p.map(r => distToSegmentsM(pin, r))));
  return {maxDistM: Math.round(maxDistM), areaM2: Math.round(areaM2), bbox: [w, s, e, n], pinM: Math.round(pinM)};
}

/** Counted venues, other than the venue, its parent and its components, whose pin stands in the outline. */
export function otherPinsIn(row, polys, venues) {
  const own = new Set([row.id, row.parentId, ...(Array.isArray(row.children) ? row.children.map(c => (typeof c === 'string' ? c : c?.id)) : [])].filter(Boolean));
  const [w, s, e, n] = outlineStats(row, polys).bbox;
  return venues.filter(v => v.countable && !own.has(v.id) && v.parentId !== row.id && Number.isFinite(v.lon) && Number.isFinite(v.lat)
    && v.lon >= w && v.lon <= e && v.lat >= s && v.lat <= n && inPolys([v.lon, v.lat], polys));
}

/**
 * Other venues an outline may hold (D42, owner 2026-11-08 08:22: “เลือก Emporium แล้วมันขึ้น 2 อาคาร รวม EmQuatier ด้วย
 * ต้องแยกกัน”): another venue (js/site-guard.js isOtherVenue: counted, or a component of another family) whose point
 * stands in the outline (`pin_inside`) or within `nearM` of it (`pin_near`: a pin outside its own building, as
 * EmQuartier's, 19 m from it), and another venue's validated host footprint (`hosts`: data/venue-buildings.geojson
 * features) with FOOTPRINT_SHARE of its samples in the outline (`host_footprint`). Emporium's outline (The Em District)
 * passed the D28 check as clean because EmQuartier's pin stands 19 m outside its building and outside the outline.
 */
export function otherVenuesAt(row, polys, venues, {nearM = NEAR_M, hosts = []} = {}) {
  const family = familyOf(row, venues);
  const out = new Map();
  for (const v of venues) {
    if (!isOtherVenue(row, v, family)) continue;
    const p = [v.lon, v.lat];
    if (inPolys(p, polys)) out.set(v.id, {id: v.id, name: v.name, group: v.group, why: 'pin_inside'});
    else if (nearM > 0 && Math.min(...polys.flatMap(poly => poly.map(r => distToSegmentsM(p, r)))) <= nearM) out.set(v.id, {id: v.id, name: v.name, group: v.group, why: 'pin_near'});
  }
  const byId = new Map(venues.map(v => [v.id, v]));
  for (const f of hosts || []) {
    if (f?.properties?.geometry_role !== 'host_building_footprint_not_shop_unit') continue;
    const ids = (f.properties.venue_ids || []).filter(id => !family.has(id));
    if (!ids.length || ids.length < (f.properties.venue_ids || []).length || out.has(ids[0])) continue;
    const g = f.geometry, rings = g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map(q => q[0]) : [];
    const samples = rings.flatMap(r => ringSamples(r, 6));
    if (samples.length && coveredShare(samples, p => inPolys(p, polys)) >= FOOTPRINT_SHARE) {
      const v = byId.get(ids[0]);
      out.set(ids[0], {id: ids[0], name: v?.name || '', group: v?.group || '', why: 'host_footprint'});
    }
  }
  return [...out.values()];
}

/**
 * Class of a venue from the Overpass elements round its pin (`is_in` areas plus site outlines within NEAR_M):
 *   clean       a site outline holds the pin; no other venue is in it or next to it; every vertex ≤ 600 m from the pin
 *   shared      … another venue's pin is in it or within NEAR_M of it, or another venue's validated host footprint is
 *               in it (otherVenuesAt, D42; its buildings are that venue's until the layout says otherwise)
 *   beyond_600m … a vertex lies more than 600 m from the pin (too large for a site of this page)
 *   near        no outline holds the pin, one lies within NEAR_M m of it (the pin may stand on the road)
 *   commercial  only a landuse=commercial area holds the pin
 *   mall_building only a building tagged as a mall or retail building holds the pin (one building: nothing to group)
 *   none        nothing
 * The outline is the smallest site outline that holds the pin (the most specific one).
 */
export function classifyPin(row, elements, venues, {hosts = []} = {}) {
  const pin = [row.lon, row.lat], seen = new Set(), areas = [];
  for (const e of elements || []) {
    const key = `${e.type}/${e.id}`;
    if (seen.has(key) || (e.type !== 'way' && e.type !== 'relation')) continue;
    seen.add(key);
    const polys = polysFromOverpass(e);
    if (polys) areas.push({osm: key, tags: e.tags || {}, polys, stats: outlineStats(row, polys)});
  }
  const pick = list => list.sort((a, b) => a.stats.areaM2 - b.stats.areaM2)[0] || null;
  const holding = pick(areas.filter(a => isSiteTag(a.tags) && a.stats.pinM === 0));
  const near = holding ? null : areas.filter(a => isSiteTag(a.tags) && a.stats.pinM <= NEAR_M).sort((a, b) => a.stats.pinM - b.stats.pinM || a.stats.areaM2 - b.stats.areaM2)[0] || null;
  const outline = holding || near;
  if (outline) {
    const others = otherVenuesAt(row, outline.polys, venues, {hosts});
    const cls = !holding ? 'near' : outline.stats.maxDistM > DRAFT_MAX_M ? 'beyond_600m' : others.length ? 'shared' : 'clean';
    return {cls, outline, others: others.map(v => ({id: v.id, group: v.group, why: v.why}))};
  }
  if (areas.some(a => isCommercial(a.tags) && a.stats.pinM === 0)) return {cls: 'commercial', outline: pick(areas.filter(a => isCommercial(a.tags) && a.stats.pinM === 0)), others: []};
  if (areas.some(a => isMallBuilding(a.tags) && a.stats.pinM === 0)) return {cls: 'mall_building', outline: null, others: []};
  return {cls: 'none', outline: null, others: []};
}

/** Reach of the candidates for an outline: its farthest vertex plus a margin, never beyond 600 m. */
export const draftReach = maxDistM => Math.min(DRAFT_MAX_M, Math.ceil(maxDistM) + DRAFT_MARGIN_M);

/** The drafted buildings: candidates whose interior point stands in the outline (exactly what `row --site` picks). */
export const draftPick = (candidates, polys) => new Set(candidates.filter(c => inPolys(c.point, polys)).map(c => c.cid));

const inBuilding = (c, p) => pointInRing(p, c.outer) && !c.holes.some(h => pointInRing(p, h));
/** Share of a building's footprint inside the outline, from an n × n grid of sample points. */
export function shareInside(c, polys, n = 12) {
  let w = Infinity, s = Infinity, e = -Infinity, nn = -Infinity;
  for (const [x, y] of c.outer) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > nn) nn = y; }
  let inB = 0, inBoth = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const p = [w + ((i + 0.5) / n) * (e - w), s + ((j + 0.5) / n) * (nn - s)];
    if (!inBuilding(c, p)) continue;
    inB++;
    if (inPolys(p, polys)) inBoth++;
  }
  return inB ? inBoth / inB : inPolys(c.point, polys) ? 1 : 0;
}

/** A ring's box meets a [west, south, east, north] box. */
export const boxMeets = (ring, [w, s, e, n]) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of ring) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return a <= e && w <= c && b <= n && s <= d;
};

/** Buildings the outline cuts: drafted but mostly outside it, and not drafted but mostly inside (review these first). */
export function edgeHints(candidates, picked, polys, {minArea = 30} = {}) {
  const [w, s, e, n] = polys.flat().flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const mostlyOutside = [], mostlyInside = [];
  for (const c of candidates) {
    if (c.area_m2 < minArea || !boxMeets(c.outer, [w, s, e, n])) continue;
    const share = shareInside(c, polys);
    if (picked.has(c.cid) && share < 0.5) mostlyOutside.push(c.cid);
    else if (!picked.has(c.cid) && share >= 0.5) mostlyInside.push(c.cid);
  }
  return {mostlyOutside, mostlyInside};
}

/**
 * OpenStreetMap buildings in the outline that no CityMETER building holds (suggestions for `row --osm-point`): parts of
 * the map's OpenFreeMap building tiles (scripts/site-osm.mjs) whose interior point is in the outline and in no
 * candidate, with no candidate's interior point in them, at least OSM_ONLY_MIN_M2 m² (pieces of one building cut by a
 * tile edge count once when their points lie within 3 m).
 */
export function osmOnly(osmParts, candidates, polys, {minArea = OSM_ONLY_MIN_M2} = {}) {
  const out = [];
  for (const part of osmParts || []) {
    if (part.areaM2 < minArea) continue;
    const ip = interiorPoint(part).map(round6);
    if (!inPolys(ip, polys)) continue;
    if (candidates.some(c => inBuilding(c, ip) || inBuilding({outer: part.outer, holes: part.holes || []}, c.point))) continue;
    const {kx, ky} = metresAt(ip[1]);
    if (out.some(o => Math.hypot((o.point[0] - ip[0]) * kx, (o.point[1] - ip[1]) * ky) < 3)) continue;
    out.push({point: ip, area_m2: Math.round(part.areaM2)});
  }
  return out;
}

// Compact text of polygons (for moving outlines between the browser and the helper): polygons split by '!', rings by
// ';', a ring is its vertices in millionths of a degree in base 36 — the first absolute, then differences — without the
// closing vertex. Lossless at 6 decimals.
export function packPolys(polys) {
  const b36 = v => (v < 0 ? '-' : '') + Math.abs(v).toString(36);
  return polys.map(p => p.map(ring => {
    const q = ring.slice(0, -1).map(([x, y]) => [Math.round(x * 1e6), Math.round(y * 1e6)]);
    return q.map((v, i) => (i ? [v[0] - q[i - 1][0], v[1] - q[i - 1][1]] : v).map(b36).join(',')).join(' ');
  }).join(';')).join('!');
}
export function unpackPolys(text) {
  const n36 = s => (s[0] === '-' ? -parseInt(s.slice(1), 36) : parseInt(s, 36));
  return String(text || '').split('!').filter(Boolean).map(p => p.split(';').map(ring => {
    let x = 0, y = 0;
    const r = ring.trim().split(' ').map((t, i) => { const [a, b] = t.split(',').map(n36); x = i ? x + a : a; y = i ? y + b : b; return [x / 1e6, y / 1e6]; });
    r.push([r[0][0], r[0][1]]);
    return r;
  }));
}

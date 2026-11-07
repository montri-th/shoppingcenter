/**
 * Next steps outside CityMETER for one venue (owner 2026-11-07 22:13, decision D37): Google AI Mode, Google Maps and
 * Street View that opens on the road in front of the venue's building, facing it. They sit at the end of the ICP path
 * of the Product Statement §3 — “คัดรายชื่อไปติดต่อหรือลงสำรวจ”: ask who to contact and what is there now, plan the
 * trip, and look at the frontage before going.
 *
 *  - AI Mode: a question written for the people the product serves (ผู้เช่าและทีมขยายสาขา, ทีม leasing, นักลงทุน),
 *    carrying the registry's identity of the place (name, type, district, province, operator) so the answer is about
 *    this venue; by type and status (a market asks about stalls, a planned venue about its opening and pre-leasing).
 *    Google asks “Continue with this search?” once when AI Mode is opened from another site (checked 7 Nov 2026).
 *  - Google Maps: a search by name + district + province (the place card: directions, hours, photos, reviews).
 *  - Street View: `streetViewView` picks the road the building fronts from the basemap's own OpenMapTiles roads
 *    (z14), a viewpoint on it in front of the building and the heading, pitch and field of view that face its nearest
 *    wall. Google opens the panorama nearest the viewpoint (2–3 m away on the live checks), so the angle holds.
 *
 * Pure except `createLookReader` (reads z14 tiles through the injected fetch). URLs carry public names and our own
 * geometry only — no user data, no internal ids; nothing Google returns is stored or shown as CityMETER evidence.
 */
import {parseVectorTile, tilesForBBox, tileToLonLat} from './mvt.js';
import {cmParts, pointInRing} from './pin-buildings.js';

export const LOOK_TILE_ZOOM = 14;
/** Roads are looked for within this distance of the building (m). */
export const SEARCH_M = 260;
/**
 * A viewpoint farther than this from the facade is not “in front of” it (m). Big-box stores and suburban malls stand
 * behind car parks 100–200 m deep, and the view from the main road across the car park is the one a tenant wants.
 */
export const MAX_GAP_M = 250;
/** Added to the gap before weighting, so a lane a few metres closer does not beat the road the building fronts. */
const GAP_PAD_M = 40;
/** A sightline that crosses another building costs this much more. */
const BLOCKED_FACTOR = 3;
/**
 * A viewpoint under a viaduct, a skywalk or an elevated expressway (within UNDER_M of one) costs this much more: from
 * under the BTS on Rama 1 the panorama shows the deck, not CentralWorld (live check, 7 Nov 2026).
 */
const UNDER_FACTOR = 2;
export const UNDER_M = 15;
/** Overhead structures in the `transportation` layer: bridges of these classes (BTS/MRT/ARL, skywalks, tollways). */
const OVERHEAD = new Set(['transit', 'rail', 'path', 'motorway']);
/** Camera height of a Street View car (m), for the pitch. */
const EYE_M = 2.5;
/**
 * OpenMapTiles `transportation` classes a Street View car drives, weighted (lower wins): the main roads a building
 * fronts first, sois next, service roads (drop-off lanes, estate roads) last. Not here, never chosen: motorways
 * (elevated tollways), paths, tracks, rail, ferries and roads under construction. Tuned on the live tiles of
 * Samyan Mitrtown, CentralWorld, Mega Bangna, True Digital Park and a Chonburi market (7 Nov 2026).
 */
export const ROAD_WEIGHT = Object.freeze({trunk: 1, primary: 1, secondary: 1.2, tertiary: 1.5, busway: 2, minor: 3, service: 6});
/** Pitch ceiling (degrees): low enough to keep the shopfronts in view; under a deck, nearly level. */
const PITCH_MAX = 10, PITCH_MAX_UNDER = 3;
/** Service roads without public-road imagery: parking aisles, driveways, drive-throughs. */
const SKIP_SERVICE = new Set(['parking_aisle', 'driveway', 'drive-through', 'emergency_access']);

const RAD = Math.PI / 180;
const enc = encodeURIComponent;
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const round = (v, d = 6) => Number(v.toFixed(d));

export const aiModeURL = q => `https://www.google.com/search?udm=50&q=${enc(q)}`;
export const mapsSearchURL = q => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
/**
 * Street View: with a view (streetViewView), the viewpoint on the road and the angle at the building; with only a
 * point, Google's panorama nearest it at Google's own heading. '' without either.
 */
export function streetViewURL(view, point = null) {
  const at = view?.viewpoint || point;
  if (!Array.isArray(at) || !at.every(Number.isFinite)) return '';
  const base = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${at[1].toFixed(6)},${at[0].toFixed(6)}`;
  return view ? `${base}&heading=${view.heading}&pitch=${view.pitch}&fov=${view.fov}` : base;
}

/** One road of a tile: {cls, line: [[lon, lat], …]}; null for a road no Street View car drives. */
export function roadOf(properties = {}, line) {
  const cls = properties.class;
  if (!Object.hasOwn(ROAD_WEIGHT, cls) || line.length < 2) return null;
  if (properties.brunnel === 'bridge' || properties.brunnel === 'tunnel' || Number(properties.ramp) === 1 || Number(properties.indoor) === 1 || properties.access === 'no') return null;
  if (cls === 'service' && SKIP_SERVICE.has(properties.service)) return null;
  return {cls, line};
}

/** An overhead structure of a tile: a bridge carrying a railway, a skywalk or footbridge, or an elevated tollway. */
export const overheadOf = (properties = {}, line) => (properties.brunnel === 'bridge' && OVERHEAD.has(properties.class) && line.length >= 2 ? {cls: properties.class, line} : null);

/**
 * Roads (one entry per line string) and overhead structures of an OpenMapTiles `transportation` layer, in lon/lat.
 * → {roads, overheads}
 */
export function roadsOfLayer(layer, tile) {
  const roads = [], overheads = [];
  if (!layer?.features?.length) return {roads, overheads};
  const extent = layer.extent || 4096;
  for (const f of layer.features) {
    if (f.type !== 2) continue;
    for (const raw of f.rings()) {
      const line = raw.map(([px, py]) => tileToLonLat(px, py, tile, extent));
      const road = roadOf(f.properties, line), over = overheadOf(f.properties, line);
      if (road) roads.push(road);
      if (over) overheads.push(over);
    }
  }
  return {roads, overheads};
}

/* ---------- plane geometry in metres round an origin ---------- */

function frame([lon0, lat0]) {
  const kx = 111320 * Math.cos(lat0 * RAD), ky = 110574;
  return {to: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky], back: ([x, y]) => [lon0 + x / kx, lat0 + y / ky]};
}
function closestOnSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const u = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return [a[0] + u * dx, a[1] + u * dy];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Nearest point of a set of rings (each closed) to p. */
function nearestOnRings(p, rings) {
  let best = null, d = Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const q = closestOnSegment(p, ring[i - 1], ring[i]), dq = dist(p, q);
    if (dq < d) { d = dq; best = q; }
  }
  return {point: best, d};
}
const inside = (p, rings) => rings.some(r => pointInRing(p, r));
/** Area-weighted centroid of outer rings (planar); the mean of the vertices for degenerate rings. */
function centroid(rings) {
  let a = 0, cx = 0, cy = 0, n = 0, sx = 0, sy = 0;
  for (const r of rings) for (let i = 1; i < r.length; i++) {
    const [x0, y0] = r[i - 1], [x1, y1] = r[i], k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k; sx += x1; sy += y1; n++;
  }
  return Math.abs(a) > 1e-6 ? [cx / (3 * a), cy / (3 * a)] : [sx / Math.max(n, 1), sy / Math.max(n, 1)];
}
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
const bearing = (from, to) => ((Math.atan2(to[0] - from[0], to[1] - from[1]) / RAD) + 360) % 360;
const turn = (a, b) => ((b - a + 540) % 360) - 180;

/**
 * Where Street View should stand and look. target: {rings: outer rings [[lon, lat], …] of the venue's building (its
 * main building: the masses of its design file, its checked footprint, or the building its pin stands in), height (m),
 * point: [lon, lat] of the venue}; roads, overheads: roadsOfLayer(); occluders: other buildings ({outer} rings).
 * Each road offers one viewpoint: its point nearest the building's centre (never under the building). The gap is the
 * distance from there to the nearest wall. Score = (gap + 40 m) × class weight, × 3 when the sightline to that wall
 * crosses another building, × 2 under a viaduct, skywalk or elevated tollway; the least wins. The heading looks at the
 * nearest wall (at the corner, the building is seen corner-on); the field of view holds the outline; the pitch looks
 * a quarter of the way up (≤ 30 m) and stays ≤ 10° (≤ 3° under a deck).
 * Returns {viewpoint, heading, pitch, fov, road: {cls, gapM}, blocked, under} or null (no road within 250 m).
 */
export function streetViewView({target = {}, roads = [], occluders = [], overheads = []} = {}) {
  const pointLL = Array.isArray(target.point) && target.point.every(Number.isFinite) ? target.point : null;
  const ringsLL = (target.rings || []).filter(r => Array.isArray(r) && r.length >= 4);
  const origin = ringsLL.length ? ringsLL[0][0] : pointLL;
  if (!origin) return null;
  const {to, back} = frame(origin);
  const rings = ringsLL.map(r => r.map(to));
  const centre = rings.length ? centroid(rings) : to(pointLL);
  const height = Number(target.height) > 0 ? Number(target.height) : 0;
  const reach = SEARCH_M + (rings.length ? Math.max(...rings.flat().map(p => dist(p, centre))) : 0);
  // Other buildings that could stand between the road and this one (not the venue's own: no overlap with its rings).
  const blockers = [];
  for (const o of occluders) {
    const ring = (o.outer || o).map(to);
    if (ring.length < 4 || ring.every(p => dist(p, centre) > reach + 200)) continue;
    if (rings.length && (ring.some(p => inside(p, rings)) || rings.some(r => r.some(p => pointInRing(p, ring))))) continue;
    if (!rings.length && pointInRing(centre, ring)) continue;
    blockers.push(ring);
  }
  const decks = overheads.map(o => o.line.map(to)).filter(l => l.some(p => dist(p, centre) < reach + 200));
  const underDeck = q => decks.some(l => l.some((p, i) => i > 0 && dist(q, closestOnSegment(q, l[i - 1], p)) < UNDER_M));
  let best = null;
  for (const road of roads) {
    // Every segment counts: a long straight segment can pass close by with both ends far away.
    const line = road.line.map(to);
    let q = null, dq = Infinity;
    for (let i = 1; i < line.length; i++) {
      const c = closestOnSegment(centre, line[i - 1], line[i]), d = dist(centre, c);
      if (d < dq) { dq = d; q = c; }
    }
    if (!q || (rings.length && inside(q, rings))) continue;
    const facade = rings.length ? nearestOnRings(q, rings) : {point: centre, d: dist(q, centre)};
    if (facade.d > MAX_GAP_M) continue;
    // The sightline to the facade, stopping a metre short of it.
    const len = facade.d, end = len > 1 ? [q[0] + (facade.point[0] - q[0]) * (len - 1) / len, q[1] + (facade.point[1] - q[1]) * (len - 1) / len] : q;
    const blocked = blockers.some(b => b.some((p, i) => i > 0 && segmentsCross(q, end, b[i - 1], p)));
    const under = underDeck(q);
    const score = (facade.d + GAP_PAD_M) * ROAD_WEIGHT[road.cls] * (blocked ? BLOCKED_FACTOR : 1) * (under ? UNDER_FACTOR : 1);
    if (!best || score < best.score - 1e-9) best = {score, q, wall: facade.point, gap: facade.d, cls: road.cls, blocked, under};
  }
  if (!best) return null;
  // The nearest wall, not the centre: a road that ends beside the building would otherwise look down the road
  // (CentralWorld from Ratchadamri looked at Big C across the street; at the wall it faces CentralWorld).
  const heading = bearing(best.q, best.gap > 0.5 ? best.wall : centre);
  // Field of view: the widest angle from the heading to any corner of the building, both sides, plus a margin.
  let half = 0;
  for (const p of rings.flat()) half = Math.max(half, Math.abs(turn(heading, bearing(best.q, p))));
  const fov = rings.length ? Math.round(Math.max(40, Math.min(100, half * 2 * 1.08 + 6))) : 90;
  // Pitch: a quarter of the way up (≤ 30 m) — the shopfronts and signs, not the roof of a tower.
  const pitch = Math.round(Math.max(0, Math.min(best.under ? PITCH_MAX_UNDER : PITCH_MAX, Math.atan2((height ? Math.min(height, 30) * 0.25 : 4) - EYE_M, Math.max(best.gap, 10)) / RAD)));
  const [lon, lat] = back(best.q);
  return {viewpoint: [round(lon), round(lat)], heading: Math.round(heading) % 360, pitch, fov, road: {cls: best.cls, gapM: Math.round(best.gap)}, blocked: best.blocked, under: best.under};
}

/**
 * The building Street View should face, from the features buildings.js draws for the venue: the masses of its design
 * file, else its checked footprint, else the building its pin stands in (site point 0), else the largest drawn part.
 */
export function lookTarget(row, features = []) {
  const point = Number.isFinite(row?.lon) && Number.isFinite(row?.lat) ? [row.lon, row.lat] : null;
  const outer = f => {
    const g = f?.geometry;
    return g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
  };
  const role = f => f.properties?.geometry_role || '';
  const pick = [features.filter(f => role(f) === 'owner_model_mass'),
    features.filter(f => role(f) && !role(f).startsWith('pin_building') && role(f) !== 'owner_model_mass'),
    features.filter(f => role(f).startsWith('pin_building') && (f.properties?.site_point ?? 0) === 0)].find(list => list.length);
  let chosen = pick || [];
  if (!chosen.length && features.length) {
    const area = f => outer(f).reduce((s, r) => { let a = 0; for (let i = 1; i < r.length; i++) a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1]; return s + Math.abs(a); }, 0);
    chosen = [features.reduce((a, b) => (area(b) > area(a) ? b : a))];
  }
  const height = Math.max(0, ...chosen.map(f => Number(f.properties?.height_m ?? f.properties?.display_height_m) || 0));
  return {rings: chosen.flatMap(outer), height, point};
}

/** Square box of `m` metres round the target (its rings, else its point): [west, south, east, north]. */
export function lookBBox(target, m = SEARCH_M) {
  const pts = (target?.rings || []).flat();
  if (!pts.length && target?.point) pts.push(target.point);
  if (!pts.length) return null;
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2, kx = 111320 * Math.cos(lat * RAD), ky = 110574;
  return [Math.min(...lons) - m / kx, Math.min(...lats) - m / ky, Math.max(...lons) + m / kx, Math.max(...lats) + m / ky];
}

/**
 * Reads the roads, overhead structures and buildings of the z14 basemap tiles round a target (the same OpenFreeMap
 * tiles the map draws, so usually from the browser cache). tileUrl: ({z, x, y}) → URL ('' while unknown). At most
 * `maxTiles` per read. → {roads, overheads, buildings}
 */
export function createLookReader({tileUrl, fetchImpl = (...a) => fetch(...a), max = 24, maxTiles = 6} = {}) {
  const cache = new Map();
  function tile(t) {
    const key = `${t.z}/${t.x}/${t.y}`;
    if (cache.has(key)) return cache.get(key);
    const url = typeof tileUrl === 'function' ? tileUrl(t) : '';
    const task = (async () => {
      if (!url) throw new Error('no tile URL');
      const r = await fetchImpl(url);
      if (r.status === 204) return {roads: [], overheads: [], buildings: []};
      if (!r.ok) throw new Error(`tile ${key} ${r.status}`);
      const layers = parseVectorTile(new Uint8Array(await r.arrayBuffer())).layers;
      return {...roadsOfLayer(layers.transportation, t), buildings: cmParts(layers.building, t)};
    })();
    cache.set(key, task);
    task.catch(() => cache.delete(key));
    if (cache.size > max) cache.delete(cache.keys().next().value);
    return task;
  }
  async function read(bbox) {
    if (!bbox) return {roads: [], overheads: [], buildings: []};
    const tiles = tilesForBBox(bbox, LOOK_TILE_ZOOM).slice(0, maxTiles);
    const parts = await Promise.all(tiles.map(tile));
    return {roads: parts.flatMap(p => p.roads), overheads: parts.flatMap(p => p.overheads), buildings: parts.flatMap(p => p.buildings)};
  }
  return {read};
}

/* ---------- the links ---------- */

/** Thai words for a venue's type in a question (the group's own word; nothing for “อื่น ๆ”). */
function typeWord(group) {
  if (!group || group.id === 'other') return '';
  return group.id === 'component' ? group.th : group.short || group.th;
}

/**
 * The AI Mode question for a venue, in the words of the ICP: who to contact to rent space, what is there and who
 * comes, how to get there and the latest news — by type (a market: stalls; a fuel station or host store: its shops)
 * and status (planned: opening and pre-leasing; closed: when, and what the site is now).
 */
export function venueQuestion({name, group, where = '', operator = '', status = 'supply'} = {}) {
  const kind = typeWord(group);
  const about = [kind, clean(where)].filter(Boolean).join(' ');
  const subject = `${clean(name)}${about || operator ? ` (${[about, operator ? `บริหารโดย ${clean(operator)}` : ''].filter(Boolean).join(' ')})` : ''}`;
  if (status === 'planned') return `${subject} กำหนดเปิดเมื่อไร ความคืบหน้าล่าสุดเป็นอย่างไร และติดต่อจองพื้นที่เช่าได้ทางไหน`;
  if (status === 'closed') return `${subject} ปิดเมื่อไร และตอนนี้พื้นที่นี้เป็นอะไร`;
  const ask = {
    market: 'ติดต่อเช่าแผงได้ทางไหน เปิดวันและเวลาใด ขายอะไรเป็นหลัก ลูกค้าส่วนใหญ่เป็นใคร และมีข่าวล่าสุดอะไร',
    fuel: 'มีร้านค้าและบริการอะไรบ้าง ติดต่อเช่าพื้นที่ได้ทางไหน และมีข่าวล่าสุดอะไร',
    hoststore: 'มีร้านเช่าอะไรบ้าง ติดต่อเช่าพื้นที่ได้ทางไหน และมีข่าวล่าสุดอะไร',
  }[group?.id] || 'ติดต่อเช่าพื้นที่ได้ทางไหน มีร้านหลักอะไรบ้าง ลูกค้าส่วนใหญ่เป็นใคร เดินทางอย่างไร และมีข่าวล่าสุดอะไร';
  return `${subject} ${ask}`;
}

/**
 * The three links of the venue panel, in the owner's order: AI Mode, Google Maps, Street View (Street View only for a
 * venue with a point). p: buildVenueProfile(); view: streetViewView() or null. → [{id, label, href, title}]
 */
export function lookLinks(p, view = null) {
  const r = p?.row;
  if (!r) return [];
  const name = clean(r.name || r.nameEn);
  // The district and province of the point; a venue without one keeps the province of its address.
  const where = clean([p.areaLabel, p.province?.th || String(p.addressProvince || '').replace(/^จังหวัด/, '')].filter(Boolean).join(' '));
  const links = [
    {id: 'ai', label: 'ถาม AI Mode', href: aiModeURL(venueQuestion({name, group: p.group, where, operator: r.operatorLabel || '', status: r.status})),
      title: 'ถาม Google AI Mode เรื่องช่องทางเช่าพื้นที่ ร้านหลัก การเดินทาง และข่าวล่าสุดของที่นี่'},
    {id: 'maps', label: 'เปิด Google Maps', href: mapsSearchURL(clean(`${name} ${where}`)), title: 'เส้นทาง เวลาเปิด รูปและรีวิวใน Google Maps'},
  ];
  const sv = streetViewURL(view, Number.isFinite(r.lon) && Number.isFinite(r.lat) ? [r.lon, r.lat] : null);
  if (sv) links.push({id: 'streetview', label: 'ดู Street View', href: sv, title: view ? 'Street View บนถนนหน้าอาคาร หันเข้าหาอาคาร' : 'Street View ใกล้จุดของสถานที่'});
  return links;
}

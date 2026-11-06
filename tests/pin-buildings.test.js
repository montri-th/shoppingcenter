import test from 'node:test';
import assert from 'node:assert/strict';
import {explodeParts, indexParts, matchVenue, growRingM, pinFeatures, installPinBuildings, pointInRing, deepOverlap, metresPerDegree,
  PIN_TOLERANCE_M, MAX_PART_AREA_M2, DRAW_OFFSET_M, DRAW_LIFT_M, MIN_DISPLAY_HEIGHT_M} from '../js/pin-buildings.js';
import {lonLatToTile} from '../js/mvt.js';

const LAT = 13.73, LON = 100.53;
const {kx, ky} = metresPerDegree(LAT);
/** Closed counter-clockwise ring of a rectangle given in metres east/north of (LON, LAT). */
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [LON + x / kx, LAT + y / ky]);
const at = (x, y) => [LON + x / kx, LAT + y / ky];
const tileOf = lonLatToTile(LON, LAT, 14);
// querySourceFeatures shape of MapLibre 5: the tile is `tile: {z, x, y}`.
const feature = (id, rings, props = {}, t = tileOf) => ({
  id, tile: {z: t.z, x: t.x, y: t.y},
  properties: {render_height: 20, render_min_height: 0, ...props},
  geometry: Array.isArray(rings[0][0][0]) ? {type: 'MultiPolygon', coordinates: rings} : {type: 'Polygon', coordinates: rings},
});
const indexOf = features => indexParts(explodeParts(features));

test('a pin inside a footprint maps to that building; within the tolerance of its edge too; further away nothing', () => {
  const idx = indexOf([feature(1, [rect(0, 0, 30, 30)])]);
  const inside = matchVenue(at(15, 15), idx);
  assert.equal(inside.method, 'inside');
  assert.equal(inside.parts.length, 1);
  assert.ok(Math.abs(inside.parts[0].areaM2 - 900) < 5, `area ≈ 900 m², got ${inside.parts[0].areaM2}`);
  const edge = matchVenue(at(15, 30 + PIN_TOLERANCE_M - 1), idx);
  assert.equal(edge?.method, 'edge');
  assert.equal(matchVenue(at(15, 30 + PIN_TOLERANCE_M + 2), idx), null);
});

test('site-sized polygons are not a venue building; a podium and its tower are both kept', () => {
  const side = Math.sqrt(MAX_PART_AREA_M2) + 50;
  assert.equal(matchVenue(at(10, 10), indexOf([feature(9, [rect(-side / 2, -side / 2, side / 2, side / 2)], {render_height: 5})])), null);
  const m = matchVenue(at(20, 20), indexOf([feature(2, [rect(0, 0, 60, 60)], {render_height: 5}), feature(3, [rect(10, 10, 30, 30)], {render_height: 40})]));
  assert.deepEqual(m.parts.map(p => p.height).sort((a, b) => a - b), [5, 40]);
});

test('an outline with building:parts (hide_3d) gives its parts, never a neighbour sharing a wall', () => {
  const features = [
    feature(10, [rect(0, 0, 50, 50)], {hide_3d: true, render_height: 30}),
    feature(11, [rect(0, 0, 20, 20)], {render_height: 12}),
    feature(12, [rect(30, 0, 50, 20)], {render_height: 60}),
    feature(13, [rect(0, 30, 50, 50)], {render_height: 8}),
    feature(14, [rect(50, 0, 80, 50)], {render_height: 9}), // shares the outline's east wall
  ];
  const m = matchVenue(at(25, 25), indexOf(features)); // a courtyard point: only the outline contains it
  assert.equal(m.method, 'inside');
  assert.deepEqual(m.parts.map(p => p.fid).sort(), [11, 12, 13]);
  assert.ok(!m.parts.some(p => p.hide3d), 'the outline itself is not drawn');
});

test('a merged multi-part feature yields only the polygon the pin stands in', () => {
  const merged = feature(20, [[rect(0, 0, 20, 20)], [rect(100, 0, 120, 20)], [rect(200, 0, 220, 20)]], {render_height: 5});
  const m = matchVenue(at(110, 10), indexOf([merged]));
  assert.equal(m.parts.length, 1);
  assert.ok(pointInRing(at(110, 10), m.parts[0].outer));
});

test('the same building continued in the neighbouring tile is found by a real overlap; a wall-sharing neighbour is not', () => {
  const east = {...tileOf, x: tileOf.x + 1};
  const features = [
    feature(30, [rect(0, 0, 40, 30)]),               // piece in this tile, clipped at the tile buffer (x = 40)
    feature(31, [rect(30, 0, 90, 30)], {}, east),    // same building in the east tile, from its buffer (x = 30)
    feature(32, [rect(90, 0, 120, 30)], {}, east),   // next building, shares the wall at x = 90
  ];
  const m = matchVenue(at(10, 15), indexOf(features));
  assert.deepEqual(m.parts.map(p => p.fid).sort(), [30, 31]);
  const parts = explodeParts(features);
  assert.equal(deepOverlap(parts[1], parts[2]), false);
});

test('only z14 pieces are read when z14 is loaded (a retained parent tile would duplicate them)', () => {
  const parent = {z: 13, x: Math.floor(tileOf.x / 2), y: Math.floor(tileOf.y / 2)};
  const parts = explodeParts([feature(40, [rect(0, 0, 10, 10)]), feature(41, [rect(0, 0, 10, 10)], {}, parent)]);
  assert.deepEqual(parts.map(p => p.fid), [40]);
  assert.equal(parts[0].tile, `14/${tileOf.x}/${tileOf.y}`, 'tile read from MapLibre 5 `tile`');
  // Older MapLibre builds exposed _z/_x/_y instead.
  const legacy = explodeParts([{id: 42, _z: 14, _x: 1, _y: 2, properties: {}, geometry: {type: 'Polygon', coordinates: [rect(0, 0, 10, 10)]}}]);
  assert.equal(legacy[0].tile, '14/1/2');
});

test('display shape: grown outward to enclose the basemap copy, holes shrink, lifted, never under 3 m', () => {
  const ring = rect(0, 0, 30, 20);
  const grown = growRingM(ring, DRAW_OFFSET_M);
  for (const p of ring.slice(0, -1)) assert.ok(pointInRing(p, grown), 'every original corner is inside the grown ring');
  const shrunk = growRingM(ring, -DRAW_OFFSET_M);
  assert.ok(!pointInRing(ring[0], shrunk));
  const [f] = pinFeatures('SC-1', {method: 'inside', parts: [{outer: ring, holes: [rect(10, 5, 20, 15)], height: 5, base: 0}]});
  assert.equal(f.properties.render_as, 'extrusion');
  assert.deepEqual(f.properties.venue_ids, ['SC-1']);
  assert.equal(f.properties.display_height_m, 5 + DRAW_LIFT_M);
  assert.equal(f.geometry.coordinates.length, 2, 'courtyard kept');
  assert.deepEqual(f._ring, ring, 'exact basemap ring kept for the massing tiers');
  const [low] = pinFeatures('SC-2', {method: 'edge', parts: [{outer: ring, holes: [], height: null, base: 0}]});
  assert.equal(low.properties.display_height_m, MIN_DISPLAY_HEIGHT_M + DRAW_LIFT_M);
  assert.equal(low.properties.height_m, null, 'no height is invented');
});

test('live matcher: matches visible pins when the map settles, remembers "no building" only where the pin tile was read', async () => {
  const handlers = {};
  const map = {
    getSource: id => (id === 'openmaptiles' ? {} : null), getZoom: () => 16,
    getBounds: () => ({contains: ([lon, lat]) => Math.abs(lon - LON) < 0.05 && Math.abs(lat - LAT) < 0.05}),
    features: [feature(50, [rect(0, 0, 30, 30)]), feature(51, [rect(500, 0, 510, 10)])],
    querySourceFeatures() { return this.features; },
    on(e, h) { (handlers[e] ||= []).push(h); }, off(e, h) { handlers[e] = (handlers[e] || []).filter(x => x !== h); },
  };
  const changes = [];
  const pins = installPinBuildings(map, {onChange: c => changes.push(c)});
  const farTile = lonLatToTile(LON + 0.03, LAT, 14);
  assert.notEqual(`${farTile.x}`, `${tileOf.x}`, 'fixture: the third pin is in another (unread) tile');
  pins.update({rows: [{id: 'A', lon: at(15, 15)[0], lat: at(15, 15)[1]}, {id: 'B', lon: at(200, -300)[0], lat: at(200, -300)[1]}, {id: 'C', lon: LON + 0.03, lat: LAT}]});
  await new Promise(r => setTimeout(r, 220));
  const last = changes.at(-1);
  assert.equal(last.byVenue.get('A'), 'inside');
  assert.equal(last.byVenue.get('B'), null, 'pin tile read, no building there');
  assert.equal(last.byVenue.has('C'), false, 'unread tile: not decided yet');
  assert.equal(pins.stateOf('C'), undefined);
  assert.ok(last.features.length === 1 && last.features[0].properties.venue_ids[0] === 'A');
  const count = changes.length;
  (handlers.idle || []).forEach(h => h());
  await new Promise(r => setTimeout(r, 220));
  assert.equal(changes.length, count, 'nothing new → no change event');
  pins.dispose();
  assert.equal((handlers.idle || []).length, 0);
});

/* ---------- CityMETER Building V4 in CityMETER units, and research sites (owner 2026-11-05 00:34) ---------- */
import {cmParts, matchInUnit, pointTiles, cmRequestsFor, PIN_SOURCES} from '../js/pin-buildings.js';
import {parseVectorTile, tileToLonLat, lonLatToTileUnits} from '../js/mvt.js';
import {tileBox} from '../js/massing.js';
import {encodeTile} from './mvt-encode.js';

const T14 = lonLatToTile(LON, LAT, 14);
/** Tile-unit square (clockwise on screen, as MVT outers) of a rectangle given in metres east/north of (LON, LAT). */
const tileRect = (x0, y0, x1, y1) => {
  const r = [[x0, y1], [x1, y1], [x1, y0], [x0, y0], [x0, y1]].map(([x, y]) => lonLatToTileUnits(LON + x / kx, LAT + y / ky, T14, 4096).map(Math.round));
  return r;
};
const cmLayer = features => parseVectorTile(encodeTile([{name: 'building-detail', features}])).layers['building-detail'];

test('CityMETER parts: whole buildings in lon/lat with their model height; holes kept; a building two tiles share is one part', () => {
  const layer = cmLayer([{properties: {height_m: '21.40'}, rings: [tileRect(0, 0, 40, 40), tileRect(10, 10, 20, 20).reverse()]}, {properties: {}, rings: [tileRect(100, 0, 120, 20)]}]);
  const seen = new Set();
  const parts = cmParts(layer, T14, seen);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].source, 'cm'); assert.equal(parts[0].tile, '', 'whole buildings: no tile continuation');
  assert.equal(parts[0].height, 21.4); assert.equal(parts[1].height, 3, 'no height_m → the 3 m default');
  assert.equal(parts[0].holes.length, 1);
  assert.ok(Math.abs(parts[0].areaM2 - (1600 - 100)) < 60, `area ≈ 1,500 m², got ${parts[0].areaM2}`);
  assert.ok(pointInRing(at(30, 30), parts[0].outer));
  assert.equal(cmParts(layer, T14, seen).length, 0, 'the same buildings read again (another tile or tile unit) add nothing');
});

test('in a CityMETER unit the pin maps to the CityMETER building; OSM parts (LOD2) stay OSM; without a CityMETER building the OSM one is kept', () => {
  const cm = indexParts(cmParts(cmLayer([{properties: {height_m: '15'}, rings: [tileRect(0, 0, 40, 40)]}]), T14));
  const osmPlain = indexOf([feature(60, [rect(2, 2, 38, 38)])]);
  const viaCm = matchInUnit(at(20, 20), osmPlain, cm);
  assert.equal(viaCm.source, 'cm'); assert.equal(viaCm.parts[0].source, 'cm');
  const lod2 = indexOf([feature(61, [rect(0, 0, 50, 50)], {hide_3d: true}), feature(62, [rect(5, 5, 45, 45)], {render_height: 60})]);
  const kept = matchInUnit(at(20, 20), lod2, cm);
  assert.ok(kept.viaOutline && kept.parts.every(p => p.source !== 'cm'), 'a building OSM maps in parts stays OSM');
  const noCm = matchInUnit(at(200, 200), indexOf([feature(63, [rect(190, 190, 220, 220)])]), cm);
  assert.equal(noCm.parts[0].fid, 63, 'CityMETER has no building there: the OSM building is kept');
  assert.equal(matchInUnit(at(500, 500), osmPlain, cm), null);
  const f = pinFeatures('V', viaCm)[0];
  assert.equal(f.properties.geometry_role, PIN_SOURCES.cm.role);
  assert.equal(f.properties.height_status, 'citymeter_model_estimate');
  assert.equal(f.properties.source, 'CityMETER Building V4');
  assert.equal(f.properties.height_m, 15);
  assert.deepEqual(f._ring, viaCm.parts[0].outer, 'the exact CityMETER ring, for the massing tier to drop the same building');
});

test('CityMETER requests of a point: its z14 tile (and the neighbour within a few metres of an edge), per tile unit meeting it', () => {
  const [w, s, e, n] = tileBox(T14);
  const zone = {id: 'z', tileType: 'MUNICIPALITY', tileUnits: [{id: 'z', bbox: [w - 0.1, s - 0.1, e + 0.1, n + 0.1]}]};
  const mid = [(w + e) / 2, (s + n) / 2];
  assert.equal(pointTiles(mid).length, 1);
  assert.deepEqual(cmRequestsFor(mid, zone).map(q => q.key), [`14/${T14.x}/${T14.y}|z`]);
  const nearEast = [e - 1 / metresPerDegree(mid[1]).kx, mid[1]];
  assert.deepEqual(pointTiles(nearEast).map(t => t.x), [T14.x, T14.x + 1]);
});

test('live matcher in a CityMETER unit: waits for the province units and the tile, then maps the pin and every site point; CityMETER pins are counted for the credit', async () => {
  const handlers = {};
  const map = {
    getSource: id => (id === 'openmaptiles' ? {} : null), getZoom: () => 16,
    getBounds: () => ({contains: ([lon, lat]) => Math.abs(lon - LON) < 0.05 && Math.abs(lat - LAT) < 0.05}),
    features: [feature(70, [rect(300, 300, 320, 320)])],
    querySourceFeatures() { return this.features; },
    on(e, h) { (handlers[e] ||= []).push(h); }, off(e, h) { handlers[e] = (handlers[e] || []).filter(x => x !== h); },
  };
  const [w, s, e, n] = tileBox(T14);
  const zone = {id: 'z', tileType: 'MUNICIPALITY', tileUnits: [{id: 'z', bbox: [w, s, e, n]}]};
  let settled = false;
  const loads = [];
  const cm = {
    settled: code => code !== 'NPT' || settled,
    zoneAt: () => zone,
    load: async q => { loads.push(q.key); return cmLayer([{properties: {height_m: '18'}, rings: [tileRect(0, 0, 40, 40)]}, {properties: {height_m: '6'}, rings: [tileRect(100, 0, 130, 30)]}]); },
  };
  const changes = [];
  const pins = installPinBuildings(map, {cm, onChange: c => changes.push(c)});
  pins.update({rows: [{id: 'S', lon: at(20, 20)[0], lat: at(20, 20)[1], province: 'NPT', points: [at(115, 15), at(310, 310), at(900, 900)]}]});
  await new Promise(r => setTimeout(r, 220));
  assert.equal(pins.stateOf('S'), undefined, 'the province units are not known yet: waits');
  assert.equal(loads.length, 0);
  settled = true;
  (handlers.idle || []).forEach(h => h());
  await new Promise(r => setTimeout(r, 450));
  const last = changes.at(-1);
  assert.equal(pins.stateOf('S'), 'inside');
  const roles = last.features.map(f => [f.properties.geometry_role, f.properties.match_method]);
  assert.deepEqual(roles, [['pin_building_citymeter', 'inside'], ['pin_building_citymeter', 'site'], ['pin_building_basemap', 'site']],
    'the pin and the site points each map to the building they stand in (CityMETER first, the OSM one where CityMETER has none); a point in no building adds nothing');
  assert.equal(last.cm, 1, 'one venue stands in a CityMETER building');
  assert.ok(loads.length >= 1 && loads.every(k => k.endsWith('|z')));
  // The fourth site point lies in a tile not read yet: the venue shows what is known and keeps that point open.
  assert.equal(pins.size, 0, 'not final while a site point waits for its tile');
  pins.dispose();
});

test('a site that is still waiting for one point is drawn as its other tiles arrive, not frozen at the first snapshot (0.1.13, Mega Bangna)', async () => {
  const handlers = {};
  const map = {
    getSource: id => (id === 'openmaptiles' ? {} : null), getZoom: () => 16,
    getBounds: () => ({contains: ([lon, lat]) => Math.abs(lon - LON) < 0.05 && Math.abs(lat - LAT) < 0.05}),
    querySourceFeatures: () => [], on(e, h) { (handlers[e] ||= []).push(h); }, off(e, h) { handlers[e] = (handlers[e] || []).filter(x => x !== h); },
  };
  const B = {z: 14, x: T14.x + 1, y: T14.y};
  const [w, s, , n] = tileBox(T14), [, , e] = tileBox(B);
  const zone = {id: 'z', tileType: 'MUNICIPALITY', tileUnits: [{id: 'z', bbox: [w, s, e, n]}]};
  const rectIn = (tile, x0, y0, x1, y1) => [[x0, y1], [x1, y1], [x1, y0], [x0, y0], [x0, y1]].map(([x, y]) => lonLatToTileUnits(LON + x / kx, LAT + y / ky, tile, 4096).map(Math.round));
  const cm = {
    settled: () => true, zoneAt: () => zone,
    load: q => (q.tile.x === T14.x
      ? Promise.resolve(cmLayer([{properties: {height_m: '18'}, rings: [rectIn(T14, 0, 0, 40, 40)]}, {properties: {height_m: '6'}, rings: [rectIn(T14, 100, 0, 130, 30)]}]))
      : new Promise(r => setTimeout(() => r(cmLayer([{properties: {height_m: '9'}, rings: [rectIn(B, 1880, 0, 1920, 30)]}])), 300))),
  };
  const changes = [];
  const pins = installPinBuildings(map, {cm, onChange: c => changes.push(c)});
  // pin and one site point in tile A, one site point in the slower tile B, and one point in a tile nothing reads (stays open)
  pins.update({rows: [{id: 'M', lon: at(20, 20)[0], lat: at(20, 20)[1], province: 'SPK', points: [at(115, 15), at(1900, 15), at(900, 900)]}]});
  (handlers.idle || []).forEach(h => h());
  await new Promise(r => setTimeout(r, 1000));
  const last = changes.at(-1);
  assert.equal(pins.size, 0, 'still partial: one point waits for a tile nothing reads');
  assert.equal(last.features.length, 3, 'the pin and both site points with buildings are drawn');
  assert.ok(last.features.some(f => pointInRing(at(1900, 15), f._ring)), 'the building from the slower tile joined the drawn site');
  pins.dispose();
});

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

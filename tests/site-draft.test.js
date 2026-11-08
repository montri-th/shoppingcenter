// Site drafts from OpenStreetMap outlines (scripts/site-draft.mjs; owner 2026-11-05 20:38).
import test from 'node:test';
import assert from 'node:assert/strict';
import {outlinePolys, polysFromOverpass, polysGeoJson, inPolys, outlineStats, otherPinsIn, classifyPin, draftReach, draftPick,
  shareInside, edgeHints, osmOnly, packPolys, unpackPolys, isSiteTag, DRAFT_MAX_M, sitePoint, ringClearance, SITE_POINT_MARGIN_M} from '../scripts/site-draft.mjs';
import {interiorPoint, pointInRing} from '../js/pin-buildings.js';

const row = {id: 'SC-000001', name: 'ทดสอบ', lon: 100.5, lat: 13.7, countable: true};
const kx = 111320 * Math.cos((row.lat * Math.PI) / 180), ky = 110574;
const at = (x, y) => [+(row.lon + x / kx).toFixed(6), +(row.lat + y / ky).toFixed(6)];
const square = (x0, y0, x1, y1) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)];
const way = (id, ring, tags) => ({type: 'way', id, tags, geometry: ring.map(([lon, lat]) => ({lon, lat}))});
const building = (cid, x0, y0, x1, y1) => ({cid, outer: square(x0, y0, x1, y1), holes: [], point: at((x0 + x1) / 2, (y0 + y1) / 2), area_m2: Math.round((x1 - x0) * (y1 - y0))});

test('outlines: GeoJSON in every shape, closed rings, 6 decimals; Overpass ways and multipolygons', () => {
  const open = [[100.1234567, 13.1], [100.2, 13.1], [100.2, 13.2]];
  assert.deepEqual(outlinePolys({type: 'Polygon', coordinates: [open]}), [[[[100.123457, 13.1], [100.2, 13.1], [100.2, 13.2], [100.123457, 13.1]]]]);
  const sq = square(-100, -100, 100, 100);
  const fc = polysGeoJson([[sq]], {venue_id: row.id});
  assert.deepEqual(outlinePolys(fc), [[sq]]);
  assert.deepEqual(outlinePolys(fc.features[0]), [[sq]]);
  assert.deepEqual(outlinePolys({type: 'MultiPolygon', coordinates: [[sq], [square(200, 0, 300, 100)]]}).length, 2);
  assert.deepEqual(polysFromOverpass(way(1, sq, {landuse: 'retail'})), [[sq]]);
  assert.equal(polysFromOverpass(way(2, sq.slice(0, 4), {})), null, 'an open way is not an area');
  // A relation: the outer ring in two pieces (one reversed) and a hole.
  const big = square(-200, -200, 200, 200), hole = square(-50, -50, 50, 50);
  const rel = {type: 'relation', id: 3, tags: {type: 'multipolygon', landuse: 'retail'}, members: [
    {type: 'way', role: 'outer', geometry: big.slice(0, 3).map(([lon, lat]) => ({lon, lat}))},
    {type: 'way', role: 'outer', geometry: big.slice(2).reverse().map(([lon, lat]) => ({lon, lat}))},
    {type: 'way', role: 'inner', geometry: hole.map(([lon, lat]) => ({lon, lat}))}]};
  const polys = polysFromOverpass(rel);
  assert.equal(polys.length, 1);
  assert.equal(polys[0].length, 2, 'outer ring plus its hole');
  assert.ok(inPolys(at(100, 100), polys));
  assert.ok(!inPolys(at(0, 0), polys), 'the hole is not in the outline');
  assert.ok(!inPolys(at(300, 0), polys));
});

test('the compact text of outlines is lossless at 6 decimals', () => {
  const polys = [[square(-123.4, -50, 77.7, 250), square(-10, 0, 10, 20)], [square(400, 400, 450, 480)]];
  const text = packPolys(polys);
  assert.ok(!/[=&]/.test(text));
  assert.deepEqual(unpackPolys(text), polys);
});

test('outline stats: farthest vertex, area without holes, the pin inside or its distance outside', () => {
  const polys = [[square(-100, -100, 300, 100), square(100, -20, 140, 20)]];
  const st = outlineStats(row, polys);
  assert.ok(Math.abs(st.maxDistM - Math.hypot(300, 100)) < 1);
  assert.ok(Math.abs(st.areaM2 - (400 * 200 - 40 * 40)) < 40);
  assert.equal(st.pinM, 0);
  const off = outlineStats(row, [[square(20, -10, 60, 10)]]);
  assert.ok(Math.abs(off.pinM - 20) <= 1);
  assert.equal(draftReach(120), 170);
  assert.equal(draftReach(590), DRAFT_MAX_M);
});

test('other counted pins in the outline: never the venue, its parent or its components, never an uncounted record', () => {
  const polys = [[square(-200, -200, 200, 200)]];
  const venue = {...row, parentId: 'P-1', children: ['C-1']};
  const pin = (id, x, y, more = {}) => ({id, lon: at(x, y)[0], lat: at(x, y)[1], countable: true, group: 'market', ...more});
  const venues = [venue, pin('P-1', 10, 10), pin('C-1', 20, 20), pin('C-2', 30, 30, {parentId: row.id}), pin('X-1', 50, 50, {countable: false}),
    pin('F-1', -150, 150, {group: 'fuel'}), pin('OUT', 400, 0)];
  assert.deepEqual(otherPinsIn(venue, polys, venues).map(v => v.id), ['F-1']);
});

test('classification: the smallest site outline holding the pin; shared, beyond 600 m, near, commercial, mall building, none', () => {
  const venues = [row];
  const mall = way(10, square(-80, -60, 80, 60), {building: 'retail', shop: 'mall', name: 'Mall'});
  const site = way(11, square(-150, -150, 150, 150), {landuse: 'retail'});
  const wide = way(12, square(-450, -450, 450, 450), {landuse: 'retail'});
  let c = classifyPin(row, [mall, site, wide], venues);
  assert.equal(c.cls, 'clean');
  assert.equal(c.outline.osm, 'way/11', 'smallest site outline, never the mall building');
  assert.ok(isSiteTag({shop: 'mall'}) && !isSiteTag({shop: 'mall', building: 'yes'}));
  const other = {id: 'M-2', lon: at(100, 100)[0], lat: at(100, 100)[1], countable: true, group: 'market'};
  c = classifyPin(row, [site], [row, other]);
  assert.equal(c.cls, 'shared');
  assert.deepEqual(c.others, [{id: 'M-2', group: 'market', why: 'pin_inside'}]);
  assert.equal(classifyPin(row, [wide], venues).cls, 'beyond_600m');
  assert.equal(classifyPin(row, [way(13, square(20, -50, 120, 50), {landuse: 'retail'})], venues).cls, 'near');
  assert.equal(classifyPin(row, [way(14, square(50, -50, 120, 50), {landuse: 'retail'})], venues).cls, 'none', 'more than 30 m away');
  assert.equal(classifyPin(row, [way(15, square(-150, -150, 150, 150), {landuse: 'commercial'})], venues).cls, 'commercial');
  assert.equal(classifyPin(row, [mall], venues).cls, 'mall_building');
  assert.equal(classifyPin(row, [], venues).cls, 'none');
});

test('D42: an outline next to another venue\'s pin, or holding its validated footprint, is shared (Emporium and EmQuartier)', () => {
  const site = way(21, square(-150, -150, 150, 150), {landuse: 'retail'});
  const pin = (id, x, y, more = {}) => ({id, name: id, lon: at(x, y)[0], lat: at(x, y)[1], countable: true, group: 'mall', ...more});
  // EmQuartier: its pin stands 19 m outside the outline and its own building, its footprint is inside it.
  const em = pin('EMQ', 169, 0);
  let c = classifyPin(row, [site], [row, em]);
  assert.equal(c.cls, 'shared');
  assert.deepEqual(c.others, [{id: 'EMQ', group: 'mall', why: 'pin_near'}]);
  assert.equal(classifyPin(row, [site], [row, pin('FAR', 200, 0)]).cls, 'clean', 'a pin 50 m outside is not next to the outline');
  const footprint = (ids, x0, y0, x1, y1) => ({type: 'Feature', properties: {geometry_role: 'host_building_footprint_not_shop_unit', venue_ids: ids},
    geometry: {type: 'Polygon', coordinates: [square(x0, y0, x1, y1)]}});
  c = classifyPin(row, [site], [row, pin('FAR', 400, 0)], {hosts: [footprint(['FAR'], 60, 60, 140, 140)]});
  assert.equal(c.cls, 'shared');
  assert.deepEqual(c.others, [{id: 'FAR', group: 'mall', why: 'host_footprint'}]);
  assert.equal(classifyPin(row, [site], [row], {hosts: [footprint([row.id], 60, 60, 140, 140)]}).cls, 'clean', 'the venue\'s own footprint');
  assert.equal(classifyPin(row, [site], [row, pin('FAR', 400, 0)], {hosts: [footprint(['FAR'], 140, 60, 300, 140)]}).cls, 'clean',
    'a footprint mostly outside the outline');
  // Never the family, a held duplicate, the same name, or an uncounted record.
  const fam = {...row, parentId: 'P', children: ['K']};
  const venues = [fam, pin('P', 10, 10), pin('K', 20, 20, {countable: false, countHold: 'component', parentId: row.id}),
    pin('S', 30, 30, {parentId: 'P'}), pin('D', 40, 40, {countHold: 'duplicate'}), pin('N', 50, 50, {name: row.name}), pin('U', 60, 60, {countable: false})];
  venues.find(v => v.id === 'P').children = ['S', row.id];
  assert.equal(classifyPin(fam, [site], venues).cls, 'clean');
  // A component of another family counts as another venue.
  assert.equal(classifyPin(row, [site], [row, pin('Z', 30, 30, {countable: false, countHold: 'component', parentId: 'OTHER'})]).cls, 'shared');
});

test('draft: interior point in the outline (the rule of row --site); the buildings the outline cuts; OSM-only buildings', () => {
  const polys = [[square(-100, -100, 100, 100)]];
  const long = building(5, 85, -300, 105, 300);                        // point 95,0 inside, three quarters of it outside
  const offPoint = {...building(6, 60, -40, 140, 40), point: at(120, 0)};  // point outside, half of it inside
  const cands = [building(1, -60, -40, 60, 40), building(2, 80, -20, 160, 20), building(3, 60, 60, 110, 90), building(4, 150, 150, 170, 170), long, offPoint];
  const picked = draftPick(cands, polys);
  assert.deepEqual([...picked].sort((a, b) => a - b), [1, 3, 5]);
  assert.ok(Math.abs(shareInside(cands[1], polys) - 0.25) < 0.05);
  assert.equal(shareInside(cands[0], polys), 1);
  const hints = edgeHints(cands, picked, polys);
  assert.deepEqual(hints.mostlyOutside, [5], 'a long building whose point is inside but most of it outside');
  assert.deepEqual(hints.mostlyInside, [6], 'a building whose point is outside but half of it inside');
  const part = b => ({outer: b.outer, holes: [], areaM2: b.area_m2});
  const lacking = building(8, -95, -98, -20, -60);                     // inside the outline, in no CityMETER building
  const osm = osmOnly([part(lacking), part(cands[0]), part(building(9, 0, 0, 5, 5)), part(building(10, 300, 300, 340, 340))], cands, polys);
  assert.deepEqual(osm.map(o => o.area_m2), [2850], 'the building CityMETER lacks; not one it has, not a shed, not one outside');
  assert.ok(inPolys(osm[0].point, polys));
});

test('site points: the map\'s interior point when it stays clear of the walls, else a point clear of a courtyard (Siam Square, 8 Nov 2026)', () => {
  const plain = {outer: square(-20, -10, 20, 10), holes: []};
  assert.deepEqual(sitePoint(plain), interiorPoint(plain).map(v => +v.toFixed(6)), 'the map\'s interior point, rounded as the helper writes it');
  // A building round a courtyard: the vertex average falls in the courtyard and the map's fallback lands on a wall.
  const ring = {outer: square(-40, -30, 40, 30), holes: [square(-30, -20, 30, 20)]};
  const ip = interiorPoint(ring), p = sitePoint(ring, ip), rings = [ring.outer, ...ring.holes];
  assert.ok(ringClearance(ip.map(v => +v.toFixed(6)), rings) < SITE_POINT_MARGIN_M, 'the case: the rounded interior point is on a wall');
  assert.ok(pointInRing(p, ring.outer) && !pointInRing(p, ring.holes[0]), 'the point stands in the building, not in the courtyard');
  assert.ok(ringClearance(p, rings) >= 3, `clear of every wall (${ringClearance(p, rings).toFixed(1)} m)`);
  assert.deepEqual(p, p.map(v => +v.toFixed(6)), '6 decimals');
});

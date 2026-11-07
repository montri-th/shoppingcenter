import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tileToLonLat, parseVectorTile} from '../js/mvt.js';
import {shapeTile, shapeCmTile, planCmRequests, installMassing, cmFeatureId, focusFeatureId, cmHeight, tileBox, CM_ID_BASE, CM_SLOTS, DEFAULT_CM_HEIGHT_M, HEIGHT_LIFT_M,
  MAX_CM_REQUESTS, CITY_LAYER, CONTEXT_LAYER, CONTEXT_SOURCE, CM_CREDIT_LAYER, FOCUS_SOURCE, roundingRadiusM, encloseOffsetM, indexCmBuildings, indexOsmBuildings,
  podiumIndex, ringDistance, PODIUM_ORDINAL_BASE} from '../js/massing.js';
import {chooseSource, corners, podiumHeight, ringSamples, coveredShare, isDefaultOsmHeight, COVER_MIN, CM_GAP_M, PODIUM_MARGIN_M} from '../js/building-choice.js';
import {cmTileUrl, zoneAt, zonesFor, zonesOf, validUnitFile, createBuildingUnitStore, createCmTileLoader, CM_TILE_API, CM_ATTRIBUTION} from '../js/building-units.js';
import {encodeTile, square} from './mvt-encode.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- a synthetic tile: OSM (OpenFreeMap schema) and one CityMETER unit over its left half ---------- */
const T = {z: 14, x: 12767, y: 7560};
const ll = ring => ring.map(([px, py]) => tileToLonLat(px, py, T));
const bboxOf = ring => [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))];
const zoneRing = ll([[0, 0], [2048, 0], [2048, 4096], [0, 4096], [0, 0]]);
const ZONE = Object.freeze({id: 'unit-a', code: '04100101', name: 'เทศบาลทดสอบ', province: 'NPT', bbox: bboxOf(zoneRing), polygons: [[zoneRing]], tileType: 'MUNICIPALITY', tileUnits: [{id: 'unit-a', bbox: bboxOf(zoneRing)}]});
const focus = ll([[0, 0], [3072, 0], [3072, 4096], [0, 4096], [0, 0]]); // left three quarters
const osmTile = {extent: 4096, layers: [{name: 'building', features: [
  // 201: one OpenFreeMap feature, two buildings: A in the unit (replaced), B outside the focus (comes back as context)
  {id: 201, properties: {render_height: 6, render_min_height: 0}, rings: [square(500, 500, 100), square(3500, 500, 100)]},
  // 202: an outline OSM maps in parts (hide_3d) inside the unit; 203: its part (stays, LOD2)
  {id: 202, properties: {render_height: 40, render_min_height: 0, hide_3d: true}, rings: [square(1000, 1000, 400)]},
  {id: 203, properties: {render_height: 40, render_min_height: 10}, rings: [square(1100, 1100, 100)]},
  // 204: in the focus, outside the unit (OSM stays)
  {id: 204, properties: {render_height: 9, render_min_height: 0}, rings: [square(2500, 2500, 100)]},
]}]};
const cmTile = {layers: [{name: 'building-detail', features: [
  {properties: {height_m: '12.50', estimated_floor: 4, height_class_code: 'H2'}, rings: [square(520, 520, 90)]},   // c1: drawn
  {properties: {height_m: '30.00', estimated_floor: 9, height_class_code: 'H4'}, rings: [square(1150, 1150, 120)]}, // c2: in the parts outline → left out
  {properties: {height_m: '8.00', estimated_floor: 2, height_class_code: 'H1'}, rings: [square(-300, 700, 200)]},   // c3: interior in the western tile → drawn there
  {properties: {estimated_floor: 1}, rings: [square(1700, 3000, 60)]},                                             // c4: no height_m → default height
]}]};
const osmBytes = encodeTile(osmTile.layers), cmBytes = encodeTile(cmTile.layers);
const osmLayer = parseVectorTile(osmBytes).layers.building, cmLayer = parseVectorTile(cmBytes).layers['building-detail'];
const r = roundingRadiusM(16), d = encloseOffsetM(r);

const cmIdx = () => indexCmBuildings([{tile: T, layer: cmLayer}]);
const osmIdx = () => indexOsmBuildings([{tile: T, layer: osmLayer, zones: [ZONE]}]);

test('D35 in a CityMETER unit: every OSM building stays (it stands for the CityMETER building of the same outline); parts (LOD2) stay; nothing is hidden or brought back', () => {
  const out = shapeTile(T, osmLayer, {regions: [focus], radiusM: r, offsetM: d, zones: [ZONE], cm: cmIdx()});
  const drawn = out.features.map(f => f.properties.osm_id).sort();
  assert.deepEqual(drawn, [201, 203, 204], 'A (201, in the unit) stays OSM; the part (203) and the building outside the unit (204) stay');
  assert.equal(out.replaced, 0, 'D35: CityMETER never replaces an OSM building');
  assert.equal(out.hiddenIds.size, 0); assert.equal(out.context.length, 0);
  assert.equal(out.partOutlines.length, 1, 'the outline of the building mapped in parts is handed to the CityMETER tier');
  assert.equal(out.taken.size, 1, 'c1: OSM draws it'); assert.deepEqual(out.rules, {'osm-first': 1});
  assert.equal(out.features.find(f => f.properties.osm_id === 201).properties.render_height, 6, 'a tagged OSM height stays');
  // A zone without any CityMETER building read: every OSM building stays.
  const bare = shapeTile(T, osmLayer, {regions: [focus], radiusM: r, offsetM: d, zones: [ZONE]});
  assert.deepEqual(bare.features.map(f => f.properties.osm_id).sort(), [201, 203, 204]);
  assert.equal(bare.replaced, 0); assert.deepEqual(bare.rules, {'osm-only': 1});
  // Without a zone the tile is drawn as before: A drawn, nothing hidden, no context.
  const before = shapeTile(T, osmLayer, {regions: [focus], radiusM: r, offsetM: d});
  assert.deepEqual(before.features.map(f => f.properties.osm_id).sort(), [201, 203, 204]);
  assert.equal(before.hiddenIds.size, 0); assert.equal(before.context.length, 0); assert.equal(before.replaced, 0);
  // Stable ids: the zone changes which buildings are drawn, never their ids.
  const id = o => o.features.find(f => f.properties.osm_id === 204).id;
  assert.equal(id(out), id(before));
  // A host-covered feature is still hidden as a whole in the city tier, and its other buildings come back as context.
  const hosted = shapeTile(T, osmLayer, {regions: [focus], hosts: [ll(square(510, 510, 80))], radiusM: r, offsetM: d});
  assert.deepEqual([...hosted.hiddenIds], [201]); assert.equal(hosted.context.length, 1);
  assert.deepEqual(hosted.context[0].properties, {height: 6, base: 0});
});

test('CityMETER buildings: drawn once (home tile, shared geometry), only in the focus, never inside an OSM parts outline, never over a host or the pin building; height_m is the height', () => {
  const parts = shapeTile(T, osmLayer, {regions: [focus], radiusM: r, offsetM: d, zones: [ZONE]}).partOutlines;
  const seen = new Set();
  const out = shapeCmTile(T, cmLayer, {regions: [focus], radiusM: r, offsetM: d, slot: 0, skipRings: parts, seen});
  assert.equal(out.kept, 2, 'c1 and c4');
  assert.equal(out.inParts, 1, 'c2 stands in the parts outline: the OSM parts are drawn instead');
  assert.equal(out.away, 1, 'c3 belongs to the western tile, which draws it whole');
  assert.deepEqual(out.features.map(f => f.properties.render_height).sort((a, b) => a - b), [DEFAULT_CM_HEIGHT_M, 12.5]);
  assert.equal(out.features.find(f => f.properties.render_height === 12.5).properties.height, 12.5 + HEIGHT_LIFT_M);
  assert.ok(out.features.every(f => f.properties.source === 'cm' && f.properties.base === 0));
  for (const f of out.features) assert.ok(Number.isSafeInteger(f.id) && f.id >= CM_ID_BASE);
  assert.equal(new Set(out.features.map(f => f.id)).size, out.features.length);
  assert.ok(focusFeatureId({x: 16383, y: 16383}, 2 ** 24 - 1) < CM_ID_BASE, 'every z14 OSM id is below 2^52');
  assert.ok(cmFeatureId({x: 16383, y: 16383, z: 14}, CM_SLOTS - 1, 2 ** 19 - 1) < 2 ** 53);
  const twice = shapeCmTile(T, cmLayer, {regions: [focus], radiusM: r, offsetM: d, slot: 1, skipRings: parts, seen});
  assert.equal(twice.kept, 0); assert.equal(twice.shared, 3, 'c1, c2 and c4 were seen');
  // The venue's own building (drawn blue by buildings.js) and anything overlapping a host stay out of the focus tier.
  const c1 = ll(square(520, 520, 90));
  const pinned = shapeCmTile(T, cmLayer, {regions: [focus], radiusM: r, offsetM: d, pins: [c1], skipRings: parts});
  assert.equal(pinned.kept, 1); assert.equal(pinned.dropped, 1);
  const hosted = shapeCmTile(T, cmLayer, {regions: [focus], radiusM: r, offsetM: d, hosts: [ll(square(1700, 3000, 200))], skipRings: parts});
  assert.equal(hosted.kept, 1); assert.equal(hosted.dropped, 1);
  const west = {...T, x: T.x - 1};
  const westFocus = ll([[-4096, 0], [3072, 0], [3072, 4096], [-4096, 4096], [-4096, 0]]);
  const w = shapeCmTile(west, parseVectorTile(encodeTile([{name: 'building-detail', features: [{properties: {height_m: '8.00'}, rings: [square(4096 - 300, 700, 200)]}]}])).layers['building-detail'], {regions: [westFocus], radiusM: r, offsetM: d});
  assert.equal(w.kept, 1);
  assert.equal(cmHeight({height_m: 'x'}), DEFAULT_CM_HEIGHT_M); assert.equal(cmHeight({height_m: '0'}), DEFAULT_CM_HEIGHT_M); assert.equal(cmHeight({height_m: '136.71'}), 136.71);
});

/* ---------- D35: OSM first everywhere, CityMETER only where OSM has no building (owner 2026-11-07 16:35) ---------- */
const octagon = [[620, 200], [680, 200], [700, 220], [700, 280], [680, 300], [620, 300], [600, 280], [600, 220], [620, 200]];
const rectT = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const choiceOsm = parseVectorTile(encodeTile([{name: 'building', features: [
  {id: 301, properties: {render_height: 5, render_min_height: 0}, rings: [square(200, 200, 100)]},          // o1: CityMETER has the same outline
  {id: 302, properties: {render_height: 5, render_min_height: 0}, rings: [octagon]},                         // o2: CityMETER's box of it, default height
  {id: 303, properties: {render_height: 5, render_min_height: 0}, rings: [square(1000, 200, 100)]},         // o3: CityMETER has nothing here
  {id: 304, properties: {render_height: 6, render_min_height: 0}, rings: [square(200, 600, 300)]},          // o4: one block where CityMETER has two
  {id: 305, properties: {render_height: 7, render_min_height: 0}, rings: [square(1000, 600, 100), square(1150, 600, 100)]}, // o5a, o5b: two in one CityMETER block
  {id: 306, properties: {render_height: 8, render_min_height: 0}, rings: [square(1400, 200, 100)]},         // o6: CityMETER draws it 60 units east
]}])).layers.building;
const choiceCm = parseVectorTile(encodeTile([{name: 'building-detail', features: [
  {properties: {height_m: '10.00'}, rings: [square(200, 200, 100)]},     // c1 = o1
  {properties: {height_m: '18.00'}, rings: [square(600, 200, 100)]},     // c2 ~ o2
  {properties: {height_m: '12.00'}, rings: [rectT(205, 605, 345, 895)]}, // c4a in o4
  {properties: {height_m: '14.00'}, rings: [rectT(355, 605, 495, 895)]}, // c4b in o4
  {properties: {height_m: '9.00'}, rings: [rectT(990, 590, 1260, 710)]}, // c5 holds o5a and o5b
  {properties: {height_m: '6.00'}, rings: [square(1600, 1600, 60)]},     // c6: no OSM building near — the fallback
  {properties: {height_m: '31.00'}, rings: [square(1120, 200, 50)]},     // c7: 12 m east of o3 — a block OSM has mapped
  {properties: {height_m: '40.00'}, rings: [square(1460, 200, 100)]},    // c8: o6 drawn 60 units apart (interior points miss)
]}])).layers['building-detail'];

test('D35 OSM first: every OSM building is drawn (a default height takes the CityMETER height of the same building); CityMETER only where no OSM building stands for it or next to it', () => {
  const cm = indexCmBuildings([{tile: T, layer: choiceCm}]);
  const osm = indexOsmBuildings([{tile: T, layer: choiceOsm, zones: [ZONE]}]);
  assert.equal(cm.size, 8); assert.equal(osm.size, 7);
  const out = shapeTile(T, choiceOsm, {regions: [focus], radiusM: r, offsetM: d, zones: [ZONE], cm});
  assert.deepEqual(out.features.map(f => f.properties.osm_id).sort(), [301, 302, 303, 304, 305, 305, 306], 'every OSM building');
  assert.equal(out.replaced, 0);
  assert.deepEqual(out.rules, {'osm-first': 5, 'osm-only': 2});
  const h = id => out.features.find(f => f.properties.osm_id === id).properties;
  assert.equal(h(301).render_height, 10); assert.equal(h(301).height_source, 'cm', 'the OSM default height takes the CityMETER height');
  assert.equal(h(302).render_height, 18, 'the octagon keeps its outline and takes the height of the CityMETER box');
  assert.equal(h(303).render_height, 5, 'an OSM-only building keeps its own height');
  assert.equal(h(304).render_height, 6, 'one OSM block over two CityMETER buildings: OSM, its tagged height');
  assert.ok(out.features.filter(f => f.properties.osm_id === 305).every(f => f.properties.render_height === 7 && !f.properties.height_source));
  assert.equal(out.cmHeights, 2); assert.equal(out.osmFirst, 7); assert.equal(out.taken.size, 5, 'c1, c2, c4a, c4b, c5');
  const cmOut = shapeCmTile(T, choiceCm, {regions: [focus], radiusM: r, offsetM: d, taken: out.taken, osm});
  assert.equal(cmOut.kept, 1, 'only c6, where OSM has no building'); assert.equal(cmOut.osmFirst, 7, 'five taken, c7 next to o3, c8 under o6');
  assert.deepEqual(cmOut.features.map(f => f.properties.render_height), [6]);
  // Without the OSM footprints (no zone tile read) the taken ones still stay out; c7 and c8 are drawn.
  assert.equal(shapeCmTile(T, choiceCm, {regions: [focus], radiusM: r, offsetM: d, taken: out.taken}).kept, 3);
});

test('D35 rule details: the OSM default height; a podium is an outline lower than its tallest part; coverage by samples; ring distance', () => {
  assert.equal(isDefaultOsmHeight(5, 0), true); assert.equal(isDefaultOsmHeight(5, 3), false); assert.equal(isDefaultOsmHeight(7.32, 0), false);
  const kiosks = [{areaM2: 20, height: 4}, {areaM2: 25, height: 4}];
  const mall = chooseSource({areaM2: 5000, height: 5, base: 0}, {inside: kiosks});
  assert.deepEqual([mall.use, mall.take.length, mall.height, mall.rule], ['osm', 2, 4, 'osm-first']);
  assert.deepEqual(chooseSource({areaM2: 30, height: 5}, {host: {areaM2: 5000, height: 20}}), {use: 'osm', take: [{areaM2: 5000, height: 20}], height: 20, rule: 'osm-first'});
  assert.deepEqual(chooseSource({areaM2: 30, height: 9}), {use: 'osm', take: [], height: null, rule: 'osm-only'});
  // Samyan Mitrtown (7 Nov 2026): outline 22 m (6 levels), parts 5 m (no tag), 26 m, 114 m and 180 m → a 22 m podium.
  assert.equal(podiumHeight({height: 22, base: 0}, [{height: 5}, {height: 26}, {height: 114}, {height: 180}]), 22);
  assert.equal(podiumHeight({height: 180, base: 0}, [{height: 114}, {height: 180}]), null, 'the outline carries the tallest part: not a podium');
  assert.equal(podiumHeight({height: 5, base: 0}, [{height: 60}]), null, 'the default height is no podium');
  assert.equal(podiumHeight({height: 30, base: 4}, [{height: 60}]), null, 'a raised outline is no podium');
  assert.equal(podiumHeight({height: 58, base: 0}, [{height: 60}]), null, `within ${PODIUM_MARGIN_M} m of the tallest part`);
  assert.equal(podiumHeight({height: 22, base: 0}, []), null);
  const sq = square(0, 0, 100);
  assert.equal(ringSamples(sq).length, 25);
  assert.equal(coveredShare(ringSamples(sq), ([x]) => x < 40), 0.4);
  assert.equal(coveredShare([], () => true), 0);
  assert.ok(COVER_MIN > 0 && COVER_MIN < 0.5); assert.equal(CM_GAP_M, 20);
  assert.equal(ringDistance(square(0, 0, 10), square(20, 0, 10)), 10);
  assert.equal(ringDistance(square(0, 0, 10), square(5, 5, 10)), 0);
  assert.equal(corners(square(0, 0, 10)), 4);
});

test('D35 podiums: an outline OSM gives a podium height under its towers is drawn as that podium, in every tile of the building; other outlines stay hidden', () => {
  const layer = parseVectorTile(encodeTile([{name: 'building', features: [
    {id: 401, properties: {render_height: 22, render_min_height: 0, hide_3d: true}, rings: [square(2200, 2200, 400)]}, // podium outline
    {id: 402, properties: {render_height: 114, render_min_height: 0}, rings: [square(2250, 2250, 100)]},            // tower
    {id: 403, properties: {render_height: 5, render_min_height: 0}, rings: [square(2400, 2400, 150)]},              // part without a height tag
    {id: 404, properties: {render_height: 60, render_min_height: 0, hide_3d: true}, rings: [square(200, 2200, 300)]}, // outline = tallest part
    {id: 405, properties: {render_height: 60, render_min_height: 0}, rings: [square(250, 2250, 100)]},
  ]}])).layers.building;
  const podiums = podiumIndex([{tile: T, layer}]);
  assert.deepEqual([...podiums], [[401, 22]]);
  const out = shapeTile(T, layer, {regions: [focus], radiusM: r, offsetM: d, podiums});
  const byId = id => out.features.filter(f => f.properties.osm_id === id);
  assert.equal(byId(401).length, 1); assert.equal(byId(401)[0].properties.render_height, 22); assert.equal(byId(401)[0].properties.podium, true);
  assert.equal(byId(404).length, 0, 'an outline with its tallest part\'s height is not drawn (OpenMapTiles hide_3d)');
  assert.deepEqual(out.features.map(f => f.properties.osm_id).sort(), [401, 402, 403, 405]);
  assert.ok(byId(401)[0].id % 2 ** 24 >= PODIUM_ORDINAL_BASE, 'podium ids are counted apart: every other building keeps its id');
  const plain = shapeTile(T, layer, {regions: [focus], radiusM: r, offsetM: d});
  assert.equal(plain.features.find(f => f.properties.osm_id === 402).id, byId(402)[0].id);
  // The pieces of one outline in two tiles share its id: a tall part in the other tile makes both pieces a podium.
  const east = {...T, x: T.x + 1};
  const westPiece = parseVectorTile(encodeTile([{name: 'building', features: [{id: 501, properties: {render_height: 20, render_min_height: 0, hide_3d: true}, rings: [square(3900, 100, 300)]}]}])).layers.building;
  const eastPiece = parseVectorTile(encodeTile([{name: 'building', features: [
    {id: 501, properties: {render_height: 20, render_min_height: 0, hide_3d: true}, rings: [square(-200, 100, 300)]},
    {id: 502, properties: {render_height: 90, render_min_height: 0}, rings: [square(20, 150, 60)]},
  ]}])).layers.building;
  assert.deepEqual([...podiumIndex([{tile: T, layer: westPiece}, {tile: east, layer: eastPiece}])], [[501, 20]]);
});

test('CityMETER requests: one per tile and tile unit meeting it, nearest the camera first, bounded; a zone is drawn in a tile only with all its requests', () => {
  const east = {...T, x: T.x + 1}, far = {...T, x: T.x + 5};
  const p = planCmRequests([far, east, T], [ZONE], {center: tileToLonLat(10, 10, T)});
  assert.deepEqual(p.requests.map(q => `${q.tile.x}|${q.tileUnit.id}|${q.slot}`), [`${T.x}|unit-a|0`], 'the unit box meets only its own tile');
  const [w, s, e, n] = tileBox(T);
  const khet = {...ZONE, id: 'khet', tileType: 'SUBDISTRICT', tileUnits: [{id: 'khwaeng-b', bbox: [w, s, (w + e) / 2, n]}, {id: 'khwaeng-a', bbox: [(w + e) / 2, s, e, n]}, {id: 'khwaeng-c', bbox: [e + 1, s, e + 2, n]}]};
  const k = planCmRequests([T], [khet]);
  assert.deepEqual(k.requests.map(q => [q.tileUnit.id, q.slot, q.tileType]), [['khwaeng-b', 1, 'SUBDISTRICT'], ['khwaeng-a', 0, 'SUBDISTRICT']]);
  const capped = planCmRequests([T], [khet], {max: 1});
  assert.equal(capped.requests.length, 0); assert.equal(capped.truncated, true); assert.equal(capped.zonesByTile.size, 0);
  assert.equal(planCmRequests([T], []).requests.length, 0);
  assert.ok(MAX_CM_REQUESTS >= 16);
  const slotted = {...khet, tileUnits: khet.tileUnits.map((tu, i) => ({...tu, slot: 4000 + i}))};
  assert.deepEqual(planCmRequests([T], [slotted]).requests.map(q => q.slot), [4000, 4001]);
});

test('the production tile URL names the tile, the tile unit and V4; zones are found by box, then by outline (holes out)', () => {
  assert.equal(cmTileUrl(T, {id: 'b64c/eeb9'}, 'MUNICIPALITY'), `${CM_TILE_API}14/${T.x}/${T.y}?inTileType=MUNICIPALITY&inTileId=b64c%2Feeb9&version=V4`);
  assert.equal(cmTileUrl(T, {id: 'x'}, 'PROVINCE'), '', 'only อปท. and แขวง tiles');
  assert.ok(CM_TILE_API.startsWith('https://landometer.com/'));
  assert.match(CM_ATTRIBUTION, /CityMETER Building V4/);
  const inside = tileToLonLat(1000, 2000, T), outside = tileToLonLat(3000, 2000, T);
  assert.equal(zoneAt([ZONE], inside)?.id, 'unit-a');
  assert.equal(zoneAt([ZONE], outside), null);
  const hole = ll([[800, 1800], [800, 2200], [1200, 2200], [1200, 1800], [800, 1800]]);
  assert.equal(zoneAt([{...ZONE, polygons: [[zoneRing, hole]]}], inside), null, 'a hole of the unit is outside it');
  assert.deepEqual(zonesFor([ZONE], [focus]).map(z => z.id), ['unit-a']);
  assert.deepEqual(zonesFor([ZONE], [ll(square(5000, 5000, 10))]), []);
});

test('unit files: only a CityMETER unit needs an outline and tile units; the store reads the index first and never requests a province without CityMETER units', async () => {
  const cmUnit = {id: 'u1', code: '1', name: 'ก', source: 'cm', bbox: ZONE.bbox, tileType: 'MUNICIPALITY', tileUnits: ZONE.tileUnits, outline: [[zoneRing]]};
  const osmUnit = {id: 'u2', code: '2', name: 'ข', source: 'osm', bbox: ZONE.bbox};
  assert.equal(validUnitFile({province: 'PKT', units: [cmUnit, osmUnit]}), true);
  assert.equal(validUnitFile({province: 'PKT', units: [{...cmUnit, outline: []}]}), false, 'a CityMETER unit without its outline is refused (the area stays OSM)');
  assert.deepEqual(zonesOf({province: 'PKT', units: [cmUnit, osmUnit]}).map(z => z.id), ['u1']);
  const asked = [];
  const files = {'index.json': {meta: {}, provinces: [{province: 'PKT', cm: 1}, {province: 'NAN', cm: 0}]}, 'PKT.json': {province: 'PKT', units: [cmUnit, osmUnit]}};
  const fetchJSON = async url => { const name = url.split('/').pop().split('?')[0]; asked.push(name); if (!files[name]) throw new Error('404'); return files[name]; };
  let loads = 0;
  const store = createBuildingUnitStore({base: 'u/', fetchJSON, onLoad: () => loads++});
  assert.equal(store.settled('PKT'), false);
  await store.ensureMany(['PKT', 'NAN', 'PKT']);
  assert.deepEqual(asked, ['index.json', 'PKT.json'], 'NAN has no CityMETER unit: never requested');
  assert.equal(loads, 1);
  assert.ok(store.settled('PKT') && store.settled('NAN') && store.settled(''));
  const broken = createBuildingUnitStore({fetchJSON: async () => { throw new Error('offline'); }, onError: () => {}});
  await broken.ensure('PKT');
  assert.equal(broken.settled('PKT'), true); assert.deepEqual(broken.zones(), []);
});

/** Minimal MapLibre stand-in (as tests/massing.test.js). */
function fakeMap() {
  const layers = new Map(), sources = new Map([['openmaptiles', {}]]), handlers = {};
  return {
    layers, sources, filters: {}, visibility: {}, data: {}, zoomRange: {}, sourceDefs: {},
    setLayerZoomRange(id, min, max) { this.zoomRange[id] = [min, max]; },
    getLayer: id => layers.get(id), getSource: id => sources.get(id),
    addLayer(def) { layers.set(def.id, def); if (def.layout?.visibility) this.visibility[def.id] = def.layout.visibility; },
    addSource(id, def) { this.sourceDefs[id] = def; sources.set(id, {setData: dd => { this.data[id] = dd; }}); },
    removeLayer(id) { layers.delete(id); }, removeSource(id) { sources.delete(id); },
    setFilter(id, f) { this.filters[id] = f; }, setLayoutProperty(id, k, v) { this.visibility[id] = v; },
    paint: {}, setPaintProperty(id, k, v) { (this.paint[id] ||= {})[k] = v; },
    getZoom: () => 16, getPitch: () => 60, on(e, h) { handlers[e] = h; }, off(e) { delete handlers[e]; },
    project: ([lon, lat]) => ({x: lon * 1e5, y: -lat * 1e5}),
    querySourceFeatures: () => [], setFeatureState() {}, removeFeatureState() {},
  };
}

test('installMassing draws a CityMETER unit from its tiles (one shared reader), OSM first (D35: CityMETER only where OSM has no building), credits the source while drawn, hides host-covered city-tier features (one hashed match), and falls back to OSM when a tile fails', async () => {
  const map = fakeMap();
  let cmOk = true;
  const fetched = [];
  const fetchImpl = async url => {
    fetched.push(url);
    const body = url.startsWith(CM_TILE_API) ? (url.includes(`/${T.x}/${T.y}?`) ? cmBytes : new ArrayBuffer(0)) : url === `osm/14/${T.x}/${T.y}` ? osmBytes : encodeTile([{name: 'building', features: []}]);
    return url.startsWith(CM_TILE_API) && !cmOk ? {ok: false, status: 503} : {ok: true, arrayBuffer: async () => body};
  };
  const massing = installMassing(map, {beforeId: null, colors: {}, tileUrl: t => `osm/${t.z}/${t.x}/${t.y}`, cmLoad: createCmTileLoader({fetchImpl}), cmAttribution: CM_ATTRIBUTION, fetchImpl});
  assert.equal(map.sourceDefs['cm-buildings-credit'].attribution, CM_ATTRIBUTION);
  assert.equal(map.visibility[CM_CREDIT_LAYER], 'none', 'no CityMETER building yet: not credited');
  const res = await massing.update({regions: [focus], zones: [ZONE], zoom: 16, enabled: true, city: true, latitude: 13.75, center: tileToLonLat(100, 100, T)});
  assert.equal(res.cm.requests, 2, 'its own tile and the western one (the focus and the unit box both touch the west edge)');
  assert.ok(fetched.some(u => u === cmTileUrl(T, ZONE.tileUnits[0], 'MUNICIPALITY')));
  assert.equal(res.cm.kept, 1, 'c4 only: OSM draws c1 (A), c2 stands in the parts outline'); assert.equal(res.replaced, 0); assert.equal(res.context, 0);
  assert.equal(res.cm.osmFirst, 1); assert.equal(res.cm.inParts, 1);
  assert.equal(map.filters[CITY_LAYER], undefined, 'nothing replaced: the city tier filter is never changed');
  assert.equal(map.visibility[CM_CREDIT_LAYER], 'visible', 'CityMETER Building V4 is credited while drawn');
  assert.deepEqual(map.data[FOCUS_SOURCE].features.map(f => f.properties.source || 'osm').sort(), ['cm', 'osm', 'osm', 'osm']);
  // A host over A: the city tier hides A's feature as a whole, and its building outside the focus comes back as context.
  const hosted = await massing.update({regions: [focus], hosts: [ll(square(510, 510, 80))], zones: [ZONE], zoom: 16, enabled: true, city: true, latitude: 13.75, center: tileToLonLat(100, 100, T)});
  assert.equal(hosted.context, 1);
  assert.deepEqual(map.filters[CITY_LAYER], ['all', ['!=', ['get', 'hide_3d'], true], ['match', ['id'], [201], false, true]]);
  assert.equal(map.data[CONTEXT_SOURCE].features.length, 1);
  assert.ok(Number.isFinite(map.data[CONTEXT_SOURCE].features[0].properties.fade), 'context carries its distance fade');
  assert.equal(map.visibility[CONTEXT_LAYER], 'visible');
  // Pin buildings from CityMETER keep the credit on even with no CityMETER building in the focus.
  massing.creditPinBuildings(true);
  cmOk = false;
  const unitB = {...ZONE, id: 'unit-b', tileUnits: [{id: 'unit-b', bbox: ZONE.bbox}]};
  const fallback = await massing.update({regions: [ll(square(10, 10, 3000))], hosts: [], zones: [unitB], zoom: 16, enabled: true, city: true, latitude: 13.75, center: tileToLonLat(100, 100, T)});
  assert.equal(fallback.cm.failed, fallback.cm.requests); assert.equal(fallback.cm.kept, 0); assert.equal(fallback.replaced, 0);
  assert.deepEqual(map.filters[CITY_LAYER], ['all', ['!=', ['get', 'hide_3d'], true]]);
  assert.equal(map.data[CONTEXT_SOURCE].features.length, 0);
  assert.equal(map.visibility[CM_CREDIT_LAYER], 'visible', 'still credited: a pin building is drawn from CityMETER');
  massing.creditPinBuildings(false);
  assert.equal(map.visibility[CM_CREDIT_LAYER], 'none');
  assert.ok(map.data[FOCUS_SOURCE].features.some(f => f.properties.osm_id === 201), 'A is drawn from OSM again');
  massing.dispose();
  assert.equal(map.getLayer(CONTEXT_LAYER), undefined); assert.equal(map.getSource('cm-buildings-credit'), undefined);
});

/* ---------- the shipped data (scripts/build-building-units.py) ---------- */
const unitFiles = () => readdirSync(join(ROOT, 'data/building-units')).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
const readUnits = f => JSON.parse(readFileSync(join(ROOT, 'data/building-units', f), 'utf8'));
/** The owner's rule (2026-11-01, CityMETER · Hotel; here since 2026-11-05), recomputed from the counts each unit records. */
const ruleSource = u => {
  if (u.osmMethod === 'bbox_upper_bound' && u.cm && u.osmUpper != null && u.osmUpper * 1.15 <= u.cm) return 'cm';
  if (u.osm == null) return 'osm';
  return u.cm && u.cm >= 1.15 * u.osm ? 'cm' : 'osm';
};

test('building units: every unit holds a venue and follows the 15 % rule from its own recorded counts; only CityMETER units carry outlines and tile units; Bangkok by เขต', () => {
  const index = JSON.parse(readFileSync(join(ROOT, 'data/building-units/index.json'), 'utf8'));
  assert.match(index.meta.rule, /1\.15/);
  assert.match(index.meta.partsOverride, /building:part/);
  assert.ok(index.meta.osm.osmBase.length >= 1);
  assert.match(index.meta.reused.from, /^montri-th\/hotel@[0-9a-f]{7}$/);
  const totals = {cm: 0, osm: 0, gap: 0};
  const files = unitFiles();
  assert.equal(files.length, index.provinces.length, 'one file per province with units');
  for (const f of files) {
    const doc = readUnits(f), code = f.replace('.json', '');
    assert.equal(doc.province, code);
    assert.ok(validUnitFile(doc), `${f} is a valid unit file`);
    const row = index.provinces.find(p => p.province === code);
    assert.equal(row.units, doc.units.length);
    for (const u of doc.units) {
      assert.ok(u.venues >= 1, `${code} ${u.code}: a unit holds a venue`);
      assert.ok(u.countsFrom === 'shoppingcenter' || u.countsFrom === index.meta.reused.from, u.countsFrom);
      assert.equal(u.source, ruleSource(u), `${code} ${u.code}: source follows the rule (${u.basis})`);
      assert.ok(['bbox_upper_bound', 'bbox_zero', 'polygon', 'poly_error', 'error'].includes(u.osmMethod), u.osmMethod);
      assert.equal(u.gap, (u.cm || 0) < 10 && (u.osm ?? u.osmUpper) != null && (u.osm ?? u.osmUpper) < 10, `${u.code} gap flag`);
      if (u.source === 'cm') {
        assert.ok(u.outline.length > 0 && u.tileUnits.length > 0);
        const [w, s, e, n] = u.bbox, slack = 0.01;
        for (const poly of u.outline) for (const [x, y] of poly[0]) assert.ok(x >= w - slack && x <= e + slack && y >= s - slack && y <= n + slack, `${u.code} outline inside its box`);
        if (code === 'BKK') { assert.equal(u.kind, 'district'); assert.equal(u.tileType, 'SUBDISTRICT'); }
        else { assert.equal(u.tileType, 'MUNICIPALITY'); assert.deepEqual(u.tileUnits.map(t => t.id), [u.id]); }
      } else {
        assert.equal(u.outline, undefined, 'an OSM unit needs no outline');
      }
      totals[u.source]++; if (u.gap) totals.gap++;
    }
    assert.equal(row.cm, doc.units.filter(u => u.source === 'cm').length);
  }
  assert.deepEqual(totals, index.meta.totals);
  const slots = new Map();
  for (const f of files) for (const u of readUnits(f).units) for (const t of u.tileUnits || []) {
    assert.ok(Number.isInteger(t.slot) && t.slot >= 0 && t.slot < CM_SLOTS, `${t.id} slot`);
    assert.ok(!slots.has(t.slot) || slots.get(t.slot) === t.id, `slot ${t.slot} unique`);
    slots.set(t.slot, t.id);
  }
  assert.ok(readUnits('BKK.json').units.every(u => /^10\d\d$/.test(u.code)), 'Bangkok units are เขต codes');
  // Publication hygiene: no links (production API, private documents) in the unit files.
  for (const f of ['index.json', ...files]) {
    const text = readFileSync(join(ROOT, 'data/building-units', f), 'utf8');
    assert.ok(!/drive\.google|docs\.google|spreadsheets/.test(text), `${f}: no private links`);
    if (f !== 'index.json') assert.ok(!/https?:\/\//.test(text), `${f}: no URLs`);
  }
});

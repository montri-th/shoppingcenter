// Google AI Mode, Google Maps and Street View facing the building (owner 2026-11-07 22:13, D37).
import test from 'node:test';
import assert from 'node:assert/strict';
import {streetViewView, streetViewURL, aiModeURL, mapsSearchURL, roadOf, overheadOf, roadsOfLayer, lookTarget, lookBBox, venueQuestion, lookLinks, createLookReader, MAX_GAP_M} from '../js/look-around.js';
import {parseVectorTile, lonLatToTile, lonLatToTileUnits} from '../js/mvt.js';
import {encodeTile} from './mvt-encode.js';
import {groupById} from '../js/model.js';

// A local metric frame round Siam (lon 100.53, lat 13.745): x east, y north, in metres.
const O = [100.53, 13.745];
const KX = 111320 * Math.cos(O[1] * Math.PI / 180), KY = 110574;
const ll = ([x, y]) => [O[0] + x / KX, O[1] + y / KY];
const xy = ([lon, lat]) => [(lon - O[0]) * KX, (lat - O[1]) * KY];
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(ll);
const road = (cls, pts, extra = {}) => ({cls, line: pts.map(ll), ...extra});
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('Street View stands on the road the building fronts and looks at its centre', () => {
  const target = {rings: [box(-20, -20, 20, 20)], height: 24, point: ll([0, 0])};
  const v = streetViewView({target, roads: [road('primary', [[-200, -40], [200, -40]])]});
  const [x, y] = xy(v.viewpoint);
  near(x, 0, 0.5, 'in front of the centre'); near(y, -40, 0.5, 'on the road');
  assert.ok(angle(v.heading, 0) <= 1, `looks north at the building (${v.heading})`);
  assert.equal(v.road.cls, 'primary'); assert.equal(v.road.gapM, 20); assert.equal(v.blocked, false);
  assert.ok(v.fov >= 40 && v.fov <= 100, `field of view in Google's range (${v.fov})`);
  assert.ok(v.fov >= 2 * Math.atan(20 / 20) * 180 / Math.PI, 'the whole facade fits');
  assert.ok(v.pitch > 0 && v.pitch <= 10, `looks a little up at a 24 m building (${v.pitch})`);
  assert.equal(v.under, false);
});

test('a road that ends beside the building looks at its nearest wall, corner-on', () => {
  const target = {rings: [box(-20, -20, 20, 20)], height: 20, point: ll([0, 0])};
  const v = streetViewView({target, roads: [road('secondary', [[-300, -60], [-100, -60]])]});
  const [x, y] = xy(v.viewpoint);
  near(x, -100, 0.5, 'the end of the road'); near(y, -60, 0.5, 'on the road');
  assert.ok(angle(v.heading, 63) <= 1, `at the south-west corner, not down the road (${v.heading})`);
});

test('a viewpoint under a viaduct, skywalk or elevated tollway gives way to an open road', () => {
  const target = {rings: [box(-20, -20, 20, 20)], height: 30, point: ll([0, 0])};
  const main = road('primary', [[-300, -45], [300, -45]]), side = road('secondary', [[60, -300], [60, 300]]);
  const deck = {cls: 'transit', line: [[-300, -47], [300, -47]].map(ll)};
  const v = streetViewView({target, roads: [main, side], overheads: [deck]});
  assert.equal(v.road.cls, 'secondary'); assert.equal(v.under, false);
  const w = streetViewView({target, roads: [main], overheads: [deck]});
  assert.equal(w.road.cls, 'primary', 'with no other road the deck road still serves');
  assert.ok(w.under && w.pitch <= 3, `nearly level under the deck (${w.pitch})`);
  assert.deepEqual(overheadOf({class: 'transit', brunnel: 'bridge'}, deck.line)?.cls, 'transit');
  assert.deepEqual(overheadOf({class: 'path', brunnel: 'bridge'}, deck.line)?.cls, 'path', 'a skywalk');
  assert.deepEqual(overheadOf({class: 'motorway', brunnel: 'bridge'}, deck.line)?.cls, 'motorway');
  assert.equal(overheadOf({class: 'primary', brunnel: 'bridge'}, deck.line), null, 'a road bridge is the road itself');
  assert.equal(overheadOf({class: 'transit'}, deck.line), null, 'a line at grade is no deck');
});

test('the road the building fronts wins over a closer back lane, and a building in between moves the view', () => {
  const target = {rings: [box(-30, -20, 30, 20)], height: 20, point: ll([0, 0])};
  const main = road('primary', [[-300, -45], [300, -45]]), lane = road('minor', [[-300, 28], [300, 28]]);
  const v = streetViewView({target, roads: [main, lane]});
  assert.equal(v.road.cls, 'primary', 'primary 25 m away beats a lane 8 m away');
  assert.ok(angle(v.heading, 0) <= 1);
  // A building between the primary road and the venue: the view goes round to the secondary road on the east.
  const blocker = {outer: box(-25, -40, 25, -26)};
  const east = road('secondary', [[60, -300], [60, 300]]);
  const w = streetViewView({target, roads: [main, east], occluders: [blocker]});
  assert.equal(w.road.cls, 'secondary');
  assert.ok(angle(w.heading, 270) <= 1, `looks west from the east road (${w.heading})`);
  // The venue's own building drawn again from another source is never a blocker.
  const same = {outer: box(-30, -20, 30, 20)};
  assert.equal(streetViewView({target, roads: [main, east], occluders: [same]}).road.cls, 'primary');
});

test('roads no Street View car drives, roads under the building and far roads never count', () => {
  const target = {rings: [box(-20, -20, 20, 20)], height: 10, point: ll([0, 0])};
  const props = [{class: 'motorway'}, {class: 'primary', brunnel: 'bridge'}, {class: 'primary', brunnel: 'tunnel'}, {class: 'primary', ramp: 1},
    {class: 'service', service: 'parking_aisle'}, {class: 'path'}, {class: 'rail'}, {class: 'primary_construction'}, {class: 'minor', access: 'no'}];
  for (const p of props) assert.equal(roadOf(p, [ll([-100, -25]), ll([100, -25])]), null, JSON.stringify(p));
  assert.deepEqual(roadOf({class: 'service', service: 'alley'}, [ll([0, 0]), ll([1, 1])])?.cls, 'service');
  const through = road('minor', [[0, -100], [0, 100]]);
  assert.equal(streetViewView({target, roads: [through]}), null, 'a road under the building is not in front of it');
  const far = road('primary', [[-500, -20 - MAX_GAP_M - 5], [500, -20 - MAX_GAP_M - 5]]);
  assert.equal(streetViewView({target, roads: [far]}), null, `more than ${MAX_GAP_M} m from the facade`);
  // A long straight segment whose ends are far away still counts where it passes close by.
  const long = road('secondary', [[-3000, -30], [3000, -30]]);
  assert.equal(streetViewView({target, roads: [long]})?.road.cls, 'secondary');
});

test('a venue without a building: the view looks at its point; the URL keeps Google’s own angle without a view', () => {
  const v = streetViewView({target: {rings: [], point: ll([0, 0])}, roads: [road('minor', [[-100, 30], [100, 30]])]});
  assert.ok(angle(v.heading, 180) <= 1, 'looks south at the point');
  assert.equal(v.fov, 90);
  const url = streetViewURL(v);
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/@\?api=1&map_action=pano&viewpoint=13\.\d{6},100\.\d{6}&heading=\d+&pitch=\d+&fov=\d+$/);
  assert.equal(streetViewURL(null, ll([0, 0])), 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=13.745000,100.530000');
  assert.equal(streetViewURL(null, null), '');
  assert.equal(streetViewView({target: {}, roads: []}), null);
});

test('the building to face: design masses, then the checked footprint, then the building the pin stands in', () => {
  const f = (role, ring, extra = {}) => ({type: 'Feature', geometry: {type: 'Polygon', coordinates: [ring]}, properties: {geometry_role: role, ...extra}});
  const row = {lon: ll([0, 0])[0], lat: ll([0, 0])[1]};
  const pin = f('pin_building_basemap', box(-10, -10, 10, 10), {site_point: 0, height_m: 12});
  const site = f('pin_building_citymeter', box(50, 50, 150, 150), {site_point: 3, height_m: 30});
  const host = f('host_building_footprint_not_shop_unit', box(-15, -15, 15, 15), {height_m: null, display_height_m: 18});
  const mass = f('owner_model_mass', box(-40, -40, 40, 40), {height_m: 33});
  assert.equal(lookTarget(row, [pin, site]).height, 12, 'the pin’s own building, not the largest site building');
  assert.equal(lookTarget(row, [pin, site, host]).height, 18, 'the checked footprint wins');
  assert.equal(lookTarget(row, [pin, host, mass]).height, 33, 'the design masses win');
  assert.equal(lookTarget(row, [site]).height, 30, 'otherwise the largest drawn part');
  const none = lookTarget(row, []);
  assert.deepEqual(none.rings, []); assert.deepEqual(none.point, [row.lon, row.lat]);
  const b = lookBBox(lookTarget(row, [pin]), 100);
  near(xy([b[0], b[1]])[0], -110, 1, 'west edge'); near(xy([b[2], b[3]])[1], 110, 1, 'north edge');
});

test('AI Mode asks the ICP question about this exact place; Google Maps searches name and area', () => {
  const mall = venueQuestion({name: 'สามย่านมิตรทาวน์', group: groupById('mall'), where: 'เขตปทุมวัน กรุงเทพมหานคร', operator: 'สามย่าน มิตรทาวน์', status: 'supply'});
  assert.ok(mall.startsWith('สามย่านมิตรทาวน์ (ศูนย์การค้า เขตปทุมวัน กรุงเทพมหานคร บริหารโดย สามย่าน มิตรทาวน์)'), mall);
  assert.ok(mall.includes('ติดต่อเช่าพื้นที่') && mall.includes('ร้านหลัก') && mall.includes('ข่าวล่าสุด'));
  assert.ok(venueQuestion({name: 'ตลาดนัด', group: groupById('market'), where: 'อำเภอเมืองเชียงใหม่ เชียงใหม่'}).includes('เช่าแผง'));
  assert.ok(venueQuestion({name: 'เดอะ เซ็นทรัล', group: groupById('mall'), status: 'planned'}).includes('กำหนดเปิด'));
  assert.ok(venueQuestion({name: 'ห้างเก่า', group: groupById('mall'), status: 'closed'}).includes('ปิดเมื่อไร'));
  assert.ok(!venueQuestion({name: 'X', group: groupById('other')}).includes('อื่น ๆ'), 'no “อื่น ๆ” in a question');
  assert.equal(aiModeURL('ก ข'), 'https://www.google.com/search?udm=50&q=%E0%B8%81%20%E0%B8%82');
  assert.equal(mapsSearchURL('A B'), 'https://www.google.com/maps/search/?api=1&query=A%20B');
});

test('the venue panel links: AI Mode, Google Maps, then Street View only where the venue has a point', () => {
  const p = {row: {name: 'สยามสแควร์', status: 'supply', lon: 100.53284, lat: 13.74476, operatorLabel: ''}, group: groupById('community'),
    areaLabel: 'เขตปทุมวัน', province: {th: 'กรุงเทพมหานคร'}};
  const links = lookLinks(p, null);
  assert.deepEqual(links.map(l => l.id), ['ai', 'maps', 'streetview']);
  assert.deepEqual(links.map(l => l.label), ['ถาม AI Mode', 'เปิด Google Maps', 'ดู Street View']);
  assert.ok(links.every(l => l.href.startsWith('https://www.google.com/')));
  assert.ok(decodeURIComponent(links[1].href).endsWith('สยามสแควร์ เขตปทุมวัน กรุงเทพมหานคร'));
  assert.ok(!links[2].href.includes('heading='), 'no view yet: Google’s own angle');
  const view = {viewpoint: [100.5329, 13.7446], heading: 12, pitch: 9, fov: 80};
  assert.ok(lookLinks(p, view)[2].href.endsWith('&heading=12&pitch=9&fov=80'));
  const noPoint = lookLinks({...p, row: {...p.row, lon: null, lat: null}, areaLabel: '', province: null, addressProvince: 'จังหวัดเชียงใหม่'});
  assert.deepEqual(noPoint.map(l => l.id), ['ai', 'maps']);
  assert.ok(decodeURIComponent(noPoint[1].href).endsWith('สยามสแควร์ เชียงใหม่'), 'the address province without a point');
  for (const l of links) assert.ok(!/ไม่ใช่|ข้อจำกัด|caveat/.test(l.label + l.title), 'no caveat words');
});

test('the reader takes roads and buildings from the basemap tile round the building', async () => {
  const tile = lonLatToTile(O[0], O[1], 14);
  const units = p => lonLatToTileUnits(...ll(p), tile).map(Math.round);
  const bytes = encodeTile([
    {name: 'transportation', features: [
      {type: 2, properties: {class: 'primary'}, rings: [[units([-200, -40]), units([200, -40])]]},
      {type: 2, properties: {class: 'motorway'}, rings: [[units([-200, -25]), units([200, -25])]]},
      {type: 2, properties: {class: 'transit', brunnel: 'bridge'}, rings: [[units([-200, 60]), units([200, 60])]]},
    ]},
    {name: 'building', features: [{properties: {render_height: 20}, rings: [[units([-20, 20]), units([20, 20]), units([20, -20]), units([-20, -20]), units([-20, 20])]]}]},
  ]);
  let calls = 0;
  const reader = createLookReader({tileUrl: t => `https://tiles.test/${t.z}/${t.x}/${t.y}.pbf`, fetchImpl: async () => { calls++; return {ok: true, status: 200, arrayBuffer: async () => bytes}; }});
  const target = {rings: [box(-20, -20, 20, 20)], height: 20, point: ll([0, 0])};
  const {roads, overheads, buildings} = await reader.read(lookBBox(target, 60));
  assert.deepEqual(roads.map(r => r.cls), ['primary'], 'the motorway is left out');
  assert.deepEqual(overheads.map(r => r.cls), ['transit'], 'the viaduct is an overhead');
  assert.equal(buildings.length, 1);
  const v = streetViewView({target, roads, overheads, occluders: buildings});
  assert.equal(v.road.cls, 'primary'); assert.equal(v.blocked, false, 'the venue’s own building does not block');
  const before = calls;
  await reader.read(lookBBox(target, 60));
  assert.equal(calls, before, 'tiles are read once');
  assert.equal(roadsOfLayer(parseVectorTile(bytes).layers.transportation, tile).roads.length, 1);
});

test('the panel row: three capsules with icon and verb-led label, each opening Google in a new tab', async () => {
  const {lookBar} = await import('../js/panel.js');
  const p = {row: {name: 'S-OASIS', status: 'supply', lon: 100.5593553, lat: 13.8073321}, group: groupById('mall'), areaLabel: 'เขตจตุจักร', province: {th: 'กรุงเทพมหานคร'}};
  const html = lookBar(lookLinks(p, {viewpoint: [100.559, 13.8068], heading: 5, pitch: 12, fov: 70}));
  assert.match(html, /^<div class="venue-links look-links" role="group" aria-label="ดูต่อใน Google">/);
  const anchors = [...html.matchAll(/<a class="chip-link look-link" data-look="(\w+)" href="([^"]+)" target="_blank" rel="noopener noreferrer" title="[^"]+"><i class="pictogram pic-(\w+)" aria-hidden="true"><\/i>([^<]+)<span class="sr-only"> \(เปิดแท็บใหม่\)<\/span><\/a>/g)];
  assert.deepEqual(anchors.map(a => [a[1], a[3], a[4]]), [['ai', 'ai', 'ถาม AI Mode'], ['maps', 'maps', 'เปิด Google Maps'], ['streetview', 'streetview', 'ดู Street View']]);
  assert.ok(anchors[2][2].includes('heading=5&amp;pitch=12&amp;fov=70'), 'the view is in the link (escaped)');
  assert.equal(lookBar([]), '');
  const visible = html.replace(/<[^>]+>/g, ' ');
  assert.ok(!/ไม่ใช่|ยังไม่ตรวจภาคสนาม|ค่าประมาณจาก|วิธี:/.test(visible), 'no caveat on screen');
});

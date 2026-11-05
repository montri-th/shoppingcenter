// Research sites on hosted venues (js/buildings.js; owner 2026-11-05: Mega Bangna showed one building of a whole project).
import test from 'node:test';
import assert from 'node:assert/strict';
import {installVenueBuildings} from '../js/buildings.js';
import {buildingReading, siteLinkLabel} from '../js/panel.js';

function fakeMap() {
  const sources = {}, layers = new Set();
  return {
    addSource(id, spec) { sources[id] = {spec, data: spec.data, setData(d) { this.data = d; }}; },
    getSource: id => sources[id], addLayer(l) { layers.add(l.id); }, getLayer: id => layers.has(id),
    setLayoutProperty() {}, setPaintProperty() {}, on() {}, off() {}, getCanvas: () => ({style: {}}), sources,
  };
}
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const host = {type: 'Feature', geometry: {type: 'Polygon', coordinates: [square(100.5, 13.7, 100.501, 13.701)]},
  properties: {host_id: 'H1', venue_ids: ['V1'], render_as: 'extrusion', geometry_role: 'host_building_not_shop_unit', display_height_m: 20, display_base_m: 0}};
const pin = (i, ring, method) => ({type: 'Feature', geometry: {type: 'Polygon', coordinates: [ring]}, _ring: ring,
  properties: {host_id: `pin:V1:${i}`, venue_ids: ['V1'], geometry_role: 'pin_building_citymeter', render_as: 'extrusion', match_method: method, display_height_m: 12, display_base_m: 0}});

test('a hosted venue keeps its checked footprint and gains its site’s other buildings, never one twice', () => {
  const map = fakeMap();
  const b = installVenueBuildings(map, {type: 'FeatureCollection', features: [host]}, {rows: [{id: 'V1', countable: true}]});
  const inside = pin(0, square(100.5002, 13.7002, 100.5008, 13.7008), 'site');      // the host already draws it
  const outside = pin(1, square(100.502, 13.7, 100.503, 13.701), 'site');           // another building of the site
  const ownPin = pin(2, square(100.5001, 13.7001, 100.5009, 13.7009), 'inside');    // the pin's own building: host wins
  const cov = b.setPinFeatures([inside, outside, ownPin]);
  const drawn = map.sources['venue-buildings'].data.features.map(f => f.properties.host_id).sort();
  assert.deepEqual(drawn, ['H1', 'pin:V1:1']);
  assert.equal(cov.sitePartsOnHosts, 1);
  const site = {n: 2, points: [[100.5005, 13.7005], [100.5025, 13.7005]], source: 'ขอบเขตพื้นที่จาก OpenStreetMap', url: '', checkedOn: '2026-11-06'};
  const reading = buildingReading({hasBuilding: true}, b.displayedFeatures(), 'site', site);
  assert.match(reading.text, /ทั้งโครงการ 2 อาคาร/);
  assert.match(reading.note, /รูปทรงอาคารที่ตรวจแล้ว/);
  assert.match(buildingReading({hasBuilding: true}, b.displayedFeatures(), 'site', null).text, /อาคารของสถานที่/, 'no site → the host reading as before');
});

test('a venue without host geometry still draws its pin and site buildings as before', () => {
  const map = fakeMap();
  const b = installVenueBuildings(map, {type: 'FeatureCollection', features: []}, {rows: [{id: 'V1', countable: true}]});
  b.setPinFeatures([pin(0, square(100.5, 13.7, 100.501, 13.701), 'inside'), pin(1, square(100.502, 13.7, 100.503, 13.701), 'site')]);
  assert.equal(map.sources['venue-buildings'].data.features.length, 2);
});

test('the site evidence link says what it opens', () => {
  assert.equal(siteLinkLabel('https://www.openstreetmap.org/way/824156321'), 'ขอบเขตใน OpenStreetMap');
  assert.equal(siteLinkLabel('https://example.com/site-plan'), 'ผังโครงการ');
});

// Building masses from a venue's own design file (js/venue-models.js; owner 2026-11-06: PARC Bangna and LIVE Ramintra).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {modelFeatures, createVenueModels, boxMeets, MODEL_ROLE, MODEL_MIN_ZOOM} from '../js/venue-models.js';
import {installVenueBuildings, buildingHeightLabel} from '../js/buildings.js';
import {buildingReading} from '../js/panel.js';

function fakeMap() {
  const sources = {}, layers = new Set();
  return {
    addSource(id, spec) { sources[id] = {spec, data: spec.data, setData(d) { this.data = d; }}; },
    getSource: id => sources[id], addLayer(l) { layers.add(l.id); }, getLayer: id => layers.has(id),
    setLayoutProperty() {}, setPaintProperty() {}, on() {}, off() {}, getCanvas: () => ({style: {}}), sources,
  };
}
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const part = (ring, base, top) => ({type: 'Feature', geometry: {type: 'Polygon', coordinates: [ring]}, properties: {base_m: base, height_m: top}});
const doc = {type: 'FeatureCollection', features: [part(square(100.5, 13.7, 100.5005, 13.7005), 0, 12.4), part(square(100.5006, 13.7, 100.5008, 13.7002), 4.5, 5.2),
  part(square(100.5, 13.7, 100.5001, 13.7001), 6, 6), {type: 'Feature', geometry: {type: 'Point', coordinates: [100.5, 13.7]}, properties: {}}]};
const pin = (i, ring, method) => ({type: 'Feature', geometry: {type: 'Polygon', coordinates: [ring]}, _ring: ring,
  properties: {host_id: `pin:V1:${i}`, venue_ids: ['V1'], geometry_role: 'pin_building_citymeter', render_as: 'extrusion', match_method: method, display_height_m: 70, display_base_m: 0}});

test('a model file becomes extrusions with its own base and top; bad parts are left out, never repaired', () => {
  const fs = modelFeatures('V1', doc);
  assert.equal(fs.length, 2, 'a zero-height part and a point are dropped');
  assert.deepEqual(fs.map(f => [f.properties.display_base_m, f.properties.display_height_m]), [[0, 12.4], [4.5, 5.2]]);
  assert.ok(fs.every(f => f.properties.geometry_role === MODEL_ROLE && f.properties.render_as === 'extrusion' && f.properties.venue_ids[0] === 'V1'));
  assert.match(buildingHeightLabel(fs[1].properties), /มวลอาคารตามแบบ 4\.5–5\.2 ม\. · ไม่ใช่ผลรังวัด/);
});

test('the masses replace the venue’s pin and site buildings; other venues keep theirs', () => {
  const map = fakeMap();
  const b = installVenueBuildings(map, {type: 'FeatureCollection', features: []}, {rows: [{id: 'V1', countable: true}, {id: 'V2', countable: true}]});
  const other = {...pin(9, square(100.6, 13.7, 100.601, 13.701), 'inside'), properties: {...pin(9, square(100.6, 13.7, 100.601, 13.701), 'inside').properties, host_id: 'pin:V2:0', venue_ids: ['V2']}};
  b.setPinFeatures([pin(0, square(100.5001, 13.7001, 100.5003, 13.7003), 'inside'), pin(1, square(100.502, 13.7, 100.503, 13.701), 'site'), other]);
  assert.equal(map.sources['venue-buildings'].data.features.length, 3, 'before the model: two of V1, one of V2');
  const cov = b.setModelFeatures(modelFeatures('V1', doc));
  const drawn = map.sources['venue-buildings'].data.features.map(f => f.properties.host_id).sort();
  assert.deepEqual(drawn, ['model:V1:0', 'model:V1:1', 'pin:V2:0']);
  assert.equal(cov.modelVenues, 1); assert.equal(cov.modelParts, 2); assert.equal(cov.unmatchedRows, 0);
  // Hosts for the massing tiers: model parts carry no _ring, so they drop the tile buildings they overlap.
  assert.ok(b.displayedFeatures().filter(f => f.properties.geometry_role === MODEL_ROLE).every(f => !f._ring));
  const reading = buildingReading({hasBuilding: false}, b.displayedFeatures().filter(f => f.properties.venue_ids.includes('V1')), 'site',
    {n: 14, source: 'ขอบเขตพื้นที่จาก OpenStreetMap'}, {source: {fileDate: '2026-10-27', placement: 'วางตำแหน่งโดยเทียบกับภาพดาวเทียม'}});
  assert.match(reading.text, /^มวลอาคารตามแบบของโครงการ/);
  assert.match(reading.note, /2 ส่วน/); assert.match(reading.note, /ไม่ใช่ผลรังวัด/); assert.match(reading.note, /สูงสุดราว 12 ม\./);
  b.setModelFeatures([]);
  assert.equal(map.sources['venue-buildings'].data.features.length, 3, 'without the model the pins come back');
});

test('a venue’s file is fetched once, only from zoom 14 in view or when opened', async () => {
  const calls = [];
  const files = {
    'data/venue-models.json': {meta: {}, models: [{venue_id: 'V1', file: 'data/venue-models/V1.json', bbox: [100.5, 13.7, 100.501, 13.701]},
      {venue_id: 'BAD', file: 'https://example.com/x.json', bbox: [0, 0, 1, 1]}]},
    'data/venue-models/V1.json': doc,
  };
  const loaded = [];
  const m = createVenueModels({fetchJSON: async url => { calls.push(url); return files[url]; }, onLoad: id => loaded.push(id)});
  await m.loadIndex();
  assert.equal(m.has('V1'), true); assert.equal(m.has('BAD'), false, 'only files under data/venue-models/');
  const view = {_sw: {lng: 100.4995, lat: 13.6995}, _ne: {lng: 100.5015, lat: 13.7015}};
  assert.deepEqual(m.ensureInView(view, MODEL_MIN_ZOOM - 0.5), [], 'not below zoom 14');
  assert.deepEqual(m.ensureInView({_sw: {lng: 101, lat: 14}, _ne: {lng: 101.1, lat: 14.1}}, 16), [], 'not out of view');
  await Promise.all(m.ensureInView(view, 15));
  await m.ensure('V1');
  assert.deepEqual(calls, ['data/venue-models.json', 'data/venue-models/V1.json']);
  assert.deepEqual(loaded, [null, 'V1']);
  assert.equal(m.features().length, 2);
  assert.ok(boxMeets([0, 0, 1, 1], [[0.5, 0.5], [2, 2]]) && !boxMeets([0, 0, 1, 1], [[1.5, 1.5], [2, 2]]));
});

test('published model files: in data/venue-models/, small, the venue’s own id, design heights, no private links', () => {
  const index = JSON.parse(readFileSync(new URL('../data/venue-models.json', import.meta.url)));
  const venues = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url))).rows;
  const byId = new Map(venues.map(r => [r.id, r]));
  assert.ok(index.models.length >= 1);
  for (const e of index.models) {
    const r = byId.get(e.venue_id);
    assert.ok(r && Number.isFinite(r.lat), `${e.venue_id} is a venue with a point`);
    const text = readFileSync(new URL(`../${e.file}`, import.meta.url), 'utf8');
    assert.ok(text.length < 60000, `${e.file} stays light (${text.length} bytes)`);
    assert.doesNotMatch(text, /docs\.google\.com|drive\.google\.com|\.skp|[A-Z]:\\\\/, 'no private links, file names or local paths');
    const fs = modelFeatures(e.venue_id, JSON.parse(text));
    assert.equal(fs.length, e.parts);
    const kx = 111320 * Math.cos((r.lat * Math.PI) / 180);
    for (const f of fs) {
      assert.ok(f.properties.height_m > 0 && f.properties.height_m < 120);
      for (const [lon, lat] of f.geometry.coordinates[0]) assert.ok(Math.hypot((lon - r.lon) * kx, (lat - r.lat) * 110574) <= 600, 'every vertex within 600 m of the pin');
    }
  }
});

test('the placement spec decides what is published: held venues have no file, thin parts only as large slabs', () => {
  const index = JSON.parse(readFileSync(new URL('../data/venue-models.json', import.meta.url)));
  const spec = JSON.parse(readFileSync(new URL('../scripts/venue-model-placements.json', import.meta.url)));
  const listed = new Set(index.models.map(e => e.file.replace(/^data\/venue-models\//, '')));
  // A file left in data/venue-models/ is served by Pages even when the index no longer lists it.
  assert.deepEqual(readdirSync(new URL('../data/venue-models/', import.meta.url)).filter(f => !listed.has(f)), [], 'every published file is in the index');
  for (const [id, s] of Object.entries(spec.venues)) {
    const e = index.models.find(m => m.venue_id === id);
    if (s.publish === false) { assert.equal(e, undefined, `${id} is held (${s.hold})`); assert.ok(s.hold, `${id} says why it is held`); continue; }
    assert.ok(e, `${id} is published`);
    assert.deepEqual(e.source, s.source, `${id}: the index carries the spec's source`);
    const doc = JSON.parse(readFileSync(new URL(`../${e.file}`, import.meta.url)));
    const {min_thickness_m: thin = 0.5, thin_keep_area_m2: keep = Infinity} = s.placement;
    for (const f of doc.features) {
      const p = f.properties;
      assert.ok(p.height_m - p.base_m >= thin - 1e-9 || p.area_m2 >= keep, `${id}: a ${(p.height_m - p.base_m).toFixed(1)} m part of ${p.area_m2} m² is kept only as a large slab`);
    }
  }
});

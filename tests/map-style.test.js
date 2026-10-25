import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMapStyle, basemapPalette, SOURCE_ID, DATA_FILL_BEFORE, MASSING_BEFORE, FIRST_LINE_LAYER, FIRST_LABEL_LAYER} from '../js/map-style.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText} from '../js/breadcrumb.js';
import {presetFor, CAMERA, DEFAULT_FOV} from '../js/camera.js';
import {PROVINCES, provinceByCode} from '../js/model.js';

test('generated basemap is a well-formed MapLibre style with the anchor layers the app inserts before', () => {
  for (const theme of ['light', 'dark']) {
    const style = buildMapStyle(theme);
    assert.equal(style.version, 8);
    assert.ok(style.sources[SOURCE_ID]?.url, 'OpenFreeMap TileJSON source');
    assert.ok(style.glyphs.includes('{fontstack}'));
    const ids = style.layers.map(l => l.id);
    assert.equal(new Set(ids).size, ids.length, 'layer ids are unique');
    for (const l of style.layers) if (l.type !== 'background') { assert.equal(l.source, SOURCE_ID); assert.ok(l['source-layer'], `${l.id} names a source-layer`); }
    assert.ok(ids.includes(DATA_FILL_BEFORE) && ids.includes(MASSING_BEFORE));
    const firstLine = style.layers.find(l => l.type === 'line');
    assert.equal(firstLine.id, FIRST_LINE_LAYER, 'data fills sit beneath every line layer');
    const firstSymbol = style.layers.find(l => l.type === 'symbol');
    assert.equal(firstSymbol.id, FIRST_LABEL_LAYER, 'massing sits beneath every label');
    assert.ok(ids.indexOf('building') > ids.indexOf(FIRST_LINE_LAYER), '2D footprints draw above the data fill');
    assert.ok(style.sky && style.light, 'sky/fog quiets the distance; light shades the massing');
    assert.ok(!ids.some(id => /poi|housenumber|boundary/.test(id)), 'no POI, house numbers or admin boundaries');
  }
  const light = basemapPalette('light'), dark = basemapPalette('dark');
  assert.notEqual(light.ground, dark.ground);
  assert.equal(light.ground, '#EEF1EE', 'ground = LDS surface.alt (light)');
  assert.equal(dark.ground, '#11191D', 'ground = LDS surface.canvas (dark)');
});

test('breadcrumb mirrors production levels: ประเทศไทย › จังหวัด › เขต/อำเภอ with production codes', () => {
  assert.deepEqual(buildBreadcrumb({}).map(c => c.label), ['ประเทศไทย']);
  assert.deepEqual(buildBreadcrumb({province: 'PKT'}).map(c => c.label), ['ประเทศไทย', 'ภูเก็ต']);
  const pathumWan = {code: '1007', th: 'ปทุมวัน', province: 'BKK'};
  const crumbs = buildBreadcrumb({province: 'PKT', district: pathumWan});
  assert.deepEqual(crumbs.map(c => c.label), ['ประเทศไทย', 'กรุงเทพมหานคร', 'เขตปทุมวัน'], 'the district’s own province wins over a stale filter');
  assert.equal(crumbs[1].code, 'BKK');
  assert.equal(crumbs[2].id, '1007');
  assert.equal(crumbs.at(-1).current, true);
  assert.equal(breadcrumbText(crumbs), 'ประเทศไทย › กรุงเทพมหานคร › เขตปทุมวัน');
  const html = renderBreadcrumb(crumbs);
  assert.ok(html.includes('aria-current="location"') && html.includes('data-action="crumb-province"') && html.includes('data-id="BKK"'));
  // Outside Bangkok the level is อำเภอ.
  assert.equal(buildBreadcrumb({district: {code: '5001', th: 'เมืองเชียงใหม่', province: 'CMI'}}).at(-1).label, 'อำเภอเมืองเชียงใหม่');
  assert.equal(provinceByCode('cmi').th, 'เชียงใหม่');
  assert.equal(PROVINCES.length, 77);
  assert.equal(new Set(PROVINCES.map(p => p.code)).size, 77);
});

test('breadcrumb venue level: four levels with the venue id; a venue without a point keeps its address province; narrow screens fold the upper levels', () => {
  const pathumWan = {code: '1007', th: 'ปทุมวัน', province: 'BKK'};
  const paragon = {id: 'SC-001244', label: 'สยามพารากอน'};
  const four = buildBreadcrumb({district: pathumWan, venue: paragon});
  assert.deepEqual(four.map(c => c.level), ['country', 'province', 'district', 'venue']);
  assert.equal(breadcrumbText(four), 'ประเทศไทย › กรุงเทพมหานคร › เขตปทุมวัน › สยามพารากอน');
  assert.equal(four.at(-1).id, 'SC-001244');
  const unlocated = buildBreadcrumb({province: 'BKK', venue: {id: 'VN-x', label: 'Bangkok Mall'}});
  assert.deepEqual(unlocated.map(c => c.label), ['ประเทศไทย', 'กรุงเทพมหานคร', 'Bangkok Mall']);
  const html = renderBreadcrumb(four);
  assert.equal((html.match(/class="is-collapsible"/g) || []).length, 2);
  assert.ok(html.includes('crumb-ellipsis') && html.includes('data-action="crumb-expand"'));
  assert.ok(!html.includes('data-action="crumb-venue"'), 'the current venue is a label, not a link');
  assert.ok(!renderBreadcrumb(buildBreadcrumb({district: pathumWan})).includes('crumb-ellipsis'));
});

test('camera presets: 2D plan, 3D city overview, upright-vertical model close-up and two-point option', () => {
  assert.equal(presetFor({view3d: false, mode: 'detail'}), 'plan');
  assert.equal(presetFor({view3d: true, mode: 'overview'}), 'city');
  assert.equal(presetFor({view3d: true, mode: 'detail'}), 'model');
  assert.equal(presetFor({view3d: true, mode: 'detail', twoPoint: true}), 'eye');
  assert.equal(CAMERA.plan.pitch, 0);
  assert.ok(CAMERA.model.fov < DEFAULT_FOV / 2, 'narrow field of view ≈ axonometric');
  assert.ok(CAMERA.eye.pitch <= 90 - CAMERA.eye.fov / 2 - 2, 'two-point: the horizon stays outside the frame (MapLibre 5.6.2 draws fill-extrusion wrongly once it enters)');
  assert.ok(CAMERA.eye.pitch >= 72 && CAMERA.eye.fov <= 26, 'strongly pitched, narrow field of view → verticals near-parallel');
});

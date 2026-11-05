import test from 'node:test';
import assert from 'node:assert/strict';
import {terrarium, TERRAIN, hillshadePaint, stillScheduler, installTerrain, HILLSHADE_LAYER, TERRAIN_SOURCES, DEM_ATTRIBUTION} from '../js/terrain.js';
import {installDistrictLayers, FILL_MAX_ZOOM} from '../js/map-layers.js';

// Owner 2026-11-05 00:34: 3D building mass with terrain “ในรูปแบบเดียวกับ https://montri-th.github.io/hotel”.
test('terrarium decoding and the terrain-mode constants of CityMETER · Hotel: site scale only, exaggeration disclosed', () => {
  assert.equal(terrarium(128, 0, 0), 0);
  assert.equal(terrarium(129, 44, 128), 300.5);
  assert.ok(TERRAIN.minZoom >= 12 && TERRAIN.offZoom < TERRAIN.minZoom && TERRAIN.reliefOff < TERRAIN.reliefOn);
  assert.equal(TERRAIN.exaggeration, 1.5);
  assert.match(DEM_ATTRIBUTION, /SRTM/);
  const p = hillshadePaint({shadow: '#5F635A', highlight: '#F6F7F3', accent: '#7B877D'});
  assert.equal(p['hillshade-shadow-color'], '#5F635A');
  assert.equal(p['hillshade-exaggeration'], 0.55);
  assert.equal(hillshadePaint({dark: true})['hillshade-exaggeration'], 0.7);
});

test('the district fill switches off at TERRAIN.minZoom while terrain mode is on — a hard switch (layer zoom range), never a fade', () => {
  const ranges = {}, layers = new Map();
  const map = {
    getStyle: () => ({layers: [{id: 'water', type: 'fill'}, {id: 'road', type: 'line'}]}), getLayer: id => layers.get(id) || (id === 'water' ? {id} : undefined),
    addSource() {}, getSource: () => ({setData() {}}), addLayer(def) { layers.set(def.id, def); }, setLayoutProperty() {},
    setLayerZoomRange(id, min, max) { ranges[id] = [min, max]; }, on() {},
  };
  const dl = installDistrictLayers(map);
  dl.update({summaries: [], visible: true});
  assert.deepEqual(ranges['district-fill'], [0, FILL_MAX_ZOOM]);
  dl.update({summaries: [], visible: true, fillMaxZoom: TERRAIN.minZoom});
  assert.deepEqual(ranges['district-fill'], [0, TERRAIN.minZoom]);
  assert.deepEqual(ranges['district-outline'], [0, 24], 'outlines stay: they carry the reading over the relief');
  assert.equal(layers.get('district-fill').paint['fill-opacity'], 1, 'data colours keep their opacity');
});

test('terrain changes wait for a still camera (MapLibre 5.6.2 stops rendering when a terrain is set during an ease)', () => {
  const handlers = [];
  const map = {moving: true, isMoving() { return this.moving; }, once(e, h) { if (e === 'moveend') handlers.push(h); }};
  const ticks = [];
  const s = stillScheduler(map, {defer: fn => ticks.push(fn)});
  const ran = [];
  s.run('mode', () => ran.push('on'));
  s.run('refresh', () => ran.push('refresh'));
  s.run('mode', () => ran.push('off'));
  assert.deepEqual(ran, [], 'nothing while the camera moves');
  assert.deepEqual(s.pending, ['mode', 'refresh']);
  handlers.shift()();
  assert.deepEqual(ran, [], 'a tick after moveend');
  map.moving = false; ticks.shift()();
  assert.deepEqual(ran, ['off', 'refresh'], 'the last job per key wins');
});

test('installTerrain: the hillshade goes under the data fills (beforeId), 2D switches terrain off at once, dispose removes its layer and sources', () => {
  const layers = [], sources = new Map(), handlers = {};
  let terrain = null;
  const map = {
    getZoom: () => 15, isMoving: () => false, getBounds: () => ({getWest: () => 98.3, getSouth: () => 7.8, getEast: () => 98.4, getNorth: () => 7.9}),
    getLayer: id => layers.find(l => l.id === id), getSource: id => sources.get(id), addSource(id, def) { sources.set(id, def); }, removeSource(id) { sources.delete(id); },
    addLayer(def, before) { const i = before ? layers.findIndex(l => l.id === before) : -1; if (i >= 0) layers.splice(i, 0, def); else layers.push(def); },
    removeLayer(id) { layers.splice(layers.findIndex(l => l.id === id), 1); },
    setLayoutProperty(id, k, v) { const l = layers.find(x => x.id === id); if (l) (l.layout ||= {})[k] = v; }, setPaintProperty() {},
    setTerrain(t) { terrain = t; }, on(e, h) { (handlers[e] ||= []).push(h); }, off(e, h) { handlers[e] = (handlers[e] || []).filter(x => x !== h); }, once() {},
  };
  map.addLayer({id: 'province-fill'}); map.addLayer({id: 'district-fill'}); map.addLayer({id: 'water'});
  const changes = [];
  const t = installTerrain(map, {beforeId: 'province-fill', colors: {}, onChange: on => changes.push(on)});
  assert.equal(t.active(), false);
  assert.equal(map.getLayer(HILLSHADE_LAYER), undefined, 'nothing is added before terrain is first needed');
  t.setEnabled(false);
  assert.equal(terrain, null);
  t.dispose();
  assert.equal(sources.size, 0);
  assert.ok(TERRAIN_SOURCES.terrain && TERRAIN_SOURCES.hillshade);
  assert.deepEqual(changes, []);
});

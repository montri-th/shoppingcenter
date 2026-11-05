import test from 'node:test';
import assert from 'node:assert/strict';
import {landAfterEase, guardElevationFreeze, guardRetainedTiles, padOverscaledChildren, GUARDED_VERSION} from '../js/maplibre-guard.js';
import {MAP_VERSION} from '../js/vendors.js';

// The parts of MapLibre 5.6.2 the bug lives in: OverscaledTileID.children and the child-cover check of
// SourceCache._updateRetainedTiles (src/tile/tile_id.ts, src/source/source_cache.ts at v5.6.2).
function fakeMapLibre() {
  class TileID {
    constructor(overscaledZ, wrap, z, x, y) { this.overscaledZ = overscaledZ; this.wrap = wrap; this.canonical = {z, x, y}; this.key = `${overscaledZ}/${wrap}/${z}/${x}/${y}`; }
    children(sourceMaxZoom) {
      if (this.overscaledZ >= sourceMaxZoom) return [new TileID(this.overscaledZ + 1, this.wrap, this.canonical.z, this.canonical.x, this.canonical.y)];
      const z = this.canonical.z + 1, x = this.canonical.x * 2, y = this.canonical.y * 2;
      return [new TileID(z, this.wrap, z, x, y), new TileID(z, this.wrap, z, x + 1, y), new TileID(z, this.wrap, z, x, y + 1), new TileID(z, this.wrap, z, x + 1, y + 1)];
    }
  }
  class SourceCache {
    constructor(maxzoom, loadedKeys = []) { this._source = {maxzoom}; this.loadedKeys = loadedKeys; }
    _updateRetainedTiles(idealTileIDs, zoom) {
      const retain = {}, covered = [];
      for (const k of this.loadedKeys) retain[k] = true;
      for (const id of idealTileIDs) retain[id.key] = id;
      for (const id of idealTileIDs) {
        if (zoom + 1 > this._source.maxzoom) {
          const child = id.children(this._source.maxzoom)[0];
          if (retain[child.key]) covered.push(id.key);
          continue;
        }
        const children = id.children(this._source.maxzoom);
        if (retain[children[0].key] && retain[children[1].key] && retain[children[2].key] && retain[children[3].key]) covered.push(id.key);
      }
      return {retain, covered};
    }
  }
  return {TileID, SourceCache};
}

test('the guarded version is the pinned MapLibre: re-check the guard before upgrading', () => {
  assert.equal(GUARDED_VERSION, MAP_VERSION);
});

test('MapLibre 5.6.2: an ideal tile at the source maxzoom with its overscaled child retained throws (the live error)', () => {
  const {TileID, SourceCache} = fakeMapLibre();
  // Vector source maxzoom 14, camera cover zoom 13 (camera 13.79 at pitch 75): a near ideal tile is already at 14.
  const near = new TileID(14, 0, 14, 12768, 7561);
  const cache = new SourceCache(14, [near.children(14)[0].key]);
  assert.throws(() => cache._updateRetainedTiles([near], 13), /reading 'key'/);
});

test('guardRetainedTiles: the same frame no longer throws and reads as the overzoom branch; other tiles are untouched', () => {
  const {TileID, SourceCache} = fakeMapLibre();
  const near = new TileID(14, 0, 14, 12768, 7561);
  const far = new TileID(13, 0, 13, 6384, 3780);
  const cache = new SourceCache(14, [near.children(14)[0].key]);
  const map = {style: {sourceCaches: {openmaptiles: cache, areas: new SourceCache(24)}}};
  assert.equal(guardRetainedTiles(map, '5.6.2'), true);
  const {covered} = cache._updateRetainedTiles([near, far], 13);
  assert.deepEqual(covered, [near.key], 'covered by its retained overscaled child; the z13 tile still needs its four children');
  assert.equal(far.children(14).length, 4, 'tiles below the source maxzoom keep their four distinct children');
  assert.deepEqual(new Set(near.children(14).map(c => c.key)).size, 1);
  // Not retained → not covered (MapLibre then ascends to the parents).
  const fresh = new SourceCache(14);
  assert.deepEqual(fresh._updateRetainedTiles([new TileID(14, 0, 14, 1, 1)], 13).covered, []);
  // Installed once on the shared prototype.
  assert.equal(guardRetainedTiles(map, '5.6.2'), true);
  assert.equal(Object.getPrototypeOf(cache).__citymeterRetainGuard, true);
});

test('guardRetainedTiles stays off for another MapLibre version or unknown internals', () => {
  const {SourceCache} = fakeMapLibre();
  const original = SourceCache.prototype._updateRetainedTiles;
  assert.equal(guardRetainedTiles({style: {sourceCaches: {a: new SourceCache(14)}}}, '5.7.0'), false);
  assert.equal(SourceCache.prototype._updateRetainedTiles, original);
  assert.equal(guardRetainedTiles({style: {}}, '5.6.2'), false);
  assert.equal(guardRetainedTiles(null, '5.6.2'), false);
});

test('padOverscaledChildren touches only ideal tiles at or above maxzoom while the cover zoom is below it', () => {
  const {TileID} = fakeMapLibre();
  const at = new TileID(14, 0, 14, 5, 5), below = new TileID(13, 0, 13, 2, 2);
  assert.equal(padOverscaledChildren([at, below], 13, 14), 1);
  assert.equal(at.children(14).length, 4);
  assert.equal(padOverscaledChildren([at], 13, 14), 0, 'already wrapped');
  const later = new TileID(15, 0, 14, 5, 5);
  assert.equal(padOverscaledChildren([later], 14, 14), 0, 'cover zoom at maxzoom: MapLibre takes its overzoom branch');
  assert.equal(padOverscaledChildren([later], 13, undefined), 0);
});

test('guard 2: a programmatic ease on terrain ends with the centre landed on the ground (freeze cleared before moveend); gestures and other versions untouched', () => {
  const events = [];
  const tr = {center: {lng: 98.41, lat: 7.8}, tileZoom: 15, elevation: 80.97, setElevation(e) { this.elevation = e; }};
  const map = {terrain: {getElevationForLngLatZoom: () => 62.41}, transform: tr, _elevationFreeze: true, handlers: {_terrainMovement: false},
    getCenterClampedToGround: () => true, triggerRepaint() { events.push('repaint'); },
    _afterEase(eventData, easeId) { events.push(['moveend', this.transform.elevation, this._elevationFreeze]); }};
  assert.equal(guardElevationFreeze(map, '5.7.0'), false, 'another version: off');
  assert.equal(guardElevationFreeze(map, '5.6.2'), true);
  assert.equal(guardElevationFreeze(map, '5.6.2'), true, 'installed once');
  map._afterEase({}, undefined);
  assert.deepEqual(events.at(-1), ['moveend', 62.41, false], 'landed and unfrozen before moveend');
  // A gesture owns the freeze; an ease stopped for another with the same id fires nothing.
  map._elevationFreeze = true; map.transform.elevation = 70; map.handlers._terrainMovement = true;
  assert.equal(landAfterEase(map), false); assert.equal(map.transform.elevation, 70);
  map.handlers._terrainMovement = false; map._easeId = 'x';
  map._afterEase({}, 'x');
  assert.equal(map.transform.elevation, 70, 'same-id stop: left to the next ease');
  assert.equal(landAfterEase({terrain: null}), false, 'no terrain: nothing to land');
});

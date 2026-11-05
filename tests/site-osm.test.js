import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeTile} from './mvt-encode.js';
import {createOsmReader} from '../scripts/site-osm.mjs';
import {TILEJSON_URL} from '../js/map-style.js';

// Four building rings of the OpenFreeMap `building` layer, tile 14/12773/7565 (build 20261101_080013_pt), read in the
// live page on 5 Nov 2026: the bus-depot buildings north of Topgolf Megacity and the curved Topgolf roof, which
// CityMETER Building V4 does not have. © OpenStreetMap contributors.
const RINGS = [
  [[3517, 213], [3492, 213], [3492, 237], [3435, 237], [3435, 235], [3431, 235], [3431, 227], [3400, 227], [3400, 212], [3405, 212], [3404, 160], [3518, 162], [3517, 213]],
  [[3434, 240], [3407, 239], [3406, 279], [3409, 279], [3409, 299], [3399, 299], [3400, 230], [3431, 230], [3431, 235], [3434, 235], [3434, 240]],
  [[3407, 239], [3439, 240], [3438, 280], [3406, 279], [3407, 239]],
  [[3418, 443], [3440, 422], [3447, 429], [3454, 424], [3467, 439], [3473, 436], [3516, 482], [3542, 502], [3572, 516], [3610, 529], [3634, 534], [3632, 558],
    [3594, 548], [3591, 554], [3582, 550], [3569, 569], [3560, 564], [3558, 567], [3534, 569], [3519, 559], [3522, 547], [3499, 526], [3473, 505], [3439, 472],
    [3443, 469], [3418, 443]],
];

function fakeFetch(calls) {
  const tile = encodeTile([{name: 'building', features: [{properties: {render_height: 5, render_min_height: 0}, rings: RINGS}]}]);
  return async url => {
    calls.push(url);
    if (url === TILEJSON_URL) return {ok: true, status: 200, json: async () => ({tiles: ['https://tiles.test/x/{z}/{x}/{y}.pbf']})};
    if (url === 'https://tiles.test/x/14/12773/7565.pbf') return {ok: true, status: 200, arrayBuffer: async () => tile};
    return {ok: false, status: 204};
  };
}

test('OpenStreetMap buildings are read from the map tiles with the map decoder', async () => {
  const calls = [];
  const osmBuildingAt = createOsmReader({fetchImpl: fakeFetch(calls)});
  const roof = await osmBuildingAt([100.675621, 13.643337]);   // the Topgolf roof (CityMETER has no building here)
  assert.ok(roof && roof.areaM2 > 3300 && roof.areaM2 < 3600, `roof ${roof?.areaM2}`);
  const depot = await osmBuildingAt([100.675228, 13.644870]);  // the largest bus-depot building
  assert.ok(depot && depot.areaM2 > 2400 && depot.areaM2 < 2800, `depot ${depot?.areaM2}`);
  assert.equal(await osmBuildingAt([100.6765, 13.6445]), null, 'open ground');
  assert.equal(calls.filter(u => u === TILEJSON_URL).length, 1, 'TileJSON read once');
  assert.equal(calls.filter(u => u.endsWith('/14/12773/7565.pbf')).length, 1, 'tile read once');
});

test('a tile that cannot be read is an error, not an empty answer', async () => {
  const osmBuildingAt = createOsmReader({fetchImpl: async url => (url === TILEJSON_URL ? {ok: true, status: 200, json: async () => ({tiles: ['https://tiles.test/{z}/{x}/{y}.pbf']})} : {ok: false, status: 503})});
  await assert.rejects(() => osmBuildingAt([100.675621, 13.643337]), /HTTP 503/);
  const noTiles = createOsmReader({fetchImpl: async () => ({ok: true, status: 200, json: async () => ({})})});
  await assert.rejects(() => noTiles([100.675621, 13.643337]), /no tiles/);
});

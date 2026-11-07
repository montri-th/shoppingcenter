// Rail stations of CityMETER · Transit (D33): operating stations only, pinned to a Transit commit and file SHA-256; the
// nearest station of each located venue by straight line; the station view's radius; pending dots follow the type filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseStations, attachNearestStations, nearRail, rowsNearStation, distanceM, stationCollection, STATION_RADIUS_M, RAIL_REACH_M} from '../js/stations.js';
import {pendingFeatures, pendingCount} from '../js/venue-points.js';
import {GROUP_SETS, groupMatches, groupLabel, DEFAULT_GROUP} from '../js/model.js';

const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const doc = read('data/stations.json');
const stations = parseStations(doc);

test('stations file: operating stations of CityMETER · Transit, pinned commit and file hash, compact rows', () => {
  assert.equal(doc.meta.source, 'https://github.com/montri-th/transit');
  assert.match(doc.meta.commit, /^[0-9a-f]{40}$/);
  assert.match(doc.meta.sha256, /^[0-9a-f]{64}$/);
  assert.match(doc.meta.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(doc.meta.release);
  assert.match(doc.meta.rule, /operating only/);
  assert.equal(stations.length, doc.stations.length, 'every row parses');
  assert.ok(stations.length > 100);
  assert.equal(new Set(stations.map(s => s.id)).size, stations.length, 'ids are unique');
  assert.ok(stations.every(s => s.lat > 13 && s.lat < 14.6 && s.lon > 100 && s.lon < 101.2), 'Bangkok and its vicinity');
  assert.ok(stations.every(s => s.name && s.lines));
  assert.equal(stationCollection(stations).features.length, stations.length);
  assert.deepEqual(parseStations({fields: ['id'], stations: [['x']]}), [], 'a file without points gives no stations');
  assert.deepEqual(parseStations(null), []);
});

test('distance is a straight line (haversine); nearest station within reach; a row without a point never gets one', () => {
  assert.ok(Math.abs(distanceM(13, 100, 14, 100) - 111195) < 5, 'one degree of latitude');
  assert.equal(distanceM(13.7, 100.5, 13.71, 100.51), distanceM(13.71, 100.51, 13.7, 100.5));
  const s = stations[0];
  const dLat = m => m / 111195;
  const rows = [
    {id: 'at', located: true, lat: s.lat, lon: s.lon},
    {id: 'near', located: true, lat: s.lat + dLat(400), lon: s.lon},
    {id: 'none', located: true, lat: 13.0, lon: 99.0},
    {id: 'unlocated', located: false, lat: s.lat, lon: s.lon},
  ];
  const n = attachNearestStations(rows, stations);
  assert.equal(n, 2);
  assert.equal(rows[0].rail.station.id, s.id);
  assert.ok(rows[0].rail.m < 1);
  assert.ok(rows[1].rail.m <= 400.5 && nearRail(rows[1]));
  assert.equal(rows[2].rail, null, `no station within ${RAIL_REACH_M} m`);
  assert.equal(rows[3].rail, null);
  assert.equal(nearRail(rows[3]), false);
  // the grid lookup finds the same station as a full scan
  const probe = {id: 'p', located: true, lat: 13.7466, lon: 100.5393};
  attachNearestStations([probe], stations);
  const best = stations.map(x => ({x, m: distanceM(probe.lat, probe.lon, x.lat, x.lon)})).sort((a, b) => a.m - b.m)[0];
  assert.equal(probe.rail.station.id, best.x.id);
});

test('station view: located rows within the radius, nearest first; the radius is 500 m', () => {
  assert.equal(STATION_RADIUS_M, 500);
  const s = stations[0];
  const rows = [300, 100, 499, 501, 2000].map((m, i) => ({id: `r${i}`, name: `r${i}`, located: true, lat: s.lat + m / 111195, lon: s.lon}));
  const near = rowsNearStation(rows, s);
  assert.deepEqual(near.map(x => x.row.id), ['r1', 'r0', 'r2']);
  assert.ok(near.every((x, i) => i === 0 || near[i - 1].m <= x.m));
  assert.deepEqual(rowsNearStation(rows, null), []);
});

test('type sets (D33): centres = shopping centres, community malls and outlets; the first view reads them', () => {
  assert.equal(DEFAULT_GROUP, 'centres');
  assert.deepEqual([...GROUP_SETS.centres.ids], ['mall', 'community', 'outlet']);
  assert.ok(groupMatches('centres', {group: 'outlet'}) && !groupMatches('centres', {group: 'market'}));
  assert.ok(groupMatches('', {group: 'fuel'}) && groupMatches('market', {group: 'market'}) && !groupMatches('market', {group: 'mall'}));
  assert.equal(groupLabel('centres'), 'ศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ต');
  assert.equal(groupLabel(''), '');
});

test('pending dots follow the type filter and keep their index in the pending file', () => {
  const pending = read('data/pending.json');
  const all = pendingFeatures(pending);
  assert.equal(all.features.length, pending.rows.length);
  const centres = pendingFeatures(pending, 'centres');
  assert.equal(centres.features.length, pendingCount(pending, 'centres'));
  assert.ok(centres.features.length < all.features.length);
  for (const f of centres.features) {
    const r = pending.rows[f.properties.i];
    assert.equal(r[0], f.properties.id, 'the index points at the same record');
    assert.ok(GROUP_SETS.centres.ids.includes(r[6]));
  }
  assert.equal(pendingCount(pending, ''), pending.rows.length);
  assert.equal(pendingCount(null, 'centres'), 0);
});

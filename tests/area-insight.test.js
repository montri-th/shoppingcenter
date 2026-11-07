// First Aha (owner decision D1): recomputed in JS and cross-checked against the independent
// Python computation the pipeline stores in meta.checks.aha.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterVenues, hasPoint, prepareRows, GROUP_SETS, DEFAULT_GROUP} from '../js/model.js';
import {parseStations, attachNearestStations, nearRail} from '../js/stations.js';
import {indexDistricts, summarizeDistricts, districtsInScope, provinceArea} from '../js/areas.js';
import {summarizeAreaInsight, filterDistrictRows, AHA_SIZE} from '../js/area-insight.js';

const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const venues = read('data/venues.json');
const districts = indexDistricts(read('data/districts.geojson'));
const supply = filterVenues(venues.rows, {});

test('default Aha equals the pipeline’s independent computation (meta.checks.aha)', () => {
  const aha = summarizeAreaInsight(supply, districts);
  const expected = venues.meta.checks.aha;
  assert.equal(aha.province, expected.province);
  assert.deepEqual(aha.districtIds, expected.districts);
  assert.equal(aha.count, expected.count);
  assert.equal(aha.total, expected.total);
  assert.ok(Math.abs(aha.areaKm2 - expected.areaKm2) < 0.01);
  assert.ok(Math.abs(aha.provinceAreaKm2 - expected.provinceAreaKm2) < 0.01);
  assert.ok(Math.abs(aha.share - (expected.count / expected.total) * 100) < 1e-9);
});

test('Aha invariants: three densest districts of one province, disjoint, numerator ≤ denominator', () => {
  const aha = summarizeAreaInsight(supply, districts);
  assert.ok(aha.districts.length <= AHA_SIZE && aha.districts.length > 0);
  assert.ok(aha.districts.every(d => d.province === aha.province));
  for (let i = 1; i < aha.districts.length; i++) assert.ok(aha.districts[i - 1].density >= aha.districts[i].density);
  const inProvince = summarizeDistricts(supply, districtsInScope(districts, aha.province)).filter(d => d.count > 0);
  const best = Math.max(...inProvince.map(d => d.density));
  assert.equal(aha.districts[0].density, best, 'the first district is the densest of its province');
  const nationwide = summarizeDistricts(supply, districtsInScope(districts)).filter(d => d.count > 0);
  assert.equal(Math.max(...nationwide.map(d => d.density)), best, 'and the densest of the country');
  assert.ok(aha.count <= aha.total && aha.areaKm2 < aha.provinceAreaKm2);
  const members = filterDistrictRows(supply, new Set(aha.districtIds));
  assert.equal(members.length, aha.count);
  assert.equal(aha.total, supply.filter(r => hasPoint(r) && r.provinceCode === aha.province).length);
  assert.ok(Math.abs(provinceArea(districts, aha.province) - aha.provinceAreaKm2) < 1e-9);
});

test('filters recompute the Aha; a chosen province is read directly; empty input is empty', () => {
  const markets = filterVenues(venues.rows, {group: 'market'});
  const m = summarizeAreaInsight(markets, districts);
  assert.ok(m.total <= markets.length && m.districts.every(d => d.count > 0));
  const cmi = summarizeAreaInsight(supply, districts, {province: 'CMI'});
  assert.equal(cmi.province, 'CMI');
  assert.ok(cmi.districts.every(d => d.province === 'CMI'));
  const none = summarizeAreaInsight([], districts);
  assert.deepEqual(none.districts, []);
  assert.equal(none.share, 0);
  assert.equal(summarizeAreaInsight(supply, new Map()).count, 0);
});

test('rows without a selected point never acquire an area', () => {
  const unlocated = supply.filter(r => !hasPoint(r));
  assert.ok(unlocated.length > 0);
  const aha = summarizeAreaInsight(unlocated, districts);
  assert.equal(aha.count, 0);
  assert.deepEqual(filterDistrictRows(unlocated, new Set([...districts.keys()])), []);
});

// D33 (owner 2026-11-07 11:56, option ข): the first view reads shopping centres, community malls and outlets, ranks
// districts by count and adds the share within 500 m of an operating rail station (CityMETER · Transit).
test('D33 first view equals the pipeline’s independent computation (meta.checks.firstView)', () => {
  const expected = venues.meta.checks.firstView;
  assert.ok(expected, 'scripts/build-data.py writes meta.checks.firstView');
  const stations = parseStations(read('data/stations.json'));
  const rows = prepareRows(venues.rows.map(r => ({...r})));
  attachNearestStations(rows, stations);
  const centres = filterVenues(rows, {group: DEFAULT_GROUP});
  assert.deepEqual(GROUP_SETS[DEFAULT_GROUP].ids, expected.groups);
  const aha = summarizeAreaInsight(centres, districts, {rank: 'count', near: r => nearRail(r, expected.rail.radiusM)});
  assert.equal(aha.province, expected.province);
  assert.deepEqual(aha.districtIds, expected.districts);
  assert.deepEqual(Object.fromEntries(aha.districts.map(d => [d.code, d.count])), expected.counts);
  assert.equal(aha.count, expected.count);
  assert.equal(aha.total, expected.total);
  assert.ok(Math.abs(aha.areaKm2 - expected.areaKm2) < 0.01);
  assert.deepEqual(aha.rail, {focus: {near: expected.rail.focusNear, total: expected.rail.focusTotal}, rest: {near: expected.rail.restNear, total: expected.rail.restTotal}});
  const meta = read('data/stations.json').meta;
  assert.equal(expected.stations.sha256, meta.sha256, 'the check used the stations file the page reads');
});

test('D33 invariants: the most centres first, ties by density, one province; the rail line counts located rows only', () => {
  const stations = parseStations(read('data/stations.json'));
  const rows = prepareRows(venues.rows.map(r => ({...r})));
  attachNearestStations(rows, stations);
  const centres = filterVenues(rows, {group: DEFAULT_GROUP});
  assert.ok(centres.every(r => GROUP_SETS.centres.ids.includes(r.group)));
  const aha = summarizeAreaInsight(centres, districts, {rank: 'count', near: r => nearRail(r)});
  for (let i = 1; i < aha.districts.length; i++) assert.ok(aha.districts[i - 1].count >= aha.districts[i].count);
  const nationwide = summarizeDistricts(centres, districtsInScope(districts)).filter(d => d.count > 0);
  assert.equal(aha.districts[0].count, Math.max(...nationwide.map(d => d.count)), 'the first district has the most centres in the country');
  assert.ok(aha.districts.every(d => d.province === aha.province));
  assert.equal(aha.rail.focus.total, aha.count);
  assert.equal(aha.rail.focus.total + aha.rail.rest.total, aha.total);
  assert.ok(aha.rail.focus.near <= aha.rail.focus.total && aha.rail.rest.near <= aha.rail.rest.total);
  // without stations there is no rail line; a row without a point never counts as near
  assert.equal(summarizeAreaInsight(centres, districts, {rank: 'count'}).rail, null);
  const unlocated = rows.filter(r => !hasPoint(r));
  assert.ok(unlocated.every(r => r.rail === null && !nearRail(r)));
});

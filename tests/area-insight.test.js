// First Aha (owner decision D1): recomputed in JS and cross-checked against the independent
// Python computation the pipeline stores in meta.checks.aha.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterVenues, hasPoint} from '../js/model.js';
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

// Chart models behind the amCharts views, and the vendored library's licence terms.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {rankModel, mixModel, operatorModel, AMCHARTS} from '../js/charts.js';

const areas = [
  {id: 'a', name: 'ก', count: 10, density: 2, areaKm2: 5, fill: '#111111', groups: {mall: 4, market: 6}},
  {id: 'b', name: 'ข', count: 4, density: 4, areaKm2: 1, fill: '#222222', groups: {mall: 4}},
  {id: 'c', name: 'ค', count: 0, density: 0, areaKm2: 3, fill: '#333333', groups: {}},
];

test('rank view: districts by venues per km² (switchable to count), provinces by count, zeros left out', () => {
  assert.deepEqual(rankModel(areas, {kind: 'district'}).map(r => r.id), ['b', 'a']);
  assert.deepEqual(rankModel(areas, {kind: 'district', by: 'count'}).map(r => r.id), ['a', 'b']);
  assert.deepEqual(rankModel(areas, {kind: 'province'}).map(r => r.id), ['a', 'b']);
  const [top] = rankModel(areas, {kind: 'district'});
  assert.equal(top.rank, 1);
  assert.equal(top.fill, '#222222', 'bar colour is the map colour of that area');
  assert.match(top.valueText, /แห่ง\/ตร\.กม\./);
});

test('mix view: one row per area with a count per present group', () => {
  const m = mixModel(areas, {kind: 'district'});
  assert.deepEqual(m.groups.map(g => g.id).sort(), ['mall', 'market']);
  for (const r of m.rows) assert.equal(m.groups.reduce((s, g) => s + r[g.id], 0), r.total);
});

test('operator view: count shares of the scope add up, only grouped operators filter', () => {
  const rows = operatorModel([{id: 'cpn', label: 'Central Pattana', count: 5, grouped: true}, {id: 'x', label: 'บริษัท ก', count: 2, grouped: false}], 10);
  assert.equal(rows.reduce((s, r) => s + r.share, 0), 1);
  assert.equal(rows[0].id, 'cpn');
  assert.equal(rows[1].id, '', 'a single named operator is read, not filtered');
  assert.equal(rows.at(-1).label, 'ยังไม่ระบุผู้บริหาร');
});

test('amCharts is self-hosted with its licence, and the branding is never removed', () => {
  const bundle = new URL(`../${AMCHARTS.module}`, import.meta.url);
  assert.ok(existsSync(bundle));
  assert.ok(existsSync(new URL(`../${AMCHARTS.license}`, import.meta.url)));
  assert.match(readFileSync(bundle, 'utf8').slice(0, 400), /amCharts 5 v5\.20\.8/);
  const source = readFileSync(new URL('../js/charts.js', import.meta.url), 'utf8');
  assert.ok(!/addLicense|_logo\.dispose|logo\.set\(\s*["']forceHidden/.test(source), 'no licence key, logo kept');
});

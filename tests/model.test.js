import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GROUPS, PROVINCES, provinceByCode, provinceByThai, rowProvince, filterVenues, summarize, operatorRanking, normalizeText, prepareRows, hasPoint, districtWord} from '../js/model.js';
import {CUE_PATHS} from '../js/cues.js';

const venues = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url), 'utf8'));
const rows = prepareRows(venues.rows.map(r => ({...r})));

test('groups: eight ids in legend order, LDS series without the orange/gold entries, every cue drawable', () => {
  assert.deepEqual(GROUPS.map(g => g.id), ['mall', 'community', 'market', 'hoststore', 'component', 'outlet', 'fuel', 'other']);
  assert.equal(new Set(GROUPS.map(g => g.series)).size, GROUPS.length);
  assert.ok(GROUPS.every(g => ![2, 3].includes(g.series)), 'no apricot/yellow pins on the orange choropleth');
  assert.ok(GROUPS.every(g => CUE_PATHS[g.cue]));
  const lds = {1: 'circle', 4: 'diamond', 5: 'cross', 6: 'star', 7: 'hexagon', 8: 'ring', 9: 'dash', 10: 'plus'};
  for (const g of GROUPS) assert.equal(g.cue, lds[g.series], `${g.id} keeps the LDS cue of series ${g.series}`);
});

test('provinces: 77 production codes, lookups by code and by Thai address name', () => {
  assert.equal(PROVINCES.length, 77);
  assert.equal(provinceByCode('bkk').th, 'กรุงเทพมหานคร');
  assert.equal(provinceByThai('จังหวัดเชียงใหม่').code, 'CMI');
  assert.equal(provinceByThai('Nowhere'), null);
  assert.equal(districtWord('BKK'), 'เขต');
  assert.equal(districtWord('CMI'), 'อำเภอ');
});

test('filterVenues: countable only; default = supply; planned/closed/all; group, operator, province, search', () => {
  const countable = rows.filter(r => r.countable);
  assert.ok(filterVenues(rows, {}).every(r => r.countable && r.status === 'supply'));
  assert.equal(filterVenues(rows, {status: 'all'}).length, countable.length);
  assert.ok(filterVenues(rows, {status: 'planned'}).every(r => r.status === 'planned'));
  assert.ok(filterVenues(rows, {status: 'closed'}).every(r => r.status === 'closed'));
  assert.ok(filterVenues(rows, {group: 'mall'}).every(r => r.group === 'mall'));
  assert.ok(filterVenues(rows, {operator: 'central-pattana'}).every(r => r.operatorGroup === 'central-pattana'));
  assert.ok(filterVenues(rows, {operator: '__none__'}).every(r => !r.operatorGroup));
  assert.ok(filterVenues(rows, {operator: '__other__'}).every(r => r.operatorGroup === 'other'));
  const bkk = filterVenues(rows, {province: 'BKK'});
  assert.ok(bkk.length > 0 && bkk.every(r => rowProvince(r) === 'BKK'));
  assert.ok(bkk.some(r => !hasPoint(r)), 'unlocated venues join a province by their written address');
  const paragon = filterVenues(rows, {search: 'สยาม พารากอน'});
  assert.ok(paragon.some(r => r.id === 'SC-001244'), 'search ignores spaces');
  assert.ok(filterVenues(rows, {search: 'sc-001244'}).some(r => r.id === 'SC-001244'), 'search by id, case-insensitive');
  assert.ok(!rows.some(r => !r.countable && filterVenues([r], {status: 'all'}).length), 'components never enter a count');
});

test('summaries: missing operator is not an operator; operator ranking sums to known operators', () => {
  const supply = filterVenues(rows, {});
  const s = summarize(supply);
  assert.equal(s.venues, supply.length);
  assert.equal(s.located + s.unlocated, s.venues);
  assert.equal(s.groups.reduce((n, g) => n + g.count, 0), s.venues);
  const ranking = operatorRanking(supply);
  assert.equal(ranking.reduce((n, o) => n + o.count, 0), s.operatorKnown);
  assert.equal(ranking.length, s.operators);
  for (let i = 1; i < ranking.length; i++) assert.ok(ranking[i - 1].count >= ranking[i].count);
});

test('normalizeText folds case, width and separators', () => {
  assert.equal(normalizeText('  Central  World '), 'centralworld');
  assert.equal(normalizeText('ICONSIAM'), normalizeText('iconsiam'));
  assert.equal(normalizeText('เซ็นทรัล ลาดพร้าว'), 'เซ็นทรัลลาดพร้าว');
});

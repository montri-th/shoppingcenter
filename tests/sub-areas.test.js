// D41 (owner 8 Nov 2026 01:18, “Yes”): Siam Square One, Siam Scape and Centerpoint are sub-areas of Siam Square. The block
// counts once, shows with the shopping centres it holds, and its sub-areas' listed shops show at Siam Square too.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTenantLoader, buildTenantIndex, subAreasOf, rollUpSubAreas, brandPresence, comparePeers, roleVenueCounts} from '../js/tenants.js';
import {prepareRows, filterVenues, applyShopLists, groupMatches} from '../js/model.js';
import {searchAll, buildVenueProfile} from '../js/profile-model.js';
import {renderTenantList, renderVenue, subAreaLine} from '../js/panel.js';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const visible = html => html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ');
const CAVEAT = /caveat|ข้อจำกัด|ไม่ใช่|ไม่นับในจำนวน|ช่องว่างตลาด|ทำเลทอง/;

const SIAM_SQUARE = 'VN-5523fa4482b213';
const PARTS = ['SC-001223', 'SC-001222', 'SC-001236'];

test('the published core: Siam Square counts once, with the centres, and its three sub-areas never count', () => {
  const core = read('data/venues.json');
  const byId = new Map(core.rows.map(r => [r.id, r]));
  const block = byId.get(SIAM_SQUARE);
  assert.equal(block.countable, true);
  assert.equal(block.group, 'mall');
  assert.equal(block.groupBasis, 'sub-areas');
  assert.deepEqual([...block.children].sort(), [...PARTS].sort());
  for (const id of PARTS) {
    const part = byId.get(id);
    assert.equal(part.parentId, SIAM_SQUARE, id);
    assert.equal(part.countRole, 'child_zone', id);
    assert.equal(part.countable, false, id);
    assert.equal(part.countHold, 'component', id);
  }
  // Every place the rule regroups is a counted precinct (group other) with a sub-area of the group it takes.
  const regrouped = core.meta.checks.groupsFromSubAreas;
  assert.deepEqual(regrouped.map(x => x.id), [SIAM_SQUARE]);
  for (const x of regrouped) {
    assert.equal(x.groupBefore, 'other');
    assert.ok(x.subAreas.some(s => s.group === x.group), x.id);
    assert.equal(byId.get(x.id).group, x.group);
  }
  assert.ok(core.rows.filter(r => r.groupBasis === 'sub-areas').every(r => regrouped.some(x => x.id === r.id)));
  // The first view reads the block once: the centres of the first districts are the counted ones only.
  const fv = core.meta.checks.firstView;
  const centres = filterVenues(prepareRows(core.rows.map(r => ({...r}))), {group: 'centres'}).filter(r => r.located && r.provinceCode === fv.province);
  assert.equal(centres.length, fv.total);
  for (const code of fv.districts) assert.equal(centres.filter(r => r.districtCode === code).length, fv.counts[code], code);
  assert.ok(centres.some(r => r.id === SIAM_SQUARE) && !centres.some(r => PARTS.includes(r.id)));
});

test('sub-areas are the children of a counted place that do not count themselves', () => {
  const rows = [
    {id: 'P', name: 'Block', countable: true, children: ['A', 'B', 'C', 'X']},
    {id: 'A', name: 'Zone A', countable: false, parentId: 'P'},
    {id: 'B', name: 'Shop B', countable: true, parentId: 'P'},
    {id: 'C', name: 'Zone C', countable: false, parentId: 'P'},
    {id: 'Q', name: 'Uncounted host', countable: false, children: ['D']},
    {id: 'D', name: 'Zone D', countable: false, parentId: 'Q'},
  ];
  const byId = new Map(rows.map(r => [r.id, r]));
  assert.deepEqual(subAreasOf(byId.get('P'), byId), [{id: 'A', name: 'Zone A'}, {id: 'C', name: 'Zone C'}], 'a child that counts keeps its own list; an unknown id is skipped');
  assert.deepEqual(subAreasOf(byId.get('Q'), byId), []);
  assert.deepEqual(subAreasOf(byId.get('A'), byId), []);
  assert.deepEqual(subAreasOf(null, byId), []);
});

test('the shop-list index holds a block once: sub-area shops, roles and brands at the place, brands never counted twice', () => {
  const rows = prepareRows([
    {id: 'P', name: 'Siam Block', countable: true, status: 'supply', group: 'mall', located: true, lat: 13.7447, lon: 100.5328, children: ['A', 'C']},
    {id: 'A', name: 'Square A', nameEn: 'Square A Mall', countable: false, status: 'supply', group: 'mall', parentId: 'P', located: true, lat: 13.7448, lon: 100.5321},
    {id: 'C', name: 'Scape C', countable: false, status: 'supply', group: 'component', parentId: 'P', located: true, lat: 13.7445, lon: 100.5309},
    {id: 'N', name: 'Next Door', countable: true, status: 'supply', group: 'mall', located: true, lat: 13.7460, lon: 100.5340},
  ]);
  const byId = new Map(rows.map(r => [r.id, r]));
  const json = {meta: {}, venueIds: ['P', 'A', 'C', 'N'], datasets: ['research.TH.beauty', 'research.TH.sport'], categories: [''], formats: [''],
    brands: [['watsons', 'Watsons'], ['asics', 'ASICS'], ['beautrium', 'BEAUTRIUM'], ['fila', 'FILA']],
    rows: [[0, 0, 0, 0, 0], [0, 2, 0, 0, 0], [1, 0, 0, 0, 0], [1, 1, 1, 0, 0], [1, 3, 1, 0, 0], [2, 2, 0, 0, 0], [3, 1, 1, 0, 0], [3, 0, 0, 0, 0], [3, 3, 1, 0, 0]]};
  const index = buildTenantIndex(json);
  assert.equal(rollUpSubAreas(index, [], byId).subAreasRolledUp, undefined, 'no rows yet: nothing is rolled up and it can run later');
  rollUpSubAreas(index, rows, byId);
  rollUpSubAreas(index, rows, byId);
  assert.equal(index.venues.get('P').items, 2 + 3 + 1, 'once, however often it runs');
  assert.equal(index.venues.get('A').items, 3, 'the sub-area keeps its own figure');
  assert.equal(index.venues.get('P').roles.get('sport'), 2);
  assert.equal(index.brands.get('asics').venues.has('A'), false);
  assert.deepEqual([...index.brands.get('watsons').venues.keys()].sort(), ['N', 'P']);
  assert.equal(index.brands.get('watsons').venues.get('P'), 2, 'the place lists both branches of the block');
  const bp = brandPresence(index, 'watsons', byId);
  assert.equal(bp.places, 2);
  assert.deepEqual(bp.placeRows.map(r => r.id).sort(), ['N', 'P']);
  applyShopLists(rows, index);
  assert.equal(byId.get('P').shopCount, 6);
  assert.equal(byId.get('A').shopCount, 3);
  assert.deepEqual(roleVenueCounts(index, rows).find(x => x.role === 'sport'), {role: 'sport', venues: 2});
  const near = comparePeers(index, byId.get('N'), byId, {radiusKm: 5});
  assert.deepEqual(near.peers.map(p => [p.row.id, p.items]), [['P', 6]], 'the block is one nearby centre; its sub-areas are not peers of their own');
});

test('a sub-area’s name finds the place that counts it; the sub-area itself is listed as a component', () => {
  const rows = prepareRows([
    {id: 'P', name: 'สยามสแควร์', nameEn: 'Siam Square', countable: true, status: 'supply', group: 'mall', children: ['A']},
    {id: 'A', name: 'สยามสแควร์วัน', nameEn: 'Siam Square One', countable: false, status: 'supply', group: 'mall', parentId: 'P'},
    {id: 'Q', name: 'Host', countable: false, status: 'supply', group: 'component', children: ['B']},
    {id: 'B', name: 'Zone Bee', countable: false, status: 'supply', group: 'component', parentId: 'Q'},
  ]);
  assert.deepEqual(filterVenues(rows, {search: 'siam square one'}).map(r => r.id), ['P']);
  const found = searchAll('Siam Square One', {rows});
  assert.deepEqual(found.qualified.map(r => r.id), ['P']);
  assert.deepEqual(found.components.map(r => r.id), ['A']);
  assert.deepEqual(searchAll('zone bee', {rows}).components.map(r => r.id), ['B'], 'an uncounted host does not take its children’s names');
  assert.ok(groupMatches('centres', rows[0]));
});

test('a place’s shop list follows with the listed shops of its sub-areas, each naming the sub-area it is in', async () => {
  const shard = {meta: {asOf: '2026-11-07'}, venues: {
    P: {items: [{id: 'r:P1', brand: 'Watsons', branch: 'Siam Square 2', dataset: 'research.TH.beauty'}]},
    A: {items: [{id: 'r:A1', brand: 'ASICS', branch: 'Siam Square One', dataset: 'research.TH.sport'}, {id: 'r:A2', brand: 'MK', dataset: 'research.TH.restaurants'}]},
    C: {items: [{id: 'r:C1', brand: 'BEAUTRIUM', dataset: 'research.TH.beauty'}]},
  }};
  const fetchRoster = async path => /profiles/.test(path) ? {ok: false, status: 404} : {ok: true, json: async () => shard};
  const parts = {P: [{id: 'A', name: 'สยามสแควร์วัน'}, {id: 'C', name: 'SIAMSCAPE'}, {id: 'E', name: 'Empty zone'}]};
  const load = createTenantLoader(fetchRoster, {parts: id => parts[id] || []});
  const roster = await load('P');
  assert.deepEqual(roster.items.map(i => i.id), ['r:P1', 'r:A1', 'r:A2', 'r:C1']);
  assert.deepEqual(roster.items.map(i => i.subArea || ''), ['', 'สยามสแควร์วัน', 'สยามสแควร์วัน', 'SIAMSCAPE']);
  assert.deepEqual(roster.subAreas, [{id: 'A', name: 'สยามสแควร์วัน', items: 2}, {id: 'C', name: 'SIAMSCAPE', items: 1}, {id: 'E', name: 'Empty zone', items: 0}]);
  const own = await load('A');
  assert.equal(own.items.length, 2);
  assert.ok(own.items.every(i => !i.subArea), 'the sub-area’s own panel reads its items untagged');
  assert.equal((await createTenantLoader(fetchRoster)('P')).items.length, 1, 'without parts a roster is the venue’s own');

  const row = {id: 'P', name: 'สยามสแควร์', group: 'mall', countable: true, children: ['A', 'C']};
  const html = renderTenantList(row, {roster, limit: 10});
  assert.match(html, /ASICS<\/strong><small>กีฬาและเอาท์ดอร์ · ในสยามสแควร์วัน · Siam Square One/);
  assert.match(html, /BEAUTRIUM<\/strong><small>ความงาม · ใน SIAMSCAPE/);
  assert.match(html, /Watsons<\/strong><small>ความงาม · Siam Square 2/);
  assert.equal(subAreaLine(roster), '<p class="subtle tenant-subareas">รวมร้านในพื้นที่ย่อย สยามสแควร์วัน <span class="data-number">2</span> · SIAMSCAPE <span class="data-number">1</span></p>');
  assert.equal(subAreaLine({items: []}), '');
});

test('the venue panel of the block and of a sub-area say how they count, with the rule in the evidence list', () => {
  const block = {id: 'P', name: 'สยามสแควร์', group: 'mall', groupBasis: 'sub-areas', countable: true, status: 'supply', operationGroup: 'current', children: ['A', 'C']};
  const a = {id: 'A', name: 'สยามสแควร์วัน', group: 'mall', countable: false, countHold: 'component', countRole: 'child_zone', parentId: 'P', status: 'supply'};
  const c = {id: 'C', name: 'สยามสเคป', group: 'component', countable: false, countHold: 'component', countRole: 'child_zone', parentId: 'P', status: 'supply'};
  const byId = new Map([block, a, c].map(r => [r.id, r]));
  const roster = {items: [{id: 'r:A1', brand: 'ASICS', dataset: 'research.TH.sport', subArea: 'สยามสแควร์วัน', subAreaId: 'A'}], meta: {asOf: '2026-11-07'},
    subAreas: [{id: 'A', name: 'สยามสแควร์วัน', items: 1}, {id: 'C', name: 'สยามสเคป', items: 0}]};
  const detail = {checkedOn: '2026-11-07', ev: {}};
  const html = renderVenue(buildVenueProfile({row: block, detail, byId, districts: new Map()}), {asOf: '2026-11-07', tenants: {roster, limit: 10}});
  assert.match(html, /รวมร้านในพื้นที่ย่อย สยามสแควร์วัน <span class="data-number">1<\/span>/);
  assert.match(html, /<details[\s\S]*กลุ่มบนหน้าจอ[\s\S]*แสดงกับศูนย์การค้า เพราะพื้นที่ย่อย \(สยามสแควร์วัน\) เป็นศูนย์การค้า[\s\S]*<\/details>/);
  assert.match(html, /<details[\s\S]*ร้านในพื้นที่ย่อย[\s\S]*สยามสแควร์วัน 1 ร้าน[\s\S]*<\/details>/);
  assert.match(html, /พื้นที่ย่อยในโครงการ/);
  assert.ok(!CAVEAT.test(visible(html)), visible(html).match(CAVEAT)?.[0]);
  const part = renderVenue(buildVenueProfile({row: a, detail, byId, districts: new Map()}), {asOf: '2026-11-07'});
  assert.match(part, /อยู่ใน <button type="button" class="link-button" data-action="select-venue" data-id="P">สยามสแควร์<\/button>/);
  assert.match(part, /<details[\s\S]*เป็นพื้นที่ย่อยของสยามสแควร์ นับรวมกับที่นั่นครั้งเดียว[\s\S]*<\/details>/);
  const orphan = renderVenue(buildVenueProfile({row: {...a, parentId: 'GONE'}, detail, byId, districts: new Map()}), {asOf: '2026-11-07'});
  assert.doesNotMatch(orphan, /เป็นพื้นที่ย่อยของ/, 'no claim about a parent the core does not hold');
});

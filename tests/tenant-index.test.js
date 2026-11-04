// Shop-list index: tenant roles of the named-host datasets, brand search, nearby-centre comparison and brand view.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTenantIndex, searchBrands, comparePeers, brandPresence, tenantMix, tenantRole, rankTenants, createTenantSelection,
  createTenantIndexLoader, TENANT_ROLE_LABELS, DATASET_ROLES} from '../js/tenants.js';
import {renderTenantMix, renderTenantList, renderPeers, renderBrand, mapCardBrand, renderSearch, tenantDataLine} from '../js/panel.js';
import {prepareRows} from '../js/model.js';

const visible = html => html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ');
const CAVEAT = /caveat|ข้อจำกัด|ไม่ใช่|ไม่นับในจำนวน|ช่องว่างตลาด|ทำเลทอง/;

// Venues 0.0, 0.9 and 2.6 km apart (lat steps of ~0.0081° ≈ 0.9 km), a far one, a market and a parent/component pair.
const rows = prepareRows([
  {id: 'A', name: 'Centre A', group: 'mall', countable: true, status: 'supply', located: true, lat: 13.7000, lon: 100.5000, provinceCode: 'BKK', children: ['A1']},
  {id: 'A1', name: 'Centre A Wing', group: 'component', countable: false, status: 'supply', located: true, lat: 13.7002, lon: 100.5002, provinceCode: 'BKK', parentId: 'A'},
  {id: 'B', name: 'Centre B', group: 'mall', countable: true, status: 'supply', located: true, lat: 13.7081, lon: 100.5000, provinceCode: 'BKK'},
  {id: 'C', name: 'Centre C', group: 'community', countable: true, status: 'supply', located: true, lat: 13.7234, lon: 100.5000, provinceCode: 'BKK'},
  {id: 'D', name: 'Far Centre', group: 'mall', countable: true, status: 'supply', located: true, lat: 14.2000, lon: 100.5000, provinceCode: 'AYA'},
  {id: 'M', name: 'Market', group: 'market', countable: true, status: 'supply', located: true, lat: 13.7010, lon: 100.5010, provinceCode: 'BKK'},
]);
const byId = new Map(rows.map(r => [r.id, r]));
// [venue, brand, dataset, category, storeFormat]
const DATASETS = ['research.TH.apparel', 'research.TH.sport', 'research.TH.restaurants', 'research.TH.bank', 'research.TH.nail'];
const json = {
  meta: {datasets: {'research.TH.apparel': 6, 'research.TH.sport': 4}, checkedFrom: '2026-10-21', checkedTo: '2026-11-04'},
  venueIds: ['A', 'A1', 'B', 'C', 'D', 'M'], datasets: DATASETS, categories: ['', 'restaurant_or_cafe'], formats: [''],
  brands: [['uniqlo', 'UNIQLO'], ['supersports', 'Supersports'], ['mkrestaurants', 'MK Restaurants'], ['kbank', 'KBank'], ['nailit', 'Nail It'], ['h&m', 'H&M'], ['<x>', '<script>x</script>']],
  rows: [
    [0, 0, 0, 0, 0], [0, 2, 2, 1, 0], [0, 3, 3, 0, 0], [0, 6, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [2, 0, 0, 0, 0], [2, 1, 1, 0, 0], [2, 2, 2, 1, 0], [2, 5, 0, 0, 0],
    [3, 1, 1, 0, 0], [3, 4, 4, 0, 0], [3, 5, 0, 0, 0],
    [4, 0, 0, 0, 0], [4, 1, 1, 0, 0], [4, 5, 0, 0, 0],
    [5, 1, 1, 0, 0], [5, 4, 4, 0, 0], [5, 5, 0, 0, 0],
  ],
};
const index = buildTenantIndex(json);

test('named-host datasets take one role each; editorial order puts fashion before sport before everyday services', () => {
  assert.equal(tenantRole({dataset: 'research.TH.apparel', category: 'sportswear'}), 'apparel');
  assert.equal(tenantRole({dataset: 'research.TH.sport', category: 'outdoor'}), 'sport');
  assert.equal(tenantRole({dataset: 'research.TH.furniture', category: 'kitchenware'}), 'home');
  assert.equal(tenantRole({dataset: 'research.TH.pet', category: '03 โรงพยาบาล/คลินิกสัตว์'}), 'pet');
  assert.equal(tenantRole({dataset: 'research.TH.massage_spa', category: 'massage_day_spa'}), 'spa');
  assert.equal(tenantRole({dataset: 'research.TH.salon_barber', category: 'Kids / family'}), 'hair');
  assert.equal(tenantRole({dataset: 'research.TH.nail', category: 'ร้านทำเล็บในห้าง'}), 'nail');
  for (const role of Object.values(DATASET_ROLES)) assert.ok(TENANT_ROLE_LABELS[role], role);
  const items = [
    {id: 'n', brand: 'Nail', dataset: 'research.TH.nail'}, {id: 's', brand: 'Sport', dataset: 'research.TH.sport'},
    {id: 'a', brand: 'Apparel', dataset: 'research.TH.apparel'}, {id: 'l', brand: 'Lux', dataset: 'research.TH.luxury'},
    {id: 'b', brand: 'Bank', dataset: 'research.TH.bank'}];
  assert.deepEqual(rankTenants(items, {name: 'Centre', group: 'mall'}).map(x => x.id), ['l', 'a', 's', 'n', 'b']);
});

test('index: roles per venue from tenantRole, brands with their venues; brand search is substring on the search key', () => {
  assert.equal(index.venues.get('A').items, 4);
  assert.equal(index.venues.get('A').roles.get('food'), 1, 'a mixed restaurant category stays food, as in the panel');
  assert.equal(index.brands.get('uniqlo').venues.size, 4);
  assert.equal(index.brands.get('supersports').role, 'sport');
  assert.deepEqual(searchBrands(index, 'u').brands, [], 'one character is not a search');
  assert.deepEqual(searchBrands(index, 'UNI').brands.map(b => b.key), ['uniqlo']);
  assert.deepEqual(searchBrands(index, 'sports').brands.map(b => b.key), ['supersports']);
  assert.deepEqual(searchBrands(index, 'H & M').brands.map(b => b.key), ['h&m'], 'spaces are dropped like the venue search');
  assert.equal(searchBrands(null, 'uniqlo').total, 0);
});

test('nearby centres: comparable groups within 5 km, the complex itself and markets excluded, three listed shops minimum', () => {
  const cmp = comparePeers(index, byId.get('A'), byId);
  assert.deepEqual(cmp.peers.map(p => p.row.id), ['B', 'C'], 'B 0.9 km, C 2.6 km; the wing is the same complex, the market is not comparable, D is far');
  assert.ok(Math.abs(cmp.peers[0].km - 0.9) < 0.05);
  assert.equal(cmp.hereItems, 4);
  // Roles at the peers that A's list lacks: sport (B, C) and nail (C).
  assert.deepEqual(cmp.missingRoles.map(m => [m.role, m.peers]), [['sport', 2], ['nail', 1]]);
  // Brands in at least two of the two peers and not here: Supersports and H&M; Nail It is in one peer only.
  assert.deepEqual(cmp.missingBrands.map(m => [m.brand.key, m.peers]), [['h&m', 2], ['supersports', 2]], 'ties: wider network, then name');
  assert.deepEqual(cmp.onlyHere.map(b => b.key).sort(), ['<x>', 'kbank']);
  assert.equal(comparePeers(index, byId.get('M'), byId), null, 'a market is not compared');
  assert.equal(comparePeers(null, byId.get('A'), byId), null);
  const lonely = comparePeers(index, byId.get('D'), byId);
  assert.deepEqual(lonely.peers, []);
});

test('brand view: a component and its parent are one place; provinces, groups and brands that share venues', () => {
  const bp = brandPresence(index, 'uniqlo', byId);
  assert.equal(bp.rows.length, 4, 'every venue that lists it');
  assert.equal(bp.places, 3, 'Centre A and its wing count once');
  assert.deepEqual(bp.provinces, [{code: 'BKK', count: 2}, {code: 'AYA', count: 1}]);
  assert.deepEqual(bp.groups, [{id: 'mall', count: 3}]);
  assert.deepEqual(bp.coBrands.map(x => [x.brand.key, x.shared]), [['h&m', 2], ['mkrestaurants', 2], ['supersports', 2]]);
  assert.equal(brandPresence(index, 'nope', byId), null);
});

test('mix chips filter the list to one role; more() follows the filtered length; a repaint keeps the role', async () => {
  const venue = {id: 'A', name: 'Centre A', group: 'mall'};
  const items = [
    ...Array.from({length: 12}, (_, i) => ({id: `a${i}`, brand: `Apparel ${i}`, dataset: 'research.TH.apparel', sourceUrl: 'https://example.com/a'})),
    ...Array.from({length: 3}, (_, i) => ({id: `s${i}`, brand: `Sport ${i}`, dataset: 'research.TH.sport', sourceUrl: 'https://example.com/s'})),
  ];
  const selection = createTenantSelection({load: async () => ({items})});
  await selection.select('A');
  const chips = renderTenantMix(venue, selection.state);
  assert.match(chips, /data-role="" aria-pressed="true">ทั้งหมด <span class="data-number">15/);
  assert.match(chips, /data-role="apparel" aria-pressed="false">เสื้อผ้าและแฟชั่น <span class="data-number">12/);
  assert.equal(selection.setRole('A', 'sport'), true);
  const list = renderTenantList(venue, selection.state);
  assert.equal((list.match(/class="tenant-row"/g) || []).length, 3);
  assert.match(list, /แสดง 3 จาก 3 ร้าน/);
  assert.equal(selection.more('A'), false, 'three sport shops fit on one page');
  assert.match(renderTenantMix(venue, selection.state), /data-role="sport" aria-pressed="true"/);
  selection.setRole('A', 'sport');
  assert.equal(selection.state.role, '', 'pressing the active role again shows every shop');
  assert.equal(renderTenantMix(venue, {roster: {items: items.slice(0, 2)}}), '', 'one role needs no chips');
});

test('nearby-centre and brand panels: escaped, actionable, no caveat on screen, one provenance line', () => {
  const cmp = comparePeers(index, byId.get('A'), byId);
  const html = renderPeers(cmp, byId.get('A'));
  assert.ok(html.includes('data-action="select-venue" data-id="B"') && html.includes('data-action="select-brand" data-id="supersports"'));
  assert.ok(html.includes('&lt;script&gt;') && !html.includes('<script>'));
  assert.match(visible(html), /2 แห่งในรัศมี 5 กม\./);
  assert.match(visible(html), /แต่ยังไม่อยู่ในรายชื่อของที่นี่/);
  assert.ok(!CAVEAT.test(visible(html)));
  assert.match(renderPeers(comparePeers(index, byId.get('D'), byId), byId.get('D')), /ยังไม่มีศูนย์อื่นที่มีรายชื่อร้านในรัศมีนี้/);
  assert.equal(renderPeers(null, byId.get('A')), '');

  const bp = brandPresence(index, 'uniqlo', byId);
  const brand = renderBrand(bp, {meta: index.meta, limit: 2});
  assert.match(visible(brand), /พบใน 3 สถานที่ · 2 จังหวัด/);
  assert.equal((brand.match(/data-action="select-venue"/g) || []).length, 2, 'the first page of venues');
  assert.ok(brand.includes('data-action="more-brand-venues" data-id="uniqlo"'));
  assert.ok(brand.includes('data-action="select-brand" data-id="h&amp;m"'), 'brands that share venues open their own view');
  assert.equal((brand.match(/class="hint panel-foot"/g) || []).length, 1);
  assert.match(tenantDataLine(index.meta), /2 ชุดข้อมูลร้านค้า · ตรวจ 21 ต\.ค\. 2569–4 พ\.ย\. 2569/);
  assert.ok(!CAVEAT.test(visible(brand)));
  assert.match(mapCardBrand(bp), /UNIQLO[\s\S]*พบใน 3 สถานที่/);
  assert.ok(mapCardBrand(bp).includes('data-action="open-panel"'));
});

test('search lists brands first with where they are listed; a brand-only query is not “not found”', () => {
  const results = {query: 'uniqlo', qualified: [], qualifiedTotal: 0, otherStatus: 0, components: [], pending: [], pendingTotal: 0};
  const html = renderSearch(results, {brands: searchBrands(index, 'uniqlo')});
  assert.ok(html.includes('data-action="select-brand" data-id="uniqlo"'));
  assert.match(visible(html), /แบรนด์ 1/);
  assert.match(visible(html), /พบใน 4 สถานที่/);
  assert.ok(!/ไม่พบชื่อ/.test(visible(html)));
  assert.match(visible(renderSearch(results, {brands: {total: 0, brands: []}})), /ไม่พบชื่อ แบรนด์ หรือรหัสนี้/);
});

test('the index loader caches, evicts a failure and validates the file', async () => {
  let calls = 0;
  const load = createTenantIndexLoader(async () => {
    calls++;
    if (calls === 1) return {ok: false, status: 503};
    if (calls === 2) return {ok: true, json: async () => ({rows: 'bad'})};
    return {ok: true, json: async () => json};
  });
  await assert.rejects(load());
  await assert.rejects(load());
  const loaded = await load();
  assert.equal(loaded.venues.size, 6);
  assert.equal(await load(), loaded, 'one successful load is kept');
  assert.equal(calls, 3);
});

test('published index: every brand key matches its venues and roles exist in the label table', () => {
  const published = buildTenantIndex(JSON.parse(readFileSync(new URL('../data/tenant-index.json', import.meta.url), 'utf8')));
  for (const brand of published.list) assert.ok(TENANT_ROLE_LABELS[brand.role], `${brand.name}: ${brand.role}`);
  const mix = tenantMix([...published.venues.values()].flatMap(v => [...v.roles].flatMap(([role, n]) => Array.from({length: n}, () => ({dataset: Object.keys(DATASET_ROLES).find(k => DATASET_ROLES[k] === role) || '', category: role})))));
  assert.ok(mix.length >= 10);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantLoader, createTenantSelection, rankTenants, tenantRole, TENANT_PAGE_SIZE, TENANT_ROLE_LABELS} from '../js/tenants.js';
import {renderTenantList} from '../js/panel.js';

const venue = {id: 'TEST-1', name: 'ศูนย์ตัวอย่าง', group: 'mall'};
const items = count => Array.from({length: count}, (_, i) => ({id: `shop-${i}`, name: `ร้าน ${i + 1}`, dataset: 'research.TH.restaurants', branch: 'สาขาทดสอบ', sourceUrl: 'https://example.com/shops'}));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const countRows = html => (html.match(/class="tenant-row"/g) || []).length;

test('14 shops show 10 then 14; 21 show 10/20/21, without duplicates or losing the last page', async () => {
  for (const total of [14, 20, 21]) {
    const selection = createTenantSelection({load: async () => ({items: items(total)})});
    await selection.select(venue.id);
    assert.equal(selection.state.limit, TENANT_PAGE_SIZE);
    let expected = 10;
    while (true) {
      const html = renderTenantList(venue, selection.state);
      assert.equal(countRows(html), Math.min(total, expected));
      assert.equal(html.includes('data-action="more-tenants"'), expected < total);
      if (expected >= total) break;
      assert.equal(selection.more(venue.id), true);
      expected += 10;
    }
    assert.equal(selection.more(venue.id), false);
  }
});

test('expansion persists through repaints and same selection; another venue resets and late results are ignored', async () => {
  const requests = new Map();
  const selection = createTenantSelection({load: id => { const d = deferred(); requests.set(id, d); return d.promise; }});
  const first = selection.select('a');
  const second = selection.select('b');
  requests.get('b').resolve({items: items(21)}); await second;
  requests.get('a').resolve({items: items(14)}); await first;
  assert.equal(selection.state.id, 'b');
  selection.more('b');
  await selection.select('b');
  assert.equal(selection.state.limit, 20);
  assert.equal(countRows(renderTenantList(venue, selection.state)), 20);
  assert.equal(countRows(renderTenantList(venue, selection.state)), 20, 'a repaint is pure');
  const next = selection.select('c');
  assert.equal(selection.state.limit, 10);
  assert.equal(selection.more('b'), false);
  requests.get('c').resolve({items: []}); await next;
  assert.match(renderTenantList(venue, selection.state), /ยังไม่มีรายชื่อร้าน/);
});

test('optional tenant requests cache a shard, evict failures and can retry independently of venue/map data', async () => {
  let calls = 0;
  const loader = createTenantLoader(async () => {
    calls++;
    return calls === 1 ? {ok: false, status: 503} : {ok: true, json: async () => ({meta: {asOf: '2026-10-25'}, venues: {'TEST-1': {items: items(2)}}})};
  });
  const selection = createTenantSelection({load: loader});
  await selection.select(venue.id);
  assert.equal(selection.state.error, true);
  assert.match(renderTenantList(venue, selection.state), /retry-tenants/);
  await selection.select(venue.id, {retry: true});
  assert.equal(selection.state.error, false);
  assert.equal(selection.state.roster.items.length, 2);
  await loader(venue.id);
  assert.equal(calls, 3, 'one optional profile request, one failed shard and its retry');
});

test('role order responds to the venue, never to logo availability or network size', () => {
  const rows = [
    {id: 'lux', brand: 'Luxury shop', dataset: 'research.TH.luxury'},
    {id: 'camera', brand: 'Camera shop', dataset: 'research.TH.camera'},
    {id: 'cafe', brand: 'Cafe', category: 'coffee', dataset: 'research.TH.restaurants'},
    {id: 'food', brand: 'Food', category: 'steak restaurant', dataset: 'research.TH.restaurants'},
    {id: 'market', brand: 'Grocer', category: 'supermarket', dataset: 'research.TH.grocery'},
  ];
  assert.equal(tenantRole(rows[3]), 'dining', 'steak is not tea');
  assert.equal(tenantRole({dataset: 'research.TH.luxury', category: 'beauty', storeFormat: 'department_store_counter'}), 'beauty', 'a cosmetics counter is not a department store');
  assert.equal(tenantRole({dataset: 'research.TH.luxury', category: 'luxury_designer', storeFormat: 'department_store_shop_in_shop'}), 'destination', 'a shop inside a department store is not its host');
  assert.equal(tenantRole({dataset: 'research.TH.restaurants', category: 'restaurant_or_cafe'}), 'food', 'a mixed source category is not promoted to cafe');
  assert.equal(rankTenants(rows, {name: 'Camera Plaza'})[0].id, 'camera');
  assert.equal(rankTenants(rows, {group: 'fuel'})[0].id, 'food');
  assert.equal(rankTenants(rows, {group: 'community'})[0].id, 'market');
  assert.equal(rankTenants(rows, venue, {sourceUrl: 'https://example.com/centre', roleOrder: ['destination', 'grocery']})[0].id, 'lux');
  assert.deepEqual(rankTenants(rows, venue).map(x => x.id), rankTenants(rows.map(x => ({...x, logo: {file: 'x'}, branches: 999999})), venue).map(x => x.id));
  assert.equal(rankTenants([{id: 'b', brand: 'Same'}, {id: 'a', brand: 'Same'}], venue)[0].id, 'a');
  // Linked CityMETER Fitness branches: one role from the dataset, never from a category word such as dance or kids.
  for (const category of ['gym_chain', 'dance_fitness', 'kids_activity', 'climbing_bouldering', 'yoga'])
    assert.equal(tenantRole({dataset: 'research.TH.fitness', category, storeFormat: 'fitness_or_studio_branch_listing'}), 'fitness');
  assert.equal(TENANT_ROLE_LABELS.fitness, 'ฟิตเนสและสตูดิโอ');
  const gym = {id: 'gym', brand: 'Gym', dataset: 'research.TH.fitness', category: 'gym_chain'};
  assert.deepEqual(rankTenants([gym, rows[1], rows[0]], venue).map(x => x.id), ['lux', 'gym', 'camera'], 'between fashion and specialist retail; an editorial order, not footfall');
});

test('names are escaped; logo is optional, lazy and restricted to verified local assets; rows keep source links', () => {
  const roster = {items: [{id: '<unsafe>', brand: '<script>alert(1)</script>', category: 'grocery', sourceUrl: 'javascript:alert(1)', logo: {file: 'https://evil.example/x.svg', sha256: 'a'.repeat(64)}}, {id: 'safe', name: 'A & B', sourceUrl: 'https://example.com/shop', logo: {file: 'assets/tenant-logos/verified.svg', sha256: 'b'.repeat(64), width: 100, height: 50}}]};
  const html = renderTenantList(venue, {roster, limit: 10});
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>') && !html.includes('javascript:') && !html.includes('evil.example'));
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.ok(html.includes('loading="lazy"') && html.includes('decoding="async"'));
  assert.ok(html.includes('A &amp; B') && html.includes('https://example.com/shop'));
  assert.ok(!html.includes('more-tenants'));
});

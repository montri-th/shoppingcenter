// D38 (owner 7 Nov 2026 23:49, “รับครับ”): shops as each centre's own official directory lists them, beside the brand roster.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createTenantLoader, createDirectoryLoader, createTenantIndexLoader, createDirectoryCountsLoader, mergeDirectoryCounts, buildTenantIndex,
  tenantRole, tenantMix, rankTenants, TENANT_ROLE_LABELS, DIRECTORY_DATASET} from '../js/tenants.js';
import {shardOf} from '../js/details.js';
import {renderTenantList, renderVenue, dataLine} from '../js/panel.js';
import {storeDataset} from '../js/evidence.js';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const bytes = path => readFileSync(new URL(`../${path}`, import.meta.url));
const visible = html => html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ');
const CAVEAT = /caveat|ข้อจำกัด|ไม่ใช่|ไม่นับในจำนวน|ช่องว่างตลาด|ทำเลทอง/;
const meta = {schemaVersion: '1', asOf: '2026-11-07', dataset: DIRECTORY_DATASET, shards: 32, rule: 'D38', items: 2, venues: 1, checkedFrom: '2026-11-07', checkedTo: '2026-11-07'};
const dirItem = (id, extra = {}) => ({id: `${DIRECTORY_DATASET}:18_OFFICIAL_TENANTS:${id}`, name: `Shop ${id}`, brand: `Shop ${id}`, category: 'Fashion',
  directoryRole: 'apparel', unitFloor: 'ชั้น L1 · ยูนิต 101', dataset: DIRECTORY_DATASET, sourceRole: 'official_venue_directory_listing',
  sourceUrl: `https://example.com/shop/${id}`, checkedOn: '2026-11-07', status: 'publisher_listed_not_field_verified', sourceObservationIds: [id], sourceObservationCount: 1, ...extra});

test('the directory rule on a small export (scripts/build-directory-listings.py)', () => {
  execFileSync('python3', ['-I', fileURLToPath(new URL('./test_directory_listings.py', import.meta.url))],
    {cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8'});
});

test('a venue roster gets its directory entries after the brand roster; a failed or foreign directory adds none', async () => {
  const rosterJSON = {meta: {asOf: '2026-11-07'}, venues: {V1: {items: [{id: 'research.TH.apparel:02_STORES:U1', brand: 'UNIQLO', dataset: 'research.TH.apparel'}]}}};
  const fetchRoster = async path => /profiles/.test(path) ? {ok: false, status: 404} : {ok: true, json: async () => rosterJSON};
  let dirCalls = 0;
  const directory = createDirectoryLoader(async path => {
    dirCalls++;
    assert.match(path, /^data\/directory\/\d{2}\.json$/);
    assert.ok(['V1', 'V2'].map(id => `data/directory/${String(shardOf(id, 32)).padStart(2, '0')}.json`).includes(path), 'the roster shard function');
    return dirCalls === 1 ? {ok: false, status: 503} : {ok: true, json: async () => ({meta, venues: {V1: {items: [dirItem('a'), dirItem('b')]}}})};
  });
  const load = createTenantLoader(fetchRoster, {directory});
  const first = await load('V1');
  assert.equal(first.items.length, 1, 'a failed directory never blocks the roster');
  assert.equal(first.directory, null);
  const again = await load('V1');
  assert.deepEqual(again.items.map(i => i.id), ['research.TH.apparel:02_STORES:U1', `${DIRECTORY_DATASET}:18_OFFICIAL_TENANTS:a`, `${DIRECTORY_DATASET}:18_OFFICIAL_TENANTS:b`]);
  assert.equal(again.directory.items, 2);
  assert.equal(dirCalls, 2, 'the failed directory shard is evicted and read again');
  const foreign = createTenantLoader(fetchRoster, {directory: createDirectoryLoader(async () => ({ok: true, json: async () => ({meta: {dataset: 'research.TH.apparel'}, venues: {V1: {items: [dirItem('x')]}}})}))});
  assert.equal((await foreign('V1')).items.length, 1, 'a file that is not the directory adds nothing');
  const none = await createTenantLoader(fetchRoster, {directory})('V2');
  assert.equal(none.items.length, 0);
  assert.equal(none.directory.items, 0);
});

test('directory entries take the role their build read from the centre’s category; an unknown role falls back', () => {
  assert.equal(tenantRole(dirItem('a', {directoryRole: 'food'})), 'food');
  assert.equal(tenantRole(dirItem('a', {directoryRole: 'made-up', category: 'supermarket'})), 'grocery');
  assert.deepEqual(tenantMix([dirItem('a'), dirItem('b'), dirItem('c', {directoryRole: 'bank'})]).map(m => [m.role, m.count]), [['apparel', 2], ['bank', 1]]);
});

test('within one role, brand-linked shops come before the centre’s directory entries', () => {
  const ranked = rankTenants([dirItem('a', {name: 'Aaa', brand: 'Aaa'}), {id: 'research.TH.apparel:02_STORES:Z', brand: 'Zzz', dataset: 'research.TH.apparel'},
    dirItem('b', {name: 'Bbb', brand: 'Bbb', directoryRole: 'department'})], {name: 'Centre'});
  assert.deepEqual(ranked.map(i => i.brand), ['Bbb', 'Zzz', 'Aaa']);
});

test('directory counts join the shop counts and roles, never the brands', async () => {
  const json = {meta: {datasets: {'research.TH.apparel': 2}, checkedFrom: '2026-10-21', checkedTo: '2026-11-04'}, venueIds: ['V1', 'V2'],
    datasets: ['research.TH.apparel'], categories: [''], formats: [''], brands: [['uniqlo', 'UNIQLO']], rows: [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0]]};
  const counts = {meta, venues: {V1: {items: 3, roles: {apparel: 2, food: 1, nonsense: 4}}, V3: {items: 2, roles: {bank: 2}}, V9: {items: 0}}};
  const index = mergeDirectoryCounts(buildTenantIndex(json), counts);
  assert.equal(index.venues.get('V1').items, 4);
  assert.equal(index.venues.get('V1').directoryItems, 3);
  assert.deepEqual([...index.venues.get('V1').roles], [['apparel', 3], ['food', 1]], 'roles outside the label table are dropped');
  assert.equal(index.venues.get('V3').items, 2, 'a venue the roster does not list yet');
  assert.equal(index.venues.get('V3').brands.size, 0);
  assert.ok(!index.venues.has('V9'));
  assert.deepEqual([...index.brands.get('uniqlo').venues.keys()], ['V1', 'V2'], 'brand presence reads brand-linked shops only');
  assert.equal(index.meta.directory.venues, 1);
  assert.deepEqual(index.meta.datasets, json.meta.datasets, 'the brand datasets are not renamed');
  const untouched = buildTenantIndex(json);
  assert.equal(mergeDirectoryCounts(untouched, {meta: {dataset: 'other'}, venues: counts.venues}).venues.get('V1').items, 1);
  let calls = 0;
  const load = createTenantIndexLoader(async () => ({ok: true, json: async () => json}), {counts: async () => { calls++; throw new Error('offline'); }});
  const loaded = await load();
  assert.equal(loaded.venues.get('V1').items, 1, 'counts that fail to load leave the index as it was');
  assert.equal(calls, 1);
  const withCounts = await createTenantIndexLoader(async () => ({ok: true, json: async () => json}), {counts: createDirectoryCountsLoader(async path => {
    assert.equal(path, 'data/directory/counts.json');
    return {ok: true, json: async () => counts};
  })})();
  assert.equal(withCounts.venues.get('V1').items, 4);
});

test('the venue panel lists directory entries with floor, unit, role and source, and names the directory in the data line', () => {
  const row = {id: 'V1', name: 'Centre One', group: 'mall', countable: true, status: 'supply', located: true, lat: 13.7, lon: 100.5};
  const roster = {items: [dirItem('a', {name: 'Zara', brand: 'Zara'}), dirItem('b', {name: 'After You', brand: 'After You', directoryRole: 'cafe', unitFloor: 'ชั้น G, L1, L2'})],
    directory: {items: 2, meta}, meta: {asOf: '2026-11-07'}};
  const list = renderTenantList(row, {roster, limit: 10});
  assert.match(list, /Zara/);
  assert.match(list, /เสื้อผ้าและแฟชั่น · ชั้น L1 · ยูนิต 101/);
  assert.match(list, /คาเฟ่และเครื่องดื่ม · ชั้น G, L1, L2/);
  assert.match(list, /href="https:\/\/example\.com\/shop\/a"/);
  assert.equal(storeDataset(DIRECTORY_DATASET), 'ไดเรกทอรีของศูนย์');
  const html = renderVenue({row, detail: {checkedOn: '2026-11-07', ev: {}}, group: {id: 'mall', th: 'ศูนย์การค้า'}, children: []},
    {asOf: '2026-11-07', tenants: {roster, limit: 10}, shops: {datasets: {'research.TH.apparel': 2}, checkedFrom: '2026-08-02', checkedTo: '2026-11-04', directory: meta}});
  assert.match(html, /ไดเรกทอรีของศูนย์/);
  assert.match(html, /<details[\s\S]*ไดเรกทอรีของศูนย์[\s\S]*2 รายการตามไดเรกทอรีทางการของศูนย์[\s\S]*<\/details>/, 'the rule lives in the evidence list');
  assert.ok(!CAVEAT.test(visible(html)), visible(html).match(CAVEAT)?.[0]);
  const line = dataLine('2026-11-07', {datasets: {a: 1, b: 2}, checkedFrom: '2026-08-02', checkedTo: '2026-11-04', directory: meta});
  assert.match(line, /รายชื่อร้าน 2 ชุดข้อมูล และไดเรกทอรีของศูนย์ 1 แห่ง ตรวจ 2 ส\.ค\. 2569–7 พ\.ย\. 2569/);
  assert.doesNotMatch(dataLine('2026-11-07', {datasets: {a: 1}, checkedTo: '2026-11-04'}), /ไดเรกทอรี/);
});

/* ---------- the published directory (data/directory) ---------- */

const counts = read('data/directory/counts.json');
const report = read('data/directory/build-report.json');
const core = read('data/venues.json');
const venues = new Map(core.rows.map(r => [r.id, r]));
const shards = readdirSync(new URL('../data/directory/', import.meta.url)).filter(f => /^\d{2}\.json$/.test(f)).sort();
const published = shards.map(f => [f, read(`data/directory/${f}`)]);
const rosterKeys = new Map();
for (let n = 0; n < 32; n++) {
  for (const [vid, v] of Object.entries(read(`data/tenants/${String(n).padStart(2, '0')}.json`).venues)) {
    const keys = rosterKeys.get(vid) || new Set();
    for (const item of v.items) {
      keys.add(item.id);
      for (const k of item.sourceObservationIds || []) keys.add(k);
    }
    rosterKeys.set(vid, keys);
  }
}

test('published directory: 32 shards by the roster shard function, one dataset, counted venues only', () => {
  assert.equal(shards.length, 32);
  assert.equal(counts.meta.dataset, DIRECTORY_DATASET);
  let items = 0;
  const seen = new Set();
  for (const [file, shard] of published) {
    assert.deepEqual(shard.meta, counts.meta, `${file}: one meta`);
    for (const [vid, v] of Object.entries(shard.venues)) {
      assert.equal(String(shardOf(vid, 32)).padStart(2, '0') + '.json', file, `${vid} in its shard`);
      assert.ok(venues.get(vid)?.countable, `${vid}: a counted venue of data/venues.json`);
      assert.equal(v.items.length, counts.venues[vid].items, `${vid}: counts.json matches the shard`);
      const roles = {};
      for (const item of v.items) {
        roles[item.directoryRole] = (roles[item.directoryRole] || 0) + 1;
        assert.ok(!seen.has(item.id), `${item.id} once`);
        seen.add(item.id);
        assert.ok(item.id.startsWith(`${DIRECTORY_DATASET}:18_OFFICIAL_TENANTS:`), item.id);
        assert.equal(item.dataset, DIRECTORY_DATASET);
        assert.equal(item.sourceRole, 'official_venue_directory_listing');
        assert.ok(item.name && item.name.trim() === item.name, `${item.id}: a listed name`);
        assert.ok(Object.hasOwn(TENANT_ROLE_LABELS, item.directoryRole), `${item.id}: role ${item.directoryRole}`);
        assert.match(item.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
        assert.match(item.sourceUrl, /^https:\/\/[^\s]+$/);
        assert.doesNotMatch(item.sourceUrl, /docs\.google\.com|drive\.google\.com|sheets\.google\.com|googleusercontent|api[_-]?key|token=|password/i);
        assert.equal(item.sourceObservationCount, item.sourceObservationIds.length);
        assert.ok(!/coming|planned|closed/.test(item.status), `${item.id}: ${item.status}`);
        assert.ok(!/^\W*(atm|toilets?|restrooms?|parking|information|lifts?|prayer)\b|ห้องน้ำ|ที่จอดรถ|ตู้เอทีเอ็ม/i.test(item.name), `${item.id}: ${item.name} is a facility`);
        if (item.registeredChildVenueId) assert.equal(venues.get(item.registeredChildVenueId)?.parentId, vid, `${item.id}: a component of its host`);
        if (item.brandId) assert.equal(item.brandLinked, true);
        if (item.logo) assert.match(item.logo.sha256, /^[a-f0-9]{64}$/);
        const roster = rosterKeys.get(vid) || new Set();
        assert.ok(!roster.has(item.id) && !item.sourceObservationIds.some(k => roster.has(k)), `${item.id}: already in the roster`);
      }
      assert.deepEqual(roles, counts.venues[vid].roles, `${vid}: roles`);
      items += v.items.length;
    }
  }
  assert.equal(items, counts.meta.items);
  assert.equal(Object.keys(counts.venues).length, counts.meta.venues);
  assert.equal(report.entries.directoryItems, items);
});

test('published directory: every exported row has one disposition, bound to the roster and the core it was built against', () => {
  const r = report.rows;
  assert.equal(r.shownAsDirectoryItems + r.alreadyShownByRoster + r.held, report.input.rows);
  assert.equal(Object.values(r.byReason).reduce((a, b) => a + b, 0), report.input.rows);
  assert.match(report.input.sha256, /^[a-f0-9]{64}$/);
  const roster = createHash('sha256');
  for (let n = 0; n < 32; n++) roster.update(bytes(`data/tenants/${String(n).padStart(2, '0')}.json`));
  assert.equal(report.rosterSha256, roster.digest('hex'), 'the roster changed: rebuild data/directory (scripts/build-directory-listings.py)');
  assert.equal(report.venueCoreSha256, createHash('sha256').update(bytes('data/venues.json')).digest('hex'), 'the venue core changed: rebuild data/directory');
  const text = shards.map(f => readFileSync(new URL(`../data/directory/${f}`, import.meta.url), 'utf8')).join('') + JSON.stringify(report) + JSON.stringify(counts);
  assert.doesNotMatch(text, /docs\.google\.com|drive\.google\.com|googleusercontent|\/Users\/|\/private\/|\/mnt\/|scratchpad/);
  // the export's brand references carry the research sheets' file ids; only brand ids may reach the page
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![A-Za-z0-9_-])';
  assert.doesNotMatch(text, new RegExp(`(?<![A-Za-z0-9_-])(?!${uuid})1[A-Za-z0-9_-]{32,43}(?![A-Za-z0-9_-])|"book"|matched_brand_refs`));
});

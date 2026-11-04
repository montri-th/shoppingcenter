// Named-host research datasets (scripts/link-research-tenants.py) on a small fixture: current, official, named-host rows
// enter; candidates, stockists, held, far and conflicting rows stay out; one item per BRANCH (D23, owner 4 Nov 2026:
// “เมกาบางนา มี Starbucks 3 สาขา”) — distinct entries of one brand at one venue are distinct branches, the same branch from
// another publisher or dataset is one item; an Apparel row that cites a Sport outlet is the same shop; reviewed datasets
// (Beauty, Beauty Clinic, Playground, Car Service) enter only through scripts/review-candidate-hosts.py (owner 4 Nov 2026:
// “ผูกกับศูนย์การค้าให้ถูกต้อง อย่าเดา”); canonical items stay byte for byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const script = new URL('../scripts/link-research-tenants.py', import.meta.url).pathname;
const reviewModule = new URL('../scripts/review-candidate-hosts.py', import.meta.url).pathname;
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const FOLDERS = ['sport', 'apparel', 'furniture', 'pet', 'massage_spa', 'salon_barber', 'nail', 'beauty', 'beauty_clinic', 'playground', 'car_service'];
const COLUMNS = ['brand_name', 'store_name', 'segment', 'scope_group', 'scope_status', 'store_format', 'evidence_status', 'source_type', 'source_url',
  'status_source_url', 'status_checked_on', 'checked_on', 'unit_floor', 'latitude', 'longitude', 'outlet_id', 'brand_id', 'operating_status',
  'listing_status', 'common_retail_venue_ids', 'common_retail_venue_link_status', 'host_join_method', 'host_venue_id', 'host_join_status',
  'record_role', 'record_count_status', 'counting_status', 'count_role', 'closure_source_conflict', 'map_audit_status', 'location_context',
  'duplicate_review', 'source_observation_role', 'common_retail_venue_candidate_ids', 'citymeter_shopping_center_id', 'clinic_count_role',
  'entity_class', 'source_listing_role', 'province', 'dedup_review_status', 'venue'];
const csv = rows => [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') + '\n';

const sport = (over = {}) => ({brand_name: 'Sport Brand', store_name: 'Sport Brand Centre One', segment: 'running', scope_group: 'core_extended',
  store_format: 'mono_brand_store', evidence_status: 'primary_listed', source_type: 'official_publisher_locator', source_url: 'https://brand.example/stores',
  checked_on: '2026-11-03 00:00:00', unit_floor: 'Floor 2', latitude: '13.7001', longitude: '100.5001', outlet_id: 'OUT-1', brand_id: 'BR-1',
  operating_status: 'source_listed_not_field_verified', common_retail_venue_ids: 'V1', common_retail_venue_link_status: 'named_host_evidence_not_field_verified',
  host_join_method: 'source_named_host_unique_registry_match', record_role: 'retail_banner', record_count_status: 'active_source_candidate', ...over});
const apparel = (over = {}) => ({brand_name: 'Shop A', store_name: 'Shop A Centre Two', segment: 'womenswear', scope_group: 'core_extended', store_format: 'brand_shop',
  evidence_status: 'official_brand_locator', source_url: 'https://shop-a.example/stores', checked_on: '2026-11-03 00:00:00', unit_floor: '1st Floor · 02-1234567',
  outlet_id: 'OUT-A1', brand_id: 'BR-A', operating_status: 'source_listed', common_retail_venue_ids: 'V2', common_retail_venue_link_status: 'source_named_host_not_field_verified',
  host_join_method: 'source_exact_named_host_registry_alias', record_role: 'retail_banner', ...over});
// Reviewed datasets: the sheet only recorded a candidate host.
const beauty = (over = {}) => ({brand_name: 'Glow Beauty', store_name: 'Glow Beauty Centre One', scope_group: 'approved_core', store_format: 'brand_store',
  evidence_status: 'source_pos_candidate', source_type: 'official_brand_locator', source_url: 'https://glow.example/stores', checked_on: '2026-11-03',
  latitude: '13.7002', longitude: '100.5002', outlet_id: 'B-1', brand_id: 'BB-1', operating_status: 'source_listed', count_role: 'count_source_pos_candidate',
  common_retail_venue_link_status: 'candidate_requires_confirmation', common_retail_venue_candidate_ids: 'V1', ...over});
const carService = (over = {}) => ({brand_name: 'Car Care', store_name: 'Car Care Centre One', scope_group: 'owner_approved', evidence_status: 'source_listed',
  source_url: 'https://carcare.example/branches', checked_on: '2026-11-04', outlet_id: 'C-1', brand_id: 'CB-1', operating_status: 'source_listed_not_field_verified',
  source_listing_role: 'service_branch', common_retail_venue_link_status: 'candidate_not_selected', common_retail_venue_candidate_ids: 'V1', ...over});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-research-tenants-'));
  const exports = join(dir, 'exports'), tenants = join(dir, 'tenants');
  mkdirSync(tenants);
  for (const f of FOLDERS) mkdirSync(join(exports, f), {recursive: true});
  writeFileSync(join(dir, 'venues.json'), JSON.stringify({meta: {coreFields: ['id', 'name', 'nameEn', 'lat', 'lon', 'storeCount']}, rows: [
    {id: 'V1', name: 'เซ็นเตอร์ วัน', nameEn: 'Centre One', lat: 13.7, lon: 100.5, storeCount: 1},
    {id: 'V2', name: 'เซ็นเตอร์ ทู', nameEn: 'Centre Two', lat: 13.8, lon: 100.6, storeCount: 0}]}));
  const canonical = {id: 'research.TH.luxury:02_STORES:L1', name: 'Existing Brand · Centre One', brand: 'Existing Brand', dataset: 'research.TH.luxury',
    sourceRole: 'registry_accepted_primary', sourceUrl: 'https://existing.example/'};
  const meta = {schemaVersion: '1', asOf: '2026-10-26', shards: 32};
  // shard_of('V1') — the FNV-1a hash of build-tenant-data.py; compute it the same way here.
  const shardOf = value => { let h = 0x811c9dc5; for (const b of Buffer.from(value)) h = Math.imul(h ^ b, 0x01000193) >>> 0; return h % 32; };
  for (let n = 0; n < 32; n++) writeFileSync(join(tenants, `${String(n).padStart(2, '0')}.json`), JSON.stringify({meta, venues: n === shardOf('V1') ? {V1: {observations: 1, sourceObservationCount: 1, items: [canonical]}} : {}}));
  writeFileSync(join(tenants, 'build-report.json'), JSON.stringify({asOf: '2026-10-26', limits: ['Venue core rows and aggregate store counts are not rewritten by this build.'], linkedDatasets: {}}));
  writeFileSync(join(exports, 'sport', '02_STORES.csv'), csv([
    sport(),
    // D23: the publisher's own second entry on another floor is a second branch
    sport({outlet_id: 'OUT-2', store_name: 'Sport Brand Centre One Floor 3', unit_floor: 'Floor 3'}),
    // D23: the same branch from the mall's directory (same floor, other publisher) is the same item
    sport({outlet_id: 'OUT-10', source_url: 'https://centre-one.example/directory', store_name: 'Sport Brand', unit_floor: 'Floor 2'}),
    sport({outlet_id: 'OUT-3', scope_group: 'candidate'}),
    sport({outlet_id: 'OUT-4', record_role: 'authorized_stockist', brand_id: 'BR-4', brand_name: 'Product Brand'}),
    sport({outlet_id: 'OUT-5', brand_id: 'BR-5', brand_name: 'Far Brand', latitude: '13.75', longitude: '100.55'}),
    sport({outlet_id: 'OUT-6', brand_id: 'BR-6', brand_name: 'Conflict Brand', closure_source_conflict: 'card links to another venue'}),
    sport({outlet_id: 'OUT-7', brand_id: 'BR-7', brand_name: 'EXISTING-BRAND'}),
    sport({outlet_id: 'OUT-8', brand_id: 'BR-8', brand_name: 'Candidate Host', common_retail_venue_link_status: 'candidate_requires_confirmation'}),
    sport({outlet_id: 'OUT-9', brand_id: 'BR-9', brand_name: 'Held Brand', operating_status: 'held_not_field_verified'}),
  ]));
  writeFileSync(join(exports, 'apparel', '02_STORES.csv'), csv([
    apparel(),
    // D23: a counter of the same brand, listed by the brand as its own entry on another floor, is a second branch
    apparel({outlet_id: 'OUT-A7', store_name: 'Shop A Counter Centre Two', unit_floor: '3rd Floor', record_role: 'host_counter_banner'}),
    apparel({outlet_id: 'OUT-A2', brand_id: 'BR-A2', brand_name: 'Cited Shop'}),
    // no floor to tell it from the Sport Brand branches already listed at V1: the same shop
    apparel({outlet_id: 'OUT-A3', brand_id: 'BR-A3', brand_name: 'Sport Brand', common_retail_venue_ids: 'V1'}),
    apparel({outlet_id: 'OUT-A4', brand_id: 'BR-A4', brand_name: 'Outside', common_retail_venue_ids: 'V9'}),
    apparel({outlet_id: 'OUT-A5', brand_id: 'BR-A5', brand_name: 'Pickup', store_format: 'publisher_pomelo_store_pickup_listing'}),
    // An internal document link (built from parts: public files never carry the literal host).
    apparel({outlet_id: 'OUT-A6', brand_id: 'BR-A6', brand_name: 'Docs Link', source_url: ['https://docs', 'google', 'com/spreadsheets/d/x'].join('.')}),
  ]));
  writeFileSync(join(exports, 'apparel', '17_CROSS_DATASET_LINKS.csv'), 'apparel_entity_id,entity_type,source_dataset_id,source_entity_id\nOUT-A2,outlet_candidate,research.TH.sport,OUT-1\n');
  writeFileSync(join(exports, 'beauty', '02_STORES.csv'), csv([
    beauty(),
    // the label names Centre Two while the sheet's candidate is Centre One: stays a candidate
    beauty({outlet_id: 'B-2', brand_id: 'BB-2', brand_name: 'Mist', store_name: 'Mist Centre Two', source_url: 'https://mist.example/stores'}),
    // the label names no registry venue (an area): stays a candidate
    beauty({outlet_id: 'B-3', brand_id: 'BB-3', brand_name: 'Dew', store_name: 'Dew Riverside Road', source_url: 'https://dew.example/stores'}),
    // a source type the sheet does not count as official
    beauty({outlet_id: 'B-4', brand_id: 'BB-4', brand_name: 'Rose', store_name: 'Rose Centre One', source_type: 'marketplace_listing'}),
  ]));
  writeFileSync(join(exports, 'car_service', '02_STORES.csv'), csv([
    // “before reaching Centre One”: the centre is a landmark, the branch is outside it
    carService({store_name: 'Car Care (ก่อนถึง Centre One)'}),
    // a directory page is not the brand's own source
    carService({outlet_id: 'C-2', brand_id: 'CB-2', brand_name: 'Tyre Plus', store_name: 'Tyre Plus Centre One', source_url: 'https://www.wongnai.com/x'}),
    // the brand's own page, the label names the candidate and its point is inside: accepted
    carService({outlet_id: 'C-3', brand_id: 'CB-3', brand_name: 'Quick Oil', store_name: 'Quick Oil (Centre One)', source_url: 'https://quickoil.example/branches',
      latitude: '13.7003', longitude: '100.5003'}),
  ]));
  for (const f of FOLDERS.filter(f => !['sport', 'apparel', 'beauty', 'car_service'].includes(f))) writeFileSync(join(exports, f, '02_STORES.csv'), csv([]));
  return {dir, exports, tenants, canonical};
}

test('named-host gate: current, official, single-venue listings enter as branches (D23); reviewed hosts only on evidence; canonical items unchanged', () => {
  const {dir, exports, tenants, canonical} = fixture();
  try {
    const run = () => execFileSync('python3', ['-I', script, '--exports', exports, '--exported-on', '2026-11-04', '--tenants', tenants,
      '--venues', join(dir, 'venues.json'), '--review-log', join(dir, 'review-log.csv')]);
    run();
    const report = readJSON(join(tenants, 'build-report.json'));
    const items = Array.from({length: 32}, (_, n) => readJSON(join(tenants, `${String(n).padStart(2, '0')}.json`)))
      .flatMap(shard => Object.entries(shard.venues).flatMap(([id, v]) => v.items.map(item => ({...item, venue: id}))));
    const receipt = id => report.linkedDatasets[id];
    // Sport: two branches of one brand in V1; the mall directory's entry for the floor-2 branch is the same item.
    const sportItems = items.filter(x => x.dataset === 'research.TH.sport');
    assert.equal(sportItems.length, 2);
    const floor2 = sportItems.find(x => x.sourceRowKey === 'OUT-1');
    assert.deepEqual(floor2.sourceObservationIds, ['OUT-1', 'OUT-10']);
    assert.equal(floor2.sourceObservationCount, 2);
    assert.equal(floor2.unitFloor, 'Floor 2');
    assert.equal(floor2.branch, 'Centre One');
    assert.deepEqual(floor2.sourceUrls, ['https://brand.example/stores', 'https://centre-one.example/directory']);
    assert.equal(sportItems.find(x => x.sourceRowKey === 'OUT-2').unitFloor, 'Floor 3');
    assert.deepEqual(receipt('research.TH.sport').omitted, {named_far_point_conflict: 1, closure_source_conflict_recorded: 1, not_common_retail_venue_link_status: 1,
      not_operating_status: 1, not_record_role: 1, not_scope_group: 1, same_branch_already_listed_at_venue: 1});
    // Apparel: a shop and a counter of Shop A are two branches; the cited outlet is a Sport outlet; Sport Brand with no floor is the listed shop.
    const apparelItems = items.filter(x => x.dataset === 'research.TH.apparel');
    assert.deepEqual(apparelItems.map(x => [x.brand, x.displayQualifier || '']).sort(), [['Shop A', ''], ['Shop A', 'เคาน์เตอร์']]);
    assert.equal(apparelItems.find(x => x.sourceRowKey === 'OUT-A1').unitFloor, undefined, 'a unit with a phone number is dropped');
    assert.deepEqual(receipt('research.TH.apparel').omitted, {cross_dataset_outlet_reference: 1, host_outside_public_qualified_population: 1,
      no_official_public_source_url: 1, same_branch_already_listed_at_venue: 1, store_format_out_of_scope: 1});
    assert.ok(receipt('research.TH.apparel').files['17_CROSS_DATASET_LINKS.csv']);
    // Reviewed datasets: only the rows whose official label names the candidate venue, and nothing else.
    const beautyItems = items.filter(x => x.dataset === 'research.TH.beauty');
    assert.deepEqual(beautyItems.map(x => x.sourceRowKey), ['B-1']);
    assert.equal(beautyItems[0].hostIdentityStatus, 'candidate_confirmed_by_citymeter_review');
    assert.equal(beautyItems[0].sourceGate, 'official_label_unique_registry_name');
    assert.match(beautyItems[0].identityNote, /label “centreone”/);
    assert.deepEqual(receipt('research.TH.beauty').omitted, {label_names_another_venue: 1, no_registry_host_name_in_label: 1, not_source_type: 1});
    assert.equal(receipt('research.TH.beauty').kind, 'reviewed_candidate_host');
    assert.deepEqual([receipt('research.TH.beauty').candidateRows, receipt('research.TH.beauty').reviewAccepted], [4, 1]);
    assert.deepEqual(items.filter(x => x.dataset === 'research.TH.car_service').map(x => x.sourceRowKey), ['C-3']);
    assert.deepEqual(receipt('research.TH.car_service').omitted, {label_places_shop_beside_host: 1, source_not_official: 1});
    const log = readFileSync(join(dir, 'review-log.csv'), 'utf8');
    assert.match(log, /C-1,Car Care,.*kept_candidate,label_places_shop_beside_host,ก่อนถึง/);
    assert.match(log, /B-1,Glow Beauty,.*accepted,official_label_unique_registry_name/);
    // Canonical item byte for byte; totals recomputed from the shards.
    assert.deepEqual(items.find(x => x.id === canonical.id), {...canonical, venue: 'V1'});
    assert.equal(report.publishedItems, 1 + 2 + 2 + 1 + 1);
    assert.equal(report.publishedVenueHosts, 2);
    assert.deepEqual(report.excludedDatasets, {});
    for (const item of items.filter(x => x.id !== canonical.id)) {
      assert.equal(item.sourceRole, 'dataset_source_named_host_listing');
      assert.match(item.sourceSha256, /^[0-9a-f]{64}$/);
      assert.ok(!/docs\.google/.test(JSON.stringify(item)));
    }
    // Running again gives the same files (idempotent).
    const before = readFileSync(join(tenants, 'build-report.json'), 'utf8');
    run();
    assert.equal(readFileSync(join(tenants, 'build-report.json'), 'utf8'), before);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('host review: fixed normalisation, documented renamings, chain words, landmarks and curated names', () => {
  const code = `
import importlib.util, json
spec = importlib.util.spec_from_file_location('h', ${JSON.stringify(reviewModule)}); h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
venues = {
  'V1': {'name': 'เซ็นทรัล เวสต์เกต', 'nameEn': 'Central Westgate', 'lat': 13.87, 'lon': 100.41},
  'V2': {'name': 'เซ็นทรัล บางนา', 'nameEn': 'Central Bangna', 'lat': 13.66, 'lon': 100.63},
  'V3': {'name': 'เดอะมอลล์ไลฟ์สโตร์ บางกะปิ', 'nameEn': 'The Mall Lifestore Bangkapi', 'lat': 13.76, 'lon': 100.64},
  'V4': {'name': 'เซ็นทรัล พัทยา', 'nameEn': 'Central Pattaya', 'lat': 12.93, 'lon': 100.88},
  'V5': {'name': 'เซ็นทรัล เชียงใหม่', 'nameEn': 'Central Chiangmai', 'lat': 18.8, 'lon': 99.0},
  'V6': {'name': 'เซ็นทรัล เชียงใหม่ แอร์พอร์ต', 'nameEn': 'Central Chiangmai Airport', 'lat': 18.77, 'lon': 98.97},
  'SC-007290': {'name': 'ฟิวเจอร์พาร์ค และ สเปลล์', 'nameEn': 'Future Park & Zpell', 'lat': 13.99, 'lon': 100.62},
}
i = h.HostIndex(venues)
out = {
  'silent': [i.resolve('สาขาเซ็นทรัลเวสท์เกต ชั้น 2', 'V1'), i.resolve('เซ็นทรัลเวสเกต', 'V1')],
  'lifestore': i.resolve('สาขาเดอะมอลล์บางกะปิ ชั้น M', 'V3'),
  'festival': i.resolve('เซ็นทรัลเฟสติวัล พัทยา บีช ชั้น 4', 'V4'),
  'maximal': [i.resolve('Central Plaza Chiangmai Airport', 'V6'), i.resolve('Central Plaza Chiangmai Airport', 'V5')],
  'chain': i.resolve('Central', 'V2'),
  'landmark': [i.resolve('สาขา บางจาก บางนา กม.3 (ก่อนถึงเซ็นทรัลบางนา)', 'V2'), i.resolve('Car Care near Central Bangna', 'V2')],
  'inside': i.resolve('ออโต้วัน เซ็นทรัล บางนา (ชั้นจอดใต้ดิน B2)', 'V2'),
  'curated': i.resolve('สาขาฟิวเจอร์พาร์ค รังสิต (ชั้น 1)', 'SC-007290'),
  'curatedSourced': all(src and vid in venues for _, vid, src in h.CURATED_ALIASES),
}
print(json.dumps(out, ensure_ascii=False))`;
  const r = JSON.parse(execFileSync('python3', ['-I', '-c', code], {encoding: 'utf8'}));
  assert.deepEqual(r.silent.map(x => x[0]), ['named', 'named'], 'เวสต์เกต · เวสท์เกต · เวสเกต are one name');
  assert.equal(r.lifestore[0], 'named', 'The Mall was renamed The Mall Life Store');
  assert.equal(r.festival[0], 'named', 'CentralFestival Pattaya Beach is Central Pattaya');
  assert.deepEqual(r.maximal.map(x => x[0]), ['named', 'label_also_names_another_venue'], 'the longest name wins; the shorter one is not the host');
  assert.equal(r.chain[0], 'no_registry_host_name_in_label', 'a chain word alone never names a host');
  assert.deepEqual(r.landmark.map(x => x[0]), ['label_places_shop_beside_host', 'label_places_shop_beside_host']);
  assert.equal(r.inside[0], 'named');
  assert.equal(r.curated[0], 'named');
  assert.equal(r.curatedSourced, true, 'every curated name carries its source');
});

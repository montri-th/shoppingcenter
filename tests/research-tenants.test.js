// Named-host research datasets (scripts/link-research-tenants.py): the gate on a small fixture — current, official,
// named-host rows enter; candidates, stockists, held, far and conflicting rows stay out; one brand once per venue;
// an Apparel row that cites a Sport outlet is the same shop; canonical items stay byte for byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const script = new URL('../scripts/link-research-tenants.py', import.meta.url).pathname;
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const FOLDERS = ['sport', 'apparel', 'furniture', 'pet', 'massage_spa', 'salon_barber', 'nail'];
const COLUMNS = ['brand_name', 'store_name', 'segment', 'scope_group', 'scope_status', 'store_format', 'evidence_status', 'source_type', 'source_url',
  'status_source_url', 'status_checked_on', 'checked_on', 'unit_floor', 'latitude', 'longitude', 'outlet_id', 'brand_id', 'operating_status',
  'listing_status', 'common_retail_venue_ids', 'common_retail_venue_link_status', 'host_join_method', 'host_venue_id', 'host_join_status',
  'record_role', 'record_count_status', 'counting_status', 'count_role', 'closure_source_conflict', 'map_audit_status', 'location_context',
  'duplicate_review', 'source_observation_role'];
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

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-research-tenants-'));
  const exports = join(dir, 'exports'), tenants = join(dir, 'tenants');
  mkdirSync(tenants);
  for (const f of FOLDERS) mkdirSync(join(exports, f), {recursive: true});
  writeFileSync(join(dir, 'venues.json'), JSON.stringify({meta: {coreFields: ['id', 'lat', 'lon', 'storeCount']}, rows: [
    {id: 'V1', lat: 13.7, lon: 100.5, storeCount: 1}, {id: 'V2', lat: 13.8, lon: 100.6, storeCount: 0}]}));
  const canonical = {id: 'research.TH.luxury:02_STORES:L1', name: 'Existing Brand · Centre One', brand: 'Existing Brand', dataset: 'research.TH.luxury',
    sourceRole: 'registry_accepted_primary', sourceUrl: 'https://existing.example/'};
  const meta = {schemaVersion: '1', asOf: '2026-10-26', shards: 32};
  // shard_of('V1') — the FNV-1a hash of build-tenant-data.py; compute it the same way here.
  const shardOf = value => { let h = 0x811c9dc5; for (const b of Buffer.from(value)) h = Math.imul(h ^ b, 0x01000193) >>> 0; return h % 32; };
  for (let n = 0; n < 32; n++) writeFileSync(join(tenants, `${String(n).padStart(2, '0')}.json`), JSON.stringify({meta, venues: n === shardOf('V1') ? {V1: {observations: 1, sourceObservationCount: 1, items: [canonical]}} : {}}));
  writeFileSync(join(tenants, 'build-report.json'), JSON.stringify({asOf: '2026-10-26', limits: ['Venue core rows and aggregate store counts are not rewritten by this build.'], linkedDatasets: {}}));
  writeFileSync(join(exports, 'sport', '02_STORES.csv'), csv([
    sport(),
    sport({outlet_id: 'OUT-2', store_name: 'Sport Brand Centre One Floor 3', unit_floor: 'Floor 3'}),
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
    apparel({outlet_id: 'OUT-A2', brand_id: 'BR-A2', brand_name: 'Cited Shop'}),
    apparel({outlet_id: 'OUT-A3', brand_id: 'BR-A3', brand_name: 'Sport Brand', common_retail_venue_ids: 'V1'}),
    apparel({outlet_id: 'OUT-A4', brand_id: 'BR-A4', brand_name: 'Outside', common_retail_venue_ids: 'V9'}),
    apparel({outlet_id: 'OUT-A5', brand_id: 'BR-A5', brand_name: 'Pickup', store_format: 'publisher_pomelo_store_pickup_listing'}),
    // An internal document link (built from parts: public files never carry the literal host).
    apparel({outlet_id: 'OUT-A6', brand_id: 'BR-A6', brand_name: 'Docs Link', source_url: ['https://docs', 'google', 'com/spreadsheets/d/x'].join('.')}),
  ]));
  writeFileSync(join(exports, 'apparel', '17_CROSS_DATASET_LINKS.csv'), 'apparel_entity_id,entity_type,source_dataset_id,source_entity_id\nOUT-A2,outlet_candidate,research.TH.sport,OUT-1\n');
  for (const f of FOLDERS.filter(f => !['sport', 'apparel'].includes(f))) writeFileSync(join(exports, f, '02_STORES.csv'), csv([]));
  return {dir, exports, tenants, canonical};
}

test('named-host gate: only current, official, single-venue listings enter; one brand once per venue; canonical items unchanged', () => {
  const {dir, exports, tenants, canonical} = fixture();
  try {
    execFileSync('python3', ['-I', script, '--exports', exports, '--exported-on', '2026-11-04', '--tenants', tenants, '--venues', join(dir, 'venues.json')]);
    const report = readJSON(join(tenants, 'build-report.json'));
    const items = Array.from({length: 32}, (_, n) => readJSON(join(tenants, `${String(n).padStart(2, '0')}.json`)))
      .flatMap(shard => Object.entries(shard.venues).flatMap(([id, v]) => v.items.map(item => ({...item, venue: id}))));
    const sportReceipt = report.linkedDatasets['research.TH.sport'], apparelReceipt = report.linkedDatasets['research.TH.apparel'];
    // Sport: two outlets of one brand in V1 become one item; candidate scope, stockist, far point, conflict, existing brand, candidate host and held stay out.
    const sportItems = items.filter(x => x.dataset === 'research.TH.sport');
    assert.equal(sportItems.length, 1);
    assert.equal(sportItems[0].sourceObservationCount, 2);
    assert.deepEqual(sportItems[0].sourceObservationIds, ['OUT-1', 'OUT-2']);
    assert.equal(sportItems[0].unitFloor, 'Floor 2 · Floor 3');
    assert.equal(sportItems[0].branch, 'Centre One');
    assert.deepEqual(sportReceipt.omitted, {named_far_point_conflict: 1, closure_source_conflict_recorded: 1, not_common_retail_venue_link_status: 1,
      not_operating_status: 1, not_record_role: 1, not_scope_group: 1, same_brand_already_listed_at_venue: 1});
    // Apparel: the cited outlet is the same shop as a Sport outlet; Sport Brand is already listed in V1; V9 is outside; pickup and private links out.
    const apparelItems = items.filter(x => x.dataset === 'research.TH.apparel');
    assert.deepEqual(apparelItems.map(x => x.brand), ['Shop A']);
    assert.equal(apparelItems[0].unitFloor, undefined, 'a unit with a phone number is dropped');
    assert.deepEqual(apparelReceipt.omitted, {cross_dataset_outlet_reference: 1, host_outside_public_qualified_population: 1,
      no_official_public_source_url: 1, same_brand_already_listed_at_venue: 1, store_format_out_of_scope: 1});
    assert.equal(apparelReceipt.publishedItems, 1);
    assert.ok(apparelReceipt.files['17_CROSS_DATASET_LINKS.csv']);
    // Canonical item byte for byte; totals recomputed from the shards.
    assert.deepEqual(items.find(x => x.id === canonical.id), {...canonical, venue: 'V1'});
    assert.equal(report.publishedItems, 3);
    assert.equal(report.publishedVenueHosts, 2);
    for (const item of [...sportItems, ...apparelItems]) {
      assert.equal(item.sourceRole, 'dataset_source_named_host_listing');
      assert.match(item.sourceSha256, /^[0-9a-f]{64}$/);
      assert.ok(!/docs\.google/.test(JSON.stringify(item)));
    }
    // Running again gives the same files (idempotent).
    const before = readFileSync(join(tenants, 'build-report.json'), 'utf8');
    execFileSync('python3', ['-I', script, '--exports', exports, '--exported-on', '2026-11-04', '--tenants', tenants, '--venues', join(dir, 'venues.json')]);
    assert.equal(readFileSync(join(tenants, 'build-report.json'), 'utf8'), before);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

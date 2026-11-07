import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {shardOf} from '../js/details.js';
import {rankTenants, TENANT_ROLE_LABELS} from '../js/tenants.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const core = new Map(read('data/venues.json').rows.map(row => [row.id, row]));
const shards = readdirSync(new URL('../data/tenants/', import.meta.url)).filter(f => /^\d{2}\.json$/.test(f));
const profiles = read('data/tenant-profiles.json');

test('published tenant shards, source roles, counts and local logo bytes reconcile; no candidate enters the panel', () => {
  assert.equal(shards.length, 32);
  const seen = new Set(), logos = new Map();
  let hosts = 0, displayed = 0, observations = 0;
  for (const file of shards) {
    const shard = read('data/tenants/' + file);
    assert.equal(shard.meta.shards, 32);
    for (const [id, roster] of Object.entries(shard.venues)) {
      hosts++; assert.ok(core.has(id)); assert.equal(shardOf(id, 32), Number(file.slice(0, 2)));
      const ranked = rankTenants(roster.items, core.get(id), profiles.venues[id]);
      assert.equal(ranked.length, roster.items.length);
      assert.equal(new Set(ranked.map(item => item.id)).size, ranked.length);
      const primary = roster.items.filter(item => item.sourceRole === 'registry_accepted_primary');
      if (primary.length) assert.equal(primary.length, core.get(id).storeCount, id);
      let sourceCount = 0;
      for (const item of roster.items) {
        const key = `${id}|${item.id}`;
        assert.ok(!seen.has(key)); seen.add(key);
        assert.ok(item.name && item.id && item.dataset);
        if (item.sourceRole === 'owner_confirmed_tenant_state') {
          assert.equal(item.sourceAuthority, 'owner_direct_assertion');
          assert.match(item.ownerAssertionDate, /^\d{4}-\d{2}-\d{2}$/);
          assert.match(item.sourceSha256, /^[a-f0-9]{64}$/);
          assert.ok(['owner_reported_open', 'current_operation_unconfirmed'].includes(item.status));
        } else assert.ok(item.sourceUrl && /^https?:\/\/\S+$/.test(item.sourceUrl));
        assert.ok(!['owner_reported_closed', 'owner_reported_not_yet_open', 'permanently_closed'].includes(item.status));
        assert.ok(!/candidate|unreviewed|nearby/.test(item.sourceRole || ''));
        sourceCount += item.sourceObservationCount || 1;
        if (item.logo) logos.set(item.logo.file, item.logo.sha256);
      }
      assert.equal(sourceCount, roster.sourceObservationCount);
      displayed += roster.items.length; observations += sourceCount;
    }
  }
  const report = read('data/tenants/build-report.json');
  assert.equal(hosts, report.publishedVenueHosts);
  assert.equal(displayed, report.publishedItems);
  assert.equal(observations, report.publishedSourceObservations);
  for (const [file, hash] of logos) assert.equal(createHash('sha256').update(readFileSync(new URL('../' + file, import.meta.url))).digest('hex'), hash, file);
});

test('centre character profiles use existing venue IDs, public evidence and supported role names', () => {
  for (const [id, profile] of Object.entries(profiles.venues)) {
    assert.ok(core.has(id)); assert.ok(/^https:\/\//.test(profile.sourceUrl));
    assert.ok(profile.label && /^\d{4}-\d{2}-\d{2}$/.test(profile.checkedOn));
    assert.equal(new Set(profile.roleOrder).size, profile.roleOrder.length);
    for (const role of profile.roleOrder) assert.ok(TENANT_ROLE_LABELS[role], `${id}: ${role}`);
    if (profile.roleOrder.includes('dining')) assert.ok(profile.roleOrder.includes('food'), 'broad source food category stays in the intended dining position');
  }
});

test('linked datasets (build-report.linkedDatasets): pinned release, only gated listings, items and logos reconcile', () => {
  const report = read('data/tenants/build-report.json');
  const linked = Object.fromEntries(Object.entries(report.linkedDatasets || {}).filter(([, receipt]) => !receipt.kind));
  assert.deepEqual(Object.keys(linked), ['research.TH.fitness']);
  const manifest = read('assets/tenant-logos-manifest.json');
  for (const [dataset, receipt] of Object.entries(linked)) {
    assert.match(receipt.commit, /^[0-9a-f]{40}$/);
    assert.match(receipt.files['data/fitness.json'], /^[0-9a-f]{64}$/);
    const items = [], hosts = new Set();
    for (const file of shards) for (const [id, roster] of Object.entries(read('data/tenants/' + file).venues)) {
      for (const item of roster.items.filter(x => x.dataset === dataset && x.sourceRole === 'dataset_accepted_host_link')) { items.push(item); hosts.add(id); }
    }
    assert.equal(items.length, receipt.publishedItems, `${dataset}: items (a canonical rebuild must be followed by scripts/link-dataset-tenants.py)`);
    assert.equal(hosts.size, receipt.publishedVenueHosts);
    assert.equal(report.datasets[dataset], receipt.publishedItems + (report.venueNetwork?.newItemsByDataset?.[dataset] || 0));
    assert.equal(items.filter(x => x.logo).length, receipt.withLogo);
    for (const item of items) {
      assert.equal(item.sourceRole, 'dataset_accepted_host_link');
      assert.equal(item.relationshipBasis, 'research_sheet_accepted_identity_and_located_in_single_registry_venue');
      assert.equal(item.hostIdentityStatus, 'accepted_identity_and_located_in');
      assert.equal(item.status, 'source_listed');
      assert.equal(item.sourceArtifactKey, `montri-th/fitness@${receipt.commit.slice(0, 7)}:data/fitness.json`);
      assert.equal(item.sourceSha256, receipt.files['data/fitness.json']);
      assert.equal(item.id, `${dataset}:02_STORES:${item.sourceRowKey}`);
      assert.ok(/^https:\/\/\S+$/.test(item.sourceUrl) && !/google\.com\/maps|docs\.google|drive\.google/.test(item.sourceUrl));
      assert.ok(!/ชั้น|floor|unit|โทร/i.test(item.unitFloor || ''), 'no floors, units or phone numbers from the linked dataset');
      if (item.logo) assert.deepEqual(item.logo.file, manifest[`${dataset}|${item.brandId}`].file);
    }
  }
});

const NAMED = ['research.TH.sport', 'research.TH.apparel', 'research.TH.furniture', 'research.TH.pet', 'research.TH.massage_spa', 'research.TH.salon_barber', 'research.TH.nail'];
// Candidate hosts confirmed by scripts/review-candidate-hosts.py (owner 4 Nov 2026 21:23: “ผูกกับศูนย์การค้าให้ถูกต้อง อย่าเดา”).
const REVIEWED = ['research.TH.beauty', 'research.TH.beauty_clinic', 'research.TH.playground', 'research.TH.car_service'];
const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('th-TH').replace(/[\s​'’"`.,·\-–—/()]+/g, '');

test('named-host research datasets: receipts, gated items, one item per branch (D23), canonical items untouched', () => {
  const report = read('data/tenants/build-report.json');
  const linked = Object.entries(report.linkedDatasets || {});
  const named = linked.filter(([, receipt]) => receipt.kind === 'named_host_listing');
  const reviewed = linked.filter(([, receipt]) => receipt.kind === 'reviewed_candidate_host');
  assert.deepEqual(named.map(([dataset]) => dataset), NAMED, 'processing order: Sport before Apparel');
  assert.deepEqual(reviewed.map(([dataset]) => dataset), REVIEWED);
  assert.deepEqual(report.excludedDatasets || {}, {}, 'no dataset is left out; candidates enter only through the review');
  const byVenue = new Map();
  for (const file of shards) for (const [id, roster] of Object.entries(read('data/tenants/' + file).venues)) byVenue.set(id, roster.items);
  for (const [dataset, receipt] of [...named, ...reviewed]) {
    assert.match(receipt.files['02_STORES.csv'], /^[0-9a-f]{64}$/);
    assert.match(receipt.exportedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(receipt.unit, /one branch/);
    assert.ok(!/docs\.google|drive\.google|spreadsheets\/d\//.test(JSON.stringify(receipt)), 'no private links or sheet ids in the receipt');
    const items = [], hosts = new Set();
    for (const [id, list] of byVenue) for (const item of list.filter(x => x.dataset === dataset && x.sourceRole === 'dataset_source_named_host_listing')) { items.push(item); hosts.add(id); }
    assert.equal(items.length, receipt.publishedItems, `${dataset}: run scripts/link-research-tenants.py after every roster rebuild`);
    assert.equal(hosts.size, receipt.publishedVenueHosts);
    assert.equal(report.datasets[dataset] || 0, receipt.publishedItems + (report.venueNetwork?.newItemsByDataset?.[dataset] || 0));
    assert.equal(items.reduce((n, x) => n + (x.sourceObservationCount || 1), 0), receipt.publishedSourceObservations);
    if (receipt.kind === 'reviewed_candidate_host') {
      assert.ok(receipt.candidateRows >= receipt.reviewAccepted && receipt.reviewAccepted >= receipt.publishedSourceObservations, dataset);
      assert.match(receipt.gate, /review-candidate-hosts\.py/);
    }
    for (const item of items) {
      assert.equal(item.sourceRole, 'dataset_source_named_host_listing');
      assert.equal(item.relationshipBasis, 'research_dataset_official_source_explicit_host_label_unique_registry_alias_no_far_point_conflict');
      assert.equal(item.sourceSha256, receipt.files['02_STORES.csv']);
      assert.ok(item.sourceArtifactKey.endsWith(`02_STORES export ${receipt.exportedOn}`));
      assert.equal(item.id, `${dataset}:02_STORES:${item.sourceRowKey}`);
      assert.ok(item.checkedOn <= receipt.exportedOn);
      assert.ok(/^https?:\/\/\S+$/.test(item.sourceUrl) && !/google\.[a-z.]+\/maps|docs\.google|drive\.google/.test(item.sourceUrl));
      assert.ok(!/(?:\+66|0)\s?\d[\d\s-]{6,}/.test(item.unitFloor || ''), 'no phone numbers as units');
      assert.ok(!/held|historical|planned|announced|closed|candidate/.test(item.status), item.status);
      if (receipt.kind === 'reviewed_candidate_host') {
        assert.equal(item.hostIdentityStatus, 'candidate_confirmed_by_citymeter_review');
        assert.equal(item.sourceGate, 'official_label_unique_registry_name');
        assert.match(item.identityNote, /^(brand|host) source · label “[^”]+”/);
      }
      if (item.sourceObservationCount > 1) assert.equal(item.sourceObservationIds.length, item.sourceObservationCount);
    }
  }
  // D23: a brand may have several branches at one venue, but never the same branch twice.
  for (const [id, list] of byVenue) {
    const seen = new Set();
    for (const item of list.filter(x => x.sourceRole === 'dataset_source_named_host_listing')) {
      const key = [normalize(item.displayBrand || item.brand), normalize(item.name), item.unitFloor || '', item.displayQualifier || ''].join('|');
      assert.ok(!seen.has(key), `${id}: ${item.name} listed twice`);
      seen.add(key);
    }
  }
});

test('tenant index (data/tenant-index.json) reconciles row by row with the published shards', () => {
  const index = read('data/tenant-index.json');
  const report = read('data/tenants/build-report.json');
  const rows = [];
  for (const file of shards) for (const [id, roster] of Object.entries(read('data/tenants/' + file).venues).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    for (const item of roster.items) rows.push([id, normalize(item.displayBrand || item.brand || item.name), item.dataset, item.category || '', item.storeFormat || '']);
  }
  assert.equal(index.meta.items, report.publishedItems);
  assert.equal(index.meta.venues, report.publishedVenueHosts);
  assert.equal(index.rows.length, rows.length);
  const decoded = index.rows.map(([v, b, d, c, f]) => [index.venueIds[v], index.brands[b][0], index.datasets[d], index.categories[c], index.formats[f]]);
  const key = row => row.join('|');
  assert.deepEqual(decoded.map(key).sort(), rows.map(key).sort());
  for (const [k, name] of index.brands) assert.equal(normalize(name), k, `brand key of ${name}`);
  assert.ok(index.venueIds.every(id => core.has(id)));
});

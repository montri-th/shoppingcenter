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
  const linked = report.linkedDatasets || {};
  assert.deepEqual(Object.keys(linked), ['research.TH.fitness']);
  const manifest = read('assets/tenant-logos-manifest.json');
  for (const [dataset, receipt] of Object.entries(linked)) {
    assert.match(receipt.commit, /^[0-9a-f]{40}$/);
    assert.match(receipt.files['data/fitness.json'], /^[0-9a-f]{64}$/);
    const items = [], hosts = new Set();
    for (const file of shards) for (const [id, roster] of Object.entries(read('data/tenants/' + file).venues)) {
      for (const item of roster.items.filter(x => x.dataset === dataset)) { items.push(item); hosts.add(id); }
    }
    assert.equal(items.length, receipt.publishedItems, `${dataset}: items (a canonical rebuild must be followed by scripts/link-dataset-tenants.py)`);
    assert.equal(hosts.size, receipt.publishedVenueHosts);
    assert.equal(report.datasets[dataset], receipt.publishedItems);
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

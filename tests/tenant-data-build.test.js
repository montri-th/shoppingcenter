import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const script = new URL('../scripts/build-tenant-data.py', import.meta.url).pathname;
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const base = {id: 'source:stores:1', name: 'ร้านตัวอย่าง', dataset: 'research.TH.example',
  brand: 'ตัวอย่าง', venueIds: ['V1'], primary: true, accepted: true,
  sourceUrl: 'https://example.com/one\nhttps://example.com/two'};

test('tenant build accepts confirmed primary hosts, excludes candidates and leaves core unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-tenant-build-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json'), out = join(dir, 'tenants');
    const core = JSON.stringify({meta: {coreFields: ['id', 'storeCount']}, rows: [{id: 'V1', storeCount: 1}]});
    writeFileSync(venues, core);
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-25'}, observations: [
      base,
      {...base, id: 'candidate', accepted: false},
      {...base, id: 'supplemental', primary: false},
      {...base, id: 'outside', venueIds: ['V2']},
    ]}));
    execFileSync('python3', [script, '--observations', observations, '--venues', venues, '--out', out]);
    const report = readJSON(join(out, 'build-report.json'));
    assert.equal(report.publishedObservations, 1);
    assert.equal(report.omitted.not_accepted_primary, 2);
    assert.equal(report.omitted.host_outside_public_qualified_population, 1);
    assert.deepEqual(report.summaryDifferences, []);
    assert.equal(readFileSync(venues, 'utf8'), core);
    const items = Array.from({length: 32}, (_, n) => readJSON(join(out, `${String(n).padStart(2, '0')}.json`)))
      .flatMap(shard => Object.values(shard.venues).flatMap(v => v.items));
    assert.equal(items[0].sourceUrl, 'https://example.com/one');
    assert.deepEqual(items[0].sourceUrls, ['https://example.com/one', 'https://example.com/two']);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('tenant build rejects conflicting duplicate source identities', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-tenant-duplicate-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json');
    writeFileSync(venues, JSON.stringify({meta: {coreFields: ['id']}, rows: [{id: 'V1'}]}));
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-25'}, observations: [base, {...base, name: 'Different'}]}));
    const result = spawnSync('python3', [script, '--observations', observations, '--venues', venues, '--out', join(dir, 'out')], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /duplicate source-qualified observation id/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('reviewed additional host listings keep display entries separate from source-card counts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-tenant-additional-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json'), out = join(dir, 'out');
    writeFileSync(venues, JSON.stringify({meta: {coreFields: ['id']}, rows: [{id: 'V1'}]}));
    const official = {...base, id: 'official', primary: false,
      sourceRole: 'official_chain_exact_named_host_listing',
      relationshipBasis: 'official_brand_or_host_directory_explicit_branch_venue_label_unique_canonical_alias_no_far_point_conflict',
      sourceObservationCount: 2, sourceObservationIds: ['one', 'two'], identityStatus: 'unresolved'};
    const grocery = {...base, id: 'grocery', primary: false,
      sourceRole: 'official_grocery_explicit_parent_host_listing',
      sourceGate: 'official_named_branch_and_unit_house_address_agree_with_existing_Main_parent_identity',
      relationshipBasis: 'official_branch_name_and_unit_address_agree_with_existing_Main_parent_venue_identity',
      registeredChildVenueId: 'child-1'};
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-25'}, observations: [
      official, grocery, {...grocery, id: 'missing-parent', registeredChildVenueId: ''},
    ]}));
    execFileSync('python3', [script, '--observations', observations, '--venues', venues, '--out', out]);
    const report = readJSON(join(out, 'build-report.json'));
    assert.equal(report.publishedItems, 2);
    assert.equal(report.publishedSourceObservations, 3);
    assert.equal(report.omitted.not_accepted_primary, 1);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('published tenant file counts and verified logo bytes match their receipts', () => {
  const root = new URL('../', import.meta.url).pathname;
  const report = readJSON(join(root, 'data/tenants/build-report.json'));
  let total = 0, sources = 0, hosts = 0, logos = 0;
  const ids = new Set();
  for (let n = 0; n < report.shards; n++) {
    const shard = readJSON(join(root, 'data/tenants', `${String(n).padStart(2, '0')}.json`));
    assert.equal(shard.meta.asOf, report.asOf);
    for (const [venue, roster] of Object.entries(shard.venues)) {
      assert.ok(!ids.has(venue)); ids.add(venue); hosts++;
      assert.equal(roster.observations, roster.items.length);
      const sourceCount = roster.items.reduce((n, item) => n + (item.sourceObservationCount || 1), 0);
      assert.equal(roster.sourceObservationCount, sourceCount);
      sources += sourceCount;
      const observationIds = new Set();
      for (const row of roster.items) {
        assert.ok(!observationIds.has(row.id)); observationIds.add(row.id); total++;
        assert.ok(row.name && row.dataset);
        if (row.sourceUrl) { assert.ok(!/\s/.test(row.sourceUrl)); assert.match(row.sourceUrl, /^https?:\/\//); }
        if (row.logo) {
          logos++;
          assert.match(row.logo.file, /^assets\/tenant-logos\/[a-z0-9]+\.(svg|png|jpe?g|webp|gif)$/);
          assert.equal(createHash('sha256').update(readFileSync(join(root, row.logo.file))).digest('hex'), row.logo.sha256);
        }
      }
    }
  }
  assert.equal(total, report.publishedObservations);
  assert.equal(total, report.publishedItems);
  assert.equal(sources, report.publishedSourceObservations);
  assert.equal(hosts, report.publishedVenueHosts);
  assert.equal(logos, report.withLogo);
  assert.equal(createHash('sha256').update(readFileSync(join(root, 'data/venues.json'))).digest('hex'), report.venueCoreSha256);
});

test('retailer displays separate their identity from offered manufacturer brands', () => {
  const root = new URL('../', import.meta.url).pathname;
  const all = Array.from({length: 32}, (_, n) => readJSON(join(root, 'data/tenants', `${String(n).padStart(2, '0')}.json`)))
    .flatMap(shard => Object.values(shard.venues).flatMap(v => v.items));
  const retailers = all.filter(item => item.suppressManufacturerLogo);
  assert.equal(retailers.length, 8);
  for (const item of retailers) {
    assert.ok(item.displayName && item.displayName !== item.brand);
    assert.equal(item.logo, undefined);
    assert.ok(item.representedBrands.some(brand => brand.name === item.brand && brand.id === item.brandId));
  }
  const boutiques = all.filter(item => item.retailerRole === 'source_named_mono_brand_boutique_retailer');
  assert.equal(boutiques.length, 4);
  for (const item of boutiques) { assert.equal(item.displayName, item.name); assert.ok(item.logo); }
  const boutique = all.find(item => item.id.endsWith('POS-057f15ca0c16'));
  const pendulum = all.find(item => item.id.endsWith('POS-288d6ad47d70'));
  assert.match(boutique.sourceUrl, /siam-paragon-shopping-centre-m-1st-floor-unit-m-22-23-127$/);
  assert.ok(boutique.sourceUrls.every(url => !url.includes('emporium')));
  assert.match(boutique.supersededSourceUrl, /emporium/);
  assert.equal(pendulum.sourceUrl, 'https://pendulum.co.th/locations/');
  assert.match(pendulum.unitFloor, /M31A/);
  assert.notEqual(boutique.unitFloor, pendulum.unitFloor);
  assert.equal(boutique.status, 'source_listed');
  assert.equal(pendulum.status, 'source_listed');
});

test('original primary source observations still reconcile to unchanged venue summary counts', () => {
  const root = new URL('../', import.meta.url).pathname;
  const core = readJSON(join(root, 'data/venues.json'));
  const counts = new Map();
  for (let n = 0; n < 32; n++) {
    const shard = readJSON(join(root, 'data/tenants', `${String(n).padStart(2, '0')}.json`));
    for (const [venue, roster] of Object.entries(shard.venues)) {
      const primary = roster.items.filter(item => item.sourceRole === 'registry_accepted_primary');
      counts.set(venue, primary.reduce((sum, item) => sum + (item.sourceObservationCount || 1), 0));
    }
  }
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), 1579);
  for (const row of core.rows) assert.equal(counts.get(row.id) || 0, row.storeCount || 0, row.id);
});

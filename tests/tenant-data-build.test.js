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
const mla = {...base, id: 'mla.PARC:TENANT:1', dataset: 'research.MLA.PARC', primary: false,
  sourceRole: 'mla_dated_public_tenant_listing',
  relationshipBasis: 'mla_dated_public_branch_or_host_listing_exact_canonical_host',
  sourceGate: 'public_branch_specific_source_and_dated_membership_observation_reconciled_to_canonical_venue',
  hostIdentityStatus: 'exact_canonical_venue_verified', membershipStatus: 'source_listed_at_observation',
  observedOn: '2026-08-02', checkedOn: '2026-08-02', reconciledOn: '2026-10-25',
  status: 'dated_listing_current_operation_unconfirmed', sourceAuthority: 'google_business_profile_listing_observed_by_mla',
  sourceUrl: 'https://www.google.com/maps/place/Example/data=!4m2!3m1!1sEXAMPLE',
  sourceArtifactKey: 'MLA-PARC-TENANT-PROFILE-BRIDGE-v0.3', sourceRowKey: 'GBP-20260802-001', sourceSha256: 'a'.repeat(64)};

const outputItems = out => Array.from({length: 32}, (_, n) => readJSON(join(out, `${String(n).padStart(2, '0')}.json`)))
  .flatMap(shard => Object.values(shard.venues).flatMap(v => v.items));

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

test('MLA imports only dated public membership and never promotes candidates, movements or current-open status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-tenant-mla-gate-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json'), out = join(dir, 'out');
    const core = JSON.stringify({meta: {coreFields: ['id', 'storeCount']}, rows: [{id: 'V1', storeCount: 0}]});
    writeFileSync(venues, core);
    const rejected = [
      {accepted: false}, {primary: true}, {membershipStatus: 'candidate'}, {membershipStatus: 'opening_announced'},
      {status: 'opened'}, {status: 'permanently_closed'}, {eventType: 'opening_announced'},
      {hostIdentityStatus: 'name_candidate'}, {venueIds: ['V1', 'V2']},
      {observedOn: ''}, {observedOn: '2026-02-31'}, {observedOn: '2026-11-01'}, {sourceDate: '2026-12-01'},
      {sourceRole: 'registry_accepted_primary'}, {sourceAuthority: 'internal_proposal'}, {sourceSha256: ''},
      {sourceUrl: 'https://example.com/'}, {sourceUrl: 'https://www.google.com/search?q=shops'},
      {sourceUrl: 'https://www.google.com/maps/search/?api=1&query=nearby+shops'},
    ].map((patch, i) => ({...mla, ...patch, id: `mla.PARC:rejected:${i}`}));
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-25'}, observations: [mla, ...rejected]}));
    execFileSync('python3', [script, '--observations', observations, '--venues', venues, '--out', out]);
    const report = readJSON(join(out, 'build-report.json')), items = outputItems(out);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, mla.id);
    assert.equal(items[0].observedOn, '2026-08-02');
    assert.equal(items[0].checkedOn, '2026-08-02');
    assert.equal(items[0].status, 'dated_listing_current_operation_unconfirmed');
    assert.equal(items[0].hostIdentityStatus, 'exact_canonical_venue_verified');
    assert.equal(report.mlaMembership.newDisplayedListings, 1);
    assert.equal(Object.values(report.omitted).reduce((sum, n) => sum + n, 0), rejected.length);
    assert.equal(readFileSync(venues, 'utf8'), core);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('MLA evidence explicitly matched to the same existing outlet corroborates it without duplicating its shop or original source count', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-tenant-mla-dedupe-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json'), out = join(dir, 'out');
    writeFileSync(venues, JSON.stringify({meta: {coreFields: ['id', 'storeCount']}, rows: [{id: 'V1', storeCount: 1}, {id: 'V2', storeCount: 0}]}));
    const corroboration = {...mla, matchedSourceStoreIds: [base.id], dedupeDisposition: 'corroborate_existing_outlet_do_not_append'};
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-25'}, observations: [
      corroboration, base,
      {...corroboration, id: 'mla.PARC:wrong-host', venueIds: ['V2']},
      {...corroboration, id: 'mla.PARC:missing-outlet', matchedSourceStoreIds: ['not-present']},
    ]}));
    execFileSync('python3', [script, '--observations', observations, '--venues', venues, '--out', out]);
    const report = readJSON(join(out, 'build-report.json')), items = outputItems(out);
    assert.equal(report.publishedItems, 1);
    assert.equal(report.publishedSourceObservations, 1);
    assert.equal(report.mlaMembership.corroboratingExistingListings, 1);
    assert.equal(report.omitted.mla_existing_outlet_match_not_in_same_host, 2);
    assert.equal(items[0].id, base.id);
    assert.equal(items[0].status, undefined, 'the old selected status is not overwritten');
    assert.equal(items[0].corroboratingMembershipEvidence[0].id, mla.id);
    assert.equal(items[0].corroboratingMembershipEvidence[0].observedOn, '2026-08-02');
    assert.deepEqual(report.summaryDifferences, []);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('MLA exact-place URLs can use an explicit Google place ID, while internal-only evidence stays out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-tenant-mla-public-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json'), out = join(dir, 'out');
    writeFileSync(venues, JSON.stringify({meta: {coreFields: ['id']}, rows: [{id: 'V1'}]}));
    const place = {...mla, sourceUrl: 'https://www.google.com/maps/search/?api=1&query=Example&query_place_id=ChIJexample',
      privateSourceReference: 'internal-only-do-not-publish'};
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-25'}, observations: [
      place, {...mla, id: 'mla.PARC:private', sourceUrl: 'https://' + ['docs', 'google', 'com'].join('.') + '/spreadsheets/example'},
    ]}));
    execFileSync('python3', [script, '--observations', observations, '--venues', venues, '--out', out]);
    const items = outputItems(out), report = readJSON(join(out, 'build-report.json'));
    assert.equal(items.length, 1);
    assert.match(items[0].sourceUrl, /query_place_id=/);
    assert.equal(items[0].privateSourceReference, undefined);
    assert.ok(!JSON.stringify(items).includes('internal-only-do-not-publish'));
    assert.equal(report.omitted.mla_public_source_provenance, 1);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

const owner = {...base, id: 'owner:one', dataset: 'research.MLA.PARC', primary: false,
  sourceRole: 'owner_confirmed_tenant_state', sourceAuthority: 'owner_direct_assertion',
  relationshipBasis: 'owner_confirmed_scoped_identity_membership_or_state',
  sourceGate: 'direct_owner_approved_fact_no_web_verification', hostIdentityStatus: 'exact_canonical_venue_verified',
  membershipStatus: 'owner_confirmed_tenant_membership', status: 'owner_reported_open',
  sourceUrl: null, sourceUrls: [], ownerAssertionDate: '2026-10-26', observedOn: '2026-10-26', sourceDate: '2026-10-26',
  checkedOn: '2026-10-26', sourceArtifactKey: 'OWNER-RESPONSE', sourceRowKey: 'selected-one', sourceSha256: 'b'.repeat(64)};

test('scoped owner facts retain their actual authority and reject holds, closures, planned dates and unreviewed promotions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-owner-gate-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json'), out = join(dir, 'out');
    const core = JSON.stringify({meta: {coreFields: ['id', 'storeCount']}, rows: [{id: 'V1', storeCount: 0}]});
    writeFileSync(venues, core);
    const rejected = [
      {status: 'owner_reported_closed'}, {status: 'owner_reported_not_yet_open', plannedOpeningMonth: '2027-02'},
      {visibilityHold: true, plannedOpeningMonth: '2026-01'}, {publicExportEligible: false},
      {sourceAuthority: 'official_venue_directory_observed_by_mla'}, {ownerAssertionDate: '2026-10-27'},
      {ownerAssertionDate: ''}, {sourceSha256: ''}, {status: 'opened'}, {primary: true},
      {membershipStatus: 'candidate'}, {hostIdentityStatus: 'name_candidate'}, {venueIds: ['V1', 'V2']},
    ].map((patch, i) => ({...owner, ...patch, id: `owner:rejected:${i}`}));
    const identityOnly = {...owner, id: 'owner:alias', status: 'current_operation_unconfirmed',
      membershipStatus: 'owner_alias_confirmed_prior_listing', aliases: ['Moon', 'Monn']};
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-26'}, observations: [owner, identityOnly, ...rejected]}));
    execFileSync('python3', [script, '--observations', observations, '--venues', venues, '--out', out]);
    const report = readJSON(join(out, 'build-report.json')), result = outputItems(out);
    assert.equal(result.length, 2);
    assert.equal(report.ownerAssertions.newDisplayedListings, 2);
    assert.equal(result.find(row => row.id === owner.id).sourceUrl, undefined);
    assert.equal(result.find(row => row.id === identityOnly.id).status, 'current_operation_unconfirmed');
    assert.deepEqual(result.find(row => row.id === identityOnly.id).aliases, ['Moon', 'Monn']);
    assert.equal(Object.values(report.omitted).reduce((sum, n) => sum + n, 0), rejected.length);
    assert.equal(readFileSync(venues, 'utf8'), core);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('owner host corroboration reuses a dated same-host listing without replacing its status or duplicating the shop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-owner-dedupe-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json'), out = join(dir, 'out');
    writeFileSync(venues, JSON.stringify({meta: {coreFields: ['id']}, rows: [{id: 'V1'}, {id: 'V2'}]}));
    const corroboration = {...owner, status: 'current_operation_unconfirmed', matchedSourceStoreIds: [mla.id],
      dedupeDisposition: 'corroborate_existing_outlet_do_not_append'};
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-26'}, observations: [
      corroboration, mla, {...corroboration, id: 'owner:wrong-host', venueIds: ['V2']},
    ]}));
    execFileSync('python3', [script, '--observations', observations, '--venues', venues, '--out', out]);
    const result = outputItems(out), report = readJSON(join(out, 'build-report.json'));
    assert.equal(result.length, 1);
    assert.equal(result[0].id, mla.id);
    assert.equal(result[0].status, 'dated_listing_current_operation_unconfirmed');
    assert.equal(result[0].corroboratingMembershipEvidence[0].sourceAuthority, 'owner_direct_assertion');
    assert.equal(report.ownerAssertions.corroboratingExistingListings, 1);
    assert.equal(report.omitted.owner_existing_outlet_match_not_in_same_host, 1);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

const linked = {...base, id: 'research.TH.fitness:02_STORES:POS-FIT-1', dataset: 'research.TH.fitness', primary: false,
  name: 'Jetts · Gaysorn Village', brand: 'Jetts', brandId: 'BR-FIT-1', branch: 'Gaysorn Village', checkedOn: '2026-10-26',
  status: 'source_listed', sourceRole: 'dataset_accepted_host_link',
  relationshipBasis: 'research_sheet_accepted_identity_and_located_in_single_registry_venue',
  hostIdentityStatus: 'accepted_identity_and_located_in', sourceUrl: 'https://example.com/clubs/gaysorn',
  sourceArtifactKey: 'montri-th/fitness@6775063:data/fitness.json', sourceRowKey: 'POS-FIT-1', sourceSha256: 'b'.repeat(64)};

test('a linked research dataset enters only through its own gate: accepted host link, one registry venue, current source listing, public provenance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-tenant-linked-gate-'));
  try {
    const venues = join(dir, 'venues.json'), observations = join(dir, 'observations.json'), out = join(dir, 'out');
    const core = JSON.stringify({meta: {coreFields: ['id', 'storeCount']}, rows: [{id: 'V1', storeCount: 0}]});
    writeFileSync(venues, core);
    const rejected = [
      {accepted: false}, {primary: true, sourceRole: 'dataset_accepted_host_link', accepted: false},
      {dataset: 'research.TH.example'}, {relationshipBasis: 'name_match'}, {hostIdentityStatus: 'candidate_registry_duplicate_review'},
      {venueIds: ['V1', 'V2']}, {venueIds: []}, {status: 'announced_opening_soon'}, {status: 'source_status_unknown'},
      {status: 'permanently_closed'}, {checkedOn: ''}, {checkedOn: '2026-11-01'}, {sourceUrl: 'https://docs.google.com/spreadsheets/d/x'},
      {sourceSha256: ''}, {sourceArtifactKey: ''}, {sourceRowKey: ''}, {farPointConflict: true}, {visibilityHold: true},
    ].map((patch, i) => ({...linked, ...patch, id: `research.TH.fitness:02_STORES:rejected-${i}`}));
    writeFileSync(observations, JSON.stringify({meta: {asOf: '2026-10-26'}, observations: [linked, ...rejected]}));
    execFileSync('python3', [script, '--observations', observations, '--venues', venues, '--out', out]);
    const report = readJSON(join(out, 'build-report.json')), items = outputItems(out);
    assert.deepEqual(items.map(x => x.id), [linked.id]);
    assert.equal(items[0].sourceRole, 'dataset_accepted_host_link');
    assert.equal(items[0].hostIdentityStatus, 'accepted_identity_and_located_in');
    assert.equal(items[0].sourceRowKey, 'POS-FIT-1');
    assert.ok(!('farPointConflict' in items[0]) && !('accepted' in items[0]) && !('venueIds' in items[0]), 'gate inputs stay out of the item');
    assert.equal(Object.values(report.omitted).reduce((sum, n) => sum + n, 0), rejected.length);
    assert.deepEqual(report.summaryDifferences, [{venueId: 'V1', summaryObservations: 0, rosterObservations: 1}]);
    assert.equal(readFileSync(venues, 'utf8'), core, 'venue cores and primary counts are never rewritten');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

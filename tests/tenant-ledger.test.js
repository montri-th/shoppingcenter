import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('selected ledger replaces stale dataset facts, scopes owner claims and strips private raw history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-selected-ledger-'));
  try {
    const base = join(dir, 'base.json'), ledger = join(dir, 'ledger.json'), out = join(dir, 'out.json');
    const untouched = {id: 'original:one', dataset: 'research.TH.original', primary: true, name: 'Original'};
    writeFileSync(base, JSON.stringify({meta: {asOf: '2026-10-25'}, observations: [untouched,
      {id: 'selected:one', dataset: 'research.MLA.PARC', name: 'Stale', venueIds: ['OLD'], accepted: true}]}));
    const native = {observation_id: 'selected:one', registry_venue_id: 'NEW', display_name: 'Correct host',
      source_role: 'owner_confirmed_tenant_state', source_authority: 'owner_direct_assertion',
      primary_graph_observation: false, public_export_eligible: true, review_decision: 'owner_reviewed_selected_fact',
      source_match_status: 'owner_confirmed_scoped_fact', export_dataset_id: 'research.MLA.PARC',
      membership_status: 'owner_confirmed_tenant_membership', operation_status: 'current_operation_unconfirmed',
      observed_on: 46321, source_date: 46321, source_checked_on: 46321, reconciled_on: 46321,
      publication_use: 'owner_approved_selected_fact', source_artifact_key: 'OWNER-RESPONSE', source_row_key: 'ONE',
      source_sha256: 'a'.repeat(64), normalized_observation_json: JSON.stringify({
        id: 'selected:one', name: 'Stale', venueIds: ['OLD'], status: 'opened',
        sourceRowReference: 'PRIVATE-REFERENCE', rawOwnerQuote: 'PRIVATE-QUOTE',
        ownerCorroboration: {sourceOwnerQuote: 'PRIVATE-QUOTE'},
      })};
    writeFileSync(ledger, JSON.stringify([Object.keys(native), Object.values(native)]));
    execFileSync('python3', [new URL('../scripts/merge-tenant-ledger.py', import.meta.url).pathname,
      '--base', base, '--ledger', ledger, '--as-of', '2026-10-26', '--out', out]);
    const text = readFileSync(out, 'utf8'), result = JSON.parse(text);
    assert.deepEqual(result.observations[0], untouched);
    assert.equal(result.observations.length, 2);
    const selected = result.observations[1];
    assert.equal(selected.name, 'Correct host');
    assert.deepEqual(selected.venueIds, ['NEW']);
    assert.equal(selected.status, 'current_operation_unconfirmed');
    assert.equal(selected.ownerAssertionDate, '2026-10-26');
    assert.equal(selected.sourceAuthority, 'owner_direct_assertion');
    assert.equal(selected.sourceGate, 'direct_owner_approved_fact_no_web_verification');
    assert.equal(selected.primary, false);
    assert.ok(!text.includes('PRIVATE-'));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('current published owner roster excludes closed and hidden concepts, and corrects scoped identities without duplication', () => {
  const root = new URL('../data/tenants/', import.meta.url);
  const venues = Object.assign({}, ...Array.from({length: 32}, (_, n) => JSON.parse(readFileSync(new URL(`${String(n).padStart(2, '0')}.json`, root), 'utf8')).venues));
  const parc = venues['SC-000977'].items, dadfa = venues['VN-23c2cdf592bb54'].items;
  const lasalle = venues['SC-C0129'].items, littleWalk = venues['SC-000976'].items;
  for (const name of ['71 Mookata', 'ANGPANG', 'LOPIA']) assert.ok(!parc.some(item => item.brand === name));
  assert.equal(parc.filter(item => item.brand === 'The Moon Massage and Spa').length, 1);
  const moon = parc.find(item => item.brand === 'The Moon Massage and Spa');
  assert.deepEqual(moon.aliases, ['The Moon Massage and Spa', 'Monn Spa']);
  assert.equal(moon.status, 'current_operation_unconfirmed');
  assert.equal(parc.find(item => item.brand === 'ลูกก๊อ').status, 'current_operation_unconfirmed');
  for (const name of ['Chibi Soft Serve', 'MSDC', 'Pharmax', 'Baron Bar', 'Wash Me', 'Skechers']) {
    assert.equal(parc.filter(item => item.brand === name).length, 1, name);
    assert.equal(parc.find(item => item.brand === name).status, 'owner_reported_open', name);
  }
  assert.equal(dadfa.length, 1);
  assert.equal(dadfa[0].brand, 'Grill & Ground');
  assert.equal(dadfa[0].status, 'owner_reported_open');
  assert.equal(dadfa[0].logo, undefined);
  assert.equal(dadfa[0].category, undefined);
  assert.equal(lasalle.filter(item => item.brand === 'มิตรปลาจุ่ม').length, 1);
  const mit = lasalle.find(item => item.brand === 'มิตรปลาจุ่ม');
  assert.equal(mit.status, 'dated_listing_current_operation_unconfirmed');
  assert.ok(mit.corroboratingMembershipEvidence.some(item => item.sourceAuthority === 'owner_direct_assertion'));
  assert.equal(lasalle.filter(item => item.brand === 'The Fitness').length, 1);
  assert.equal(lasalle.find(item => item.brand === 'The Fitness').status, 'current_operation_unconfirmed');
  const starbucks = [lasalle, littleWalk].map(items => items.find(item => item.brand === 'Starbucks'));
  assert.ok(starbucks.every(item => item.status === 'owner_reported_open'));
  assert.notEqual(starbucks[0].id, starbucks[1].id);
});

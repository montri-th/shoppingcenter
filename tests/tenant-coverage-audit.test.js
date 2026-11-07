import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('national coverage audit separates native candidates, accepted links, publication gates and exact public evidence', () => {
  execFileSync('python3', ['-I', fileURLToPath(new URL('./test_tenant_coverage_audit.py', import.meta.url))],
    {cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8'});
});

test('published coverage receipt binds the reviewed roster, core and every newly admitted source identity', () => {
  const read = relative => readFileSync(new URL(relative, import.meta.url));
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const receipt = JSON.parse(read('../data/tenant-coverage-audit.json'));
  const reviewBytes = read('../scripts/reviewed-venue-memberships-2026-11-07.json');
  const reviewed = JSON.parse(reviewBytes).memberships;
  const rosterDigest = createHash('sha256');
  const evidence = new Map();
  const key = (dataset, source, venue) => JSON.stringify([dataset, source, venue]);
  const visit = (item, venue, rootId) => {
    for (const proof of item.sourceEvidence || []) {
      if (!proof.sourceObservationId || !item.dataset) continue;
      const id = key(item.dataset, proof.sourceObservationId, venue);
      if (!evidence.has(id)) evidence.set(id, []);
      evidence.get(id).push({proof, item, rootId});
    }
    for (const nested of item.corroboratingMembershipEvidence || []) visit(nested, venue, rootId);
  };
  for (let shard = 0; shard < 32; shard++) {
    const raw = read(`../data/tenants/${String(shard).padStart(2, '0')}.json`);
    rosterDigest.update(raw);
    for (const [venue, roster] of Object.entries(JSON.parse(raw).venues)) {
      for (const item of roster.items) visit(item, venue, item.id);
    }
  }
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.publicRosterShardCount, 32);
  assert.equal(receipt.publicRosterSha256, rosterDigest.digest('hex'), 'rerun the private native audit after roster changes');
  assert.equal(receipt.venueCoreSha256, digest(read('../data/venues.json')));
  assert.equal(receipt.reviewedMembershipReceiptSha256, digest(reviewBytes));
  assert.match(receipt.sourceBaselineCommit, /^[a-f0-9]{40,64}$/);
  assert.equal(receipt.coverage.releaseBlockingMemberships, 0);
  assert.equal(receipt.coverage.requiredAdmittedMembershipsUnaccountedFor, 0);
  assert.ok(reviewed.length > 0);
  assert.equal(receipt.coverage.requiredAdmittedSourceMemberships, reviewed.length);
  for (const row of reviewed) {
    const matches = evidence.get(key(row.dataset, row.sourceRowKey, row.venueIds[0])) || [];
    assert.equal(matches.length, 1, `${row.dataset}/${row.sourceRowKey}: new source evidence must occur exactly once`);
    const {proof, item} = matches[0];
    for (const field of ['sourceSha256', 'sourceHashScope', 'checkedOn', 'sourceUrl']) {
      assert.equal(proof[field], row[field], `${row.sourceRowKey}: stale ${field}`);
    }
    for (const id of row.canonicalOutletIds) {
      assert.ok(item.matchedSourceStoreIds.includes(id), `${row.sourceRowKey}: canonical identity changed`);
    }
    if (row.nativeVenueId !== row.venueIds[0]) {
      assert.equal(item.registeredChildVenueId, row.nativeVenueId, 'publication must preserve the native retail component');
    }
  }
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /docs\.google\.com|drive\.google\.com|\/Users\/|\/private\//);
});

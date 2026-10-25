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
        assert.ok(item.sourceUrl && /^https?:\/\/\S+$/.test(item.sourceUrl));
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

// Data contract of the published files (scripts/build-data.py). These tests read the real
// snapshot and check invariants, not snapshot constants, so they keep passing after a rebuild.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {GROUPS, PROVINCES, provinceByCode, filterVenues, hasPoint} from '../js/model.js';
import {shardOf} from '../js/details.js';

const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const venues = read('data/venues.json');
const districts = read('data/districts.geojson');
const provinces = read('data/provinces.geojson');
const buildings = read('data/venue-buildings.geojson');
const pending = read('data/pending.json');
const rows = venues.rows;
const counts = venues.meta.counts;

test('venues.json counts reconcile with its own meta', () => {
  assert.equal(rows.length, counts.qualified);
  const countable = rows.filter(r => r.countable);
  assert.equal(countable.length, counts.countable);
  const supply = countable.filter(r => r.status === 'supply');
  assert.equal(supply.length, counts.supply);
  assert.equal(supply.filter(r => hasPoint(r) && r.districtCode).length, counts.locatedSupply);
  assert.equal(supply.filter(r => !r.located).length, counts.unlocatedSupply);
  assert.equal(countable.filter(r => r.status === 'planned').length, counts.planned);
  assert.equal(countable.filter(r => r.status === 'closed').length, counts.closed);
  assert.equal(rows.length - countable.length, counts.components);
  assert.equal(filterVenues(rows, {}).length, counts.supply, 'the default filter is the supply set');
  assert.equal(pending.rows.length, counts.pendingMapped);
  assert.equal(pending.rows.filter(r => r[7] === 'reviewed').length, counts.unconfirmedMapped);
  assert.ok(counts.pendingRegistry + counts.unconfirmedRegistry >= pending.rows.length);
  assert.ok(counts.unconfirmedRegistry >= counts.unconfirmedMapped);
  const tiers = {};
  for (const r of rows) tiers[r.tier] = (tiers[r.tier] || 0) + 1;
  assert.deepEqual(tiers, counts.tiers);
  const rules = {};
  for (const r of rows) if (r.ownerRule) rules[r.ownerRule] = (rules[r.ownerRule] || 0) + 1;
  assert.deepEqual(rules, counts.ownerRules);
  assert.deepEqual(venues.meta.checks.problems, [], 'boundary codes all resolve to production codes');
});

test('every qualification status was read by a reviewed rule (new vocabulary must be classified before publishing)', () => {
  // scripts/build-data.py qualification_rule(): unknown values fall back to “pending” (never counted) and are listed
  // here; add them to the rule — or confirm they are pending — and rebuild. See README “อัปเดตข้อมูล”.
  assert.deepEqual(venues.meta.checks.qualificationFallback, []);
  const report = read('data/build-report.json');
  assert.equal(report.asOf, venues.meta.asOf);
  const byTier = {};
  for (const v of report.qualificationVocabulary) byTier[v.tier] = (byTier[v.tier] || 0) + v.rows;
  assert.equal((byTier.supported || 0) + (byTier.owner || 0) + (byTier.historical || 0) + (byTier.planned || 0), counts.qualified);
  assert.equal(byTier.pending || 0, counts.pendingRegistry);
  assert.equal(byTier.unconfirmed || 0, counts.unconfirmedRegistry);
  assert.equal(byTier.excluded || 0, counts.excludedRegistry);
  assert.equal(counts.qualified + counts.pendingRegistry + counts.unconfirmedRegistry + counts.excludedRegistry, counts.registry);
  // owner category rules are read only from owner_*_definition_accepted_* / owner_confirmed_* statuses
  for (const v of report.qualificationVocabulary) {
    if (v.tier === 'owner') assert.match(v.status, /^owner_(.+_definition_accepted(_|$)|confirmed_)/, v.status);
    if (v.status.startsWith('owner_') && v.tier !== 'owner') assert.equal(v.tier, 'excluded', v.status);
  }
});

test('every count role of a qualified row was classified (unknown roles are never counted and fail here)', () => {
  assert.deepEqual(venues.meta.checks.countRoleFallback, []);
  const report = read('data/build-report.json');
  const kinds = new Map(report.countRoleVocabulary.map(v => [v.role, v.kind]));
  for (const r of rows) {
    const kind = kinds.get(r.countRole || '');
    assert.ok(kind && kind !== 'fallback', `${r.id}: count role ${r.countRole}`);
    if (r.countable) {
      assert.equal(r.countHold, undefined, r.id);
      assert.ok(kind === 'counted' || r.countBasis === 'component-without-qualified-parent', `${r.id} counted with role ${r.countRole}`);
    } else {
      assert.ok(['component', 'duplicate', 'count-review', 'context'].includes(r.countHold), `${r.id}: hold ${r.countHold}`);
      if (kind === 'held') assert.notEqual(r.countHold, 'component', r.id);
    }
  }
  // a status that holds the count as a possible duplicate wins over a counted role
  for (const r of rows) if (/duplicate_(count_held|review)/.test(r.qualification || '')) assert.ok(!r.countable, r.id);
  const holds = {};
  for (const r of rows) if (!r.countable) holds[r.countHold] = (holds[r.countHold] || 0) + 1;
  assert.deepEqual(holds, counts.holds);
});

test('owner decision D6: a component without a qualified parent counts only when it is a shopping centre or mall', () => {
  const orphans = venues.meta.checks.componentsWithoutParent;
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const o of orphans) {
    const r = byId.get(o.id);
    assert.equal(Boolean(r.countable), o.counted, o.id);
    if (o.counted) {
      assert.equal(r.countBasis, 'component-without-qualified-parent');
      assert.ok(['mall', 'community'].includes(r.group), `${o.id} counted as ${r.group}`);
      assert.notEqual(r.countRole, 'duplicate_candidate_hold');
      assert.equal(o.hold, 'component', `${o.id}: only a component role is counted by D6`);
    } else assert.equal(r.countBasis, undefined);
  }
  assert.equal(orphans.filter(o => o.counted).length, counts.componentsCountedAsVenue);
  assert.equal(orphans.filter(o => !o.counted).length, counts.componentsWithoutParent);
  for (const r of rows) {
    if (r.countRole === 'duplicate_candidate_hold') assert.ok(!r.countable, `${r.id}: a possible duplicate is never counted`);
    if (r.countBasis) assert.ok(!r.parentId || !byId.has(r.parentId), `${r.id} has a qualified parent`);
  }
});

test('rows: ids unique, groups known, located rows carry a point and an area, unlocated rows none', () => {
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  const groupIds = new Set(GROUPS.map(g => g.id));
  const districtIds = new Set(districts.features.map(f => f.properties.code));
  for (const r of rows) {
    assert.ok(groupIds.has(r.group), `group ${r.group}`);
    assert.ok(['supply', 'planned', 'closed'].includes(r.status));
    assert.ok(['supported', 'owner', 'historical', 'planned'].includes(r.tier));
    assert.equal(Boolean(r.ownerRule), r.tier === 'owner', `${r.id}: ownerRule only on the owner tier`);
    if (r.located) {
      assert.ok(Number.isFinite(r.lat) && Number.isFinite(r.lon), r.id);
      if (r.districtCode) {
        assert.ok(districtIds.has(r.districtCode), `${r.id} → ${r.districtCode}`);
        assert.ok(provinceByCode(r.provinceCode), r.provinceCode);
      }
    } else {
      assert.equal(r.lat, undefined);
      assert.equal(r.districtCode, undefined, 'no area without a selected point');
    }
    assert.ok(!('storeCount' in r) || r.storeCount >= 0);
  }
});

test('boundaries: 77 provinces with production codes, districts with 4-digit production codes and positive areas', () => {
  assert.equal(provinces.features.length, 77);
  assert.deepEqual(new Set(provinces.features.map(f => f.properties.code)), new Set(PROVINCES.map(p => p.code)));
  assert.ok(districts.features.length >= 900);
  const codes = districts.features.map(f => f.properties.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const f of districts.features) {
    assert.match(f.properties.code, /^\d{4}$/);
    assert.ok(provinceByCode(f.properties.province));
    assert.ok(f.properties.areaKm2 > 0);
    assert.ok(Number.isFinite(f.properties.labelLon) && Number.isFinite(f.properties.labelLat));
    assert.equal(f.properties.code.slice(0, 2), provinceByCode(f.properties.province).dopa, 'district code starts with its province DOPA code');
  }
});

test('host buildings join qualified venues by id; parts render base→top; unknown height stays null', () => {
  const ids = new Set(rows.map(r => r.id));
  assert.ok(buildings.features.length > 0);
  for (const f of buildings.features) {
    const p = f.properties;
    assert.ok(p.venue_ids.length && p.venue_ids.every(id => ids.has(id)));
    assert.ok(['extrusion', 'outline'].includes(p.render_as));
    if (p.geometry_role === 'host_building_part_not_shop_unit' && p.render_as === 'extrusion') assert.ok(p.display_height_m > p.display_base_m);
    if (p.height_status === 'unknown_display_fallback') assert.equal(p.height_m, null);
    if (p.render_role === 'parent_outline_with_detailed_parts') assert.equal(p.render_as, 'outline');
  }
  const flagged = rows.filter(r => r.hasBuilding).map(r => r.id).sort();
  const joined = [...new Set(buildings.features.flatMap(f => f.properties.venue_ids))].sort();
  assert.deepEqual(flagged, joined);
});

test('detail shards hold every venue exactly once, at the shard the client computes', () => {
  const shards = venues.meta.detail.shards;
  const seen = new Map();
  for (const file of readdirSync(new URL('../data/details/', import.meta.url))) {
    const shard = read(`data/details/${file}`);
    for (const id of Object.keys(shard.venues)) {
      assert.equal(shardOf(id, shards), shard.shard, `${id} in shard ${shard.shard}`);
      assert.ok(!seen.has(id));
      seen.set(id, shard.venues[id]);
    }
  }
  assert.equal(seen.size, rows.length);
  for (const r of rows) assert.equal(seen.get(r.id).name, r.name);
});

test('public files carry no Drive/Docs links, no internal sheet ids and no credentials', () => {
  const files = ['data/venues.json', 'data/pending.json', 'data/venue-buildings.geojson', 'data/venue-logos.json',
    ...readdirSync(new URL('../data/details/', import.meta.url)).map(f => `data/details/${f}`)];
  for (const f of files) {
    const text = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/docs\.google\.com|drive\.google\.com|googleusercontent/.test(text), `${f} has a private link`);
    // “secret” as a word or key, not inside a host name such as secreta.doae.go.th (a public government site)
    assert.ok(!/api[_-]?key|(?<![a-z])secret(?![a-z.])|password|token=/i.test(text), `${f} looks like it holds a credential`);
  }
});

// Drive / Sheets file ids are 33 or 44 characters of [A-Za-z0-9_-] starting with 1 and look random
// (mixed case with digits). URL slugs such as 1919-riverside-… are lowercase words and pass.
const DRIVE_ID = /(?<![A-Za-z0-9_-])1[A-Za-z0-9_-]{32}(?:[A-Za-z0-9_-]{11})?(?![A-Za-z0-9_-])/g;
const looksRandom = t => (t.match(/[A-Z]/g) || []).length >= 3 && (t.match(/[0-9]/g) || []).length >= 2;
function publicTextFiles(dir = new URL('../', import.meta.url), out = []) {
  for (const e of readdirSync(dir, {withFileTypes: true})) {
    if (['.git', 'node_modules'].includes(e.name)) continue;
    const url = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
    if (e.isDirectory()) publicTextFiles(url, out);
    else if (/\.(json|geojson|js|mjs|py|md|html|css|webmanifest|txt|svg)$/.test(e.name)) out.push(url);
  }
  return out;
}

test('nothing in the public repository names an internal Drive or Sheets file', () => {
  const hits = [];
  for (const url of publicTextFiles()) {
    const text = readFileSync(url, 'utf8');
    for (const m of text.matchAll(DRIVE_ID)) if (looksRandom(m[0])) hits.push(`${url.pathname.split('/shoppingcenter/').pop()}: ${m[0].slice(0, 6)}…`);
  }
  assert.deepEqual(hits, []);
});

test('pending records are context only: valid points, no overlap with qualified ids', () => {
  const ids = new Set(rows.map(r => r.id));
  assert.deepEqual(pending.fields, ['id', 'name', 'lon', 'lat', 'provinceCode', 'districtCode', 'group', 'state']);
  for (const r of pending.rows) {
    assert.ok(!ids.has(r[0]), `pending ${r[0]} is also qualified`);
    assert.ok(r[2] > 97 && r[2] < 106 && r[3] > 5 && r[3] < 21);
    assert.ok(r.length === 7 || (r.length === 8 && r[7] === 'reviewed'), `${r[0]}: state is absent (awaiting review) or "reviewed"`);
  }
});

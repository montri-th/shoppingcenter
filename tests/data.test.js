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
  assert.ok(counts.pendingRegistry >= pending.rows.length);
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
  assert.equal((byTier.supported || 0) + (byTier.historical || 0) + (byTier.planned || 0), counts.qualified);
  assert.equal(byTier.pending || 0, counts.pendingRegistry);
  assert.equal(byTier.excluded || 0, counts.excludedRegistry);
  assert.equal(counts.qualified + counts.pendingRegistry + counts.excludedRegistry, counts.registry);
});

test('rows: ids unique, groups known, located rows carry a point and an area, unlocated rows none', () => {
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  const groupIds = new Set(GROUPS.map(g => g.id));
  const districtIds = new Set(districts.features.map(f => f.properties.code));
  for (const r of rows) {
    assert.ok(groupIds.has(r.group), `group ${r.group}`);
    assert.ok(['supply', 'planned', 'closed'].includes(r.status));
    assert.ok(['supported', 'historical', 'planned'].includes(r.tier));
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
    assert.ok(!/api[_-]?key|secret|password|token=/i.test(text), `${f} looks like it holds a credential`);
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
  assert.deepEqual(pending.fields, ['id', 'name', 'lon', 'lat', 'provinceCode', 'districtCode', 'group']);
  for (const r of pending.rows) {
    assert.ok(!ids.has(r[0]), `pending ${r[0]} is also qualified`);
    assert.ok(r[2] > 97 && r[2] < 106 && r[3] > 5 && r[3] < 21);
  }
});

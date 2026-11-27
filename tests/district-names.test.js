import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJSON = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('a pin inside no district takes the district the registry names (Locator.locate_by_name)', () => {
  execFileSync('python3', ['-I', fileURLToPath(new URL('./test_district_names.py', import.meta.url))], {cwd: ROOT, encoding: 'utf8'});
});

test('owner 2026-11-27: the seaside markets read the district their registry row names; refusals stay without an area', () => {
  const venues = readJSON('data/venues.json');
  const pending = readJSON('data/pending.json');
  const byId = new Map(venues.rows.map(r => [r.id, r]));
  const context = new Map(pending.rows.map(r => [r[0], r]));
  const named = venues.meta.checks.districtFromRegistryNames;
  assert.ok(Array.isArray(named), 'meta.checks.districtFromRegistryNames is written by scripts/build-data.py');
  // The three the owner named (relayed 27 Nov 08:47): pins just off the shore of Chon Buri.
  const owner = {'SC-003768': ['CBI', '2009'], 'SC-003859': ['CBI', '2001'], 'SC-003887': ['CBI', '2001']};
  for (const [id, [province, district]] of Object.entries(owner)) {
    const r = byId.get(id);
    assert.ok(r && r.located, `${id} is a located venue`);
    assert.deepEqual([r.provinceCode, r.districtCode], [province, district], id);
    assert.ok(named.some(x => x.id === id && !x.refused), `${id} is listed as placed by its names`);
  }
  for (const x of named) {
    const venue = byId.get(x.id);
    const rec = venue || context.get(x.id);
    assert.ok(rec, `${x.id} is published`);
    const [province, district] = venue ? [venue.provinceCode, venue.districtCode] : [rec[4], rec[5]];
    if (x.refused) {
      assert.equal(district ?? null, null, `${x.id}: a refused name gives no district`);
      continue;
    }
    assert.ok(x.metresOutside <= 5000, `${x.id}: the named district lies within 5 km of the pin`);
    assert.deepEqual([province, district], [x.provinceCode, x.districtCode], x.id);
    if (venue) assert.equal(venue.addrDistrict, x.district, `${x.id}: the district is the one the row names`);
  }
  // every located venue now has a district unless its names were refused
  const refused = new Set(named.filter(x => x.refused).map(x => x.id));
  const without = venues.rows.filter(r => r.located && !r.districtCode && !refused.has(r.id)).map(r => r.id);
  assert.deepEqual(without, []);
});

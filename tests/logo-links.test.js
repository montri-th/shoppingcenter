/**
 * D64 (owner 2026-11-24 07:53, VERBATIM: “ทำไมหลายร้านในศูนย์การค้าเราควรจะมี logo แล้ว แต่เวบเดโมไม่แสดงโลโก้ แก้ให้ครบทุก
 * venue และตรวจใน dataset อื่นๆด้วยในเคสนี้หาวิธีแก้ที่แก้ได้ทุกที่เหมือนกัน”): shop logos the CityMETER family already
 * verified, attached beside the bound shop lists (data/logo-links/, scripts/attach-family-logos.py, kit
 * scripts/logo-kit/citymeter_logos.py). The lists, the logo manifest and their receipts stay byte-identical.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createLogoLinkLoader, createTenantLoader, createDirectoryLoader, withLogoLinks, LOGO_LINK_SHARDS} from '../js/tenants.js';
import {shardOf} from '../js/details.js';

const ROOT = new URL('../', import.meta.url);
const bytes = path => readFileSync(new URL(path, ROOT));
const read = path => JSON.parse(bytes(path).toString('utf8'));
const sha = buf => createHash('sha256').update(buf).digest('hex');
const pad = n => String(n).padStart(2, '0');
const SHARDS = [...Array(LOGO_LINK_SHARDS).keys()].map(pad);
const BASES = new Set(['own', 'same-id', 'label', 'bilingual', 'legal', 'descriptor', 'bank']);
const PLATES = new Set(['#E5E9E6', '#FFFFFF', '#182327']);

test('the kit is the same bytes as its record (change it in every repository at once)', () => {
  const kit = read('scripts/logo-kit/kit.json');
  assert.equal(kit.name, 'citymeter-logos');
  assert.match(kit.version, /^\d+\.\d+\.\d+$/);
  for (const [path, hash] of Object.entries(kit.files)) assert.equal(sha(bytes(path)), hash, `${path} differs from citymeter-logos ${kit.version}`);
});

test('the kit rules hold (tests/test_logo_kit.py)', () => {
  const run = spawnSync('python3', ['-I', new URL('test_logo_kit.py', import.meta.url).pathname], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr || run.stdout);
});

test('logo links are bound to the shop lists they were built from', () => {
  const report = read('data/logo-links/build-report.json');
  const cat = folder => sha(Buffer.concat(SHARDS.map(n => bytes(`data/${folder}/${n}.json`))));
  assert.equal(report.inputs.rosterSha256, cat('tenants'), 'data/tenants changed: run scripts/attach-family-logos.py again');
  assert.equal(report.inputs.directorySha256, cat('directory'), 'data/directory changed: run scripts/attach-family-logos.py again');
  assert.equal(report.inputs.logoManifestSha256, sha(bytes('assets/tenant-logos-manifest.json')));
  assert.equal(report.withLogoAfter, report.withLogoBefore + report.added);
  assert.equal(report.items, report.withLogoAfter + Object.values(report.notAttached).reduce((a, b) => a + b, 0));
  assert.deepEqual(report.pool.issues, [], 'every pool file matched the record that shipped it');
});

test('every link points at a shop of that venue without its own logo, and every file is the verified one', () => {
  const report = read('data/logo-links/build-report.json');
  const byBasis = Object.fromEntries([...BASES].map(b => [b, 0]));
  const seenFiles = new Map();
  for (const n of SHARDS) {
    const shard = read(`data/logo-links/${n}.json`);
    const roster = read(`data/tenants/${n}.json`).venues;
    const directory = read(`data/directory/${n}.json`).venues;
    for (const [key, logo] of Object.entries(shard.logos)) {
      assert.match(logo.file, /^assets\/tenant-logos\/[a-z0-9]+\.(svg|png|jpe?g|webp|gif)$/);
      assert.equal(key, logo.sha256.slice(0, 20));
      assert.ok(PLATES.has(logo.background), `${logo.file}: plate ${logo.background}`);
      if (!seenFiles.has(logo.file)) seenFiles.set(logo.file, sha(bytes(logo.file)));
      assert.equal(seenFiles.get(logo.file), logo.sha256, logo.file);
    }
    for (const [venue, links] of Object.entries(shard.venues)) {
      assert.equal(pad(shardOf(venue, LOGO_LINK_SHARDS)), n, `${venue} in the wrong shard`);
      const items = new Map([...(roster[venue]?.items || []), ...(directory[venue]?.items || [])].map(item => [item.id, item]));
      for (const [id, [key, basis]] of Object.entries(links)) {
        const item = items.get(id);
        assert.ok(item, `${venue}: ${id} is not a shop of this venue`);
        assert.ok(!item.logo, `${id} already has its own logo`);
        assert.ok(!item.suppressManufacturerLogo, `${id}: a retailer never takes the brand logo`);
        assert.ok(shard.logos[key], `${id}: logo ${key} missing from the shard`);
        assert.ok(BASES.has(basis), `${id}: basis ${basis}`);
        byBasis[basis]++;
      }
    }
  }
  assert.deepEqual(byBasis, report.byBasis);
  assert.equal(Object.values(byBasis).reduce((a, b) => a + b, 0), report.added);
  assert.equal(seenFiles.size, report.files);
});

test('withLogoLinks: an own logo stays, a retailer stays without, an unsafe record is dropped', () => {
  const good = {file: 'assets/tenant-logos/abc.png', sha256: 'a'.repeat(64), background: '#FFFFFF'};
  const linked = {links: {a: ['k', 'label'], b: ['k', 'label'], c: ['k', 'own'], d: ['bad', 'label']},
    logos: {k: good, bad: {file: 'https://evil.example/x.png', sha256: 'a'.repeat(64)}}};
  const own = {file: 'assets/tenant-logos/own.png', sha256: 'b'.repeat(64)};
  const out = withLogoLinks([{id: 'a'}, {id: 'b', logo: own}, {id: 'c', suppressManufacturerLogo: true}, {id: 'd'}, {id: 'e'}], linked);
  assert.deepEqual(out[0], {id: 'a', logo: good, logoBasis: 'label'});
  assert.equal(out[1].logo, own);
  assert.equal(out[2].logo, undefined);
  assert.equal(out[3].logo, undefined);
  assert.equal(out[4].logo, undefined);
  assert.equal(withLogoLinks([{id: 'a'}], null)[0].logo, undefined);
});

const serve = async path => {
  const url = new URL(path, ROOT);
  return existsSync(url) ? {ok: true, status: 200, json: async () => JSON.parse(readFileSync(url, 'utf8'))} : {ok: false, status: 404};
};

test('the owner case: the cafés of Terminal 21 Asok (SC-001783) show the logos the family holds', async () => {
  const load = createTenantLoader(serve, {directory: createDirectoryLoader(serve), logos: createLogoLinkLoader(serve)});
  const roster = await load('SC-001783');
  const cafes = roster.items.filter(item => item.directoryRole === 'cafe');
  const has = name => cafes.find(item => item.name === name)?.logo?.sha256 || '';
  for (const name of ['After You', "Auntie Anne's", 'BreadTalk', 'Cafe Amazon', 'Coffee Today', 'Mister Donut', 'Starbucks Coffee']) {
    assert.match(has(name), /^[a-f0-9]{64}$/, `${name} has no logo`);
  }
  // Shops whose brand has no verified file anywhere in the family keep the shop symbol (no guessed logo).
  for (const name of ['Hokkaido Baked Cheese Tart', 'PONN', 'Secret Recipe']) assert.equal(has(name), '', `${name} got a logo without a verified file`);
});

test('a logo-link shard that fails leaves the list as built and says so', async () => {
  let said = 0;
  const failing = async path => (path.startsWith('data/logo-links/') ? {ok: false, status: 503} : serve(path));
  const load = createTenantLoader(failing, {directory: createDirectoryLoader(failing), logos: createLogoLinkLoader(failing, {onError: () => { said++; }})});
  const roster = await load('SC-001783');
  assert.ok(roster.items.length > 300);
  assert.equal(roster.items.filter(item => item.logoBasis).length, 0);
  assert.equal(said, 1);
});

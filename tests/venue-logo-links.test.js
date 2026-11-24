/**
 * D65 (owner 2026-11-24 07:53, VERBATIM: “… แก้ให้ครบทุก venue และตรวจใน dataset อื่นๆด้วยในเคสนี้หาวิธีแก้ที่แก้ได้ทุกที่เหมือนกัน”):
 * centre logos another CityMETER demo verified for the same venue id (data/venue-logo-links.json,
 * scripts/attach-family-venue-logos.py, kit VenuePool). data/venue-logos.json stays the research registry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {configureVenueLogos, getVenueLogo, venueLogoMarkup, withFamilyVenueLogos, FAMILY_DEMOS} from '../js/venue-logos.js';

const ROOT = new URL('../', import.meta.url);
const bytes = path => readFileSync(new URL(path, ROOT));
const read = path => JSON.parse(bytes(path).toString('utf8'));
const sha = buf => createHash('sha256').update(buf).digest('hex');
const links = read('data/venue-logo-links.json');
const registry = read('data/venue-logos.json');
const rows = new Map(read('data/venues.json').rows.map(r => [r.id, r]));
const ROLES = new Set(['venue_specific', 'parent_complex', 'shared_department_store_banner', 'shared_chain_banner']);
const PLATES = new Set(['#E5E9E6', '#FFFFFF', '#182327']);

test('the links are bound to the venues and the registry they were built from', () => {
  assert.equal(links.meta.inputs.venuesSha256, sha(bytes('data/venues.json')), 'data/venues.json changed: run scripts/attach-family-venue-logos.py again');
  assert.equal(links.meta.inputs.registrySha256, sha(bytes('data/venue-logos.json')), 'data/venue-logos.json changed: run scripts/attach-family-venue-logos.py again');
  assert.equal(links.meta.kit, `citymeter-logos ${read('scripts/logo-kit/kit.json').version}`);
  assert.equal(links.meta.counts.added, links.venues.length);
});

test('every link fills a venue the registry leaves without a logo, with a verified file', () => {
  const regKeys = new Map(registry.assets.map(a => [a.key, a]));
  const own = new Set(registry.venues.filter(v => regKeys.has(v.key)).map(v => v.id));
  const famKeys = new Map(links.assets.map(a => [a.key, a]));
  const used = new Set();
  for (const v of links.venues) {
    assert.ok(rows.has(v.id), `${v.id} is not a venue`);
    assert.ok(!own.has(v.id), `${v.id} has its own logo`);
    assert.ok(ROLES.has(v.role) && FAMILY_DEMOS[v.from], `${v.id}: role ${v.role}, from ${v.from}`);
    assert.ok(famKeys.has(v.key) || regKeys.has(v.key), `${v.id}: key ${v.key}`);
    used.add(v.key);
  }
  for (const a of links.assets) {
    assert.match(a.file, /^assets\/venue-logos-family\/[a-f0-9]{20}\.(svg|png|jpg|webp)$/);
    assert.equal(sha(bytes(a.file)), a.sha256, a.file);
    assert.equal(a.file.slice(26, 46), a.sha256.slice(0, 20));
    assert.ok(PLATES.has(a.background) && a.width > 0 && a.height > 0, a.key);
    assert.ok(used.has(a.key), `${a.key} is not used`);
    assert.ok(!regKeys.has(a.key), `${a.key} is the registry's own file`);
  }
  const files = readdirSync(new URL('assets/venue-logos-family/', ROOT)).sort();
  assert.deepEqual(files, links.assets.map(a => a.file.split('/').pop()).sort(), 'every file in the folder is one of the links');
});

test('the registry wins; the links only fill the rest', () => {
  const regKeys = new Set(registry.assets.map(a => a.key));
  const ownVenue = registry.venues.find(v => regKeys.has(v.key));
  const trick = {...links, venues: [...links.venues, {id: ownVenue.id, key: links.assets[0].key, role: 'venue_specific', from: 'camera'}]};
  const merged = withFamilyVenueLogos(registry, trick);
  configureVenueLogos(merged);
  assert.equal(getVenueLogo(ownVenue.id).key, ownVenue.key, 'a venue with its own logo keeps it');
  assert.equal(getVenueLogo(ownVenue.id).fromName, '');
  assert.equal(withFamilyVenueLogos(registry, null), registry, 'without the file nothing changes');
  const odd = withFamilyVenueLogos(registry, {assets: links.assets, venues: [{id: 'SC-001360', key: links.assets[0].key, role: 'venue_specific', from: 'elsewhere'}]});
  assert.equal(odd.venues.length, registry.venues.length, 'a link from an unknown demo is ignored');
});

test('Seacon Square and the Robinson Lifestyle branches show the logo Camera Shops verified', () => {
  configureVenueLogos(withFamilyVenueLogos(registry, links));
  const seacon = getVenueLogo('SC-001360', 'ซีคอนสแควร์ ศรีนครินทร์');
  assert.ok(seacon, 'Seacon Square has a logo');
  assert.equal(seacon.fromName, 'Camera Shops');
  assert.equal(seacon.role, 'venue_specific');
  const robinson = getVenueLogo('SC-003800');
  assert.equal(robinson?.role, 'shared_chain_banner');
  assert.equal(robinson.roleLabel, 'โลโก้เครือ', 'a shared chain banner says so on screen');
  assert.match(venueLogoMarkup('SC-001360', {name: 'ซีคอนสแควร์', size: 'lg', decorative: false}), /assets\/venue-logos-family\/[a-f0-9]{20}\.\w+" .*alt="โลโก้ ซีคอนสแควร์"/);
  assert.equal(getVenueLogo('SC-999999'), null);
});

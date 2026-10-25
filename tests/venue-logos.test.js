import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {configureVenueLogos, getVenueLogo, venueLogoMarkup, ROLE_LABELS} from '../js/venue-logos.js';

const registry = JSON.parse(readFileSync(new URL('../data/venue-logos.json', import.meta.url), 'utf8'));
const venues = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url), 'utf8'));

test('every registered logo file exists and matches the sheet sha256 byte for byte', () => {
  assert.ok(registry.assets.length > 0);
  for (const a of registry.assets) {
    const path = new URL(`../${a.file}`, import.meta.url);
    assert.ok(existsSync(path), a.file);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), a.sha256, a.file);
  }
});

test('a partial registry declares what is pending; no Drive links in the registry', () => {
  const expected = registry.meta.expected, count = registry.meta.count;
  assert.equal(count, registry.assets.length);
  if (count < expected) {
    assert.equal(registry.meta.pending.length, expected - count);
    assert.match(registry.meta.status, /^partial/);
  } else assert.equal(registry.meta.status, 'complete');
  assert.ok(!/drive\.google|docs\.google/.test(JSON.stringify(registry)));
});

test('lookup is by venue id only; unknown ids get nothing; markup is a backplate with the original file', () => {
  const coverage = configureVenueLogos(registry);
  assert.equal(coverage.assets, registry.assets.length);
  const ids = new Set(venues.rows.map(r => r.id));
  const linked = registry.venues.find(v => ids.has(v.id));
  const logo = getVenueLogo(linked.id, 'ชื่อ');
  assert.ok(logo && logo.file.startsWith('assets/venue-logos/'));
  assert.equal(getVenueLogo('no-such-venue'), null);
  assert.equal(getVenueLogo(''), null);
  const html = venueLogoMarkup(linked.id, {name: 'ชื่อ', size: 'lg', decorative: false});
  assert.ok(html.includes(`src="${logo.file}"`) && html.includes('alt="โลโก้ ชื่อ"'));
  assert.ok(html.includes(`--venue-logo-bg:${logo.background}`));
  assert.equal(venueLogoMarkup('no-such-venue'), '');
  assert.equal(ROLE_LABELS.parent_complex, 'โลโก้โครงการแม่');
});

test('a malformed catalog never throws and yields no logos', () => {
  const r = configureVenueLogos({assets: [{key: 'x', file: '../../etc/passwd'}], venues: [{id: 'a', key: 'x'}]});
  assert.equal(r.assets, 0);
  assert.equal(getVenueLogo('a'), null);
  configureVenueLogos(null);
  assert.equal(getVenueLogo('a'), null);
  configureVenueLogos(registry);
});

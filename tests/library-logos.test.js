/**
 * D66 (owner 2026-11-24 07:53 and 11:11 “เริ่มเลย”): brand logos from the research masters' logo libraries, added to the
 * logo manifest only when their bytes equal the sheet's logo_sha256 (scripts/add-library-logos.py). The receipt binds the
 * manifest it left; every library entry is a file of this repository with the recorded SHA-256.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const bytes = path => readFileSync(new URL(path, ROOT));
const read = path => JSON.parse(bytes(path).toString('utf8'));
const sha = buf => createHash('sha256').update(buf).digest('hex');
const receipt = read('data/logo-links/library-receipt.json');
const manifest = read('assets/tenant-logos-manifest.json');
const library = Object.entries(manifest).filter(([, v]) => /logo library file, SHA-256 equal to the sheet/.test(v.origin || ''));

test('the receipt names the manifest it left (run scripts/add-library-logos.py after any change to the manifest)', () => {
  assert.equal(receipt.meta.manifestSha256, sha(bytes('assets/tenant-logos-manifest.json')));
  assert.match(receipt.meta.exportedOn, /^\d{4}-\d{2}-\d{2}$/);
});

test('every library entry is a verified file of a master the receipt names, counted once', () => {
  const added = {};
  for (const [key, v] of library) {
    const dataset = key.split('|')[0];
    assert.ok(receipt.masters[dataset], `${key}: master not in the receipt`);
    assert.match(v.file, /^assets\/tenant-logos\/[a-f0-9]{20}\.(svg|png|jpg|webp|gif)$/);
    assert.equal(sha(bytes(v.file)), v.sha256, v.file);
    assert.equal(v.file.slice(20, 40), v.sha256.slice(0, 20));
    assert.ok(['#E5E9E6', '#FFFFFF', '#182327'].includes(v.background), key);
    for (const url of [v.sourceUrl, v.assetUrl].filter(Boolean)) assert.match(url, /^https:\/\/(?!(drive|docs)\.google\.com)/);
    added[dataset] = (added[dataset] || 0) + 1;
  }
  for (const [dataset, m] of Object.entries(receipt.masters)) {
    assert.equal(added[dataset] || 0, m.added, `${dataset}: added`);
    assert.match(m.exportSha256, /^[a-f0-9]{64}$/);
  }
});

test('the receipt carries no Drive or Sheets ids or links', () => {
  const text = JSON.stringify(receipt);
  assert.ok(!/google\.com|[A-Za-z0-9_-]{33,}/.test(text.replace(/[a-f0-9]{64}/g, '')), 'no private links or file ids');
});

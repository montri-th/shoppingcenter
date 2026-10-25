// The page shell: one cache tag for every entry file, and an import map that gives every module in js/
// the same tag, so a browser holding older cached modules (GitHub Pages max-age 600) never mixes them
// with a newer release (scripts/build-static.py writes the map).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('entry scripts and stylesheets share one cache tag; the import map versions every module with it', () => {
  const tags = new Set([...html.matchAll(/(?:src|href)="[^"]+\.(?:js|css)\?v=([\w.-]+)"/g)].map(m => m[1]));
  assert.equal(tags.size, 1, `one tag, found ${[...tags]}`);
  const [tag] = tags;
  const block = html.match(/<script type="importmap">(.*?)<\/script>/s);
  assert.ok(block, 'import map present');
  const map = JSON.parse(block[1]).imports;
  const modules = readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js'));
  assert.deepEqual(Object.keys(map).sort(), modules.map(f => `./js/${f}`).sort());
  for (const [from, to] of Object.entries(map)) assert.equal(to, `${from}?v=${tag}`);
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'), 'the map precedes every module script');
});

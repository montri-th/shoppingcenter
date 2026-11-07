// The map credit sits beside the map, never on it (owner 2026-11-07 14:02: “ตัดออกให้หมด เอาไปซ่อนไว้ที่อื่น ให้เห็นแผนที่ใหญ่ๆ”):
// MapLibre's control is not drawn; a short credit line sits under the map in the bottom bar; the help dialog lists the
// live credits, copied as text and http(s) links only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeHref, creditItems, renderCreditList, mirrorMapCredits} from '../js/map-credits.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Minimal node trees (nodeType 1 = element, 3 = text), as the DOM gives them.
const text = value => ({nodeType: 3, nodeValue: value, textContent: value});
const el = (name, attrs = {}, children = []) => ({nodeType: 1, nodeName: name.toUpperCase(), childNodes: children,
  getAttribute: k => attrs[k] ?? null, get textContent() { return children.map(c => c.textContent).join(''); }});
const fragment = children => ({nodeType: 11, childNodes: children});

// What MapLibre writes into its attribution container: the credits of the sources in use, joined with “ | ”.
const live = () => fragment([
  el('a', {href: 'https://openfreemap.org', target: '_blank'}, [text('OpenFreeMap')]), text(' '),
  el('a', {href: 'https://www.openmaptiles.org/', target: '_blank'}, [text('© OpenMapTiles')]), text(' Data from '),
  el('a', {href: 'https://www.openstreetmap.org/copyright', target: '_blank'}, [text('OpenStreetMap')]),
  text(' | ขอบเขตจังหวัดและเขต/อำเภอ: กรมแผนที่ทหาร (RTSD) 2562 ผ่าน '),
  el('a', {href: 'https://www.geoboundaries.org/'}, [text('geoBoundaries')]), text(' / OCHA (CC BY 3.0 IGO) | อาคาร: '),
  el('a', {href: 'https://landometer.com/v3/citymeter'}, [text('CityMETER Building V4')]),
]);

test('links: absolute http(s) only', () => {
  assert.equal(safeHref('https://www.openstreetmap.org/copyright'), 'https://www.openstreetmap.org/copyright');
  assert.equal(safeHref(' http://example.org/x '), 'http://example.org/x');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '/copyright', '//evil.example/x', 'copyright', '', null, undefined, 'https://'])
    assert.equal(safeHref(bad), null, String(bad));
});

test('the live credits split into one item per source, as text and links', () => {
  const items = creditItems(live());
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], [
    {text: 'OpenFreeMap', href: 'https://openfreemap.org/'}, {text: ' '},
    {text: '© OpenMapTiles', href: 'https://www.openmaptiles.org/'}, {text: ' Data from '},
    {text: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright'},
  ]);
  assert.equal(items[1].map(p => p.text).join(''), 'ขอบเขตจังหวัดและเขต/อำเภอ: กรมแผนที่ทหาร (RTSD) 2562 ผ่าน geoBoundaries / OCHA (CC BY 3.0 IGO)');
  assert.equal(items[1][1].href, 'https://www.geoboundaries.org/');
  assert.deepEqual(items[2], [{text: 'อาคาร: '}, {text: 'CityMETER Building V4', href: 'https://landometer.com/v3/citymeter'}]);
  assert.deepEqual(creditItems(fragment([])), []);
  assert.deepEqual(creditItems(fragment([text('  |  ')])), [], 'separators alone give nothing');
});

test('markup other than links keeps only its text; unsafe links lose their target', () => {
  const items = creditItems(fragment([
    el('img', {src: 'x', onerror: 'alert(1)'}, []), el('strong', {}, [text('Bold')]), text(' '),
    el('a', {href: 'javascript:alert(1)'}, [text('click')]), text(' '), el('script', {}, [text('evil()')]),
  ]));
  assert.equal(items.length, 1);
  assert.ok(items[0].every(p => !p.href), 'no link survives');
  assert.equal(items[0].map(p => p.text).join(''), 'Bold click evil()', 'text stays text');
});

// A document that records what renderCreditList builds.
function fakeDocument() {
  const node = tag => ({tag, attrs: {}, children: [], append(...c) { this.children.push(...c); },
    set href(v) { this.attrs.href = v; }, set target(v) { this.attrs.target = v; }, set rel(v) { this.attrs.rel = v; },
    set textContent(v) { this.children = [{text: v}]; }});
  return {createElement: node, createTextNode: v => ({text: v})};
}
function fakeList(doc) {
  return {ownerDocument: doc, children: ['static'], renders: 0, replaceChildren(...c) { this.children = c; this.renders++; }};
}

test('the list: one item per credit, links open in a new tab', () => {
  const doc = fakeDocument(), list = fakeList(doc);
  assert.equal(renderCreditList(list, creditItems(live())), 3);
  assert.equal(list.children.length, 3);
  const first = list.children[0];
  assert.equal(first.tag, 'li');
  const links = first.children.filter(c => c.tag === 'a');
  assert.deepEqual(links.map(a => a.attrs), [
    {href: 'https://openfreemap.org/', target: '_blank', rel: 'noopener'},
    {href: 'https://www.openmaptiles.org/', target: '_blank', rel: 'noopener'},
    {href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener'},
  ]);
});

test('the mirror follows MapLibre: nothing yet keeps the page list; a change re-renders once; empty keeps the last', () => {
  const classes = new Set(['maplibregl-ctrl', 'maplibregl-ctrl-attrib']);
  const inner = {childNodes: []};
  const control = {classList: {contains: c => classes.has(c)}, querySelector: s => (s === '.maplibregl-ctrl-attrib-inner' ? inner : null)};
  const map = {getContainer: () => ({querySelector: s => (s === '.maplibregl-ctrl-attrib' ? control : null)})};
  let changed = () => {};
  const watch = (target, cb) => { assert.equal(target, control); changed = cb; return () => { changed = () => {}; }; };
  const doc = fakeDocument(), list = fakeList(doc);
  const mirror = mirrorMapCredits(map, {list, watch});
  assert.ok(mirror);
  assert.equal(list.renders, 0, 'before any credit the page list stays');
  inner.childNodes = live().childNodes;
  changed();
  assert.equal(list.renders, 1);
  assert.equal(list.children.length, 3);
  changed();
  assert.equal(list.renders, 1, 'the same credits are not written again');
  classes.add('maplibregl-attrib-empty');
  inner.childNodes = [];
  changed();
  assert.equal(list.children.length, 3, 'no credit at the moment: the last list stays');
  mirror.dispose();
  assert.equal(mirrorMapCredits({getContainer: () => ({querySelector: () => null})}, {list}), null);
  assert.equal(mirrorMapCredits(map, {list: null}), null);
});

test('page: nothing on the map; a credit line under it; the live list in the help dialog', () => {
  const html = read('index.html'), css = read('styles.css'), app = read('js/app.js');
  const map = html.slice(html.indexOf('<section class="map-panel"'), html.indexOf('<section id="insights"'));
  assert.ok(map.length > 100 && !/map-credit|attribution|©/.test(map), 'the map panel holds no credit');
  const bar = html.slice(html.indexOf('<section id="insights"'), html.indexOf('<section id="results"'));
  const line = bar.match(/<p id="map-credit" class="map-credit">([\s\S]*?)<\/p>/);
  assert.ok(line, 'the credit line is in the bottom bar');
  assert.match(line[1], /© <a href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>OpenStreetMap<\/a>/);
  assert.match(line[1], /© <a href="https:\/\/www\.openmaptiles\.org\/"[^>]*>OpenMapTiles<\/a>/);
  assert.match(line[1], /<a href="https:\/\/openfreemap\.org"[^>]*>OpenFreeMap<\/a>/);
  assert.match(line[1], /<a href="#map-credits" data-open-help="map-credits" aria-label="ที่มา[^"]*"[^>]*>ที่มา<\/a>/, 'label in name');
  const dialog = html.slice(html.indexOf('<dialog id="usage-help"'), html.indexOf('</dialog>'));
  assert.match(dialog, /<section id="map-credits"[\s\S]*<ul id="map-credit-list"[\s\S]*openstreetmap\.org\/copyright[\s\S]*Open Database License/);
  assert.match(css, /\.map-panel \.maplibregl-ctrl\.maplibregl-ctrl-attrib \{ display: none !important; \}/);
  assert.doesNotMatch(css, /compact-show|attrib-height|is-attrib-compact/, 'no rule for an open credit box remains');
  assert.match(css, /\.map-credit \{[^}]*font-size: 12px;[^}]*color: var\(--text-metadata\)/);
  assert.match(app, /attributionControl: \{compact: false\}/, 'the control still collects the credits');
  assert.match(app, /mirrorMapCredits\(state\.map, \{list: \$\('map-credit-list'\)\}\)/);
  assert.doesNotMatch(app, /trackAttribution|foldMapCredits|--attrib-height|--map-card-space/);
});

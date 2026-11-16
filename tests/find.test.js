/**
 * The search box of CityMETER · Shopping Center (0.4.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy
 * search แล้ว implement กับ demo web ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”): the
 * names js/find.js gives js/shell/fuzzy.js, read from the shipped data, and what a name typed opens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIndex, key1, STEP} from '../js/shell/fuzzy.js';
import {SEARCH_KINDS, SEARCH_HEADS, SEARCH_HINT, searchEntries, pendingEntries, brandEntries, searchNote} from '../js/find.js';
import {prepareRows} from '../js/model.js';
import {indexDistricts} from '../js/areas.js';
import {parseStations} from '../js/stations.js';
import {buildTenantIndex} from '../js/tenants.js';
import {searchAll, indexPending} from '../js/profile-model.js';

const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
let built = null;
function index() {
  if (!built) {
    const venues = read('data/venues.json'), rows = prepareRows(venues.rows);
    const loaded = {rows, districts: indexDistricts(read('data/districts.geojson')), stations: parseStations(read('data/stations.json')),
      operators: venues.meta.operatorGroups || [], pending: indexPending(read('data/pending.json')), tenants: buildTenantIndex(read('data/tenant-index.json')),
      byId: new Map(rows.map(r => [r.id, r]))};
    const idx = createIndex({kinds: SEARCH_KINDS, heads: SEARCH_HEADS});
    idx.addAll(searchEntries(loaded));
    // The two files that arrive later join the same list (js/app.js#indexLate).
    idx.addAll(pendingEntries(loaded.pending, loaded));
    idx.addAll(brandEntries(loaded.tenants));
    built = {idx, ...loaded};
  }
  return built;
}
const top = (result, n = 5) => result.items.slice(0, n).map(i => `${i.entry.kind}:${i.entry.id}`);
const all = L => [...searchEntries(L), ...pendingEntries(L.pending, L), ...brandEntries(L.tenants)];

test('every area, station, filter, brand, place and record of the data can be found by name', () => {
  const L = index(), entries = all(L);
  const nameless = entries.filter(e => !key1(e.name || '') && !key1(e.nameEn || '')).length;
  assert.ok(L.idx.size > 10000 && entries.length - L.idx.size <= nameless, `${L.idx.size} of ${entries.length} entries: only one whose name has no letter (${nameless}) is left out`);
  assert.deepEqual([...new Set(entries.map(e => e.kind))].sort(), SEARCH_KINDS.map(k => k.id).sort(), 'every kind the list names has entries');
  assert.equal(entries.filter(e => e.kind === 'venue' || e.kind === 'part').length, L.rows.length, 'every place, counted or a sub-area');
  assert.equal(entries.filter(e => e.kind === 'pending').length, L.pending.rows.length, 'every record not confirmed yet');
  assert.equal(entries.filter(e => e.kind === 'brand').length, L.tenants.list.length, 'every brand of the shop lists');
  // A counted place typed as written is on the first screens of results.
  const places = entries.filter(e => e.kind === 'venue' && key1(e.name || '')).filter((_, i) => i % 149 === 0);
  let missed = 0;
  for (const e of places) if (!L.idx.search(e.name, {province: e.province, area: e.area}).items.slice(0, 60).some(i => i.entry.kind === 'venue' && i.entry.id === e.id)) missed++;
  assert.equal(missed, 0, `${places.length} places typed as written`);
});

test('a name typed opens what it names: an area before a place, one exact area or filter chosen ahead', () => {
  const {idx} = index();
  let r = idx.search('จ.ภูเก็ต');
  assert.deepEqual([top(r, 1)[0], r.preselect?.kind, r.total], ['province:PKT', 'province', 1]);
  assert.equal(top(idx.search('phuket'), 1)[0], 'province:PKT');
  r = idx.search('เขตวัฒนา');
  assert.deepEqual([top(r, 1)[0], r.preselect?.id], ['district:1039', '1039']);
  r = idx.search('หาดใหญ่ สงขลา');
  assert.deepEqual([top(r, 1)[0], r.items[0].step], ['district:9011', STEP.within]);
  r = idx.search('โคราช');
  assert.deepEqual([top(r, 1)[0], r.items[0].matched], ['province:NMA', 'โคราช']);
  // A type, an operator and a brand of the shop lists are chosen ahead; a place never is.
  r = idx.search('คอมมูนิตี้มอลล์');
  assert.deepEqual([r.items[0].entry.kind, r.items[0].entry.id, r.preselect?.kind], ['group', 'community', 'group']);
  r = idx.search('ตลาด');
  assert.deepEqual([r.items[0].entry.kind, r.preselect?.id], ['group', 'market'], 'the type; the places named so are the next rows');
  r = idx.search('central pattana');
  assert.deepEqual([r.items[0].entry.kind, r.preselect?.kind], ['operator', 'operator']);
  r = idx.search('uniqlo');
  assert.deepEqual([r.items[0].entry.kind, r.items[0].entry.name, r.preselect?.kind], ['brand', 'UNIQLO', 'brand']);
  for (const typed of ['ไอคอนสยาม', 'iconsiam', 'icon siam', 'SC-000229']) {
    r = idx.search(typed);
    assert.deepEqual([r.items[0].entry.kind, r.items[0].entry.name, r.preselect], ['venue', 'ไอคอนสยาม', null], typed);
  }
  assert.equal(idx.search('SC-000229').items[0].step, STEP.code, 'a place by its code');
  // A rail station by its name; two lines share สยาม, so the reader says which.
  r = idx.search('สยาม');
  assert.deepEqual([r.items.slice(0, 2).map(i => i.entry.kind), r.preselect], [['station', 'station'], null]);
  // A record the dataset has not confirmed is listed after the places of the same name, never ahead of them.
  r = idx.search('เมกาบางนา');
  assert.deepEqual([r.items[0].entry.kind, r.items.some(i => i.entry.kind === 'pending')], ['venue', true]);
});

test('a name typed another way is still found, and a guess is said to be one', () => {
  const {idx} = index();
  let r = idx.search('เชียงใหม');
  assert.deepEqual([top(r, 1)[0], r.items[0].show], ['province:CMI', 'spelling']);
  r = idx.search('ไอคอนสยม');
  assert.deepEqual([r.items[0].entry.name, r.items[0].show, r.preselect], ['ไอคอนสยาม', 'near', null]);
  r = idx.search("g=up'.s,j");
  assert.deepEqual([r.layout, top(r, 1)[0], r.items[0].show, r.preselect], ['เชียงใหม่', 'province:CMI', 'near', null]);
  assert.equal(idx.search('zzzzqqqq').total, 0);
});

test('the list says what an entry is and where; the page opens every kind; the words keep the search view', () => {
  const L = index(), {idx} = L;
  const note = entry => searchNote(entry, L);
  const of = (typed, kind) => idx.search(typed).items.find(i => i.entry.kind === kind).entry;
  assert.equal(note(of('ภูเก็ต', 'province')), 'จังหวัด');
  assert.equal(note(of('เขตวัฒนา', 'district')), 'เขต · กรุงเทพมหานคร');
  assert.equal(note(of('อ.หาดใหญ่', 'district')), 'อำเภอ · สงขลา');
  assert.match(note(of('สยาม', 'station')), /^สถานีรถไฟฟ้า · BTS /);
  assert.equal(note(of('ตลาด', 'group')), 'ประเภท');
  assert.equal(note(of('central pattana', 'operator')), 'ผู้บริหาร');
  assert.match(note(of('uniqlo', 'brand')), /^แบรนด์ · /);
  assert.equal(note(of('ไอคอนสยาม', 'venue')), 'ศูนย์การค้า · คลองสาน · กรุงเทพมหานคร');
  assert.match(note(of('เมกาบางนา', 'pending')), /^(ยังยืนยันไม่ได้|รอตรวจ) · /, 'a record says its state in the page\'s own words');
  let seen = 0;
  for (const e of all(L)) {
    if (['venue', 'pending', 'brand'].includes(e.kind) && seen++ % 31) continue;
    const line = note(e);
    assert.ok(line && !/ ·  ·|^ · | · $/.test(line), `${e.kind} ${e.name}: ${line}`);
  }
  // A sub-area names the place it is in.
  const part = all(L).find(e => e.kind === 'part' && e.row.parentId && L.byId.get(e.row.parentId));
  if (part) assert.ok(note(part).includes(L.byId.get(part.row.parentId).name), note(part));
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  for (const k of SEARCH_KINDS) assert.ok(app.includes(`entry.kind === '${k.id}'`), `js/app.js opens a ${k.id}`);
  assert.ok(SEARCH_HINT.startsWith('ลอง'));
  assert.ok(app.includes("f === 'search' && !state.finder ? 220 : 0"), 'without the list the box filters as it is typed in');
  // Enter with nothing chosen: the page's own search view, which lists places, sub-areas and records by the words.
  const view = searchAll('เมกาบางนา', {rows: L.rows, pending: L.pending});
  assert.ok(view.qualifiedTotal >= 1 && view.pendingTotal >= 1);
});

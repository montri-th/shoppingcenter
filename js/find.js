/**
 * What the search box of CityMETER · Shopping Center knows by name: the entries js/shell/fuzzy.js matches and
 * js/shell/search.js lists (release 0.4.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว
 * implement กับ demo web ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”).
 *
 * The page reads where retail places are, who runs them and what is inside. So a name typed here opens the level
 * that shows it: a province or a เขต/อำเภอ (its places), a rail station (the places round it), a type or an
 * operator (its filter), a brand of the shop lists (where it is listed), or one place (its page). The order below
 * is the order among equal matches: areas first, then the filters, then the places — the counted ones before their
 * sub-areas and before the records the dataset has not confirmed.
 *
 * Enter with nothing chosen keeps the page's own search view (js/profile-model.js#searchAll): every place, brand
 * and record whose name holds the words.
 *
 * Pure: entries from the loaded files; no DOM, no numbers shown (a row names what it is and where).
 */
import {GROUPS, PROVINCES, STATUS_FILTERS, provinceByCode, districtWord, groupById, contextState, rowProvince} from './model.js';
import {TENANT_ROLE_LABELS} from './tenants.js';
import {PROVINCE_AKA, withoutMueang} from './shell/fuzzy.js';

export const SEARCH_KINDS = Object.freeze([
  {id: 'province', level: 'province', auto: true}, {id: 'district', level: 'district', auto: true}, {id: 'station', level: 'station', auto: true},
  {id: 'group', auto: true}, {id: 'operator', auto: true}, {id: 'brand', auto: true}, {id: 'venue'}, {id: 'part'}, {id: 'pending'},
]);
/** Words a name may begin with, or carry, that people add or leave out; an array is one word said several ways. */
export const SEARCH_HEADS = Object.freeze([
  ['ศูนย์การค้า', 'ห้างสรรพสินค้า', 'ห้าง'], 'ตลาดนัด', 'ตลาด', ['สถานีบริการน้ำมัน', 'สถานีบริการ', 'ปั๊มน้ำมัน', 'ปั๊ม'], 'โครงการ', 'the',
]);
/** What to try when nothing is found: the kinds of name this demo knows. */
export const SEARCH_HINT = 'ลองชื่อสถานที่ แบรนด์ ผู้บริหาร สถานี เขต/อำเภอ หรือจังหวัด';

const placeOf = (districts, province, district) => {
  const p = provinceByCode(province), d = district ? districts?.get(district) : null;
  return [d?.th, d?.en, p?.th, p?.en];
};

/** The areas, the stations, the filters, then the places: counted ones and their sub-areas. */
export function* searchEntries({rows = [], districts = null, stations = [], operators = []}) {
  for (const p of PROVINCES) yield {id: p.code, kind: 'province', name: p.th, nameEn: p.en, aka: PROVINCE_AKA[p.th], codes: [p.code, p.dopa], province: p.code};
  const inProvince = new Map();
  for (const d of districts?.values() || []) {
    if (!inProvince.has(d.province)) { const p = provinceByCode(d.province); inProvince.set(d.province, [p?.th, p?.en]); }
    yield {id: d.code, kind: 'district', name: d.th, nameEn: d.en, also: withoutMueang(d.th), codes: [d.code], within: inProvince.get(d.province), province: d.province, area: d.code};
  }
  for (const s of stations) yield {id: s.id, kind: 'station', name: s.name, nameEn: s.nameEn, codes: s.codes ? s.codes.split(/[\s,·/]+/).filter(Boolean) : undefined, station: s};
  // A type some place is of; an operator the dataset groups places under.
  const used = new Set(rows.map(r => r.group));
  for (const g of GROUPS) if (used.has(g.id)) yield {id: g.id, kind: 'group', name: g.th, aka: [g.short]};
  for (const o of operators) if (o?.id && o.label) yield {id: o.id, kind: 'operator', name: o.label};
  const places = new Map();
  for (const r of rows) {
    const province = rowProvince(r), key = `${province}|${r.districtCode || ''}`;
    if (!places.has(key)) places.set(key, placeOf(districts, province, r.districtCode));
    // Among equal names the place with more listed shops comes first; the count is never shown here.
    yield {id: r.id, kind: r.countable ? 'venue' : 'part', name: r.name, nameEn: r.nameEn, aka: r.aliases, codes: [r.id, r.scId],
      within: places.get(key), province, area: r.districtCode || '', weight: r.storeCount || 0, row: r};
  }
}

/** The records the dataset has not confirmed (data/pending.json), as the page's own search lists them. */
export function* pendingEntries(pending, {districts = null} = {}) {
  const places = new Map();
  for (const [index, r] of (pending?.rows || []).entries()) {
    const [, name, , , province, district, group, state] = r, key = `${province}|${district || ''}`;
    if (!places.has(key)) places.set(key, placeOf(districts, province, district));
    yield {id: `pending:${index}`, kind: 'pending', name, within: places.get(key), province: province || '', area: district || '', index, group, reviewed: state === 'reviewed'};
  }
}

/** The brands of the shop lists (js/tenants.js index): where each is listed. */
export function* brandEntries(index) {
  for (const b of index?.list || []) yield {id: b.key, kind: 'brand', name: b.name, role: b.role, weight: b.venues?.size || 0};
}

/** The line under a name in the list: what it is and where. */
export function searchNote(entry, {districts = null, byId = null} = {}) {
  const province = code => provinceByCode(code)?.th || '';
  const district = code => (code ? districts?.get(code)?.th || '' : '');
  if (entry.kind === 'province') return 'จังหวัด';
  if (entry.kind === 'district') return [districtWord(entry.province), province(entry.province)].filter(Boolean).join(' · ');
  if (entry.kind === 'station') return ['สถานีรถไฟฟ้า', entry.station.lines].filter(Boolean).join(' · ');
  if (entry.kind === 'group') return 'ประเภท';
  if (entry.kind === 'operator') return 'ผู้บริหาร';
  if (entry.kind === 'brand') return ['แบรนด์', TENANT_ROLE_LABELS[entry.role]].filter(Boolean).join(' · ');
  if (entry.kind === 'pending') return [contextState(entry.reviewed), groupById(entry.group).short, district(entry.area), province(entry.province)].filter(Boolean).join(' · ');
  // A place reads with its type; one that is not open yet or has closed says so; a sub-area names the place it is in.
  const r = entry.row, status = r.status && r.status !== 'supply' ? STATUS_FILTERS[r.status] || '' : '';
  const parent = entry.kind === 'part' && r.parentId ? byId?.get(r.parentId)?.name : '';
  return [groupById(r.group).short, status, parent || district(r.districtCode), province(entry.province)].filter(Boolean).join(' · ');
}

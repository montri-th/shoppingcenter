/**
 * Shopping Center · page language (citymeter-shell, js/shell/i18n.js). js/app.js imports this module first, so an English
 * page is translated before anything renders. The fixed words are in js/lang-en.js; the section “รอบศูนย์นี้” keeps its
 * own words in js/venue-locale-i18n.js. Names come from the data's own English and are never translated here
 * (demo-platform-review §5.8): provinces from js/model.js PROVINCES, districts from data/districts.geojson `en`, venues
 * from their `nameEn` (the registry's English name, or a transliteration the registry carries and the owner authorised),
 * rail stations from their `nameEn` (CityMETER Transit), operator groups from their registry label, a company that
 * writes its name “บริษัท … จำกัด / … Co., Ltd.” by that English. A name without English stays Thai (keepThai): venue
 * names without one, the pending records, shop and brand names, addresses and the notes the sources write in Thai.
 */
import {LANG, registerDictionary, registerNames, keepThai, startTranslation, translate} from './shell/i18n.js';
import SHOPPING_EN from './lang-en.js';

const THAI = /[ก-ฺเ-๎]/;

if (LANG === 'en') {
  registerDictionary(SHOPPING_EN);
  startTranslation();
  // The English is a draft until reviewed (demo-platform-review §5.8): the help dialog says so.
  const note = () => {
    const intro = document.querySelector('.usage-dialog .help-intro');
    if (!intro || document.getElementById('draft-english-note')) return;
    const p = document.createElement('p');
    p.id = 'draft-english-note';
    p.className = 'help-intro';
    p.textContent = 'English is a draft translation from the Thai. Venue names read in the registry’s English, which for many markets and fuel stations is a transliteration of the Thai; a name with no English in the data stays in Thai, and so do shop names, operators’ legal names, addresses and notes as the sources write them. The product statement and the data method are in Thai.';
    intro.after(p);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', note, {once: true}); else note();
}

/**
 * “บริษัท วัน แบงค็อก จำกัด / One Bangkok Co., Ltd. Group” → the company's own English side; null for any other name
 * (“บุญถาวร / Design Village” names two things, so it stays as written). Pure.
 */
export function companyEnglish(label) {
  const sides = String(label || '').split(/\s+\/\s+/);
  if (sides.length !== 2) return null;
  const en = sides.find(x => !THAI.test(x)), th = sides.find(x => THAI.test(x));
  if (!en || !th || !/^(บริษัท|ห้างหุ้นส่วน)/.test(th)) return null;
  return /\b(Co\.?|Ltd\.?|Limited|Company|Group|PCL|Public)\b/i.test(en) ? en : null;
}

/**
 * The English the data carries, as [thai, english] pairs, and the names that have none (they stay Thai). rows =
 * js/model.js prepareRows, provinces = PROVINCES, districts = the features of data/districts.geojson, stations =
 * js/stations.js parseStations, operators = venues.json meta.operatorGroups. Pure.
 */
export function dataNamePairs({rows = [], provinces = [], districts = [], stations = [], operators = []} = {}) {
  const pairs = [], thai = [];
  for (const p of provinces) {
    if (!p.en) continue;
    pairs.push([p.th, p.en], [`จังหวัด${p.th}`, p.en]);
  }
  const bangkok = provinces.find(p => p.code === 'BKK')?.en;
  if (bangkok) pairs.push(['กรุงเทพฯ', bangkok], ['กรุงเทพ', bangkok], ['กรุงเทพมหานคร', bangkok]);
  for (const f of districts) {
    const d = f?.properties || f;
    if (!d?.th || !d?.en) continue;
    pairs.push([d.th, d.en], [`${d.province === 'BKK' ? 'เขต' : 'อำเภอ'}${d.th}`, d.en]);
  }
  // Stations: the name alone and with “สถานี”; their lines (“BTS สายสุขุมวิท · MRT สายสีน้ำเงิน”) read through LINE_EN.
  for (const s of stations) {
    if (!s.nameEn || THAI.test(s.nameEn)) { thai.push(s.name, `สถานี${s.name}`); continue; }
    pairs.push([s.name, s.nameEn], [`สถานี${s.name}`, `${s.nameEn} station`]);
  }
  for (const o of operators) {
    // An operator group reads its registry label; a Thai label takes the English name the registry lists for it.
    if (!o?.label || !THAI.test(o.label)) continue;
    const en = (o.patterns || []).find(p => p && !THAI.test(p) && /[A-Za-z]/.test(p));
    if (en) pairs.push([o.label, en]); else thai.push(o.label);
  }
  // Operators as the registry names them (legal names, people, committees): English only where the company gives it.
  for (const label of new Set(rows.map(r => r?.operatorLabel).filter(v => v && THAI.test(v)))) {
    const en = companyEnglish(label);
    if (en) pairs.push([label, en]); else thai.push(label);
  }
  for (const r of rows) {
    if (!r?.name || !THAI.test(r.name)) continue;
    if (r.nameEn && !THAI.test(r.nameEn)) pairs.push([r.name, r.nameEn]); else thai.push(r.name);
  }
  return {pairs, thai: thai.filter(Boolean)};
}

/** Register the English the data carries (dataNamePairs) on an English page. */
export function registerDataNames(sources = {}) {
  if (LANG !== 'en') return;
  const {pairs, thai} = dataNamePairs(sources);
  registerNames(pairs);
  keepThai(thai);
}

/** The texts of a venue's shop list: names as listed, and the branch, floor and unit texts the dictionary may read. Pure. */
export function rosterTexts(roster) {
  const names = [], text = [];
  for (const item of roster?.items || []) {
    names.push(item.displayName, item.brand, item.name);
    text.push(item.branch, item.unitFloor, item.displayQualifier);
    for (const c of item.corroboratingMembershipEvidence || []) names.push(c.displayName, c.name);
  }
  for (const st of roster?.counters || []) {
    names.push(st.store, ...(st.floors || []).flatMap(f => f.brands || []));
    text.push(...(st.floors || []).map(f => f.floor));
  }
  if (roster?.profile?.label) text.push(roster.profile.label);
  return {names, text};
}

/** The texts of a venue's detail record: names (address, operator) and opening hours. Pure. */
export function detailTexts(d, {hours = []} = {}) {
  return {names: d ? [d.address, d.operator, d.operatorRaw, d.operatorLabel] : [], text: d ? [d.hours, ...hours, d.phone] : []};
}

/** Names no source gives in English (pending records, shops, brands, addresses): they stay Thai as written. */
export function keepNames(list = []) {
  if (LANG !== 'en') return;
  const keep = sourceNames(list);
  if (keep.length) keepThai(keep);
}

/** A source's Thai names, each with its parts between the separators (“Grill & Ground (โดยโอ้กะจู๋) · Dadfa Lasalle”). Pure. */
export function sourceNames(list = []) {
  const out = new Set();
  for (const v of list) {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (!s || !THAI.test(s)) continue;
    out.add(s);
    for (const part of s.split(/ · | — | \| /)) if (THAI.test(part)) out.add(part.trim());
  }
  return [...out];
}

/** Text a source writes in Thai (opening hours, a unit, a branch): kept as written unless the dictionary reads it. */
export function keepSourceThai(list = []) {
  if (LANG !== 'en') return;
  keepNames([...new Set(list.map(v => String(v ?? '').replace(/\s+/g, ' ').trim()))].filter(s => s && THAI.test(s) && translate(s) == null));
}

/** A venue's detail record (js/details.js): its address, operator and opening hours as the sources write them. */
export function noteDetail(d, options = {}) {
  if (LANG !== 'en' || !d) return d;
  const {names, text} = detailTexts(d, options);
  keepNames(names);
  keepSourceThai(text);
  return d;
}

/** A venue's shop list (js/tenants.js loadTenants): names as listed; branch, floor and unit unless the dictionary reads them. */
export function noteRoster(roster) {
  if (LANG !== 'en' || !roster) return roster;
  const {names, text} = rosterTexts(roster);
  keepNames(names);
  keepSourceThai(text);
  return roster;
}

/** The brand index (data/tenant-index.json): brand names as the shop lists write them. */
export function noteBrands(index) {
  if (LANG !== 'en' || !index) return index;
  keepNames((index.list || []).map(b => b.name));
  return index;
}

/** Pending records (data/pending.json rows: [id, name, …]): Thai names only. */
export function notePending(pending) {
  if (LANG !== 'en' || !pending?.rows) return pending;
  keepNames(pending.rows.map(r => r[1]));
  return pending;
}

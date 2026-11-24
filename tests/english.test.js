// English page (citymeter-shell js/shell/i18n.js; owner 2026-11-18: “ทำ demo web Shopping center ให้เป็น TH/EN ด้วย
// เหมือน dataset อื่นๆ”): every Thai text the page renders has an English — from js/lang-en.js, a name the data gives in
// English, or a name kept Thai because no source gives one (js/lang.js). The views are rendered from the real data files;
// text nodes are read with the element they sit in, so the dictionary's context entries apply as they do in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {registerDictionary, registerNames, keepThai, translate, translateIn} from '../js/shell/i18n.js';
import SHOPPING_EN, {LINE_EN, GROUP_EN, ROLE_EN} from '../js/lang-en.js';
import {dataNamePairs, rosterTexts, detailTexts, companyEnglish, sourceNames} from '../js/lang.js';
import {GROUPS, PROVINCES, STATUS_FILTERS, filterVenues, prepareRows, applyShopLists, summarize, DEFAULT_GROUP, groupMatches, rowProvince} from '../js/model.js';
import {parseStations, attachNearestStations, nearRail, rowsNearStation, STATION_RADIUS_M} from '../js/stations.js';
import {buildTenantIndex, buildAmenities, createTenantLoader, createDirectoryLoader, createLogoLinkLoader, subAreasOf, rollUpSubAreas, comparePeers, brandPresence, searchBrands, TENANT_ROLE_LABELS, TENANT_PAGE_SIZE} from '../js/tenants.js';
import {indexDistricts, summarizeDistricts, districtsInScope} from '../js/areas.js';
import {summarizeAreaInsight} from '../js/area-insight.js';
import {buildDistrictModel} from '../js/map-layers.js';
import {buildOverviewModel, buildDistrictProfile, buildVenueProfile, buildPendingCard, searchAll, indexPending} from '../js/profile-model.js';
import {renderOverview, renderDistrict, renderVenue, renderPending, renderSearch, renderBrand, renderStation, renderFilterChips, hoursShort, provinceShort,
  mapCardAha, mapCardVenue, mapCardDistrict, mapCardPending, mapCardSearch, mapCardBrand, mapCardStation, altName} from '../js/panel.js';
import {lookLinks} from '../js/look-around.js';
import {rampLegendHTML} from '../js/scales.js';
import {buildBreadcrumb} from '../js/breadcrumb.js';
import {buildingHeightLabel} from '../js/buildings.js';
import {PRODUCT_TITLE, SUBJECT} from '../js/panel.js';
import {configureVenueLogos, withFamilyVenueLogos} from '../js/venue-logos.js';
import {groupLabel, GROUP_SETS} from '../js/model.js';

const ROOT = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const THAI = /[ก-ฺเ-๎]/;

/* ---------- the data, as js/app.js prepares it ---------- */
const venues = read('data/venues.json');
const rows = prepareRows(venues.rows.map(r => ({...r})));
const shopIndex = rollUpSubAreas(buildTenantIndex(read('data/tenant-index.json')), rows, new Map(rows.map(r => [r.id, r])));
applyShopLists(rows, shopIndex, buildAmenities(read('data/venue-amenities.json')));
const byId = new Map(rows.map(r => [r.id, r]));
const districtGeo = read('data/districts.geojson');
const districts = indexDistricts(districtGeo);
const stations = parseStations(read('data/stations.json'));
attachNearestStations(rows, stations);
const pending = indexPending(read('data/pending.json'));
const details = new Map();
for (const f of readdirSync(new URL('data/details/', ROOT))) for (const [id, d] of Object.entries(read(`data/details/${f}`).venues)) details.set(id, d);
const asOf = venues.meta.asOf;
const transit = read('data/stations.json').meta;
const fetchLocal = async path => ({ok: true, json: async () => read(path)});
const loadRoster = createTenantLoader(fetchLocal, {directory: createDirectoryLoader(fetchLocal), parts: id => subAreasOf(byId.get(id), byId),
  logos: createLogoLinkLoader(fetchLocal)});

/* ---------- the English the page registers (js/lang.js) ---------- */
registerDictionary(SHOPPING_EN);
const names = dataNamePairs({rows, provinces: PROVINCES, districts: districtGeo.features, stations, operators: venues.meta.operatorGroups || []});
registerNames(names.pairs);
keepThai(names.thai);
keepThai(sourceNames(pending.rows.map(r => r[1])));
keepThai(sourceNames(shopIndex.list.map(b => b.name)));
const keepTexts = ({names: n, text}) => {
  keepThai(sourceNames(n));
  keepThai(text.map(s => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(s => s && THAI.test(s) && translate(s) == null));
};

/* ---------- a small HTML reader: text nodes and attributes with the element they belong to ---------- */
const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'col', 'wbr', 'area', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'use']);
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
function element(tag, attrs, parent) {
  const el = {tag, attrs, parent, children: [],
    getAttribute: n => (n in attrs ? attrs[n] : null),
    get classList() { return (attrs.class || '').split(/\s+/).filter(Boolean); },
    get textContent() { return el.children.map(c => (typeof c === 'string' ? c : c.textContent)).join(''); },
    get previousElementSibling() { const sibs = parent ? parent.children.filter(c => typeof c !== 'string') : []; return sibs[sibs.indexOf(el) - 1] || null; },
    get previousSibling() { const sibs = parent ? parent.children : []; const p = sibs[sibs.indexOf(el) - 1]; return p == null ? null : typeof p === 'string' ? {textContent: p} : p; },
    matches: selector => selector.split(',').some(one => matchesOne(el, one.trim())),
    closest: selector => { for (let e = el; e; e = e.parent) if (e.tag !== '#root' && e.matches(selector)) return e; return null; },
  };
  return el;
}
const simple = (el, part) => (part.match(/[.#]?[\w-]+|\[[^\]]+\]/g) || []).every(tok =>
  tok.startsWith('.') ? el.classList.includes(tok.slice(1))
    : tok.startsWith('[') ? (() => { const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(tok); return m && (m[2] == null ? m[1] in el.attrs : el.attrs[m[1]] === m[2]); })()
      : tok.startsWith('#') ? el.attrs.id === tok.slice(1) : el.tag === tok);
function matchesOne(el, selector) {
  const parts = selector.split(/\s+/);
  if (!simple(el, parts.at(-1))) return false;
  let e = el.parent;
  for (let i = parts.length - 2; i >= 0; i--) { while (e && e.tag !== '#root' && !simple(e, parts[i])) e = e.parent; if (!e || e.tag === '#root') return false; e = e.parent; }
  return true;
}
function parse(html) {
  const root = element('#root', {}, null);
  let cur = root;
  const texts = [];
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g)) {
    if (m[5] != null) { cur.children.push(m[5]); texts.push({text: decode(m[5]), el: cur}); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { for (let e = cur; e && e.tag !== '#root'; e = e.parent) if (e.tag === tag) { cur = e.parent; break; } continue; }
    const attrs = {};
    for (const a of (m[3] || '').matchAll(/([^\s=>]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] == null ? '' : decode(a[2]);
    const el = element(tag, attrs, cur);
    cur.children.push(el);
    if (!m[4] && !VOID.has(tag)) cur = el;
  }
  return {root, texts};
}
const SKIP = '[translate="no"], [data-i18n-skip], script, style, noscript, code';
const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt'];
/** Thai texts (and attributes) that the English page would leave untranslated. */
function untranslated(html) {
  const out = new Set();
  const {root, texts} = parse(html);
  for (const {text, el} of texts) {
    const s = text.replace(/\s+/g, ' ').trim();
    if (!THAI.test(s) || el.closest?.(SKIP)) continue;
    if (translateIn(el.tag === '#root' ? null : el, s) == null) out.add(s);
  }
  const walk = el => {
    for (const c of el.children) {
      if (typeof c === 'string') continue;
      if (!c.closest(SKIP)) for (const a of ATTRIBUTES) { const v = c.attrs[a]; if (v && THAI.test(v) && translate(v) == null) out.add(`${a}: ${v.replace(/\s+/g, ' ').trim()}`); }
      walk(c);
    }
  };
  walk(root);
  return out;
}

/* ---------- the views ---------- */
const supply = filterVenues(rows, {});
function overview(f = {}) {
  const scope = filterVenues(rows, f);
  const centres = f.group ? scope : filterVenues(rows, {...f, group: DEFAULT_GROUP});
  const insight = summarizeAreaInsight(centres, districts, {rank: 'count', near: r => nearRail(r)});
  const model = buildDistrictModel(summarizeDistricts(centres, districtsInScope(districts, insight.province)));
  const focus = centres.filter(r => insight.districtIds.includes(r.districtCode));
  const om = buildOverviewModel({rows: focus, scopeRows: centres, areas: model.areas, readCode: insight.province, planned: filterVenues(rows, {status: 'planned'}), closed: filterVenues(rows, {status: 'closed'})});
  const others = rows.filter(r => filterVenues([r], {...f, group: ''}).length && rowProvince(r) === insight.province && !groupMatches(f.group || DEFAULT_GROUP, r));
  const counts = new Map();
  for (const r of others) counts.set(r.group, (counts.get(r.group) || 0) + 1);
  const o = others.length ? {count: others.length, where: `ใน${provinceShort(insight.province)}`, province: insight.province, groups: [...counts].map(([id, count]) => ({id, count})).sort((a, b) => b.count - a.count)} : null;
  const subject = f.role ? `ศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ตที่มี${TENANT_ROLE_LABELS[f.role]}` : f.group ? (GROUPS.find(g => g.id === f.group)?.th || 'ศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ต') : 'ศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ต';
  const html = renderOverview({insight, model: om, focusMode: 'auto', readCode: insight.province, national: true, subject, asOf, transit, others: o,
    provinces: []}) + mapCardAha(insight, {subject}) + rampLegendHTML(model.ramp, {zero: true, unit: 'แห่ง/ตร.กม.'});
  return {html, model, insight};
}

test('English: the static page (index.html) has an English for every Thai text', () => {
  const page = readFileSync(new URL('index.html', ROOT), 'utf8');
  const body = page.slice(page.indexOf('<body'), page.lastIndexOf('</body>'));
  const missing = untranslated(body);
  const head = [...page.matchAll(/<meta name="description" content="([^"]+)"|<title>([^<]+)<\/title>/g)].map(m => m[1] || m[2]);
  for (const s of head) if (THAI.test(s) && translate(s.replace(/ · CityMETER$/, '')) == null) missing.add(s);
  assert.deepEqual([...missing], []);
});

test('English: the first view, its type sets and its filters', () => {
  const missing = new Set();
  for (const f of [{}, {group: 'centres'}, {group: 'market'}, {group: 'mall', role: 'fitness'}, {group: 'fuel'}, {status: 'planned'}, {province: 'CMI'}]) {
    for (const s of untranslated(overview(f).html)) missing.add(s);
  }
  const chips = renderFilterChips({search: 'central', group: 'market', status: 'planned', operator: 'central-pattana', province: 'KBI', role: 'fitness', pending: '1'},
    {status: STATUS_FILTERS, operator: {'central-pattana': 'Central Pattana'}, role: TENANT_ROLE_LABELS});
  for (const s of untranslated(chips)) if (!/“central”/.test(s)) missing.add(s);
  assert.deepEqual([...missing].slice(0, 20), []);
});

test('English: district views, rank rows and their map cards', () => {
  const missing = new Set();
  const {model} = overview({});
  const ranked = model.areas.filter(a => a.count > 0).sort((a, b) => b.density - a.density);
  for (const area of ranked.slice(0, 4)) {
    const p = buildDistrictProfile({area, rows: supply, rank: ranked.indexOf(area) + 1, of: ranked.length});
    for (const s of untranslated(renderDistrict(p, {asOf}) + mapCardDistrict(p))) missing.add(s);
  }
  assert.deepEqual([...missing].slice(0, 20), []);
});

test('English: venue panels with their details, shop lists, nearby centers and Google links', async () => {
  const missing = new Set();
  const ids = ['SC-001245', 'SC-000067', 'SC-000034', 'SC-000218', 'SC-000652', 'SC-C0840', 'SC-001223', 'SC-000001', 'SC-000256', 'SC-000788', 'SC-SM-03840',
    'SC-000620', 'SC-001118', 'SC-002049', 'SC-000698', 'VN-6d4211fb2ef4fb', 'VN-5523fa4482b213', 'SC-C0015', '002e4de9-09f5-491d-8bb1-a8e0d337bb9d', 'SC-001783', 'SC-001360', 'SC-003800'];
  // D65: venue logos as the page configures them, so a logo from another demo shows its evidence note.
  const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
  configureVenueLogos(withFamilyVenueLogos(json('data/venue-logos.json'), json('data/venue-logo-links.json')));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const detail = details.get(id) || null;
    keepTexts(detailTexts(detail, {hours: detail?.hours ? [hoursShort(detail.hours)] : []}));
    const roster = await loadRoster(id);
    keepTexts(rosterTexts(roster));
    const profile = buildVenueProfile({row, detail, byId, districts});
    for (const role of ['', ...new Set((roster.items || []).map(() => ''))]) {
      const tenants = {id, loading: false, error: false, roster, limit: 1000, role};
      const html = renderVenue(profile, {asOf, tenants, peers: comparePeers(shopIndex, row, byId), transit, look: lookLinks(profile, null)}) + mapCardVenue(profile, {tenants});
      for (const s of untranslated(html)) missing.add(s);
    }
  }
  assert.deepEqual([...missing].slice(0, 30), []);
});

test('English: search, brands, stations and records not counted', () => {
  const missing = new Set();
  for (const q of ['central', 'ตลาด', 'starbucks', 'โลตัส']) {
    const results = searchAll(q, {rows, pending});
    const brands = searchBrands(shopIndex, q);
    for (const s of untranslated(renderSearch(results, {pending, districts, asOf, brands}) + mapCardSearch(results, {brands}))) if (!s.includes(`“${q}”`)) missing.add(s);
  }
  for (const key of ['starbucks', 'uniqlo']) {
    const bp = brandPresence(shopIndex, key, byId);
    if (bp) for (const s of untranslated(renderBrand(bp, {meta: shopIndex.meta}) + mapCardBrand(bp))) missing.add(s);
  }
  for (const s of stations.filter(x => /A6|N8|BL22/.test(x.id)).slice(0, 3)) {
    const near = rowsNearStation(supply, s, STATION_RADIUS_M);
    const sp = {station: s, radius: STATION_RADIUS_M, rows: near.map(x => x.row), distance: new Map(near.map(x => [x.row.id, x.m])), summary: summarize(near.map(x => x.row))};
    for (const t of untranslated(renderStation(sp, {asOf, transit, subject: 'ศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ต'}) + mapCardStation(sp))) missing.add(t);
  }
  for (const i of [0, 1, 2]) {
    const c = buildPendingCard(pending, i, districts);
    for (const s of untranslated(renderPending(c, {asOf}) + mapCardPending(c))) missing.add(s);
  }
  assert.deepEqual([...missing].slice(0, 20), []);
});

test('English: names read in the English the data gives, never translated words', () => {
  // A Thai name with the registry's English reads in that English; without one it stays Thai (and is listed).
  const central = rows.find(r => r.nameEn && THAI.test(r.name) && !THAI.test(r.nameEn));
  assert.equal(translate(central.name), central.nameEn);
  assert.equal(translate(`สถานี${stations.find(s => s.nameEn).name}`), `${stations.find(s => s.nameEn).nameEn} station`);
  assert.equal(companyEnglish('บริษัท วัน แบงค็อก จำกัด / One Bangkok Co., Ltd. Group'), 'One Bangkok Co., Ltd. Group');
  assert.equal(companyEnglish('บุญถาวร / Design Village'), null, 'two names, not one name in two languages');
  // Lines, groups and roles are words of the page, not data.
  for (const [th, en] of Object.entries({...LINE_EN, ...GROUP_EN, ...ROLE_EN})) assert.equal(translate(th), en, th);
  for (const label of Object.values(TENANT_ROLE_LABELS)) assert.ok(ROLE_EN[label], `role ${label}`);
  for (const g of GROUPS) { assert.ok(GROUP_EN[g.th], g.th); assert.ok(GROUP_EN[g.short], g.short); }
});

test('English: the name under a heading is the other script', () => {
  // On a Thai page (node: no ?lang=en) the registry's English goes under the Thai name.
  assert.equal(altName('เซ็นทรัลเวิลด์', 'centralwOrld'), '<p class="subtle">centralwOrld</p>');
  assert.equal(altName('Emporium', 'Emporium'), '');
});

test('English: a count reads singular or plural, and a unit keeps its number', () => {
  assert.equal(translate('1 แห่ง'), '1 venue');
  assert.equal(translate('1,234 แห่ง'), '1,234 venues');
  assert.equal(translate('2 ร้าน'), '2 shops');
  assert.equal(translate('0.69 แห่ง/ตร.กม.'), '0.69 venues/km²');
  assert.equal(translate('ชั้น GF · ยูนิต G52-G53-G54'), 'Floor GF · Unit G52-G53-G54');
  assert.equal(translate('ห้องเลขที่ 2-14; ชั้น 2'), 'Room 2-14; floor 2');
  assert.equal(translate('ตรวจ 7 พ.ย. 2569'), 'checked 7 Nov 2026');
  assert.equal(translate('เกิน 2 กม.'), 'over 2 km');
  // A pattern never puts Thai inside English: unknown words leave the text for the report.
  assert.equal(translate('ของอะไรสักอย่างในกรุงเทพฯ อยู่ใน 3 เขตนี้'), null);
});

test('English: map labels, tab titles and announcements name every province and district in English', () => {
  // 0.7.1 (live check 18 Nov 2026): the map's area labels, the tab title and the screen-reader announcements are text
  // the panel never renders, so the views above did not reach them.
  const english = (s, why) => { const v = translate(s); assert.ok(v != null && !THAI.test(v), `${why}: ${s} → ${v}`); return v; };
  const subjects = new Set([PRODUCT_TITLE, SUBJECT, ...GROUPS.map(g => groupLabel(g.id)), ...Object.keys(GROUP_SETS).map(groupLabel)]);
  const last = crumbs => crumbs[crumbs.length - 1].label;
  const places = [last(buildBreadcrumb({}))];
  for (const p of PROVINCES) {
    places.push(last(buildBreadcrumb({province: p.code})));
    english(`จังหวัด${p.th}: 3 แห่ง กดเพื่อดูจังหวัด`, 'province label');
  }
  for (const f of districtGeo.features) {
    const d = f.properties;
    const crumbs = buildBreadcrumb({district: {code: d.code, th: d.th, province: d.province}});
    places.push(last(crumbs));
    english(`${last(crumbs)}: 1 แห่ง กดเพื่อสำรวจ`, 'district label');
    english(`${last(crumbs)} 12 แห่ง`, 'district announcement');
  }
  for (const place of places) for (const subject of subjects) english(`${subject} ${place}`, 'tab title');
  assert.equal(translate('ศูนย์การค้า กรุงเทพมหานคร'), 'Shopping centers in Bangkok');
  assert.equal(translate('สถานที่ค้าปลีก ประเทศไทย'), 'Retail venues in Thailand');
  assert.equal(translate('เขตปทุมวัน: 24 แห่ง กดเพื่อสำรวจ'), 'Pathum Wan: 24 venues, press to explore');
  assert.equal(translate('จังหวัดเชียงใหม่: 1 แห่ง กดเพื่อดูจังหวัด'), 'Chiang Mai: 1 venue, press to see the province');
  for (const s of ['พบ 499 แห่ง', 'แสดงร้าน 60 จาก 412 ร้าน', 'รัศมี 3 กม.', 'แสดงรายการที่ยังยืนยันไม่ได้', 'ซ่อนรายการที่ยังยืนยันไม่ได้']) english(s, 'announcement');
  const r = rows.find(x => THAI.test(x.name) && x.nameEn) || rows[0];
  english(`เลือก ${r.name}`, 'announcement');
  const p = pending.rows.find(x => THAI.test(x[1]))[1];
  for (const state of ['ยังยืนยันไม่ได้', 'รอตรวจ']) english(`${state} ${p.replace(/[ก-๙]/g, '').trim() || 'Lotus'}`, 'announcement');
  assert.match(translate(`ยังยืนยันไม่ได้ ${p}`), /^Unconfirmed: /);
  const st = stations.find(s => s.nameEn && THAI.test(s.name));
  english(`สถานี${st.name} 12 แห่งในระยะ 500 ม.`, 'announcement');
  english(`จังหวัด${PROVINCES[1].th}`, 'announcement');
  // Never Thai inside English: a place the data does not name stays Thai for the report.
  assert.equal(translate('ศูนย์การค้า เขตที่ไม่มีอยู่จริง'), null);
  assert.equal(translate('เขตที่ไม่มีอยู่จริง 3 แห่ง'), null);
});

test('English: building counts and every building height label', () => {
  assert.equal(translate('ทั้งโครงการ 38 อาคาร'), 'The whole project: 38 buildings');
  assert.equal(translate('ทั้งโครงการ 1 อาคาร'), 'The whole project: 1 building');
  const labels = [{height_status: 'owner_model_design', base_m: 0, height_m: 40}, {height_status: 'owner_model_design'},
    {height_status: 'basemap_render_height'}, {height_status: 'model_height_review'},
    {height_status: 'unknown_display_fallback', render_as: 'outline'}, {height_status: 'unknown_display_fallback'}, {},
    {geometry_role: 'host_building_part_not_shop_unit', base_m: 180, height_m: 194.5},
    {height_status: 'citymeter_model_estimate', height_m: 38}, {height_m: 1234.56}].map(buildingHeightLabel);
  for (const s of labels) {
    const v = translate(s);
    assert.ok(v != null && !THAI.test(v), `${s} → ${v}`);
  }
  assert.equal(translate('ส่วนอาคาร 180–194.5 ม. ตาม CityMETER'), 'Building part 180–194.5 m per CityMETER');
});

test('English: the section around a center reads in English before its release meta arrives', () => {
  // js/venue-locale.js renderLocale draws its heading while loading and on error; js/venue-locale-i18n.js registers
  // only once the meta has loaded, so these words are the page's own.
  for (const s of ['รอบศูนย์นี้', 'รัศมีเส้นตรง', 'กำลังโหลดข้อมูลรอบศูนย์…', 'โหลดข้อมูลรอบศูนย์ไม่สำเร็จ', 'ลองอีกครั้ง']) {
    const v = translate(s);
    assert.ok(v != null && !THAI.test(v), `${s} → ${v}`);
  }
});

test('English: the page declares both languages and the shell lists it with English', () => {
  const page = readFileSync(new URL('index.html', ROOT), 'utf8');
  assert.match(page, /<meta name="citymeter:languages" content="th en">/);
  assert.match(page, /data-reading-en="[^"]+"/);
  assert.equal(TENANT_PAGE_SIZE > 0, true);
});

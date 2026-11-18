/**
 * Venue Locale Insight — “รอบศูนย์นี้” in the venue panel (owner 2026-11-18: build Venue Locale Insight for the 499
 * shopping centres, community malls and outlets to add detail to this demo; the research registry is the main source,
 * counted in straight-line rings of 1, 3 and 5 km; production values of the area the centre sits in; priors from rules;
 * amCharts where it helps the people of Product Statement §2.1 — ผู้เช่าและทีมขยายสาขา, ทีม leasing, นักลงทุน).
 *
 * Data: data/locale/ — the serving derivative of canonical release venue-locale-shopping-20261118-v0.1.0-rc1, built
 * outside this repository by the Venue Locale pipeline (DATA_METHOD.md §Venue Locale Insight).
 *   meta.json        catalogue, labels, universes, live links, prior labels — loaded once
 *   facts/NN.json    ring counts, area values and benchmark percentiles — per venue, FNV-1a (details.js shardOf)
 *   priors/NN.json   generated priors only — loaded when the reader opens that block, never mixed into facts
 *
 * Reading rules: a ring count is the number of records a source lists within the straight-line radius of the venue's
 * reference point (not walking or driving distance, not footfall). 0 is a measured zero; a dataset without accepted
 * points is never shown as 0. Percentiles are mid-rank among the 488 located venues (or the same type); area counts are
 * ranked per km² of their unit. Priors are hypotheses to test, drawn in neutral tones (no data colour), with what to check.
 * Colours: the LDS `count` 41-sample LUT (scales.js) for the ring percentiles only — the map's own method (a value's
 * mid-rank percentile → LUT sample), identical on both themes, with an outline so light samples stay visible.
 *
 * Pure renderers (HTML strings, panel.js conventions) + a lazy amCharts dot plot with an HTML fallback.
 */
import {COUNT_SCALE} from './scales.js';
import {shardOf} from './details.js';
import {provinceByCode, BANGKOK, districtWord} from './model.js';
import {loadAmCharts, makeChartRoot, chartTokens} from './charts.js';
import {LANG, translate} from './shell/i18n.js';

/** Canvas text cannot be translated in the DOM: the chart writes English itself on an English page. */
const T = s => (LANG === 'en' ? translate(s) ?? s : s);

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const DECIMAL = new Intl.NumberFormat('th-TH', {maximumSignificantDigits: 3});
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => NUMBER.format(n);
const icon = role => `<i class="pictogram pic-${esc(role)}" aria-hidden="true"></i>`;
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
/** Thai text with its English beside it (the shell's [data-en] context reads it on an English page). */
const enAttr = en => (en ? ` data-en="${esc(en)}"` : '');
const say = (th, en) => (en ? `<span${enAttr(en)}>${esc(th)}</span>` : esc(th));
const extLink = (url, label, cls = 'source-link', en = '') => {
  const u = safeURL(url);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener"><span${enAttr(en)}>${esc(label)}</span><span class="sr-only"> (เปิดแท็บใหม่)</span></a>` : say(label, en);
};
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export function thaiDay(iso) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const [, y, mo, d] = m;
  return `${d ? `${Number(d)} ` : ''}${MONTHS[Number(mo) - 1]} ${Number(y) + 543}`;
}

export const LOCALE_PATH = 'data/locale';
/** The release covers the 499 countable shopping centres, community malls and outlets that the registry lists as supply. */
export const LOCALE_GROUPS = Object.freeze(['mall', 'community', 'outlet']);
export const inLocaleSet = row => Boolean(row?.countable) && row?.status === 'supply' && LOCALE_GROUPS.includes(row?.group);
export const RADII = Object.freeze([1000, 3000, 5000]);
const RI = {1000: 0, 3000: 1, 5000: 2};
export const km = r => `${num(r / 1000)} กม.`;

/* ---------- loading ---------- */

const cache = new Map(), resolved = new Map();
function fetchJSON(path, fetchImpl) {
  if (!cache.has(path)) {
    cache.set(path, fetchImpl(path, {cache: 'no-cache'}).then(r => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    }).then(json => { resolved.set(path, json); return json; }).catch(e => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}
const pad = n => String(n).padStart(2, '0');
export const localeShardPath = (kind, id, shards = 64) => `${LOCALE_PATH}/${kind}/${pad(shardOf(id, shards))}.json`;

/** meta.json once per session. */
export const loadLocaleMeta = ({fetchImpl = (...a) => fetch(...a)} = {}) => fetchJSON(`${LOCALE_PATH}/meta.json`, fetchImpl);
export const cachedLocaleMeta = () => resolved.get(`${LOCALE_PATH}/meta.json`) || null;

/** The facts record of one venue (null when the shard has none). */
export async function loadLocaleFacts(id, {shards = 64, fetchImpl = (...a) => fetch(...a)} = {}) {
  const shard = await fetchJSON(localeShardPath('facts', id, shards), fetchImpl);
  return shard?.venues?.[id] || null;
}
export const cachedLocaleFacts = (id, shards = 64) => resolved.get(localeShardPath('facts', id, shards))?.venues?.[id] || null;

/** The generated priors of one venue — only when the reader opens that block. */
export async function loadLocalePriors(id, {shards = 64, fetchImpl = (...a) => fetch(...a)} = {}) {
  const shard = await fetchJSON(localeShardPath('priors', id, shards), fetchImpl);
  return shard?.venues?.[id] || null;
}
export const cachedLocalePriors = (id, shards = 64) => resolved.get(localeShardPath('priors', id, shards))?.venues?.[id] || null;

/* ---------- reader options (kept for the session, like charts.js) ---------- */

const options = {radius: 3000, universe: 'all', level: '', bench: 'province', open: {table: false, more: false, live: false, priors: false, method: false}};
export const localeOptions = () => ({...options, open: {...options.open}});
export function setLocaleOption(key, value) {
  if (key === 'radius' && RADII.includes(Number(value))) options.radius = Number(value);
  else if (key === 'universe' && ['all', 'type'].includes(value)) options.universe = value;
  else if (key === 'level') options.level = String(value || '');
  else if (key === 'bench' && ['province', 'peer'].includes(value)) options.bench = value;
  else if (key === 'open' && value && typeof value === 'object') Object.assign(options.open, value);
  else return false;
  return true;
}

/* ---------- pure models (tested) ---------- */

/** Colour of a percentile on the LDS count LUT (41 samples; index round(p × 40 / 100)). */
export const pctFill = p => COUNT_SCALE.lut[Math.max(0, Math.min(40, Math.round((Number(p) || 0) * 40 / 100)))];

/** Province words for a venue: “กรุงเทพฯ” / “เชียงใหม่”. */
export const provinceWord = code => (code === BANGKOK ? 'กรุงเทพฯ' : provinceByCode(code)?.th || code || '');
const levelWord = (level, code) => ({
  locale: 'ย่าน', subdistrict: code === BANGKOK ? 'แขวง' : 'ตำบล', municipality: 'เทศบาล/อปท.', district: districtWord(code), province: 'จังหวัด',
}[level] || level);

/** Universe of a ring percentile: all located venues or the venue's own type. */
export function universeOf(meta, row, universe = options.universe) {
  const type = meta?.universes?.[row?.group];
  if (universe === 'type' && type) return {key: 'type', n: type.n, th: type.th, short: `${type.th.replace(/ที่มีพิกัด$/, '')} ${num(type.n)} แห่ง`};
  const all = meta?.universes?.all || {n: 0, th: ''};
  return {key: 'all', n: all.n, th: all.th, short: `${num(all.n)} ศูนย์`};
}

/**
 * One row per counted dataset at the radius: {id, group, label, name, unit, count, p, zeroShare, near, sub, measure,
 * coverage, date}. `p` is the mid-rank percentile in the universe; for a measured zero, `zeroShare` is the share of the
 * universe that also has none (2 × the mid-rank of a tie at the bottom).
 */
export function ringRows(meta, facts, row, {radius = options.radius, universe = options.universe} = {}) {
  if (!meta || !facts?.ring) return [];
  const i = RI[radius] ?? 1;
  const u = universe === 'type' && meta.universes?.[row?.group] ? 1 : 0;
  const out = [];
  for (const g of meta.ringGroups || []) {
    for (const id of g.datasets) {
      const rec = facts.ring[id], m = meta.ring[id];
      if (!rec || !m) continue;
      const count = rec.n[i];
      const p = rec.p?.[u]?.[i] ?? rec.p?.[0]?.[i] ?? null;
      const coverage = m.eligible && m.located != null ? m.located / m.eligible : 1;
      out.push({
        id, group: g.id, groupLabel: g.th, label: m.short?.[0] || m.th, labelEn: m.short?.[1] || m.en, name: m.th, nameEn: m.en, unit: m.unit?.[0] || '', unitEn: m.unit?.[1] || '', count, p,
        zeroShare: count === 0 && p != null ? Math.min(100, Math.round(p * 2)) : null,
        near: rec.near ?? null, sub: rec.sub ? m.subgroups.map((s, k) => ({id: s[0], th: s[1], count: rec.sub[i][k]})).filter(s => s.count > 0) : [],
        measure: m.measure && rec.m ? {th: m.measure[1], value: rec.m[i], note: m.measure[3]} : null,
        coverage, partial: coverage < 0.9, eligible: m.eligible, located: m.located, unplacedHere: m.unlocatedByProvince?.[row?.provinceCode] || 0,
        date: m.date, source: m.source?.[0] || '', brands: m.brands || '',
      });
    }
  }
  return out;
}

/**
 * Rank words for a mid-rank percentile of a value above zero: “มากกว่า 96% ของ …”; the top and the bottom percent read
 * “สูงสุด 1% ของ …” / “ต่ำสุด 1% ของ …” (a mid-rank never reaches 0 or 100, so it is never written as either).
 */
export function rankWords(p, group) {
  if (p >= 99.5) return `อยู่ในกลุ่มสูงสุด 1% ของ${group}`;
  if (p < 0.5) return `อยู่ในกลุ่มต่ำสุด 1% ของ${group}`;
  return `มากกว่า ${num(Math.round(p))}% ของ${group}`;
}

/** “มากกว่า 96% ของ 488 ศูนย์” / for a zero: “ไม่พบ เหมือน 64% ของ 488 ศูนย์”. */
export function pctPhrase(r, uni) {
  if (r.count === 0) return r.zeroShare != null ? `ไม่พบ เหมือน ${num(r.zeroShare)}% ของ${uni.key === 'all' ? ' ' : ''}${uni.short}` : 'ไม่พบในรัศมีนี้';
  if (r.p == null) return '';
  return rankWords(r.p, uni.key === 'all' ? ` ${uni.short}` : uni.short);
}

/** Aha lines: the three counted datasets that set this venue furthest apart, at most one per group first. */
export function ahaRows(rows, {limit = 3} = {}) {
  // Headlines only from datasets whose records nearly all have a point (a partial set would rank where points exist).
  const ranked = rows.filter(r => r.count > 0 && r.p != null && !r.partial).sort((a, b) => b.p - a.p || b.count - a.count);
  const picked = [], groups = new Set();
  for (const r of ranked) { if (picked.length < limit && !groups.has(r.group)) { picked.push(r); groups.add(r.group); } }
  for (const r of ranked) { if (picked.length < limit && !picked.includes(r)) picked.push(r); }
  return picked;
}

/** Datasets of the registry that list records here but have no accepted points: name and this province's count. */
export function unplacedRows(meta, row) {
  return (meta?.unplaced || []).map(id => ({id, th: meta.ring[id]?.th || id, name: meta.ring[id]?.th || id, en: meta.ring[id]?.en || '',
    count: meta.ring[id]?.unlocatedByProvince?.[row?.provinceCode] || 0, unit: meta.ring[id]?.unit?.[0] || 'แห่ง', unitEn: meta.ring[id]?.unit?.[1] || ''})).filter(x => x.count > 0);
}

/** Levels the venue has, smallest first. */
export function levelsOf(facts) {
  return ['locale', 'subdistrict', 'municipality', 'district', 'province'].filter(l => facts?.units?.[l]);
}

/** Display order of the area metrics: the first ones are always shown, the rest wait behind “ดูอีก”. */
export const AREA_ORDER = Object.freeze([
  ['population', 'population'], ['building', 'count'], ['businessDynamics', 'hqCount'], ['businessDynamics', 'branchCount'], ['company', 'totalActive'],
  ['office', 'officeCount'], ['condo', 'condoCount'], ['deed', 'medianPrice'], ['landoffer', 'medianPricePerSqw'], ['hotel', 'roomCount'],
  ['school', 'totalStudent'], ['restaurant', 'totalCount'], ['grocery', 'totalCount'], ['shoppingCenter', 'totalCount'], ['roadDna', 'topArchetype'],
  ['floodimpact', 'floodYears'], ['municipality', 'total'],
]);
export const AREA_FIRST = 8;

/**
 * Area rows of one level: {ds, metric, label, unit, value, text, p, n, zeroShare, basis, link, period, publisher}.
 * Missing stays missing (no row); `bench` picks the province or the nationwide peer percentile.
 */
export function areaRows(meta, facts, row, {level, bench = options.bench} = {}) {
  if (!meta || !facts?.area) return [];
  const lv = level || levelsOf(facts)[0];
  const seen = new Set(), out = [];
  const order = [...AREA_ORDER];
  for (const [ds, m] of Object.entries(meta.area || {})) for (const metric of m.metrics) if (!order.some(([a, b]) => a === ds && b === metric.id)) order.push([ds, metric.id]);
  for (const [ds, metricId] of order) {
    const key = `${ds}:${metricId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = meta.area?.[ds];
    const vals = facts.area?.[ds]?.[lv];
    if (!m || !vals) continue;
    if (ds === 'roadDna' && metricId === 'topArchetype') {
      const a = vals.topArchetype?.[0];
      if (!a || a === 'LOW_CONFIDENCE') continue;
      const lab = meta.roadArchetypes?.[a] || [a, a];
      out.push({ds, metric: metricId, label: 'รูปแบบถนนที่พบมาก', labelEn: 'Most common road pattern', value: lab[0], text: lab[0], textEn: lab[1], unit: '', p: null, n: null, basis: 'category', m, period: vals._period || m.period});
      continue;
    }
    const metric = m.metrics.find(x => x.id === metricId);
    const cell = vals[metricId];
    if (!metric || !cell || cell[0] == null) continue;
    const [value, pProv, nProv, pPeer, nPeer] = cell;
    const p = bench === 'peer' ? pPeer : pProv, n = bench === 'peer' ? nPeer : nProv;
    out.push({ds, metric: metricId, label: metric.th, labelEn: metric.en, unit: metric.unit?.[0] || '', unitEn: metric.unit?.[1] || '', value, text: formatValue(value, metric.unit?.[0]), p: p ?? null, n: n ?? null,
      zeroShare: value === 0 && p != null ? Math.min(100, Math.round(p * 2)) : null, basis: metric.basis, m, period: vals._period || m.period});
  }
  return out;
}

export function formatValue(v, unit = '') {
  if (typeof v !== 'number') return String(v ?? '');
  if (unit === '%') return `${DECIMAL.format(v)}%`;
  return Math.abs(v) >= 100 || Number.isInteger(v) ? num(v) : DECIMAL.format(v);
}

/** “ต่อ ตร.กม. มากกว่า 39% ของย่านในกรุงเทพฯ (832)”. */
export function areaPhrase(r, {level, bench, provinceCode}) {
  if (r.p == null || r.n == null) return '';
  const word = levelWord(level, provinceCode);
  const group = bench === 'peer' ? `${word}ที่มีศูนย์ในชุดนี้` : `${word}ใน${provinceWord(provinceCode)}`;
  if (r.value === 0 && r.zeroShare != null) return `ไม่มีในข้อมูล เหมือน ${num(r.zeroShare)}% ของ${group} (${num(r.n)})`;
  const words = rankWords(r.p, `${group} (${num(r.n)})`);
  return r.basis === 'per_sqkm' ? `ต่อ ตร.กม. ${words}` : words.replace(/^มากกว่า/, 'สูงกว่า');
}

/** Production deep links for the views that change daily: the district of the venue. */
export function liveLinks(meta, row) {
  if (!meta?.live || !row?.provinceCode || !row?.districtCode) return [];
  return meta.live.map(l => ({...l, href: l.href.replace('{province}', encodeURIComponent(row.provinceCode)).replace('{district}', encodeURIComponent(row.districtCode))}));
}

const dateRange = meta => {
  const ds = Object.values(meta?.ring || {}).map(m => m.date).filter(Boolean).sort();
  const from = ds[0], to = meta?.asOf;
  return from && to && from !== to ? `${thaiDay(from)}–${thaiDay(to)}` : thaiDay(to || from || '');
};

/* ---------- HTML ---------- */

const chip = (action, key, value, pressed, label) =>
  `<button type="button" class="chip-toggle" data-action="${action}" data-${key}="${esc(value)}" aria-pressed="${pressed}">${esc(label)}</button>`;
const openAttr = key => (options.open[key] ? ' open' : '');

function ringTable(meta, facts, row, uni) {
  const rows = RADII.map(r => ringRows(meta, facts, row, {radius: r}));
  const body = rows[0].map((r, k) => {
    const cells = RADII.map((_, j) => `<td class="data-number">${num(rows[j][k].count)}</td>`).join('');
    const extra = [r.near != null ? `ใกล้สุด ${r.near < 1000 ? `${num(Math.round(r.near / 10) * 10)} ม.` : `${DECIMAL.format(r.near / 1000)} กม.`}` : '',
      r.partial ? `มีพิกัด ${num(r.located)} จาก ${num(r.eligible)}` : '', r.brands ? `เฉพาะ ${r.brands}` : ''].filter(Boolean).join(' · ');
    const sub = [extra, r.source, r.date ? thaiDay(r.date) : ''].filter(Boolean).join(' · ');
    return `<tr><th scope="row">${say(r.name, r.nameEn)}${r.partial ? '<sup>*</sup>' : ''}<small>${esc(sub)}</small></th>${cells}<td class="data-number">${rows[1][k].count === 0 ? '–' : `${num(rows[1][k].p)}%`}</td></tr>`;
  }).join('');
  return `<details class="locale-details" data-locale-open="table"${openAttr('table')}><summary>${icon('table')}ตัวเลขทุกรัศมี</summary>
    <div class="table-wrap locale-table-wrap"><table class="locale-table"><caption class="sr-only">จำนวนในรัศมี 1, 3 และ 5 กม. และอันดับที่ 3 กม.</caption>
    <thead><tr><th scope="col">ชุดข้อมูล</th><th scope="col">1 กม.</th><th scope="col">3 กม.</th><th scope="col">5 กม.</th><th scope="col">อันดับ 3 กม.</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="hint">อันดับเทียบกับ${esc(uni.th)} ${num(uni.n)} แห่ง${rows[0].some(r => r.partial) ? ' · * นับได้เฉพาะรายการที่มีพิกัด' : ''}</p></details>`;
}

/** Plain list of the same rows as the chart (fallback when amCharts cannot load). */
export function ringListHTML(rows, uni, radius) {
  return `<ol class="locale-dots" aria-label="จำนวนในรัศมี ${esc(km(radius))} เทียบกับ${esc(uni.th)}">${rows.map(r => {
    const x = r.count === 0 ? 0 : r.p ?? 0;
    return `<li class="dot-row"><span class="dot-label">${say(r.label, r.labelEn)}${r.partial ? '<sup>*</sup>' : ''}</span><span class="dot-track" aria-hidden="true"><i class="dot${r.count === 0 ? ' is-zero' : ''}" style="left:${x}%;background:${pctFill(x)}"></i></span><span class="dot-value"><b class="data-number">${num(r.count)}</b></span><span class="sr-only">${esc(pctPhrase(r, uni))}</span></li>`;
  }).join('')}</ol>`;
}

function areaBlock(meta, facts, row) {
  const levels = levelsOf(facts);
  if (!levels.length) return '';
  const level = levels.includes(options.level) ? options.level : levels[0];
  const units = facts.units, code = row.provinceCode;
  const unitNames = levels.map(l => {
    const u = units[l];
    const w = levelWord(l, code);
    const name = l === 'province' ? (code === BANGKOK ? 'กรุงเทพมหานคร' : `จังหวัด${u[2]}`) : l === 'municipality' ? u[2] : `${w}${u[2]}`;
    return `<span class="locale-unit${l === level ? ' is-current' : ''}">${esc(name)}</span>`;
  }).join(' · ');
  const nb = (facts.nb || []).map(id => meta.neighbourhoods?.[id] ? extLink(meta.neighbourhoodLink.replace('{id}', encodeURIComponent(id)), `ย่านการค้า${meta.neighbourhoods[id]}`) : '').filter(Boolean).join(' · ');
  const rows = areaRows(meta, facts, row, {level, bench: options.bench});
  const hasPct = rows.some(r => r.p != null);
  const rowHTML = r => {
    const phrase = areaPhrase(r, {level, bench: options.bench, provinceCode: code});
    const link = r.m.link.replace('{province}', encodeURIComponent(code)).replace('{district}', encodeURIComponent(row.districtCode));
    const track = r.p != null ? `<span class="pct-track" aria-hidden="true"><i style="left:${r.value === 0 ? 0 : r.p}%"></i></span>` : '';
    return `<div class="area-row"><dt>${extLink(link, r.label, 'area-link', r.labelEn)}</dt><dd><span class="area-value"><b class="data-number"${enAttr(r.textEn)}>${esc(r.text)}</b>${r.unit && r.basis !== 'category' ? ` <span class="area-unit"${enAttr(r.unitEn)}>${esc(r.unit)}</span>` : ''}</span>${phrase ? `<span class="area-pct">${esc(phrase)}</span>` : ''}${track}</dd></div>`;
  };
  const first = rows.slice(0, AREA_FIRST).map(rowHTML).join('');
  const rest = rows.slice(AREA_FIRST);
  return `<div class="locale-block locale-area-block">
    <h4 class="locale-sub">${icon('layers')}พื้นที่ที่ศูนย์ตั้งอยู่</h4>
    <p class="locale-units">${unitNames}</p>${nb ? `<p class="locale-units">${nb}</p>` : ''}
    <div class="chart-controls locale-controls" role="group" aria-label="ระดับพื้นที่">${levels.map(l => chip('locale-level', 'level', l, l === level, levelWord(l, code))).join('')}</div>
    ${hasPct ? `<div class="chart-controls locale-controls" role="group" aria-label="เทียบกับ"><span class="chart-note">เทียบกับ</span>${chip('locale-bench', 'bench', 'province', options.bench === 'province', `ใน${provinceWord(code)}`)}${chip('locale-bench', 'bench', 'peer', options.bench === 'peer', 'ที่มีศูนย์ทั่วประเทศ')}</div>` : ''}
    ${rows.length ? `<dl class="locale-area">${first}</dl>${rest.length ? `<details class="locale-details" data-locale-open="more"${openAttr('more')}><summary>ดูอีก ${num(rest.length)} รายการ</summary><dl class="locale-area">${rest.map(rowHTML).join('')}</dl></details>` : ''}`
      : '<p class="hint">ยังไม่มีข้อมูลของพื้นที่ระดับนี้</p>'}
  </div>`;
}

function liveBlock(meta, row, facts) {
  const links = liveLinks(meta, row);
  if (!links.length) return '';
  const locale = facts?.units?.locale?.[0];
  const localeLink = locale && meta.localeLink ? `<li>${extLink(meta.localeLink.replace('{locale}', encodeURIComponent(locale)), 'Locale Insights ของย่านนี้', 'area-link')}</li>` : '';
  return `<details class="locale-details" data-locale-open="live"${openAttr('live')}><summary>${icon('maps')}ข้อมูลที่เปลี่ยนรายวันใน CityMETER</summary>
    <ul class="locale-live">${links.map(l => `<li>${extLink(l.href, l.th, 'area-link', l.en)}</li>`).join('')}${localeLink}</ul></details>`;
}

/** Generated priors (opt-in): segment levels, 10 pinned daypart blocks, what to check. Neutral tones only. */
export function priorsHTML(meta, pr) {
  const P = meta.priors;
  const pips = level => { const n = {low: 1, medium: 2, high: 3}[level] || 0; return `<span class="pips" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const segs = P.segments.map(([id, th]) => {
    const s = pr.seg[id];
    if (!s) return '';
    const [level, , , signals] = s;
    const basis = signals.map(([sid, p]) => `${P.signals[sid]?.[0] || sid}${p != null ? ` สูงกว่า ${num(p)}% ของ${sid.startsWith('area:') ? 'พื้นที่ที่มีศูนย์' : 'ศูนย์'}` : ''}`).join(' · ');
    return `<div class="prior-row"><dt>${esc(th)}</dt><dd>${pips(level)}<b>${esc(P.levels[level]?.[0] || level)}</b><small>อิงจาก ${esc(basis)}</small></dd></div>`;
  }).join('');
  const blocks = P.blocks;
  const cell = i => {
    const v = pr.dp[i];
    const label = P.daypart[v]?.[0] || '';
    const why = (pr.why?.[i] || []).filter(w => w !== 'baseline').map(w => P.why[w]?.[0] || w).join(' · ');
    return `<td class="dp dp-${v}" title="${esc(`${blocks[i][1]} ${blocks[i][3]} ${blocks[i][5]} น.${why ? ` · ${why}` : ''}`)}"><span aria-hidden="true">${['▽', '·', '▲'][v] || ''}</span> ${esc(label)}</td>`;
  };
  const grid = `<table class="daypart"><caption class="sr-only">ช่วงเวลาที่คาดว่าคึกหรือเงียบกว่าปกติ (สมมติฐาน)</caption>
    <thead><tr><td></td>${blocks.slice(0, 5).map(b => `<th scope="col">${esc(b[3])}<small>${esc(b[5])}</small></th>`).join('')}</tr></thead>
    <tbody><tr><th scope="row">วันธรรมดา</th>${[0, 1, 2, 3, 4].map(cell).join('')}</tr><tr><th scope="row">วันหยุด</th>${[5, 6, 7, 8, 9].map(i => cell(i)).join('')}</tr></tbody></table>
    <p class="hint">เวลาวันหยุดเริ่ม ${esc(blocks[5][5])} น. · ${esc(blocks.slice(6).map(b => `${b[3]} ${b[5]}`).join(' · '))}</p>`;
  const targets = (pr.targets || []).map(t => `<li>${esc(P.targets[t]?.[0] || t)}</li>`).join('');
  return `<p class="hint">ใช้เลือกสิ่งที่จะไปตรวจ ไม่ใช่จำนวนคน ยอดขาย หรือส่วนแบ่งลูกค้า</p>
    <dl class="prior-list">${segs}</dl>
    <h5 class="locale-mini">${icon('hours')}ช่วงไหนน่าจะคึกกว่าปกติ</h5>${grid}
    ${targets ? `<h5 class="locale-mini">${icon('checked')}ตรวจได้ด้วย</h5><ul class="prior-targets">${targets}</ul>` : ''}`;
}

function priorsBlock(meta, row, priors, priorsState) {
  const body = priors ? priorsHTML(meta, priors)
    : priorsState === 'error' ? '<p class="hint">โหลดสมมติฐานไม่สำเร็จ <button type="button" class="link-button" data-action="locale-retry-priors">ลองอีกครั้ง</button></p>'
      : options.open.priors ? '<p class="hint" role="status">กำลังโหลด…</p>' : '';
  return `<details class="locale-details locale-priors" data-locale-open="priors"${openAttr('priors')}><summary>${icon('idea')}ใครน่าจะอยู่รอบศูนย์ และช่วงไหนน่าจะคึก <span class="prior-badge">สมมติฐานจากกฎ</span></summary>${body}</details>`;
}

function methodBlock(meta, uni) {
  const notCounted = (meta.notCounted || []).filter(x => x.treatment === 'not_countable_catalog_only' && x.th).map(x => x.th);
  return `<details class="locale-details" data-locale-open="method"${openAttr('method')}><summary>${icon('evidence')}ที่มาและวิธีของส่วนนี้</summary>
    <ul class="locale-method">
      <li>นับรายการที่แหล่งระบุในรัศมีเส้นตรง 1 · 3 · 5 กม. จากจุดของศูนย์ ไม่ใช่ระยะเดินหรือขับรถ และไม่ใช่จำนวนคนเดิน</li>
      <li>อันดับเป็นเปอร์เซ็นไทล์แบบ mid-rank เทียบกับ${esc(uni.th)} ${num(uni.n)} แห่ง ค่าที่เท่ากันนับครึ่ง · 0 คือไม่พบรายการในรัศมี ไม่ใช่ไม่มีข้อมูล</li>
      <li>ค่าพื้นที่มาจาก CityMETER production ตามหน่วยที่จุดของศูนย์ตั้งอยู่ ตัวเลขที่เป็นจำนวนเทียบกันต่อ ตร.กม. ของหน่วย</li>
      <li>ชุดที่ยังมีพิกัดไม่ครบนับเฉพาะรายการที่มีพิกัด และติดดาวไว้ในตาราง</li>
      ${notCounted.length ? `<li>ยังนับไม่ได้ในรุ่นนี้: ${esc(notCounted.join(' · '))}</li>` : ''}
      <li>ข้อมูลรุ่น ${esc(meta.release?.id || '')} (release candidate) · จุดของศูนย์ยังเป็นจุดอ้างอิง ไม่ใช่ขอบเขตหรือทางเข้าที่ผู้บริหารยืนยัน</li>
    </ul></details>`;
}

/** Data line of the section: dataset · source · date · boundary. */
export function localeDataLine(meta) {
  const rings = Object.values(meta?.ring || {}).filter(m => m.placed).length, areas = Object.keys(meta?.area || {}).length;
  return `<p class="hint panel-foot">รอบศูนย์นี้ · ทะเบียนวิจัย CityMETER ${num(rings)} ชุด และ CityMETER production ${num(areas)} ชุด · ข้อมูล ${esc(dateRange(meta))} · รัศมีเส้นตรงจากจุดของศูนย์ และขอบเขตพื้นที่ตาม CityMETER production · <a href="DATA_METHOD.md#venue-locale-insight" target="_blank" rel="noopener">ที่มาและวิธี</a></p>`;
}

/**
 * The “รอบศูนย์นี้” section of a venue: {meta, facts, priors, state: {meta, facts, priors}}. Returns '' for rows outside
 * the 499-venue set (markets, fuel stations…), which the release does not cover.
 */
export function renderLocale(row, {meta = null, facts = null, priors = null, metaState = 'idle', factsState = 'idle', priorsState = 'idle'} = {}) {
  if (!inLocaleSet(row)) return '';
  const head = `<div class="section-heading">${`<h3 id="locale-title">${icon('area')}รอบศูนย์นี้</h3>`}<span class="hint">รัศมีเส้นตรง</span></div>`;
  const shell = inner => `<section class="panel-section locale-section" id="venue-locale" data-venue="${esc(row.id)}" aria-labelledby="locale-title">${head}${inner}</section>`;
  if (metaState === 'error' || factsState === 'error') return shell('<p class="hint">โหลดข้อมูลรอบศูนย์ไม่สำเร็จ <button type="button" class="link-button" data-action="locale-retry">ลองอีกครั้ง</button></p>');
  if (!meta || (!facts && factsState !== 'empty')) return shell('<p class="hint" role="status">กำลังโหลดข้อมูลรอบศูนย์…</p>');
  if (!facts || facts.located === false) return shell('<p class="hint">ศูนย์นี้ยังไม่มีจุดที่ผ่านเกณฑ์ จึงยังนับสิ่งที่อยู่รอบศูนย์ไม่ได้</p>');
  const uni = universeOf(meta, row);
  const rows = ringRows(meta, facts, row);
  const aha = ahaRows(rows);
  const radiusChips = `<div class="chart-controls locale-controls" role="group" aria-label="รัศมี">${RADII.map(r => chip('locale-radius', 'radius', r, r === options.radius, km(r))).join('')}</div>`;
  const typeU = meta.universes?.[row.group];
  const uniChips = typeU ? `<div class="chart-controls locale-controls" role="group" aria-label="เทียบกับ"><span class="chart-note">เทียบกับ</span>${chip('locale-universe', 'universe', 'all', options.universe === 'all', `ทุกศูนย์ ${num(meta.universes.all.n)} แห่ง`)}${chip('locale-universe', 'universe', 'type', options.universe === 'type', `${typeU.th.replace(/ที่มีพิกัด$/, '')} ${num(typeU.n)} แห่ง`)}</div>` : '';
  const ahaHTML = aha.length ? `<ul class="locale-aha">${aha.map(r => `<li><span class="aha-what">${say(r.name, r.nameEn)} <b class="data-number">${num(r.count)}</b> ${say(r.unit, r.unitEn)}</span><span class="aha-how">${esc(pctPhrase(r, uni))}</span></li>`).join('')}</ul>`
    : '<p class="subtle">ในรัศมีนี้ยังไม่พบรายการจากชุดข้อมูลที่นับได้</p>';
  const unplaced = unplacedRows(meta, row);
  const pEn = row.provinceCode === BANGKOK ? 'Bangkok' : provinceByCode(row.provinceCode)?.en || '';
  const unplacedHTML = unplaced.length ? `<p class="hint locale-unplaced"><span data-en="No points to count in the rings yet:">ยังไม่มีพิกัดให้นับในรัศมี:</span> ${unplaced.map(u => say(`${u.th} ใน${provinceWord(row.provinceCode)} ${num(u.count)} ${u.unit}`, u.en && pEn && u.unitEn ? `${u.en} in ${pEn}: ${num(u.count)} ${u.unitEn}` : '')).join(' · ')}</p>` : '';
  return shell(`${radiusChips}
    <p class="locale-lead">ใน ${esc(km(options.radius))} รอบศูนย์</p>
    ${ahaHTML}
    ${uniChips}
    <div class="locale-chart" id="locale-chart" data-radius="${options.radius}" data-universe="${esc(uni.key)}">${ringListHTML(rows, uni, options.radius)}</div>
    ${unplacedHTML}
    ${ringTable(meta, facts, row, uni)}
    ${areaBlock(meta, facts, row)}
    ${liveBlock(meta, row, facts)}
    ${priorsBlock(meta, row, priors, priorsState)}
    ${methodBlock(meta, uni)}
    ${localeDataLine(meta)}`);
}

/* ---------- amCharts dot plot (lazy; the HTML list stays when the library cannot load) ---------- */

let chartToken = 0;
/** Draw the percentile dot plot into #locale-chart. Returns a disposer. */
export function mountLocaleChart(element, {meta, facts, row} = {}) {
  if (!element || !meta || !facts?.ring) return () => {};
  const token = ++chartToken;
  let root = null, disposed = false;
  const uni = universeOf(meta, row);
  const rows = ringRows(meta, facts, row);
  const draw = lib => {
    if (disposed || token !== chartToken || !element.isConnected) return;
    const {am5, am5xy} = lib;
    const t = chartTokens();
    const height = Math.max(200, rows.length * 24 + 44);
    const list = element.innerHTML;
    element.innerHTML = `<p class="chart-caption">อันดับในรัศมี ${esc(km(options.radius))} เทียบกับ${esc(uni.th)} ${num(uni.n)} แห่ง · ชี้หรือแตะเพื่อดูตัวเลข</p><div class="am-chart" style="height:${height}px" role="img" aria-label="${esc(`อันดับของจำนวนในรัศมี ${km(options.radius)} เทียบกับ${uni.th}`)}"></div><div class="sr-only">${list}</div>`;
    // the caption and label above are DOM text (the shell translates them); the canvas below is written in the page language
    root = makeChartRoot(lib, element.querySelector('.am-chart'), t);
    const chart = root.container.children.push(am5xy.XYChart.new(root, {panX: false, panY: false, wheelX: 'none', wheelY: 'none', layout: root.verticalLayout, paddingLeft: 0, paddingRight: 46, paddingTop: 2, paddingBottom: 2}));
    const yr = am5xy.AxisRendererY.new(root, {inversed: true, minGridDistance: 4, cellStartLocation: 0.2, cellEndLocation: 0.8});
    yr.labels.template.setAll({fontSize: 12, maxWidth: 118, oversizedBehavior: 'truncate', textAlign: 'right', paddingRight: 6});
    yr.grid.template.set('forceHidden', true);
    const yAxis = chart.yAxes.push(am5xy.CategoryAxis.new(root, {categoryField: 'cat', renderer: yr}));
    const xr = am5xy.AxisRendererX.new(root, {minGridDistance: 48, strokeOpacity: 0});
    xr.labels.template.setAll({fontSize: 11, fill: am5.color(t.muted)});
    xr.grid.template.setAll({stroke: am5.color(t.border), strokeOpacity: 0.45});
    const xAxis = chart.xAxes.push(am5xy.ValueAxis.new(root, {min: 0, max: 100, strictMinMax: true, renderer: xr, numberFormat: "#'%'"}));
    const mid = xAxis.createAxisRange(xAxis.makeDataItem({value: 50}));
    mid.get('grid').setAll({stroke: am5.color(t.muted), strokeOpacity: 0.7, strokeDasharray: [3, 3], forceHidden: false});
    mid.get('label').setAll({text: LANG === 'en' ? 'median' : 'กลาง', fontSize: 10, fill: am5.color(t.muted), inside: true, centerY: am5.p100, dy: -2});
    const data = rows.map(r => {
      const x = r.count === 0 ? 0 : r.p ?? 0;
      const fill = pctFill(x);
      const extra = [r.measure ? `${r.measure.th} ${num(r.measure.value)}` : '', r.near != null ? `ใกล้สุด ${r.near < 1000 ? `${num(Math.round(r.near / 10) * 10)} ม.` : `${DECIMAL.format(r.near / 1000)} กม.`}` : '',
        r.sub.length ? r.sub.slice(0, 4).map(s => `${s.th} ${num(s.count)}`).join(' · ') : '', r.partial ? `มีพิกัด ${num(r.located)} จาก ${num(r.eligible)} รายการ` : ''].filter(Boolean).join('\n');
      const en = LANG === 'en';
      const lines = [en ? `${num(r.count)} ${T(r.unit)} within ${km(options.radius).replace(' กม.', ' km')}` : `${num(r.count)} ${r.unit} ใน ${km(options.radius)}`, T(pctPhrase(r, uni)), ...extra.split('\n').filter(Boolean).map(T)];
      return {cat: `${en ? r.labelEn : r.label}${r.partial ? '*' : ''}`, x, shown: num(r.count), tip: `[bold]${T(r.name)}[/]\n${lines.join('\n')}`,
        aria: `${T(r.name)}: ${lines.slice(0, 2).join(' ')}`, columnSettings: {fill: am5.color(fill)}, dotSettings: {fill: am5.color(fill), stroke: am5.color(r.count === 0 ? COUNT_SCALE.zeroOutline : t.text)}};
    });
    const series = chart.series.push(am5xy.ColumnSeries.new(root, {xAxis, yAxis, valueXField: 'x', categoryYField: 'cat', sequencedInterpolation: false, maskBullets: false}));
    series.columns.template.setAll({height: 5, strokeOpacity: 0.6, stroke: am5.color(t.border), strokeWidth: 1, cornerRadiusTR: 2, cornerRadiusBR: 2, templateField: 'columnSettings',
      tooltipText: '{tip}', focusable: true, focusableGroup: 'locale', hoverOnFocus: true, ariaLabel: '{aria}'});
    series.bullets.push(() => am5.Bullet.new(root, {locationX: 1, sprite: am5.Circle.new(root, {radius: 6, strokeWidth: 1.5, templateField: 'dotSettings', tooltipText: '{tip}'})}));
    series.bullets.push(() => am5.Bullet.new(root, {locationX: 1, sprite: am5.Label.new(root, {text: '{shown}', populateText: true, centerY: am5.p50, centerX: am5.p0, dx: 10, fontSize: 11, fill: am5.color(t.text)})}));
    yAxis.data.setAll(data);
    series.data.setAll(data);
  };
  loadAmCharts().then(draw).catch(error => { console.warn('amCharts unavailable; plain list instead', error?.message || error); });
  return () => {
    disposed = true;
    try { root?.dispose(); } catch {}
    root = null;
  };
}

/**
 * Venue Locale Insight — “รอบศูนย์นี้” in the venue panel (owner 2026-11-18: build Venue Locale Insight for the 499
 * shopping centers, community malls and outlets to add detail to this demo; the research registry is the main source,
 * counted in straight-line rings of 1, 3 and 5 km; production values of the area the center sits in; priors from rules;
 * amCharts where it helps the people of Product Statement §2.1 — ผู้เช่าและทีมขยายสาขา, ทีม leasing, นักลงทุน).
 *
 * Data: data/locale/ — the serving derivative of canonical release venue-locale-shopping-20261118-v0.2.0-rc1, built
 * outside this repository by the Venue Locale pipeline (DATA_METHOD.md §Venue Locale Insight).
 *   meta.json         catalogue, labels, universes, live links, context and prior labels — loaded once
 *   facts/NN.json     ring counts, area values and benchmark percentiles — per venue, FNV-1a (details.js shardOf)
 *   signals/NN.json   observed context: quality signals of nearby records (published tuition, recorded starting prices
 *                     of stays, office asking rents, beds, workers, luxury points of sale), named examples with the key
 *                     their own demo opens, venue attributes — loaded with the prior block (0.2, owner 2026-11-18)
 *   priors/NN.json    generated priors only — loaded when the reader opens that block, never mixed into facts
 *
 * Reading rules: a ring count is the number of records a source lists within the straight-line radius of the venue's
 * reference point (not walking or driving distance, not footfall). 0 is a measured zero; a dataset without accepted
 * points is never shown as 0. Percentiles are mid-rank among the 488 located venues (or the same type); area counts are
 * ranked per km² of their unit. Priors are hypotheses to test, drawn in neutral tones (no data colour), with what to check:
 * four groups with a spending-power signal read from observed prices (never income or willingness to pay), hypothesis
 * phrases, and a 7×24 grid relative to the center's own busiest hour (never footfall).
 * Colours: the LDS `count` 41-sample LUT (scales.js) for the ring percentiles only — the map's own method (a value's
 * mid-rank percentile → LUT sample), identical on both themes, with an outline so light samples stay visible.
 *
 * Pure renderers (HTML strings, panel.js conventions) + a lazy amCharts dot plot with an HTML fallback.
 */
import {COUNT_SCALE, buildRamp, classify, rampLegendHTML, rampTicks, isPaleSample} from './scales.js';
import {shardOf} from './details.js';
import {provinceByCode, BANGKOK, districtWord} from './model.js';
import {loadAmCharts, makeChartRoot, chartTokens} from './charts.js';
import {LANG, translate} from './shell/i18n.js';
import {DEMOS, DEMO_ORIGIN, demoUrl} from './shell/datasets.js';
import {usSpelling} from './venue-locale-i18n.js';

/** Canvas text cannot be translated in the DOM: the chart writes English itself on an English page. */
const T = s => (LANG === 'en' ? translate(s) ?? s : s);

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const DECIMAL = new Intl.NumberFormat('th-TH', {maximumSignificantDigits: 3});
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => NUMBER.format(n);
const icon = role => `<i class="pictogram pic-${esc(role)}" aria-hidden="true"></i>`;
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
/** Thai text with its English beside it (the shell's [data-en] context reads it on an English page). */
const enAttr = en => (en ? ` data-en="${esc(usSpelling(en))}"` : '');
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
/** The release covers the 499 countable shopping centers, community malls and outlets that the registry lists as supply. */
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

/**
 * The generated priors of one venue — only when the reader opens that block — together with the observed context of
 * the same venue (signals/NN.json, facts), which the block reads beside the priors. Resolves to the priors record.
 */
export async function loadLocalePriors(id, {shards = 64, fetchImpl = (...a) => fetch(...a)} = {}) {
  const [shard] = await Promise.all([fetchJSON(localeShardPath('priors', id, shards), fetchImpl), fetchJSON(localeShardPath('signals', id, shards), fetchImpl)]);
  return shard?.venues?.[id] || null;
}
export const cachedLocalePriors = (id, shards = 64) => resolved.get(localeShardPath('priors', id, shards))?.venues?.[id] || null;
export const cachedLocaleSignals = (id, shards = 64) => resolved.get(localeShardPath('signals', id, shards))?.venues?.[id] || null;

/**
 * Registered residents around the center (modelled; owner 2026-11-20 08:26 “ขึ้นเลย”): data/residents/, the serving
 * derivative of bundle venue-locale-residents-488-20261120-v1 (scripts/build-residents.py). meta.json once; one record
 * per located center in NNN.json (shardOf(id, meta.shards)).
 */
export const RESIDENTS_PATH = 'data/residents';
export const residentsShardPath = (id, shards = 128) => `${RESIDENTS_PATH}/${String(shardOf(id, shards)).padStart(3, '0')}.json`;
export const loadResidentsMeta = ({fetchImpl = (...a) => fetch(...a)} = {}) => fetchJSON(`${RESIDENTS_PATH}/meta.json`, fetchImpl);
export const cachedResidentsMeta = () => resolved.get(`${RESIDENTS_PATH}/meta.json`) || null;
/** The residents record of one located center (null when the release has none). */
export async function loadResidents(id, {shards = 128, fetchImpl = (...a) => fetch(...a)} = {}) {
  const shard = await fetchJSON(residentsShardPath(id, shards), fetchImpl);
  return shard?.venues?.[id] || null;
}
export const cachedResidents = (id, shards = 128) => resolved.get(residentsShardPath(id, shards))?.venues?.[id] || null;

/**
 * What a reader finds their way by on the 5 km map (owner 2026-11-20 16:35: “อย่างน้อยควรแสดงแนวถนน overlay ใน heatmap
 * ด้วย”): data/residents-map/, written by scripts/build-residents-map.py from OpenStreetMap and CityMETER Transit — the
 * major roads, rail lines, rivers, stations and a few names, in the 25 m frame of the subdistrict lines. Optional: the
 * map reads without it (PARTIAL['data/residents-map']).
 */
export const RESIDENTS_MAP_PATH = 'data/residents-map';
export const residentsMapShardPath = (id, shards = 128) => `${RESIDENTS_MAP_PATH}/${String(shardOf(id, shards)).padStart(3, '0')}.json`;
export const loadResidentsMapMeta = ({fetchImpl = (...a) => fetch(...a)} = {}) => fetchJSON(`${RESIDENTS_MAP_PATH}/meta.json`, fetchImpl);
export const cachedResidentsMapMeta = () => resolved.get(`${RESIDENTS_MAP_PATH}/meta.json`) || null;
export async function loadResidentsMap(id, {shards = 128, fetchImpl = (...a) => fetch(...a)} = {}) {
  const shard = await fetchJSON(residentsMapShardPath(id, shards), fetchImpl);
  return shard?.venues?.[id] || null;
}
export const cachedResidentsMap = (id, shards = 128) => resolved.get(residentsMapShardPath(id, shards))?.venues?.[id] || null;

/**
 * Places visitors use around the center (0.9.4; owner 2026-11-20 19:35 “และขอ heatmap แบบนี้สำหรับ visitor ด้วย”, and
 * the answer to the data question “infer/imply จากจุดกิจกรรมต่างๆได้มั้ย เช่น POI จาก datasets ต่างๆที่เชื่อมโยงกับ
 * registry sheet สามารถในหน่วยอะไรก็ได้ที่สามารถบอกเชิงปริมาณได้”): data/visitors-map/, written by
 * scripts/build-visitors-map.py — the located places of the release's “visit” and “retail” datasets per 250 m cell
 * within 5 km, their count at 1 · 3 · 5 km (equal to the rings, dataset by dataset) and its rank among the reference.
 * Optional: the section reads without it (PARTIAL['data/visitors-map']).
 */
export const VISITORS_MAP_PATH = 'data/visitors-map';
export const visitorsShardPath = (id, shards = 128) => `${VISITORS_MAP_PATH}/${String(shardOf(id, shards)).padStart(3, '0')}.json`;
export const loadVisitorsMeta = ({fetchImpl = (...a) => fetch(...a)} = {}) => fetchJSON(`${VISITORS_MAP_PATH}/meta.json`, fetchImpl);
export const cachedVisitorsMeta = () => resolved.get(`${VISITORS_MAP_PATH}/meta.json`) || null;
export async function loadVisitors(id, {shards = 128, fetchImpl = (...a) => fetch(...a)} = {}) {
  const shard = await fetchJSON(visitorsShardPath(id, shards), fetchImpl);
  return shard?.venues?.[id] || null;
}
export const cachedVisitors = (id, shards = 128) => resolved.get(visitorsShardPath(id, shards))?.venues?.[id] || null;

/**
 * Places people come to work and study (0.9.5; owner 2026-11-20 20:33 “นอกจากสถานที่พัก ก็ยังมีสถานศึกษา ที่ทำงาน โรงงาน
 * ร้านค้า ร้านอาหาร กิจกรรมต่างๆที่คนต้องเดินทางออกจากบ้านมาใช้บริการด้วย จากจุดที่เรามีมากพอสมควร น่าจะใช้ infer/imply ได้ดี
 * พอสมควรมั้ย”; answers “แยกเป็นแผนที่ที่สอง”, “นับแห่ง + บอกจำนวนคนประกอบ”): data/work-study-map/, written by
 * scripts/build-visitors-map.py --map workstudy from the release's “work” and “live” datasets without the rail stations.
 * Optional (PARTIAL['data/work-study-map']).
 */
export const WORK_MAP_PATH = 'data/work-study-map';
export const workShardPath = (id, shards = 128) => `${WORK_MAP_PATH}/${String(shardOf(id, shards)).padStart(3, '0')}.json`;
export const loadWorkMeta = ({fetchImpl = (...a) => fetch(...a)} = {}) => fetchJSON(`${WORK_MAP_PATH}/meta.json`, fetchImpl);
export const cachedWorkMeta = () => resolved.get(`${WORK_MAP_PATH}/meta.json`) || null;
export async function loadWork(id, {shards = 128, fetchImpl = (...a) => fetch(...a)} = {}) {
  const shard = await fetchJSON(workShardPath(id, shards), fetchImpl);
  return shard?.venues?.[id] || null;
}
export const cachedWork = (id, shards = 128) => resolved.get(workShardPath(id, shards))?.venues?.[id] || null;

/* ---------- reader options (kept for the session, like charts.js) ---------- */

const options = {radius: 3000, universe: 'all', level: '', bench: 'province', open: {table: false, more: false, live: false, method: false, res: false, vis: false, vistable: false, work: false, worktable: false}};
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

/** “ศูนย์การค้าชุดอ้างอิงที่มีพิกัด” → “ศูนย์การค้า”: the type word of a universe label. */
const typeWord = u => String(u?.th || '').replace(/(ชุดอ้างอิง)?ที่มีพิกัด$/, '');

/**
 * Universe of a ring percentile: the rank reference (meta.reference: the centers located in release 0.2.0, owner
 * 2026-11-20 11:57) or its centers of the venue's own type. A center placed later is ranked against it.
 */
export function universeOf(meta, row, universe = options.universe) {
  const type = meta?.universes?.[row?.group];
  if (universe === 'type' && type) return {key: 'type', n: type.n, th: type.th, short: `${typeWord(type)} ${num(type.n)} แห่ง`};
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
        id, group: g.id, groupLabel: g.th, label: m.short?.[0] || m.th, labelEn: m.short?.[1] || m.en, name: m.th, nameEn: id === 'shopping' ? 'Other shopping centers and markets' : m.en, unit: m.unit?.[0] || '', unitEn: m.unit?.[1] || '', count, p,
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
 * Rank words for a mid-rank percentile of a value above zero: “ระดับเทียบ 96/100 ใน …”; the top and the bottom percent
 * read “สูงสุด 1% ของ …” / “ต่ำสุด 1% ของ …” (a mid-rank never reaches 0 or 100, so it is never written as either).
 * A mid-rank counts centers with the same value as half, so it is never written as “more than N%” (review of
 * 2026-11-24, F-13: with ties that sentence overstated the share of centers below in 919 of 1,476 cards).
 */
export function rankWords(p, group) {
  if (p >= 99.5) return `อยู่ในกลุ่มสูงสุด 1% ของ${group}`;
  if (p < 0.5) return `อยู่ในกลุ่มต่ำสุด 1% ของ${group}`;
  return `ระดับเทียบ ${num(Math.round(p))}/100 ใน${group}`;
}

/** “ระดับเทียบ 96/100 ใน 488 ศูนย์” / for a zero: “ไม่พบ เหมือน 64% ของ 488 ศูนย์” (an exact share). */
export function pctPhrase(r, uni) {
  if (r.count === 0) return r.zeroShare != null ? `ไม่พบ เหมือน ${num(r.zeroShare)}% ของ${uni.key === 'all' ? ' ' : ''}${uni.short}` : 'ไม่พบในรัศมีนี้';
  if (r.p == null) return '';
  return rankWords(r.p, uni.key === 'all' ? ` ${uni.short}` : uni.short);
}

/** Pictogram of a counted dataset (Aha cards); the retail datasets share the shop symbol. */
const RING_ICON = Object.freeze({school: 'students', hotel: 'hotel', office: 'office', government_office: 'gov', factory: 'factory', industrial_estates: 'factory', university: 'university', hospital: 'hospital', transit: 'train', shopping: 'venue', luxury: 'brand'});
export const ringIcon = r => RING_ICON[r.id] || (r.group === 'retail' ? 'store' : 'address');

/** Aha lines: the three counted datasets that set this venue furthest apart, at most one per group first. */
export function ahaRows(rows, {limit = 3} = {}) {
  // Headlines only from datasets whose records nearly all have a point (a partial set would rank where points exist).
  const ranked = rows.filter(r => r.count > 0 && r.p != null && !r.partial).sort((a, b) => b.p - a.p || b.count - a.count);
  const picked = [], groups = new Set();
  for (const r of ranked) { if (picked.length < limit && !groups.has(r.group)) { picked.push(r); groups.add(r.group); } }
  for (const r of ranked) { if (picked.length < limit && !picked.includes(r)) picked.push(r); }
  return picked;
}

/* ---------- the glance: four fixed readings, picture first (owner 2026-11-24 23:07; review v2 R-03, R-13, R-15) ---------- */

/** Highlights under the glance: complete datasets, the centers-and-markets row aside, at level 90 or more; at most three. */
export const HIGHLIGHT_MIN = 90;
export const highlightRows = (rows, {limit = 3} = {}) => ahaRows(rows.filter(r => r.id !== 'shopping' && r.p >= HIGHLIGHT_MIN), {limit});

/** Level 1–5 of a rank, fifths of the reference from low to high; 0 for a measured zero or no rank. */
export const levelOf = (p, count = 1) => (count > 0 && p != null ? Math.min(5, Math.floor(p / 20) + 1) : 0);
export const LEVEL_WORDS = Object.freeze([['ไม่พบ', 'none found'], ['น้อยมาก', 'very low'], ['น้อย', 'low'], ['ปานกลาง', 'middle'], ['มาก', 'high'], ['มากที่สุด', 'very high']]);
/**
 * Five bars from low to high; the filled ones take the LDS count sample of the rank itself (pctFill, the chart's
 * colour, the same HEX on both themes) and every bar has an outline, so the level reads without the colour.
 */
export function levelMeter(level, p = null) {
  const fill = p == null ? '' : ` style="background:${pctFill(p)}"`;
  return `<span class="level-meter" data-level="${level}" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i${i <= level ? ` class="on"${fill}` : ''}></i>`).join('')}</span>`;
}

/** Share of a places figure that comes from datasets with points for under 90% of their records, at one radius. */
export function partialShare(facts, pmeta, i) {
  let all = 0, part = 0;
  for (const d of pmeta?.datasets || []) {
    const n = facts?.ring?.[d.id]?.n?.[i] ?? 0;
    all += n;
    if (d.eligible && d.located != null && d.located / d.eligible < 0.9) part += n;
  }
  return all ? part / all : 0;
}

/**
 * The four readings every located center has: people living near (modelled), places to work and study, places
 * visitors use, other centers and markets. A figure that comes mostly from datasets without full points carries the
 * star and no level (Dataset Registry rule P06, owner-approved 2026-11-22: partial coverage is context, not ranked).
 */
export function glanceModel(meta, row, facts, {residents = null, residentsMeta = null, residentsState = 'idle', visitors = null, visitorsMeta = null, visitorsState = 'idle', work = null, workMeta = null, workState = 'idle'} = {}) {
  const i = RI[options.radius] ?? 1, u = options.universe === 'type' && meta?.universes?.[row?.group] ? 1 : 0;
  const stateOf = (rec, m, st) => (rec && m ? 'ready' : st === 'error' ? 'error' : st === 'empty' ? 'none' : 'loading');
  const shop = ringRows(meta, facts, row).find(r => r.id === 'shopping') || null;
  const place = (key, ic, target, th, en, rec, pmeta, st) => {
    const count = rec?.n?.[i] ?? null, star = rec ? partialShare(facts, pmeta, i) >= 0.5 : false;
    return {key, icon: ic, target, th, en, state: stateOf(rec, pmeta, st), value: count == null ? '' : num(count), unit: ['แห่ง', 'places'], count, star,
      p: !star && count > 0 ? rec.p?.[u]?.[i] ?? null : null};
  };
  return [
    {key: 'residents', icon: 'residents', target: 'locale-res-title', th: 'คนอยู่ใกล้', en: 'Living near', tag: ['แบบจำลอง', 'modelled'], state: stateOf(residents, residentsMeta, residentsState),
      value: residents ? aboutPeople(residents.n[i]) || '<10' : '', about: Boolean(residents && aboutPeople(residents.n[i])), unit: ['คน', 'people'], count: residents?.n?.[i] ?? null, star: false,
      p: residents ? residents.p?.[u]?.[i] ?? null : null},
    place('work', 'workers', 'locale-work-title', 'ที่ทำงานและที่เรียน', 'Work and study', work, workMeta, workState),
    place('visitors', 'visitors', 'locale-vis-title', 'ที่ผู้มาเยือนใช้', 'Places visitors use', visitors, visitorsMeta, visitorsState),
    {key: 'shopping', icon: 'venue', target: 'locale-chart-title', th: 'ศูนย์และตลาดอื่น', en: 'Other centers and markets', state: shop ? 'ready' : 'none',
      value: shop ? num(shop.count) : '', unit: ['แห่ง', 'places'], count: shop?.count ?? null, star: false, p: shop && shop.count > 0 ? shop.p : null},
  ];
}

/** The glance as four tiles (pictogram, figure, five-step level); each tile jumps to its block. `where`: 'section' | 'head'. */
export function glanceHTML(meta, row, facts, args = {}, {where = 'section'} = {}) {
  if (!meta || !facts || facts.located === false) return '';
  const tiles = glanceModel(meta, row, facts, args), uni = universeOf(meta, row);
  // the group with its size in both languages: “488 ศูนย์” / “488 centers”, “ศูนย์การค้า 288 แห่ง” / “288 shopping centers”
  const uniEn = `${num(uni.n)} ${uni.key === 'type' && GROUP_WORDS[row.group] ? `${GROUP_WORDS[row.group][1].toLowerCase()}s` : 'centers'}`;
  const group = uni.key === 'all' ? ` ${uni.short}` : uni.short;
  const tile = t => {
    const ready = t.state === 'ready', level = ready && !t.star && (t.p != null || t.count === 0) ? levelOf(t.p, t.count) : null;
    const figure = ready
      ? `<span class="glance-fig">${t.about ? `<small>${say('ราว', 'about')}</small> ` : ''}<b class="data-number">${esc(t.value)}</b> <span class="glance-unit">${say(t.unit[0], t.unit[1])}${t.star ? '<sup>*</sup>' : ''}</span></span>`
      : `<span class="glance-wait">${t.state === 'loading' ? say('กำลังโหลด…', 'Loading…') : say('ยังไม่มีข้อมูล', 'No data yet')}</span>`;
    const meter = level == null ? '' : `${levelMeter(level, t.count > 0 ? t.p : null)}<span class="sr-only">${say(`${LEVEL_WORDS[level][0]} ระดับ ${num(level)} จาก 5 เทียบ${group}`, `${LEVEL_WORDS[level][1]}, level ${num(level)} of 5 among ${uniEn}`)}</span>`;
    return `<li><button type="button" class="glance-tile" data-action="locale-jump" data-target="${t.target}" data-glance="${t.key}">${icon(t.icon)}<span class="glance-label">${say(t.th, t.en)}${t.tag ? ` <span class="glance-tag">${say(t.tag[0], t.tag[1])}</span>` : ''}</span>${figure}${meter}</button></li>`;
  };
  const starred = tiles.some(t => t.state === 'ready' && t.star);
  const key = `<p class="hint glance-key">${levelMeter(3)}<span>${say(`ระดับเทียบ${group} · น้อย → มาก`, `Level among ${uniEn} · low → high`)}</span>${starred ? `<span>${say('* นับเฉพาะรายการที่มีพิกัด จึงไม่จัดระดับ', '* counted only where a record has a point, so no level')}</span>` : ''}</p>`;
  const lead = where === 'head' ? `<p class="glance-lead">${icon('area')}${say(`รอบศูนย์ใน ${km(options.radius)}`, `Within ${kmEn(options.radius)} of the center`)}</p>` : '';
  return `<div class="locale-glance${where === 'head' ? ' in-head' : ''}" id="locale-glance${where === 'head' ? '-head' : ''}" data-venue="${esc(row.id)}">${lead}<ul class="glance-grid" aria-label="${where === 'head' ? 'รอบศูนย์นี้' : `ใน ${esc(km(options.radius))} รอบศูนย์`}">${tiles.map(tile).join('')}</ul>${key}</div>`;
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

/** “ต่อ ตร.กม. ระดับเทียบ 39/100 ในย่านในกรุงเทพฯ (832)”. */
export function areaPhrase(r, {level, bench, provinceCode}) {
  if (r.p == null || r.n == null) return '';
  const word = levelWord(level, provinceCode);
  const group = bench === 'peer' ? `${word}ที่มีศูนย์ชุดอ้างอิง` : `${word}ใน${provinceWord(provinceCode)}`;
  if (r.value === 0 && r.zeroShare != null) return `ไม่มีในข้อมูล เหมือน ${num(r.zeroShare)}% ของ${group} (${num(r.n)})`;
  const words = rankWords(r.p, `${group} (${num(r.n)})`);
  return r.basis === 'per_sqkm' ? `ต่อ ตร.กม. ${words}` : words;
}

/**
 * The rank reference, one line for the folded methods: the release's own sentence, and what the block shows besides.
 * Empty when the release ranks every located center (no meta.reference).
 */
export function referenceLine(meta, extra = ['', '']) {
  const R = meta?.reference;
  if (!R?.th || !R?.en) return '';
  return `<li>${say(`${R.th}${extra[0] ? ` · ${extra[0]}` : ''}`, `${usSpelling(R.en)}${extra[1] ? ` · ${extra[1]}` : ''}`)}</li>`;
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

/**
 * “ใกล้สุด 850 ม.” / “ใกล้สุด 1.2 กม.”; a record at this center's own point (a shop tied to this center by id, placed at
 * its point; 0.9.3) reads “ใกล้สุดอยู่ที่จุดของศูนย์นี้”, not “0 ม.”.
 */
export const nearWords = near => (near < 5 ? 'ใกล้สุดอยู่ที่จุดของศูนย์นี้' : `ใกล้สุด ${near < 1000 ? `${num(Math.round(near / 10) * 10)} ม.` : `${DECIMAL.format(near / 1000)} กม.`}`);

/** The chart tooltip's lines under a row's count and rank: its measure, the nearest, up to four subgroups, the share with a point. */
export const chartTipExtra = r => [r.measure ? `${r.measure.th} ${num(r.measure.value)}` : '', r.near != null ? nearWords(r.near) : '',
  r.sub.length ? r.sub.slice(0, 4).map(s => `${s.th} ${num(s.count)}`).join(' · ') : '', r.partial ? `มีพิกัด ${num(r.located)} จาก ${num(r.eligible)} รายการ` : ''].filter(Boolean);

/* ---------- HTML ---------- */

const chip = (action, key, value, pressed, label) =>
  `<button type="button" class="chip-toggle" data-action="${action}" data-${key}="${esc(value)}" aria-pressed="${pressed}">${esc(label)}</button>`;
const openAttr = key => (options.open[key] ? ' open' : '');

function ringTable(meta, facts, row, uni) {
  const rows = RADII.map(r => ringRows(meta, facts, row, {radius: r}));
  const body = rows[0].map((r, k) => {
    const cells = RADII.map((_, j) => `<td class="data-number">${num(rows[j][k].count)}</td>`).join('');
    const extra = [r.near != null ? nearWords(r.near) : '',
      r.partial ? `มีพิกัด ${num(r.located)} จาก ${num(r.eligible)}` : '', r.brands ? `เฉพาะ ${r.brands}` : ''].filter(Boolean).join(' · ');
    const sub = [extra, r.source, r.date ? thaiDay(r.date) : ''].filter(Boolean).join(' · ');
    return `<tr><th scope="row">${say(r.name, r.nameEn)}${r.partial ? '<sup>*</sup>' : ''}<small>${esc(sub)}</small></th>${cells}<td class="data-number">${rows[1][k].count === 0 ? say('ไม่พบ', 'none') : rows[1][k].p == null ? say('ยังไม่มี', 'not yet') : `${num(Math.round(rows[1][k].p))}`}</td></tr>`;
  }).join('');
  return `<details class="locale-details" data-locale-open="table"${openAttr('table')}><summary>${icon('table')}ตัวเลขทุกรัศมี</summary>
    <div class="table-wrap locale-table-wrap"><table class="locale-table"><caption class="sr-only">จำนวนในรัศมี 1, 3 และ 5 กม. และระดับเทียบที่ 3 กม.</caption>
    <thead><tr><th scope="col">ชุดข้อมูล</th><th scope="col">1 กม.</th><th scope="col">3 กม.</th><th scope="col">5 กม.</th><th scope="col">ระดับเทียบ 3 กม. (0–100)</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="hint">ระดับเทียบกับ${esc(uni.th)} ${num(uni.n)} แห่ง${rows[0].some(r => r.partial) ? ' · * นับได้เฉพาะรายการที่มีพิกัด' : ''}</p></details>`;
}

/** Plain list of the same rows as the chart (fallback when amCharts cannot load). */
export function ringListHTML(rows, uni, radius) {
  return `<ol class="locale-dots" aria-label="จำนวนในรัศมี ${esc(km(radius))} เทียบกับ${esc(uni.th)}">${rows.map(r => {
    const x = r.count === 0 ? 0 : r.p ?? 0;
    return `<li class="dot-row"><span class="dot-label">${say(r.label, r.labelEn)}${r.partial ? '<sup>*</sup>' : ''}</span><span class="dot-track" aria-hidden="true"><i class="dot${r.count === 0 ? ' is-zero' : ''}" style="left:${x}%;background:${pctFill(x)}"></i></span><span class="dot-value"><b class="data-number">${num(r.count)}</b></span><span class="sr-only">${esc(pctPhrase(r, uni))}</span></li>`;
  }).join('')}</ol>`;
}

/** [th, en] of a period the data states: “2026-10” → “ต.ค. 2569” / “Oct 2026”; a year alone as a year (BE in Thai). */
export function periodWords(period) {
  const v = String(period || '');
  let m = v.match(/^(\d{4})-(\d{2})$/);
  if (m) return [`${MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`, `${MONTHS_EN[Number(m[2]) - 1]} ${m[1]}`];
  m = v.match(/^(\d{4})$/);
  if (m) { const y = Number(m[1]); return y > 2400 ? [`ปี ${y}`, `${y - 543}`] : [`ปี ${y + 543}`, `${y}`]; }
  return null;
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
    const short = phrase.replace(/(ระดับเทียบ [\d,]+\/100) ใน.+ (\([\d,]+\))$/, '$1 $2');
    const pw = periodWords(r.period), period = pw ? ` <span class="area-period">${say(pw[0], pw[1])}</span>` : '';
    return `<div class="area-row"><dt>${extLink(link, r.label, 'area-link', r.labelEn)}</dt><dd><span class="area-value"><b class="data-number"${enAttr(r.textEn)}>${esc(r.text)}</b>${r.unit && r.basis !== 'category' ? ` <span class="area-unit"${enAttr(r.unitEn)}>${esc(r.unit)}</span>` : ''}${period}</span>${phrase ? (short !== phrase ? `<span class="area-pct" aria-hidden="true">${esc(short)}</span><span class="sr-only">${esc(phrase)}</span>` : `<span class="area-pct">${esc(phrase)}</span>`) : ''}${track}</dd></div>`;
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
    ${rows.some(r => periodWords(r.period)) && rows.some(r => !periodWords(r.period)) ? `<p class="hint area-period-note">${say('ป้ายเดือนหรือปีคือช่วงของข้อมูลที่แหล่งระบุ แถวที่ไม่มีป้าย แหล่งยังไม่ระบุช่วง', 'A month or year label is the period the source states; a row without one has no stated period')}</p>` : ''}
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

/* ---------- the prior block: observed context beside generated priors (0.2, owner 2026-11-18) ---------- */

/** [th, en] of a distance already rounded to 100 m: “800 ม.” / “2.3 กม.”. */
export function distanceWords(m) {
  if (m == null) return ['', ''];
  return m < 1000 ? [`${num(m)} ม.`, `${num(m)} m`] : [`${DECIMAL.format(m / 1000)} กม.`, `${DECIMAL.format(m / 1000)} km`];
}

/** [th, en] rank words of a mid-rank percentile, as rankWords: “ระดับเทียบ 61/100 ใน …”; top and bottom 1% as such. */
export function rankPair(p, groupTh, groupEn) {
  if (p == null) return null;
  if (p >= 99.5) return [`อยู่ในกลุ่มสูงสุด 1% ของ${groupTh}`, `in the top 1% of ${groupEn}`];
  if (p < 0.5) return [`อยู่ในกลุ่มต่ำสุด 1% ของ${groupTh}`, `in the bottom 1% of ${groupEn}`];
  return [`ระดับเทียบ ${num(Math.round(p))}/100 ใน${groupTh}`, `level ${num(Math.round(p))}/100 among ${String(groupEn).trim()}`];
}
/** Rank of an observed context signal among the located venues (or those that have the value). */
function ctxRank(meta, sg, key, opts) {
  const p = sg?.pct?.[key];
  if (!p) return null;
  const known = meta?.context?.ranked?.[key] === 'known';
  const w = rankPair(p[0], known ? `ศูนย์ที่มีค่านี้ ${num(p[1])} แห่ง` : ` ${num(p[1])} ศูนย์`, known ? `${num(p[1])} centers with this value` : `${num(p[1])} centers`, opts);
  return w ? [...w, p[0]] : null;
}

/** Address of a record in its own CityMETER demo (`?e=<kind>:<key>`) on this site; an English page asks for English when that demo has it. */
export function demoRecordURL(meta, family, key) {
  const d = meta?.context?.demoLink?.[family];
  if (!d || key == null || key === '') return '';
  const demo = DEMOS.find(x => x.path === d[0]);
  const base = demo ? demoUrl(demo) : `${DEMO_ORIGIN}/${d[0]}/`;
  return `${base}?e=${d[1]}:${encodeURIComponent(key)}${LANG === 'en' && demo?.en ? '&lang=en' : ''}`;
}
/** A Wikipedia title as production records it (“th:เซ็นทรัลพลาซา พระราม 3”) → its article address. */
export function wikiURL(ref) {
  const m = /^([a-z]{2,3}):(.+)$/.exec(String(ref || ''));
  return m ? `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2].trim().replace(/ /g, '_'))}` : '';
}

const THAI_RE = /[ก-๛]/;
const pairText = parts => [parts.map(p => p[0]).filter(Boolean).join(' · '), parts.map(p => p[1]).filter(Boolean).join(' · ')];
/** A name as published: its English beside it when the source gives one, else a plain span (the section's English
 * registers it as a name that stays Thai — venue-locale-i18n.js#registerLocaleSignalNames). */
const nameSpan = (name, en = '') => (en && en !== name && !THAI_RE.test(en) ? say(name, en) : `<span>${esc(name)}</span>`);
/** Rank of an observed value as a neutral track (no data colour: these rows sit beside hypotheses). */
const track = p => (p == null ? '' : `<span class="sig-track" aria-hidden="true"><i style="left:${Math.max(0, Math.min(100, Number(p)))}%"></i></span>`);
/** One observed line: its icon, the words, the rank ([th, en, percentile]) and the rank as a track. */
const factLine = (th, en, rank = null, ic = '') => `<li class="sig">${icon(ic || 'evidence')}<span class="sig-body"><span class="sig-text">${say(th, en)}</span>${rank ? `<span class="fact-rank">${say(rank[0], rank[1])}</span>${track(rank[2])}` : ''}</span></li>`;
/** Icon of the family a named record comes from. */
const FAMILY_ICON = Object.freeze({school: 'students', university: 'university', hotel: 'hotel', luxury: 'brand', office: 'office', hospital: 'hospital', factory: 'factory', transit: 'train', condo: 'building'});
/** One named record: its family's icon, its name that opens it in its own demo, then [th, en] pairs or names (plain strings). */
const poiLine = (meta, family, key, name, nameEn, parts, tail = '') => {
  const url = demoRecordURL(meta, family, key);
  const en = nameEn && nameEn !== name && !THAI_RE.test(nameEn) ? nameEn : '';
  const bits = parts.filter(Boolean).map(p => (typeof p === 'string' ? `<span>${esc(p)}</span>` : say(p[0], p[1])));
  return `<li class="poi">${icon(FAMILY_ICON[family] || 'address')}<span class="sig-body"><span class="sig-text">${url ? extLink(url, name, 'poi-link', en) : nameSpan(name, en)}</span>${bits.length ? `<span class="poi-meta">${bits.join(' · ')}</span>` : ''}${tail}</span></li>`;
};
const range = (a, b) => (a && b && a !== b ? `${num(a)}–${num(b)}` : num(a || b));
const groupOf = (meta, kind, id) => meta?.context?.groups?.[kind]?.[id] || null;

/** The finest unit that has one production metric: {level, r} (areaRows, ranked among units that hold centers). */
/** A median read from fewer records than this at one level is too thin to stand for the place; the next level up is read. */
export const MIN_MEDIAN_N = 10;
function areaValue(meta, facts, row, ds, metric) {
  const defs = meta.area?.[ds]?.metrics || [];
  const countId = defs.find(x => x.id === metric)?.basis === 'value' ? defs.find(x => x.basis === 'per_sqkm')?.id : null;
  for (const level of levelsOf(facts)) {
    const n = countId ? facts.area?.[ds]?.[level]?.[countId]?.[0] : null;
    if (countId && (n == null || n < MIN_MEDIAN_N)) continue;
    const r = areaRows(meta, facts, row, {level, bench: 'peer'}).find(x => x.ds === ds && x.metric === metric);
    if (r) return {level, r};
  }
  return null;
}
/** Icon of a production value read beside the groups. */
const AREA_ICON = Object.freeze({deed: 'land', landoffer: 'land', condo: 'building', condoOffer: 'building', apartment: 'building', rentWise: 'building', detachedhouse: 'residents', townhouse: 'residents', estate: 'residents', population: 'residents', placeOfWorship: 'visitors', businessDynamics: 'office'});
function areaLine(meta, facts, row, ds, metric) {
  const a = areaValue(meta, facts, row, ds, metric);
  if (!a) return '';
  const {level, r} = a, code = row?.provinceCode;
  const u = facts.units?.[level];
  const unitName = u ? (level === 'province' ? (code === BANGKOK ? 'กรุงเทพมหานคร' : `จังหวัด${u[2]}`) : level === 'municipality' ? u[2] : `${levelWord(level, code)}${u[2]}`) : '';
  const link = r.m.link.replace('{province}', encodeURIComponent(code || '')).replace('{district}', encodeURIComponent(row?.districtCode || ''));
  const phrase = areaPhrase(r, {level, bench: 'peer', provinceCode: code});
  const named = meta.priors?.signals?.[`area:${ds}:${metric}`] || [r.label, r.labelEn];
  const label = [named[0].replace(/ในพื้นที่$/, ''), String(named[1] || '').replace(/ in the area$/, '')];
  return `<li class="sig">${icon(AREA_ICON[ds] || 'area')}<span class="sig-body"><span class="sig-text">${extLink(link, label[0], 'area-link', label[1])} <b class="data-number">${esc(r.text)}</b> <span${enAttr(r.unitEn)}>${esc(r.unit)}</span>${unitName ? ` ${say('ใน', 'in')} <span>${esc(unitName)}</span>` : ''}</span>${phrase ? `<span class="fact-rank">${esc(phrase)}</span>` : ''}${r.value !== 0 ? track(r.p) : ''}</span></li>`;
}

/** Observed lines of one group: values with their rank, and named records that open in their own demo. */
function factLines(meta, sg, facts, row, seg) {
  const s = sg?.sig || {}, ex = sg?.ex || {}, out = [];
  const C = meta.context || {};
  if (seg === 'residents') {
    for (const [ds, metric] of [['deed', 'medianPrice'], ['condoOffer', 'y2025MedianOffer'], ['detachedhouse', 'medPrice'], ['apartment', 'medianPrice'], ['condo', 'medianPrice'], ['townhouse', 'medianPrice']]) {
      const line = areaLine(meta, facts, row, ds, metric);
      if (line && out.length < 4) out.push(line);
    }
    if (ex.condo?.length) {
      const link = meta.area?.condo?.link?.replace('{province}', encodeURIComponent(row?.provinceCode || '')).replace('{district}', encodeURIComponent(row?.districtCode || ''));
      out.push(`<li class="sig">${icon('building')}<span class="sig-body"><span class="sig-text">${say('คอนโดในแขวง/ตำบลนี้ที่ราคาประเมินห้องชุดสูงสุด (บาท/ตร.ม.):', 'Condominiums of this subdistrict with the highest unit appraisal (THB/m²):')} ${ex.condo.map(c => `<span>${esc(c.n)}</span> <b class="data-number">${num(c.p)}</b>`).join(' · ')}${link ? ` ${extLink(link, 'ดูใน CityMETER', 'source-link', 'See in CityMETER')}` : ''}</span></span></li>`);
    }
  } else if (seg === 'students') {
    if (s['school.n3'] != null) {
      out.push(factLine(`โรงเรียนเอกชน ${num(s['school.priv3'] || 0)} และนานาชาติ ${num(s['school.intl3'] || 0)} แห่ง จากสถานศึกษา ${num(s['school.n3'])} แห่งใน 3 กม.`,
        `${num(s['school.priv3'] || 0)} private and ${num(s['school.intl3'] || 0)} international of ${num(s['school.n3'])} schools within 3 km`, ctxRank(meta, sg, 'school.intlpriv3', {count: true}), 'students'));
    }
    if (s['school.fee5.n']) {
      out.push(factLine(`ค่าเทอมสูงสุดที่โรงเรียนประกาศใน 5 กม. ${num(s['school.fee5.max'])} บาท/ปี`, `Highest published tuition within 5 km: THB ${num(s['school.fee5.max'])} a year`, ctxRank(meta, sg, 'school.fee5.max'), 'spend'));
    } else {
      out.push(factLine(`ยังไม่มีโรงเรียนใน 5 กม. ที่ประกาศค่าเทอมในชุดข้อมูล (ทั้งประเทศมี ${num(C.feeSchools || 0)} โรงเรียน)`, `No school within 5 km has published tuition in the dataset (${num(C.feeSchools || 0)} schools nationwide)`, null, 'spend'));
    }
    for (const e of ex.school || []) {
      const g = groupOf(meta, 'school', e.g);
      const parts = [g, e.f ? [`ค่าเทอม ${range(e.f[0], e.f[1])} บาท/ปี${e.y ? ` (ปีการศึกษา ${e.y})` : ''}`, `tuition THB ${range(e.f[0], e.f[1])} a year${e.y ? ` (${e.y})` : ''}`] : null, distanceWords(e.d)].filter(Boolean);
      out.push(poiLine(meta, 'school', e.k, e.n, e.e, parts, e.u ? ` ${extLink(e.u, 'หน้าค่าเทอม', 'source-link', 'tuition page')}` : ''));
    }
    for (const e of ex.university || []) {
      const parts = [groupOf(meta, 'university', e.t), e.s ? [`นักศึกษาทั้งมหาวิทยาลัย ${num(e.s)} คน`, `${num(e.s)} students in the university`] : null, distanceWords(e.d)].filter(Boolean);
      out.push(poiLine(meta, 'university', e.k, e.n, '', parts));
    }
  } else if (seg === 'workers') {
    if (s['office.n3'] != null) {
      const rent = s['office.rent3.med'];
      if (s['office.n3'] === 0) out.push(factLine('ไม่พบสำนักงานในชุดข้อมูลใน 3 กม.', 'No office record within 3 km', null, 'office'));
      else out.push(factLine(`สำนักงาน ${num(s['office.n3'])} รายการใน 3 กม.${rent ? ` · ค่าเช่าที่ประกาศ (ค่ากลาง) ${num(rent)} บาท/ตร.ม./เดือน` : ''}`,
        `${num(s['office.n3'])} office records within 3 km${rent ? ` · median asking rent THB ${num(rent)}/m²/month` : ''}`, rent ? ctxRank(meta, sg, 'office.rent3.med') : null, 'office'));
    }
    for (const e of ex.office || []) {
      const parts = [e.a ? [`${num(e.a)} ตร.ม.`, `${num(e.a)} m²`] : null, e.rr ? [`ค่าเช่าที่ประกาศ ${range(e.rr[0], e.rr[1])} บาท/ตร.ม./เดือน${e.ro ? ` (${thaiDay(e.ro)})` : ''}`, `asking rent THB ${range(e.rr[0], e.rr[1])}/m²/month${e.ro ? ` (${e.ro})` : ''}`] : null, distanceWords(e.d)].filter(Boolean);
      out.push(poiLine(meta, 'office', e.k, e.n, e.e, parts));
    }
    if (s['hospital.private3'] === 0) out.push(factLine('ไม่พบโรงพยาบาลเอกชนใน 3 กม.', 'No private hospital within 3 km', null, 'hospital'));
    else if (s['hospital.private3'] != null) {
      out.push(factLine(`โรงพยาบาลเอกชน ${num(s['hospital.private3'])} แห่ง ${num(s['hospital.privateBeds3'] || 0)} เตียงใน 3 กม.`, `${num(s['hospital.private3'])} private hospitals with ${num(s['hospital.privateBeds3'] || 0)} beds within 3 km`,
        ctxRank(meta, sg, 'hospital.privateBeds3', {count: true}), 'hospital'));
    }
    for (const e of ex.hospital || []) {
      out.push(poiLine(meta, 'hospital', e.k, e.n, '', [groupOf(meta, 'hospital', e.g), e.b ? [`${num(e.b)} เตียง`, `${num(e.b)} beds`] : null, distanceWords(e.d)].filter(Boolean)));
    }
    if (s['factory.workers5'] != null) {
      out.push(factLine(`คนงานโรงงานตามทะเบียน ${num(s['factory.workers5'])} คนใน 5 กม.`, `${num(s['factory.workers5'])} registered factory workers within 5 km`, ctxRank(meta, sg, 'factory.workers5', {count: true}), 'factory'));
    }
    for (const e of ex.factory || []) {
      out.push(poiLine(meta, 'factory', e.k, e.n, '', [groupOf(meta, 'factory', e.fm), [`คนงาน ${num(e.w)} คน`, `${num(e.w)} workers`], distanceWords(e.d)].filter(Boolean)));
    }
    if (s['transit.n1'] != null) {
      const near = s['transit.nearM'] != null ? distanceWords(s['transit.nearM']) : null;
      out.push(s['transit.n1'] > 0
        ? factLine(`สถานีรางใน 1 กม. ${num(s['transit.n1'])} สถานี${near ? ` · ใกล้สุด ${near[0]}` : ''}`, `${num(s['transit.n1'])} rail stations within 1 km${near ? ` · nearest ${near[1]}` : ''}`, null, 'train')
        : factLine(`ไม่มีสถานีรางใน 1 กม.${near ? ` · ใกล้สุด ${near[0]}` : ''}`, `No rail station within 1 km${near ? ` · nearest ${near[1]}` : ''}`, null, 'train'));
    }
    for (const e of ex.transit || []) {
      out.push(poiLine(meta, 'transit', e.k, e.n, e.e, [...(e.l || []), distanceWords(e.d)]));
    }
    if (s['gov.n3'] != null) out.push(s['gov.n3'] > 0 ? factLine(`หน่วยงานรัฐ ${num(s['gov.n3'])} แห่งใน 3 กม.`, `${num(s['gov.n3'])} government offices within 3 km`, null, 'gov') : factLine('ไม่พบหน่วยงานรัฐใน 3 กม.', 'No government office within 3 km', null, 'gov'));
  } else if (seg === 'visitors') {
    if (s['hotel.priced3']) {
      out.push(factLine(`ที่พักรายคืนที่มีราคาบันทึก ${num(s['hotel.priced3'])} แห่งใน 3 กม. · ราคาเริ่มต้นที่บันทึก (ค่ากลาง) ${num(s['hotel.med3'])} บาท`,
        `${num(s['hotel.priced3'])} nightly stays with a recorded price within 3 km · median lowest recorded price THB ${num(s['hotel.med3'])}`, ctxRank(meta, sg, 'hotel.med3'), 'hotel'));
      if (s['hotel.upperRooms3'] != null && C.hotel) {
        out.push(factLine(`ห้องในที่พักราคาเริ่มต้น ${num(C.hotel.p80)} บาทขึ้นไป ${DECIMAL.format(s['hotel.upperRooms3'])}% · ${num(C.hotel.p20)} บาทลงมา ${DECIMAL.format(s['hotel.budgetRooms3'] ?? 0)}% ของห้องในที่พักที่มีราคาบันทึก`,
          `Rooms in stays from THB ${num(C.hotel.p80)} up: ${DECIMAL.format(s['hotel.upperRooms3'])}% · THB ${num(C.hotel.p20)} or less: ${DECIMAL.format(s['hotel.budgetRooms3'] ?? 0)}% of rooms in stays with a recorded price`, ctxRank(meta, sg, 'hotel.upperRooms3'), 'spend'));
      }
    } else if (s['hotel.n3'] != null) {
      out.push(factLine(`ที่พักใน 3 กม. ${num(s['hotel.n3'])} แห่ง ยังไม่มีราคาบันทึกของที่พักรายคืน`, `${num(s['hotel.n3'])} stays within 3 km; no recorded nightly price yet`, null, 'hotel'));
    }
    for (const e of ex.hotel || []) {
      const parts = [e.b || null, e.p ? [`ราคาเริ่มต้นที่บันทึก ${num(e.p)} บาท`, `lowest recorded price THB ${num(e.p)}`] : null, e.r ? [`${num(e.r)} ห้อง`, `${num(e.r)} rooms`] : null, distanceWords(e.d)].filter(Boolean);
      out.push(poiLine(meta, 'hotel', e.k, e.n, e.e, parts));
    }
    if (s['lux.r3'] != null) {
      out.push(factLine(`จุดขายแบรนด์หรู ${num(s['lux.r1'] || 0)} จุดใน 1 กม. · ${num(s['lux.r3'])} จุดใน 3 กม.`, `${num(s['lux.r1'] || 0)} luxury points of sale within 1 km · ${num(s['lux.r3'])} within 3 km`, ctxRank(meta, sg, 'lux.r3', {count: true}), 'brand'));
    }
    for (const e of ex.luxury || []) {
      const g = groupOf(meta, 'luxury', e.sg);
      out.push(poiLine(meta, 'luxury', e.k, e.n, '', [g, e.h || null, distanceWords(e.d)].filter(Boolean)));
    }
    const attr = areaLine(meta, facts, row, 'placeOfWorship', 'touristAttractionCount');
    if (attr) out.push(attr);
  }
  return out;
}

const DATA_OF = {
  residents: [['production', 'CityMETER production (ราคาประเมินที่ดิน ราคาประกาศ และค่าเช่า)', 'CityMETER production (appraisal, asking prices and rents)'], ['condominium', 'ทะเบียนวิจัยคอนโดมิเนียม', 'Condominium research master']],
  students: [['school', 'CityMETER School', 'CityMETER School'], ['university', 'CityMETER University', 'CityMETER University']],
  workers: [['office', 'CityMETER Office', 'CityMETER Office'], ['hospital', 'CityMETER Hospital', 'CityMETER Hospital'], ['factory', 'CityMETER Factory', 'CityMETER Factory'], ['transit', 'CityMETER Transit', 'CityMETER Transit']],
  visitors: [['hotel', 'CityMETER Hotel', 'CityMETER Hotel'], ['luxury', 'CityMETER Luxury Brands', 'CityMETER Luxury Brands']],
};
function cardDataLine(meta, seg) {
  const C = meta.context || {};
  const parts = (DATA_OF[seg] || []).map(([fam, th, en]) => {
    if (fam === 'production') return [th, en];
    if (fam === 'condominium') return C.condoPeriod ? [`${th} ${C.condoPeriod[0]}`, `${en} ${C.condoPeriod[1]}`] : [th, en];
    const d = C.dates?.[fam];
    return d ? [`${th} ตรวจ ${thaiDay(d)}`, `${en} checked ${d}`] : [th, en];
  });
  const boundary = seg === 'residents' ? ['หน่วยพื้นที่ที่ศูนย์ตั้งอยู่', 'the units the center sits in'] : ['รัศมีเส้นตรงจากจุดของศูนย์', 'straight-line radius from the center’s point'];
  const [th, en] = pairText([...parts, boundary]);
  return `<p class="hint persona-data">${say(`ข้อมูล: ${th}`, `Data: ${en}`)}</p>`;
}

const pips = level => { const n = {low: 1, medium: 2, high: 3}[level] || 0; return `<span class="pips" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`; };
/** How many of a group are likely around, in words for people (a prior). */
const PRESENCE = Object.freeze({high: ['น่าจะมีมาก', 'Likely many'], medium: ['น่าจะมีปานกลาง', 'Likely some'], low: ['น่าจะมีน้อย', 'Likely few'], insufficient: ['ข้อมูลไม่พอ', 'Not enough data']});
/** Short names of the groups on their tiles; the open card keeps the full name. */
const SEG_SHORT = Object.freeze({residents: ['ผู้อยู่อาศัย', 'Residents'], students: ['นักเรียนและครอบครัว', 'Students and families'], workers: ['คนทำงาน', 'Workers'], visitors: ['ผู้มาเยือน', 'Visitors']});
const baht = n => `<span class="baht" aria-hidden="true">${[1, 2, 3].map(i => `<i${i <= n ? ' class="on"' : ''}>฿</i>`).join('')}</span>`;
/** Spending power read from observed prices as three ฿ marks and its words (a prior, never income or willingness to pay). */
function spendMeter(P, sp) {
  const n = sp && sp[0] !== 'insufficient' ? {low: 1, medium: 2, high: 3}[sp[0]] || 0 : 0;
  const w = n ? P.levels[sp[0]] : ['ยังไม่ประเมิน', 'Not rated'];
  return `<span class="spend-meter${n ? '' : ' is-none'}">${baht(n)}${say(`ระดับราคารอบศูนย์ ${w[0]}`, `Price level around: ${String(w[1]).toLowerCase()}`)}</span>`;
}
/** Groups by how many are likely around, most first. */
const segOrder = (P, pr) => (P.segments || []).map(s => s[0]).filter(s => pr.seg?.[s]).sort((a, b) => (pr.seg[b][1] ?? -1) - (pr.seg[a][1] ?? -1));

/** Formats that would likely fit (a prior): plain chips, never read as shops that were found. */
const formatChips = (P, ids) => (ids || []).map(id => P.pmf?.[id]).filter(Boolean).map(x => `<span class="pmf">${say(x[0], x[1])}</span>`).join('');

/** One group as a tile that opens into its card: the observed lines and places first, then the reading (hypotheses). */
function personaHTML(meta, pr, sg, facts, row, seg) {
  const P = meta.priors;
  const s = pr.seg?.[seg], sp = pr.spend?.[seg], say_ = pr.say?.[seg] || {}, mix = pr.mix?.[seg];
  if (!s) return '';
  const lab = P.segments.find(x => x[0] === seg) || [seg, seg, seg];
  const short = SEG_SHORT[seg] || [lab[1], lab[2]];
  const pres = PRESENCE[s[0]] || PRESENCE.insufficient;
  const lv = P.levels[s[0]] || [s[0], s[0]];
  const plv = sp && sp[0] !== 'insufficient' ? P.levels[sp[0]] : null;
  const key = `seg-${seg}`;
  const words = (dict, ids) => (ids || []).map(id => dict[id]).filter(Boolean);
  const list = items => say(items.map(x => x[0]).join(' · '), items.map(x => x[1]).join(' · '));
  const basis = sigs => (sigs || []).filter(x => x[1] != null).map(([sid, p]) => {
    const l = P.signals[sid] || [sid, sid];
    const area = sid.startsWith('area:');
    const w = rankPair(p, area ? 'พื้นที่ที่มีศูนย์' : 'ศูนย์', area ? 'areas with centers' : 'centers');
    return [`${l[0]} ${w[0]}`, `${l[1]} ${w[1]}`];
  });
  const bPresence = basis(s[3]), bSpend = sp && sp[0] !== 'insufficient' ? basis(sp[3]) : [];
  // workers: the two strongest clusters set the level (an office district or a factory belt are alternatives)
  const top2 = s[4] === 'top2' ? [' (ใช้สองค่าที่สูงที่สุด เพราะงานแต่ละแบบแทนกันได้)', ' (the two highest count, since one kind of work stands in for another)'] : ['', ''];
  const spendNote = sp?.[4] === 'factory_led' ? `<p class="hint persona-basis">${say('ระดับราคารอบศูนย์: ยังไม่ประเมิน ราคาที่มีเป็นค่าเช่าและพื้นที่สำนักงาน ใช้แทนงานโรงงานไม่ได้', 'Price level around: not rated; the prices on hand are office rents and areas, which do not speak for factory work')}</p>` : '';
  const facts_ = factLines(meta, sg, facts, row, seg);
  const formats = formatChips(P, say_.pmf);
  const readRow = (ic, th, en, body) => `<li class="read">${icon(ic)}<span class="read-body"><b class="read-label">${say(th, en)}</b> ${body}</span></li>`;
  const wtp = words(P.wtp, say_.wtp), pref = words(P.pref, say_.pref), checks = words(P.check, say_.chk);
  const read = [
    wtp.length ? readRow('spend', 'น่าจะยอมจ่ายเพิ่มให้', 'Would likely pay more for', list(wtp)) : '',
    pref.length ? readRow('hours', 'น่าจะมาแบบไหน', 'How they would likely come', list(pref)) : '',
    formats ? readRow('store', 'หมวดที่น่าจะเข้ากัน', 'Formats that would likely fit', `<span class="pmf-chips">${formats}</span>`) : '',
    checks.length ? readRow('evidence', 'ตรวจได้ด้วย', 'Check with', list(checks)) : '',
  ].join('');
  return `<details class="persona" id="${key}" data-locale-open="${key}"${options.open[key] ? ' open' : ''}>
    <summary class="who-tile">${icon(seg)}<span class="who-name">${say(short[0], short[1])}</span><span class="who-presence">${pips(s[0])}${say(pres[0], pres[1])}</span>${spendMeter(P, sp)}${mix && P.mix[mix] ? `<span class="who-mix">${say(P.mix[mix][0], P.mix[mix][1])}</span>` : ''}</summary>
    <div class="persona-body">
      <p class="persona-title">${say(lab[1], lab[2])}</p>
      ${facts_.length ? `<h6 class="persona-h">${say('ข้อมูลที่เห็น', 'What the data shows')}</h6><ul class="sig-list">${facts_.join('')}</ul>` : ''}
      <h6 class="persona-h">${say('อ่านว่า', 'Reading')} <span class="prior-badge">${say('สมมติฐาน', 'Hypothesis')}</span></h6>
      <ul class="read-list">${read}</ul>
      ${bPresence.length || bSpend.length ? `<p class="hint persona-basis">${bPresence.length ? say(`ระดับ${lv[0]} อิงจาก ${pairText(bPresence)[0]}${top2[0]}`, `${lv[1]} level, based on ${pairText(bPresence)[1]}${top2[1]}`) : ''}${bSpend.length && plv ? `<br>${say(`ระดับราคารอบศูนย์ อิงจาก ${pairText(bSpend)[0]} · ไม่ใช่รายได้หรือยอดใช้จ่ายที่วัดได้`, `Price level around, based on ${pairText(bSpend)[1]} · not measured income or spending`)}` : ''}</p>` : ''}${spendNote}
      ${cardDataLine(meta, seg)}
    </div></details>`;
}

/** Who is likely around: four tiles (how many, spending power from prices, the mix); each opens into its card. */
function whoBlock(meta, pr, sg, facts, row) {
  const order = segOrder(meta.priors, pr);
  if (!order.length) return '';
  return `<div class="locale-block who-block"><h4 class="locale-sub">${icon('segment')}${say('ใครน่าจะอยู่รอบศูนย์', 'Who is likely around')}<span class="prior-badge">${say('สมมติฐานจากกฎ', 'Rule-based hypothesis')}</span></h4>
    <div class="who-grid">${order.map(seg => personaHTML(meta, pr, sg, facts, row, seg)).join('')}</div>
    <ul class="hint who-key"><li>${pips('high')}${say('จำนวนที่น่าจะอยู่', 'How many, likely')}</li><li>${baht(3)}${say('ระดับราคารอบศูนย์', 'Price level around')}</li><li>${icon('touch')}${say('กดเพื่อดูข้อมูล', 'Open for the data')}</li></ul>
  </div>`;
}

/** The center itself (observed): luxury points of sale in it, its checked shops, its official description, Wikipedia. */
function centreLines(meta, sg, shown = new Set()) {
  const a = sg?.attr || {}, P = meta.priors, lines = [];
  const sig = (ic, body) => `<li class="sig">${icon(ic)}<span class="sig-body">${body}</span></li>`;
  if (a.luxIn?.n) {
    const url = demoRecordURL(meta, 'luxuryVenue', a.luxIn.center);
    lines.push(sig('brand', `<span class="sig-text">${say(`จุดขายแบรนด์หรูในศูนย์นี้ ${num(a.luxIn.n)} จุด`, `${num(a.luxIn.n)} luxury points of sale in this center`)}</span><span class="poi-meta">${esc(a.luxIn.brands.join(' · '))}${url ? ` ${extLink(url, 'ดูใน CityMETER Luxury Brands', 'source-link', 'See in CityMETER Luxury Brands')}` : ''}</span>`));
  }
  const ten = Object.entries(sg?.ten || {}).filter(([ds, n]) => n > 0 && P.tenantDatasets?.[ds] && !shown.has(ds)).sort((x, y) => y[1] - x[1]).slice(0, 6);
  const tenWords = shown.size ? ['หมวดอื่นในรายชื่อร้านที่ตรวจแล้ว', 'Other categories in the checked shop list'] : ['ร้านที่ตรวจแล้วในศูนย์', 'Checked shops in the center'];
  if (ten.length) lines.push(sig('store', `<span class="sig-text">${say(`${tenWords[0]}: ${ten.map(([ds, n]) => `${P.tenantDatasets[ds][0]} ${num(n)}`).join(' · ')}`, `${tenWords[1]}: ${ten.map(([ds, n]) => `${P.tenantDatasets[ds][1]} ${num(n)}`).join(' · ')}`)}</span>`));
  if (a.label) lines.push(sig('info', `<span class="sig-text">${say('จากหน้าทางการของศูนย์', 'From the center’s official page')}: “<span>${esc(a.label[0])}</span>”${a.label[1] ? ` ${extLink(a.label[1], 'ที่มา', 'source-link', 'source')}` : ''}</span>`));
  const w = wikiURL(a.wiki);
  if (w) lines.push(sig('info', `<span class="sig-text">${extLink(w, 'บทความวิกิพีเดียของศูนย์นี้', 'source-link', 'Wikipedia article on this center')}</span>`));
  return lines;
}

/**
 * Formats that would likely fit the groups likely many or some (priors), each under the shop categories of the center's
 * checked shop list that it maps to and that the list has (observed, by category, never by format). A format the list
 * does not show is something to check on site — the list is not a census of every shop, so it never reads as absent.
 */
export function fitRows(meta, pr, sg, {roles = null} = {}) {
  const P = meta.priors, ten = sg?.ten || {};
  const ids = [];
  for (const seg of segOrder(P, pr).filter(x => ['high', 'medium'].includes(pr.seg[x][0]))) {
    for (const id of pr.say?.[seg]?.pmf || []) if (P.pmf?.[id] && !ids.includes(id)) ids.push(id);
  }
  // formats whose categories overlap share one row, so a category is never shown twice
  let rows = [];
  const check = [], nodata = [], viaList = [];
  for (const id of ids) {
    const known = (P.pmf[id][2] || []).filter(ds => P.tenantDatasets?.[ds]);
    const sets = known.filter(ds => ten[ds] > 0);
    if (!sets.length) {
      // no dataset to compare with is its own state; a shop of the same role in the list the panel shows settles the rest
      const hit = roles ? [...new Set(known.flatMap(ds => FORMAT_ROLES[ds.replace(/^research\.TH\./, '')] || []))].filter(r => roles[r] > 0) : [];
      if (!known.length) nodata.push(id); else if (hit.length) viaList.push({id, roles: hit}); else check.push(id);
      continue;
    }
    const hit = rows.filter(r => r.sets.some(ds => sets.includes(ds)));
    rows = rows.filter(r => !hit.includes(r));
    rows.push({sets: [...new Set([...hit.flatMap(r => r.sets), ...sets])], ids: [...hit.flatMap(r => r.ids), id]});
  }
  const found = rows.map(r => ({sets: r.sets.map(ds => [ds, ten[ds]]), n: r.sets.reduce((sum, ds) => sum + ten[ds], 0), ids: r.ids}));
  // formats settled by the same roles share one row, as the dataset rows do
  let listed = [];
  for (const v of viaList) {
    const hit = listed.filter(r => r.roles.some(x => v.roles.includes(x)));
    listed = listed.filter(r => !hit.includes(r));
    listed.push({roles: [...new Set([...hit.flatMap(r => r.roles), ...v.roles])], ids: [...hit.flatMap(r => r.ids), v.id]});
  }
  listed = listed.map(r => ({roles: r.roles.map(x => [x, roles[x]]), n: r.roles.reduce((sum, x) => sum + roles[x], 0), ids: r.ids}));
  return {found: found.sort((a, b) => b.n - a.n), listed: listed.sort((a, b) => b.n - a.n), check, nodata};
}

/**
 * Shop roles of the list the panel shows (js/tenants.js#tenantRole) that stand for a format's datasets. A format the
 * dataset links do not show is “in the center's list” when the list has a shop of such a role (review of 2026-11-24,
 * F-04: 284 “not seen” entries at 101 centers had one). Books and stationery has no role of its own.
 */
export const FORMAT_ROLES = Object.freeze({grocery: ['grocery'], restaurants: ['dining', 'food', 'cafe'], beauty_clinic: ['clinic'], beauty: ['beauty'], massage_spa: ['spa'], pharmacy: ['pharmacy'],
  playground: ['family'], bank: ['bank'], fitness: ['fitness'], apparel: ['apparel'], sport: ['sport'], luxury: ['destination'], gold: ['gold'], optical: ['optical']});
const ROLE_WORDS = Object.freeze({grocery: ['ซูเปอร์มาร์เก็ตและของใช้', 'Supermarkets and daily goods'], dining: ['ร้านอาหาร', 'Restaurants'], food: ['อาหารและเครื่องดื่ม', 'Food and drink'], cafe: ['คาเฟ่และเครื่องดื่ม', 'Cafés and drinks'],
  clinic: ['คลินิกความงาม', 'Beauty clinics'], beauty: ['ความงาม', 'Beauty'], spa: ['นวดและสปา', 'Massage and spa'], pharmacy: ['ยาและสุขภาพ', 'Pharmacy and health'], family: ['เครื่องเล่นและครอบครัว', 'Play and family'],
  bank: ['บริการธนาคาร', 'Banking'], fitness: ['ฟิตเนสและสตูดิโอ', 'Fitness and studios'], apparel: ['เสื้อผ้าและแฟชั่น', 'Apparel and fashion'], sport: ['กีฬาและเอาท์ดอร์', 'Sport and outdoor'],
  destination: ['แฟชั่นและแบรนด์หรู', 'Fashion and luxury brands'], gold: ['ทองและเครื่องประดับ', 'Gold and jewellery'], optical: ['แว่นตา', 'Eyewear']});

/** The shop list the panel shows for a venue, by role ({roles: {role: n}, total}); the app sets it when the list loads. */
const shopLists = new Map();
export function setLocaleShopList(id, list) { if (!id) return; if (list) shopLists.set(id, list); else shopLists.delete(id); }
export const localeShopList = id => shopLists.get(id) || null;

function fitBlock(meta, pr, sg, row = {}) {
  const P = meta.priors, C = meta.context || {};
  const list = localeShopList(row?.id);
  const {found, listed, check, nodata} = fitRows(meta, pr, sg, {roles: list?.roles || null});
  const center = centreLines(meta, sg, new Set(found.flatMap(f => f.sets.map(x => x[0]))));
  if (!found.length && !listed.length && !check.length && !nodata.length && !center.length) return '';
  const catText = sets => [sets.map(([ds, n]) => `${P.tenantDatasets[ds][0]} ${num(n)}`).join(' · '), sets.map(([ds, n]) => `${P.tenantDatasets[ds][1]} ${num(n)}`).join(' · ')];
  const roleText = roles => [roles.map(([r, n]) => `${ROLE_WORDS[r][0]} ${num(n)}`).join(' · '), roles.map(([r, n]) => `${ROLE_WORDS[r][1]} ${num(n)}`).join(' · ')];
  const rowHTML = f => {
    const [th, en] = catText(f.sets);
    return `<li class="fit-row">${icon('fit')}<span class="fit-body"><span class="fit-have">${say(th, en)}<span class="sr-only">${say(' ร้านในรายชื่อที่ตรวจแล้ว', ' in the checked shop list')}</span></span><span class="pmf-chips">${formatChips(P, f.ids)}</span></span></li>`;
  };
  const listedHTML = f => {
    const [th, en] = roleText(f.roles);
    return `<li class="fit-row is-listed">${icon('fit')}<span class="fit-body"><span class="fit-have">${say(th, en)} <span class="fit-src">${say('ตามรายชื่อของศูนย์', 'in the center’s own list')}</span></span><span class="pmf-chips">${formatChips(P, f.ids)}</span></span></li>`;
  };
  // three states, each its own symbol: seen in the list · checked and not seen · nothing to compare with
  const linked = Object.entries(sg?.ten || {}).filter(([ds, n]) => n > 0 && P.tenantDatasets?.[ds]).reduce((sum, [, n]) => sum + n, 0);
  const compared = list?.total || linked;
  const hasList = compared > 0;
  const stateRow = (cls, ic, th, en, ids) => (ids.length ? `<li class="fit-row ${cls}">${icon(ic)}<span class="fit-body"><span class="fit-have">${say(th, en)}</span><span class="pmf-chips">${formatChips(P, ids)}</span></span></li>` : '');
  const checkRow = hasList
    ? stateRow('is-check', 'notyet', `ยังไม่เห็นในรายชื่อ ${num(compared)} ร้าน ควรตรวจหน้างาน`, `Not seen among the ${num(compared)} shops listed: check on site`, check)
    : stateRow('is-nolist', 'info', 'ศูนย์นี้ยังไม่มีรายชื่อร้านในข้อมูล จึงยังบอกไม่ได้ว่ามีหมวดใดแล้ว', 'No shop list for this center in the data yet, so it cannot say which formats are already here', check);
  const nodataRow = stateRow('is-nodata', 'info', 'ยังไม่มีชุดข้อมูลให้เทียบ', 'No dataset to compare with yet', nodata);
  const roster = C.dates?.tenant_roster, lux = sg?.attr?.luxIn?.n ? C.dates?.luxury : null;
  const any = found.length || listed.length || check.length || nodata.length;
  return `<div class="locale-block fit-block"><h4 class="locale-sub">${icon('store')}${say('ร้านแบบไหนน่าจะเข้ากับคนรอบศูนย์', 'Which formats would likely fit')}<span class="prior-badge">${say('สมมติฐาน', 'Hypothesis')}</span></h4>
    ${any ? `<ul class="fit-list">${found.map(rowHTML).join('')}${listed.map(listedHTML).join('')}${checkRow}${nodataRow}</ul>
    <ul class="hint fit-key"><li>${icon('fit')}${say('อยู่ในรายชื่อร้านของศูนย์ นับทั้งหมวด', 'In the center’s shop list, the whole category')}</li>${check.length && hasList ? `<li>${icon('notyet')}${say('ตรวจรายชื่อแล้วยังไม่เห็น', 'Checked the list, not seen')}</li>` : ''}${nodata.length || (check.length && !hasList) ? `<li>${icon('info')}${say('ยังเทียบไม่ได้', 'Cannot be compared yet')}</li>` : ''}<li><span class="pmf" aria-hidden="true"></span>${say('หมวดที่น่าจะเข้ากัน (สมมติฐาน)', 'Formats that would likely fit (hypotheses)')}</li></ul>` : ''}
    ${center.length ? `<h5 class="locale-mini">${icon('venue')}${say('ศูนย์นี้มีอะไรแล้ว', 'What the center already has')}</h5><ul class="sig-list">${center.join('')}</ul>` : ''}
    <p class="hint persona-data">${say(`ข้อมูล: รายชื่อร้านในศูนย์ของ CityMETER Shopping Center${roster ? ` ตรวจถึง ${thaiDay(roster)}` : ''} ไม่ใช่การสำรวจครบทุกร้าน${lux ? ` · CityMETER Luxury Brands ตรวจ ${thaiDay(lux)}` : ''} · ขอบเขต: ร้านที่แหล่งระบุว่าอยู่ในศูนย์นี้`, `Data: CityMETER Shopping Center shop lists of the center${roster ? `, checked to ${roster}` : ''}, not a census of every shop${lux ? ` · CityMETER Luxury Brands checked ${lux}` : ''} · Boundary: shops a source places in this center`)}</p>
  </div>`;
}

/**
 * Days of a 168-character grid (Monday 00–23 … Sunday 00–23; 0 closed, 1–5 relative to the center's busiest hour) in
 * runs of consecutive days with the same row: {days, top, ranges: [[from, to)], open: [first, last + 1] | null}.
 */
export function daypartGroups(grid) {
  const rows = Array.from({length: 7}, (_, d) => String(grid || '').slice(d * 24, d * 24 + 24));
  const groups = [];
  rows.forEach((r, d) => {
    const last = groups[groups.length - 1];
    if (last && last.row === r && last.days[last.days.length - 1] === d - 1) last.days.push(d);
    else groups.push({row: r, days: [d]});
  });
  return groups.map(({row, days}) => {
    const cells = [...row].map(Number);
    const top = Math.max(0, ...cells);
    const ranges = [];
    let start = -1;
    for (let h = 0; h <= 24; h++) {
      const on = h < 24 && top > 0 && cells[h] === top;
      if (on && start < 0) start = h;
      if (!on && start >= 0) { ranges.push([start, h]); start = -1; }
    }
    const first = cells.findIndex(c => c > 0);
    return {days, top, ranges, open: first < 0 ? null : [first, 24 - [...cells].reverse().findIndex(c => c > 0)]};
  });
}
const hh = h => String(h).padStart(2, '0');
const hoursRange = ([o, c]) => `${hh(Math.floor(o))}:${hh(Math.round((o % 1) * 60))}–${hh(Math.floor(c))}:${hh(Math.round((c % 1) * 60))}`;
/** [th, en] of parsed opening hours: “ทุกวัน 10:00–22:00 น.” or runs of days with the same hours. */
export function groupHours(days, D) {
  const runs = [];
  days.forEach((x, d) => {
    const last = runs[runs.length - 1], key = hoursRange(x);
    if (last && last.key === key) last.days.push(d); else runs.push({key, days: [d]});
  });
  if (runs.length === 1) return [`ทุกวัน ${runs[0].key} น.`, `daily ${runs[0].key}`];
  const label = (r, i) => (r.days.length > 1 ? `${D[r.days[0]][i]}–${D[r.days[r.days.length - 1]][i]}` : D[r.days[0]][i]);
  return [runs.map(r => `${label(r, 0)} ${r.key} น.`).join(' · '), runs.map(r => `${label(r, 1)} ${r.key}`).join(' · ')];
}

/** Day labels of a run of days: “ส.–อา.” / “Sat–Sun”. */
const dayRun = (D, days) => (days.length > 1 ? [`${D[days[0]][0]}–${D[days[days.length - 1]][0]}`, `${D[days[0]][1]}–${D[days[days.length - 1]][1]}`] : [D[days[0]][0], D[days[0]][1]]);
const hourRuns = ranges => ranges.map(([x, y]) => `${hh(x)}:00–${hh(y)}:00`).join(', ');

/**
 * When it is likely busy: the 7×24 grid first (neutral foundation tones; a prior never takes a data colour), the week's
 * busiest hours in one line, the legend; the day-by-day reading, the opening hours used and why, folded underneath.
 */
function busyBlock(meta, pr, sg) {
  const P = meta.priors, grid = String(pr.grid || '');
  if (grid.length !== 168 || !P.days || !P.gridLevels) return '';
  const en = LANG === 'en', D = P.days, L = P.gridLevels;
  const head = `<tr><td></td>${Array.from({length: 24}, (_, h) => `<th scope="col">${h % 6 === 0 ? hh(h) : ''}</th>`).join('')}</tr>`;
  const body = D.map((d, i) => `<tr><th scope="row">${esc(d[0])}</th>${[...grid.slice(i * 24, i * 24 + 24)].map((c, h) =>
    `<td class="g${c}" title="${esc(`${en ? d[3] : d[2]} ${hh(h)}:00–${hh(h + 1)}:00${en ? '' : ' น.'} · ${L[Number(c)]?.[en ? 1 : 0] || ''}`)}"></td>`).join('')}</tr>`).join('');
  const legend = `<ul class="dp-legend" aria-label="${en ? 'Legend' : 'คำอธิบายสัญลักษณ์'}">${L.map((l, i) => `<li><i class="g${i}" aria-hidden="true"></i>${say(l[0], l[1])}</li>`).join('')}</ul>`;
  const groups = daypartGroups(grid);
  const best = groups.filter(g => g.top === 5);
  const bestTh = best.map(g => `${dayRun(D, g.days)[0]} ${hourRuns(g.ranges)} น.`).join(' · '), bestEn = best.map(g => `${dayRun(D, g.days)[1]} ${hourRuns(g.ranges)}`).join(' · ');
  const peaks = groups.map(g => {
    const [dth, den] = dayRun(D, g.days);
    if (!g.top) return `<li><b>${say(dth, den)}</b> ${say('ปิด', 'closed')}</li>`;
    const r = hourRuns(g.ranges);
    return `<li><b>${say(dth, den)}</b> ${g.top === 5 ? say(`คึกที่สุดของสัปดาห์ ${r} น.`, `busiest of the week ${r}`) : say(`คึกที่สุดของวัน ${r} น. (ระดับ${L[g.top][0]})`, `busiest of the day ${r} (${L[g.top][1].toLowerCase()})`)}</li>`;
  }).join('');
  const hrs = sg?.attr?.hours;
  const basis = P.hoursBasis?.[hrs?.basis || pr.hb];
  const parsed = hrs?.days ? groupHours(hrs.days, D) : null;
  // the hours read from the published text, in the page's language; the text itself in the title (often English or mixed)
  const rawTitle = hrs?.text ? ` title="${esc(hrs.text)}"` : '';
  const used = parsed ? `<span${rawTitle}>${esc(parsed[en ? 1 : 0])}</span>` : !en && hrs?.text ? `<span>${esc(hrs.text)}</span>` : '';
  const hoursLine = used || basis ? `<p class="hint">${used ? `${say('เวลาเปิดที่ใช้:', 'Opening hours used:')} ${used}` : ''}${used && basis ? ' · ' : ''}${basis ? say(basis[0], basis[1]) : ''}</p>` : '';
  const basisKey = hrs?.basis || pr.hb || '';
  const basisChip = basisKey ? `<p class="busy-basis"><span class="basis-chip">${icon('hours')}${/type_default$/.test(basisKey) ? say('เวลาเปิดตามประเภทศูนย์', 'Opening hours by center type') : say('เวลาเปิดของศูนย์', 'The center’s own opening hours')}</span></p>` : '';
  const strength = st => (st >= 0.66 ? ['แรง', 'strong'] : st >= 0.33 ? ['ปานกลาง', 'moderate'] : ['เล็กน้อย', 'slight']);
  const rules = (pr.rules || []).map(([id, st]) => {
    const r = P.rules?.[id];
    if (!r) return '';
    const w = st < 1 ? strength(st) : null;
    return `<li>${say(r[0], r[1])}${w ? ` <span class="fact-rank">${say(`(${w[0]})`, `(${w[1]})`)}</span>` : ''}</li>`;
  }).join('');
  const targets = (pr.targets || []).map(t => P.check?.[t]).filter(Boolean);
  return `<div class="locale-block busy-block"><h4 class="locale-sub">${icon('hours')}${say('ช่วงไหนน่าจะคึก', 'When it is likely busy')}<span class="prior-badge">${say('สมมติฐาน', 'Hypothesis')}</span></h4>
    ${basisChip}
    ${best.length ? `<p class="busy-peak">${say(`คึกที่สุดของสัปดาห์ ${bestTh}`, `Busiest of the week: ${bestEn}`)}</p>` : ''}
    <div class="dp-wrap"><table class="dp-grid" aria-hidden="true"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    ${legend}
    <p class="hint">${say('เทียบกับชั่วโมงที่คึกที่สุดของศูนย์นี้เอง ไม่ใช่จำนวนคน', 'Relative to this center’s own busiest hour — not people counts')}</p>
    <details class="locale-details dp-why" data-locale-open="dpwhy"${openAttr('dpwhy')}><summary>${say('อ่านทีละวัน เวลาเปิด และทำไมตารางเป็นแบบนี้', 'Day by day, opening hours and why the grid looks like this')}</summary>
      <ul class="dp-peaks">${peaks}</ul>
      ${hoursLine}
      ${rules ? `<ul class="prior-targets">${rules}</ul>` : ''}
      ${targets.length ? `<p class="locale-mini">${icon('checked')}${say('ตรวจช่วงเวลาได้ด้วย', 'Check the hours with')}</p><ul class="prior-targets">${targets.map(t => `<li>${say(t[0], t[1])}</li>`).join('')}</ul>` : ''}
    </details>
  </div>`;
}

/**
 * Generated priors read beside the observed context of the same venue, visual first: who is likely around (tiles that
 * open into cards), when it is likely busy (the grid), which formats would likely fit. Neutral tones only.
 */
export function priorsHTML(meta, pr, sg = null, row = {}, facts = null) {
  return `<p class="prior-note">${icon('idea')}${say('ต่อจากนี้เป็นสมมติฐานจากกฎ ใช้เลือกสิ่งที่จะไปตรวจ', 'From here on: rule-based hypotheses for choosing what to check')}</p>
    ${whoBlock(meta, pr, sg, facts, row)}
    ${busyBlock(meta, pr, sg)}
    ${fitBlock(meta, pr, sg, row)}`;
}

/** The prior zone of the section: drawn with the rest once loaded (a placeholder while it loads; a retry when it fails). */
function priorsBlock(meta, row, priors, priorsState, signals = null, facts = null) {
  const body = priors ? priorsHTML(meta, priors, signals, row, facts)
    : priorsState === 'error' ? `<p class="hint">${say('โหลดสมมติฐานไม่สำเร็จ', 'Could not load the hypotheses')} <button type="button" class="link-button" data-action="locale-retry-priors">${say('ลองอีกครั้ง', 'Try again')}</button></p>`
      : `<p class="hint" role="status">${say('กำลังโหลดสมมติฐาน…', 'Loading the hypotheses…')}</p>`;
  return `<div class="locale-priors" id="locale-priors">${body}</div>`;
}

/** Only the prior zone of a venue's section, for when the hypotheses arrive after the rest is drawn ('' when it has none). */
export function renderLocalePriors(row, {meta = null, facts = null, priors = null, signals = null, priorsState = 'idle'} = {}) {
  if (!inLocaleSet(row) || !meta || !facts || facts.located === false) return '';
  return priorsBlock(meta, row, priors, priorsState, signals, facts);
}

/* ---------- registered residents around the center (modelled; 0.8.0, owner 2026-11-20) ---------- */

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** “2026-10” → “Oct 2026”, “2026-11-20” → “20 Nov 2026” (thaiDay's English). */
export function englishDay(iso) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${m[3] ? `${Number(m[3])} ` : ''}${MONTHS_EN[Number(m[2]) - 1]} ${m[1]}`;
}
const kmEn = r => `${num(r / 1000)} km`;

/** A modelled number of people to the nearest 10, 100 or 1,000 by size (“223,000”); null under 10. */
export function aboutPeople(x) {
  if (!(x >= 10)) return null;
  const step = x >= 10000 ? 1000 : x >= 1000 ? 100 : 10;
  return num(Math.round(x / step) * step);
}
/** [th, en] “ราว 21,000 คน” / “about 21,000 people”; under 10 says so. */
export function peopleWords(x) {
  const s = aboutPeople(x);
  return s ? [`ราว ${s} คน`, `about ${s} people`] : ['ไม่ถึง 10 คน', 'fewer than 10 people'];
}
/** [th, en] residents per km² to two significant figures; under 1 says so. */
export function densityWords(x) {
  if (!(x >= 1)) return ['ไม่ถึง 1 คน/ตร.กม.', 'under 1 per km²'];
  const d = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
  const s = num(Math.round(x / d) * d);
  return [`${s} คน/ตร.กม.`, `${s} per km²`];
}

/** People in one 250 m cell for the legend: two significant figures (modelled), “<1” under one person. */
export const cellPeople = x => {
  if (!(x >= 1)) return '<1';
  const d = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
  return num(Math.round(x / d) * d);
};

/**
 * Colours of the 5 km map: the residents of each 250 m cell that holds a counted building, ranked on the 41 samples of
 * the LDS density LUT within this center's own map (owner 2026-11-20 08:26 “พี่ตัดสินใจเลย”: a colour compares the cells
 * of one map, never two centers — the rank track compares the centers). A cell under 0.05 residents (stored 0) takes
 * the lowest sample; a cell without a counted building (null) is not coloured. The legend reads people per cell
 * (0.9.2, owner 2026-11-20 17:19: “ถ้านับไปเลยว่าแต่ละ cell มีจำนวนนับกี่คน อาจจะดีกว่ามั้ย”): every cell is the same
 * 250 × 250 m, so people per cell and people per km² (× 16) rank the cells alike and every cell keeps its colour; the
 * cell is the stated area denominator of the density scale.
 */
export function residentsMapModel(rec, rmeta) {
  const n = rmeta?.cell?.n || 40, m = rmeta?.cell?.m || 250;
  const km2 = (m * m) / 1e6;
  const values = [];
  for (const v of rec?.g || []) if (v > 0) values.push(v);
  const ramp = buildRamp(values, {kind: 'density'});
  return {n, m, km2, ramp: {...ramp, format: cellPeople, ticks: rampTicks(ramp.levels, cellPeople)}};
}

/**
 * Roads, rail, rivers and stations over the cells (25 m units, y down, as the subdistrict lines), drawn in the ink and
 * paper of the map's own labels and casings: lines to read the map by, never data colours, and the cells keep theirs.
 * Classes of `r`: motorway · trunk · primary · secondary (the major roads first on top).
 */
export function residentsOverlaySVG(ov, {unit = 25, m = 250} = {}) {
  if (!ov || !Array.isArray(ov.r)) return '';
  const d = v => esc(String(v || ''));
  const roads = [3, 2, 1, 0].filter(c => ov.r[c]);
  return `<g class="res-overlay" transform="scale(${unit / m})">`
    + (ov.w ? `<path class="res-river-case" d="${d(ov.w)}"/><path class="res-river" d="${d(ov.w)}"/>` : '')
    + roads.map(c => `<path class="res-road-case c${c}" d="${d(ov.r[c])}"/>`).join('')
    + roads.map(c => `<path class="res-road c${c}" d="${d(ov.r[c])}"/>`).join('')
    + (ov.t ? `<path class="res-rail-case" d="${d(ov.t)}"/><path class="res-rail" d="${d(ov.t)}"/>` : '')
    + (ov.s || []).map(([x, y]) => `<circle class="res-station" cx="${Number(x)}" cy="${Number(y)}" r="3.4"/>`).join('')
    + '</g>';
}

/** The names the build placed (≤ 4 roads, 1 river, 3 stations; none overlap at 360 px): a name without English stays Thai. */
export function residentsOverlayLabels(ov, at, {unit = 25, m = 250} = {}) {
  const k = unit / m;
  return (ov?.L || []).map(([kind, x, y, align, th, en]) => {
    // a name OpenStreetMap gives only in Thai is a name, not a sentence: it stays Thai on the English page
    const text = en ? say(th, en) : `<span lang="th" translate="no">${esc(th)}</span>`;
    return `<span class="res-lab is-${esc(kind)} at-${esc(align)}" style="left:${at(Number(x) * k)}%;top:${at(Number(y) * k)}%">${text}</span>`;
  }).join('');
}

/** The key of the lines over the map (beside the density legend): what each kind of line is. */
/** The key item of the center pin. */
export const venuePinKey = () => `<span class="res-key-item"><svg class="res-key-pin" viewBox="-1 -2.55 2 2.75" aria-hidden="true">${VENUE_PIN}</svg>${say('ศูนย์นี้', 'This center')}</span>`;

export function residentsOverlayKey({lines = true} = {}) {
  const sw = (cls, extra = '') => `<svg class="res-key-line" viewBox="0 0 24 8" aria-hidden="true"><path class="${cls}-case${extra}" d="M2 4h20"/><path class="${cls}${extra}" d="M2 4h20"/></svg>`;
  if (!lines) return `<span class="res-key">${venuePinKey()}</span>`;
  return `<span class="res-key">${venuePinKey()}`
    + `<span class="res-key-item">${sw('res-road', ' c2')}${say('ถนนสายหลัก', 'Major roads')}</span>`
    + `<span class="res-key-item">${sw('res-rail')}${say('รถไฟฟ้าและรถไฟ', 'Rail lines')}</span>`
    + `<span class="res-key-item"><svg class="res-key-line" viewBox="0 0 24 8" aria-hidden="true"><circle class="res-station" cx="12" cy="4" r="3"/></svg>${say('สถานี', 'Stations')}</span>`
    + `<span class="res-key-item">${sw('res-river')}${say('แม่น้ำ', 'Rivers')}</span></span>`;
}

/** Credit of the lines in the data line (ODbL asks for it where the map is shown). */
export function residentsOverlayCredit(mm) {
  const st = mm?.source?.stations?.asOf;
  return ` · ${say(`ถนน ราง และแม่น้ำ © ผู้ร่วมสร้าง OpenStreetMap ${mm?.asOf ? thaiDay(mm.asOf) : ''}`.trim(), `roads, rail and rivers © OpenStreetMap contributors ${mm?.asOf ? englishDay(mm.asOf) : ''}`.trim())}`
    + (st ? ` · ${say(`สถานีจาก CityMETER Transit ${thaiDay(st)}`, `stations: CityMETER Transit ${englishDay(st)}`)}` : '');
}

/** The method of the lines (folded with the residents method). */
export function residentsOverlayMethod(mm) {
  return say(`เส้นบนแผนที่: ถนนสายหลัก (motorway trunk primary secondary) ราง (รถไฟ รถไฟฟ้า รถไฟฟ้ารางเดี่ยว ไม่รวมรางในย่านสถานีและทางแยก) และแม่น้ำ/คลองที่ OpenStreetMap ระบุเป็นแม่น้ำ จากไฟล์ Geofabrik ${mm?.asOf ? thaiDay(mm.asOf) : ''} ปรับให้เรียบ ${num(mm?.simplify_m || 12)} ม. · สถานีที่เปิดให้บริการจาก CityMETER Transit · ชื่อถนนสูงสุด 4 ชื่อ แม่น้ำ 1 ชื่อ และสถานีที่ใกล้ที่สุด 3 สถานีตามที่วางได้ไม่ทับกัน · เป็นเส้นสำหรับอ่านตำแหน่ง ไม่ใช่โครงข่ายสำหรับวัดระยะ`,
    `Lines on the map: major roads (motorway, trunk, primary, secondary), rail (rail, metro and monorail, without yards and sidings) and the waterways OpenStreetMap tags as rivers, from the Geofabrik extract of ${mm?.asOf ? englishDay(mm.asOf) : ''}, smoothed to ${num(mm?.simplify_m || 12)} m · operating stations from CityMETER Transit · up to 4 road names, 1 river and the 3 nearest stations where they fit without overlapping · lines to find your way by, not a network to measure on`);
}

/**
 * The center on the 5 km maps (0.9.4, owner 2026-11-20 19:35: “ขอปรับจุดของ venue ให้แสดงได้ชัดขึ้นหน่อย”): a pin in the
 * map's selected role with the marker halo — its tip on the center's point, a head of 0.8 cell (200 m) 1.5 cells above
 * it — where the 0.9.2 dot of 105 m read like a station. Names stay off it (scripts/build-residents-map.py PIN_*).
 */
export const VENUE_PIN = '<g class="res-venue"><path class="res-venue-pin" d="M0 0C-.3-.55-.8-.95-.8-1.5A.8 .8 0 1 1 .8-1.5C.8-.95 .3-.55 0 0Z"/>'
  + '<circle class="res-venue-dot" cy="-1.5" r=".3"/></g>';

/**
 * A 5 km map of one center (residents or the places visitors use): one path per LUT sample (runs along each row), the
 * subdistrict lines, the roads and rail to read it by, the rings and the pin. `kind` keeps the two maps' ids apart.
 */
function circleMapHTML(row, {g, o = null, outlineUnit = 25}, {n, m, ramp}, {radii: rr = RADII, radius = options.radius, overlay = null, title, kind = 'res'}) {
  const half = n / 2, pad = 0.4, size = n + 2 * pad;
  const cell = g.map(v => (v == null ? null : classify(v, ramp).fill));
  const fills = new Map();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n;) {
      const fill = cell[r * n + c];
      if (fill == null) { c++; continue; }
      let e = c + 1;
      while (e < n && cell[r * n + e] === fill) e++;
      fills.set(fill, `${fills.get(fill) || ''}M${c - half} ${r - half}h${e - c}v1h${c - e}z`);
      c = e;
    }
  }
  const id = `${kind}-${String(row.id).replace(/[^\w-]/g, '')}`;
  const radii = (rr || RADII).map(Number);
  const outer = Math.max(...radii) / m;
  const scale = outlineUnit / m;
  const at = v => (((v + half + pad) / size) * 100).toFixed(2);
  const labels = radii.map(r => {
    const c = (r / m) * Math.SQRT1_2;
    return `<span class="res-ring-label${r === radius ? ' is-on' : ''}" style="left:${at(c)}%;top:${at(-c)}%">${say(km(r), kmEn(r))}</span>`;
  }).join('');
  return `<div class="res-map-wrap"><svg class="res-map" viewBox="${-half - pad} ${-half - pad} ${size} ${size}" role="img" aria-labelledby="${id}-t"><title id="${id}-t"${enAttr(title[1])}>${esc(title[0])}</title>`
    + `<defs><clipPath id="${id}-c"><circle r="${outer}"/></clipPath></defs><g clip-path="url(#${id}-c)"><circle class="res-bg" r="${outer}"/>`
    + [...fills].map(([f, d]) => `<path d="${d}" fill="${f}" shape-rendering="crispEdges"${isPaleSample(f) ? ' class="res-pale"' : ''}/>`).join('')
    + `${o ? `<path class="res-outline" d="${esc(o)}" transform="scale(${scale})"/>` : ''}`
    + `${overlay?.rec ? residentsOverlaySVG(overlay.rec, {unit: overlay.meta?.unit_m || 25, m}) : ''}</g>`
    + radii.map(r => `<circle class="res-ring${r === radius ? ' is-on' : ''}" r="${r / m}"/>`).join('')
    + `${VENUE_PIN}</svg>${overlay?.rec ? residentsOverlayLabels(overlay.rec, at, {unit: overlay.meta?.unit_m || 25, m}) : ''}${labels}<span class="res-north" aria-hidden="true">↑ ${say('เหนือ', 'N')}</span></div>`;
}

/** The residents map of one center (people per 250 m cell). */
export function residentsMapHTML(row, rec, rmeta, radius = options.radius, model = residentsMapModel(rec, rmeta), overlay = null) {
  return circleMapHTML(row, {g: rec.g, o: rec.o, outlineUnit: rmeta?.outline?.unit_m || 25}, model, {radii: rmeta?.radii, radius, overlay, kind: 'res',
    title: ['คนที่มีชื่อในทะเบียนบ้าน (แบบจำลอง) ต่อช่อง 250 × 250 ม. ในรัศมี 5 กม. รอบศูนย์ ทิศเหนืออยู่ด้านบน',
      'Registered residents (modelled) per 250 × 250 m cell within 5 km of the center, north up']});
}

/**
 * Colours of a places map (visitors 0.9.4, work and study 0.9.5): the places of each cell ranked within this center's 5 km
 * on the 41 samples of one LDS LUT (whole numbers). The cell is an area, which the LDS family rule gives to density.area;
 * the visitors map takes `activity` by the owner's choice so it reads apart from the residents map at a glance
 * (2026-11-20, “visitor heatmap ใช้ คนละสีกับ residents ดีมั้ย” → “เปลี่ยนเป็นฟ้า-เขียว (activity) เลย”). The legend states the
 * unit and the cell.
 */
export function placesMapModel(rec, pmeta, kind) {
  const n = pmeta?.cell?.n || 40, m = pmeta?.cell?.m || 250;
  const values = [];
  for (const v of rec?.g || []) if (v > 0) values.push(v);
  const ramp = buildRamp(values, {kind});
  return {n, m, km2: (m * m) / 1e6, ramp: {...ramp, format: num, ticks: rampTicks(ramp.levels, num)}};
}

/** A places map of one center (places per 250 m cell), drawn like the residents map with its lines and pin. */
function placesMapHTML(cfg, row, rec, pmeta, radius, model, {overlay = null, outline = null, outlineUnit = 25} = {}) {
  return circleMapHTML(row, {g: rec.g, o: outline, outlineUnit}, model, {radii: pmeta?.radii, radius, overlay, kind: cfg.kind, title: cfg.mapTitle});
}

export const visitorsMapModel = (rec, vmeta) => placesMapModel(rec, vmeta, PLACES.visitors.scale);
export const workMapModel = (rec, wmeta) => placesMapModel(rec, wmeta, PLACES.work.scale);

/** The visitors map of one center (places per 250 m cell), drawn like the residents map with its lines and pin. */
export function visitorsMapHTML(row, rec, vmeta, radius = options.radius, model = visitorsMapModel(rec, vmeta), extra = {}) {
  return placesMapHTML(PLACES.visitors, row, rec, vmeta, radius, model, extra);
}

/** The work-and-study map of one center (places per 250 m cell), drawn like the residents map with its lines and pin. */
export function workMapHTML(row, rec, wmeta, radius = options.radius, model = workMapModel(rec, wmeta), extra = {}) {
  return placesMapHTML(PLACES.work, row, rec, wmeta, radius, model, extra);
}

const RING_WORDS = [['0–1 กม.', '0–1 km'], ['1–3 กม.', '1–3 km'], ['3–5 กม.', '3–5 km']];

/* ---------- the map read as a table (owner 2026-11-20 11:27: “ตารางที่อ่านแทนแผนที่ได้”) ---------- */

export const DIRECTIONS = Object.freeze([['เหนือ', 'North'], ['ตะวันออกเฉียงเหนือ', 'Northeast'], ['ตะวันออก', 'East'], ['ตะวันออกเฉียงใต้', 'Southeast'],
  ['ใต้', 'South'], ['ตะวันตกเฉียงใต้', 'Southwest'], ['ตะวันตก', 'West'], ['ตะวันตกเฉียงเหนือ', 'Northwest']]);

/**
 * The 250 m cells of the 5 km map by direction (8 sectors of 45°, the first centred on north) and by ring (0–1 · 1–3 ·
 * 3–5 km), each cell by its own centre: a cell crossing a line goes wholly to one side, and a cell on the edge (it holds
 * only the buildings inside 5 km) reads as 3–5 km. People per km² = the sector's people ÷ the sector's share of the ring
 * area. Returns {rows: [{th, en, people: [3], dens: [3], built: [3], total, share}], top, total}; top = the direction
 * with the most people (the first in compass order on a tie).
 */
export function residentsSectors(rec, rmeta) {
  const n = rmeta?.cell?.n || 40, m = rmeta?.cell?.m || 250, half = n / 2;
  const radii = (rmeta?.radii || RADII).map(Number);
  const people = DIRECTIONS.map(() => [0, 0, 0]), built = DIRECTIONS.map(() => [0, 0, 0]);
  (rec?.g || []).forEach((v, k) => {
    if (v == null) return;
    const east = ((k % n) - half + 0.5) * m, north = (half - 1 - Math.floor(k / n) + 0.5) * m;
    const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
    const s = Math.floor(((bearing + 22.5) % 360) / 45);
    const d = Math.hypot(east, north);
    const ring = d < radii[0] ? 0 : d < radii[1] ? 1 : 2;
    people[s][ring] += v;
    built[s][ring] += 1;
  });
  const bounds = [0, ...radii];
  const area = [0, 1, 2].map(j => (Math.PI * (bounds[j + 1] ** 2 - bounds[j] ** 2)) / 8 / 1e6);
  const total = people.reduce((s, p) => s + p[0] + p[1] + p[2], 0);
  const rows = DIRECTIONS.map(([th, en], s) => {
    const sum = people[s][0] + people[s][1] + people[s][2];
    return {th, en, people: people[s], dens: people[s].map((p, j) => p / area[j]), built: built[s], total: sum, share: total > 0 ? (100 * sum) / total : 0};
  });
  const top = rows.reduce((best, r) => (r.total > best.total ? r : best), rows[0]);
  return {rows, top, total};
}

/** A density for a table cell: two significant figures, “<1” under one person per km², “–” where no building is counted. */
function densityCell(d, built) {
  if (!built) return '–';
  if (!(d >= 1)) return '&lt;1';
  const step = 10 ** Math.max(0, Math.floor(Math.log10(d)) - 1);
  return num(Math.round(d / step) * step);
}

/** The line under the map (where most of the people are) and the table of the map, folded. */
function residentsTableHTML(rec, rmeta) {
  const {rows, top, total} = residentsSectors(rec, rmeta);
  if (!(total > 0)) return '';
  const pw = peopleWords(top.total), share = num(Math.round(top.share));
  const lead = `<p class="res-dir">${icon('maps')}${say(`คนในวง 5 กม. อยู่ทางทิศ${top.th}ของศูนย์มากที่สุด ${pw[0]} (${share}%)`,
    `Most people within 5 km are to the ${top.en.toLowerCase()} of the center: ${pw[1]} (${share}%)`)}</p>`;
  const densest = rows.flatMap((r, s) => r.dens.map((d, j) => ({s, j, d: r.built[j] ? d : -1}))).reduce((a, b) => (b.d > a.d ? b : a));
  const body = rows.map((r, s) => {
    const cells = r.dens.map((d, j) => {
      const v = densityCell(d, r.built[j]);
      return `<td class="data-number">${s === densest.s && j === densest.j ? `<b>${v}</b>` : v}</td>`;
    }).join('');
    const about = aboutPeople(r.total);
    return `<tr${r === top ? ' class="is-top"' : ''}><th scope="row">${say(r.th, r.en)}</th>${cells}<td class="data-number">${r.total > 0 ? `${about ?? '&lt;10'} <small>${num(Math.round(r.share))}%</small>` : '–'}</td></tr>`;
  }).join('');
  return `${lead}
    <details class="locale-details" data-locale-open="restable"${openAttr('restable')}><summary>${icon('table')}${say('อ่านแผนที่เป็นตาราง: ทิศและระยะจากศูนย์', 'The map as a table: direction and distance from the center')}</summary>
    <div class="table-wrap locale-table-wrap"><table class="locale-table res-table"><caption class="sr-only">${say('คนต่อ ตร.กม. ตามทิศและระยะจากศูนย์ และคนในวง 5 กม. ของแต่ละทิศ', 'People per km² by direction and distance from the center, and the people within 5 km in each direction')}</caption>
    <thead><tr><th scope="col">${say('ทิศจากศูนย์', 'Direction')}</th>${RING_WORDS.map(([th, en]) => `<th scope="col">${say(th, en)}</th>`).join('')}<th scope="col">${say('คนใน 5 กม. (ราว)', 'People within 5 km (about)')}</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="hint">${say('ช่องระยะคือคนต่อ ตร.กม. ตัวหนาคือช่องที่หนาแน่นที่สุด · ช่องตาราง 250 ม. นับเข้าทิศและระยะตามกึ่งกลางช่อง ตัวเลขรายระยะจึงต่างจากวงด้านบนเล็กน้อย · – คือไม่มีอาคารที่นับได้',
      'Distance columns are people per km²; bold is the densest · each 250 m cell counts in the direction and distance of its centre, so these differ a little from the rings above · – means no counted building')}</p></details>`;
}

/** The line under a places map (the direction with the most places) and its table, folded under `cfg.table`. */
function placesTableHTML(cfg, rec, pmeta) {
  const {rows, top, total} = residentsSectors(rec, pmeta);
  if (!(total > 0)) return '';
  const share = num(Math.round(top.share));
  const lead = `<p class="res-dir">${icon('maps')}${say(`สถานที่ในวง 5 กม. อยู่ทางทิศ${top.th}ของศูนย์มากที่สุด ${num(top.total)} แห่ง (${share}%)`,
    `Most places within 5 km are to the ${top.en.toLowerCase()} of the center: ${num(top.total)} (${share}%)`)}</p>`;
  const densest = rows.flatMap((r, s) => r.dens.map((d, j) => ({s, j, d: r.built[j] ? d : -1}))).reduce((a, b) => (b.d > a.d ? b : a));
  const body = rows.map((r, s) => {
    const cells = r.dens.map((d, j) => {
      const v = densityCell(d, r.built[j]);
      return `<td class="data-number">${s === densest.s && j === densest.j ? `<b>${v}</b>` : v}</td>`;
    }).join('');
    return `<tr${r === top ? ' class="is-top"' : ''}><th scope="row">${say(r.th, r.en)}</th>${cells}<td class="data-number">${r.total > 0 ? `${num(r.total)} <small>${num(Math.round(r.share))}%</small>` : '–'}</td></tr>`;
  }).join('');
  return `${lead}
    <details class="locale-details" data-locale-open="${cfg.table}"${openAttr(cfg.table)}><summary>${icon('table')}${say('อ่านแผนที่เป็นตาราง: ทิศและระยะจากศูนย์', 'The map as a table: direction and distance from the center')}</summary>
    <div class="table-wrap locale-table-wrap"><table class="locale-table res-table"><caption class="sr-only">${say('สถานที่ต่อ ตร.กม. ตามทิศและระยะจากศูนย์ และสถานที่ในวง 5 กม. ของแต่ละทิศ', 'Places per km² by direction and distance from the center, and the places within 5 km in each direction')}</caption>
    <thead><tr><th scope="col">${say('ทิศจากศูนย์', 'Direction')}</th>${RING_WORDS.map(([th, en]) => `<th scope="col">${say(th, en)}</th>`).join('')}<th scope="col">${say('สถานที่ใน 5 กม.', 'Places within 5 km')}</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="hint">${say('ช่องระยะคือสถานที่ต่อ ตร.กม. ตัวหนาคือช่องที่หนาแน่นที่สุด · ช่องตาราง 250 ม. นับเข้าทิศและระยะตามกึ่งกลางช่อง ตัวเลขรายระยะจึงต่างจากวงเล็กน้อย · – คือไม่มีสถานที่ในชุดข้อมูลที่นับ',
      'Distance columns are places per km²; bold is the densest · each 250 m cell counts in the direction and distance of its centre, so these differ a little from the rings · – means no place in the datasets counted')}</p></details>`;
}

/**
 * The two places blocks after the residents (0.9.4 visitors, 0.9.5 work and study): the places of the release's datasets
 * at the radius of the chips with their rank (the `count` LUT sample, as the residents above; a measured zero carries no
 * rank), the datasets they come from, the 5 km map in places per 250 m cell with the same lines and pin as the residents
 * map, where most of them are and the table (folded), one data line, and the method and limits folded. Places, not people:
 * where people are likely to go is the inference. The work block adds the people and beds its sources record (from the
 * rings, `m`), never added up and never counted into the map.
 */
const REGISTRY_SOURCE = 'ทะเบียนวิจัย CityMETER';
const ringGroupOf = (meta, id) => meta.ringGroups?.find(g => g.id === id) || {};

export const PLACES = Object.freeze({
  visitors: Object.freeze({
    zone: 'locale-visitors', titleId: 'locale-vis-title', cls: 'vis-block', kind: 'vis', open: 'vis', table: 'vistable', retry: 'locale-retry-visitors',
    icon: 'visitors', scale: 'activity', anchor: 'visitor-places',
    title: ['สถานที่ที่ผู้มาเยือนใช้รอบศูนย์ (อนุมาน)', 'Places visitors use around the center (inferred)'],
    loading: ['กำลังโหลดสถานที่ที่ผู้มาเยือนใช้…', 'Loading the places visitors use…'],
    failed: ['โหลดสถานที่ที่ผู้มาเยือนใช้ไม่สำเร็จ', 'Could not load the places visitors use'],
    mapTitle: ['สถานที่ที่ผู้มาเยือนใช้ (ที่พัก ร้านอาหาร ร้านค้า และบริการ) ต่อช่อง 250 × 250 ม. ในรัศมี 5 กม. รอบศูนย์ ทิศเหนืออยู่ด้านบน',
      'Places visitors use (stays, restaurants, shops and services) per 250 × 250 m cell within 5 km of the center, north up'],
    line: (n, span) => [`สถานที่ที่ผู้มาเยือนใช้ (อนุมาน) · รายการที่มีพิกัดของ ${num(n)} ชุดข้อมูล CityMETER หมวดที่พัก ค้าปลีก และบริการ · ข้อมูล ${span[0]} · รัศมีเส้นตรงจากจุดของศูนย์`,
      `Places visitors use (inferred) · located records of ${num(n)} CityMETER stay, retail and service datasets · data ${span[1]} · straight-line radius from the center’s point`],
    summary: ['วิธีคิดและข้อจำกัดของสถานที่ที่ผู้มาเยือนใช้', 'How the places visitors use are counted, and the limits'],
    what: ['ตัวเลขนี้คือจำนวนสถานที่ที่คนมาพัก กิน ซื้อ และใช้บริการ ซึ่งชุดข้อมูลของ CityMETER ระบุไว้ ไม่ใช่จำนวนผู้มาเยือน จำนวนครั้งที่มา คนเดิน หรือยอดขาย · การอ่านว่าที่ไหนผู้มาเยือนน่าจะไปเป็นการอนุมานจากสถานที่เหล่านี้',
      'These are the places where people come to stay, eat, shop and use services, as CityMETER’s datasets list them: not visitors, visits, footfall or sales · reading where visitors are likely to go is an inference from these places'],
    sets: (meta, n, listTh, listEn) => [`นับรายการที่มีพิกัดของ ${num(n)} ชุดข้อมูลที่รอบศูนย์นี้จัดไว้ในหมวด “ที่พักและผู้มาเยือน” และ “ค้าปลีกและบริการรอบศูนย์”: ${listTh} · หนึ่งรายการคือหนึ่งสถานที่ ไม่บวกห้อง เตียง หรือที่นั่งข้ามชุดข้อมูล และไม่นับศูนย์นี้เอง`,
      `The located records of the ${num(n)} datasets this section groups as “Stays and visitors” and “Retail and services around”: ${listEn} · one record is one place; rooms, beds or seats are not added across datasets, and this center itself is not counted`],
    caveat: ['บางชุดข้อมูลวางร้านที่อยู่ในศูนย์การค้าไว้ที่จุดของศูนย์นั้น ร้านเหล่านี้จึงรวมอยู่ในช่องเดียวกับศูนย์ · ไม่ได้ตัดรายการซ้ำข้ามชุดข้อมูล สถานที่เดียวกันจึงอาจนับได้มากกว่าหนึ่งครั้ง',
      'Some datasets place a shop inside a shopping center at that center’s point, so those shops share the center’s cell · records are not de-duplicated across datasets, so one place may count more than once'],
    colour: ['สีฟ้า–เขียว (LDS activity) แยกแผนที่นี้จากแผนที่คนตามที่เจ้าของเลือก สีไม่ได้บอกจำนวนครั้งที่มาหรือการใช้งาน',
      'the mint-to-blue colours (LDS activity) keep this map apart from the residents map, as the owner chose; they do not show visits or use'],
  }),
  work: Object.freeze({
    zone: 'locale-work', titleId: 'locale-work-title', cls: 'work-block', kind: 'wrk', open: 'work', table: 'worktable', retry: 'locale-retry-work',
    icon: 'office', scale: 'count', anchor: 'work-study-places', people: true,
    title: ['สถานที่ที่คนมาทำงานและเรียนรอบศูนย์ (อนุมาน)', 'Places people come to work and study around the center (inferred)'],
    loading: ['กำลังโหลดสถานที่ทำงานและสถานศึกษา…', 'Loading the places of work and study…'],
    failed: ['โหลดสถานที่ทำงานและสถานศึกษาไม่สำเร็จ', 'Could not load the places of work and study'],
    mapTitle: ['สถานที่ที่คนมาทำงานและเรียน (สำนักงาน หน่วยงานรัฐ โรงงาน มหาวิทยาลัย สถานพยาบาล และสถานศึกษา) ต่อช่อง 250 × 250 ม. ในรัศมี 5 กม. รอบศูนย์ ทิศเหนืออยู่ด้านบน',
      'Places people come to work and study (offices, government offices, factories, universities, health facilities and schools) per 250 × 250 m cell within 5 km of the center, north up'],
    line: (n, span) => [`สถานที่ที่คนมาทำงานและเรียน (อนุมาน) · รายการที่มีพิกัดของ ${num(n)} ชุดข้อมูล CityMETER หมวดที่ทำงาน สถานศึกษา และสถานพยาบาล · ข้อมูล ${span[0]} · รัศมีเส้นตรงจากจุดของศูนย์`,
      `Places people come to work and study (inferred) · located records of ${num(n)} CityMETER work, education and health datasets · data ${span[1]} · straight-line radius from the center’s point`],
    summary: ['วิธีคิดและข้อจำกัดของสถานที่ทำงานและสถานศึกษา', 'How the places of work and study are counted, and the limits'],
    what: ['ตัวเลขนี้คือจำนวนสถานที่ที่คนเดินทางมาทำงาน เรียน หรือรับบริการของรัฐและสถานพยาบาล ซึ่งชุดข้อมูลของ CityMETER ระบุไว้ ไม่ใช่จำนวนคน จำนวนเที่ยว หรือการจ้างงาน · การอ่านว่าที่ไหนคนมาทำงานและเรียนมากเป็นการอนุมานจากสถานที่เหล่านี้',
      'These are the places where people come to work, study or for public and health services, as CityMETER’s datasets list them: not people, trips or jobs · reading where people come to work and study is an inference from these places'],
    sets: (meta, n, listTh, listEn) => {
      const w = ringGroupOf(meta, 'work'), l = ringGroupOf(meta, 'live');
      return [`นับรายการที่มีพิกัดของ ${num(n)} ชุดข้อมูลที่รอบศูนย์นี้จัดไว้ในหมวด “${w.th}” และสถานศึกษาของหมวด “${l.th}”: ${listTh} · ไม่นับสถานีราง ซึ่งแสดงบนแผนที่เป็นสัญลักษณ์ · หนึ่งรายการคือหนึ่งสถานที่ ไม่บวกนักเรียน คนงาน หรือเตียงข้ามชุดข้อมูล`,
        `The located records of the ${num(n)} datasets this section groups as “${w.en}”, and the schools of “${l.en}”: ${listEn} · rail stations are not counted; the map draws them · one record is one place; students, workers or beds are not added across datasets`];
    },
    caveat: ['ไม่ได้ตัดรายการซ้ำข้ามชุดข้อมูล สถานที่เดียวกันจึงอาจนับได้มากกว่าหนึ่งครั้ง · นิคมอุตสาหกรรมนับเป็นหนึ่งแห่งที่จุดของนิคม',
      'Records are not de-duplicated across datasets, so one place may count more than once · an industrial estate counts once, at its point'],
    colour: ['สีครีม–น้ำเงิน (LDS count) แยกแผนที่นี้จากแผนที่คนและแผนที่ผู้มาเยือน',
      'the cream-to-navy colours (LDS count) keep this map apart from the residents and visitors maps'],
  }),
});

function placesBlock(cfg, meta, row, pmeta, rec, state, {facts = null, residents = null, residentsMeta = null, residentsMap = null} = {}) {
  const [titleTh, titleEn] = cfg.title;
  const wrap = inner => `<div class="locale-block res-block ${cfg.cls}" id="${cfg.zone}" role="group" aria-labelledby="${cfg.titleId}">${inner}</div>`;
  const simple = text => wrap(`<h4 class="locale-sub" id="${cfg.titleId}" tabindex="-1">${icon(cfg.icon)}${say(titleTh, titleEn)}</h4>${text}`);
  if (state === 'error') return simple(`<p class="hint">${say(...cfg.failed)} <button type="button" class="link-button" data-action="${cfg.retry}">${say('ลองอีกครั้ง', 'Try again')}</button></p>`);
  if (!pmeta || (!rec && state !== 'empty')) return simple(`<p class="hint" role="status">${say(...cfg.loading)}</p>`);
  if (!rec) return simple(`<p class="hint">${say('รุ่นข้อมูลนี้ยังไม่มีสถานที่รอบศูนย์นี้', 'This release has no places for this center yet')}</p>`);
  const i = RI[options.radius] ?? 1, r = RADII[i];
  const uni = universeOf(meta, row);
  const uniEn = usSpelling(meta.universes?.[uni.key === 'type' ? row.group : 'all']?.en || '');
  const count = rec.n[i];
  const p = count > 0 ? rec.p?.[uni.key === 'type' ? 1 : 0]?.[i] ?? null : null;
  const nb = t => t.replace(/ (กม\.|km)$/, '\u00a0$1');
  const big = `<b class="data-number">${num(count)}</b> ${say(nb(`แห่ง ใน ${km(r)}`), nb(`places within ${kmEn(r)}`))}`;
  const rank = p != null
    ? `<span class="dot-track aha-track" aria-hidden="true"><b style="width:${p}%;background:${pctFill(p)}"></b><i class="dot" style="left:${p}%;background:${pctFill(p)}"></i></span><span class="aha-how">${esc(rankWords(p, uni.key === 'all' ? ` ${uni.short}` : uni.short))}</span>`
    : count === 0 ? `<span class="aha-how">${say('ในรัศมีนี้ยังไม่พบรายการจากชุดข้อมูลที่นับ', 'No record of the datasets counted within this radius yet')}</span>` : '';
  const head = `<div class="res-head">${icon(cfg.icon)}<div class="aha-body"><h4 class="res-title" id="${cfg.titleId}" tabindex="-1">${say(titleTh, titleEn)}</h4><p class="res-big">${big}</p>${rank}</div></div>`;
  const datasets = pmeta.datasets || [];
  // where the places come from: the datasets at this radius, largest first (the counts of the rings above)
  const sets = datasets.map(d => {
    const m = meta.ring?.[d.id] || d;
    return {th: m.short?.[0] || m.th, en: usSpelling(m.short?.[1] || m.en), n: facts?.ring?.[d.id]?.n?.[i] ?? 0};
  }).filter(d => d.n > 0).sort((a, b) => b.n - a.n);
  const shown = sets.slice(0, 3), rest = sets.slice(3), restN = rest.reduce((a, d) => a + d.n, 0);
  const mix = sets.length ? `<p class="res-age-text ${cfg.kind}-mix">${say(
    `${shown.map(d => `${d.th} ${num(d.n)}`).join(' · ')}${rest.length ? ` · อีก ${num(rest.length)} ชุดข้อมูล รวม ${num(restN)}` : ''}`,
    `${shown.map(d => `${d.en} ${num(d.n)}`).join(' · ')}${rest.length ? ` · ${num(rest.length)} more datasets: ${num(restN)} in all` : ''}`)}</p>` : '';
  // the people (and beds) the sources record at this radius: the rings' own measure, one figure per dataset, never added up
  const measured = cfg.people ? datasets.map(d => ({ms: meta.ring?.[d.id]?.measure, v: facts?.ring?.[d.id]?.m?.[i] ?? 0}))
    .filter(x => Array.isArray(x.ms) && x.v > 0).sort((a, b) => b.v - a.v) : [];
  const people = measured.length ? `<p class="res-age-text work-people">${say(
    `ที่แหล่งบันทึกไว้ใน ${km(r)}: ${measured.map(x => `${x.ms[1]} ${num(x.v)}`).join(' · ')}`,
    `Recorded by the sources within ${kmEn(r)}: ${measured.map(x => `${num(x.v)} ${x.ms[2]}`).join(' · ')}`)}</p>` : '';
  // office workers (modelled; data/work-study-map w, 0.9.6): office area × occupancy ÷ 10–12 m² per person, a range, never added up
  const om = cfg.people ? pmeta.officeWorkers : null, ow = om ? rec.w?.[i] : null;
  const owN = ow ? ow[2] + ow[3] : 0;
  const owRange = ow ? `${num(ow[0])}\u2060–\u2060${num(ow[1])}` : ''; // a range never breaks at its dash
  const officeModel = owN > 0 ? `<p class="res-age-text work-office-model">${say(
    `คนทำงานในสำนักงาน (แบบจำลอง) ใน ${km(r)} ราว ${owRange}\u00a0คน · จากพื้นที่ของสำนักงาน ${num(owN)} จาก ${num(ow[4])} แห่ง`,
    `Office workers (modelled) within ${kmEn(r)}: about ${owRange} · from the area of ${num(owN)} of ${num(ow[4])} offices`)}</p>` : '';
  const model = placesMapModel(rec, pmeta, cfg.scale), {ramp} = model;
  const figure = `<figure class="res-figure">${placesMapHTML(cfg, row, rec, pmeta, r, model, {overlay: residentsMap, outline: residents?.o || null, outlineUnit: residentsMeta?.outline?.unit_m || 25})}
    <figcaption class="res-legend"><span class="res-legend-title">${say('สถานที่ต่อช่อง 250 × 250 ม.', 'Places per 250 × 250 m cell')}</span>${rampLegendHTML(ramp, {unit: 'สถานที่ต่อช่อง 250 × 250 ม.'})}
    ${residentsOverlayKey({lines: Boolean(residentsMap?.rec)})}
    <span class="hint">${residents?.o
    ? say('สีเทียบช่อง 250 ม. ในวง 5 กม. ของศูนย์นี้เท่านั้น · ช่องสีพื้นไม่มีสถานที่ในชุดข้อมูลที่นับ · เส้นบางคือขอบแขวง/ตำบล', 'Colours compare the 250 m cells within this center’s 5 km only · plain cells hold no place of the datasets counted · thin lines are subdistrict boundaries')
    : say('สีเทียบช่อง 250 ม. ในวง 5 กม. ของศูนย์นี้เท่านั้น · ช่องสีพื้นไม่มีสถานที่ในชุดข้อมูลที่นับ', 'Colours compare the 250 m cells within this center’s 5 km only · plain cells hold no place of the datasets counted')}</span></figcaption></figure>`;
  const dates = datasets.map(d => d.date).filter(Boolean).sort();
  const span = dates.length ? (dates[0] === dates.at(-1) ? [thaiDay(dates[0]), englishDay(dates[0])] : [`${thaiDay(dates[0])}–${thaiDay(dates.at(-1))}`, `${englishDay(dates[0])}–${englishDay(dates.at(-1))}`]) : ['', ''];
  const nSets = datasets.length;
  // where each dataset comes from: a CityMETER demo web, or the CityMETER research registry (meta.ring[id].source)
  const fromRegistry = datasets.filter(d => meta.ring?.[d.id]?.source?.[0] === REGISTRY_SOURCE);
  const fromDemos = datasets.filter(d => meta.ring?.[d.id]?.source && meta.ring[d.id].source[0] !== REGISTRY_SOURCE);
  const line = `<p class="hint res-evidence">${say(...cfg.line(nSets, span))}${residentsMap?.rec ? residentsOverlayCredit(residentsMap.meta) : ''}</p>`;
  const partial = datasets.filter(d => d.eligible && d.located != null && d.located < 0.9 * d.eligible).map(d => {
    const m = meta.ring?.[d.id] || d;
    return [`${m.short?.[0] || m.th} มีพิกัด ${num(d.located)} จาก ${num(d.eligible)}`, `${usSpelling(m.short?.[1] || m.en)}: ${num(d.located)} of ${num(d.eligible)} have a point`];
  });
  const listTh = datasets.map(d => meta.ring?.[d.id]?.th || d.th).join(' · ');
  const listEn = datasets.map(d => usSpelling(meta.ring?.[d.id]?.en || d.en)).join(' · ');
  const notes = cfg.people ? datasets.map(d => meta.ring?.[d.id]?.measure).filter(Array.isArray) : [];
  const noHeadcount = cfg.people ? datasets.filter(d => !Array.isArray(meta.ring?.[d.id]?.measure)).map(d => meta.ring?.[d.id] || d) : [];
  const peopleNote = notes.length ? `<li>${say(
    `ตัวเลขคนและเตียงเป็นค่าที่แหล่งบันทึกในวงด้านบน แสดงเฉพาะเมื่อมีค่า และไม่บวกกัน: ${notes.map(ms => `${ms[1]} — ${ms[3]}`).join(' · ')}${noHeadcount.length ? ` · ${noHeadcount.map(m => m.short?.[0] || m.th).join(' ')}ยังไม่มีจำนวนคนในรุ่นนี้` : ''}`,
    `The people and beds are the values the sources record in the rings above, shown when there is one and never added up: ${notes.map(ms => `${ms[2]} — ${ms[4]}`).join(' · ')}${noHeadcount.length ? ` · ${noHeadcount.map(m => usSpelling(m.short?.[1] || m.en)).join(', ')}: no headcount in this release` : ''}`)}</li>\n      ` : '';
  const method = `<details class="locale-details" data-locale-open="${cfg.open}"${openAttr(cfg.open)}><summary>${icon('evidence')}${say(...cfg.summary)}</summary>
    <ul class="locale-method">
      <li>${say(...cfg.what)}</li>
      <li>${say(...cfg.sets(meta, nSets, listTh, listEn))}</li>
      <li>${say(`ที่มา: เว็บเดโม CityMETER ${num(fromDemos.length)} ชุด และทะเบียนวิจัย CityMETER ${num(fromRegistry.length)} ชุด ที่มาและวันที่ของแต่ละชุดอยู่ในตาราง “ตัวเลขทุกรัศมี” ด้านล่าง`,
        `Sources: ${num(fromDemos.length)} CityMETER demo webs and ${num(fromRegistry.length)} datasets of the CityMETER research registry; each one’s source and date are in the table “Figures for every radius” below`)}</li>
      ${partial.length ? `<li>${say(`นับเฉพาะรายการที่มีพิกัด ชุดที่มีพิกัดไม่ถึง 90%: ${partial.map(x => x[0]).join(' · ')}`, `Only records with a point are counted; datasets with points for under 90% of their records: ${partial.map(x => x[1]).join(' · ')}`)}</li>` : ''}
      ${peopleNote}${om ? `<li>${say(
    `คนทำงานในสำนักงาน (แบบจำลอง) = พื้นที่ของสำนักงาน × อัตราการเช่า ÷ ${om.sqmPerPerson[0]}–${om.sqmPerPerson[1]} ตร.ม. ต่อคน รวมทุกสำนักงานในรัศมีที่มีพื้นที่${owN > 0 ? ` (ใน ${km(r)}: พื้นที่ให้เช่าที่แหล่งเผยแพร่ ${num(ow[2])} แห่ง พื้นที่ตามแหล่ง ${num(ow[3])} แห่ง)` : ''} ไม่ใช้พื้นที่ที่แหล่งข้อมูลขัดกัน · อัตราการเช่าใช้ของอาคารเมื่อเจ้าของรายงาน นอกนั้นใช้ ${(om.occupancy.rate * 100).toFixed(1)}% ${om.occupancy.th} (${om.occupancy.byTh}) · ${om.density.th} (${om.density.byTh}) · นับสำนักงานละครั้ง ไม่รวมสำนักงานในอาคารเดียวกันเป็นรายการเดียว · เป็นค่าประมาณจากพื้นที่ ไม่ใช่จำนวนพนักงานที่นับได้ และไม่บวกกับคนที่แหล่งบันทึก · พื้นที่และอัตราการเช่าของอาคารจาก CityMETER · Office ${om.source.productVersion} ตรวจถึง ${thaiDay(om.source.checkedOn)}`,
    `Office workers (modelled) = office area × occupancy ÷ ${om.sqmPerPerson[0]}–${om.sqmPerPerson[1]} m² per person, over every office within the radius that has an area${owN > 0 ? ` (within ${kmEn(r)}: ${num(ow[2])} with a published leasable area, ${num(ow[3])} with a source area)` : ''}; an area the sources disagree on is not used · the building’s own occupancy when its owner reports it, otherwise ${(om.occupancy.rate * 100).toFixed(1)}%, ${om.occupancy.en} (${om.occupancy.byEn}) · ${om.density.en} (${om.density.byEn}) · each office counts once; offices in one building are not merged · an estimate from floor area, not a count of employees, and never added to the people the sources record · areas and building occupancy from CityMETER · Office ${om.source.productVersion}, checked to ${englishDay(om.source.checkedOn)}`)} ${extLink(om.occupancy.url, 'ที่มาของอัตราการเช่า', 'source-link', 'occupancy source')} · ${extLink(om.density.url, 'ที่มาของพื้นที่ต่อคน', 'source-link', 'space-per-person source')}</li>` : ''}<li>${say(...cfg.caveat)}</li>
      <li>${say(`อันดับเป็นเปอร์เซ็นไทล์แบบ mid-rank เทียบกับ${uni.th} ${num(uni.n)} แห่ง ค่าที่เท่ากันนับครึ่ง อันดับสูงไม่ได้แปลว่าทำเลดีกว่า`, `The rank is a mid-rank percentile among ${num(uni.n)} ${uniEn}, ties counted half; a higher rank does not make a better location`)}</li>
      ${referenceLine(meta)}
      <li>${say(`แผนที่: สีของช่อง 250 × 250 ม. เรียงตามจำนวนสถานที่ในช่องในวง 5 กม. ของศูนย์นี้ 41 ระดับ ตัวหารคือพื้นที่ของช่อง 1/16 ตร.กม. ทุกช่องเท่ากัน ใช้เทียบช่องในวงนี้ ไม่ใช้เทียบสีข้ามศูนย์ · ${cfg.colour[0]} · ช่องที่ขอบวงนับเฉพาะสถานที่ในรัศมี · ช่องสีพื้นไม่มีสถานที่ในชุดข้อมูลที่นับ ไม่ได้แปลว่าไม่มีคน`,
        `Map: each 250 × 250 m cell takes its rank of places within this center’s 5 km, 41 steps; the denominator is the cell’s area, 1/16 km², the same for every cell; to compare the cells of this map, not colours across centers · ${cfg.colour[1]} · cells on the edge count only the places inside the radius · a plain cell holds no place of the datasets counted, which does not mean no one is there`)}</li>
      ${residentsMap?.rec ? `<li>${residentsOverlayMethod(residentsMap.meta)}</li>` : ''}
      <li>${say(`รุ่นข้อมูล ${pmeta.release} คิดจากชุดจุดของ ${pmeta.localeRelease} จำนวนในรัศมีเท่ากับวงด้านบนทุกชุดข้อมูล`, `Release ${pmeta.release}, counted from the point sets of ${pmeta.localeRelease}; the counts within each radius equal the rings above, dataset by dataset`)} · <a href="DATA_METHOD.md#${cfg.anchor}" target="_blank" rel="noopener">${say('ที่มาและวิธี', 'Sources and method')}</a></li>
    </ul></details>`;
  return wrap(`${head}
    ${mix}${people ? `\n    ${people}` : ''}${officeModel ? `\n    ${officeModel}` : ''}
    ${figure}
    ${placesTableHTML(cfg, rec, pmeta)}
    ${line}
    ${method}`);
}

const visitorsBlock = (meta, row, vmeta, rec, state, ctx) => placesBlock(PLACES.visitors, meta, row, vmeta, rec, state, ctx);
const workBlock = (meta, row, wmeta, rec, state, ctx) => placesBlock(PLACES.work, meta, row, wmeta, rec, state, ctx);

/** Only the visitors zone of a venue's section, for when its file arrives after the rest is drawn ('' when it has none). */
export function renderLocaleVisitors(row, {meta = null, facts = null, visitorsMeta = null, visitors = null, visitorsState = 'idle', residentsMeta = null, residents = null, residentsMap = null} = {}) {
  if (!inLocaleSet(row) || !meta || !facts || facts.located === false) return '';
  return visitorsBlock(meta, row, visitorsMeta, visitors, visitorsState, {facts, residents, residentsMeta, residentsMap});
}

/** Only the work-and-study zone of a venue's section ('' when it has none). */
export function renderLocaleWork(row, {meta = null, facts = null, workMeta = null, work = null, workState = 'idle', residentsMeta = null, residents = null, residentsMap = null} = {}) {
  if (!inLocaleSet(row) || !meta || !facts || facts.located === false) return '';
  return workBlock(meta, row, workMeta, work, workState, {facts, residents, residentsMeta, residentsMap});
}

/* ---------- other centers on two ranks (method v1 §4 “เทียบหลายศูนย์”; owner 2026-11-20 11:27) ---------- */

export const COMPARE_PATH = 'data/compare/residents-workers.json';
export const loadCompare = ({fetchImpl = (...a) => fetch(...a)} = {}) => fetchJSON(COMPARE_PATH, fetchImpl);
export const cachedCompare = () => resolved.get(COMPARE_PATH) || null;

const GROUP_WORDS = Object.freeze({mall: ['ศูนย์การค้า', 'Shopping center'], community: ['คอมมูนิตี้มอลล์', 'Community mall'], outlet: ['เอาท์เล็ต', 'Outlet']});
export const QUARTERS = Object.freeze({work: ['ย่านงาน', 'Workplace'], mixed: ['ผสม', 'Mixed'], sparse: ['เบาบาง', 'Sparse'], home: ['ย่านบ้าน', 'Residential']});
/** The quarter of two ranks: both at or above the split read “mixed”, both below “sparse”. */
export const quarterOf = (x, y, split = 50) => (x >= split ? (y >= split ? 'mixed' : 'home') : (y >= split ? 'work' : 'sparse'));

/**
 * The centers of the universe of the chips on two ranks at the radius of the chips: x = registered residents nearby
 * (the rank of data/residents), y = workers and commuters nearby (a rank of the generated prior, which does not change
 * with the radius). Nearest = the five closest on the chart (straight-line distance in rank points; ties by id).
 * Returns null when the file has no record of the center.
 */
export function compareModel(cmp, row, {radius = options.radius, universe = options.universe, near = 5} = {}) {
  const i = RI[radius] ?? 1, mine = cmp?.venues?.[row?.id];
  if (!mine) return null;
  const type = universe === 'type';
  const points = [];
  for (const [id, v] of Object.entries(cmp.venues)) {
    if (type && v[0] !== mine[0]) continue;
    points.push({id, x: type ? v[2][i] : v[1][i], y: type ? v[4] : v[3]});
  }
  const split = cmp.split ?? 50;
  const ref = type ? cmp.universes?.[cmp.groups?.[mine[0]]] : cmp.universes?.all;
  const me = points.find(q => q.id === row.id);
  const counts = {work: 0, mixed: 0, sparse: 0, home: 0};
  for (const q of points) counts[quarterOf(q.x, q.y, split)] += 1;
  const nearest = points.filter(q => q.id !== row.id).map(q => ({...q, d: Math.hypot(q.x - me.x, q.y - me.y)}))
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, near);
  // n: the centers on the chart (every located one); ref: the centers the two ranks are read against (the reference)
  return {i, radius: RADII[i], universe: type ? 'type' : 'all', points, me, quarter: quarterOf(me.x, me.y, split), counts, nearest, split, n: points.length, ref: ref ?? points.length};
}

const at1 = v => Number(Number(v).toFixed(1));
/** One path of circles (the plot's 0–100 box, y up). */
const dotsPath = (pts, rad) => pts.map(q => `M${at1(q.x - rad)} ${at1(100 - q.y)}a${rad} ${rad} 0 1 0 ${2 * rad} 0a${rad} ${rad} 0 1 0 ${-2 * rad} 0`).join('');

/** The comparison of the residents zone: the quarter, the two ranks, the chart, the nearest centers, one data line, the method folded. */
function compareBlock(meta, row, rmeta, cmp, state, venueOf) {
  const wrap = inner => `<div class="cmp-block" id="locale-compare" role="group" aria-labelledby="locale-cmp-title"><h5 class="res-sub" id="locale-cmp-title" tabindex="-1">${say('เทียบกับศูนย์อื่น: คนอยู่ใกล้และคนทำงานใกล้', 'Against other centers: people living and working nearby')}</h5>${inner}</div>`;
  if (state === 'error') return wrap(`<p class="hint">${say('โหลดการเทียบกับศูนย์อื่นไม่สำเร็จ', 'Could not load the comparison with other centers')} <button type="button" class="link-button" data-action="locale-retry-compare">${say('ลองอีกครั้ง', 'Try again')}</button></p>`);
  if (!cmp) return wrap(`<p class="hint" role="status">${say('กำลังโหลดการเทียบกับศูนย์อื่น…', 'Loading the comparison with other centers…')}</p>`);
  const model = compareModel(cmp, row);
  if (!model) return '';
  const {me, quarter, counts, nearest, n, ref, radius, universe} = model;
  const uni = universeOf(meta, row);
  const typeEn = usSpelling(meta.universes?.[row.group]?.en || '').replace(/^located /, '').replace(/ of the reference set$/, '');
  // ranks read against the reference (as the rings above); the chart and the quarter counts are every located center
  const uniTh = universe === 'all' ? ` ${num(ref)} ศูนย์` : uni.short, uniEn = universe === 'all' ? `${num(ref)} centers` : `${num(ref)} ${typeEn}`;
  const plotTh = `${universe === 'all' ? 'ศูนย์' : typeWord(meta.universes?.[row.group])}ที่มีพิกัดทั้งหมด ${num(n)} แห่ง`, plotEn = `all ${num(n)} located ${universe === 'all' ? 'centers' : typeEn}`;
  const [qTh, qEn] = QUARTERS[quarter];
  const xr = rankPair(me.x, uniTh, uniEn, {count: true}), yr = rankPair(me.y, uniTh, uniEn);
  const lead = `<p class="cmp-lead">${say(`ศูนย์นี้อยู่ช่อง “${qTh}”`, `This center is in “${qEn}”`)} <span class="cmp-count">${say(`${num(counts[quarter])} จาก ${num(n)} ศูนย์อยู่ช่องนี้`, `${num(counts[quarter])} of ${num(n)} centers are here`)}</span></p>
    <ul class="cmp-ranks"><li>${icon('residents')}${say(`คนอยู่ใกล้ใน ${km(radius)}: ${xr[0]}`, `People living within ${kmEn(radius)}: ${xr[1]}`)}</li><li>${icon('office')}${say(`คนทำงานใกล้: ${yr[0]}`, `People working nearby: ${yr[1]}`)}</li></ul>`;
  const pos = v => `${(((v + 3) / 106) * 100).toFixed(2)}%`;
  // the quarter names sit outside the plot, over and under their own half, so no name covers a dot or this center's label
  const quarterTag = key => `<span class="cmp-q${key === quarter ? ' is-on' : ''}">${say(QUARTERS[key][0], QUARTERS[key][1])} <b class="data-number">${num(counts[key])}</b></span>`;
  const meSide = `${me.x > 70 ? ' is-left' : ''}${me.y > 90 ? ' is-below' : me.y < 10 ? ' is-above' : ''}`;
  const title = [`จุดของ${plotTh} ตามอันดับคนอยู่ใกล้ใน ${km(radius)} (แนวนอน) และคนทำงานใกล้ (แนวตั้ง) ศูนย์นี้อยู่ช่อง${qTh}`,
    `${plotEn[0].toUpperCase()}${plotEn.slice(1)} by the rank of people living within ${kmEn(radius)} (across) and people working nearby (up); this center is in ${qEn}`];
  const chart = `<figure class="cmp-figure">
    <div class="cmp-qrow">${quarterTag('work')}${quarterTag('mixed')}</div>
    <div class="cmp-wrap"><svg class="cmp-plot" viewBox="-3 -3 106 106" role="img" aria-labelledby="locale-cmp-t"><title id="locale-cmp-t"${enAttr(title[1])}>${esc(title[0])}</title>
      <rect class="cmp-bg" x="0" y="0" width="100" height="100" rx="2"/><path class="cmp-mid" d="M50 0V100M0 50H100"/>
      <path class="cmp-dots" d="${dotsPath(model.points.filter(q => q.id !== me.id), 0.9)}"/>
      <path class="cmp-near" d="${dotsPath(nearest, 1.5)}"/>
      <circle class="cmp-me" cx="${at1(me.x)}" cy="${at1(100 - me.y)}" r="2.4"/></svg>
    <span class="cmp-me-label${meSide}" style="left:${pos(me.x)};top:${pos(100 - me.y)}" aria-hidden="true">${say('ศูนย์นี้', 'This center')}</span></div>
    <div class="cmp-qrow">${quarterTag('sparse')}${quarterTag('home')}</div>
    <figcaption class="cmp-axes">${say(`แนวนอน: คนอยู่ใกล้ใน ${km(radius)} (อันดับ) → · แนวตั้ง: คนทำงานใกล้ (อันดับ) ↑ · เส้นประคืออันดับกลาง`, `Across: people living within ${kmEn(radius)} (rank) → · up: people working nearby (rank) ↑ · dashed lines are the middle rank`)}</figcaption></figure>`;
  const pEnOf = code => (code === BANGKOK ? 'Bangkok' : provinceByCode(code)?.en || '');
  const items = nearest.map(q => {
    const v = venueOf?.(q.id);
    if (!v) return '';
    const [nqTh, nqEn] = QUARTERS[quarterOf(q.x, q.y, model.split)];
    return `<li><button type="button" class="cmp-near-row" data-action="select-venue" data-id="${esc(q.id)}"><span class="cmp-near-name">${say(v.name, v.nameEn)}<small>${say(provinceWord(v.provinceCode), pEnOf(v.provinceCode))} · ${say(...(GROUP_WORDS[v.group] || ['', '']))} · ${say(nqTh, nqEn)}</small></span><span class="cmp-near-val">${icon('residents')}<b class="data-number">${num(Math.round(q.x))}%</b>${icon('office')}<b class="data-number">${num(Math.round(q.y))}%</b></span></button></li>`;
  }).join('');
  const list = items ? `<details class="locale-details cmp-near-fold" data-locale-open="cmpnear"${openAttr('cmpnear')}><summary>${say('ศูนย์ที่ระดับใกล้กันที่สุด 5 แห่ง', 'The five centers with the closest levels')}</summary><p class="cmp-near-head"><span class="res-sub">${say('ศูนย์ที่อันดับใกล้กันที่สุด', 'Centers with the closest ranks')}</span><span class="cmp-near-key">${icon('residents')}${say('คนอยู่ใกล้', 'living')} ${icon('office')}${say('คนทำงานใกล้', 'working')}</span></p><ol class="cmp-near-list">${items}</ol></details>` : '';
  const pm = rmeta?.populationMonth, asOf = meta.asOf;
  const line = `<p class="hint res-evidence cmp-evidence">${say(
    `อันดับเทียบกับ${uniTh}ในชุดอ้างอิง · คนอยู่ใกล้: คนที่มีชื่อในทะเบียนบ้าน (แบบจำลอง) กรมการปกครอง ${thaiDay(pm)} ผ่าน CityMETER production · คนทำงานใกล้: ระดับคนทำงานและผู้เดินทางจากกฎของรอบศูนย์นี้ ทะเบียนวิจัย CityMETER ${thaiDay(asOf)} · รัศมีเส้นตรงจากจุดของศูนย์`,
    `Ranks against the ${uniEn} of the reference set · living nearby: registered residents (modelled), Department of Provincial Administration, ${englishDay(pm)}, through CityMETER production · working nearby: the workers and commuters level from the rules of this section, CityMETER research registry, ${englishDay(asOf)} · straight-line radius from the center’s point`)}</p>`;
  const method = `<details class="locale-details" data-locale-open="cmp"${openAttr('cmp')}><summary>${icon('evidence')}${say('วิธีอ่านกราฟเทียบและข้อจำกัด', 'How to read the comparison, and the limits')}</summary>
    <ul class="locale-method">
      <li>${say(`แนวนอนคืออันดับ (เปอร์เซ็นไทล์แบบ mid-rank) ของคนที่มีชื่อในทะเบียนบ้านใน ${km(radius)} เทียบกับ${uniTh} เหมือนอันดับด้านบน เปลี่ยนตามรัศมีและกลุ่มที่เลือก`, `Across: the rank (mid-rank percentile) of the registered residents within ${kmEn(radius)} among ${uniEn}, as the rank above; it follows the radius and the comparison chosen`)}</li>
      <li>${say('แนวตั้งคืออันดับของระดับ “คนทำงานและผู้เดินทาง” ในสมมติฐานของรอบศูนย์นี้ (ค่าเฉลี่ยของสองสัญญาณที่อันดับสูงสุด จากสำนักงาน หน่วยงานราชการ คนงานโรงงาน โรงพยาบาล สำนักงานใหญ่ของธุรกิจ และสถานีรถไฟฟ้า) เป็นสมมติฐานจากกฎ ไม่ใช่จำนวนคนทำงาน และไม่เปลี่ยนตามรัศมี',
        'Up: the rank of the “workers and commuters” level in this section’s hypotheses (the mean of its two highest signals among offices, government offices, factory workers, hospitals, business headquarters and rail stations); a rule-based hypothesis, not a count of workers, and the same at every radius')}</li>
      <li>${say(`ชื่อช่องเป็นการตีความ แบ่งที่อันดับ ${num(model.split)}% ของทั้งสองแกน: ย่านบ้าน คนอยู่มากกว่าครึ่งของศูนย์อื่นแต่คนทำงานน้อยกว่า · ย่านงาน กลับกัน · ผสม มากทั้งสองแกน · เบาบาง น้อยทั้งสองแกน`,
        `The quarter names are an interpretation, split at the ${num(model.split)}% rank on both axes: Residential, more people living nearby than half the centers but fewer working · Workplace, the reverse · Mixed, more on both · Sparse, fewer on both`)}</li>
      ${n !== ref ? referenceLine(meta, [`กราฟแสดง${plotTh} วางตามอันดับที่เทียบกับชุดอ้างอิง`, `the chart shows ${plotEn}, placed by their ranks against the reference set`]) : ''}
      <li>${say('ศูนย์ที่อันดับใกล้กันคือ 5 ศูนย์ที่อยู่ใกล้ที่สุดบนกราฟนี้ ไม่ได้แปลว่าทำเล ลูกค้า หรือยอดขายเหมือนกัน และอันดับสูงไม่ได้แปลว่าทำเลดีกว่า', 'The centers with the closest ranks are the five nearest on this chart; that does not make their location, shoppers or sales alike, and a higher rank does not make a better location')}</li>
      <li>${say(`ไฟล์ ${COMPARE_PATH} สร้างจากไฟล์จำนวนคนและสมมติฐานที่เว็บนี้ใช้อยู่แล้ว`, `File ${COMPARE_PATH}, built from the residents and hypothesis files this page already uses`)} · <a href="DATA_METHOD.md#compare-residents-workers" target="_blank" rel="noopener">${say('ที่มาและวิธี', 'Sources and method')}</a></li>
    </ul></details>`;
  return wrap(`${lead}${chart}${list}${line}${method}`);
}

/**
 * “คนที่มีชื่อในทะเบียนบ้านรอบศูนย์ (แบบจำลอง)”: the figure at the radius of the chips with its rank among the centers (the
 * `count` LUT sample, as the cards above), how near or far the people live, their ages, the map with where most of the
 * people are and the map as a table (folded), one data line, the method and its limits folded, then the comparison with
 * the other centers on two ranks (data/compare, its own data line and method).
 */
function residentsBlock(meta, row, rmeta, rec, state, {compare = null, compareState = 'idle', venueOf = null, residentsMap = null} = {}) {
  const titleTh = 'คนที่มีชื่อในทะเบียนบ้านรอบศูนย์ (แบบจำลอง)', titleEn = 'Registered residents around the center (modelled)';
  const wrap = inner => `<div class="locale-block res-block" id="locale-residents" role="group" aria-labelledby="locale-res-title">${inner}</div>`;
  const simple = text => wrap(`<h4 class="locale-sub" id="locale-res-title" tabindex="-1">${icon('residents')}${say(titleTh, titleEn)}</h4>${text}`);
  if (state === 'error') return simple(`<p class="hint">${say('โหลดจำนวนคนรอบศูนย์ไม่สำเร็จ', 'Could not load the residents around the center')} <button type="button" class="link-button" data-action="locale-retry-residents">${say('ลองอีกครั้ง', 'Try again')}</button></p>`);
  if (!rmeta || (!rec && state !== 'empty')) return simple(`<p class="hint" role="status">${say('กำลังโหลดจำนวนคนรอบศูนย์…', 'Loading the residents around the center…')}</p>`);
  if (!rec) return simple(`<p class="hint">${say('รุ่นข้อมูลนี้ยังไม่มีจำนวนคนรอบศูนย์นี้', 'This release has no residents for this center yet')}</p>`);
  const i = RI[options.radius] ?? 1, r = RADII[i];
  const uni = universeOf(meta, row);
  const uniEn = usSpelling(meta.universes?.[uni.key === 'type' ? row.group : 'all']?.en || '');
  const p = rec.p?.[uni.key === 'type' ? 1 : 0]?.[i] ?? null;
  const value = aboutPeople(rec.n[i]);
  const nb = t => t.replace(/ (กม\.|km)$/, '\u00a0$1'); // the number stays with its unit when the line wraps
  const big = `${value ? `${say('ราว', 'About')} <b class="data-number">${value}</b>` : `<b class="data-number">${say('ไม่ถึง 10', 'Fewer than 10')}</b>`} ${say(nb(`คน ใน ${km(r)}`), nb(`people within ${kmEn(r)}`))}`;
  const rank = p == null ? '' : `<span class="dot-track aha-track" aria-hidden="true"><b style="width:${p}%;background:${pctFill(p)}"></b><i class="dot" style="left:${p}%;background:${pctFill(p)}"></i></span><span class="aha-how">${esc(rankWords(p, uni.key === 'all' ? ` ${uni.short}` : uni.short))}</span>`;
  const head = `<div class="res-head">${icon('residents')}<div class="aha-body"><h4 class="res-title" id="locale-res-title" tabindex="-1">${say(titleTh, titleEn)}</h4><p class="res-big">${big}</p>${rank}</div></div>`;
  const n5 = rec.n[2];
  const rings = `<ol class="res-rings">${rec.ring.map(([people, dens], k) => {
    const share = n5 > 0 ? (100 * people) / n5 : 0;
    const pw = peopleWords(people), dw = densityWords(dens);
    return `<li><span class="res-ring-name">${say(...RING_WORDS[k])}</span><span class="res-bar" aria-hidden="true"><b style="width:${share.toFixed(1)}%"></b></span><span class="res-ring-val"><b class="data-number">${share < 0.5 ? '&lt;1%' : `${num(Math.round(share))}%`}</b> ${say(`${pw[0]} · ${dw[0]}`, `${pw[1]} · ${dw[1]}`)}</span></li>`;
  }).join('')}</ol>`;
  const age = rec.age[i] || [];
  const pc = age.map(a => num(Math.round(a * 100)));
  const ages = age.length === 3 ? `<h5 class="res-sub">${say(nb(`อายุ · ใน ${km(r)}`), nb(`Age · within ${kmEn(r)}`))}</h5>
    <div class="res-age" aria-hidden="true">${age.map((a, k) => `<b class="age-${k}" style="width:${(a * 100).toFixed(1)}%"></b>`).join('')}</div>
    <p class="res-age-text">${say(`เด็ก 0–14 ปี ${pc[0]}% · วัยทำงาน 15–59 ปี ${pc[1]}% · ผู้สูงอายุ 60 ปีขึ้นไป ${pc[2]}%`, `Children 0–14 ${pc[0]}% · working age 15–59 ${pc[1]}% · 60 and over ${pc[2]}%`)}</p>` : '';
  const model = residentsMapModel(rec, rmeta), {ramp} = model;
  const figure = `<figure class="res-figure">${residentsMapHTML(row, rec, rmeta, r, model, residentsMap)}
    <figcaption class="res-legend"><span class="res-legend-title">${say('คนต่อช่อง 250 × 250 ม.', 'People per 250 × 250 m cell')}</span>${rampLegendHTML(ramp, {unit: 'คนต่อช่อง 250 × 250 ม.'})}
    ${residentsOverlayKey({lines: Boolean(residentsMap?.rec)})}
    <span class="hint">${say('สีเทียบช่อง 250 ม. ในวง 5 กม. ของศูนย์นี้เท่านั้น · ช่องสีพื้นไม่มีอาคารที่นับได้ · เส้นบางคือขอบแขวง/ตำบล', 'Colours compare the 250 m cells within this center’s 5 km only · plain cells have no counted building · thin lines are subdistrict boundaries')}</span></figcaption></figure>`;
  const pm = rmeta.populationMonth, asOf = rmeta.asOf;
  const line = `<p class="hint res-evidence">${say(
    `คนที่มีชื่อในทะเบียนบ้าน (แบบจำลอง) · ประชากรตามทะเบียน กรมการปกครอง ${thaiDay(pm)} ผ่าน CityMETER production · อาคาร Building V4 (3D-GloBFP, Open Buildings, © ผู้ร่วมสร้าง OpenStreetMap) · คิด ${thaiDay(asOf)} · รัศมีเส้นตรงจากจุดของศูนย์ แขวง/ตำบลตาม CityMETER production`,
    `Registered residents (modelled) · registered population, Department of Provincial Administration, ${englishDay(pm)}, through CityMETER production · buildings: Building V4 (3D-GloBFP, Open Buildings, © OpenStreetMap contributors) · computed ${englishDay(asOf)} · straight-line radius from the center’s point, subdistricts as in CityMETER production`)}${residentsMap?.rec ? residentsOverlayCredit(residentsMap.meta) : ''}</p>`;
  const own = rec.own ? (() => {
    const w = peopleWords(rec.own[1]);
    return ` ${say(`อาคารของศูนย์นี้ ${num(rec.own[0])} หลังได้รับ${w[0]}`, `this center’s own ${rec.own[0] === 1 ? 'building gets' : `${num(rec.own[0])} buildings get`} ${w[1]}`)}`;
  })() : '';
  const method = `<details class="locale-details" data-locale-open="res"${openAttr('res')}><summary>${icon('evidence')}${say('วิธีคิดและข้อจำกัดของจำนวนคน', 'How the residents are modelled, and the limits')}</summary>
    <ul class="locale-method">
      <li>${say('จำนวนนี้คือคนที่มีชื่อในทะเบียนบ้านของอาคารรอบศูนย์ตามแบบจำลอง ไม่ใช่คนที่อยู่จริงทั้งหมด ไม่ใช่จำนวนคนที่มาศูนย์ และไม่ใช่รายได้หรือกำลังซื้อ', 'These are the people registered at the buildings around the center, as modelled: not everyone who lives there, not the people who visit the center, and not income or spending power')}</li>
      <li>${say(`ประชากรตามทะเบียนของแต่ละแขวง/ตำบล (กรมการปกครอง ${thaiDay(pm)}) แบ่งให้อาคาร Building V4 ตามพื้นที่ใช้สอยของอาคาร เทียบกับพื้นที่ใช้สอยรวมที่ CityMETER production ใช้ แล้วรวมอาคารที่จุดกึ่งกลางอยู่ในรัศมีเส้นตรง 1 · 3 · 5 กม. จากจุดของศูนย์ ไม่ใช่ระยะเดินหรือขับรถ`, `Each subdistrict’s registered population (Department of Provincial Administration, ${englishDay(pm)}) is split over its Building V4 buildings by floor area, against the total floor area CityMETER production uses; the buildings whose centre lies within the straight-line 1 · 3 · 5 km radius of the center’s point are added up, not walking or driving distance`)}</li>
      <li>${say('ทุกอาคารได้รับคนตามพื้นที่ใช้สอย รวมอาคารพาณิชย์และอาคารของศูนย์เอง เหมือนใน production ย่านพาณิชย์จึงมีค่าใกล้ศูนย์สูงกว่าคนที่อยู่จริง', 'Every building gets people by its floor area, shops and the center’s own buildings included, as in production, so commercial areas read higher near the center than the people who live there')}${own}</li>
      <li>${say(`ใน ${km(r)} นับอาคาร ${num(rec.b[i])} หลัง ในแขวง/ตำบล ${num(rec.sd[i])} แห่ง`, `Within ${kmEn(r)}: ${num(rec.b[i])} buildings in ${num(rec.sd[i])} subdistricts`)}</li>
      <li>${say('อายุคือโครงสร้างอายุของแขวง/ตำบลที่รัศมีคร่อม ถ่วงตามจำนวนคนในรัศมี ไม่ใช่อายุของคนในแต่ละอาคาร', 'Ages are the age structure of the subdistricts the radius covers, weighted by the people inside it, not the age of the people in each building')}</li>
      <li>${say(`อันดับเป็นเปอร์เซ็นไทล์แบบ mid-rank เทียบกับ${uni.th} ${num(uni.n)} แห่ง ค่าที่เท่ากันนับครึ่ง อันดับสูงไม่ได้แปลว่าทำเลดีกว่า`, `The rank is a mid-rank percentile among ${num(uni.n)} ${uniEn}, ties counted half; a higher rank does not make a better location`)}</li>
      ${referenceLine(meta)}
      <li>${say('แผนที่: สีของช่อง 250 × 250 ม. เรียงตามจำนวนคนในช่องในวง 5 กม. ของศูนย์นี้ (LDS density 41 ระดับ ตัวหารคือพื้นที่ของช่อง 1/16 ตร.กม. ทุกช่องเท่ากัน ลำดับจึงเท่ากับลำดับของคนต่อ ตร.กม.) ใช้เทียบช่องในวงนี้ ไม่ใช้เทียบสีข้ามศูนย์ · ตัวเลขใต้แถบสีปัดเหลือ 2 หลัก · ช่องที่ขอบวงนับเฉพาะอาคารในรัศมี · ช่องที่มีอาคารแต่คนไม่ถึง 0.05 คนใช้สีต่ำสุด · เส้นบางคือขอบแขวง/ตำบลของ production ที่ปรับให้เรียบเพื่ออ่านแผนที่ ไม่ใช่เส้นสำหรับวัด', 'Map: each 250 × 250 m cell takes its rank of residents within this center’s 5 km (LDS density, 41 steps; the denominator is the cell’s area, 1/16 km², the same for every cell, so the order is that of people per km²), to compare the cells of this map, not colours across centers · the figures under the colour bar are rounded to two digits · cells on the edge count only the buildings inside the radius · cells with buildings but under 0.05 residents take the lowest step · thin lines are production’s subdistrict boundaries, smoothed to read the map by, not to measure on')}</li>
      ${residentsMap?.rec ? `<li>${residentsOverlayMethod(residentsMap.meta)}</li>` : ''}
      <li>${say(`รุ่นข้อมูล ${rmeta.release} คิดจาก API ของ CityMETER production ${thaiDay(asOf)}`, `Release ${rmeta.release}, computed from the CityMETER production API on ${englishDay(asOf)}`)} · <a href="DATA_METHOD.md#registered-residents" target="_blank" rel="noopener">${say('ที่มาและวิธี', 'Sources and method')}</a></li>
    </ul></details>`;
  return wrap(`${head}
    <h5 class="res-sub">${say(nb('คนอยู่ใกล้หรือไกลศูนย์ · สัดส่วนของคนใน 5 กม.'), nb('Near or far from the center · share of the people within 5 km'))}</h5>
    ${rings}
    ${ages}
    ${figure}
    ${residentsTableHTML(rec, rmeta)}
    ${line}
    ${method}
    ${compareBlock(meta, row, rmeta, compare, compareState, venueOf)}`);
}

/** Only the residents zone of a venue's section, for when its file arrives after the rest is drawn ('' when it has none). */
export function renderLocaleResidents(row, {meta = null, facts = null, residentsMeta = null, residents = null, residentsState = 'idle', compare = null, compareState = 'idle', venueOf = null, residentsMap = null} = {}) {
  if (!inLocaleSet(row) || !meta || !facts || facts.located === false) return '';
  return residentsBlock(meta, row, residentsMeta, residents, residentsState, {compare, compareState, venueOf, residentsMap});
}

function methodBlock(meta, uni) {
  const notCounted = (meta.notCounted || []).filter(x => x.treatment === 'not_countable_catalog_only' && x.th).map(x => x.th);
  return `<details class="locale-details" id="locale-method" data-locale-open="method"${openAttr('method')}><summary>${icon('evidence')}ที่มาและวิธีของส่วนนี้</summary>
    <ul class="locale-method">
      <li>นับรายการที่แหล่งระบุในรัศมีเส้นตรง 1 · 3 · 5 กม. จากจุดของศูนย์ ไม่ใช่ระยะเดินหรือขับรถ และไม่ใช่จำนวนคนเดิน</li>
      <li>ระดับเทียบ 0–100 ได้จากการเรียง${esc(uni.th)} ${num(uni.n)} แห่งจากน้อยไปมาก ศูนย์ที่ได้ค่าเท่ากันใช้ระดับกึ่งกลางร่วมกัน · มาตรวัด 5 ขั้นแบ่งระดับนี้ทีละ 20 · 0 คือไม่พบรายการในรัศมี ไม่ใช่ไม่มีข้อมูล</li>
      ${referenceLine(meta)}
      <li>ค่าพื้นที่มาจาก CityMETER production ตามหน่วยที่จุดของศูนย์ตั้งอยู่ ตัวเลขที่เป็นจำนวนเทียบกันต่อ ตร.กม. ของหน่วย</li>
      <li>ชุดที่ยังมีพิกัดไม่ครบนับเฉพาะรายการที่มีพิกัด และติดดาวไว้ในตาราง</li>
      <li>${say('กลุ่มคน ช่วงเวลา และหมวดร้านเป็นสมมติฐานจากกฎ ไม่ใช่จำนวนคน ยอดขาย รายได้ หรือความเต็มใจจ่ายที่วัดได้ · ระดับราคารอบศูนย์อ่านจากราคาที่สังเกตได้ ไม่ใช่รายได้', 'The groups, the hours and the formats are rule-based hypotheses, not people counts, sales, income or measured willingness to pay · the price level around the center is read from observed prices, not income')}</li>
      <li>${say('หมวดที่อยู่ในรายชื่อของศูนย์คือสิ่งที่ศูนย์เผยแพร่ ณ วันที่ตรวจ ยังไม่ได้ตรวจหน้างาน · หมวดที่ยังไม่มีชุดข้อมูลให้เทียบแสดงแยกจากหมวดที่ตรวจรายชื่อแล้วยังไม่เห็น', 'A format in the center’s own list is what the center published on the check date, not yet verified on site · a format with no dataset to compare with is shown apart from one checked against the list and not seen')}</li>
      ${notCounted.length ? `<li>ยังนับไม่ได้ในรุ่นนี้: ${esc(notCounted.join(' · '))}</li>` : ''}
      <li>คอนโดนับตามแขวง/ตำบลของฐานราคาประเมินตามนโยบายของชุดข้อมูล ไม่นับจุดบนแผนที่ในรัศมี</li>
      <li>ตัวอย่างสถานที่รอบศูนย์มาจากเดโม CityMETER ของแต่ละชุด กดชื่อเพื่อเปิดในเดโมนั้น · ระยะปัดเป็น 100 ม.</li>
      <li>ค่าเทอมคือค่าเล่าเรียนที่โรงเรียนประกาศ · ราคาที่พักคือราคาเริ่มต้นที่บันทึกในชุดข้อมูล ไม่ทราบช่วงเวลา · ค่าเช่าสำนักงานคือราคาที่ประกาศ</li>
      <li>ข้อมูลรุ่น ${esc(meta.release?.id || '')} (release candidate) · จุดของศูนย์ยังเป็นจุดอ้างอิง ไม่ใช่ขอบเขตหรือทางเข้าที่ผู้บริหารยืนยัน</li>
    </ul></details>`;
}

/** Data line of the section: dataset · source · date · boundary. */
export function localeDataLine(meta) {
  const rings = Object.values(meta?.ring || {}).filter(m => m.placed).length, areas = Object.keys(meta?.area || {}).length;
  return `<p class="hint panel-foot">รอบศูนย์นี้ · ทะเบียนวิจัย CityMETER ${num(rings)} ชุด และ CityMETER production ${num(areas)} ชุด · ข้อมูล ${esc(dateRange(meta))} · รัศมีเส้นตรงจากจุดของศูนย์ และขอบเขตพื้นที่ตาม CityMETER production · <a href="DATA_METHOD.md#venue-locale-insight" target="_blank" rel="noopener">ที่มาและวิธี</a></p>`;
}

/**
 * The “รอบศูนย์นี้” section of a venue: {meta, facts, priors, signals, residents, state: {meta, facts, priors, residents}}; the
 * registered residents (modelled, 0.8.0) follow the cards of the counted datasets. Returns '' for rows outside
 * the 499-venue set (markets, fuel stations…), which the release does not cover.
 */
export function renderLocale(row, {meta = null, facts = null, priors = null, signals = null, metaState = 'idle', factsState = 'idle', priorsState = 'idle', residentsMeta = null, residents = null, residentsState = 'idle', compare = null, compareState = 'idle', venueOf = null, residentsMap = null, visitorsMeta = null, visitors = null, visitorsState = 'idle', workMeta = null, work = null, workState = 'idle'} = {}) {
  if (!inLocaleSet(row)) return '';
  const trial = /-rc\d*$/.test(meta?.release?.id || '') ? `<button type="button" class="prior-badge rc-badge" data-action="locale-jump" data-target="locale-method" data-open="method">${say('รุ่นทดลอง', 'Trial release')}</button>` : '';
  const head = `<div class="section-heading">${`<h3 id="locale-title">${icon('area')}รอบศูนย์นี้</h3>`}${trial}<span class="hint">รัศมีเส้นตรง</span></div>`;
  const shell = inner => `<section class="panel-section locale-section" id="venue-locale" data-venue="${esc(row.id)}" aria-labelledby="locale-title">${head}${inner}</section>`;
  if (metaState === 'error' || factsState === 'error') return shell('<p class="hint">โหลดข้อมูลรอบศูนย์ไม่สำเร็จ <button type="button" class="link-button" data-action="locale-retry">ลองอีกครั้ง</button></p>');
  if (!meta || (!facts && factsState !== 'empty')) return shell('<p class="hint" role="status">กำลังโหลดข้อมูลรอบศูนย์…</p>');
  if (!facts || facts.located === false) return shell('<p class="hint">ศูนย์นี้ยังไม่มีจุดที่ผ่านเกณฑ์ จึงยังนับสิ่งที่อยู่รอบศูนย์ไม่ได้</p>');
  const uni = universeOf(meta, row);
  const rows = ringRows(meta, facts, row);
  const aha = highlightRows(rows);
  const radiusChips = `<div class="chart-controls locale-controls" role="group" aria-label="รัศมี">${RADII.map(r => chip('locale-radius', 'radius', r, r === options.radius, km(r))).join('')}</div>`;
  const typeU = meta.universes?.[row.group];
  const uniChips = typeU ? `<div class="chart-controls locale-controls" role="group" aria-label="เทียบกับ"><span class="chart-note">เทียบกับ</span>${chip('locale-universe', 'universe', 'all', options.universe === 'all', `ทุกประเภท ${num(meta.universes.all.n)} แห่ง`)}${chip('locale-universe', 'universe', 'type', options.universe === 'type', `${typeWord(typeU)} ${num(typeU.n)} แห่ง`)}</div>` : '';
  const ahaHTML = aha.length ? `<ul class="locale-aha">${aha.map(r => `<li>${icon(ringIcon(r))}<span class="aha-body"><span class="aha-what">${say(r.name, r.nameEn)} <b class="data-number">${num(r.count)}</b> ${say(r.unit, r.unitEn)}</span>${levelMeter(levelOf(r.p, r.count), r.p)}<span class="sr-only">${esc(pctPhrase(r, uni))}</span></span></li>`).join('')}</ul>`
    : rows.some(r => r.count > 0) ? '' : '<p class="subtle">ในรัศมีนี้ยังไม่พบรายการจากชุดข้อมูลที่นับได้</p>';
  const ahaHead = aha.length ? `<p class="locale-lead aha-lead">${icon('rank')}${say('จุดเด่น · ระดับเทียบ 90 ขึ้นไป', 'Stands out · level 90 or more')}</p>` : '';
  const glance = glanceHTML(meta, row, facts, {residents, residentsMeta, residentsState, visitors, visitorsMeta, visitorsState, work, workMeta, workState});
  const unplaced = unplacedRows(meta, row);
  const pEn = row.provinceCode === BANGKOK ? 'Bangkok' : provinceByCode(row.provinceCode)?.en || '';
  const unplacedHTML = unplaced.length ? `<p class="hint locale-unplaced"><span data-en="No points to count in the rings yet:">ยังไม่มีพิกัดให้นับในรัศมี:</span> ${unplaced.map(u => say(`${u.th} ใน${provinceWord(row.provinceCode)} ${num(u.count)} ${u.unit}`, u.en && pEn && u.unitEn ? `${u.en} in ${pEn}: ${num(u.count)} ${u.unitEn}` : '')).join(' · ')}</p>` : '';
  return shell(`${radiusChips}
    <p class="locale-lead">ใน ${esc(km(options.radius))} รอบศูนย์</p>
    ${glance}
    ${ahaHead}${ahaHTML}
    ${residentsBlock(meta, row, residentsMeta, residents, residentsState, {compare, compareState, venueOf, residentsMap})}
    ${visitorsBlock(meta, row, visitorsMeta, visitors, visitorsState, {facts, residents, residentsMeta, residentsMap})}
    ${workBlock(meta, row, workMeta, work, workState, {facts, residents, residentsMeta, residentsMap})}
    <h4 class="locale-sub" id="locale-chart-title" tabindex="-1">${icon('rank')}${say('เทียบกับศูนย์อื่นทุกชุดข้อมูล', 'Against other centers, every dataset')}</h4>
    ${uniChips}
    <div class="locale-chart" id="locale-chart" data-radius="${options.radius}" data-universe="${esc(uni.key)}">${ringListHTML(rows, uni, options.radius)}</div>
    ${unplacedHTML}
    ${ringTable(meta, facts, row, uni)}
    ${priorsBlock(meta, row, priors, priorsState, signals, facts)}
    ${areaBlock(meta, facts, row)}
    ${liveBlock(meta, row, facts)}
    ${methodBlock(meta, uni)}
    ${localeDataLine(meta)}`);
}

/** Only the glance (zone #locale-glance, or #locale-glance-head in the venue head), for the app's redraw. */
export function renderLocaleGlance(row, args = {}, opts = {}) {
  if (!inLocaleSet(row)) return '';
  return glanceHTML(args.meta, row, args.facts, args, opts);
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
    element.innerHTML = `<p class="chart-caption">อันดับในรัศมี ${esc(km(options.radius))} เทียบกับ${esc(uni.th)} ${num(uni.n)} แห่ง · เส้นประคือค่ากลาง 50% · ชี้หรือแตะเพื่อดูตัวเลข</p><div class="am-chart" style="height:${height}px" role="img" aria-label="${esc(`อันดับของจำนวนในรัศมี ${km(options.radius)} เทียบกับ${uni.th}`)}"></div><div class="sr-only">${list}</div>`;
    // the caption and label above are DOM text (the shell translates them); the canvas below is written in the page language
    root = makeChartRoot(lib, element.querySelector('.am-chart'), t);
    const chart = root.container.children.push(am5xy.XYChart.new(root, {panX: false, panY: false, wheelX: 'none', wheelY: 'none', layout: root.verticalLayout, paddingLeft: 0, paddingRight: 46, paddingTop: 2, paddingBottom: 2}));
    const yr = am5xy.AxisRendererY.new(root, {inversed: true, minGridDistance: 4, cellStartLocation: 0.2, cellEndLocation: 0.8});
    yr.labels.template.setAll({fontSize: 12, maxWidth: 118, oversizedBehavior: 'truncate', textAlign: 'right', paddingRight: 6});
    yr.grid.template.set('forceHidden', true);
    const yAxis = chart.yAxes.push(am5xy.CategoryAxis.new(root, {categoryField: 'cat', renderer: yr}));
    const xr = am5xy.AxisRendererX.new(root, {minGridDistance: 48, strokeOpacity: 0});
    xr.labels.template.setAll({fontSize: 12, fill: am5.color(t.muted)});
    xr.grid.template.setAll({stroke: am5.color(t.border), strokeOpacity: 0.45});
    const xAxis = chart.xAxes.push(am5xy.ValueAxis.new(root, {min: 0, max: 100, strictMinMax: true, renderer: xr, numberFormat: "#'%'"}));
    const mid = xAxis.createAxisRange(xAxis.makeDataItem({value: 50}));
    mid.get('grid').setAll({stroke: am5.color(t.muted), strokeOpacity: 0.7, strokeDasharray: [3, 3], forceHidden: false});
    // the midline is named in the caption above (a label inside the plot sat on the last row's line)
    mid.get('label').setAll({forceHidden: true});
    const data = rows.map(r => {
      const x = r.count === 0 ? 0 : r.p ?? 0;
      const fill = pctFill(x);
      const extra = chartTipExtra(r);
      const en = LANG === 'en';
      const lines = [en ? `${num(r.count)} ${T(r.unit)} within ${km(options.radius).replace(' กม.', ' km')}` : `${num(r.count)} ${r.unit} ใน ${km(options.radius)}`, T(pctPhrase(r, uni)), ...extra.map(T)];
      return {cat: `${en ? usSpelling(r.labelEn) : r.label}${r.partial ? '*' : ''}`, x, shown: num(r.count), tip: `[bold]${T(r.name)}[/]\n${lines.join('\n')}`,
        aria: `${T(r.name)}: ${lines.slice(0, 2).join(' ')}`, columnSettings: {fill: am5.color(fill)}, dotSettings: {fill: am5.color(fill), stroke: am5.color(r.count === 0 ? COUNT_SCALE.zeroOutline : t.text)}};
    });
    const series = chart.series.push(am5xy.ColumnSeries.new(root, {xAxis, yAxis, valueXField: 'x', categoryYField: 'cat', sequencedInterpolation: false, maskBullets: false}));
    series.columns.template.setAll({height: 5, strokeOpacity: 0.6, stroke: am5.color(t.border), strokeWidth: 1, cornerRadiusTR: 2, cornerRadiusBR: 2, templateField: 'columnSettings',
      tooltipText: '{tip}', focusable: true, focusableGroup: 'locale', hoverOnFocus: true, ariaLabel: '{aria}'});
    series.bullets.push(() => am5.Bullet.new(root, {locationX: 1, sprite: am5.Circle.new(root, {radius: 6, strokeWidth: 1.5, templateField: 'dotSettings', tooltipText: '{tip}'})}));
    series.bullets.push(() => am5.Bullet.new(root, {locationX: 1, sprite: am5.Label.new(root, {text: '{shown}', populateText: true, centerY: am5.p50, centerX: am5.p0, dx: 10, fontSize: 12, fill: am5.color(t.text)})}));
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

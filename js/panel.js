/**
 * Reading panel views as HTML strings. Pure: no DOM access, no map.
 *
 * Every actionable element carries data-action (and data-id) and the app binds one delegated
 * click handler. Actions: select-district · select-venue · select-pending · select-province ·
 * back · explore-top · all-districts · country · open-charts · open-table · open-panel ·
 * clear-filter · set-group · set-status · toggle-pending · select-brand · select-station · tenant-role (data-role) ·
 * more-tenants · more-brand-venues · retry-tenants · retry-index. The back button of a detail view lives
 * in the panel's top row (index.html #panel-back), next to the breadcrumb.
 *
 * Copy (owner instruction 2026-10-25): Aha first, no caveats on screen, natural Thai in the
 * words of the people the product serves — ผู้เช่าและทีมขยายสาขา, ทีม leasing, นักลงทุน
 * (Product Statement §2.1): ย่าน · สถานที่ค้าปลีก · ผู้บริหาร · ร้านข้างใน · กำลังจะเปิด.
 * Methods, bases and limits live in the collapsed evidence list, the help and the docs; one
 * compact provenance line (dataset · source · date · boundary) closes every panel with numbers.
 * Icons are LDS Material Symbols Rounded (FILL 0 / wght 300) next to a text label, never
 * instead of one. Units: แห่ง = one qualified retail venue; แห่ง/ตร.กม. = venues per km².
 * Missing is never zero: an unknown key field says “ยังไม่มีข้อมูล”.
 */
import {GROUPS, groupById, groupLabel, STATUSES, tierReading, contextState, provinceByCode, districtWord, hasPoint, rowProvince, BANGKOK} from './model.js';
import {venueLogoMarkup, getVenueLogo} from './venue-logos.js';
import {formatDensity} from './scales.js';
import {cueSVG} from './cues.js';
import {nameBasis, typeEvidence, operationReading, statusTone, coordinateReading, hoursScope, legacyBasis, storeDataset, hierarchyReading} from './evidence.js';
import {buildingHeightLabel} from './buildings.js';
import {rankTenants, tenantRole, tenantMix, TENANT_ROLE_LABELS, TENANT_PAGE_SIZE, AMENITY_LABELS} from './tenants.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const PCT = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 1});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = n => NUMBER.format(n);
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
export const LUXURY_SITE = 'https://montri-th.github.io/luxurybrands/';
/** CityMETER Fitness opens a venue by its registry id (the same id as here). */
export const FITNESS_SITE = 'https://montri-th.github.io/fitness/';
/** Product title (owner instruction 2026-10-25): TH ศูนย์การค้า · EN Shopping centers. */
export const PRODUCT_TITLE = 'ศูนย์การค้า';
/** Plain word for what the numbers count — shopping centres, markets and other retail venues. */
export const SUBJECT = 'สถานที่ค้าปลีก';

export function link(url, label, cls = 'source-link') {
  const u = safeURL(url);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}

export function thaiDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d} ${months[m - 1]} ${y + 543}`;
}

export const provinceShort = code => (code === BANGKOK ? 'กรุงเทพฯ' : provinceByCode(code)?.th || code || '');
const unitWord = code => districtWord(code);
const KM = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 1});
/** A straight-line distance in words: “250 ม.”, “1.2 กม.” (the method is in the evidence list and the help). */
export const meters = m => (m < 1000 ? `${num(Math.round(m / 10) * 10)} ม.` : `${KM.format(m / 1000)} กม.`);

/** Decorative LDS icon (aria-hidden); the text next to it carries the meaning. */
export const icon = role => `<i class="pictogram pic-${esc(role)}" aria-hidden="true"></i>`;

export function statusPill(row) {
  const label = row.status === 'supply' ? operationReading(row.operationGroup) : STATUSES[row.status];
  const short = row.status === 'supply' ? (['operating_source_evidence', 'official_listing_not_field_verified'].includes(row.operationGroup) ? 'มีหลักฐานว่าเปิด' : row.operationGroup === 'partially_operating' ? 'ทยอยเปิด' : 'รอยืนยันสถานะ') : STATUSES[row.status];
  return `<span class="status-pill tone-${esc(statusTone(row))}" title="${esc(label)}">${esc(short)}</span>`;
}

/** Metric tile with its LDS pictogram; the label stays one or two words. */
export function metricTile(value, label, kind = '') {
  const shown = typeof value === 'number' ? num(value) : esc(value);
  return `<div class="metric${kind ? ` metric-${kind}` : ' metric-plain'}"><i class="metric-symbol pictogram pic-${esc(kind || 'plain')}" aria-hidden="true"></i><strong class="data-number">${shown}</strong><span>${esc(label)}</span></div>`;
}
export const heading = (kind, text, id = '') => `<h3${id ? ` id="${esc(id)}"` : ''}>${icon(kind)}${esc(text)}</h3>`;

export const groupSwatch = g => `<i class="cue-swatch category-${g.series}" aria-hidden="true">${cueSVG(g.cue)}</i>`;

function groupBars(groups, total) {
  if (!groups.length) return '';
  const max = Math.max(1, ...groups.map(g => g.count));
  return `<ul class="mix-list" aria-label="ประเภท (จำนวนสถานที่)">${groups.map(g => `
    <li><button type="button" class="mix-row" data-action="set-group" data-id="${esc(g.id)}" aria-label="${esc(g.th)} ${num(g.count)} แห่ง กดเพื่อดูเฉพาะประเภทนี้">
      <span class="mix-label">${groupSwatch(g)}<span>${esc(g.th)}</span></span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill category-${g.series}" style="width:${Math.max(3, Math.round((g.count / max) * 100))}%"></span></span>
      <span class="mix-value data-number" aria-hidden="true">${num(g.count)}${total ? `<small> ${PCT.format((g.count / total) * 100)}%</small>` : ''}</span></button></li>`).join('')}</ul>`;
}

function venueRow(r, {meta = '', hideStatus = false, count = r.shopCount, unit = 'ร้าน', countLabel = 'ร้านข้างใน'} = {}) {
  const g = groupById(r.group);
  const logo = getVenueLogo(r.id, r.name);
  const sub = [meta || g.th, r.operatorLabel].filter(Boolean).join(' · ');
  const flags = [!hasPoint(r) ? 'ยังไม่มีพิกัด' : '', r.status !== 'supply' && !hideStatus ? STATUSES[r.status] : ''].filter(Boolean).join(' · ');
  return `<li><button type="button" class="venue-row${logo ? ' has-logo' : ''}" data-action="select-venue" data-id="${esc(r.id)}" aria-label="${esc(r.name)} · ${esc(sub)}${flags ? ' · ' + esc(flags) : ''}${count ? ` · ${esc(countLabel)} ${num(count)}` : ''}">
    ${logo ? venueLogoMarkup(r.id, {name: r.name, size: 'sm'}) : groupSwatch(g)}<span class="venue-name">${esc(r.name)}<small>${esc(sub)}${flags ? ` · <em>${esc(flags)}</em>` : ''}</small></span>${count ? `<span class="venue-count data-number" title="${esc(countLabel)}">${num(count)}<small>${esc(unit)}</small></span>` : '<span></span>'}</button></li>`;
}

function venueList(rows, {limit = 12, label = '', hideStatus = false} = {}) {
  if (!rows.length) return '';
  return `<ul class="venue-list"${label ? ` aria-label="${esc(label)}"` : ''}>${rows.slice(0, limit).map(r => venueRow(r, {hideStatus})).join('')}</ul>${rows.length > limit ? `<p class="hint"><button type="button" class="link-button" data-action="open-table">อีก ${num(rows.length - limit)} แห่งในตาราง</button></p>` : ''}`;
}

function statusLists(planned, closed) {
  if (!planned.length && !closed.length) return '';
  return `${planned.length ? `<section class="panel-section" aria-labelledby="upcoming-title"><div class="section-heading">${heading('upcoming', 'กำลังจะเปิด', 'upcoming-title')}<span class="hint">${num(planned.length)} แห่ง</span></div>${venueList(planned, {limit: 6, hideStatus: true})}</section>` : ''}
    ${closed.length ? `<section class="panel-section" aria-labelledby="closed-title"><div class="section-heading">${heading('closed', 'ปิดแล้ว', 'closed-title')}<span class="hint">${num(closed.length)} แห่ง</span></div>${venueList(closed, {limit: 6, hideStatus: true})}</section>` : ''}`;
}

/** Data line: dataset · source · date · boundary — carried by every panel that shows numbers. */
export function dataLine(asOf, shops = null, transit = null) {
  return `<p class="hint panel-foot">${PRODUCT_TITLE} · CityMETER research · ตรวจถึง ${esc(thaiDate(asOf))}${shops ? ` · ${shopSource(shops)}` : ''}${transit ? ` · ${transitSource(transit)}` : ''} · ขอบเขตเขต/อำเภอ กรมแผนที่ทหาร (RTSD) ชุดเดียวกับ CityMETER · <a href="DATA_METHOD.md" target="_blank" rel="noopener">ที่มาและวิธี</a></p>`;
}

/** Where the rail figures come from (D33): CityMETER · Transit, operating stations, the release date (data/stations.json meta). */
function transitSource(meta = {}) {
  return `สถานีรถไฟฟ้าที่เปิดให้บริการจาก CityMETER · Transit${meta.asOf ? ` ข้อมูล ${esc(thaiDate(meta.asOf))}` : ''}`;
}

/**
 * D33 rail line of the first finding: the share of the focus districts' venues within 500 m (straight line) of an
 * operating station, against the rest of the province. Null when no venue of the province is near a station (a province
 * without rail) or the stations did not load.
 */
export function railReading(insight) {
  const r = insight?.rail;
  if (!r || !r.focus.total || !(r.focus.near + r.rest.near)) return null;
  const pct = x => Math.round((x.near / x.total) * 100);
  return {focus: pct(r.focus), focusCount: r.focus.total, rest: r.rest.total ? pct(r.rest) : null};
}

/** Where the shop numbers come from (D22): the shop-list index meta — dataset count and check dates. */
function shopSource(meta = {}) {
  const sets = Object.keys(meta.datasets || {}).length;
  const range = meta.checkedFrom && meta.checkedTo ? `${thaiDate(meta.checkedFrom)}–${thaiDate(meta.checkedTo)}` : thaiDate(meta.checkedTo || '');
  return `ร้านข้างในจากรายชื่อร้าน${sets ? ` ${num(sets)} ชุดข้อมูล` : ''}${range ? ` ตรวจ ${esc(range)}` : ''}`;
}

/** Data line of the shop lists (brand view, nearby centres): dataset · source · check dates · boundary. */
export function tenantDataLine(meta = {}) {
  const sets = Object.keys(meta.datasets || {}).length;
  const range = meta.checkedFrom && meta.checkedTo ? `${thaiDate(meta.checkedFrom)}–${thaiDate(meta.checkedTo)}` : thaiDate(meta.checkedTo || '');
  return `<p class="hint panel-foot">รายชื่อร้านข้างใน · CityMETER research${sets ? ` ${num(sets)} ชุดข้อมูลร้านค้า` : ''}${range ? ` · ตรวจ ${esc(range)}` : ''} · ขอบเขต: สถานที่ค้าปลีกที่ผ่านนิยามในทะเบียนศูนย์การค้า · <a href="DATA_METHOD.md" target="_blank" rel="noopener">ที่มาและวิธี</a></p>`;
}

/** A brand as a button that opens where it is listed (brand view). */
function brandRow(b, sub) {
  return `<li><button type="button" class="brand-row" data-action="select-brand" data-id="${esc(b.key)}" aria-label="${esc(b.name)} · ${esc(sub)} · ดูว่าอยู่ที่ไหนบ้าง"><span class="brand-name">${esc(b.name)}<small>${esc(sub)}</small></span>${icon('next')}</button></li>`;
}
const brandPill = b => `<button type="button" class="brand-pill" data-action="select-brand" data-id="${esc(b.key)}">${esc(b.name)}</button>`;
const kmText = km => `${km.toFixed(1)} กม.`;

/* ---------- Overview ---------- */

/** How many times denser the focus districts are than the province as a whole (share ÷ area share). */
export function densityRatio(insight) {
  return insight?.areaShare > 0 ? insight.share / insight.areaShare : 0;
}

/**
 * focusMode: 'auto' (first-Aha districts carry the detail), 'explicit' (chosen districts) or
 * 'none' (every district of the reading in detail).
 */
export function renderOverview({insight, model, focusMode = 'auto', readCode = '', national = true, subject = SUBJECT, asOf = '', provinces = [], shops = null, transit = null}) {
  const s = model.summary;
  const count = insight.districts.length;
  const pCode = insight.province;
  const word = unitWord(pCode);
  const share = Math.round(insight.share);
  let aha;
  if (!s.venues && !model.scope.venues) {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">${icon('idea')}ข้อค้นพบ</p><h2>ไม่พบสถานที่ในตัวกรองนี้</h2>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="all" class="btn">ล้างตัวกรอง</button></div></section>`;
  } else if (!count) {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">${icon('idea')}ข้อค้นพบ</p><h2>${num(model.scope.venues)} แห่งในตัวกรองนี้ยังไม่มีพิกัด</h2>
      <div class="aha-actions"><button type="button" data-action="open-table" class="btn">${icon('table')}ดูรายการ</button><button type="button" data-action="clear-filter" data-id="all" class="btn quiet">ล้างตัวกรอง</button></div></section>`;
  } else if (focusMode === 'explicit') {
    aha = `<section class="aha is-focused" aria-label="ข้อค้นพบ"><p class="eyebrow">กำลังดู ${num(count)} ${word}</p>
      <h2>${insight.districts.map(d => esc(d.th)).join(' · ')}</h2>
      <p class="aha-copy"><strong class="data-number">${num(insight.count)}</strong> จาก ${num(insight.total)} แห่งของ${esc(provinceShort(pCode))}</p>
      <div class="aha-actions"><button type="button" data-action="all-districts" data-id="${esc(pCode)}" class="btn">ดูทุก${word}</button><button type="button" data-action="open-charts" class="btn quiet">${icon('chart')}เทียบพื้นที่</button></div></section>`;
  } else {
    const names = insight.districts.map(d => `<button type="button" class="link-button" data-action="select-district" data-id="${esc(d.code)}">${esc(d.th)}</button>`).join(' · ');
    const actions = focusMode === 'auto'
      ? `<button type="button" data-action="all-districts" data-id="${esc(pCode)}" class="btn">ดูทุก${word}ใน${esc(provinceShort(pCode))}</button><button type="button" data-action="country" class="btn quiet">${icon('country')}ทั้งประเทศ</button>`
      : `<button type="button" data-action="explore-top" class="btn primary">ดู ${num(count)} ${word}นี้</button>${readCode ? `<button type="button" data-action="country" class="btn quiet">${icon('country')}ทั้งประเทศ</button>` : ''}`;
    // D33: districts ranked by count, so the first one is already the country's top; D1 (density) still names it.
    const top = insight.rank !== 'count' && insight.topCount && insight.topCount.count > 0 && national ? insight.topCount : null;
    const rail = railReading(insight);
    aha = `<section class="aha${focusMode === 'auto' ? ' is-auto' : ''}" aria-label="ข้อค้นพบ"><p class="eyebrow">${icon('idea')}ข้อค้นพบแรก</p>
      <h2><span class="aha-number data-number">${num(share)}%</span><span class="aha-headline">ของ${esc(subject)}ใน${esc(provinceShort(pCode))} อยู่ใน ${num(count)} ${word}นี้</span></h2>
      <p class="aha-copy">${names}<br><strong class="data-number">${num(insight.count)}</strong> จาก ${num(insight.total)} แห่ง บนพื้นที่ <strong class="data-number">${PCT.format(insight.areaShare)}%</strong> ของ${esc(provinceShort(pCode))}</p>
      ${rail ? `<p class="aha-rail"><strong class="data-number">${num(rail.focus)}%</strong> ของ ${num(rail.focusCount)} แห่งนี้อยู่ในระยะ 500 ม. จากสถานีรถไฟฟ้า${rail.rest !== null ? ` · ที่อื่นใน${esc(provinceShort(pCode))} <strong class="data-number">${num(rail.rest)}%</strong>` : ''}</p>` : ''}
      ${top ? `<p class="aha-secondary">มากที่สุดในประเทศ: <button type="button" class="link-button" data-action="select-district" data-id="${esc(top.code)}">${esc(unitWord(top.province))}${esc(top.th)}</button> <span class="data-number">${num(top.count)}</span> แห่ง</p>` : ''}
      <div class="aha-actions">${actions}<button type="button" data-action="open-charts" class="btn quiet">${icon('chart')}เทียบพื้นที่</button></div></section>`;
  }
  const narrowed = focusMode !== 'none' && count > 0 && s.venues !== model.scope.venues;
  const metrics = `<section class="metrics" aria-label="${narrowed ? 'ตัวเลขของพื้นที่ที่กำลังดู' : 'ตัวเลขของข้อมูลที่เลือก'}">
    ${metricTile(s.venues, 'แห่ง', 'venue')}
    ${metricTile(s.districts, readCode || narrowed ? unitWord(readCode || pCode) : 'เขต/อำเภอ', 'area')}
    ${metricTile(s.operators, 'ผู้บริหาร', 'operator')}
    ${metricTile(s.stores ?? '—', 'ร้านข้างใน', 'store')}
  </section>`;
  const mix = model.groups.length ? `<section class="panel-section" aria-labelledby="mix-title"><div class="section-heading">${heading('segment', 'ประเภท', 'mix-title')}<span class="hint">${num(s.venues)} แห่ง</span></div>${groupBars(model.groups, s.venues)}</section>` : '';
  let areaList = '';
  if (!readCode && provinces.length > 1) {
    areaList = `<section class="panel-section" aria-labelledby="province-title"><div class="section-heading">${heading('province', 'จังหวัด', 'province-title')}<span class="hint">${num(provinces.length)} จังหวัด</span></div>
      <ul class="province-list">${provinces.slice(0, 77).map(p => `<li><button type="button" class="province-row" data-action="select-province" data-id="${esc(p.code)}" aria-label="${esc(p.name)} ${num(p.count)} แห่ง กดเพื่อดูจังหวัด"><i class="province-swatch" style="background:${esc(p.fill)}" aria-hidden="true"></i><span class="province-name">${esc(p.name)}</span><span class="province-count data-number">${num(p.count)}<small>แห่ง</small></span></button></li>`).join('')}</ul></section>`;
  } else if (model.ranking.length) {
    const word2 = unitWord(readCode || pCode);
    const ranking = model.ranking.slice(0, 10);
    const max = Math.max(...ranking.map(a => a.density)) || 1;
    areaList = `<section class="panel-section" aria-labelledby="rank-title"><div class="section-heading">${heading('rank', `${word2}ที่แน่นที่สุด`, 'rank-title')}<span class="hint">แห่ง/ตร.กม.</span></div>
      <ol class="rank-list">${ranking.map((a, i) => `<li><button type="button" class="rank-row" data-action="select-district" data-id="${esc(a.id)}" aria-label="อันดับ ${i + 1} ${esc(a.label)} ${esc(formatDensity(a.density))} แห่งต่อตารางกิโลเมตร ${num(a.count)} แห่ง">
        <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
        <span class="rank-name">${esc(a.name)}<small>${num(a.count)} แห่ง · ${esc(formatDensity(a.areaKm2))} ตร.กม.</small></span>
        <span class="rank-track" aria-hidden="true"><span class="rank-fill" style="width:${Math.max(3, Math.round((a.density / max) * 100))}%;background:${esc(a.fill)}"></span></span>
        <span class="rank-value data-number" aria-hidden="true">${esc(formatDensity(a.density))}</span></button></li>`).join('')}</ol></section>`;
  }
  // Rows that no district holds (no point, or a point outside every boundary line): named once, listed in the table.
  const unlocated = model.unlocated.length ? `<p class="hint">อีก ${num(model.unlocated.length)} แห่งยังระบุ${readCode ? unitWord(readCode) : 'เขต/อำเภอ'}ไม่ได้ · <button type="button" class="link-button" data-action="open-table">ดูในตาราง</button></p>` : '';
  return `${aha}${metrics}${mix}${areaList}${unlocated}${statusLists(model.planned, model.closed)}${dataLine(asOf, shops, focusMode !== 'explicit' && railReading(insight) ? transit : null)}`;
}

/* ---------- Search results ---------- */

export function renderSearch(results, {pending = null, districts = null, asOf = '', brands = null, shops = null} = {}) {
  const pendingRow = i => {
    const r = pending?.rows?.[i];
    if (!r) return '';
    const g = groupById(r[6]);
    const d = r[5] ? districts?.get(r[5]) : null;
    const stateText = contextState(r[7] === 'reviewed');
    return `<li><button type="button" class="venue-row is-pending" data-action="select-pending" data-id="${esc(i)}" aria-label="${esc(r[1])} · ${esc(stateText)} · ไม่นับ"><i class="pending-swatch" aria-hidden="true"></i><span class="venue-name">${esc(r[1])}<small>${esc(stateText)} · ${esc(g.th)}${d ? ` · ${esc(unitWord(d.province))}${esc(d.th)}` : ''}</small></span><span></span></button></li>`;
  };
  const brandHits = brands?.total || 0;
  const total = results.qualifiedTotal + results.components.length + results.pendingTotal + brandHits;
  const counts = [results.qualifiedTotal || !brandHits ? `${num(results.qualifiedTotal)} แห่ง${results.otherStatus ? ` (กำลังจะเปิดหรือปิดแล้ว ${num(results.otherStatus)})` : ''}` : '',
    brandHits ? `แบรนด์ ${num(brandHits)}` : '', results.components.length ? `ไม่นับแยก ${num(results.components.length)}` : '',
    results.pendingTotal ? `ยังยืนยันไม่ได้ ${num(results.pendingTotal)}` : ''].filter(Boolean).join(' · ');
  // Brands of the shop lists: where each is listed (brand view). Shown first when a name is both a brand and a place.
  const brandSection = brandHits ? `<section class="panel-section" aria-labelledby="brand-hits"><div class="section-heading">${heading('brand', 'แบรนด์ในรายชื่อร้าน', 'brand-hits')}<span class="hint">${num(brandHits)}</span></div>
      <ul class="brand-list">${brands.brands.map(b => brandRow(b, `${TENANT_ROLE_LABELS[b.role] || ''} · พบใน ${num(b.venues.size)} สถานที่`)).join('')}</ul>${brandHits > brands.brands.length ? `<p class="hint">แสดง ${num(brands.brands.length)} แบรนด์แรก</p>` : ''}</section>` : '';
  return `<section class="aha is-focused" aria-label="ผลค้นหา"><p class="eyebrow">${icon('search')}ผลค้นหา</p><h2>“${esc(results.query)}”</h2>
      <p class="aha-copy">${total ? counts : 'ไม่พบชื่อ แบรนด์ หรือรหัสนี้'}</p>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="search" class="btn">ล้างคำค้น</button></div></section>
    ${brandSection}
    ${results.qualified.length ? `<section class="panel-section"><div class="section-heading">${heading('venue', 'สถานที่')}<span class="hint">${num(results.qualifiedTotal)}</span></div>${venueList(results.qualified, {limit: 30})}</section>` : ''}
    ${results.components.length ? `<section class="panel-section"><div class="section-heading">${heading('building', 'พื้นที่ย่อยและรายการที่อาจซ้ำ')}<span class="hint">ไม่นับแยก</span></div>${venueList(results.components, {limit: 30})}</section>` : ''}
    ${results.pending.length ? `<section class="panel-section"><div class="section-heading"><h3><i class="pending-swatch" aria-hidden="true"></i>ยังยืนยันไม่ได้</h3><span class="hint">ไม่นับ · ${num(results.pendingTotal)}</span></div><ul class="venue-list">${results.pending.map(pendingRow).join('')}</ul>${results.pendingTotal > results.pending.length ? `<p class="hint">แสดง ${num(results.pending.length)} รายการแรก</p>` : ''}</section>` : ''}
    ${dataLine(asOf, shops)}`;
}

/* ---------- District ---------- */

export function renderDistrict(p, {asOf = '', shops = null} = {}) {
  if (!p) return '';
  const word = unitWord(p.province);
  return `<section class="detail-head">
      <p class="eyebrow">${esc(word)}${p.rank ? ` · แน่นอันดับ ${num(p.rank)} จาก ${num(p.of)} ของ${esc(provinceShort(p.province))}` : ''}</p>
      <h2>${esc(p.label)}</h2><p class="subtle">${esc(p.provinceName)} · ${esc(formatDensity(p.areaKm2))} ตร.กม.</p>
      <div class="metrics compact">${metricTile(p.summary.venues, 'แห่ง', 'venue')}${metricTile(formatDensity(p.density), 'แห่ง/ตร.กม.', 'area')}${metricTile(p.summary.operators, 'ผู้บริหาร', 'operator')}${metricTile(p.summary.stores ?? '—', 'ร้านข้างใน', 'store')}</div>
      <div class="detail-actions"><button type="button" class="btn" data-action="open-table">${icon('table')}รายการ</button><button type="button" class="btn quiet" data-action="open-charts">${icon('chart')}เทียบ${esc(word)}</button></div>
    </section>
    ${p.groups.length ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'ประเภท')}<span class="hint">แห่ง</span></div>${groupBars(p.groups, p.summary.venues)}</section>` : ''}
    <section class="panel-section"><div class="section-heading">${heading('venue', `สถานที่ใน${word}นี้`)}<span class="hint">${num(p.venues.length)} แห่ง</span></div>${p.venues.length ? venueList(p.venues, {limit: 20}) : '<p class="hint">ไม่มีสถานที่ในตัวกรองนี้ (0 แห่ง)</p>'}</section>
    ${p.operators.length ? `<section class="panel-section"><div class="section-heading">${heading('operator', 'ผู้บริหาร')}<span class="hint">แห่ง</span></div><ul class="plain-list">${p.operators.map(o => `<li><span>${esc(o.label)}</span><span class="data-number">${num(o.count)}</span></li>`).join('')}</ul></section>` : ''}
    ${statusLists(p.planned, p.closed)}
    ${dataLine(asOf, shops)}`;
}

/* ---------- Venue ---------- */

/** Centre facilities (D22): the facility's own name from the official source, never a policy claim. */
function amenityFacts(list = []) {
  return list.map(a => `มี${esc(AMENITY_LABELS[a.kind] || a.kind)}${a.name ? ` · ${esc(a.name)}` : ''}`).join('<br>');
}

function fact(role, label, value) {
  return value ? `<dt>${icon(role)}${esc(label)}</dt><dd>${value}</dd>` : '';
}
const missing = '<span class="hint">ยังไม่มีข้อมูล</span>';

/**
 * Size as figures only (decision D3: estimates stay in this panel); the method sits in the
 * evidence list. `shown` lists the reported figures already drawn as key-figure tiles.
 */
function sizeFacts(size, {shown = []} = {}) {
  if (!size) return '';
  const out = [];
  const m2 = v => `${num(v)} ตร.ม.`;
  const reported = size.glaReported || size.gfaReported || size.siteAreaReported || size.floorsReported || size.tenantsReported;
  if (size.glaReported && !shown.includes('gla')) out.push(`พื้นที่เช่า ${m2(size.glaReported)}`);
  if (size.gfaReported) out.push(`พื้นที่อาคาร ${m2(size.gfaReported)}`);
  if (size.siteAreaReported) out.push(`ที่ดิน ${m2(size.siteAreaReported)}`);
  if (size.floorsReported && !shown.includes('floors')) out.push(`${num(size.floorsReported)} ชั้น`);
  if (size.tenantsReported) out.push(`ร้านในไดเรกทอรี ${num(size.tenantsReported)} ร้าน${size.tenantsDate ? ` (${esc(thaiDate(size.tenantsDate))})` : ''}`);
  if (!reported && size.legacy && (size.legacy.gla || size.legacy.gfa)) {
    const parts = [size.legacy.gla ? `พื้นที่เช่าราว ${m2(size.legacy.gla)}` : '', size.legacy.gfa ? `พื้นที่อาคารราว ${m2(size.legacy.gfa)}` : ''].filter(Boolean).join(' · ');
    out.push(`<span class="estimate">${parts}</span>`);
  }
  return out.map(x => `<span class="size-line">${x}</span>`).join('');
}

/** Opening hours without a trailing source note in brackets; the full text stays in the evidence list. */
export function hoursShort(text) {
  const full = String(text || '').trim();
  const short = full.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return /\d/.test(short) ? short : full;
}

/** tel: link for the first phone number in a field (visible text unchanged). */
function phoneLink(phone) {
  const text = String(phone || '').trim();
  const first = text.split(/[,;/]| หรือ /)[0].replace(/[^\d+]/g, '');
  return first.replace(/\D/g, '').length >= 6 ? `<a class="chip-link" href="tel:${esc(first)}">${icon('contact')}${esc(text)}</a>` : (text ? `<span class="chip-link is-text">${icon('contact')}${esc(text)}</span>` : '');
}

function evidenceRows(row, d, {buildingNote = '', addressNote = '', tenants = null, site = null, transit = null} = {}) {
  const ev = d?.ev || {};
  const rowsHtml = [];
  const item = (label, text, url, date, extra = '') => rowsHtml.push(`<li><span class="ev-label">${esc(label)}</span><span class="ev-text">${esc(text || 'ตามแหล่งที่บันทึก')}${date ? ` · ${esc(thaiDate(date))}` : ''}${extra}</span>${url ? link(url, 'แหล่ง') : '<span class="hint">ไม่มีลิงก์สาธารณะ</span>'}</li>`);
  const note = (label, text) => rowsHtml.push(`<li><span class="ev-label">${esc(label)}</span><span class="ev-text">${text}</span></li>`);
  item('ชื่อไทย', nameBasis(ev.nameTh?.basis), ev.nameTh?.url);
  if (d?.nameEn && d.nameEn !== d.nameTh) item('ชื่ออังกฤษ', nameBasis(ev.nameEn?.basis), ev.nameEn?.url);
  item('ประเภท', typeEvidence(ev.type?.status), ev.type?.url, ev.type?.checkedOn);
  if (row.groupBasis === 'owner') note('กลุ่มบนหน้าจอ', `เจ้าของข้อมูลระบุว่าเป็นศูนย์การค้า · ${esc(thaiDate('2026-10-25'))}`);
  // D36: a retail component with a name of its own reads as the place it is (the registry keeps its component type).
  if (row.groupBasis === 'retail-identity') note('กลุ่มบนหน้าจอ', 'ทะเบียนจัดเป็นพื้นที่ค้าปลีกในอาคารหรือโครงการ · บนแผนที่แสดงตามลักษณะสถานที่ซึ่งมีชื่อของตัวเอง');
  item('ผ่านนิยาม', tierReading(row), ev.qualification?.url);
  if (row.countBasis === 'component-without-qualified-parent') note('การนับ', 'นับเป็นสถานที่ของตัวเอง · โครงการแม่ไม่อยู่ในชุดที่ผ่านนิยาม');
  if ((row.children || []).length) note('การนับ', 'นับครั้งเดียว ไม่บวกพื้นที่ย่อย');
  item('สถานะ', operationReading(row.operationGroup), ev.operation?.url);
  if (d?.hours && (hoursScope(d.hoursScope) || hoursShort(d.hours) !== String(d.hours).trim())) note('เวลาเปิด', [hoursShort(d.hours) !== String(d.hours).trim() ? esc(d.hours) : '', esc(hoursScope(d.hoursScope))].filter(Boolean).join(' · '));
  if (d?.yearOpened || d?.openedDate) note('เปิดเมื่อ', d.openedDate ? 'วันที่แหล่งรายงาน' : 'ปีที่แหล่งรายงาน');
  const legacy = d?.size?.legacy;
  if (legacy && (legacy.gla || legacy.gfa)) note('ขนาด', `ค่าประมาณจากทะเบียนเดิม ไม่ใช่ GLA ทางการ · วิธี: ${esc(legacyBasis(legacy.basis))}${legacy.basis ? ` <code>${esc(legacy.basis)}</code>` : ''}`);
  if (hasPoint(row)) item('พิกัด', coordinateReading(d?.coordinateRole, d?.coordinateStatus), ev.coordinate?.url, '', ` · <span class="data-number">${row.lat.toFixed(6)}, ${row.lon.toFixed(6)}</span>${addressNote}`);
  else item('พิกัด', 'ยังไม่มีพิกัด', '');
  if (buildingNote) note('อาคาร', buildingNote);
  if (site) note('ไซต์', `${esc(site.source)}${site.url ? ` · ${link(site.url, siteLinkLabel(site.url))}` : ''}${site.checkedOn ? ` · ตรวจ ${esc(thaiDate(site.checkedOn))}` : ''}`);
  if (row.rail && transit) note('รถไฟฟ้า', `สถานีที่เปิดให้บริการที่ใกล้ที่สุด วัดเป็นเส้นตรงระหว่างจุดอ้างอิง ไม่ใช่ระยะเดิน · ${esc(row.rail.station.lines || '')} · CityMETER · Transit ${esc(transit.release || '')}${transit.asOf ? ` ข้อมูล ${esc(thaiDate(transit.asOf))}` : ''} · ${link(transit.source, 'แหล่ง')}`);
  item('ตัวตน', 'แหล่งยืนยันตัวตนสถานที่', ev.identity?.url);
  for (const a of row._amenities || []) item('สิ่งอำนวยความสะดวก', `${AMENITY_LABELS[a.kind] || a.kind} · ${a.basis === 'owner_reported' ? 'เจ้าของข้อมูลแจ้ง' : 'หน้าเว็บของศูนย์'}`, a.sourceUrl, a.checkedOn);
  if (tenants?.roster) {
    note('รายชื่อร้าน', `รายการที่เชื่อมสถานที่แล้วจากชุดข้อมูลในทะเบียน · ตรวจทะเบียน ${esc(thaiDate(tenants.roster.meta?.asOf || ''))} · รายชื่ออาจยังไม่ครบทั้งศูนย์และไม่ได้ยืนยันว่าทุกร้านเปิดอยู่วันนี้ ลิงก์ข้างชื่อร้านเปิดหลักฐานต้นทางตามวันที่ของแต่ละรายการ`);
    const ownerFacts = (tenants.roster.items || []).flatMap(item => [item, ...(item.corroboratingMembershipEvidence || [])])
      .filter(item => item.sourceRole === 'owner_confirmed_tenant_state');
    if (ownerFacts.length) note('คำยืนยันเจ้าของข้อมูล', ownerFacts.map(item => `${esc(item.displayName || item.name)} · ${esc(thaiDate(item.ownerAssertionDate))} · ${item.status === 'owner_reported_open' ? 'เปิดอยู่ตามคำยืนยันเจ้าของข้อมูล' : 'ยืนยันชื่อหรือสถานที่ โดยสถานะเปิดปัจจุบันยังไม่ยืนยัน'}`).join('<br>') + ' · เป็นคำยืนยันเจ้าของข้อมูล แยกจากการตรวจเว็บไซต์หรือสำรวจหน้างาน');
    note('ลำดับร้าน', 'ประเมินบทบาทต่อศูนย์: ร้านหลักที่แหล่งระบุ → ร้านที่ตรงกับเอกลักษณ์หรือรูปแบบศูนย์ → ห้างและความบันเทิง ซูเปอร์มาร์เก็ต ร้านปลายทาง อาหาร และบริการ ตามบริบทของศูนย์ บทบาทเดียวกันเรียงตามชื่อ ไม่ใช่อันดับจากยอดขายหรือจำนวนผู้เข้าชม โลโก้ไม่เพิ่มลำดับ');
    const profile = tenants.roster.profile;
    if (profile?.sourceUrl) item('เอกลักษณ์ศูนย์', profile.label, profile.sourceUrl, profile.checkedOn);
    note('นับร้าน', 'หนึ่งรายการคือหนึ่งสาขาที่แหล่งทางการลงไว้ แบรนด์เดียวมีได้หลายสาขาในศูนย์เดียว แหล่งสองแห่งที่ระบุสาขาเดียวกันนับครั้งเดียว ตัวเลขร้านข้างในของแผนที่ ตาราง และพื้นที่ใช้รายชื่อชุดเดียวกันนี้');
  }
  if (ev.research?.urls?.length) rowsHtml.push(`<li><span class="ev-label">ค้นเพิ่ม</span><span class="ev-text">แหล่งทางการที่ใช้เติมข้อมูล${ev.research.checkedOn ? ` · ${esc(thaiDate(ev.research.checkedOn))}` : ''}</span><span class="ev-links">${ev.research.urls.slice(0, 4).map((u, i) => link(u, `${i + 1}`)).join(' ')}</span></li>`);
  return rowsHtml.join('');
}

/** Ten names at a time. The complete roster and the historical aggregate are separate populations. */
export function renderTenantList(row, selection) {
  if (selection?.error) return `<p class="hint">โหลดรายชื่อร้านไม่สำเร็จ <button type="button" class="link-button" data-action="retry-tenants" data-id="${esc(row.id)}">ลองอีกครั้ง</button></p>`;
  if (!selection?.roster) return '<p class="hint" role="status">กำลังโหลดรายชื่อร้าน…</p>';
  const ranked = rankTenants(selection.roster.items || [], row, selection.roster.profile);
  if (!ranked.length) return '<p class="hint">ยังไม่มีรายชื่อร้านในข้อมูลที่เชื่อมไว้</p>';
  // One role of the list (mix chips); a role that is not in this list shows every shop.
  const role = selection.role && ranked.some(item => tenantRole(item) === selection.role) ? selection.role : '';
  const items = role ? ranked.filter(item => tenantRole(item) === role) : ranked;
  const limit = Math.max(TENANT_PAGE_SIZE, selection.limit || TENANT_PAGE_SIZE);
  const shown = items.slice(0, limit);
  const logoMarkup = item => {
    const logo = item.logo;
    const valid = logo && /^assets\/tenant-logos\/[A-Za-z0-9._-]+\.(svg|png|jpe?g|webp|gif)$/i.test(logo.file || '') && /^[a-f0-9]{64}$/.test(logo.sha256 || '');
    const backing = /^#[0-9a-f]{6}$/i.test(logo?.background || '') ? logo.background : '#E5E9E6';
    return `<span class="tenant-logo" aria-hidden="true"${valid ? ` style="--tenant-logo-bg:${esc(backing)}"` : ''}>${icon('store')}${valid ? `<img src="${esc(logo.file)}" alt="" loading="lazy" decoding="async"${logo.width > 0 && logo.height > 0 ? ` width="${Math.round(logo.width)}" height="${Math.round(logo.height)}"` : ''}>` : ''}</span>`;
  };
  return `<p class="hint tenant-order">${role ? `${esc(TENANT_ROLE_LABELS[role])} · ` : ''}เรียงตามบทบาทต่อศูนย์</p>
    <ol class="tenant-list" aria-label="ร้านข้างใน ${esc(row.name)}${role ? ` · ${esc(TENANT_ROLE_LABELS[role])}` : ''}">${shown.map((item, index) => {
      const name = item.displayName || item.brand || item.name;
      const position = item.unitFloor && !/ชั้น|ห้อง|floor|unit/i.test(item.unitFloor) ? `ตำแหน่ง ${item.unitFloor}` : item.unitFloor;
      const sub = [TENANT_ROLE_LABELS[tenantRole(item)], item.displayQualifier, position || item.branch].filter(Boolean).filter(value => value !== name);
      const status = /closure_conflict/.test(item.status || '') ? 'สถานะขัดกัน' : /status_recheck_required/.test(item.status || '') ? 'สถานะรอตรวจ' : ['closed_source_evidence', 'permanently_closed'].includes(item.status) ? 'ปิดตามหลักฐาน' : '';
      const source = safeURL(item.sourceUrl);
      const checked = item.checkedOn ? ` · ตรวจ ${thaiDate(item.checkedOn)}` : '';
      return `<li class="tenant-row" data-tenant-index="${index}" data-tenant-id="${esc(item.id)}" tabindex="-1">${logoMarkup(item)}<span class="tenant-name"><strong>${esc(name)}</strong><small>${sub.map(esc).join(' · ')}${status ? ` · ${esc(status)}` : ''}</small></span>${source ? `<a class="source-link tenant-source" href="${esc(source)}" target="_blank" rel="noopener" title="${esc(name + checked)}" aria-label="${esc('หลักฐาน ' + name + checked)}">แหล่ง</a>` : ''}</li>`;
    }).join('')}</ol>
    <div class="tenant-pagination"><span class="hint">แสดง ${num(shown.length)} จาก ${num(items.length)} ร้าน</span>${shown.length < items.length ? `<button type="button" class="btn" data-action="more-tenants" data-id="${esc(row.id)}" aria-label="ดูเพิ่มอีก ${num(Math.min(TENANT_PAGE_SIZE, items.length - shown.length))} ร้านใน ${esc(row.name)}">ดูเพิ่ม ${num(Math.min(TENANT_PAGE_SIZE, items.length - shown.length))} ร้าน</button>` : ''}</div>`;
}

/** Shop mix of one venue: one chip per role with its count; a chip shows only that role in the list. */
export function renderTenantMix(row, selection) {
  const items = selection?.roster?.items || [];
  const mix = tenantMix(items);
  if (mix.length < 2) return '';
  const active = mix.some(m => m.role === selection.role) ? selection.role : '';
  const chip = (role, label, count) => `<button type="button" class="chip-toggle mix-chip" data-action="tenant-role" data-id="${esc(row.id)}" data-role="${esc(role)}" aria-pressed="${active === role}">${esc(label)} <span class="data-number">${num(count)}</span></button>`;
  return `<div class="tenant-mix" role="group" aria-label="ดูร้านข้างในตามหมวด">${chip('', 'ทั้งหมด', items.length)}${mix.map(m => chip(m.role, TENANT_ROLE_LABELS[m.role] || m.role, m.count)).join('')}</div>`;
}

/**
 * Nearby centres (tenants.js#comparePeers): the centres with a shop list within the radius, the roles and
 * brands their lists have that this list does not, and what only this list has. For leasing teams: who is
 * next door and which names to talk to. Counts read “in the list”.
 */
export function renderPeers(cmp, row) {
  if (!cmp) return '';
  const title = `<div class="section-heading">${heading('area', 'เทียบศูนย์ใกล้เคียง', 'peer-title')}<span class="hint">${cmp.peers.length ? `${num(cmp.peers.length)} แห่งในรัศมี ${num(cmp.radiusKm)} กม.` : `รัศมี ${num(cmp.radiusKm)} กม.`}</span></div>`;
  if (!cmp.peers.length) return `<section class="panel-section peer-section" aria-labelledby="peer-title">${title}<p class="hint">ยังไม่มีศูนย์อื่นที่มีรายชื่อร้านในรัศมีนี้</p></section>`;
  const peers = `<ul class="venue-list peer-list">${cmp.peers.map(p => venueRow(p.row, {meta: `${kmText(p.km)} · ${groupById(p.row.group).th}`, hideStatus: true, count: p.items, countLabel: 'ร้านในรายชื่อ'})).join('')}</ul>`;
  const roles = cmp.missingRoles.length ? `<p class="peer-label">หมวดที่ศูนย์ใกล้เคียงมี แต่ยังไม่อยู่ในรายชื่อของที่นี่</p>
      <p class="peer-roles">${cmp.missingRoles.map(m => `<span class="peer-role">${esc(TENANT_ROLE_LABELS[m.role] || m.role)} <span class="data-number">${num(m.peers)}</span><small> แห่ง</small></span>`).join('')}</p>` : '';
  const need = Math.min(2, cmp.peers.length);
  const brands = cmp.missingBrands.length ? `<p class="peer-label">แบรนด์ที่อยู่ในศูนย์ใกล้เคียง${need > 1 ? `ตั้งแต่ ${num(need)} แห่ง` : ''} แต่ยังไม่อยู่ในรายชื่อของที่นี่</p>
      <ul class="brand-list">${cmp.missingBrands.slice(0, 10).map(m => brandRow(m.brand, `${TENANT_ROLE_LABELS[m.brand.role] || ''} · อยู่ใน ${num(m.peers)} จาก ${num(cmp.peers.length)} แห่งใกล้เคียง`)).join('')}</ul>
      ${cmp.missingBrands.length > 10 ? `<p class="hint">และอีก ${num(cmp.missingBrands.length - 10)} แบรนด์</p>` : ''}` : '';
  const only = cmp.onlyHere.length ? `<p class="peer-label">มีที่นี่ และยังไม่อยู่ในรายชื่อของศูนย์ใกล้เคียง <span class="hint">${num(cmp.onlyHere.length)} แบรนด์</span></p>
      <p class="brand-pills">${cmp.onlyHere.slice(0, 12).map(brandPill).join('')}${cmp.onlyHere.length > 12 ? `<span class="hint">+${num(cmp.onlyHere.length - 12)}</span>` : ''}</p>` : '';
  return `<section class="panel-section peer-section" aria-labelledby="peer-title">${title}${peers}${roles}${brands}${only}</section>`;
}

/* ---------- Brand (where a brand of the shop lists is) ---------- */

/** Brand view (tenants.js#brandPresence): how many places list it, where, and what is usually next to it. */
export function renderBrand(bp, {meta = {}, limit = 30} = {}) {
  if (!bp) return '';
  const b = bp.brand;
  const role = TENANT_ROLE_LABELS[b.role] || '';
  const shown = bp.rows.slice(0, limit);
  const provinces = bp.provinces.filter(p => p.code);
  const unlocated = bp.provinces.filter(p => !p.code).reduce((n, p) => n + p.count, 0);
  const groups = bp.groups.map(x => `${esc(groupById(x.id).th)} <span class="data-number">${num(x.count)}</span>`).join(' · ');
  const rows = shown.map(r => venueRow(r, {meta: [groupById(r.group).th, provinceShort(rowProvince(r)) || r.addrProvince || ''].filter(Boolean).join(' · '), hideStatus: true, count: 0})).join('');
  return `<section class="detail-head brand-head">
      <p class="eyebrow">${icon('brand')}แบรนด์ในรายชื่อร้าน${role ? ` · ${esc(role)}` : ''}</p>
      <h2>${esc(b.name)}</h2>
      <p class="subtle">พบใน ${num(bp.places)} สถานที่ · ${num(provinces.length)} จังหวัด</p>
      <div class="metrics compact">${metricTile(bp.places, 'สถานที่', 'venue')}${metricTile(provinces.length, 'จังหวัด', 'province')}</div>
      ${groups ? `<p class="subtle brand-groups">${groups}</p>` : ''}
    </section>
    ${provinces.length > 1 ? `<section class="panel-section"><div class="section-heading">${heading('province', 'จังหวัด')}<span class="hint">สถานที่</span></div><ul class="plain-list">${provinces.slice(0, 10).map(p => `<li><span>${esc(provinceShort(p.code))}</span><span class="data-number">${num(p.count)}</span></li>`).join('')}</ul>${provinces.length > 10 ? `<p class="hint">และอีก ${num(provinces.length - 10)} จังหวัด</p>` : ''}${unlocated ? `<p class="hint">อีก ${num(unlocated)} แห่งยังระบุจังหวัดไม่ได้</p>` : ''}</section>` : ''}
    <section class="panel-section" aria-labelledby="brand-venues"><div class="section-heading">${heading('venue', 'สถานที่ที่มีในรายชื่อ', 'brand-venues')}<span class="hint">${num(bp.rows.length)} แห่ง</span></div>
      <ul class="venue-list">${rows}</ul>
      ${bp.rows.length > shown.length ? `<div class="tenant-pagination"><span class="hint">แสดง ${num(shown.length)} จาก ${num(bp.rows.length)} แห่ง</span><button type="button" class="btn" data-action="more-brand-venues" data-id="${esc(b.key)}">ดูเพิ่ม ${num(Math.min(30, bp.rows.length - shown.length))} แห่ง</button></div>` : ''}</section>
    ${bp.coBrands.length ? `<section class="panel-section" aria-labelledby="brand-co"><div class="section-heading">${heading('mix', 'มักอยู่ในที่เดียวกับ', 'brand-co')}<span class="hint">สถานที่ร่วมกัน</span></div>
      <ul class="brand-list">${bp.coBrands.map(x => brandRow(x.brand, `${TENANT_ROLE_LABELS[x.brand.role] || ''} · อยู่ร่วมกัน ${num(x.shared)} แห่ง`)).join('')}</ul></section>` : ''}
    ${tenantDataLine(meta)}`;
}

/** Brand card (phones). */
export function mapCardBrand(bp) {
  if (!bp) return '';
  const role = TENANT_ROLE_LABELS[bp.brand.role] || '';
  return card({mark: `<span class="map-card-mark">${icon('brand')}</span>`, crumb: `แบรนด์ในรายชื่อร้าน${role ? ` · ${esc(role)}` : ''}`, title: esc(bp.brand.name), line: `พบใน ${num(bp.places)} สถานที่ · ${num(bp.provinces.filter(p => p.code).length)} จังหวัด`, actions: `${cardBack}${cardOpen()}`});
}

/* ---------- Station (CityMETER · Transit) ---------- */

/**
 * Station view (as CityMETER · Hotel): the venues of the filters within the radius of an operating rail station,
 * nearest first, with their straight-line distance. sp = {station, radius, rows, distance, summary}.
 */
export function renderStation(sp, {asOf = '', shops = null, transit = null, subject = SUBJECT} = {}) {
  if (!sp) return '';
  const s = sp.station, rows = sp.rows, sum = sp.summary || {};
  const list = rows.length
    ? `<ul class="venue-list">${rows.slice(0, 40).map(r => venueRow(r, {meta: `${meters(sp.distance.get(r.id) || 0)} · ${groupById(r.group).th}`, hideStatus: true})).join('')}</ul>${rows.length > 40 ? `<p class="hint"><button type="button" class="link-button" data-action="open-table">อีก ${num(rows.length - 40)} แห่งในตาราง</button></p>` : ''}`
    : `<p class="hint">ไม่พบ${esc(subject)}ที่มีพิกัดในระยะ ${esc(meters(sp.radius))} (0 แห่ง)</p>`;
  return `<section class="detail-head station">
      <p class="eyebrow">${icon('train')}สถานีรถไฟฟ้า${s.lines ? ` · ${esc(s.lines)}` : ''}</p>
      <h2>สถานี${esc(s.name)}</h2>${s.nameEn || s.codes ? `<p class="subtle">${esc([s.nameEn, s.codes].filter(Boolean).join(' · '))}</p>` : ''}
      <div class="metrics compact">${metricTile(rows.length, `แห่งในระยะ ${meters(sp.radius)}`, 'venue')}${metricTile(sum.operators ?? 0, 'ผู้บริหาร', 'operator')}${metricTile(sum.stores ?? '—', 'ร้านข้างใน', 'store')}</div>
      ${rows.length ? `<div class="detail-actions"><button type="button" class="btn" data-action="open-table">${icon('table')}รายการ</button></div>` : ''}
    </section>
    ${(sum.groups || []).length > 1 ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'ประเภท')}<span class="hint">แห่ง</span></div>${groupBars(sum.groups, rows.length)}</section>` : ''}
    <section class="panel-section"><div class="section-heading">${heading('venue', `${subject}ในระยะ ${meters(sp.radius)}`)}<span class="hint">ใกล้ที่สุดก่อน</span></div>${list}</section>
    ${dataLine(asOf, shops, transit)}`;
}

/** The words of a site's evidence link: its OpenStreetMap outline, or the project's own layout page. */
export const siteLinkLabel = url => (/^https:\/\/(www\.)?openstreetmap\.org\//.test(url || '') ? 'ขอบเขตใน OpenStreetMap' : 'ผังโครงการ');

const PIN_ROLES = new Set(['pin_building_basemap', 'pin_building_citymeter']);
/**
 * What the panel says about the venue's building. buildings: features drawn for this venue;
 * pinState (pin-buildings.js): 'inside' | 'edge' | 'site' matched, null read with no building, undefined not read yet;
 * site: the venue's research site (data/venue-sites.json: {n, source, url, checkedOn}) or null;
 * model: the venue's entry in data/venue-models.json (js/venue-models.js) when its masses are drawn.
 */
export function buildingReading(row, buildings = [], pinState, site = null, model = null) {
  const masses = buildings.filter(f => f.properties?.geometry_role === 'owner_model_mass');
  if (masses.length) {
    const tops = masses.map(f => Number(f.properties.height_m)).filter(Number.isFinite);
    const src = model?.source || {};
    return {text: 'มวลอาคารตามแบบของโครงการ · สีน้ำเงินบนแผนที่ 3 มิติ',
      note: esc([`มวลอาคารอย่างง่าย ${masses.length} ส่วน จากไฟล์แบบที่เจ้าของข้อมูลส่งให้${src.fileDate ? ` (ไฟล์ลงวันที่ ${thaiDate(src.fileDate)})` : ''}`,
        tops.length ? `สูงสุดราว ${new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0}).format(Math.max(...tops))} ม. ตามแบบ` : '',
        src.placement || 'วางตำแหน่งโดยเทียบกับภาพดาวเทียม', 'ไม่ใช่ผลรังวัด และอาจต่างจากอาคารที่สร้างจริง'].filter(Boolean).join(' · '))};
  }
  const pins = buildings.filter(f => PIN_ROLES.has(f.properties?.geometry_role));
  const siteParts = site ? pins.filter(f => f.properties.match_method === 'site') : [];
  // D35: the panel counts buildings, not parts — one per point (the pin, a site point) that found a building of its own;
  // an outline OSM maps in parts, with its podium, is one building.
  const buildingsOf = list => new Set(list.map(f => f.properties.site_point ?? 0)).size;
  const siteNote = site ? `ไซต์ตามงานวิจัย ${site.n} จุด หนึ่งจุดต่ออาคาร ไม่ใช่ขอบเขตกรรมสิทธิ์` : '';
  const sourceRule = 'แสดงอาคารจาก OpenStreetMap ก่อน ใช้ CityMETER Building V4 เฉพาะที่ OpenStreetMap ไม่มีอาคาร';
  if (row.hasBuilding && siteParts.length) {
    // A hosted venue with a research site: its checked footprint plus the site's other buildings found on the map.
    const n = 1 + buildingsOf(siteParts);
    const cm = siteParts.some(f => f.properties.geometry_role === 'pin_building_citymeter'), osm = siteParts.some(f => f.properties.geometry_role === 'pin_building_basemap');
    const from = ['รูปทรงอาคารที่ตรวจแล้ว', cm ? 'CityMETER Building V4' : '', osm ? 'แผนที่ฐาน OpenStreetMap (OpenFreeMap)' : ''].filter(Boolean).join(' · ');
    return {text: `ทั้งโครงการ ${num(n)} อาคาร · สีน้ำเงินบนแผนที่ 3 มิติ`,
      note: esc(`อาคารหลักตามรูปทรงที่ตรวจแล้ว และอาคารอื่นของไซต์ที่พบบนแผนที่ ${num(n - 1)} หลัง จาก ${from} · ${siteNote} · ${sourceRule} · ความสูงของ CityMETER ประมาณจากแบบจำลอง`)};
  }
  if (row.hasBuilding) {
    const heights = [...new Set(buildings.filter(f => !PIN_ROLES.has(f.properties?.geometry_role)).map(f => buildingHeightLabel(f.properties)))];
    return {text: 'อาคารของสถานที่ · สีน้ำเงินบนแผนที่ 3 มิติ', note: ['รูปทรงอาคารที่ตรวจแล้ว © OpenStreetMap / CityMETER', ...heights].map(esc).join(' · ')};
  }
  if (pins.length) {
    const cm = pins.some(f => f.properties.geometry_role === 'pin_building_citymeter'), osm = pins.some(f => f.properties.geometry_role === 'pin_building_basemap');
    const from = cm && osm ? 'CityMETER Building V4 และแผนที่ฐาน OpenStreetMap (OpenFreeMap)' : cm ? 'CityMETER Building V4' : 'แผนที่ฐาน OpenStreetMap (OpenFreeMap)';
    // D32: an OSM outline may carry the CityMETER height of the same building (its own was the OSM default).
    const hCm = pins.some(f => f.properties.height_status === 'citymeter_model_estimate'), hOsm = pins.some(f => f.properties.height_status === 'basemap_render_height');
    const heights = hCm && hOsm ? 'ความสูงของ CityMETER ประมาณจากแบบจำลอง ของ OpenStreetMap ตามแผนที่ฐาน' : hCm ? (osm ? 'ความสูงประมาณจากแบบจำลองของ CityMETER Building V4' : 'ความสูงประมาณจากแบบจำลอง') : 'ความสูงตามแผนที่ฐาน';
    const n = buildingsOf(pins);
    if (site && n >= 2) {
      return {text: `ทั้งโครงการ ${num(n)} อาคาร · สีน้ำเงินบนแผนที่ 3 มิติ`,
        note: esc(`อาคารของไซต์ที่พบบนแผนที่ ${num(n)} หลัง จาก ${from} · ${siteNote} · ${sourceRule} · ${heights}`)};
    }
    // One building (the site's points may all stand in it, as at Samyan Mitrtown: one podium with two towers).
    return {text: 'อาคารที่หมุดตั้งอยู่ · สีน้ำเงินบนแผนที่ 3 มิติ',
      note: esc([`อาคารใน ${from} ที่หมุดอยู่ข้างใน${pinState === 'edge' ? 'หรือห่างขอบไม่เกิน 3 ม.' : ''}`, site ? `${siteNote} · พบบนแผนที่เป็นอาคารเดียว` : '', sourceRule, heights].filter(Boolean).join(' · '))};
  }
  if (pinState === null) return {text: 'ยังไม่พบอาคารที่ตำแหน่งหมุด', note: esc('ไม่มีอาคารในแผนที่ฐาน OpenStreetMap หรือ CityMETER Building V4 ที่ตำแหน่งนี้')};
  return {text: '', note: ''};
}

/**
 * Venue panel. profile from buildVenueProfile; detail may still be loading (null).
 * buildings: host or pin features drawn for this venue; pinState from pin-buildings.js.
 *
 * Name and logo first (owner instruction 2026-10-25 18:49), then the key figures, contact
 * chips and a short fact list. Everything that qualifies a value — bases, methods, the full
 * opening-hours note, coordinates, the building source — waits in “หลักฐานรายช่อง”.
 */
export function renderVenue(p, {asOf = '', shops = null, buildings = [], pinState, detailError = false, tenants = null, peers = null, site = null, model = null, transit = null} = {}) {
  if (!p) return '';
  const r = p.row, d = p.detail, g = p.group;
  const logo = getVenueLogo(r.id, r.name);
  const word = p.district ? unitWord(p.district.province) : '';
  const area = p.district ? `<button type="button" class="link-button" data-action="select-district" data-id="${esc(p.district.code)}">${esc(word)}${esc(p.district.th)}</button>` : '';
  const hierarchy = hierarchyReading(r);
  // D22: the same list everywhere — the loaded roster, else the venue's count in the shop-list index.
  const listedStores = tenants?.roster ? tenants.roster.items?.length || 0 : r.shopCount || 0;
  const size = d?.size || null;
  // Key figures: reported values only (the D3 estimate stays a fact line that reads “ราว”).
  // Opening: the exact date when the source gives it, else the year (Buddhist era).
  const opened = d?.openedDate ? thaiDate(d.openedDate) : d?.yearOpened ? String(d.yearOpened + 543) : '';
  const shown = [];
  const tiles = [];
  if (listedStores) tiles.push(metricTile(listedStores, 'ร้านข้างใน', 'store'));
  if (size?.glaReported) { tiles.push(metricTile(size.glaReported, 'ตร.ม. พื้นที่เช่า', 'gla')); shown.push('gla'); }
  if (size?.floorsReported && tiles.length < 3) { tiles.push(metricTile(size.floorsReported, 'ชั้น', 'building')); shown.push('floors'); }
  if (opened && tiles.length < 3) tiles.push(metricTile(opened, 'เปิด', 'opened'));
  const links = [d ? link(d.website, 'เว็บไซต์', 'chip-link') : '', d ? link(d.directory, 'รายชื่อร้าน', 'chip-link') : '', d?.phone ? phoneLink(d.phone) : ''].filter(Boolean);
  const luxury = d?.luxuryPlace ? link(`${LUXURY_SITE}?place=${encodeURIComponent(d.luxuryPlace)}`, 'ดูแบรนด์หรูที่นี่ใน Luxury Brands', 'source-link strong-link') : '';
  const fitness = (tenants?.roster?.items || []).some(item => item.dataset === 'research.TH.fitness')
    ? link(`${FITNESS_SITE}?venue=${encodeURIComponent(r.id)}`, 'ดูฟิตเนสที่นี่ใน CityMETER Fitness', 'source-link strong-link') : '';
  // The datasets of the list itself (once loaded); never the older link snapshot's datasets.
  const datasetIds = tenants?.roster ? [...new Set((tenants.roster.items || []).map(item => item.dataset))].sort() : [];
  const storeSources = listedStores && datasetIds.length ? datasetIds.map(x => esc(storeDataset(x))).join(' · ') : '';
  const storeBlock = `<section class="panel-section tenant-section"><div class="section-heading">${heading('store', 'ร้านข้างใน')}${listedStores ? `<span class="hint">${num(listedStores)} ร้านในข้อมูล</span>` : ''}</div>${tenants?.roster ? renderTenantMix(r, tenants) : ''}${renderTenantList(r, tenants)}${storeSources ? `<p class="subtle tenant-datasets">${storeSources}</p>` : ''}${luxury || fitness ? `<p class="links">${[luxury, fitness].filter(Boolean).join(' ')}</p>` : ''}</section>`;
  const parent = p.parent ? `<p class="subtle">อยู่ใน <button type="button" class="link-button" data-action="select-venue" data-id="${esc(p.parent.id)}">${esc(p.parent.name)}</button></p>` : '';
  const children = p.children.length ? `<section class="panel-section"><div class="section-heading">${heading('building', 'พื้นที่ย่อยในโครงการ')}<span class="hint">ไม่นับแยก</span></div>${venueList(p.children, {limit: 20})}</section>` : '';
  const building = buildingReading(r, buildings, pinState, site, model);
  const drawn = building.text && building.text !== 'ยังไม่พบอาคารที่ตำแหน่งหมุด' ? building.text.split(' · ')[0] : '';
  const addressNote = p.addressDiffers ? ` · ที่อยู่อยู่ใน${esc(p.addressProvince || '')} จุดอยู่ใน${esc(p.province?.th || '')}` : '';
  return `<section class="detail-head venue${logo ? ' has-venue-logo' : ''}">
      <div class="venue-hero">
        ${logo ? venueLogoMarkup(r.id, {name: r.name, size: 'lg', className: 'detail-venue-logo', decorative: false}) : `<span class="venue-hero-mark">${groupSwatch(g)}</span>`}
        <div class="venue-title">
          <p class="eyebrow">${logo ? `${groupSwatch(g)} ` : ''}${esc(g.th)}${area ? ` · ${area}` : ''}</p>
          <h2>${esc(r.name)}</h2>${r.nameEn && r.nameEn !== r.name ? `<p class="subtle">${esc(r.nameEn)}</p>` : ''}
        </div>
      </div>
      <p class="store-status">${statusPill(r)}${hierarchy ? `<span class="status-pill tone-neutral">${esc(hierarchy)}</span>` : ''}${logo?.roleLabel ? `<span class="venue-logo-role">${esc(logo.roleLabel)}</span>` : ''}</p>
      ${parent}
      ${tiles.length ? `<div class="metrics compact venue-metrics">${tiles.join('')}</div>` : ''}
      ${links.length ? `<p class="venue-links">${links.join('')}</p>` : ''}
      <dl class="facts">
        ${fact('operator', 'ผู้บริหาร', r.operatorLabel ? esc(r.operatorLabel) : missing)}
        ${fact('hours', 'เวลาเปิด', d?.hours ? esc(hoursShort(d.hours)) : '')}
        ${fact('gla', 'ขนาด', sizeFacts(size, {shown}))}
        ${fact('address', 'ที่อยู่', d?.address ? esc(d.address) : '')}
        ${fact('building', 'อาคาร', drawn ? esc(drawn) : '')}
        ${fact('train', 'รถไฟฟ้า', r.rail ? `<button type="button" class="link-button" data-action="select-station" data-id="${esc(r.rail.station.id)}">สถานี${esc(r.rail.station.name)}</button> · <span class="data-number">${esc(meters(r.rail.m))}</span>` : '')}
        ${fact('checked', 'สัตว์เลี้ยง', amenityFacts(r._amenities))}
      </dl>
      ${!d && !detailError ? '<p class="hint">กำลังโหลดรายละเอียด…</p>' : ''}${detailError ? '<p class="hint">โหลดรายละเอียดไม่สำเร็จ ลองเปิดใหม่อีกครั้ง</p>' : ''}
    </section>
    ${storeBlock}
    ${renderPeers(peers, r)}
    ${children}
    <section class="panel-section evidence"><details${d ? '' : ' hidden'}><summary>${icon('evidence')}หลักฐานรายช่อง${d?.checkedOn ? ` <span class="hint">· ตรวจ ${esc(thaiDate(d.checkedOn))}</span>` : ''}</summary><ul class="evidence-list">${d ? evidenceRows(r, d, {buildingNote: [building.text === 'ยังไม่พบอาคารที่ตำแหน่งหมุด' ? esc(building.text) : '', building.note].filter(Boolean).join(' · '), addressNote, tenants, site, transit}) : ''}</ul>
      <p class="hint ids">รหัส <code>${esc(r.id)}</code>${r.scId && r.scId !== r.id ? ` · Shopping Center <code>${esc(r.scId)}</code>` : ''}${d?.citymeterId ? ` · CityMETER <code>${esc(d.citymeterId)}</code>` : ''}${d?.ev?.identity?.production ? ` · ${link(d.ev.identity.production, 'บันทึกใน CityMETER')}` : ''}</p></details></section>
    ${dataLine(asOf, shops)}`;
}

/* ---------- Context record (not counted) ---------- */

export function renderPending(c, {asOf = ''} = {}) {
  if (!c) return '';
  const word = c.district ? unitWord(c.district.province) : '';
  return `<section class="detail-head pending">
      <p class="eyebrow"><i class="pending-swatch" aria-hidden="true"></i> ${esc(contextState(c.reviewed))} · ไม่นับ</p>
      <h2>${esc(c.name)}</h2>
      <p class="subtle">${esc(c.group.th)}${c.district ? ` · <button type="button" class="link-button" data-action="select-district" data-id="${esc(c.district.code)}">${esc(word)}${esc(c.district.th)}</button>` : ''}${c.province ? ` · ${esc(c.province.th)}` : ''}</p>
      <dl class="facts">${fact('coordinate', 'พิกัด', `<span class="data-number">${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}</span>`)}${fact('evidence', 'รหัส', `<code>${esc(c.id)}</code>`)}</dl>
    </section>${dataLine(asOf)}`;
}

/* ---------- Map card (phones: the map first, the details one tap away) ---------- */

const cardOpen = (label = 'ดูรายละเอียด') => `<button type="button" class="btn primary" data-action="open-panel">${icon('collapse')}${esc(label)}</button>`;
const cardBack = `<button type="button" class="btn quiet" data-action="back">${icon('back')}กลับ</button>`;
const card = ({mark = '', crumb = '', title = '', line = '', actions = ''}) =>
  `<div class="map-card-main">${mark}<div class="map-card-text">${crumb ? `<p class="map-aha-crumb">${crumb}</p>` : ''}<h2>${title}</h2>${line ? `<p>${line}</p>` : ''}</div></div><div class="map-card-actions">${actions}</div>`;

/** First-view card: the Aha in one line, the area action and the button that opens the panel. */
export function mapCardAha(insight, {mode = 'auto', subject = SUBJECT} = {}) {
  if (!insight?.districts?.length) return '';
  const word = unitWord(insight.province);
  const crumb = `ประเทศไทย › ${esc(provinceByCode(insight.province)?.th || '')}`;
  if (mode === 'explicit') return card({crumb, title: `กำลังดู ${num(insight.districts.length)} ${word}`, line: `${num(insight.count)} แห่ง`, actions: `<button type="button" class="btn quiet" data-action="all-districts" data-id="${esc(insight.province)}">ดูทุก${word}</button>${cardOpen()}`});
  const area = mode === 'auto'
    ? `<button type="button" class="btn quiet" data-action="all-districts" data-id="${esc(insight.province)}">ดูทุก${word}</button>`
    : `<button type="button" class="btn quiet" data-action="explore-top">ดู ${num(insight.districts.length)} ${word}นี้</button>`;
  const rail = railReading(insight);
  const line = rail ? `${num(rail.focus)}% อยู่ในระยะ 500 ม. จากสถานีรถไฟฟ้า${rail.rest !== null ? ` · ที่อื่น ${num(rail.rest)}%` : ''}` : insight.districts.map(x => esc(x.th)).join(' · ');
  return card({crumb, title: `${num(Math.round(insight.share))}% ของ${esc(subject)}ใน${esc(provinceShort(insight.province))} อยู่ใน ${num(insight.districts.length)} ${word}`, line, actions: `${area}${cardOpen()}`});
}

/** Station card: the station, its lines and how many venues of the filters lie within its radius. */
export function mapCardStation(sp) {
  if (!sp) return '';
  const s = sp.station;
  return card({crumb: `สถานีรถไฟฟ้า${s.lines ? ` · ${esc(s.lines)}` : ''}`, title: `สถานี${esc(s.name)}`, line: `${num(sp.rows.length)} แห่งในระยะ ${esc(meters(sp.radius))}`, actions: `${cardBack}${cardOpen()}`});
}

/** Venue card: logo, name, type · area and the strongest figure. */
export function mapCardVenue(p, {tenants = null} = {}) {
  if (!p) return '';
  const r = p.row, g = p.group;
  const logo = getVenueLogo(r.id, r.name);
  const where = [esc(g.th), p.district ? `${esc(unitWord(p.district.province))}${esc(p.district.th)}` : ''].filter(Boolean).join(' · ');
  // The same figure as the panel's tile: the loaded shop list, else the venue's linked count.
  const stores = tenants?.roster ? tenants.roster.items?.length || 0 : r.shopCount || 0;
  const line = [stores ? `ร้านข้างใน ${num(stores)} ร้าน` : '', r.operatorLabel ? esc(r.operatorLabel) : ''].filter(Boolean).join(' · ');
  return card({mark: logo ? venueLogoMarkup(r.id, {name: r.name, size: 'md'}) : groupSwatch(g), crumb: where, title: esc(r.name), line, actions: `${cardBack}${cardOpen()}`});
}

/** District card: rank, venues and density. */
export function mapCardDistrict(p) {
  if (!p) return '';
  const word = unitWord(p.province);
  return card({crumb: `${esc(word)}${p.rank ? ` · แน่นอันดับ ${num(p.rank)} จาก ${num(p.of)}` : ''}`, title: esc(p.label), line: `${num(p.summary.venues)} แห่ง · ${esc(formatDensity(p.density))} แห่ง/ตร.กม.`, actions: `${cardBack}${cardOpen()}`});
}

/** Context record card (not counted). */
export function mapCardPending(c) {
  if (!c) return '';
  return card({mark: '<i class="pending-swatch" aria-hidden="true"></i>', crumb: `${esc(contextState(c.reviewed))} · ไม่นับ`, title: esc(c.name), line: esc(c.group.th), actions: `${cardBack}${cardOpen()}`});
}

/** Search card: the query, how many places, and the list. */
export function mapCardSearch(results, {brands = null} = {}) {
  if (!results) return '';
  const line = [results.qualifiedTotal ? `${num(results.qualifiedTotal)} แห่ง` : '', brands?.total ? `แบรนด์ ${num(brands.total)}` : ''].filter(Boolean).join(' · ');
  return card({crumb: 'ผลค้นหา', title: `“${esc(results.query)}”`, line: line || 'ไม่พบชื่อหรือรหัสนี้', actions: `<button type="button" class="btn quiet" data-action="clear-filter" data-id="search">ล้างคำค้น</button>${cardOpen('ดูรายการ')}`});
}

/* ---------- Active filter chips ---------- */

export function renderFilterChips(values, labels) {
  const chips = [];
  const push = (key, text) => chips.push(`<li><button type="button" class="filter-chip" data-action="clear-filter" data-id="${esc(key)}" aria-label="ล้างตัวกรอง ${esc(text)}"><span>${esc(text)}</span><i aria-hidden="true">×</i></button></li>`);
  if (values.search) push('search', `ค้นหา “${values.search}”`);
  if (values.status) push('status', labels.status[values.status] || values.status);
  if (values.group) push('group', groupLabel(values.group));
  if (values.operator) push('operator', labels.operator[values.operator] || values.operator);
  if (values.province) push('province', provinceByCode(values.province)?.th || values.province);
  if (values.role) push('role', `ข้างในมี${labels.role?.[values.role] || values.role}`);
  return chips.length ? `<ul class="filter-chips" aria-label="ตัวกรองที่ใช้อยู่">${chips.join('')}<li><button type="button" class="filter-chip clear-all" data-action="clear-filter" data-id="all">ล้างทั้งหมด</button></li></ul>` : '';
}

export {GROUPS};

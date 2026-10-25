/**
 * Reading panel views as HTML strings. Pure: no DOM access, no map.
 *
 * Every actionable element carries data-action (and data-id) and the app binds one delegated
 * click handler. Actions: select-district · select-venue · select-pending · select-province ·
 * back · explore-top · all-districts · country · open-charts · open-table · open-panel ·
 * clear-filter · set-group · set-status · toggle-pending. The back button of a detail view lives
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
import {GROUPS, groupById, STATUSES, tierReading, contextState, provinceByCode, districtWord, hasPoint, BANGKOK} from './model.js';
import {venueLogoMarkup, getVenueLogo} from './venue-logos.js';
import {formatDensity} from './scales.js';
import {cueSVG} from './cues.js';
import {nameBasis, typeEvidence, operationReading, statusTone, coordinateReading, hoursScope, legacyBasis, storeDataset, hierarchyReading} from './evidence.js';
import {buildingHeightLabel} from './buildings.js';
import {rankTenants, tenantRole, TENANT_ROLE_LABELS, TENANT_PAGE_SIZE} from './tenants.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const PCT = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 1});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = n => NUMBER.format(n);
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
export const LUXURY_SITE = 'https://montri-th.github.io/luxurybrands/';
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

function venueRow(r, {meta = '', hideStatus = false} = {}) {
  const g = groupById(r.group);
  const logo = getVenueLogo(r.id, r.name);
  const sub = [meta || g.th, r.operatorLabel].filter(Boolean).join(' · ');
  const flags = [!hasPoint(r) ? 'ยังไม่มีพิกัด' : '', r.status !== 'supply' && !hideStatus ? STATUSES[r.status] : ''].filter(Boolean).join(' · ');
  return `<li><button type="button" class="venue-row${logo ? ' has-logo' : ''}" data-action="select-venue" data-id="${esc(r.id)}" aria-label="${esc(r.name)} · ${esc(g.th)}${flags ? ' · ' + esc(flags) : ''}${r.storeCount ? ` · ร้านข้างใน ${num(r.storeCount)}` : ''}">
    ${logo ? venueLogoMarkup(r.id, {name: r.name, size: 'sm'}) : groupSwatch(g)}<span class="venue-name">${esc(r.name)}<small>${esc(sub)}${flags ? ` · <em>${esc(flags)}</em>` : ''}</small></span>${r.storeCount ? `<span class="venue-count data-number" title="ร้านข้างใน">${num(r.storeCount)}<small>ร้าน</small></span>` : '<span></span>'}</button></li>`;
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
export function dataLine(asOf) {
  return `<p class="hint panel-foot">${PRODUCT_TITLE} · CityMETER research · ตรวจถึง ${esc(thaiDate(asOf))} · ขอบเขตเขต/อำเภอ OpenGISData-Thailand (กรมการปกครอง) · <a href="DATA_METHOD.md" target="_blank" rel="noopener">ที่มาและวิธี</a></p>`;
}

/* ---------- Overview ---------- */

/** How many times denser the focus districts are than the province as a whole (share ÷ area share). */
export function densityRatio(insight) {
  return insight?.areaShare > 0 ? insight.share / insight.areaShare : 0;
}

/**
 * focusMode: 'auto' (first-Aha districts carry the detail), 'explicit' (chosen districts) or
 * 'none' (every district of the reading in detail).
 */
export function renderOverview({insight, model, focusMode = 'auto', readCode = '', national = true, subject = SUBJECT, asOf = '', provinces = []}) {
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
    const top = insight.topCount && insight.topCount.count > 0 && national ? insight.topCount : null;
    const ratio = densityRatio(insight);
    const denser = ratio >= 2 ? ` · แน่นกว่าค่าเฉลี่ยของ${esc(provinceShort(pCode))} <strong class="data-number">${num(Math.round(ratio))}</strong> เท่า` : '';
    aha = `<section class="aha${focusMode === 'auto' ? ' is-auto' : ''}" aria-label="ข้อค้นพบ"><p class="eyebrow">${icon('idea')}ข้อค้นพบแรก</p>
      <h2><span class="aha-number data-number">${num(share)}%</span><span class="aha-headline">ของ${esc(subject)}ใน${esc(provinceShort(pCode))} อยู่ใน ${num(count)} ${word}นี้</span></h2>
      <p class="aha-copy">${names}<br><strong class="data-number">${num(insight.count)}</strong> จาก ${num(insight.total)} แห่ง บนพื้นที่เพียง <strong class="data-number">${PCT.format(insight.areaShare)}%</strong> ของ${esc(provinceShort(pCode))}${denser}</p>
      ${top ? `<p class="aha-secondary">มากที่สุดในประเทศ: <button type="button" class="link-button" data-action="select-district" data-id="${esc(top.code)}">${esc(unitWord(top.province))}${esc(top.th)}</button> <span class="data-number">${num(top.count)}</span> แห่ง</p>` : ''}
      <div class="aha-actions">${actions}<button type="button" data-action="open-charts" class="btn quiet">${icon('chart')}เทียบพื้นที่</button></div></section>`;
  }
  const narrowed = focusMode !== 'none' && count > 0 && s.venues !== model.scope.venues;
  const metrics = `<section class="metrics" aria-label="${narrowed ? 'ตัวเลขของพื้นที่ที่กำลังดู' : 'ตัวเลขของข้อมูลที่เลือก'}">
    ${metricTile(s.venues, 'แห่ง', 'venue')}
    ${metricTile(s.districts, readCode || narrowed ? unitWord(readCode || pCode) : 'เขต/อำเภอ', 'area')}
    ${metricTile(s.operators, 'ผู้บริหาร', 'operator')}
    ${metricTile(s.stores, 'ร้านข้างใน', 'store')}
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
  return `${aha}${metrics}${mix}${areaList}${unlocated}${statusLists(model.planned, model.closed)}${dataLine(asOf)}`;
}

/* ---------- Search results ---------- */

export function renderSearch(results, {pending = null, districts = null, asOf = ''} = {}) {
  const pendingRow = i => {
    const r = pending?.rows?.[i];
    if (!r) return '';
    const g = groupById(r[6]);
    const d = r[5] ? districts?.get(r[5]) : null;
    const stateText = contextState(r[7] === 'reviewed');
    return `<li><button type="button" class="venue-row is-pending" data-action="select-pending" data-id="${esc(i)}" aria-label="${esc(r[1])} · ${esc(stateText)} · ไม่นับ"><i class="pending-swatch" aria-hidden="true"></i><span class="venue-name">${esc(r[1])}<small>${esc(stateText)} · ${esc(g.th)}${d ? ` · ${esc(unitWord(d.province))}${esc(d.th)}` : ''}</small></span><span></span></button></li>`;
  };
  const total = results.qualifiedTotal + results.components.length + results.pendingTotal;
  return `<section class="aha is-focused" aria-label="ผลค้นหา"><p class="eyebrow">${icon('search')}ผลค้นหา</p><h2>“${esc(results.query)}”</h2>
      <p class="aha-copy">${total ? `${num(results.qualifiedTotal)} แห่ง${results.otherStatus ? ` (กำลังจะเปิดหรือปิดแล้ว ${num(results.otherStatus)})` : ''}${results.components.length ? ` · ไม่นับแยก ${num(results.components.length)}` : ''}${results.pendingTotal ? ` · ยังยืนยันไม่ได้ ${num(results.pendingTotal)}` : ''}` : 'ไม่พบชื่อหรือรหัสนี้'}</p>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="search" class="btn">ล้างคำค้น</button></div></section>
    ${results.qualified.length ? `<section class="panel-section"><div class="section-heading">${heading('venue', 'สถานที่')}<span class="hint">${num(results.qualifiedTotal)}</span></div>${venueList(results.qualified, {limit: 30})}</section>` : ''}
    ${results.components.length ? `<section class="panel-section"><div class="section-heading">${heading('building', 'พื้นที่ย่อยและรายการที่อาจซ้ำ')}<span class="hint">ไม่นับแยก</span></div>${venueList(results.components, {limit: 30})}</section>` : ''}
    ${results.pending.length ? `<section class="panel-section"><div class="section-heading"><h3><i class="pending-swatch" aria-hidden="true"></i>ยังยืนยันไม่ได้</h3><span class="hint">ไม่นับ · ${num(results.pendingTotal)}</span></div><ul class="venue-list">${results.pending.map(pendingRow).join('')}</ul>${results.pendingTotal > results.pending.length ? `<p class="hint">แสดง ${num(results.pending.length)} รายการแรก</p>` : ''}</section>` : ''}
    ${dataLine(asOf)}`;
}

/* ---------- District ---------- */

export function renderDistrict(p, {asOf = ''} = {}) {
  if (!p) return '';
  const word = unitWord(p.province);
  return `<section class="detail-head">
      <p class="eyebrow">${esc(word)}${p.rank ? ` · แน่นอันดับ ${num(p.rank)} จาก ${num(p.of)} ของ${esc(provinceShort(p.province))}` : ''}</p>
      <h2>${esc(p.label)}</h2><p class="subtle">${esc(p.provinceName)} · ${esc(formatDensity(p.areaKm2))} ตร.กม.</p>
      <div class="metrics compact">${metricTile(p.summary.venues, 'แห่ง', 'venue')}${metricTile(formatDensity(p.density), 'แห่ง/ตร.กม.', 'area')}${metricTile(p.summary.operators, 'ผู้บริหาร', 'operator')}${metricTile(p.summary.stores, 'ร้านข้างใน', 'store')}</div>
      <div class="detail-actions"><button type="button" class="btn" data-action="open-table">${icon('table')}รายการ</button><button type="button" class="btn quiet" data-action="open-charts">${icon('chart')}เทียบ${esc(word)}</button></div>
    </section>
    ${p.groups.length ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'ประเภท')}<span class="hint">แห่ง</span></div>${groupBars(p.groups, p.summary.venues)}</section>` : ''}
    <section class="panel-section"><div class="section-heading">${heading('venue', `สถานที่ใน${word}นี้`)}<span class="hint">${num(p.venues.length)} แห่ง</span></div>${p.venues.length ? venueList(p.venues, {limit: 20}) : '<p class="hint">ไม่มีสถานที่ในตัวกรองนี้ (0 แห่ง)</p>'}</section>
    ${p.operators.length ? `<section class="panel-section"><div class="section-heading">${heading('operator', 'ผู้บริหาร')}<span class="hint">แห่ง</span></div><ul class="plain-list">${p.operators.map(o => `<li><span>${esc(o.label)}</span><span class="data-number">${num(o.count)}</span></li>`).join('')}</ul></section>` : ''}
    ${statusLists(p.planned, p.closed)}
    ${dataLine(asOf)}`;
}

/* ---------- Venue ---------- */

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

function evidenceRows(row, d, {buildingNote = '', addressNote = '', tenants = null} = {}) {
  const ev = d?.ev || {};
  const rowsHtml = [];
  const item = (label, text, url, date, extra = '') => rowsHtml.push(`<li><span class="ev-label">${esc(label)}</span><span class="ev-text">${esc(text || 'ตามแหล่งที่บันทึก')}${date ? ` · ${esc(thaiDate(date))}` : ''}${extra}</span>${url ? link(url, 'แหล่ง') : '<span class="hint">ไม่มีลิงก์สาธารณะ</span>'}</li>`);
  const note = (label, text) => rowsHtml.push(`<li><span class="ev-label">${esc(label)}</span><span class="ev-text">${text}</span></li>`);
  item('ชื่อไทย', nameBasis(ev.nameTh?.basis), ev.nameTh?.url);
  if (d?.nameEn && d.nameEn !== d.nameTh) item('ชื่ออังกฤษ', nameBasis(ev.nameEn?.basis), ev.nameEn?.url);
  item('ประเภท', typeEvidence(ev.type?.status), ev.type?.url, ev.type?.checkedOn);
  if (row.groupBasis === 'owner') note('กลุ่มบนหน้าจอ', `เจ้าของข้อมูลระบุว่าเป็นศูนย์การค้า · ${esc(thaiDate('2026-10-25'))}`);
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
  item('ตัวตน', 'แหล่งยืนยันตัวตนสถานที่', ev.identity?.url);
  if (tenants?.roster) {
    note('รายชื่อร้าน', `รายการที่เชื่อมสถานที่แล้วจากชุดข้อมูลในทะเบียน · ตรวจทะเบียน ${esc(thaiDate(tenants.roster.meta?.asOf || ''))} · รายชื่ออาจยังไม่ครบทั้งศูนย์และไม่ได้ยืนยันว่าทุกร้านเปิดอยู่วันนี้ ลิงก์ข้างชื่อร้านเปิดหลักฐานต้นทางตามวันที่ของแต่ละรายการ`);
    note('ลำดับร้าน', 'ประเมินบทบาทต่อศูนย์: ร้านหลักที่แหล่งระบุ → ร้านที่ตรงกับเอกลักษณ์หรือรูปแบบศูนย์ → ห้างและความบันเทิง ซูเปอร์มาร์เก็ต ร้านปลายทาง อาหาร และบริการ ตามบริบทของศูนย์ บทบาทเดียวกันเรียงตามชื่อ ไม่ใช่อันดับจากยอดขายหรือจำนวนผู้เข้าชม โลโก้ไม่เพิ่มลำดับ');
    const profile = tenants.roster.profile;
    if (profile?.sourceUrl) item('เอกลักษณ์ศูนย์', profile.label, profile.sourceUrl, profile.checkedOn);
    if (d.stores?.confirmed !== tenants.roster.items?.length) note('ขอบเขตรายชื่อ', `ตัวเลขและรายชื่อในแผงนี้ใช้รายการร้านที่เชื่อมไว้ล่าสุด ส่วนตัวเลขรวมของแผนที่ยังใช้ชุดความสัมพันธ์เดิม${d.stores?.confirmed ? ` (${num(d.stores.confirmed)} รายการสำหรับสถานที่นี้)` : ''} บัตรต้นทางที่ยังแยกตัวตนสาขาไม่ได้เก็บรวมภายใต้รายการเดียว`);
  }
  if (ev.research?.urls?.length) rowsHtml.push(`<li><span class="ev-label">ค้นเพิ่ม</span><span class="ev-text">แหล่งทางการที่ใช้เติมข้อมูล${ev.research.checkedOn ? ` · ${esc(thaiDate(ev.research.checkedOn))}` : ''}</span><span class="ev-links">${ev.research.urls.slice(0, 4).map((u, i) => link(u, `${i + 1}`)).join(' ')}</span></li>`);
  return rowsHtml.join('');
}

/** Ten names at a time. The complete roster and the historical aggregate are separate populations. */
export function renderTenantList(row, selection) {
  if (selection?.error) return `<p class="hint">โหลดรายชื่อร้านไม่สำเร็จ <button type="button" class="link-button" data-action="retry-tenants" data-id="${esc(row.id)}">ลองอีกครั้ง</button></p>`;
  if (!selection?.roster) return '<p class="hint" role="status">กำลังโหลดรายชื่อร้าน…</p>';
  const items = rankTenants(selection.roster.items || [], row, selection.roster.profile);
  if (!items.length) return '<p class="hint">ยังไม่มีรายชื่อร้านในข้อมูลที่เชื่อมไว้</p>';
  const limit = Math.max(TENANT_PAGE_SIZE, selection.limit || TENANT_PAGE_SIZE);
  const shown = items.slice(0, limit);
  const logoMarkup = item => {
    const logo = item.logo;
    const valid = logo && /^assets\/tenant-logos\/[A-Za-z0-9._-]+\.(svg|png|jpe?g|webp|gif)$/i.test(logo.file || '') && /^[a-f0-9]{64}$/.test(logo.sha256 || '');
    const backing = /^#[0-9a-f]{6}$/i.test(logo?.background || '') ? logo.background : '#E5E9E6';
    return `<span class="tenant-logo" aria-hidden="true"${valid ? ` style="--tenant-logo-bg:${esc(backing)}"` : ''}>${icon('store')}${valid ? `<img src="${esc(logo.file)}" alt="" loading="lazy" decoding="async"${logo.width > 0 && logo.height > 0 ? ` width="${Math.round(logo.width)}" height="${Math.round(logo.height)}"` : ''}>` : ''}</span>`;
  };
  return `<p class="hint tenant-order">เรียงตามบทบาทต่อศูนย์</p>
    <ol class="tenant-list" aria-label="ร้านข้างใน ${esc(row.name)}">${shown.map((item, index) => {
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

/**
 * What the panel says about the venue's building. buildings: features drawn for this venue;
 * pinState (pin-buildings.js): 'inside' | 'edge' matched, null read with no building, undefined not read yet.
 */
export function buildingReading(row, buildings = [], pinState) {
  const pin = buildings.some(f => f.properties?.geometry_role === 'pin_building_basemap');
  if (row.hasBuilding) {
    const heights = [...new Set(buildings.filter(f => f.properties?.geometry_role !== 'pin_building_basemap').map(f => buildingHeightLabel(f.properties)))];
    return {text: 'อาคารของสถานที่ · สีน้ำเงินบนแผนที่ 3 มิติ', note: ['รูปทรงอาคารที่ตรวจแล้ว © OpenStreetMap / CityMETER', ...heights].map(esc).join(' · ')};
  }
  if (pin) return {text: 'อาคารที่หมุดตั้งอยู่ · สีน้ำเงินบนแผนที่ 3 มิติ', note: esc(`อาคารในแผนที่ฐาน OpenStreetMap (OpenFreeMap) ที่หมุดอยู่ข้างใน${pinState === 'edge' ? 'หรือห่างขอบไม่เกิน 3 ม.' : ''} · ความสูงตามแผนที่ฐาน`)};
  if (pinState === null) return {text: 'ยังไม่พบอาคารที่ตำแหน่งหมุด', note: esc('ไม่มีอาคารในแผนที่ฐาน OpenStreetMap ที่ตำแหน่งนี้')};
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
export function renderVenue(p, {asOf = '', buildings = [], pinState, detailError = false, tenants = null} = {}) {
  if (!p) return '';
  const r = p.row, d = p.detail, g = p.group;
  const logo = getVenueLogo(r.id, r.name);
  const word = p.district ? unitWord(p.district.province) : '';
  const area = p.district ? `<button type="button" class="link-button" data-action="select-district" data-id="${esc(p.district.code)}">${esc(word)}${esc(p.district.th)}</button>` : '';
  const hierarchy = hierarchyReading(r);
  const stores = d?.stores || {confirmed: r.storeCount || 0, datasets: []};
  const listedStores = tenants?.roster ? tenants.roster.items?.length || 0 : stores.confirmed;
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
  const datasetIds = tenants?.roster ? [...new Set((tenants.roster.items || []).map(item => item.dataset))].sort() : stores.datasets;
  const storeSources = listedStores && datasetIds.length ? datasetIds.map(x => esc(storeDataset(x))).join(' · ') : '';
  const storeBlock = `<section class="panel-section tenant-section"><div class="section-heading">${heading('store', 'ร้านข้างใน')}${listedStores ? `<span class="hint">${num(listedStores)} ร้านในข้อมูล</span>` : ''}</div>${renderTenantList(r, tenants)}${storeSources ? `<p class="subtle tenant-datasets">${storeSources}</p>` : ''}${luxury ? `<p class="links">${luxury}</p>` : ''}</section>`;
  const parent = p.parent ? `<p class="subtle">อยู่ใน <button type="button" class="link-button" data-action="select-venue" data-id="${esc(p.parent.id)}">${esc(p.parent.name)}</button></p>` : '';
  const children = p.children.length ? `<section class="panel-section"><div class="section-heading">${heading('building', 'พื้นที่ย่อยในโครงการ')}<span class="hint">ไม่นับแยก</span></div>${venueList(p.children, {limit: 20})}</section>` : '';
  const building = buildingReading(r, buildings, pinState);
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
      </dl>
      ${!d && !detailError ? '<p class="hint">กำลังโหลดรายละเอียด…</p>' : ''}${detailError ? '<p class="hint">โหลดรายละเอียดไม่สำเร็จ ลองเปิดใหม่อีกครั้ง</p>' : ''}
    </section>
    ${storeBlock}
    ${children}
    <section class="panel-section evidence"><details${d ? '' : ' hidden'}><summary>${icon('evidence')}หลักฐานรายช่อง${d?.checkedOn ? ` <span class="hint">· ตรวจ ${esc(thaiDate(d.checkedOn))}</span>` : ''}</summary><ul class="evidence-list">${d ? evidenceRows(r, d, {buildingNote: [building.text === 'ยังไม่พบอาคารที่ตำแหน่งหมุด' ? esc(building.text) : '', building.note].filter(Boolean).join(' · '), addressNote, tenants}) : ''}</ul>
      <p class="hint ids">รหัส <code>${esc(r.id)}</code>${r.scId && r.scId !== r.id ? ` · Shopping Center <code>${esc(r.scId)}</code>` : ''}${d?.citymeterId ? ` · CityMETER <code>${esc(d.citymeterId)}</code>` : ''}${d?.ev?.identity?.production ? ` · ${link(d.ev.identity.production, 'บันทึกใน CityMETER')}` : ''}</p></details></section>
    ${dataLine(asOf)}`;
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
  return card({crumb, title: `${num(Math.round(insight.share))}% ของ${esc(subject)}ใน${esc(provinceShort(insight.province))} อยู่ใน ${num(insight.districts.length)} ${word}`, line: insight.districts.map(x => esc(x.th)).join(' · '), actions: `${area}${cardOpen()}`});
}

/** Venue card: logo, name, type · area and the strongest figure. */
export function mapCardVenue(p) {
  if (!p) return '';
  const r = p.row, g = p.group;
  const logo = getVenueLogo(r.id, r.name);
  const where = [esc(g.th), p.district ? `${esc(unitWord(p.district.province))}${esc(p.district.th)}` : ''].filter(Boolean).join(' · ');
  const stores = p.detail?.stores?.confirmed || r.storeCount || 0;
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
export function mapCardSearch(results) {
  if (!results) return '';
  return card({crumb: 'ผลค้นหา', title: `“${esc(results.query)}”`, line: results.qualifiedTotal ? `${num(results.qualifiedTotal)} แห่ง` : 'ไม่พบชื่อหรือรหัสนี้', actions: `<button type="button" class="btn quiet" data-action="clear-filter" data-id="search">ล้างคำค้น</button>${cardOpen('ดูรายการ')}`});
}

/* ---------- Active filter chips ---------- */

export function renderFilterChips(values, labels) {
  const chips = [];
  const push = (key, text) => chips.push(`<li><button type="button" class="filter-chip" data-action="clear-filter" data-id="${esc(key)}" aria-label="ล้างตัวกรอง ${esc(text)}"><span>${esc(text)}</span><i aria-hidden="true">×</i></button></li>`);
  if (values.search) push('search', `ค้นหา “${values.search}”`);
  if (values.status) push('status', labels.status[values.status] || values.status);
  if (values.group) push('group', groupById(values.group).th);
  if (values.operator) push('operator', labels.operator[values.operator] || values.operator);
  if (values.province) push('province', provinceByCode(values.province)?.th || values.province);
  return chips.length ? `<ul class="filter-chips" aria-label="ตัวกรองที่ใช้อยู่">${chips.join('')}<li><button type="button" class="filter-chip clear-all" data-action="clear-filter" data-id="all">ล้างทั้งหมด</button></li></ul>` : '';
}

export {GROUPS};

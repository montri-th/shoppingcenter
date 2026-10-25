/**
 * Reading panel views as HTML strings. Pure: no DOM access, no map.
 *
 * Every actionable element carries data-action (and data-id) and the app binds one delegated
 * click handler. Actions: select-district · select-venue · select-pending · select-province ·
 * back · explore-top · all-districts · country · open-charts · open-table · clear-filter ·
 * set-group · set-status · toggle-pending
 *
 * Copy is short, natural Thai (owner instruction carried from Luxury Brands, 2026-10-22: no
 * caveats on screen; provenance lives in the data line, help and docs). Units: แห่ง = one
 * qualified retail venue; แห่ง/ตร.กม. = venues per square kilometre of district area.
 * Missing is never zero: an unknown field says “ยังไม่มีข้อมูล”, never 0.
 */
import {GROUPS, groupById, STATUSES, tierReading, contextState, provinceByCode, districtWord, hasPoint, BANGKOK} from './model.js';
import {venueLogoMarkup, getVenueLogo} from './venue-logos.js';
import {formatDensity} from './scales.js';
import {cueSVG} from './cues.js';
import {nameBasis, typeEvidence, operationReading, statusTone, coordinateReading, hoursScope, legacyBasis, storeDataset, hierarchyReading} from './evidence.js';
import {buildingHeightLabel} from './buildings.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const PCT = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 1});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = n => NUMBER.format(n);
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
export const LUXURY_SITE = 'https://montri-th.github.io/luxurybrands/';

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

export function statusPill(row) {
  const label = row.status === 'supply' ? operationReading(row.operationGroup) : STATUSES[row.status];
  const short = row.status === 'supply' ? (['operating_source_evidence', 'official_listing_not_field_verified'].includes(row.operationGroup) ? 'มีหลักฐานว่าเปิด' : row.operationGroup === 'partially_operating' ? 'ทยอยเปิด' : 'รอยืนยันสถานะ') : STATUSES[row.status];
  return `<span class="status-pill tone-${esc(statusTone(row))}" title="${esc(label)}">${esc(short)}</span>`;
}

/** Metric tile with a decorative pictogram (Material Symbols subset, owner test exception carried from Luxury Brands). */
export function metricTile(value, label, kind = '') {
  const shown = typeof value === 'number' ? num(value) : esc(value);
  return `<div class="metric${kind ? ` metric-${kind}` : ' metric-plain'}"><i class="metric-symbol pictogram pic-${esc(kind || 'plain')}" aria-hidden="true"></i><strong class="data-number">${shown}</strong><span>${esc(label)}</span></div>`;
}
export const heading = (kind, text, id = '') => `<h3${id ? ` id="${esc(id)}"` : ''}><i class="pictogram pic-${esc(kind)}" aria-hidden="true"></i>${esc(text)}</h3>`;

export const groupSwatch = g => `<i class="cue-swatch category-${g.series}" aria-hidden="true">${cueSVG(g.cue)}</i>`;

function groupBars(groups, total) {
  if (!groups.length) return '';
  const max = Math.max(1, ...groups.map(g => g.count));
  return `<ul class="mix-list" aria-label="กลุ่มประเภท (จำนวนสถานที่)">${groups.map(g => `
    <li><button type="button" class="mix-row" data-action="set-group" data-id="${esc(g.id)}" aria-label="${esc(g.th)} ${num(g.count)} แห่ง กดเพื่อดูเฉพาะกลุ่มนี้">
      <span class="mix-label">${groupSwatch(g)}<span>${esc(g.th)}</span></span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill category-${g.series}" style="width:${Math.max(3, Math.round((g.count / max) * 100))}%"></span></span>
      <span class="mix-value data-number" aria-hidden="true">${num(g.count)}${total ? `<small> ${PCT.format((g.count / total) * 100)}%</small>` : ''}</span></button></li>`).join('')}</ul>`;
}

function venueRow(r, {meta = ''} = {}) {
  const g = groupById(r.group);
  const logo = getVenueLogo(r.id, r.name);
  const sub = [meta || g.th, r.operatorLabel].filter(Boolean).join(' · ');
  const flags = [!hasPoint(r) ? 'ยังไม่มีพิกัด' : '', r.status !== 'supply' ? STATUSES[r.status] : ''].filter(Boolean).join(' · ');
  return `<li><button type="button" class="venue-row${logo ? ' has-logo' : ''}" data-action="select-venue" data-id="${esc(r.id)}" aria-label="${esc(r.name)} · ${esc(g.th)}${flags ? ' · ' + esc(flags) : ''}">
    ${logo ? venueLogoMarkup(r.id, {name: r.name, size: 'sm'}) : groupSwatch(g)}<span class="venue-name">${esc(r.name)}<small>${esc(sub)}${flags ? ` · <em>${esc(flags)}</em>` : ''}</small></span>${r.storeCount ? `<span class="venue-count data-number" title="ร้านที่ยืนยันว่าอยู่ในสถานที่">${num(r.storeCount)}<small>ร้าน</small></span>` : '<span></span>'}</button></li>`;
}

function venueList(rows, {limit = 12, label = ''} = {}) {
  if (!rows.length) return '';
  return `<ul class="venue-list"${label ? ` aria-label="${esc(label)}"` : ''}>${rows.slice(0, limit).map(r => venueRow(r)).join('')}</ul>${rows.length > limit ? `<p class="hint">+ อีก ${num(rows.length - limit)} แห่งในตาราง</p>` : ''}`;
}

function statusLists(planned, closed) {
  if (!planned.length && !closed.length) return '';
  return `<section class="panel-section" aria-labelledby="status-title"><div class="section-heading"><h3 id="status-title">โครงการที่กำลังมาและที่ปิด</h3><span class="hint">ไม่นับในจำนวนข้างบน</span></div>
    ${planned.length ? `<p class="subtle">กำลังมา ${num(planned.length)} แห่ง</p>${venueList(planned, {limit: 6})}` : ''}
    ${closed.length ? `<p class="subtle">ปิดตามหลักฐาน ${num(closed.length)} แห่ง</p>${venueList(closed, {limit: 6})}` : ''}</section>`;
}

/** Data line: dataset · source · date · boundary — carried by every panel that shows numbers. */
export function dataLine(asOf) {
  return `<p class="hint panel-foot">ศูนย์การค้าและสถานที่ค้าปลีก · CityMETER research ตรวจถึง ${esc(thaiDate(asOf))} · นับเฉพาะสถานที่ที่ผ่านนิยาม · ขอบเขตเขต/อำเภอ: OpenGISData-Thailand (กรมการปกครอง) · <a href="DATA_METHOD.md" target="_blank" rel="noopener">ที่มาและวิธี</a></p>`;
}

/* ---------- Overview ---------- */

/**
 * focusMode: 'auto' (first-Aha districts carry the detail), 'explicit' (chosen districts) or
 * 'none' (every district of the reading in detail).
 */
export function renderOverview({insight, model, focusMode = 'auto', readCode = '', national = true, subject = 'ศูนย์การค้าและสถานที่ค้าปลีก', asOf = '', provinces = []}) {
  const s = model.summary;
  const count = insight.districts.length;
  const pCode = insight.province;
  const word = unitWord(pCode);
  const share = Math.round(insight.share);
  let aha;
  if (!s.venues && !model.scope.venues) {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบแรก</p><h2>ไม่พบสถานที่ที่ผ่านนิยามในตัวกรองนี้</h2>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="all" class="btn">ล้างตัวกรอง</button></div></section>`;
  } else if (!count) {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบแรก</p><h2>${num(model.scope.venues)} แห่งในตัวกรองนี้ยังไม่มีพิกัดที่ผ่านเกณฑ์</h2>
      <div class="aha-actions"><button type="button" data-action="open-table" class="btn">ดูรายการ</button><button type="button" data-action="clear-filter" data-id="all" class="btn quiet">ล้างตัวกรอง</button></div></section>`;
  } else if (focusMode === 'explicit') {
    aha = `<section class="aha is-focused" aria-label="ข้อค้นพบ"><p class="eyebrow">กำลังสำรวจ ${num(count)} ${word}</p>
      <h2>${insight.districts.map(d => esc(d.th)).join(' · ')}</h2>
      <p class="aha-copy"><strong class="data-number">${num(insight.count)}</strong> จาก ${num(insight.total)} แห่งของ${esc(provinceShort(pCode))}</p>
      <div class="aha-actions"><button type="button" data-action="all-districts" data-id="${esc(pCode)}" class="btn">ดูทุก${word}</button><button type="button" data-action="open-charts" class="btn quiet">เทียบพื้นที่</button></div></section>`;
  } else {
    const names = insight.districts.map(d => `<button type="button" class="link-button" data-action="select-district" data-id="${esc(d.code)}">${esc(d.th)}</button>`).join(' · ');
    const actions = focusMode === 'auto'
      ? `<button type="button" data-action="all-districts" data-id="${esc(pCode)}" class="btn">ดูทุก${word}ใน${esc(provinceShort(pCode))}</button><button type="button" data-action="country" class="btn quiet">ดูทั้งประเทศ</button>`
      : `<button type="button" data-action="explore-top" class="btn primary">โฟกัส ${num(count)} ${word}นี้</button>${readCode ? '<button type="button" data-action="country" class="btn quiet">ดูทั้งประเทศ</button>' : ''}`;
    const top = insight.topCount && insight.topCount.count > 0 && national ? insight.topCount : null;
    aha = `<section class="aha${focusMode === 'auto' ? ' is-auto' : ''}" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบแรก</p>
      <h2><span class="aha-number data-number">${num(share)}%</span><span class="aha-headline">ของ${esc(subject)}ใน${esc(provinceShort(pCode))} อยู่ใน ${num(count)} ${word}นี้</span></h2>
      <p class="aha-copy">${names}<br><strong class="data-number">${num(insight.count)}</strong> จาก ${num(insight.total)} แห่ง บนพื้นที่ <strong class="data-number">${PCT.format(insight.areaShare)}%</strong> ของ${esc(provinceShort(pCode))}</p>
      ${top ? `<p class="aha-secondary">${esc(unitWord(top.province))}ที่มีสถานที่มากที่สุดในประเทศ: <button type="button" class="link-button" data-action="select-district" data-id="${esc(top.code)}">${esc(top.th)}</button> <span class="data-number">${num(top.count)}</span> แห่ง</p>` : ''}
      <div class="aha-actions">${actions}<button type="button" data-action="open-charts" class="btn quiet">เทียบพื้นที่</button></div></section>`;
  }
  const narrowed = focusMode !== 'none' && count > 0 && s.venues !== model.scope.venues;
  const metrics = `<section class="metrics" aria-label="${narrowed ? 'ตัวเลขของพื้นที่ที่โฟกัส' : 'ตัวเลขของข้อมูลที่เลือก'}">
    ${metricTile(s.venues, `สถานที่${narrowed ? ' ในโฟกัส' : ''}`, 'venue')}
    ${metricTile(s.districts, readCode || narrowed ? `${unitWord(readCode || pCode)}ที่มีสถานที่` : 'เขต/อำเภอที่มีสถานที่', 'area')}
    ${metricTile(s.operators, 'ผู้บริหาร')}
    ${metricTile(s.stores, 'ร้านที่ยืนยัน', 'store')}
  </section>`;
  const mix = model.groups.length ? `<section class="panel-section" aria-labelledby="mix-title"><div class="section-heading">${heading('segment', 'กลุ่มประเภท', 'mix-title')}<span class="hint">${num(s.venues)} แห่ง</span></div>${groupBars(model.groups, s.venues)}</section>` : '';
  let areaList = '';
  if (!readCode && provinces.length > 1) {
    areaList = `<section class="panel-section" aria-labelledby="province-title"><div class="section-heading">${heading('province', 'จังหวัดที่มีสถานที่', 'province-title')}<span class="hint">${num(provinces.length)} จังหวัด</span></div>
      <ul class="province-list">${provinces.slice(0, 77).map(p => `<li><button type="button" class="province-row" data-action="select-province" data-id="${esc(p.code)}" aria-label="${esc(p.name)} ${num(p.count)} แห่ง กดเพื่อดูจังหวัด"><i class="province-swatch" style="background:${esc(p.fill)}" aria-hidden="true"></i><span class="province-name">${esc(p.name)}</span><span class="province-count data-number">${num(p.count)}<small>แห่ง</small></span></button></li>`).join('')}</ul></section>`;
  } else if (model.ranking.length) {
    const word2 = unitWord(readCode || pCode);
    const ranking = model.ranking.slice(0, 10);
    const max = Math.max(...ranking.map(a => a.density)) || 1;
    areaList = `<section class="panel-section" aria-labelledby="rank-title"><div class="section-heading">${heading('area', `${word2}เรียงตามความหนาแน่น`, 'rank-title')}<span class="hint">แห่ง/ตร.กม.</span></div>
      <ol class="rank-list">${ranking.map((a, i) => `<li><button type="button" class="rank-row" data-action="select-district" data-id="${esc(a.id)}" aria-label="อันดับ ${i + 1} ${esc(a.label)} ${esc(formatDensity(a.density))} แห่งต่อตารางกิโลเมตร ${num(a.count)} แห่ง">
        <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
        <span class="rank-name">${esc(a.name)}<small>${num(a.count)} แห่ง · ${esc(formatDensity(a.areaKm2))} ตร.กม.</small></span>
        <span class="rank-track" aria-hidden="true"><span class="rank-fill" style="width:${Math.max(3, Math.round((a.density / max) * 100))}%;background:${esc(a.fill)}"></span></span>
        <span class="rank-value data-number" aria-hidden="true">${esc(formatDensity(a.density))}</span></button></li>`).join('')}</ol></section>`;
  }
  const unlocated = model.unlocated.length ? `<p class="hint">อีก ${num(model.unlocated.length)} แห่ง${readCode ? `ใน${esc(provinceShort(readCode))}ตามที่อยู่` : ''}ยังไม่มีพิกัดที่ผ่านเกณฑ์ <button type="button" class="link-button" data-action="open-table">ดูในตาราง</button></p>` : '';
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
    return `<li><button type="button" class="venue-row is-pending" data-action="select-pending" data-id="${esc(i)}" aria-label="${esc(r[1])} · ${esc(stateText)} ไม่นับ"><i class="pending-swatch" aria-hidden="true"></i><span class="venue-name">${esc(r[1])}<small>${esc(stateText)} · ${esc(g.th)} ตามแหล่งเดิม${d ? ` · ${esc(unitWord(d.province))}${esc(d.th)}` : ''}</small></span><span></span></button></li>`;
  };
  const total = results.qualifiedTotal + results.components.length + results.pendingTotal;
  return `<section class="aha is-focused" aria-label="ผลค้นหา"><p class="eyebrow">ผลค้นหา</p><h2>“${esc(results.query)}”</h2>
      <p class="aha-copy">${total ? `ผ่านนิยาม ${num(results.qualifiedTotal)} แห่ง${results.otherStatus ? ` (รวมที่กำลังมาหรือปิด ${num(results.otherStatus)})` : ''}${results.components.length ? ` · ไม่นับแยก ${num(results.components.length)}` : ''} · ยังไม่ผ่านนิยาม ${num(results.pendingTotal)} รายการ` : 'ไม่พบชื่อหรือรหัสนี้'}</p>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="search" class="btn">ล้างคำค้น</button></div></section>
    ${results.qualified.length ? `<section class="panel-section"><div class="section-heading">${heading('venue', 'สถานที่ที่ผ่านนิยาม')}<span class="hint">${num(results.qualifiedTotal)}</span></div>${venueList(results.qualified, {limit: 30})}</section>` : ''}
    ${results.components.length ? `<section class="panel-section"><div class="section-heading"><h3>ผ่านนิยามแต่ไม่นับแยก</h3><span class="hint">พื้นที่ย่อย · อาจซ้ำ · รอตรวจการนับ</span></div>${venueList(results.components, {limit: 30})}</section>` : ''}
    ${results.pending.length ? `<section class="panel-section"><div class="section-heading"><h3>รายการที่ยังไม่ผ่านนิยาม</h3><span class="hint">ไม่นับ · ${num(results.pendingTotal)}</span></div><ul class="venue-list">${results.pending.map(pendingRow).join('')}</ul>${results.pendingTotal > results.pending.length ? `<p class="hint">แสดง ${num(results.pending.length)} รายการแรก</p>` : ''}</section>` : ''}
    ${dataLine(asOf)}`;
}

/* ---------- District ---------- */

export function renderDistrict(p, {asOf = ''} = {}) {
  if (!p) return '';
  const word = unitWord(p.province);
  return `<section class="detail-head">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <p class="eyebrow">${esc(word)}${p.rank ? ` · อันดับ ${num(p.rank)} จาก ${num(p.of)} ของ${esc(provinceShort(p.province))} ตามแห่ง/ตร.กม.` : ''}</p>
      <h2>${esc(p.label)}</h2><p class="subtle">${esc(p.provinceName)} · พื้นที่ ${esc(formatDensity(p.areaKm2))} ตร.กม.</p>
      <div class="metrics compact">${metricTile(p.summary.venues, 'สถานที่', 'venue')}${metricTile(formatDensity(p.density), 'แห่ง/ตร.กม.', 'area')}${metricTile(p.summary.operators, 'ผู้บริหาร')}${metricTile(p.summary.stores, 'ร้านที่ยืนยัน', 'store')}</div>
      <div class="detail-actions"><button type="button" class="btn" data-action="open-table">ดูรายการ</button><button type="button" class="btn quiet" data-action="open-charts">เทียบ${esc(word)}</button></div>
    </section>
    ${p.groups.length ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'กลุ่มประเภท')}<span class="hint">แห่ง</span></div>${groupBars(p.groups, p.summary.venues)}</section>` : ''}
    <section class="panel-section"><div class="section-heading">${heading('venue', `สถานที่ใน${word}นี้`)}<span class="hint">${num(p.venues.length)} แห่ง</span></div>${p.venues.length ? venueList(p.venues, {limit: 20}) : '<p class="hint">ไม่มีสถานที่ที่ผ่านนิยามในตัวกรองนี้ (0 แห่ง)</p>'}</section>
    ${p.operators.length ? `<section class="panel-section"><div class="section-heading"><h3>ผู้บริหาร</h3><span class="hint">จำนวนสถานที่</span></div><ul class="plain-list">${p.operators.map(o => `<li><span>${esc(o.label)}</span><span class="data-number">${num(o.count)}</span></li>`).join('')}</ul></section>` : ''}
    ${statusLists(p.planned, p.closed)}
    ${dataLine(asOf)}`;
}

/* ---------- Venue ---------- */

function fact(label, value) {
  return value ? `<dt>${esc(label)}</dt><dd>${value}</dd>` : '';
}
const missing = '<span class="hint">ยังไม่มีข้อมูล</span>';

function sizeFacts(size) {
  if (!size) return '';
  const out = [];
  const m2 = v => `${num(v)} ตร.ม.`;
  if (size.glaReported) out.push(`พื้นที่เช่า ${m2(size.glaReported)} <span class="hint">ตามที่แหล่งรายงาน</span>`);
  if (size.gfaReported) out.push(`พื้นที่อาคารรวม ${m2(size.gfaReported)} <span class="hint">ตามที่แหล่งรายงาน</span>`);
  if (size.siteAreaReported) out.push(`ที่ดิน ${m2(size.siteAreaReported)} <span class="hint">ตามที่แหล่งรายงาน</span>`);
  if (size.floorsReported) out.push(`${num(size.floorsReported)} ชั้น <span class="hint">ตามที่แหล่งรายงาน</span>`);
  if (size.tenantsReported) out.push(`ร้านในไดเรกทอรี ${num(size.tenantsReported)} ร้าน${size.tenantsDate ? ` <span class="hint">ณ ${esc(thaiDate(size.tenantsDate))}</span>` : ''}`);
  // Decision D3: legacy estimates appear only here, with their method, never summed or ranked.
  if (size.legacy && (size.legacy.gla || size.legacy.gfa)) {
    const parts = [size.legacy.gla ? `พื้นที่เช่า ~${m2(size.legacy.gla)}` : '', size.legacy.gfa ? `พื้นที่อาคาร ~${m2(size.legacy.gfa)}` : ''].filter(Boolean).join(' · ');
    out.push(`<span class="estimate">${parts}</span><span class="hint">ค่าประมาณจากทะเบียนเดิม ไม่ใช่ GLA ทางการ · วิธี: ${esc(legacyBasis(size.legacy.basis))}${size.legacy.basis ? ` <code>${esc(size.legacy.basis)}</code>` : ''}</span>`);
  }
  return out.map(x => `<span class="size-line">${x}</span>`).join('');
}

function evidenceRows(row, d) {
  const ev = d?.ev || {};
  const rowsHtml = [];
  const item = (label, text, url, date) => rowsHtml.push(`<li><span class="ev-label">${esc(label)}</span><span class="ev-text">${esc(text || 'ตามแหล่งที่บันทึก')}${date ? ` · ${esc(thaiDate(date))}` : ''}</span>${url ? link(url, 'แหล่ง') : '<span class="hint">ไม่มีลิงก์สาธารณะ</span>'}</li>`);
  item('ชื่อไทย', nameBasis(ev.nameTh?.basis), ev.nameTh?.url);
  if (d?.nameEn && d.nameEn !== d.nameTh) item('ชื่ออังกฤษ', nameBasis(ev.nameEn?.basis), ev.nameEn?.url);
  item('ประเภท', typeEvidence(ev.type?.status), ev.type?.url, ev.type?.checkedOn);
  if (row.groupBasis === 'owner') rowsHtml.push(`<li><span class="ev-label">กลุ่มบนหน้าจอ</span><span class="ev-text">เจ้าของข้อมูลระบุว่าเป็นศูนย์การค้า · ${esc(thaiDate('2026-10-25'))}</span></li>`);
  item('ผ่านนิยาม', tierReading(row), ev.qualification?.url);
  item('สถานะ', operationReading(row.operationGroup), ev.operation?.url);
  if (hasPoint(row)) item('พิกัด', coordinateReading(d?.coordinateRole, d?.coordinateStatus), ev.coordinate?.url);
  item('ตัวตน', 'แหล่งยืนยันตัวตนสถานที่', ev.identity?.url);
  if (ev.research?.urls?.length) rowsHtml.push(`<li><span class="ev-label">ค้นเพิ่ม</span><span class="ev-text">แหล่งทางการที่ใช้เติมข้อมูล${ev.research.checkedOn ? ` · ${esc(thaiDate(ev.research.checkedOn))}` : ''}</span><span class="ev-links">${ev.research.urls.slice(0, 4).map((u, i) => link(u, `${i + 1}`)).join(' ')}</span></li>`);
  return rowsHtml.join('');
}

/**
 * Venue panel. profile from buildVenueProfile; detail may still be loading (null).
 * buildings: host features drawn for this venue (for the height reading).
 */
export function renderVenue(p, {asOf = '', buildings = [], detailError = false} = {}) {
  if (!p) return '';
  const r = p.row, d = p.detail, g = p.group;
  const logo = getVenueLogo(r.id, r.name);
  const word = p.district ? unitWord(p.district.province) : '';
  const area = p.district ? `<button type="button" class="link-button" data-action="select-district" data-id="${esc(p.district.code)}">${esc(word)}${esc(p.district.th)}</button>` : '';
  const hierarchy = hierarchyReading(r);
  const website = d ? link(d.website, 'เว็บไซต์ทางการ') : '';
  const directory = d ? link(d.directory, 'รายชื่อร้าน') : '';
  const hours = d?.hours ? `${esc(d.hours)}${hoursScope(d.hoursScope) ? `<br><span class="hint">${esc(hoursScope(d.hoursScope))}</span>` : ''}` : (d ? missing : '');
  const address = d?.address ? `${esc(d.address)}${p.addressDiffers ? `<br><span class="hint">ขอบเขตทางการของจุดนี้อยู่ใน${esc(p.province?.th || '')}</span>` : ''}` : (d ? missing : '');
  const coords = hasPoint(r) ? `<span class="data-number">${r.lat.toFixed(6)}, ${r.lon.toFixed(6)}</span>${d ? `<br><span class="hint">${esc(coordinateReading(d.coordinateRole, d.coordinateStatus))}</span>` : ''}` : '<span class="hint">ยังไม่มีพิกัดที่ผ่านเกณฑ์ จึงไม่อยู่บนแผนที่และไม่นับในพื้นที่</span>';
  const opened = d?.yearOpened ? `${esc(d.yearOpened + 543)}${d.openedDate ? ` · ${esc(thaiDate(d.openedDate))}` : ''} <span class="hint">ปีที่แหล่งรายงาน</span>` : '';
  const stores = d?.stores || {confirmed: r.storeCount || 0, datasets: []};
  const luxury = d?.luxuryPlace ? link(`${LUXURY_SITE}?place=${encodeURIComponent(d.luxuryPlace)}`, 'ดูแบรนด์หรูที่นี่ใน Luxury Brands', 'source-link strong-link') : '';
  const storeBlock = stores.confirmed
    ? `<p><strong class="data-number">${num(stores.confirmed)}</strong> ร้านที่ยืนยันแล้วว่าอยู่ในสถานที่นี้ จากชุดข้อมูล ${stores.datasets.map(x => esc(storeDataset(x))).join(' · ') || '—'}</p>${luxury ? `<p class="links">${luxury}</p>` : ''}`
    : `<p class="hint">ยังไม่มีร้านจากชุดข้อมูลร้านค้าที่ยืนยันว่าอยู่ในสถานที่นี้</p>${luxury ? `<p class="links">${luxury}</p>` : ''}`;
  const parent = p.parent ? `<p class="subtle">ส่วนหนึ่งของ <button type="button" class="link-button" data-action="select-venue" data-id="${esc(p.parent.id)}">${esc(p.parent.name)}</button></p>` : (!r.countable && (r.countHold || 'component') === 'component' ? '<p class="hint">ยังไม่พบโครงการแม่ในชุดที่ผ่านนิยาม</p>' : '');
  const children = p.children.length ? `<section class="panel-section"><div class="section-heading"><h3>พื้นที่ย่อยในโครงการ</h3><span class="hint">ไม่นับแยก</span></div>${venueList(p.children, {limit: 20})}</section>` : '';
  const heights = [...new Set(buildings.map(f => buildingHeightLabel(f.properties)))];
  const buildingText = r.hasBuilding
    ? `<p>มีรูปทรงอาคารที่ผ่านเกณฑ์${heights.length ? `<br><span class="hint">${heights.map(esc).join(' · ')}</span>` : ''}</p>`
    : '<p class="hint">ยังไม่มีรูปทรงอาคารที่ผ่านเกณฑ์ แสดงเป็นจุดอ้างอิง</p>';
  return `<section class="detail-head venue${logo ? ' has-venue-logo' : ''}">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      ${logo ? venueLogoMarkup(r.id, {name: r.name, size: 'lg', className: 'detail-venue-logo', decorative: false}) : ''}
      <p class="eyebrow">${groupSwatch(g)} ${esc(g.th)}${area ? ` · ${area}` : ''}${logo?.roleLabel ? ` · <span class="venue-logo-role">${esc(logo.roleLabel)}</span>` : ''}</p>
      <h2>${esc(r.name)}</h2>${r.nameEn && r.nameEn !== r.name ? `<p class="subtle">${esc(r.nameEn)}</p>` : ''}
      <p class="store-status">${statusPill(r)}${hierarchy ? `<span class="status-pill tone-neutral">${esc(hierarchy)}</span>` : ''}</p>
      ${parent}
      <dl class="facts">
        ${fact('ผู้บริหาร', r.operatorLabel ? esc(r.operatorLabel) : missing)}
        ${fact('ติดต่อ', [website, directory, d?.phone ? esc(d.phone) : ''].filter(Boolean).join(' · ') || (d ? missing : ''))}
        ${fact('เวลาเปิด', hours)}
        ${fact('เปิดเมื่อ', opened)}
        ${fact('ขนาด', sizeFacts(d?.size))}
        ${fact('ที่อยู่', address)}
        ${fact('พิกัด', coords)}
        ${fact('ตรวจเมื่อ', d?.checkedOn ? esc(thaiDate(d.checkedOn)) : '')}
      </dl>
      ${!d && !detailError ? '<p class="hint">กำลังโหลดรายละเอียด…</p>' : ''}${detailError ? '<p class="hint">โหลดรายละเอียดไม่สำเร็จ ข้อมูลหลักยังถูกต้อง</p>' : ''}
    </section>
    <section class="panel-section"><div class="section-heading">${heading('store', 'มีร้านอะไรอยู่ข้างใน')}<span class="hint">ร้านที่ยืนยันแล้ว</span></div>${storeBlock}</section>
    ${children}
    <section class="panel-section"><div class="section-heading">${heading('venue', 'อาคาร')}</div>${buildingText}</section>
    <section class="panel-section evidence"><details${d ? '' : ' hidden'}><summary>หลักฐานรายช่อง</summary><ul class="evidence-list">${d ? evidenceRows(r, d) : ''}</ul>
      <p class="hint ids">รหัส <code>${esc(r.id)}</code>${r.scId && r.scId !== r.id ? ` · Shopping Center <code>${esc(r.scId)}</code>` : ''}${d?.citymeterId ? ` · CityMETER <code>${esc(d.citymeterId)}</code>` : ''}${d?.ev?.identity?.production ? ` · ${link(d.ev.identity.production, 'บันทึกใน CityMETER')}` : ''}</p></details></section>
    ${dataLine(asOf)}`;
}

/* ---------- Pending record ---------- */

export function renderPending(c, {asOf = ''} = {}) {
  if (!c) return '';
  const word = c.district ? unitWord(c.district.province) : '';
  return `<section class="detail-head pending">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <p class="eyebrow"><i class="pending-swatch" aria-hidden="true"></i> ${c.reviewed ? 'ตรวจแล้ว ยังยืนยันนิยามไม่ได้' : 'รายการรอตรวจนิยาม'}</p>
      <h2>${esc(c.name)}</h2>
      <p class="subtle">${esc(c.group.th)} ตามแหล่งเดิม${c.district ? ` · <button type="button" class="link-button" data-action="select-district" data-id="${esc(c.district.code)}">${esc(word)}${esc(c.district.th)}</button>` : ''}${c.province ? ` · ${esc(c.province.th)}` : ''}</p>
      <p class="aha-copy">${c.reviewed ? 'ตรวจนิยามแล้วแต่ยังยืนยันไม่ได้ว่าเข้านิยามสถานที่ค้าปลีก จึงไม่นับในตัวเลขใด ๆ' : 'ยังไม่นับในตัวเลขใด ๆ จนกว่าจะตรวจได้ว่าเข้านิยาม: มีหลายกิจการขายผู้บริโภคและมีผู้บริหารพื้นที่ร่วมรายเดียว หรือเข้ากฎรายประเภทที่เจ้าของข้อมูลยอมรับ'}</p>
      <dl class="facts">${fact('พิกัด', `<span class="data-number">${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}</span><br><span class="hint">จุดอ้างอิงจากทะเบียน ไม่ใช่ประตูทางเข้า</span>`)}${fact('รหัส', `<code>${esc(c.id)}</code>`)}</dl>
    </section>${dataLine(asOf)}`;
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

/**
 * Comparison charts rendered as plain HTML/SVG — no chart vendor.
 *
 *  rank      : areas of the reading ranked — districts by venues per km² (LDS density.area,
 *              the map's colours) or provinces by venue count (LDS count) for the country.
 *  mix       : area × group matrix of venue counts, every cell the same size (only the
 *              number and its count class carry meaning), group columns with their shape cue.
 *  operators : venues per operator group — “สัดส่วนจำนวนสถานที่”, a count share of the venues
 *              in the scope (LDS Location Profile li.market_share: not a sales market share).
 *
 * Every mark is a real <button>; clicks emit {type:'area', id} or {type:'operator', id}.
 */
import {rankAreas, groupMatrix} from './chart-model.js';
import {buildRamp, classify, formatDensity, rampLegendHTML} from './scales.js';
import {GROUPS, groupById} from './model.js';
import {cueSVG} from './cues.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => NUMBER.format(n);
const pct = (a, b) => (b ? `${new Intl.NumberFormat('th-TH', {maximumFractionDigits: a / b < 0.1 ? 1 : 0}).format((a / b) * 100)}%` : '');

function empty(element, message) {
  element.innerHTML = `<div class="chart-empty"><p>${esc(message)}</p></div>`;
}

function ranking(element, {areas, kind, unitWord, select, selectedId}) {
  const ranked = rankAreas(areas, {kind}).filter(a => a.count > 0);
  if (!ranked.length) { empty(element, 'ไม่มีสถานที่ในตัวกรองนี้'); return; }
  const value = a => (kind === 'district' ? a.density : a.count);
  const max = Math.max(...ranked.map(value)) || 1;
  const rows = ranked.map((a, i) => {
    const pressed = a.id === selectedId;
    const shown = kind === 'district' ? formatDensity(a.density) : num(a.count);
    return `<li><button type="button" class="bar-row${pressed ? ' is-selected' : ''}" data-area="${esc(a.id)}" aria-pressed="${pressed}"
      aria-label="อันดับ ${i + 1} ${esc(a.label || a.name)}: ${kind === 'district' ? `${esc(shown)} แห่งต่อตารางกิโลเมตร, ` : ''}${num(a.count)} แห่ง">
      <span class="bar-rank data-number" aria-hidden="true">${i + 1}</span>
      <span class="bar-label">${esc(a.name)}</span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${Math.max(2, Math.round((value(a) / max) * 100))}%;background:${esc(a.fill)}"></span></span>
      <span class="bar-value" aria-hidden="true"><b class="data-number">${esc(shown)}</b><small>${kind === 'district' ? `${num(a.count)} แห่ง` : 'แห่ง'}</small></span>
    </button></li>`;
  }).join('');
  const caption = kind === 'district'
    ? `${num(ranked.length)} ${unitWord}ที่มีสถานที่ · เรียงตามแห่ง/ตร.กม. · สีเดียวกับแผนที่`
    : `${num(ranked.length)} จังหวัดที่มีสถานที่ · เรียงตามจำนวน · สีเดียวกับแผนที่`;
  element.innerHTML = `<p class="chart-caption">${caption}</p><ol class="chart-bars">${rows}</ol>`;
  element.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => select({type: 'area', id: b.dataset.area})));
}

function matrix(element, {areas, kind, unitWord, select, selectedId}) {
  const m = groupMatrix(rankAreas(areas, {kind}), {areaLimit: 12});
  if (!m.areas.length) { empty(element, 'ไม่มีสถานที่ในตัวกรองนี้'); return; }
  const ramp = buildRamp(m.cells.map(c => c.count), {kind: 'count'});
  const head = m.groups.map(g => `<th scope="col" title="${esc(g.th)}"><span class="matrix-col"><i class="cue-swatch category-${g.series}" aria-hidden="true">${cueSVG(g.cue)}</i>${esc(g.short)}</span></th>`).join('');
  const body = m.areas.map(a => {
    const pressed = a.id === selectedId;
    const cells = m.groups.map(g => {
      const count = a.groups?.[g.id] || 0;
      const cls = classify(count, ramp);
      const style = cls.state === 'measured_zero'
        ? `background:${cls.fill};color:${cls.ink};box-shadow:inset 0 0 0 2px var(--data-zero-outline)`
        : `background:${cls.fill};color:${cls.ink}`;
      return `<td><button type="button" class="matrix-cell is-${cls.state}" data-area="${esc(a.id)}" style="${style}"
        aria-label="${esc(a.name)} × ${esc(g.th)}: ${num(count)} แห่ง" title="${esc(a.name)} × ${esc(g.th)} — ${num(count)} แห่ง"><span class="data-number${cls.plate ? ' on-plate' : ''}">${num(count)}</span></button></td>`;
    }).join('');
    return `<tr${pressed ? ' class="is-selected"' : ''}><th scope="row"><button type="button" class="matrix-row" data-area="${esc(a.id)}" aria-pressed="${pressed}">${esc(a.name)}<small class="data-number">${num(a.count)}</small></button></th>${cells}</tr>`;
  }).join('');
  const columns = `<colgroup><col class="matrix-head-col">${m.groups.map(() => '<col class="matrix-cell-col">').join('')}</colgroup>`;
  element.innerHTML = `<p class="chart-caption">${num(m.areas.length)}/${num(m.totalAreas)} ${kind === 'district' ? unitWord : 'จังหวัด'} × ${num(m.groups.length)} กลุ่มประเภท · ตัวเลข = จำนวนสถานที่ · ทุกช่องขนาดเท่ากัน</p>
    <div class="matrix-scroll"><table class="matrix" style="--matrix-columns:${m.groups.length}">${columns}<thead><tr><th scope="col" class="matrix-corner">${kind === 'district' ? esc(unitWord) : 'จังหวัด'} · แห่ง</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="chart-legend"><span class="legend-title">สีของช่อง: จำนวนสถานที่ ไล่ 41 ระดับตามลำดับค่า</span>${rampLegendHTML(ramp, {zero: m.cells.some(c => !c.count), unit: 'แห่ง'})}</p>`;
  element.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => select({type: 'area', id: b.dataset.area})));
}

function operators(element, {operatorRows, total, select, selectedOperator}) {
  if (!total) { empty(element, 'ไม่มีสถานที่ในตัวกรองนี้'); return; }
  const top = operatorRows.slice(0, 12);
  const restCount = operatorRows.slice(12).reduce((s, o) => s + o.count, 0);
  const known = operatorRows.reduce((s, o) => s + o.count, 0);
  const unknown = total - known;
  const max = Math.max(1, ...top.map(o => o.count), restCount, unknown);
  const bar = (o, {id = '', label, count, quiet = false}) => {
    const pressed = id && id === selectedOperator;
    return `<li><button type="button" class="bar-row operator${pressed ? ' is-selected' : ''}${quiet ? ' is-quiet' : ''}" data-operator="${esc(id)}" aria-pressed="${Boolean(pressed)}" ${id ? '' : 'disabled'}
      aria-label="${esc(label)}: ${num(count)} แห่ง (${pct(count, total)} ของสถานที่ในตัวกรอง)">
      <span class="bar-label">${esc(label)}</span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill operator-fill" style="width:${Math.max(2, Math.round((count / max) * 100))}%"></span></span>
      <span class="bar-value" aria-hidden="true"><b class="data-number">${num(count)}</b><small>${pct(count, total)}</small></span>
    </button></li>`;
  };
  const rows = [
    // Only operator groups from the name table filter the map; a single named operator is read, not filtered.
    ...top.map(o => bar(o, {id: o.grouped ? o.id : '', label: o.label, count: o.count})),
    restCount ? bar(null, {label: `ผู้บริหารรายอื่น ${num(operatorRows.length - top.length)} ราย`, count: restCount, quiet: true}) : '',
    unknown ? bar(null, {id: '__none__', label: 'ยังไม่ระบุผู้บริหาร', count: unknown, quiet: true}) : '',
  ].join('');
  element.innerHTML = `<p class="chart-caption">สัดส่วนจำนวนสถานที่ตามผู้บริหาร · ${num(total)} แห่งในตัวกรอง · ไม่ใช่ส่วนแบ่งยอดขาย · จัดกลุ่มชื่อบริษัทตามตารางในเอกสารวิธี</p><ol class="chart-bars">${rows}</ol>`;
  element.querySelectorAll('[data-operator]:not([disabled])').forEach(b => b.addEventListener('click', () => select({type: 'operator', id: b.dataset.operator})));
}

/**
 * Render one view into #elementId. Returns an idempotent disposer.
 * areas: district or province summaries with fill; kind: 'district' | 'province'.
 */
export function renderInsightChart({elementId, view = 'rank', areas = [], kind = 'district', unitWord = 'เขต', operatorRows = [], total = 0, selectedId = '', selectedOperator = '', theme} = {}, onSelect = () => {}) {
  const element = document.getElementById(elementId);
  if (!element) return () => {};
  const select = typeof onSelect === 'function' ? onSelect : () => {};
  element.replaceChildren();
  if (theme) element.dataset.chartTheme = theme;
  const labels = {rank: 'พื้นที่เรียงตามความหนาแน่นหรือจำนวนสถานที่', mix: 'กลุ่มประเภทในแต่ละพื้นที่', operators: 'จำนวนสถานที่ตามผู้บริหาร'};
  element.setAttribute('aria-label', labels[view] || labels.rank);
  try {
    if (view === 'mix') matrix(element, {areas, kind, unitWord, select, selectedId});
    else if (view === 'operators') operators(element, {operatorRows, total, select, selectedOperator});
    else ranking(element, {areas, kind, unitWord, select, selectedId});
  } catch (error) {
    console.error('CityMETER chart could not render:', error);
    empty(element, 'แสดงกราฟไม่ได้ในขณะนี้ โปรดดูข้อมูลเดียวกันในตาราง');
  }
  return () => element.replaceChildren();
}

export {GROUPS, groupById};

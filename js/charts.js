/**
 * Comparison charts for exploring the reading (owner instruction 2026-10-25: amCharts for
 * insight exploration, LDS icons to keep labels short).
 *
 * amCharts 5 (v5.20.8, self-hosted in vendor/amcharts5 with its LICENSE — free linkware
 * licence, so the amCharts logo stays on every chart) draws the interactive views: hover and
 * keyboard tooltips, a metric switch, legend toggles, and a click (or Enter) that drills down.
 * The plain HTML renderer is the fallback when the library cannot load.
 *
 *  rank      : areas of the reading ranked — districts by venues per km² (LDS density, the
 *              map's own 41-sample colours) or provinces by venue count (LDS count); the switch
 *              re-ranks by count. Click → that district / province.
 *  mix       : type mix of the top 12 areas, stacked by group (series colour + shape cue in the
 *              legend), as share or as count; legend buttons hide or show a group.
 *  operators : venues per operator group — “สัดส่วนจำนวนสถานที่”, a count share of the venues in
 *              the scope (LDS Location Profile li.market_share: not a sales share). Click → filter.
 *
 * Colours come from the page tokens (assets/theme.css) and the ramp the map uses; nothing is
 * mixed or re-derived per theme here.
 */
import {rankAreas, groupMatrix} from './chart-model.js';
import {buildRamp, classify, formatDensity, rampLegendHTML} from './scales.js';
import {GROUPS, groupById} from './model.js';
import {cueSVG} from './cues.js';

export const AMCHARTS = Object.freeze({
  version: '5.20.8', module: 'vendor/amcharts5/amcharts5-5.20.8.mjs', license: 'vendor/amcharts5/LICENSE',
  note: 'Free amCharts licence (linkware): the amCharts logo is kept on every chart.',
});

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => NUMBER.format(n);
const pct = (a, b) => (b ? `${new Intl.NumberFormat('th-TH', {maximumFractionDigits: a / b < 0.1 ? 1 : 0}).format((a / b) * 100)}%` : '');

/* ---------- view options the user switches (kept for the session) ---------- */
const options = {rankBy: 'density', mixAs: 'share', hiddenGroups: new Set()};
export const chartOptions = () => ({rankBy: options.rankBy, mixAs: options.mixAs, hiddenGroups: [...options.hiddenGroups]});

/* ---------- pure models for the views (tested) ---------- */

/** Rank rows: districts by density (or count), provinces by count. */
export function rankModel(areas, {kind = 'district', by = 'density'} = {}) {
  const ranked = rankAreas(areas, {kind}).filter(a => a.count > 0);
  const byCount = kind !== 'district' || by === 'count';
  const list = byCount ? [...ranked].sort((a, b) => b.count - a.count || String(a.id).localeCompare(String(b.id))) : ranked;
  return list.map((a, i) => ({
    id: a.id, name: a.name, label: a.label || a.name, rank: i + 1, fill: a.fill, count: a.count,
    density: a.density, areaKm2: a.areaKm2,
    value: byCount ? a.count : a.density,
    valueText: byCount ? `${num(a.count)} แห่ง` : `${formatDensity(a.density)} แห่ง/ตร.กม.`,
  }));
}

/** Mix rows: one per area (top 12), a count per present group. */
export function mixModel(areas, {kind = 'district'} = {}) {
  const m = groupMatrix(rankAreas(areas, {kind}), {areaLimit: 12});
  return {
    groups: m.groups,
    rows: m.areas.map(a => ({id: a.id, name: a.name, total: a.count, ...Object.fromEntries(m.groups.map(g => [g.id, a.groups?.[g.id] || 0]))})),
    totalAreas: m.totalAreas,
  };
}

/** Operator rows: top 12 groups, the rest, and venues without a known operator. */
export function operatorModel(operatorRows, total, {top = 12} = {}) {
  const head = operatorRows.slice(0, top);
  const restCount = operatorRows.slice(top).reduce((s, o) => s + o.count, 0);
  const known = operatorRows.reduce((s, o) => s + o.count, 0);
  const unknown = Math.max(0, total - known);
  return [
    ...head.map(o => ({id: o.grouped ? o.id : '', label: o.label, count: o.count, share: total ? o.count / total : 0, quiet: false})),
    ...(restCount ? [{id: '', label: `ผู้บริหารรายอื่น ${num(operatorRows.length - head.length)} ราย`, count: restCount, share: restCount / total, quiet: true}] : []),
    ...(unknown ? [{id: '__none__', label: 'ยังไม่ระบุผู้บริหาร', count: unknown, share: unknown / total, quiet: true}] : []),
  ];
}

/* ---------- plain HTML (fallback) ---------- */

function empty(element, message) {
  element.innerHTML = `<div class="chart-empty"><p>${esc(message)}</p></div>`;
}

function htmlRanking(element, {areas, kind, unitWord, select, selectedId}) {
  const rows = rankModel(areas, {kind, by: options.rankBy});
  if (!rows.length) { empty(element, 'ไม่มีสถานที่ในตัวกรองนี้'); return; }
  const max = Math.max(...rows.map(r => r.value)) || 1;
  element.innerHTML = `<p class="chart-caption">${num(rows.length)} ${kind === 'district' ? unitWord : 'จังหวัด'} · สีเดียวกับแผนที่</p><ol class="chart-bars">${rows.map(r => `<li><button type="button" class="bar-row${r.id === selectedId ? ' is-selected' : ''}" data-area="${esc(r.id)}" aria-pressed="${r.id === selectedId}" aria-label="อันดับ ${r.rank} ${esc(r.label)}: ${esc(r.valueText)}">
      <span class="bar-rank data-number" aria-hidden="true">${r.rank}</span><span class="bar-label">${esc(r.name)}</span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${Math.max(2, Math.round((r.value / max) * 100))}%;background:${esc(r.fill)}"></span></span>
      <span class="bar-value" aria-hidden="true"><b class="data-number">${esc(kind === 'district' && options.rankBy !== 'count' ? formatDensity(r.density) : num(r.count))}</b><small>${kind === 'district' && options.rankBy !== 'count' ? `${num(r.count)} แห่ง` : 'แห่ง'}</small></span></button></li>`).join('')}</ol>`;
  element.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => select({type: 'area', id: b.dataset.area})));
}

function htmlMatrix(element, {areas, kind, unitWord, select, selectedId}) {
  const m = groupMatrix(rankAreas(areas, {kind}), {areaLimit: 12});
  if (!m.areas.length) { empty(element, 'ไม่มีสถานที่ในตัวกรองนี้'); return; }
  const ramp = buildRamp(m.cells.map(c => c.count), {kind: 'count'});
  const head = m.groups.map(g => `<th scope="col" title="${esc(g.th)}"><span class="matrix-col"><i class="cue-swatch category-${g.series}" aria-hidden="true">${cueSVG(g.cue)}</i>${esc(g.short)}</span></th>`).join('');
  const body = m.areas.map(a => {
    const cells = m.groups.map(g => {
      const count = a.groups?.[g.id] || 0;
      const cls = classify(count, ramp);
      const style = cls.state === 'measured_zero' ? `background:${cls.fill};color:${cls.ink};box-shadow:inset 0 0 0 2px var(--data-zero-outline)` : `background:${cls.fill};color:${cls.ink}`;
      return `<td><button type="button" class="matrix-cell is-${cls.state}" data-area="${esc(a.id)}" style="${style}" aria-label="${esc(a.name)} × ${esc(g.th)}: ${num(count)} แห่ง"><span class="data-number${cls.plate ? ' on-plate' : ''}">${num(count)}</span></button></td>`;
    }).join('');
    return `<tr${a.id === selectedId ? ' class="is-selected"' : ''}><th scope="row"><button type="button" class="matrix-row" data-area="${esc(a.id)}" aria-pressed="${a.id === selectedId}">${esc(a.name)}<small class="data-number">${num(a.count)}</small></button></th>${cells}</tr>`;
  }).join('');
  element.innerHTML = `<p class="chart-caption">${num(m.areas.length)}/${num(m.totalAreas)} ${kind === 'district' ? esc(unitWord) : 'จังหวัด'} · ตัวเลข = จำนวนสถานที่</p>
    <div class="matrix-scroll"><table class="matrix" style="--matrix-columns:${m.groups.length}"><colgroup><col class="matrix-head-col">${m.groups.map(() => '<col class="matrix-cell-col">').join('')}</colgroup><thead><tr><th scope="col" class="matrix-corner">${kind === 'district' ? esc(unitWord) : 'จังหวัด'} · แห่ง</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="chart-legend"><span class="legend-title">สีของช่อง: จำนวนสถานที่</span>${rampLegendHTML(ramp, {zero: m.cells.some(c => !c.count), unit: 'แห่ง'})}</p>`;
  element.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => select({type: 'area', id: b.dataset.area})));
}

function htmlOperators(element, {operatorRows, total, select, selectedOperator}) {
  if (!total) { empty(element, 'ไม่มีสถานที่ในตัวกรองนี้'); return; }
  const rows = operatorModel(operatorRows, total);
  const max = Math.max(1, ...rows.filter(r => !r.quiet).map(r => r.count));
  element.innerHTML = `<p class="chart-caption">สัดส่วนจำนวนสถานที่ตามผู้บริหาร · ${num(total)} แห่ง</p><ol class="chart-bars">${rows.map(r => `<li><button type="button" class="bar-row operator${r.id && r.id === selectedOperator ? ' is-selected' : ''}${r.quiet ? ' is-quiet' : ''}" data-operator="${esc(r.id)}" aria-pressed="${Boolean(r.id && r.id === selectedOperator)}" ${r.id ? '' : 'disabled'} aria-label="${esc(r.label)}: ${num(r.count)} แห่ง (${pct(r.count, total)})">
      <span class="bar-label">${esc(r.label)}</span><span class="bar-track" aria-hidden="true"><span class="bar-fill operator-fill" style="width:${Math.max(2, Math.min(100, Math.round((r.count / max) * 100)))}%"></span></span>
      <span class="bar-value" aria-hidden="true"><b class="data-number">${num(r.count)}</b><small>${pct(r.count, total)}</small></span></button></li>`).join('')}</ol>`;
  element.querySelectorAll('[data-operator]:not([disabled])').forEach(b => b.addEventListener('click', () => select({type: 'operator', id: b.dataset.operator})));
}

/* ---------- amCharts ---------- */

let library = null, libraryError = null, loading = null;
/** Load the self-hosted amCharts bundle once; resolves to {am5, am5xy, am5themes_Animated}. */
export function loadAmCharts() {
  if (library) return Promise.resolve(library);
  if (!loading) {
    loading = import(new URL(`../${AMCHARTS.module}`, import.meta.url).href)
      .then(m => { library = m; return m; })
      .catch(e => { libraryError = e; loading = null; throw e; });
  }
  return loading;
}

function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    text: v('--text-primary', '#182327'), muted: v('--text-metadata', '#5B6A6E'), border: v('--border-default', '#C9D0CB'),
    hairline: v('--border-hairline', '#DCE1DD'), surface: v('--surface-card', '#FCFCFA'), alt: v('--surface-alt', '#EEF1EE'),
    selected: v('--map-selected-stroke', '#176B82'), operator: v('--series-9-fill', '#8AA4AA'), quiet: v('--surface-soft', '#E7EBE8'),
    series: n => v(`--series-${n}-fill`, '#8AA4AA'),
  };
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One amCharts root with LDS type and colour; the amCharts logo is kept (licence). */
function makeRoot(lib, container, t) {
  const {am5, am5themes_Animated} = lib;
  const root = am5.Root.new(container);
  const ldsTheme = am5.Theme.new(root);
  ldsTheme.rule('Label').setAll({fontFamily: '"Bai Jamjuree", "IBM Plex Sans Thai", sans-serif', fontSize: 12, fill: am5.color(t.text)});
  ldsTheme.rule('Grid').setAll({stroke: am5.color(t.border), strokeOpacity: 0.5});
  ldsTheme.rule('Tooltip').setAll({getFillFromSprite: false, getLabelFillFromSprite: false, autoTextColor: false, pointerOrientation: 'horizontal'});
  ldsTheme.rule('PointedRectangle', ['tooltip', 'background']).setAll({fill: am5.color(t.surface), fillOpacity: 0.98, stroke: am5.color(t.border), strokeWidth: 1});
  ldsTheme.rule('Label', ['tooltip']).setAll({fill: am5.color(t.text), fontSize: 12, paddingTop: 4, paddingBottom: 4});
  root.setThemes(reduceMotion() ? [ldsTheme] : [am5themes_Animated.new(root), ldsTheme]);
  root.interfaceColors.setAll({text: am5.color(t.text), grid: am5.color(t.border), stroke: am5.color(t.border), background: am5.color(t.surface), alternativeBackground: am5.color(t.text), alternativeText: am5.color(t.surface)});
  root.numberFormatter.set('numberFormat', '#,###.#');
  root.locale = {...root.locale, _decimalSeparator: '.', _thousandSeparator: ','};
  return root;
}

function barChart(lib, root, t, {rows, valueField = 'value', ariaLabel, onPick, selectedId = '', colour}) {
  const {am5, am5xy} = lib;
  const chart = root.container.children.push(am5xy.XYChart.new(root, {panX: false, panY: false, wheelX: 'none', wheelY: 'none', layout: root.verticalLayout, paddingLeft: 0, paddingRight: 12, paddingTop: 4, paddingBottom: 4, ariaLabel}));
  const yRenderer = am5xy.AxisRendererY.new(root, {inversed: true, minGridDistance: 4, cellStartLocation: 0.12, cellEndLocation: 0.88});
  yRenderer.labels.template.setAll({fontSize: 12, maxWidth: 170, oversizedBehavior: 'truncate', textAlign: 'right', paddingRight: 6});
  yRenderer.grid.template.set('forceHidden', true);
  const yAxis = chart.yAxes.push(am5xy.CategoryAxis.new(root, {categoryField: 'name', renderer: yRenderer}));
  const xRenderer = am5xy.AxisRendererX.new(root, {minGridDistance: 70, strokeOpacity: 0});
  xRenderer.labels.template.setAll({fontSize: 11, fill: am5.color(t.muted)});
  const xAxis = chart.xAxes.push(am5xy.ValueAxis.new(root, {min: 0, renderer: xRenderer, extraMax: 0.12, numberFormat: '#,###.#'}));
  const series = chart.series.push(am5xy.ColumnSeries.new(root, {xAxis, yAxis, valueXField: valueField, categoryYField: 'name', sequencedInterpolation: !reduceMotion()}));
  series.columns.template.setAll({
    height: am5.percent(100), cornerRadiusTR: 3, cornerRadiusBR: 3, strokeOpacity: 0, cursorOverStyle: 'pointer',
    tooltipText: '{tip}', focusable: true, focusableGroup: 'bars', hoverOnFocus: true, ariaLabel: '{aria}', role: 'button',
    templateField: 'columnSettings',
  });
  series.columns.template.states.create('hover', {strokeOpacity: 1, stroke: am5.color(t.selected), strokeWidth: 2});
  series.bullets.push(() => am5.Bullet.new(root, {locationX: 1, sprite: am5.Label.new(root, {text: '{shown}', centerY: am5.p50, centerX: am5.p0, dx: 4, fontSize: 11, populateText: true, fill: am5.color(t.text)})}));
  series.columns.template.events.on('click', ev => { const d = ev.target.dataItem?.dataContext; if (d?.pick) onPick(d.pick); });
  const data = rows.map(r => ({...r, columnSettings: {fill: am5.color(r.fill || colour), stroke: am5.color(r.id && r.id === selectedId ? t.selected : t.border), strokeOpacity: r.id && r.id === selectedId ? 1 : 0, strokeWidth: 2, fillOpacity: r.quiet ? 0.55 : 1}}));
  yAxis.data.setAll(data);
  series.data.setAll(data);
  return chart;
}

function drawRank(lib, root, t, {areas, kind, unitWord, select, selectedId}) {
  const by = kind === 'district' ? options.rankBy : 'count';
  const rows = rankModel(areas, {kind, by}).map(r => ({
    ...r, shown: kind === 'district' && by === 'density' ? formatDensity(r.density) : num(r.count),
    tip: kind === 'district'
      ? `[bold]${r.name}[/]\n${formatDensity(r.density)} แห่ง/ตร.กม. · ${num(r.count)} แห่ง\nพื้นที่ ${formatDensity(r.areaKm2)} ตร.กม. · อันดับ ${r.rank}`
      : `[bold]${r.name}[/]\n${num(r.count)} แห่ง · อันดับ ${r.rank}`,
    aria: `อันดับ ${r.rank} ${r.label}: ${r.valueText}`, pick: {type: 'area', id: r.id},
  }));
  barChart(lib, root, t, {rows, ariaLabel: kind === 'district' ? `${unitWord}เรียงตาม${by === 'density' ? 'แห่งต่อตารางกิโลเมตร' : 'จำนวนสถานที่'}` : 'จังหวัดเรียงตามจำนวนสถานที่', onPick: select, selectedId});
  return rows.length;
}

function drawOperators(lib, root, t, {operatorRows, total, select, selectedOperator}) {
  // Named operators only: the long tail and the unknown are counted in the caption, so they never squash the bars.
  const rows = operatorModel(operatorRows, total).filter(r => !r.quiet).map(r => ({
    ...r, name: r.label, value: r.count, fill: r.quiet ? t.quiet : t.operator, shown: `${num(r.count)} · ${pct(r.count, total)}`,
    tip: `[bold]${r.label}[/]\n${num(r.count)} แห่ง · ${pct(r.count, total)} ของสถานที่ในตัวกรอง${r.id && r.id !== '__none__' ? '\nกดเพื่อดูเฉพาะผู้บริหารนี้' : ''}`,
    aria: `${r.label}: ${num(r.count)} แห่ง ${pct(r.count, total)}`, pick: r.id ? {type: 'operator', id: r.id} : null,
  }));
  barChart(lib, root, t, {rows, ariaLabel: 'สัดส่วนจำนวนสถานที่ตามผู้บริหาร', onPick: select, selectedId: selectedOperator});
  return rows.length;
}

function drawMix(lib, root, t, {areas, kind, select, selectedId}) {
  const {am5, am5xy} = lib;
  const m = mixModel(areas, {kind});
  const share = options.mixAs === 'share';
  const chart = root.container.children.push(am5xy.XYChart.new(root, {panX: false, panY: false, wheelX: 'none', wheelY: 'none', layout: root.verticalLayout, paddingLeft: 0, paddingRight: 8, paddingTop: 4, paddingBottom: 4, ariaLabel: 'ประเภทในแต่ละพื้นที่'}));
  const yRenderer = am5xy.AxisRendererY.new(root, {inversed: true, minGridDistance: 4, cellStartLocation: 0.12, cellEndLocation: 0.88});
  yRenderer.labels.template.setAll({fontSize: 12, maxWidth: 170, oversizedBehavior: 'truncate', paddingRight: 6, cursorOverStyle: 'pointer'});
  yRenderer.grid.template.set('forceHidden', true);
  const yAxis = chart.yAxes.push(am5xy.CategoryAxis.new(root, {categoryField: 'name', renderer: yRenderer}));
  const xRenderer = am5xy.AxisRendererX.new(root, {minGridDistance: 70, strokeOpacity: 0});
  xRenderer.labels.template.setAll({fontSize: 11, fill: am5.color(t.muted)});
  const xAxis = chart.xAxes.push(am5xy.ValueAxis.new(root, share ? {min: 0, max: 100, strictMinMax: true, calculateTotals: true, numberFormat: "#'%'", renderer: xRenderer} : {min: 0, calculateTotals: true, renderer: xRenderer, numberFormat: '#,###'}));
  for (const g of m.groups) {
    const series = chart.series.push(am5xy.ColumnSeries.new(root, {
      name: g.th, xAxis, yAxis, stacked: true, valueXField: g.id, categoryYField: 'name',
      valueXShow: share ? 'valueXTotalPercent' : 'valueX', fill: am5.color(t.series(g.series)), stroke: am5.color(t.surface),
    }));
    series.columns.template.setAll({
      height: am5.percent(100), strokeWidth: 1, cursorOverStyle: 'pointer', focusable: true, focusableGroup: 'mix', hoverOnFocus: true, role: 'button',
      tooltipText: `[bold]{categoryY}[/]\n${g.th}: {valueX} แห่ง ({valueXTotalPercent.formatNumber('#.#')}%)`,
      ariaLabel: `{categoryY} ${g.th} {valueX} แห่ง`,
    });
    series.columns.template.events.on('click', ev => { const d = ev.target.dataItem?.dataContext; if (d?.id) select({type: 'area', id: d.id}); });
    series.data.setAll(m.rows);
    if (options.hiddenGroups.has(g.id)) series.hide(0);
  }
  yAxis.data.setAll(m.rows.map(r => ({...r, name: r.name})));
  return m;
}

/**
 * Render one view into #elementId. Returns an idempotent disposer.
 * areas: district or province summaries with fill; kind: 'district' | 'province'.
 */
let renderToken = 0;
export function renderInsightChart({elementId, view = 'rank', areas = [], kind = 'district', unitWord = 'เขต', operatorRows = [], total = 0, selectedId = '', selectedOperator = '', theme} = {}, onSelect = () => {}) {
  const element = document.getElementById(elementId);
  if (!element) return () => {};
  const select = typeof onSelect === 'function' ? onSelect : () => {};
  const token = ++renderToken;
  let root = null, disposed = false;
  const params = {areas, kind, unitWord, operatorRows, total, selectedId, selectedOperator, select};
  const labels = {rank: 'พื้นที่เรียงตามความหนาแน่นหรือจำนวนสถานที่', mix: 'ประเภทในแต่ละพื้นที่', operators: 'จำนวนสถานที่ตามผู้บริหาร'};
  element.setAttribute('aria-label', labels[view] || labels.rank);
  if (theme) element.dataset.chartTheme = theme;

  const fallback = () => {
    element.replaceChildren();
    try {
      if (view === 'mix') htmlMatrix(element, params);
      else if (view === 'operators') htmlOperators(element, params);
      else htmlRanking(element, params);
    } catch (error) {
      console.error('CityMETER chart could not render:', error);
      empty(element, 'แสดงกราฟไม่ได้ในขณะนี้ ดูตัวเลขเดียวกันได้ในตาราง');
    }
  };

  const controls = () => {
    if (view === 'rank' && kind === 'district') {
      return `<div class="chart-controls" role="group" aria-label="เรียงตาม"><button type="button" class="chip-toggle" data-rank-by="density" aria-pressed="${options.rankBy === 'density'}">แห่ง/ตร.กม.</button><button type="button" class="chip-toggle" data-rank-by="count" aria-pressed="${options.rankBy === 'count'}">จำนวน</button></div>`;
    }
    if (view === 'mix') {
      return `<div class="chart-controls" role="group" aria-label="แสดงเป็น"><button type="button" class="chip-toggle" data-mix-as="share" aria-pressed="${options.mixAs === 'share'}">สัดส่วน</button><button type="button" class="chip-toggle" data-mix-as="count" aria-pressed="${options.mixAs === 'count'}">จำนวน</button></div>`;
    }
    return '';
  };

  const draw = lib => {
    if (disposed || token !== renderToken) return;
    const t = tokens();
    const hasData = view === 'operators' ? total > 0 : areas.some(a => a.count > 0);
    if (!hasData) { empty(element, 'ไม่มีสถานที่ในตัวกรองนี้'); return; }
    const ops = view === 'operators' ? operatorModel(operatorRows, total) : [];
    const count = view === 'mix' ? mixModel(areas, {kind}).rows.length : view === 'operators' ? ops.filter(r => !r.quiet).length : rankModel(areas, {kind}).length;
    const height = Math.max(180, count * 26 + 48);
    const caption = view === 'operators'
      ? `สัดส่วนจำนวนสถานที่ตามผู้บริหาร · ${num(total)} แห่ง`
      : view === 'mix' ? `${num(count)} ${kind === 'district' ? unitWord : 'จังหวัด'}แรก · ชี้เพื่อดูตัวเลข กดเพื่อเลือก`
        : `${num(count)} ${kind === 'district' ? unitWord : 'จังหวัด'}ที่มีสถานที่ · สีเดียวกับแผนที่ · กดเพื่อเลือก`;
    const tail = ops.filter(r => r.quiet).map(r => r.id
      ? `<button type="button" class="chip-toggle" data-operator="${esc(r.id)}" aria-pressed="${r.id === selectedOperator}">${esc(r.label)} <b class="data-number">${num(r.count)}</b></button>`
      : `<span class="chart-note">${esc(r.label)} <b class="data-number">${num(r.count)}</b> แห่ง</span>`).join('');
    const groups = view === 'mix' ? mixModel(areas, {kind}).groups : [];
    const legend = groups.length ? `<div class="chart-key" role="group" aria-label="ประเภท: กดเพื่อซ่อนหรือแสดง">${groups.map(g => `<button type="button" class="chip-toggle key-item" data-group="${esc(g.id)}" aria-pressed="${!options.hiddenGroups.has(g.id)}"><i class="cue-swatch category-${g.series}" aria-hidden="true">${cueSVG(g.cue)}</i>${esc(g.short)}</button>`).join('')}</div>` : '';
    element.innerHTML = `<div class="chart-head"><p class="chart-caption">${esc(caption)}</p>${controls()}</div>${legend}${tail ? `<div class="chart-key">${tail}</div>` : ''}<div class="am-chart" style="height:${height}px"></div>`;
    root?.dispose();
    root = makeRoot(lib, element.querySelector('.am-chart'), t);
    if (view === 'mix') drawMix(lib, root, t, params);
    else if (view === 'operators') drawOperators(lib, root, t, params);
    else drawRank(lib, root, t, params);
    element.querySelectorAll('[data-rank-by]').forEach(b => b.addEventListener('click', () => { options.rankBy = b.dataset.rankBy; draw(lib); }));
    element.querySelectorAll('.chart-key [data-operator]').forEach(b => b.addEventListener('click', () => select({type: 'operator', id: b.dataset.operator})));
    element.querySelectorAll('[data-mix-as]').forEach(b => b.addEventListener('click', () => { options.mixAs = b.dataset.mixAs; draw(lib); }));
    element.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.group;
      if (options.hiddenGroups.has(id)) options.hiddenGroups.delete(id); else options.hiddenGroups.add(id);
      b.setAttribute('aria-pressed', String(!options.hiddenGroups.has(id)));
      const series = root?.container.children.getIndex(0)?.series?.values?.find(s => s.get('name') === groupById(id).th);
      if (series) options.hiddenGroups.has(id) ? series.hide() : series.show();
    }));
  };

  if (library) draw(library);
  else {
    element.innerHTML = '<div class="chart-empty"><p>กำลังโหลดกราฟ…</p></div>';
    loadAmCharts().then(draw).catch(error => {
      console.warn('amCharts unavailable; plain charts instead', error?.message || error);
      if (!disposed && token === renderToken) fallback();
    });
  }
  return () => {
    disposed = true;
    try { root?.dispose(); } catch {}
    root = null;
    element.replaceChildren();
  };
}

export {GROUPS, groupById, libraryError};

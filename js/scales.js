/**
 * Analytical scales — LDS 0.9.7 (release v0.9.7-owner.1, color-srgb-10).
 *
 *  - `density.area` (districts: venues per km²) — sequential, gold/orange, the land-area
 *    denominator family. scaleVersion 554812a7c19107b3a9b8658ba541fc8e13519cb19708e885a425f32d5b30f101.
 *  - `count` (provinces: number of venues) — sequential, dusty cyan/navy, totals.
 *    scaleVersion 4ff5c1fb4be71ecd13c48685b38371b528bcd4ce369ce964a75354c2eb4d0980.
 *
 * Both LUTs are the exact approved 41-sample light tables, consumed unchanged on both
 * themes (themePolicy identical-light-values-on-both-themes); nothing is interpolated or
 * recoloured here. Every map fill, label and chart cell uses the full 41-sample ramp
 * (owner instruction 2026-10-25, `buildRamp`): the colour of a value is the LUT sample of its
 * rank among the measured nonzero values of the areas being read (the selected province's
 * districts, or every province/district when the country is read). The LDS class tables
 * (`classColors`, n ∈ {3,5,7,9} at index round(i × 40 / (n − 1))) remain for static tokens.
 * Zero is a measured fact (EVID-05 measured_zero: sample 0 + zero outline), never a level.
 */
export const DENSITY_SCALE = Object.freeze({
  scaleId: 'density.area',
  kind: 'sequential',
  unit: 'แห่ง/ตร.กม.',
  labelTh: 'ความหนาแน่นต่อพื้นที่',
  anchors: ['#FFF1D9', '#E6AB30', '#D6600C'],
  lut: Object.freeze([
    '#FFF1D9', '#FEEED2', '#FDEACA', '#FCE7C3', '#FAE3BC', '#F9E0B5', '#F8DCAD', '#F7D9A6',
    '#F6D59E', '#F4D297', '#F3CF8F', '#F2CB87', '#F1C87F', '#EFC477', '#EEC06F', '#EDBD66',
    '#EBB95D', '#EAB653', '#E9B249', '#E7AF3D', '#E6AB30', '#E5A72E', '#E5A42D', '#E4A02B',
    '#E49D2A', '#E39928', '#E29526', '#E29225', '#E18E23', '#E08A21', '#DF8720', '#DF831E',
    '#DE7F1C', '#DD7B1A', '#DC7818', '#DB7417', '#DA7015', '#D96C13', '#D86811', '#D7640E',
    '#D6600C',
  ]),
  noData: '#D5DAD6',
  zeroOutline: '#7D877F',
  scaleVersion: '554812a7c19107b3a9b8658ba541fc8e13519cb19708e885a425f32d5b30f101',
  themePolicy: 'identical-light-values-on-both-themes',
});

export const COUNT_SCALE = Object.freeze({
  scaleId: 'count',
  kind: 'sequential',
  unit: 'แห่ง',
  labelTh: 'จำนวนรวม',
  anchors: ['#F4F0E7', '#7DBAC0', '#213E70'],
  lut: Object.freeze([
    '#F4F0E7', '#EEEDE5', '#E8EBE3', '#E3E8E1', '#DDE5DF', '#D7E3DD', '#D1E0DB', '#CBDDD9',
    '#C5DAD7', '#C0D8D6', '#BAD5D4', '#B4D2D2', '#AED0D0', '#A8CDCE', '#A2CACC', '#9CC8CA',
    '#96C5C8', '#90C2C6', '#8ABFC4', '#83BDC2', '#7DBAC0', '#78B3BC', '#73ADB8', '#6EA7B4',
    '#69A0B0', '#649AAC', '#5F93A8', '#5A8DA4', '#5587A0', '#50809C', '#4C7A98', '#477494',
    '#436E90', '#3E688C', '#3A6288', '#355C84', '#315680', '#2D507C', '#294A78', '#254474',
    '#213E70',
  ]),
  noData: '#D5DAD6',
  zeroOutline: '#7D877F',
  scaleVersion: '4ff5c1fb4be71ecd13c48685b38371b528bcd4ce369ce964a75354c2eb4d0980',
  themePolicy: 'identical-light-values-on-both-themes',
});

const SCALES = {density: DENSITY_SCALE, count: COUNT_SCALE};

/** Label ink on a class fill: the darker/lighter foundation text that reaches the higher contrast. */
export function inkFor(fill) {
  const dark = '#182327', light = '#FFFFFF';
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light;
}

/**
 * Numbers set directly on a data fill need 4.5:1. Three count samples (27–29) and the two darkest density
 * samples reach it with neither ink, so text on them sits on a neutral plate (LDS: keep the data colour,
 * add a backplate) — `plate` in classify().
 */
export const needsPlate = fill => contrastRatio(fill, inkFor(fill)) < 4.5;

/** Exact class colours for n ∈ {3,5,7,9}: index round(i × 40 / (n − 1)). */
export function classColors(n = 5, scale = DENSITY_SCALE) {
  if (![3, 5, 7, 9].includes(n)) throw new RangeError('Class count must be 3, 5, 7 or 9');
  return Array.from({length: n}, (_, i) => scale.lut[Math.round((i * 40) / (n - 1))]);
}

/** Two significant digits, never zero for a positive value. */
export function roundSig(v, digits = 2) {
  if (!(v > 0)) return 0;
  const p = Math.floor(Math.log10(v)) - (digits - 1);
  const f = 10 ** p;
  return Math.round(v / f) * f;
}

const DECIMAL = new Intl.NumberFormat('th-TH', {maximumSignificantDigits: 2});
const INTEGER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
export const formatDensity = v => (v > 0 && v < 0.0001 ? '< 0.0001' : DECIMAL.format(v));

/**
 * 41-sample ramp for one reading — owner instruction 2026-10-25: every analytical colour scale of
 * this page uses all 41 samples of the LDS LUT (DATAVIZ-02 continuous ramp), not a 3/5-class pick.
 *
 * Method (consumer supplied, declared in every legend): rank. The measured nonzero values of the
 * areas being read are ordered; each distinct value takes the LUT sample of its mid-rank percentile,
 * rescaled so the lowest value sits on sample 0 and the highest on sample 40 (one value alone sits on
 * sample 40). Equal values share one sample; a value never falls between samples (nothing is
 * interpolated), the highest value closes the ramp (no clamp, no open class), and renderer, legend,
 * labels and charts read the same `levels`. Zero is a measured fact (EVID-05 measured_zero: sample 0
 * plus the zero outline), never a level; missing is `no_data`.
 */
export const RAMP_STEPS = 41;

export function buildRamp(values, {kind = 'density'} = {}) {
  const scale = SCALES[kind] || DENSITY_SCALE;
  const integer = kind === 'count';
  const measured = (Array.isArray(values) ? values : []).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const distinct = [];
  for (const v of measured) {
    const last = distinct.at(-1);
    if (last && last.value === v) last.n++;
    else distinct.push({value: v, n: 1});
  }
  const total = measured.length;
  let below = 0;
  const mid = distinct.map(d => { const p = (below + d.n / 2) / total; below += d.n; return p; });
  const span = mid.length > 1 ? mid.at(-1) - mid[0] : 0;
  const levels = distinct.map((d, j) => {
    const index = span > 0 ? Math.round(((mid[j] - mid[0]) / span) * (RAMP_STEPS - 1)) : RAMP_STEPS - 1;
    const fill = scale.lut[index];
    return {value: d.value, areas: d.n, index, fill, ink: inkFor(fill)};
  });
  const fmt = integer ? (x => INTEGER.format(x)) : formatDensity;
  return {
    scaleId: scale.scaleId, scaleVersion: scale.scaleVersion, unit: scale.unit, kind,
    method: 'rank', steps: RAMP_STEPS, lut: scale.lut,
    min: measured.length ? measured[0] : 0, max: measured.length ? measured.at(-1) : 0,
    levels, levelCount: new Set(levels.map(l => l.index)).size,
    ticks: rampTicks(levels, fmt),
    format: fmt,
    zero: {fill: scale.lut[0], ink: inkFor(scale.lut[0]), label: '0'},
  };
}

/**
 * Legend ticks: the lowest and highest values plus the values nearest samples 10, 20 and 30, each
 * placed at its own sample; a tick closer than 8 samples to the one before it is dropped (the
 * highest value always stays).
 */
export function rampTicks(levels, fmt = String) {
  if (!levels.length) return [];
  const picks = [];
  for (const target of [0, 10, 20, 30, 40]) {
    let best = levels[0];
    for (const l of levels) if (Math.abs(l.index - target) < Math.abs(best.index - target)) best = l;
    if (!picks.includes(best)) picks.push(best);
  }
  const top = levels.at(-1);
  if (!picks.includes(top)) picks.push(top);
  const kept = [];
  for (const l of picks.sort((a, b) => a.index - b.index)) {
    if (kept.length && l.index - kept.at(-1).index < 8) {
      if (l === top) kept.pop(); else continue;
    }
    kept.push(l);
  }
  return kept.map(l => ({index: l.index, value: l.value, label: fmt(l.value)}));
}

/** The level that holds `value`: the highest level whose value is ≤ value (levels ascend). */
function levelOf(value, levels) {
  let lo = 0, hi = levels.length - 1, found = levels[0];
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (levels[m].value <= value) { found = levels[m]; lo = m + 1; } else hi = m - 1;
  }
  return found;
}

/**
 * Resolve one value to its EVID-05 state and visual treatment.
 * - measured: finite > 0 → the LUT sample of its level
 * - measured_zero: 0 → sample 0 + zero outline (caller draws the outline token)
 * - no_data: not finite → noData fill
 * - out_of_scope: caller passes the state; nothing is drawn
 */
export function classify(value, model, state = 'measured') {
  if (state === 'out_of_scope') return {state, fill: null, ink: null, label: 'นอกพื้นที่ที่อ่าน'};
  if (state === 'no_data' || value == null || !Number.isFinite(value)) return {state: 'no_data', fill: DENSITY_SCALE.noData, ink: null, label: 'ไม่มีข้อมูล'};
  const fmt = model?.format || String;
  if (value <= 0) return {state: 'measured_zero', fill: model.zero.fill, ink: model.zero.ink, label: '0'};
  if (!model.levels?.length) return {state: 'measured', fill: model.zero.fill, ink: model.zero.ink, label: fmt(value)};
  const level = levelOf(value, model.levels);
  return {state: 'measured', fill: level.fill, ink: level.ink, label: fmt(value), index: level.index, plate: needsPlate(level.fill)};
}

/**
 * Legend markup for a ramp: all 41 samples in order (the scale itself), ticks at the samples their
 * values take, and the zero swatch when zero occurs. `title` names the reading; the accessible name
 * states the method, range and unit in text.
 */
export function rampLegendHTML(model, {zero = false, unit = ''} = {}) {
  if (!model?.levels?.length) return '';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const fmt = model.format || String;
  const cells = model.lut.map((c, i) => `<i style="background:${c}" data-step="${i}"></i>`).join('');
  // ticks sit under their own sample; the ends align inward so a label never leaves the bar
  const edge = i => (i <= 2 ? ' is-start' : i >= model.steps - 3 ? ' is-end' : '');
  const ticks = model.ticks.map(t => `<span class="ramp-tick${edge(t.index)}" style="left:${(((t.index + 0.5) / model.steps) * 100).toFixed(2)}%">${esc(t.label)}</span>`).join('');
  const name = `${model.steps} ระดับสีตามลำดับค่า ต่ำสุด ${fmt(model.min)} สูงสุด ${fmt(model.max)}${unit ? ` ${unit}` : ''}`;
  const zeroSwatch = zero ? `<span class="legend-step ramp-zero" title="พื้นที่ที่ไม่มีสถานที่ในตัวกรองนี้ (วัดได้ว่าเป็นศูนย์)"><i class="legend-zero" style="background:${model.zero.fill}" aria-hidden="true"></i>0</span>` : '';
  return `<span class="legend-ramp" role="img" aria-label="${esc(name)}"><span class="ramp-bar" aria-hidden="true">${cells}</span><span class="ramp-ticks" aria-hidden="true">${ticks}</span></span>${zeroSwatch}`;
}

/** Relative luminance (sRGB) contrast ratio, used for label ink and in tests. */
export function contrastRatio(hexA, hexB) {
  const lum = hex => {
    const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hexA), lum(hexB)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

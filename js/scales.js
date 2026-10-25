/**
 * Analytical scales — LDS 0.9.7 (release v0.9.7-owner.1, color-srgb-10).
 *
 *  - `density.area` (districts: venues per km²) — sequential, gold/orange, the land-area
 *    denominator family. scaleVersion 554812a7c19107b3a9b8658ba541fc8e13519cb19708e885a425f32d5b30f101.
 *  - `count` (provinces: number of venues) — sequential, dusty cyan/navy, totals.
 *    scaleVersion 4ff5c1fb4be71ecd13c48685b38371b528bcd4ce369ce964a75354c2eb4d0980.
 *
 * Both LUTs are the exact approved 41-sample light tables, consumed unchanged on both
 * themes (themePolicy identical-light-values-on-both-themes); class n ∈ {3,5,7,9} uses
 * index round(i × 40 / (n − 1)); nothing is interpolated or recoloured here.
 *
 * Classification (consumer supplied, as the scale entries require): quantile classes of
 * the measured nonzero values of the areas being read (the selected province's districts,
 * or every province/district when the country is read), five classes or fewer when there
 * are fewer distinct values. Thresholds are rounded to two significant digits (density) or
 * integers (count), the top class is open-ended and labelled as such (no silent clamp).
 * Zero is a measured fact (EVID-05 measured_zero: lowest fill + zero outline), never a class.
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
 * Quantile thresholds over the positive values: upper bounds of classes 1…k−1 (the last
 * class is open). `integer` rounds up to whole numbers (counts); otherwise two significant
 * digits. Duplicate thresholds collapse, so k ≤ n and intervals never overlap.
 */
export function quantileThresholds(values, n = 5, {integer = false} = {}) {
  const v = (Array.isArray(values) ? values : []).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const out = [];
  for (let i = 1; i < n; i++) {
    const q = v[Math.min(v.length - 1, Math.floor((i * v.length) / n))];
    let t = integer ? Math.floor(q) : roundSig(q);
    if (integer && t < 1) t = 1;
    if (t >= v[v.length - 1]) break;
    const prev = out.length ? out[out.length - 1] : 0;
    // keep a threshold only when its class holds a value: rounding (2 significant digits) can move a
    // threshold below every remaining value and would otherwise leave an empty class in the legend
    if (t > prev && v.some(x => x > prev && x <= t)) out.push(t);
  }
  return out;
}

/**
 * Class model for one reading. kind 'density' (venues/km², decimals) or 'count' (integers).
 * Classes: [min, t1], (t1, t2], …, (tk−1, max] with the top class labelled “> tk−1”.
 *
 * Colours always come from an LDS class table (classCounts 3/5/7/9): the 5-class table when the
 * values support five quantile classes, otherwise the 3-class table. When the values have fewer
 * distinct levels than the table (one or two), the levels take table positions by rank — lowest
 * first, highest last — and the unused positions are simply not drawn (`table` says which table).
 */
export function buildClasses(values, {kind = 'density'} = {}) {
  const scale = SCALES[kind] || DENSITY_SCALE;
  const integer = kind === 'count';
  const measured = (Array.isArray(values) ? values : []).filter(x => Number.isFinite(x) && x > 0);
  const max = measured.length ? Math.max(...measured) : 0;
  let n = 5, thresholds = quantileThresholds(measured, 5, {integer});
  if (thresholds.length !== 4) { n = 3; thresholds = quantileThresholds(measured, 3, {integer}); }
  const k = measured.length ? thresholds.length + 1 : 0;
  const colors = classColors(n, scale);
  const picks = Array.from({length: k}, (_, i) => (k === 1 ? n - 1 : Math.round((i * (n - 1)) / (k - 1))));
  const fmt = integer ? (x => INTEGER.format(x)) : formatDensity;
  const classes = picks.map((pick, i) => {
    const lower = i === 0 ? 0 : thresholds[i - 1];
    const upper = i === k - 1 ? Infinity : thresholds[i];
    let label;
    if (k === 1) label = integer ? `1–${fmt(max)}` : `≤ ${fmt(max)}`;
    else if (i === 0) label = integer ? (upper === 1 ? '1' : `1–${fmt(upper)}`) : `≤ ${fmt(upper)}`;
    else if (i === k - 1) label = `> ${fmt(lower)}`;
    else label = integer ? (lower + 1 === upper ? fmt(upper) : `${fmt(lower + 1)}–${fmt(upper)}`) : `${fmt(lower)}–${fmt(upper)}`;
    return {index: pick, lower, upper, fill: colors[pick], ink: inkFor(colors[pick]), label};
  });
  return {
    scaleId: scale.scaleId, scaleVersion: scale.scaleVersion, unit: scale.unit, kind,
    method: 'quantile', table: k ? n : 0, classCount: k, max, thresholds, classes,
    zero: {fill: colors[0], ink: inkFor(colors[0]), label: '0'},
  };
}

/**
 * Resolve one value to its EVID-05 state and visual treatment.
 * - measured: finite > 0 → class fill
 * - measured_zero: 0 → lowest fill + zero outline (caller draws the outline token)
 * - no_data: not finite → noData fill
 * - out_of_scope: caller passes the state; nothing is drawn
 */
export function classify(value, model, state = 'measured') {
  if (state === 'out_of_scope') return {state, fill: null, ink: null, label: 'นอกพื้นที่ที่อ่าน'};
  if (state === 'no_data' || value == null || !Number.isFinite(value)) return {state: 'no_data', fill: DENSITY_SCALE.noData, ink: null, label: 'ไม่มีข้อมูล'};
  if (value <= 0) return {state: 'measured_zero', fill: model.zero.fill, ink: model.zero.ink, label: '0'};
  const cls = model.classes.find(c => value > c.lower && value <= c.upper) || model.classes.at(-1);
  if (!cls) return {state: 'measured', fill: model.zero.fill, ink: model.zero.ink, label: String(value)};
  return {state: 'measured', fill: cls.fill, ink: cls.ink, label: cls.label, classIndex: cls.index};
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

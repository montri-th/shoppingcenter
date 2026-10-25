import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DENSITY_SCALE, COUNT_SCALE, classColors, quantileThresholds, buildClasses, classify, contrastRatio, inkFor, roundSig, formatDensity} from '../js/scales.js';

test('LUTs are the exact 41-sample LDS tables; anchors at 0 / 20 / 40; same values on both themes', () => {
  for (const s of [DENSITY_SCALE, COUNT_SCALE]) {
    assert.equal(s.lut.length, 41);
    assert.deepEqual([s.lut[0], s.lut[20], s.lut[40]], s.anchors);
    assert.ok(s.lut.every(c => /^#[0-9A-F]{6}$/.test(c)));
    assert.equal(s.themePolicy, 'identical-light-values-on-both-themes');
  }
  assert.equal(DENSITY_SCALE.scaleVersion, '554812a7c19107b3a9b8658ba541fc8e13519cb19708e885a425f32d5b30f101');
  assert.equal(COUNT_SCALE.scaleVersion, '4ff5c1fb4be71ecd13c48685b38371b528bcd4ce369ce964a75354c2eb4d0980');
});

test('class picks equal the LDS class tables (machine.analyticalScales …classes)', () => {
  assert.deepEqual(classColors(5, DENSITY_SCALE), ['#FFF1D9', '#F3CF8F', '#E6AB30', '#DF8720', '#D6600C']);
  assert.deepEqual(classColors(3, DENSITY_SCALE), ['#FFF1D9', '#E6AB30', '#D6600C']);
  assert.deepEqual(classColors(5, COUNT_SCALE), ['#F4F0E7', '#BAD5D4', '#7DBAC0', '#4C7A98', '#213E70']);
  assert.throws(() => classColors(4));
  const theme = readFileSync(new URL('../assets/theme.css', import.meta.url), 'utf8');
  for (const [i, c] of classColors(5, COUNT_SCALE).entries()) assert.ok(theme.includes(`--scale-count-${i + 1}: ${c};`));
});

test('quantile thresholds are increasing, inside the data, and the top class is open', () => {
  const values = [0.001, 0.002, 0.004, 0.01, 0.02, 0.05, 0.1, 0.3, 0.9, 2.5];
  const t = quantileThresholds(values, 5);
  assert.ok(t.length >= 1 && t.length <= 4);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
  assert.ok(t.at(-1) < 2.5);
  const model = buildClasses(values, {kind: 'density'});
  assert.equal(model.classes.at(-1).upper, Infinity);
  assert.ok(model.classes.at(-1).label.startsWith('>'));
  assert.equal(model.method, 'quantile');
  for (const v of values) assert.equal(classify(v, model).state, 'measured');
  // integer thresholds for counts
  const counts = buildClasses([1, 1, 1, 2, 2, 3, 4, 8, 13, 29, 181], {kind: 'count'});
  assert.ok(counts.thresholds.every(Number.isInteger));
  assert.equal(classify(181, counts).fill, counts.classes.at(-1).fill);
  assert.equal(classify(1, counts).fill, counts.classes[0].fill);
});

test('every class model draws from an LDS class table (3 or 5), never a 2- or 4-colour invention', () => {
  const cases = [
    [[0.001, 0.002, 0.004, 0.01, 0.02, 0.05, 0.1, 0.3, 0.9, 2.5], 'density', 5],
    [[1, 1, 1, 1, 2, 2, 8], 'count', 3],            // ties: five quantile classes impossible → 3-class table
    [[1, 1, 1, 9], 'count', 3],                     // two levels → 3-class table, positions 0 and 2
    [[0.4], 'density', 3],                          // one level → the top of the 3-class table
  ];
  for (const [values, kind, table] of cases) {
    const m = buildClasses(values, {kind});
    assert.equal(m.table, table, JSON.stringify(values));
    const allowed = classColors(table, kind === 'count' ? COUNT_SCALE : DENSITY_SCALE);
    for (const c of m.classes) assert.ok(allowed.includes(c.fill), `${c.fill} not in the ${table}-class table`);
    assert.equal(m.classes.at(-1).fill, allowed.at(-1), 'the highest level always takes the darkest class');
  }
  const two = buildClasses([1, 1, 1, 9], {kind: 'count'});
  assert.deepEqual(two.classes.map(c => c.index), [0, 2]);
  // a single density value whose 2-significant-digit rounding falls below it stays one class, not an empty one plus the value
  const single = buildClasses([0.003512], {kind: 'density'});
  assert.equal(single.classCount, 1);
  for (const values of [[0.001, 0.002, 0.004, 0.01, 0.02, 0.05, 0.1, 0.3, 0.9, 2.5], [0.06438, 0.0651, 0.07, 0.2, 1.2], [1, 1, 2, 3, 5, 8, 13, 181]]) {
    const m = buildClasses(values, {kind: values.every(Number.isInteger) ? 'count' : 'density'});
    for (const c of m.classes) assert.ok(values.some(x => x > c.lower && x <= c.upper), `empty class ${c.label} for ${values}`);
  }
  // the real readings of this snapshot
  const venues = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url), 'utf8'));
  const perProvince = new Map();
  for (const r of venues.rows) if (r.countable && r.status === 'supply' && r.provinceCode && r.located) perProvince.set(r.provinceCode, (perProvince.get(r.provinceCode) || 0) + 1);
  assert.ok([3, 5].includes(buildClasses([...perProvince.values()], {kind: 'count'}).table));
});

test('EVID-05 states: zero is measured, missing is no_data, never the same as a class', () => {
  const model = buildClasses([0.1, 0.5, 1], {kind: 'density'});
  const zero = classify(0, model);
  assert.equal(zero.state, 'measured_zero');
  assert.equal(zero.fill, DENSITY_SCALE.lut[0]);
  assert.equal(classify(null, model).state, 'no_data');
  assert.equal(classify(NaN, model).state, 'no_data');
  assert.equal(classify(1, model, 'out_of_scope').fill, null);
  const single = buildClasses([2], {kind: 'count'});
  assert.equal(single.classCount, 1);
  assert.equal(single.classes[0].fill, COUNT_SCALE.lut[40], 'a single class keeps the darkest anchor');
  assert.equal(buildClasses([], {kind: 'density'}).classCount, 0);
});

test('labels and ink: two significant digits, readable ink on every class', () => {
  assert.equal(roundSig(0.06438), 0.064);
  assert.equal(roundSig(2.4963), 2.5);
  assert.equal(formatDensity(2.4963), '2.5');
  // Text sits on data fills only in the matrix, which uses the 5-class count picks: each reaches 4.5:1.
  // Density fills never carry text (labels are ink chips with their own backplate), so the
  // orange top samples — where neither ink reaches 4.5:1 — are never used under a number.
  for (const n of [3, 5]) for (const c of classColors(n, COUNT_SCALE)) assert.ok(contrastRatio(c, inkFor(c)) >= 4.5, c); // the app uses 5 classes (3 when values are few)
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DENSITY_SCALE, COUNT_SCALE, RAMP_STEPS, classColors, buildRamp, rampTicks, rampLegendHTML, classify, contrastRatio, inkFor, needsPlate, roundSig, formatDensity} from '../js/scales.js';

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

test('class picks equal the LDS class tables (machine.analyticalScales …classes) for static tokens', () => {
  assert.deepEqual(classColors(5, DENSITY_SCALE), ['#FFF1D9', '#F3CF8F', '#E6AB30', '#DF8720', '#D6600C']);
  assert.deepEqual(classColors(3, DENSITY_SCALE), ['#FFF1D9', '#E6AB30', '#D6600C']);
  assert.deepEqual(classColors(5, COUNT_SCALE), ['#F4F0E7', '#BAD5D4', '#7DBAC0', '#4C7A98', '#213E70']);
  assert.throws(() => classColors(4));
  const theme = readFileSync(new URL('../assets/theme.css', import.meta.url), 'utf8');
  for (const [i, c] of classColors(5, COUNT_SCALE).entries()) assert.ok(theme.includes(`--scale-count-${i + 1}: ${c};`));
});

test('41-sample ramp (owner instruction 2026-10-25): each value takes one exact LUT sample by rank; lowest 0, highest 40; ties share', () => {
  assert.equal(RAMP_STEPS, 41);
  const values = [1, 1, 1, 2, 2, 3, 4, 8, 13, 29, 181];
  const r = buildRamp(values, {kind: 'count'});
  assert.equal(r.steps, 41);
  assert.equal(r.method, 'rank');
  assert.deepEqual(r.lut, COUNT_SCALE.lut);
  assert.equal(r.levels.length, 8, 'one level per distinct value');
  assert.equal(r.levels[0].index, 0);
  assert.equal(r.levels.at(-1).index, 40, 'the highest value closes the ramp: no clamp, no open class');
  for (let i = 1; i < r.levels.length; i++) {
    assert.ok(r.levels[i].value > r.levels[i - 1].value);
    assert.ok(r.levels[i].index >= r.levels[i - 1].index, 'darker never means less');
  }
  for (const v of values) {
    const c = classify(v, r);
    assert.equal(c.state, 'measured');
    assert.equal(c.fill, COUNT_SCALE.lut[c.index], 'renderer colour = the LUT sample, nothing interpolated');
    assert.equal(c.label, String(v));
  }
  assert.equal(classify(1, r).fill, COUNT_SCALE.lut[0]);
  assert.equal(classify(181, r).fill, COUNT_SCALE.lut[40]);
  assert.equal(buildRamp([7], {kind: 'count'}).levels[0].index, 40, 'one value alone takes the darkest sample');
  assert.equal(buildRamp([], {kind: 'density'}).levels.length, 0);
  // 41 distinct values without ties use every sample
  const many = Array.from({length: 41}, (_, i) => i + 1);
  const full = buildRamp(many, {kind: 'count'});
  assert.equal(full.levelCount, 41);
  assert.deepEqual(full.levels.map(l => l.fill), COUNT_SCALE.lut);
});

test('legend: all 41 samples in order, ticks at their own samples (lowest and highest always), never crowded, zero swatch = renderer zero', () => {
  const r = buildRamp([0.001, 0.002, 0.004, 0.01, 0.02, 0.05, 0.1, 0.3, 0.9, 2.5], {kind: 'density'});
  assert.equal(r.ticks[0].value, 0.001);
  assert.equal(r.ticks.at(-1).value, 2.5);
  for (let i = 1; i < r.ticks.length; i++) assert.ok(r.ticks[i].index - r.ticks[i - 1].index >= 8);
  for (const t of r.ticks) assert.equal(r.levels.find(l => l.value === t.value).index, t.index);
  assert.deepEqual(rampTicks([]), []);
  const html = rampLegendHTML(r, {zero: true, unit: 'แห่ง/ตร.กม.'});
  const steps = [...html.matchAll(/<i style="background:(#[0-9A-F]{6})" data-step="(\d+)">/g)];
  assert.equal(steps.length, 41, 'the legend shows all 41 samples');
  assert.deepEqual(steps.map(m => m[1]), DENSITY_SCALE.lut);
  assert.ok(html.includes('41 ระดับสีตามลำดับค่า ต่ำสุด 0.001 สูงสุด 2.5 แห่ง/ตร.กม.'));
  assert.ok(html.includes(`class="legend-zero" style="background:${DENSITY_SCALE.lut[0]}"`), 'zero swatch uses the zero fill the map draws');
  assert.ok(!rampLegendHTML(r, {zero: false}).includes('legend-zero'));
  assert.equal(rampLegendHTML(buildRamp([], {kind: 'count'})), '');
});

test('real readings of this snapshot resolve to exact samples of the right family', () => {
  const venues = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url), 'utf8'));
  const perProvince = new Map();
  for (const r of venues.rows) if (r.countable && r.status === 'supply' && r.provinceCode && r.located) perProvince.set(r.provinceCode, (perProvince.get(r.provinceCode) || 0) + 1);
  const ramp = buildRamp([...perProvince.values()], {kind: 'count'});
  assert.ok(ramp.levels.length > 1);
  assert.equal(ramp.levels.at(-1).value, Math.max(...perProvince.values()));
  assert.equal(ramp.levels.at(-1).fill, COUNT_SCALE.lut[40]);
  for (const v of perProvince.values()) assert.ok(COUNT_SCALE.lut.includes(classify(v, ramp).fill));
});

test('EVID-05 states: zero is measured, missing is no_data, never the same as a level', () => {
  const model = buildRamp([0.1, 0.5, 1], {kind: 'density'});
  const zero = classify(0, model);
  assert.equal(zero.state, 'measured_zero');
  assert.equal(zero.fill, DENSITY_SCALE.lut[0]);
  assert.equal(classify(null, model).state, 'no_data');
  assert.equal(classify(NaN, model).state, 'no_data');
  assert.equal(classify(null, model).fill, DENSITY_SCALE.noData);
  assert.equal(classify(1, model, 'out_of_scope').fill, null);
});

test('labels and ink: two significant digits; a number on a fill reaches 4.5:1 or sits on a neutral plate', () => {
  assert.equal(roundSig(0.06438), 0.064);
  assert.equal(roundSig(2.4963), 2.5);
  assert.equal(formatDensity(2.4963), '2.5');
  for (const s of [COUNT_SCALE, DENSITY_SCALE]) {
    for (const c of s.lut) assert.equal(needsPlate(c), contrastRatio(c, inkFor(c)) < 4.5, c);
  }
  // Text sits on data fills only in the type matrix (count family): samples 27–29 need the plate.
  assert.deepEqual(COUNT_SCALE.lut.map((c, i) => (needsPlate(c) ? i : -1)).filter(i => i >= 0), [27, 28, 29]);
  const r = buildRamp(Array.from({length: 41}, (_, i) => i + 1), {kind: 'count'});
  assert.equal(classify(29, r).plate, true);
  assert.equal(classify(1, r).plate, false);
});

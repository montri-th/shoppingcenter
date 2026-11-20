// Venue Locale Insight (“รอบศูนย์นี้”): the serving bundle in data/locale, the pure models and renderers of
// js/venue-locale.js, and the English of the section (js/venue-locale-i18n.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  inLocaleSet, ringRows, ahaRows, pctPhrase, rankWords, areaRows, areaPhrase, levelsOf, unplacedRows, liveLinks, renderLocale, renderLocalePriors, priorsHTML, fitRows, ringIcon,
  pctFill, universeOf, setLocaleOption, localeOptions, localeShardPath, RADII, localeDataLine,
  residentsShardPath, residentsMapModel, residentsMapHTML, renderLocaleResidents, aboutPeople, peopleWords, densityWords, englishDay, thaiDay,
  residentsSectors, DIRECTIONS, compareModel, quarterOf, QUARTERS, COMPARE_PATH,
} from '../js/venue-locale.js';
import {shardOf} from '../js/details.js';
import {COUNT_SCALE, DENSITY_SCALE} from '../js/scales.js';
import {translate} from '../js/shell/i18n.js';
import {localeDictionary, registerLocaleDictionary, registerLocaleNames, registerLocaleSignalNames} from '../js/venue-locale-i18n.js';

const ROOT = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const meta = read('data/locale/meta.json');
const rows = read('data/venues.json').rows;
const byId = new Map(rows.map(r => [r.id, r]));
const shard = (kind, id) => read(localeShardPath(kind, id, meta.shards)).venues[id] || null;
const rmeta = read('data/residents/meta.json');
const residents = id => read(residentsShardPath(id, rmeta.shards)).venues[id] || null;
const set = rows.filter(inLocaleSet);
const cmp = read(COMPARE_PATH);
const venueOf = id => byId.get(id) || null;
const CENTRALWORLD = 'SC-001245';
const reset = () => { setLocaleOption('radius', 3000); setLocaleOption('universe', 'all'); setLocaleOption('level', ''); setLocaleOption('bench', 'province'); setLocaleOption('open', {table: false, more: false, live: false, method: false, dpwhy: false, res: false, restable: false, cmp: false}); };
const THAI = /[ก-ฺเ-๎]/;
const num = n => new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0}).format(n);

test('the release covers the 499 countable shopping centres, community malls and outlets listed as supply', () => {
  assert.equal(set.length, 499);
  assert.equal(meta.venues, 499);
  assert.equal(meta.located, set.filter(r => r.located).length);
  // the rank reference (owner 2026-11-20 11:57): the centers located in release 0.2.0; a center placed later ranks against them
  const added = new Set(meta.reference.added), reference = set.filter(r => r.located && !added.has(r.id));
  assert.ok(meta.reference.added.length > 0 && meta.reference.added.every(id => byId.get(id)?.located && inLocaleSet(byId.get(id))), 'centers placed later are located and in the set');
  assert.equal(meta.reference.n, reference.length);
  assert.equal(meta.universes.all.n, meta.reference.n);
  const types = Object.entries(meta.universes).filter(([k]) => k !== 'all');
  assert.equal(types.reduce((s, [, u]) => s + u.n, 0), meta.reference.n, 'type universes partition the reference');
  for (const [k, u] of types) assert.equal(u.n, reference.filter(r => r.group === k).length, k);
  assert.ok(!rows.filter(r => !inLocaleSet(r)).some(r => r.group === 'market' && inLocaleSet(r)));
});

test('serving bundle: facts and priors in separate shard families, keyed like data/details, tied to the canonical release', () => {
  assert.equal(readdirSync(new URL('data/locale/facts/', ROOT)).length, meta.shards);
  assert.equal(readdirSync(new URL('data/locale/priors/', ROOT)).length, meta.shards);
  assert.equal(readdirSync(new URL('data/locale/signals/', ROOT)).length, meta.shards);
  assert.ok(!Object.values(meta.ringGroups).flatMap(g => g.datasets).includes('condo'), 'condominium points are never counted in a ring (the dataset’s spatial policy)');
  assert.equal(localeShardPath('facts', CENTRALWORLD, meta.shards), `data/locale/facts/${String(shardOf(CENTRALWORLD, meta.shards)).padStart(2, '0')}.json`);
  const manifest = read('data/locale/serving_bundle_manifest.json');
  assert.equal(manifest.bundle_type, 'venue_locale_serving_derivative');
  assert.equal(manifest.canonical_release_id, meta.release.id);
  assert.match(manifest.generated_prior_policy, /separate/);
  // every listed file is present with its hash; nothing unlisted (validate_serving_bundle.py does the full check)
  for (const f of manifest.files.slice(0, 10)) {
    const bytes = readFileSync(new URL(`data/locale/${f.path}`, ROOT));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256, f.path);
  }
  for (const r of set) {
    const facts = shard('facts', r.id);
    assert.ok(facts, `facts for ${r.id}`);
    if (!r.located) { assert.equal(facts.located, false); continue; }
    assert.ok(!('seg' in facts) && !('dp' in facts), 'no generated prior in the facts');
    assert.deepEqual(Object.keys(facts.ring).sort(), Object.values(meta.ringGroups).flatMap(g => g.datasets).sort());
    for (const rec of Object.values(facts.ring)) {
      assert.equal(rec.n.length, 3);
      assert.ok(rec.n.every(Number.isInteger) && rec.n[0] <= rec.n[1] && rec.n[1] <= rec.n[2], 'counts grow with the radius');
    }
    const pr = shard('priors', r.id), sg = shard('signals', r.id);
    assert.ok(pr && /^[0-5]{168}$/.test(pr.grid), `a 7 × 24 grid for ${r.id}`);
    for (const k of ['residents', 'students', 'workers', 'visitors']) {
      assert.ok(['high', 'medium', 'low', 'insufficient'].includes(pr.seg[k]?.[0]), `${r.id} ${k}`);
      assert.ok(pr.spend[k] && meta.priors.mix[pr.mix[k]], `${r.id} ${k} spend and mix`);
    }
    assert.ok(!('claims' in pr), 'the claim ledger stays in the canonical release');
    assert.ok(sg && sg.sig && sg.ex, `signals for ${r.id}`);
    for (const list of Object.values(sg.ex)) for (const e of list) {
      assert.ok(!('lat' in e) && !('lon' in e) && !('ll' in e), 'examples carry no coordinates');
      if (e.d != null) assert.equal(e.d % 100, 0, 'distances rounded to 100 m');
    }
  }
});

test('ring rows: a measured zero is not a rank, partial datasets are flagged, headlines use near-complete datasets only', () => {
  reset();
  const row = byId.get(CENTRALWORLD), facts = shard('facts', CENTRALWORLD);
  const list = ringRows(meta, facts, row);
  assert.equal(list.length, meta.ringGroups.reduce((s, g) => s + g.datasets.length, 0));
  const hotel = list.find(r => r.id === 'hotel');
  assert.equal(hotel.count, facts.ring.hotel.n[1]);
  for (const r of list.filter(x => x.count === 0)) assert.match(pctPhrase(r, universeOf(meta, row)), /^ไม่พบ/);
  assert.ok(list.some(r => r.partial), 'datasets with points for under 90% of their records are flagged');
  const aha = ahaRows(list);
  assert.ok(aha.length <= 3 && aha.every(r => !r.partial && r.count > 0));
  assert.ok(new Set(aha.map(r => r.group)).size === aha.length || aha.length === 3);
  setLocaleOption('radius', 1000);
  assert.equal(ringRows(meta, facts, row).find(r => r.id === 'hotel').count, facts.ring.hotel.n[0]);
  setLocaleOption('universe', 'type');
  assert.equal(universeOf(meta, row).n, meta.universes[row.group].n);
  reset();
});

test('rank words never say more than 100% or more than 0%', () => {
  assert.equal(rankWords(99.9, ' 488 ศูนย์'), 'อยู่ในกลุ่มสูงสุด 1% ของ 488 ศูนย์');
  assert.equal(rankWords(0.2, ' 488 ศูนย์'), 'อยู่ในกลุ่มต่ำสุด 1% ของ 488 ศูนย์');
  assert.equal(rankWords(42.4, ' 488 ศูนย์'), 'มากกว่า 42% ของ 488 ศูนย์');
  const uni = {key: 'all', n: 488, short: '488 ศูนย์'};
  assert.equal(pctPhrase({count: 0, p: 32, zeroShare: 64}, uni), 'ไม่พบ เหมือน 64% ของ 488 ศูนย์');
});

test('area rows: missing stays missing, counts compare per km², the reader picks the level and the comparison', () => {
  reset();
  const row = byId.get(CENTRALWORLD), facts = shard('facts', CENTRALWORLD);
  assert.deepEqual(levelsOf(facts), ['locale', 'subdistrict', 'district', 'province']);
  const local = areaRows(meta, facts, row);
  const pop = local.find(r => r.ds === 'population' && r.metric === 'population');
  assert.equal(pop.value, facts.area.population.locale.population[0]);
  assert.match(areaPhrase(pop, {level: 'locale', bench: 'province', provinceCode: 'BKK'}), /^ต่อ ตร\.กม\. .+ของย่านในกรุงเทพฯ \([\d,]+\)$/);
  const peer = areaRows(meta, facts, row, {level: 'district', bench: 'peer'}).find(r => r.ds === 'population');
  assert.equal(peer.p, facts.area.population.district.population[3]);
  // a dataset absent at a level gives no row (never a zero)
  const krabi = byId.get('SC-000034'), kf = shard('facts', 'SC-000034');
  assert.ok(!areaRows(meta, kf, krabi).some(r => r.ds === 'company'), 'company is Bangkok-only: no row, not 0');
  for (const r of areaRows(meta, kf, krabi, {level: 'province'})) assert.equal(r.p, null, 'no rank at province level');
});

test('live views link to the venue’s district in CityMETER production; unplaced datasets show this province’s count', () => {
  const row = byId.get(CENTRALWORLD);
  const links = liveLinks(meta, row);
  assert.equal(links.length, meta.live.length);
  for (const l of links) assert.match(l.href, /^https:\/\/landometer\.com\/v3\/citymeter\/BKK(\/D\/\d{4})?\?d=[\w-]+$/);
  assert.ok(unplacedRows(meta, row).every(u => u.count > 0));
});

test('section HTML: observed first (Aha, then the full comparison), hypotheses drawn with the section, explanations last', () => {
  reset();
  const row = byId.get(CENTRALWORLD);
  const facts = shard('facts', CENTRALWORLD), priors = shard('priors', CENTRALWORLD), signals = shard('signals', CENTRALWORLD);
  // while the hypotheses load, the zone says so; when they fail, it offers a retry (the rest of the section is there)
  const loading = renderLocale(row, {meta, facts, priors: null, metaState: 'ready', factsState: 'ready', priorsState: 'loading'});
  assert.match(loading, /^<section class="panel-section locale-section" id="venue-locale"/);
  assert.match(loading, /<div class="locale-priors" id="locale-priors"><p class="hint" role="status">/);
  assert.doesNotMatch(loading, /class="persona"/);
  assert.match(renderLocale(row, {meta, facts, priors: null, metaState: 'ready', factsState: 'ready', priorsState: 'error'}), /data-action="locale-retry-priors"/);
  assert.match(localeDataLine(meta), /DATA_METHOD\.md#venue-locale-insight/);
  const html = renderLocale(row, {meta, facts, priors, signals, metaState: 'ready', factsState: 'ready', priorsState: 'ready', residentsMeta: rmeta, residents: residents(CENTRALWORLD), residentsState: 'ready'});
  assert.match(html, /รอบศูนย์นี้ · ทะเบียนวิจัย CityMETER \d+ ชุด และ CityMETER production \d+ ชุด · ข้อมูล .+ · รัศมีเส้นตรงจากจุดของศูนย์/);
  assert.doesNotMatch(html, /undefined|NaN|\bnull\b/);
  // read the measured, then the benchmark, then the interpretation; the evidence and the method after
  const at = k => { const i = html.indexOf(k); assert.ok(i >= 0, k); return i; };
  const order = ['class="locale-aha"', 'id="locale-residents"', 'id="locale-chart"', 'data-locale-open="table"', 'id="locale-priors"', 'class="who-grid"', 'class="locale-block busy-block"', 'class="locale-block fit-block"', 'locale-area-block', 'data-locale-open="method"', 'class="hint panel-foot"'];
  order.reduce((prev, k) => { assert.ok(at(k) > prev, `${k} after the one before`); return at(k); }, -1);
  // Aha cards: a symbol of the dataset, its count, a percentile track in the chart's LUT colour, the rank words
  const aha = html.slice(at('class="locale-aha"'), at('id="locale-chart"'));
  for (const r of ahaRows(ringRows(meta, facts, row))) {
    assert.match(aha, new RegExp(`pic-${ringIcon(r)}`));
    assert.ok(aha.includes(`left:${r.p}%;background:${pctFill(r.p)}`), `${r.id} track`);
  }
  // the hypotheses: a note first, four tiles (symbol, how many as dots and words, spending power as ฿ marks and words, the mix)
  const ph = priorsHTML(meta, priors, signals, row, facts);
  assert.match(ph, /^<p class="prior-note">/);
  assert.equal((ph.match(/<details class="persona"/g) || []).length, 4, 'four groups');
  assert.equal((ph.match(/<summary class="who-tile">/g) || []).length, 4);
  for (const seg of ['residents', 'students', 'workers', 'visitors']) assert.match(ph, new RegExp(`<summary class="who-tile"><i class="pictogram pic-${seg}"`));
  assert.equal((ph.match(/<span class="baht" aria-hidden="true">/g) || []).length, 4 + 1, 'a ฿ meter per tile, and one in the key');
  assert.match(ph, /กำลังซื้อจากราคา (สูง|กลาง|ต่ำ|ยังไม่ประเมิน)/);
  assert.doesNotMatch(ph, / open>/, 'every card starts closed');
  // inside a card: what the data shows (symbol rows with rank tracks and places to open), then the reading
  assert.ok(ph.indexOf('ข้อมูลที่เห็น') < ph.indexOf('อ่านว่า'));
  assert.match(ph, /<li class="sig"><i class="pictogram pic-hotel"/);
  assert.match(ph, /<span class="sig-track" aria-hidden="true"><i style="left:\d+(\.\d+)?%"><\/i><\/span>/);
  assert.match(ph, /<li class="poi"><i class="pictogram pic-hotel"[^]*?\?e=hotel:HT-/, 'a stay opens in CityMETER Hotel');
  assert.match(ph, /\?e=school:/, 'a school opens in CityMETER School');
  assert.equal((ph.match(/<td class="g[0-5]"/g) || []).length, 168, 'one cell per hour of the week');
  assert.match(ph, /<p class="busy-peak">.*คึกที่สุดของสัปดาห์/);
  assert.ok(ph.indexOf('class="dp-grid"') < ph.indexOf('class="dp-peaks"'), 'the grid before its reading');
  assert.doesNotMatch(ph, /#[0-9A-F]{6}/i, 'priors carry no data colour');
  assert.doesNotMatch(ph, /undefined|NaN|\bnull\b|สูงกว่า 100%|สูงกว่า 0%/);
  // a median of fewer than 10 records at a level reads the next level up (7 house listings in the locale → the district)
  assert.match(ph, /ราคาประกาศขายบ้านเดี่ยว \(ค่ากลาง\)<\/span>.*?ใน<\/span> <span>เขตปทุมวัน/s);
  // a factory belt: the two strongest clusters set the workers' level, and office prices do not rate their spending
  const mc = 'SC-012645', mcp = shard('priors', mc);
  assert.equal(mcp.seg.workers[4], 'top2');
  assert.equal(mcp.spend.workers[4], 'factory_led');
  const mch = priorsHTML(meta, mcp, shard('signals', mc), byId.get(mc), shard('facts', mc));
  assert.match(mch, /ยังไม่ประเมิน ราคาที่มีเป็นค่าเช่าและพื้นที่สำนักงาน/);
  assert.match(mch, /pic-workers"[^]*?<span class="spend-meter is-none">/, 'the workers tile shows spending power as not rated');
  reset();
  // outside the set: nothing; without a point: one line, never zeros
  assert.equal(renderLocale(rows.find(r => !inLocaleSet(r)), {meta}), '');
  const unlocated = set.find(r => !r.located);
  assert.match(renderLocale(unlocated, {meta, facts: shard('facts', unlocated.id), metaState: 'ready', factsState: 'ready'}), /ยังไม่มีจุดที่ผ่านเกณฑ์/);
  assert.equal(renderLocalePriors(unlocated, {meta, facts: shard('facts', unlocated.id)}), '');
  assert.match(renderLocale(row, {metaState: 'error'}), /data-action="locale-retry"/);
  // the zone alone (drawn when the hypotheses arrive after the rest) is the same as inside the section
  assert.ok(html.includes(renderLocalePriors(row, {meta, facts, priors, signals, priorsState: 'ready'})));
});

test('formats that would likely fit: hypotheses never carry a count; the checked shop list is read by its own categories', () => {
  const formatNames = new Set(Object.values(meta.priors.pmf).map(x => x[0]));
  let found = 0, check = 0;
  for (const r of set.filter(x => x.located)) {
    const pr = shard('priors', r.id), sg = shard('signals', r.id);
    if (!pr) continue;
    const f = fitRows(meta, pr, sg);
    const shownSets = f.found.flatMap(row => row.sets.map(x => x[0]));
    assert.equal(new Set(shownSets).size, shownSets.length, `${r.id}: a category is shown once`);
    for (const row of f.found) {
      assert.ok(row.sets.length && row.sets.every(([ds, n]) => meta.priors.tenantDatasets[ds] && n > 0 && sg.ten[ds] === n), r.id);
      assert.ok(row.ids.every(id => meta.priors.pmf[id][2].some(ds => row.sets.some(x => x[0] === ds))), `${r.id} format under its category`);
    }
    // a format the list does not show is a thing to check on site, whether or not a category exists for it
    for (const id of f.check) assert.ok(!(meta.priors.pmf[id][2] || []).some(ds => (sg.ten?.[ds] || 0) > 0), `${r.id} ${id}`);
    found += f.found.length; check += f.check.length;
  }
  assert.ok(found > 0 && check > 0);
  const row = byId.get(CENTRALWORLD);
  const ph = priorsHTML(meta, shard('priors', CENTRALWORLD), shard('signals', CENTRALWORLD), row, shard('facts', CENTRALWORLD));
  const fit = ph.slice(ph.indexOf('class="locale-block fit-block"'));
  for (const m of fit.matchAll(/<span class="pmf"><span data-en="[^"]*">([^<]*)<\/span><\/span>/g)) {
    assert.ok(formatNames.has(m[1]), m[1]);
    assert.doesNotMatch(m[1], /\d/);
  }
  assert.match(fit, /<li class="fit-row"><i class="pictogram pic-fit"/);
  assert.doesNotMatch(fit, /ไม่มีร้าน|ไม่พบ/, 'a format the list does not show never reads as absent');
  assert.match(fit, /ข้อมูล: รายชื่อร้านในศูนย์ของ CityMETER Shopping Center ตรวจถึง .+ ไม่ใช่การสำรวจครบทุกร้าน.* · ขอบเขต: /);
});

test('ring colours: the LDS count LUT, 41 samples, sample of the rank', () => {
  assert.equal(COUNT_SCALE.lut.length, 41);
  assert.equal(pctFill(0), COUNT_SCALE.lut[0]);
  assert.equal(pctFill(50), COUNT_SCALE.lut[20]);
  assert.equal(pctFill(100), COUNT_SCALE.lut[40]);
  assert.equal(pctFill(97.6), COUNT_SCALE.lut[39]);
});

test('English: every Thai text of the section has an English (names without an English source stay Thai)', () => {
  registerLocaleDictionary(meta);
  const dict = localeDictionary(meta);
  assert.ok(Object.keys(dict.exact).length > 150);
  const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const missing = new Set();
  for (const id of [CENTRALWORLD, 'SC-000034', set.find(r => r.located && r.provinceCode === 'CMI' && r.group === 'community')?.id, ...meta.reference.added].filter(Boolean)) {
    const row = byId.get(id), facts = shard('facts', id), priors = shard('priors', id), signals = shard('signals', id), res = residents(id);
    registerLocaleNames(facts);
    registerLocaleSignalNames(signals);
    for (const level of levelsOf(facts)) for (const bench of ['province', 'peer']) for (const universe of ['all', 'type']) for (const radius of RADII) {
      reset();
      setLocaleOption('level', level); setLocaleOption('bench', bench); setLocaleOption('universe', universe); setLocaleOption('radius', radius);
      setLocaleOption('open', {restable: true, cmp: true, res: true});
      const html = renderLocale(row, {meta, facts, priors, signals, metaState: 'ready', factsState: 'ready', priorsState: 'ready', residentsMeta: rmeta, residents: res, residentsState: 'ready', compare: cmp, compareState: 'ready', venueOf})
        + ['loading', 'error', 'empty'].map(st => renderLocaleResidents(row, {meta, facts, residentsMeta: st === 'loading' ? null : rmeta, residentsState: st})).join('')
        + ['loading', 'error'].map(st => renderLocaleResidents(row, {meta, facts, residentsMeta: rmeta, residents: res, residentsState: 'ready', compare: null, compareState: st})).join('');
      // text alone in an element with data-en carries its own English (the shell's [data-en] context)
      const withEn = html.replace(/<(\w+)[^>]*\sdata-en="([^"]+)"[^>]*>([^<>]*)<\/\1>/g, (all, tag, en) => { assert.doesNotMatch(en, THAI, en); return ''; });
      const texts = [...withEn.matchAll(/>([^<>]+)</g)].map(m => m[1]).concat([...withEn.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map(m => m[1]));
      for (const raw of texts) {
        const s = decode(raw).replace(/\s+/g, ' ').trim();
        if (THAI.test(s) && translate(s) == null) missing.add(s);
      }
    }
  }
  reset();
  assert.deepEqual([...missing].slice(0, 20), []);
  assert.equal(localeOptions().radius, 3000);
});

test('no file of the bundle is referenced that is not shipped', () => {
  for (const f of ['meta.json', 'ATTRIBUTION.md', 'serving_exclusions.json', 'serving_profile.json', 'checksums.sha256', 'serving_bundle_manifest.json']) {
    assert.ok(existsSync(new URL(`data/locale/${f}`, ROOT)), f);
  }
});

/* ---------- registered residents around the center (modelled; 0.8.0, owner 2026-11-20) ---------- */

test('residents: one record per located center of the set, keyed like the locale shards, tied to the bundle', () => {
  const files = readdirSync(new URL('data/residents/', ROOT)).filter(f => f !== 'meta.json');
  assert.equal(files.length, rmeta.shards);
  assert.equal(rmeta.release, 'venue-locale-residents-492-20261120-v2');
  assert.deepEqual([...rmeta.reference.added].sort(), [...meta.reference.added].sort(), 'the same rank reference as the locale release');
  assert.equal(rmeta.reference.n, meta.reference.n);
  assert.match(rmeta.input.sha256sums, /^[0-9a-f]{64}$/);
  for (const h of Object.values(rmeta.input.files)) assert.match(h, /^[0-9a-f]{64}$/);
  assert.match(rmeta.input.outlines.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(rmeta.universes, Object.fromEntries(Object.entries(meta.universes).map(([k, u]) => [k, u.n])), 'the same universes as the locale release');
  assert.match(readFileSync(new URL('DATA_METHOD.md', ROOT), 'utf8'), /<a id="registered-residents"><\/a>/, 'the method the page links to');
  const located = set.filter(r => r.located);
  assert.equal(rmeta.venues, located.length);
  const seen = new Set();
  for (const f of files) {
    const k = Number(f.replace('.json', ''));
    for (const id of Object.keys(read(`data/residents/${f}`).venues)) {
      assert.equal(residentsShardPath(id, rmeta.shards), `data/residents/${f}`, `${id} in its own shard`);
      assert.ok(Number.isInteger(k) && !seen.has(id), id);
      seen.add(id);
    }
  }
  assert.deepEqual([...seen].sort(), located.map(r => r.id).sort(), 'every located center once, nothing else');
});

test('residents: values add up, ranks recount from the figures, ages are shares', () => {
  const located = set.filter(r => r.located);
  const added = new Set(rmeta.reference.added), reference = located.filter(r => !added.has(r.id));
  const recs = new Map(located.map(r => [r.id, residents(r.id)]));
  const mid = (x, pool) => (100 * (pool.filter(v => v < x).length + 0.5 * pool.filter(v => v === x).length)) / pool.length;
  for (const [i] of RADII.entries()) {
    const all = reference.map(r => recs.get(r.id).n[i]);  // ranks read against the reference, every located center ranked
    for (const r of located) {
      const rec = recs.get(r.id), same = reference.filter(o => o.group === r.group).map(o => recs.get(o.id).n[i]);
      assert.ok(Math.abs(rec.p[0][i] - mid(rec.n[i], all)) < 1e-3, `${r.id} all ${i}`);
      assert.ok(Math.abs(rec.p[1][i] - mid(rec.n[i], same)) < 1e-3, `${r.id} type ${i}`);
    }
  }
  const cells = rmeta.cell.n * rmeta.cell.n;
  for (const [id, rec] of recs) {
    assert.ok(rec.n[0] > 0 && rec.n[0] <= rec.n[1] && rec.n[1] <= rec.n[2], `${id} grows with the radius`);
    assert.ok(rec.b[0] > 0 && rec.b[0] <= rec.b[1] && rec.b[1] <= rec.b[2], `${id} buildings`);
    assert.ok(Math.abs(rec.ring.reduce((s, x) => s + x[0], 0) - rec.n[2]) < 0.01, `${id} rings = 5 km`);
    assert.ok(Math.abs(rec.ring[0][0] - rec.n[0]) < 0.01, `${id} first ring = 1 km`);
    for (const a of rec.age) assert.ok(Math.abs(a.reduce((s, x) => s + x, 0) - 1) < 1e-4 && a.every(x => x >= 0), `${id} age`);
    assert.equal(rec.g.length, cells);
    const listed = rec.g.filter(v => v != null);
    assert.ok(listed.every(v => v >= 0), `${id} cells`);
    assert.ok(Math.abs(listed.reduce((s, v) => s + v, 0) - rec.n[2]) <= 0.05 * listed.length + 1, `${id} cells = 5 km`);
    assert.equal(typeof rec.o, 'string');
    assert.match(rec.o, /^(M-?\d+ -?\d+(l-?\d+ -?\d+)+)*$/, `${id} outline path`);
    if (rec.own) assert.ok(rec.own[0] > 0 && rec.own[1] >= 0);
  }
});

test('residents: the block reads the figure and its rank first, then near or far, ages, the map, one data line, the method folded', () => {
  reset();
  const row = byId.get(CENTRALWORLD), facts = shard('facts', CENTRALWORLD), rec = residents(CENTRALWORLD);
  for (const universe of ['all', 'type']) for (const [i, radius] of RADII.entries()) {
    setLocaleOption('universe', universe); setLocaleOption('radius', radius);
    const html = renderLocaleResidents(row, {meta, facts, residentsMeta: rmeta, residents: rec, residentsState: 'ready'});
    assert.match(html, /^<div class="locale-block res-block" id="locale-residents" role="group" aria-labelledby="locale-res-title">/);
    assert.doesNotMatch(html, /undefined|NaN|\bnull\b/);
    const p = rec.p[universe === 'type' ? 1 : 0][i];
    assert.ok(html.includes(`<b class="data-number">${aboutPeople(rec.n[i])}</b>`), `figure at ${radius}`);
    assert.ok(html.includes(`<span data-en="people within ${radius / 1000}\u00a0km">คน ใน ${radius / 1000}\u00a0กม.</span>`), 'the number stays with its unit');
    assert.ok(html.includes(`left:${p}%;background:${pctFill(p)}`), 'the rank track in the count LUT sample, as the cards above');
    assert.ok(html.includes(rankWords(p, universe === 'all' ? ` ${num(meta.universes.all.n)} ศูนย์` : universeOf(meta, row).short)), 'rank words');
    const at = k => { const j = html.indexOf(k); assert.ok(j >= 0, k); return j; };
    ['class="res-head"', 'class="res-rings"', 'class="res-age"', 'class="res-map"', 'class="legend-ramp"', 'res-evidence', 'data-locale-open="res"'].reduce((prev, k) => { assert.ok(at(k) > prev, `${k} in order`); return at(k); }, -1);
    // near or far: three rings, shares of the 5 km figure
    assert.equal((html.match(/<li><span class="res-ring-name">/g) || []).length, 3);
    for (const [k, [people, dens]] of rec.ring.entries()) {
      assert.ok(html.includes(`${peopleWords(people)[0]} · ${densityWords(dens)[0]}`), `ring ${k}`);
      assert.ok(html.includes(`<b class="data-number">${num(Math.round((100 * people) / rec.n[2]))}%</b>`), `ring ${k} share`);
    }
    // ages at the radius
    const pc = rec.age[i].map(a => num(Math.round(a * 100)));
    assert.ok(html.includes(`เด็ก 0–14 ปี ${pc[0]}% · วัยทำงาน 15–59 ปี ${pc[1]}% · ผู้สูงอายุ 60 ปีขึ้นไป ${pc[2]}%`), 'ages');
    // the ring of the chips is the one drawn solid
    assert.equal((html.match(/<circle class="res-ring is-on"/g) || []).length, 1);
    assert.ok(html.includes(`<circle class="res-ring is-on" r="${radius / rmeta.cell.m}"/>`));
    // one line: dataset · source · date · boundary; no caveat on screen (the method is folded)
    const line = /<p class="hint res-evidence">(.*?)<\/p>/s.exec(html)[1];
    assert.match(line, /คนที่มีชื่อในทะเบียนบ้าน \(แบบจำลอง\) · ประชากรตามทะเบียน กรมการปกครอง ต\.ค\. 2569 ผ่าน CityMETER production · อาคาร Building V4 .*© ผู้ร่วมสร้าง OpenStreetMap.* · คิด 20 พ\.ย\. 2569 · รัศมีเส้นตรงจากจุดของศูนย์/);
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(visible, /ไม่ใช่/, 'no caveat outside the folded method');
    assert.match(html, /<details class="locale-details" data-locale-open="res">[\s\S]*ไม่ใช่จำนวนคนที่มาศูนย์[\s\S]*DATA_METHOD\.md#registered-residents/);
  }
  reset();
  // states: loading, error with a retry, a release without the center (never 0); outside the set or without a point: nothing
  assert.match(renderLocaleResidents(row, {meta, facts, residentsState: 'loading'}), /role="status">.*กำลังโหลดจำนวนคนรอบศูนย์…/);
  assert.match(renderLocaleResidents(row, {meta, facts, residentsMeta: rmeta, residentsState: 'error'}), /data-action="locale-retry-residents"/);
  const empty = renderLocaleResidents(row, {meta, facts, residentsMeta: rmeta, residents: null, residentsState: 'empty'});
  assert.match(empty, /ยังไม่มีจำนวนคนรอบศูนย์นี้/);
  assert.doesNotMatch(empty, /data-number|\b0 คน/);
  assert.equal(renderLocaleResidents(rows.find(r => !inLocaleSet(r)), {meta, facts}), '');
  const unlocated = set.find(r => !r.located);
  assert.equal(renderLocaleResidents(unlocated, {meta, facts: shard('facts', unlocated.id)}), '');
});

test('residents map: every coloured cell takes a sample of the LDS density LUT by its rank in this center’s own map', () => {
  for (const id of [CENTRALWORLD, set.filter(r => r.located).at(-1).id]) {
    const row = byId.get(id), rec = residents(id);
    const {ramp, km2} = residentsMapModel(rec, rmeta);
    assert.equal(ramp.lut, DENSITY_SCALE.lut);
    assert.equal(ramp.lut.length, 41);
    const positive = rec.g.filter(v => v > 0).map(v => v / km2);
    assert.equal(ramp.min, Math.min(...positive));
    assert.equal(ramp.max, Math.max(...positive));
    assert.equal(ramp.levels[0].index, 0, 'the lowest cell on sample 0');
    assert.equal(ramp.levels.at(-1).index, 40, 'the highest on sample 40');
    const svg = residentsMapHTML(row, rec, rmeta, 3000);
    const fills = [...svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-F]{6})" shape-rendering="crispEdges"\/>/g)];
    assert.ok(fills.every(([, , f]) => DENSITY_SCALE.lut.includes(f)), 'LUT colours only');
    assert.equal(new Set(fills.map(f => f[2])).size, fills.length, 'one path per sample');
    const drawn = fills.reduce((s, [, d]) => s + [...d.matchAll(/h(\d+)v1/g)].reduce((t, m) => t + Number(m[1]), 0), 0);
    assert.equal(drawn, rec.g.filter(v => v != null).length, 'every cell with a counted building, and only those');
    assert.match(svg, /<circle class="res-bg" r="20"\/>/, 'the plain surface where no building is counted');
    assert.equal((svg.match(/class="res-ring-label/g) || []).length, 3);
    const legend = renderLocaleResidents(row, {meta, facts: shard('facts', id), residentsMeta: rmeta, residents: rec, residentsState: 'ready'});
    assert.equal((/<span class="ramp-bar"[^>]*>(.*?)<\/span>/.exec(legend)[1].match(/<i style="background:/g) || []).length, 41, 'all 41 samples in the legend');
    assert.match(legend, /aria-label="41 ระดับสีตามลำดับค่า ต่ำสุด [\d,.]+ สูงสุด [\d,.]+ คน\/ตร\.กม\."/);
  }
});

test('residents words: about-figures, densities, shares and dates round the way the build checked them', () => {
  assert.equal(aboutPeople(9.99), null);
  assert.deepEqual(peopleWords(5), ['ไม่ถึง 10 คน', 'fewer than 10 people']);
  assert.equal(aboutPeople(585.73), '590');
  assert.equal(aboutPeople(7012.05), '7,000');
  assert.equal(aboutPeople(222864.56), '223,000');
  assert.deepEqual(densityWords(6719.76), ['6,700 คน/ตร.กม.', '6,700 per km²']);
  assert.deepEqual(densityWords(73.41), ['73 คน/ตร.กม.', '73 per km²']);
  assert.deepEqual(densityWords(0.4), ['ไม่ถึง 1 คน/ตร.กม.', 'under 1 per km²']);
  assert.equal(englishDay('2026-10'), 'Oct 2026');
  assert.equal(englishDay('2026-11-20'), '20 Nov 2026');
  assert.equal(thaiDay('2026-11-20'), '20 พ.ย. 2569');
});

/* ---------- the map as a table, and the other centers on two ranks (0.9.0, owner 2026-11-20 11:27) ---------- */

test('map table: every 250 m cell counts once, in the direction and ring of its centre', () => {
  // a synthetic map: one cell due north 500 m out, one east at about 2 km, one south-west near 4.5 km, one without a building
  const n = rmeta.cell.n, half = n / 2, g = Array(n * n).fill(null);
  const cell = (east, north) => (half - 1 - Math.floor(north / 250)) * n + (Math.floor(east / 250) + half);
  g[cell(10, 500)] = 30; g[cell(2000, 10)] = 50; g[cell(-3200, -3200)] = 20; g[cell(-10, -10)] = 0;
  const s = residentsSectors({g}, rmeta);
  assert.equal(s.rows.length, 8);
  assert.deepEqual(s.rows.map(r => r.th), DIRECTIONS.map(d => d[0]));
  assert.deepEqual(s.rows[0].people, [30, 0, 0], 'north, 0–1 km');
  assert.deepEqual(s.rows[2].people, [0, 50, 0], 'east, 1–3 km');
  assert.deepEqual(s.rows[5].people, [0, 0, 20], 'south-west, 3–5 km');
  assert.equal(s.rows[5].built[2], 1);
  assert.equal(s.rows.reduce((t, r) => t + r.built[0] + r.built[1] + r.built[2], 0), 4, 'a counted building with no people still counts as built');
  assert.equal(s.total, 100);
  assert.equal(s.top.en, 'East');
  assert.ok(Math.abs(s.rows[0].dens[0] - 30 / (Math.PI / 8)) < 1e-9, 'people ÷ the sector’s share of the ring area');
  // the real maps: the table adds up to the map, shares to 100%
  for (const id of [CENTRALWORLD, set.filter(r => r.located).at(-1).id]) {
    const rec = residents(id), t = residentsSectors(rec, rmeta);
    const cells = rec.g.filter(v => v != null).reduce((a, v) => a + v, 0);
    assert.ok(Math.abs(t.total - cells) < 1e-6, `${id} table = cells`);
    assert.ok(Math.abs(t.total - rec.n[2]) <= 0.05 * rec.g.filter(v => v != null).length + 1, `${id} table ≈ 5 km`);
    assert.ok(Math.abs(t.rows.reduce((a, r) => a + r.share, 0) - 100) < 1e-6);
    assert.equal(t.top.total, Math.max(...t.rows.map(r => r.total)));
  }
});

test('map table: a line on where most people are, then the table folded; plain numbers, TH/EN', () => {
  reset();
  const row = byId.get(CENTRALWORLD), facts = shard('facts', CENTRALWORLD), rec = residents(CENTRALWORLD);
  const t = residentsSectors(rec, rmeta);
  const html = renderLocaleResidents(row, {meta, facts, residentsMeta: rmeta, residents: rec, residentsState: 'ready', compare: cmp, compareState: 'ready', venueOf});
  const pw = peopleWords(t.top.total);
  assert.ok(html.includes(`คนในวง 5 กม. อยู่ทางทิศ${t.top.th}ของศูนย์มากที่สุด ${pw[0]} (${num(Math.round(t.top.share))}%)`), 'the line under the map');
  assert.ok(html.includes(`data-en="Most people within 5 km are to the ${t.top.en.toLowerCase()} of the center: ${pw[1]} (${num(Math.round(t.top.share))}%)"`));
  const table = /<details class="locale-details" data-locale-open="restable">([\s\S]*?)<\/details>/.exec(html)?.[1];
  assert.ok(table, 'the table is folded');
  assert.equal((table.match(/<tr( class="is-top")?><th scope="row">/g) || []).length, 8, 'eight directions');
  assert.equal((table.match(/<tr class="is-top">/g) || []).length, 1);
  assert.equal((table.match(/<td class="data-number"><b>/g) || []).length, 1, 'one densest cell in bold');
  assert.doesNotMatch(table, /background:|fill=/, 'no data colour in the table');
  const at = k => html.indexOf(k);
  assert.ok(at('class="res-map"') < at('class="res-dir"') && at('class="res-dir"') < at('data-locale-open="restable"') && at('data-locale-open="restable"') < at('res-evidence'), 'map, line, table, then the data line');
  const visible = html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visible, /ไม่ใช่|ข้อจำกัด/, 'no caveat outside the folded parts');
});

test('comparison file: every located center once; x copies the residents ranks, y recounts from the workers prior', () => {
  const located = set.filter(r => r.located);
  assert.equal(cmp.schema, 'shoppingcenter-compare/1');
  assert.match(readFileSync(new URL('DATA_METHOD.md', ROOT), 'utf8'), /<a id="compare-residents-workers"><\/a>/, 'the method the block links to');
  assert.deepEqual(Object.keys(cmp.venues).sort(), located.map(r => r.id).sort());
  assert.deepEqual(cmp.universes, rmeta.universes);
  assert.deepEqual(cmp.reference, {n: rmeta.reference.n, added: [...rmeta.reference.added].sort()});
  const added = new Set(cmp.reference.added), reference = located.filter(r => !added.has(r.id));
  assert.equal(cmp.builtFrom.residents.release, rmeta.release);
  assert.equal(cmp.builtFrom.workers.release, meta.release.id);
  const score = id => shard('priors', id).seg.workers[1];
  const mid = (x, pool) => (100 * (pool.filter(v => v < x).length + 0.5 * pool.filter(v => v === x).length)) / pool.length;
  const all = reference.map(r => score(r.id));
  for (const r of located) {
    const v = cmp.venues[r.id], rec = residents(r.id);
    assert.equal(cmp.groups[v[0]], r.group);
    for (const i of [0, 1, 2]) {
      assert.ok(Math.abs(v[1][i] - rec.p[0][i]) <= 0.0501 && Math.abs(v[2][i] - rec.p[1][i]) <= 0.0501, `${r.id} x ${i}`);
    }
    const same = reference.filter(o => o.group === r.group).map(o => score(o.id));
    assert.ok(Math.abs(v[3] - mid(score(r.id), all)) <= 0.0501, `${r.id} y all`);  // one decimal
    assert.ok(Math.abs(v[4] - mid(score(r.id), same)) <= 0.0501, `${r.id} y type`);
  }
});

test('centers placed later (owner 2026-11-20 11:57): ranked against the reference, plotted with every center, the reference folded in each method', () => {
  assert.deepEqual([...meta.reference.added].sort(), ['SC-007245', 'VN-7bb5b3abd9f811', 'VN-a263de54d31372', 'VN-c87c200db5d079']);
  const strip = h => h.replace(/<details[\s\S]*?<\/details>/g, '');
  for (const id of [...meta.reference.added, CENTRALWORLD]) {
    const row = byId.get(id), facts = shard('facts', id), priors = shard('priors', id), signals = shard('signals', id), rec = residents(id);
    assert.ok(row?.located && facts?.ring && facts.located !== false && priors && signals && rec && cmp.venues[id], `${id}: every layer`);
    for (const universe of ['all', 'type']) {
      reset();
      setLocaleOption('universe', universe);
      const html = renderLocale(row, {meta, facts, priors, signals, metaState: 'ready', factsState: 'ready', priorsState: 'ready', residentsMeta: rmeta, residents: rec, residentsState: 'ready', compare: cmp, compareState: 'ready', venueOf});
      assert.doesNotMatch(html, /undefined|NaN|\bnull\b/, id);
      const uni = universeOf(meta, row), m = compareModel(cmp, row);
      assert.equal(uni.n, universe === 'all' ? meta.reference.n : meta.universes[row.group].n, 'ranks against the reference');
      assert.equal(m.ref, uni.n);
      assert.ok(m.n > m.ref, 'the chart holds the centers placed later too');
      assert.ok(m.points.some(q => q.id === id) && html.includes(`${num(m.counts[m.quarter])} จาก ${num(m.n)} ศูนย์อยู่ช่องนี้`));
      // rings, residents and comparison: each method carries the reference once, folded; the screen names it in the data line
      const folded = [...html.matchAll(/<details[\s\S]*?<\/details>/g)].map(x => x[0]).join('');
      assert.equal(folded.split(meta.reference.th).length - 1, 3, `${id} ${universe}: the reference in three methods`);
      assert.ok(!strip(html).includes(meta.reference.th));
      assert.match(strip(html), new RegExp(`อันดับเทียบกับ${universe === 'all' ? ` ${num(m.ref)} ศูนย์` : uni.short}ในชุดอ้างอิง`));
      assert.match(html, new RegExp(`ทุกประเภท ${num(meta.reference.n)} แห่ง`), 'the chip of all types counts the reference');
    }
  }
  reset();
  // the peer benchmark of an area: units holding a center of the reference
  assert.match(areaPhrase({p: 40, n: 120, value: 3, basis: 'value'}, {level: 'district', bench: 'peer', provinceCode: 'BKK'}), /เขตที่มีศูนย์ชุดอ้างอิง \(120\)/);
});

test('comparison model: quarters split at the middle rank; the universe of the chips; five nearest, never itself', () => {
  assert.equal(quarterOf(50, 50), 'mixed');
  assert.equal(quarterOf(49.9, 50), 'work');
  assert.equal(quarterOf(50, 49.9), 'home');
  assert.equal(quarterOf(10, 10), 'sparse');
  const row = byId.get(CENTRALWORLD);
  for (const universe of ['all', 'type']) for (const radius of RADII) {
    const m = compareModel(cmp, row, {radius, universe});
    const plotted = set.filter(r => r.located && (universe === 'all' || r.group === row.group)).length;
    assert.equal(m.ref, universe === 'all' ? cmp.universes.all : cmp.universes[row.group], 'ranks read against the reference');
    assert.equal(m.n, plotted, 'every located center on the chart');
    assert.equal(m.points.length, plotted);
    assert.equal(Object.values(m.counts).reduce((a, b) => a + b, 0), plotted);
    const v = cmp.venues[CENTRALWORLD], i = RADII.indexOf(radius);
    assert.deepEqual([m.me.x, m.me.y], universe === 'all' ? [v[1][i], v[3]] : [v[2][i], v[4]]);
    assert.equal(m.nearest.length, 5);
    assert.ok(!m.nearest.some(q => q.id === CENTRALWORLD));
    assert.ok(m.nearest.every((q, k) => k === 0 || m.nearest[k - 1].d <= q.d), 'nearest first');
    const others = m.points.filter(q => q.id !== CENTRALWORLD).map(q => Math.hypot(q.x - m.me.x, q.y - m.me.y)).sort((a, b) => a - b);
    assert.ok(Math.abs(m.nearest[4].d - others[4]) < 1e-9, 'the five closest');
    if (universe === 'type') assert.ok(m.points.every(q => cmp.venues[q.id][0] === v[0]), 'same type only');
  }
  assert.equal(compareModel(cmp, set.find(r => !r.located)), null, 'a center without a point has no place on the chart');
  assert.equal(compareModel(null, row), null);
});

test('comparison block: quarter and both ranks first, the chart in neutral tones, the nearest centers open, one data line, the method folded', () => {
  for (const universe of ['all', 'type']) for (const radius of RADII) {
    reset();
    setLocaleOption('universe', universe); setLocaleOption('radius', radius);
    const row = byId.get(CENTRALWORLD), facts = shard('facts', CENTRALWORLD), rec = residents(CENTRALWORLD);
    const html = renderLocaleResidents(row, {meta, facts, residentsMeta: rmeta, residents: rec, residentsState: 'ready', compare: cmp, compareState: 'ready', venueOf});
    assert.doesNotMatch(html, /undefined|NaN|\bnull\b/);
    const block = /<div class="cmp-block" id="locale-compare"[\s\S]*$/.exec(html)?.[0];
    assert.ok(block, 'the comparison closes the residents zone');
    assert.ok(html.indexOf('data-locale-open="res"') < html.indexOf('id="locale-compare"'));
    const m = compareModel(cmp, row);
    const [qTh, qEn] = QUARTERS[m.quarter];
    assert.ok(block.includes(`ศูนย์นี้อยู่ช่อง “${qTh}”`) && block.includes(`This center is in “${qEn}”`));
    assert.ok(block.includes(`${num(m.counts[m.quarter])} จาก ${num(m.n)} ศูนย์อยู่ช่องนี้`));
    // the chart: every other center once, the five nearest ringed, this center on top; no data colour (neutral tones)
    const dots = /<path class="cmp-dots" d="([^"]*)"\/>/.exec(block)[1];
    assert.equal((dots.match(/M/g) || []).length, m.n - 1);
    assert.equal((/<path class="cmp-near" d="([^"]*)"\/>/.exec(block)[1].match(/M/g) || []).length, 5);
    assert.match(block, new RegExp(`<circle class="cmp-me" cx="${m.me.x}" cy="${Number((100 - m.me.y).toFixed(1))}" r="2.4"/>`));
    assert.doesNotMatch(block, /#[0-9A-Fa-f]{6}|fill="|background:/, 'no colour of its own: the page tokens draw it');
    for (const k of Object.keys(QUARTERS)) assert.ok(block.includes(`${QUARTERS[k][0]}</span> <b class="data-number">${num(m.counts[k])}</b>`), k);
    // the nearest centers: buttons that open them
    const buttons = [...block.matchAll(/data-action="select-venue" data-id="([^"]+)"/g)].map(x => x[1]);
    assert.deepEqual(buttons, m.nearest.map(q => q.id));
    // one data line; caveats folded
    assert.equal((block.match(/class="hint res-evidence cmp-evidence"/g) || []).length, 1);
    assert.match(block, /คนอยู่ใกล้: คนที่มีชื่อในทะเบียนบ้าน \(แบบจำลอง\) กรมการปกครอง ต\.ค\. 2569 .*คนทำงานใกล้: ระดับคนทำงานและผู้เดินทางจากกฎ.*รัศมีเส้นตรงจากจุดของศูนย์/);
    assert.match(block, /<details class="locale-details" data-locale-open="cmp">[\s\S]*ไม่ใช่จำนวนคนทำงาน[\s\S]*DATA_METHOD\.md#compare-residents-workers/);
    const visible = block.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(visible, /ไม่ใช่|ข้อจำกัด|ทำเลทอง/, 'no caveat on screen');
  }
  reset();
  const row = byId.get(CENTRALWORLD), facts = shard('facts', CENTRALWORLD), rec = residents(CENTRALWORLD);
  const st = compareState => renderLocaleResidents(row, {meta, facts, residentsMeta: rmeta, residents: rec, residentsState: 'ready', compare: null, compareState});
  assert.match(st('loading'), /id="locale-compare"[\s\S]*role="status">.*กำลังโหลดการเทียบกับศูนย์อื่น…/);
  assert.match(st('error'), /data-action="locale-retry-compare"/);
  assert.doesNotMatch(st('error'), /cmp-plot/);
});

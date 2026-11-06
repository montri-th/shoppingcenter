// District polygons (owner, 4 Nov 2026 21:56): RTSD polygons, detail per province on demand, data fills under water.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDistrictDetail, provincesInView, featureBox, DETAIL_MIN_ZOOM} from '../js/district-detail.js';
import {dataFillBeforeId} from '../js/map-layers.js';
import {buildMapStyle, DATA_FILL_BEFORE} from '../js/map-style.js';

const root = new URL('..', import.meta.url).pathname;
const readJSON = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const square = (x, y, d = 1) => ({type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]]});

test('provincesInView: the provinces that cover the view, most-covered first, capped', () => {
  const provinces = {type: 'FeatureCollection', features: [
    {type: 'Feature', properties: {code: 'AAA'}, geometry: square(0, 0)},
    {type: 'Feature', properties: {code: 'BBB'}, geometry: square(1, 0)},
    {type: 'Feature', properties: {code: 'CCC'}, geometry: square(5, 5)},
    // an L-shaped province whose bounding box covers the view but whose land does not
    {type: 'Feature', properties: {code: 'LLL'}, geometry: {type: 'Polygon', coordinates: [[[-2, -2], [3, -2], [3, -1.5], [-1.5, -1.5], [-1.5, 3], [-2, 3], [-2, -2]]]}},
  ]};
  assert.deepEqual(featureBox(provinces.features[0]), [0, 0, 1, 1]);
  assert.deepEqual(provincesInView([0.2, 0.2, 1.4, 0.8], provinces), ['AAA', 'BBB'], 'more of the view is AAA');
  assert.deepEqual(provincesInView([1.2, 0.2, 1.4, 0.8], provinces), ['BBB']);
  assert.deepEqual(provincesInView([0.1, 0.1, 0.9, 0.9], provinces), ['AAA'], 'a bounding box alone does not fetch LLL');
  assert.equal(provincesInView([0, 0, 6, 6], provinces, {limit: 1}).length, 1);
  assert.deepEqual(provincesInView([10, 10, 11, 11], provinces), [], 'sea: nothing to fetch');
  assert.deepEqual(provincesInView(null, provinces), []);
  assert.ok(DETAIL_MIN_ZOOM >= 8 && DETAIL_MIN_ZOOM <= 11);
});

test('createDistrictDetail: loads a province once, serves its geometries, ignores bad files and retries after a failure', async () => {
  const calls = [];
  let fail = true;
  const files = {
    'data/districts/AAA.geojson': {type: 'FeatureCollection', metadata: {province: 'AAA'}, features: [{type: 'Feature', properties: {code: '1001'}, geometry: square(0, 0)}]},
    'data/districts/BAD.geojson': {type: 'FeatureCollection', features: [{type: 'Feature', properties: {code: 'x'}, geometry: square(0, 0)}]},
  };
  const detail = createDistrictDetail({fetchJSON: async url => {
    calls.push(url);
    if (url.endsWith('FLK.geojson')) { if (fail) throw new Error('offline'); return {type: 'FeatureCollection', features: []}; }
    return files[url];
  }});
  assert.equal(await detail.ensure(['AAA', 'AAA']), true);
  assert.deepEqual(detail.geometry('1001'), square(0, 0));
  assert.equal(detail.loaded('AAA'), true);
  assert.equal(await detail.ensure(['AAA']), false, 'already loaded: no redraw');
  assert.equal(calls.filter(u => u.endsWith('AAA.geojson')).length, 1);
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(await detail.ensure(['BAD']), false);
    assert.equal(detail.loaded('BAD'), false);
    assert.equal(await detail.load('FLK'), false);
    fail = false;
    assert.equal(await detail.load('FLK'), true, 'a failed province is fetched again later');
  } finally { console.warn = warn; }
  assert.equal(await detail.load('../etc'), false, 'only province codes become paths');
  assert.equal(detail.geometry('9999'), null);
});

test('data fills go under the basemap water fill; the style has it and every province has a detail file', () => {
  const style = buildMapStyle('light', {tileJSON: 'https://example.invalid/tiles.json'});
  const ids = style.layers.map(l => l.id);
  assert.equal(DATA_FILL_BEFORE, 'water');
  assert.ok(ids.includes('water') && ids.indexOf('water') < ids.findIndex(id => style.layers.find(l => l.id === id).type === 'line'));
  const fakeMap = layers => ({getLayer: id => layers.find(l => l.id === id), getStyle: () => ({layers})});
  assert.equal(dataFillBeforeId(fakeMap(style.layers)), 'water');
  assert.equal(dataFillBeforeId(fakeMap([{id: 'bg', type: 'background'}, {id: 'roads', type: 'line'}])), 'roads');

  const coarse = readJSON('data/districts.geojson');
  assert.match(coarse.metadata.source.source, /Royal Thai Survey Department/);
  assert.equal(coarse.metadata.source.license, 'CC BY 3.0 IGO');
  const provinces = readJSON('data/provinces.geojson');
  const files = readdirSync(join(root, 'data/districts')).filter(f => f.endsWith('.geojson'));
  assert.equal(files.length, provinces.features.length, 'one detail file per province');
  const detailCodes = new Map();
  for (const file of files) {
    const doc = readJSON(`data/districts/${file}`);
    assert.equal(doc.metadata.province, file.replace('.geojson', ''));
    for (const f of doc.features) detailCodes.set(f.properties.code, doc.metadata.province);
  }
  for (const f of coarse.features) assert.equal(detailCodes.get(f.properties.code), f.properties.province, `detail polygon for ${f.properties.code}`);
  assert.equal(detailCodes.size, coarse.features.length);
  const venues = readJSON('data/venues.json');
  assert.equal(venues.meta.boundary.license, 'CC BY 3.0 IGO');
  // Membership is on the RTSD polygons: either a full build on them (meta.boundary) or the 4 Nov 2026 relocation of an
  // older snapshot (meta.relocation, scripts/relocate-districts.py).
  assert.match(venues.meta.boundary.source, /Royal Thai Survey Department/);
  if (venues.meta.relocation) assert.equal(venues.meta.relocation.by, 'scripts/relocate-districts.py');
  for (const r of venues.rows) if (r.districtCode) assert.equal(detailCodes.get(r.districtCode), r.provinceCode, `${r.id} province matches its district`);
});

test('Samphanthawong ends at the Chao Phraya: riverside venues sit in the district their own address names', () => {
  const venues = readJSON('data/venues.json');
  // Before the RTSD polygons three Khlong San venues (west bank) were counted in Thon Buri; the owner saw the
  // Samphanthawong outline cross the river. Every Bangkok venue whose address names one of these riverside districts
  // must now be in that district.
  // The river separates these three; land boundaries (Bang Rak / Sathon) may legitimately differ from an address.
  const riverside = {'สัมพันธวงศ์': '1013', 'คลองสาน': '1018', 'ธนบุรี': '1015'};
  let checked = 0;
  for (const r of venues.rows) {
    const code = r.provinceCode === 'BKK' && riverside[r.addrDistrict];
    if (!code) continue;
    assert.equal(r.districtCode, code, `${r.name} (${r.addrDistrict})`);
    checked++;
  }
  assert.ok(checked >= 30, `riverside venues checked: ${checked}`);
  assert.ok(!venues.rows.some(r => r.districtCode === '1013' && r.addrDistrict === 'คลองสาน'), 'no Khlong San venue counted in Samphanthawong');
});

test('build-boundaries: codes by largest overlap, production area, stops on a name mismatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'boundaries-'));
  try {
    const fc = features => ({type: 'FeatureCollection', features});
    const ogd = fc([
      {type: 'Feature', properties: {amp_code: '1001', amp_th: 'หนึ่ง', amp_en: 'Nueng', pro_code: '10'}, geometry: square(0, 0)},
      {type: 'Feature', properties: {amp_code: '1002', amp_th: 'สอง', amp_en: 'Song', pro_code: '10'}, geometry: square(1, 0)},
    ]);
    const rtsd = fc([
      {type: 'Feature', properties: {shapeName: 'Song', shapeID: 'B'}, geometry: square(1.05, 0)},
      {type: 'Feature', properties: {shapeName: 'Nueng', shapeID: 'A'}, geometry: square(-0.05, 0)},
    ]);
    mkdirSync(join(dir, 'prod'));
    writeFileSync(join(dir, 'prod/prod-districts.json'), JSON.stringify({provinces: {BKK: [
      {code: '1001', th: 'หนึ่ง', areaSqm: 5_000_000}, {code: '1002', th: 'สอง', areaSqm: 6_000_000}]}}));
    writeFileSync(join(dir, 'ogd.geojson'), JSON.stringify(ogd));
    writeFileSync(join(dir, 'rtsd.geojson'), JSON.stringify(rtsd));
    const run = () => execFileSync('python3', ['-I', join(root, 'scripts/build-boundaries.py'), '--rtsd', join(dir, 'rtsd.geojson'),
      '--ogd', join(dir, 'ogd.geojson'), '--production', join(dir, 'prod'), '--out', join(dir, 'out')], {stdio: 'pipe'});
    run();
    const out = JSON.parse(readFileSync(join(dir, 'out/districts.geojson'), 'utf8'));
    assert.deepEqual(out.features.map(f => [f.properties.amp_code, f.properties.rtsd_shape_id, f.properties.area_sqkm]), [['1001', 'A', 5], ['1002', 'B', 6]]);
    assert.deepEqual(out.features[0].geometry.coordinates[0][0], [-0.05, 0], 'RTSD geometry kept');
    rtsd.features[0].properties.shapeName = 'Something Else';
    writeFileSync(join(dir, 'rtsd.geojson'), JSON.stringify(rtsd));
    assert.throws(run, /names disagree/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

// Panel models and HTML: what the reading panel says at each level, with the rules that
// matter most — no counting components, missing never shown as zero, legacy size only in
// the venue detail with its method (decision D3), provenance line on every numeric panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {filterVenues, prepareRows, summarize, tierReading, hasPoint} from '../js/model.js';
import {hierarchyReading} from '../js/evidence.js';
import {indexDistricts, summarizeDistricts, districtsInScope} from '../js/areas.js';
import {summarizeAreaInsight} from '../js/area-insight.js';
import {buildDistrictModel} from '../js/map-layers.js';
import {buildOverviewModel, buildDistrictProfile, buildVenueProfile, buildPendingCard, searchAll, indexPending} from '../js/profile-model.js';
import {renderOverview, renderDistrict, renderVenue, renderPending, renderSearch, dataLine, buildingReading, densityRatio, PRODUCT_TITLE} from '../js/panel.js';
import {rankAreas, groupMatrix} from '../js/chart-model.js';

const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const venues = read('data/venues.json');
const rows = prepareRows(venues.rows.map(r => ({...r})));
const byId = new Map(rows.map(r => [r.id, r]));
const districts = indexDistricts(read('data/districts.geojson'));
const pending = indexPending(read('data/pending.json'));
const details = new Map();
for (const f of readdirSync(new URL('../data/details/', import.meta.url))) for (const [id, d] of Object.entries(read(`data/details/${f}`).venues)) details.set(id, d);
const supply = filterVenues(rows, {});
const asOf = venues.meta.asOf;

test('overview: Aha numbers, metrics and provenance come from the rows', () => {
  const insight = summarizeAreaInsight(supply, districts);
  const model = buildDistrictModel(summarizeDistricts(supply, districtsInScope(districts, insight.province)));
  const focusRows = supply.filter(r => insight.districtIds.includes(r.districtCode));
  const overview = buildOverviewModel({rows: focusRows, scopeRows: supply, areas: model.areas, readCode: insight.province, planned: filterVenues(rows, {status: 'planned'}), closed: filterVenues(rows, {status: 'closed'})});
  const html = renderOverview({insight, model: overview, focusMode: 'auto', readCode: insight.province, asOf});
  assert.ok(html.includes(`${Math.round(insight.share)}%`));
  assert.ok(html.includes(`>${insight.count}<`) && html.includes(`จาก ${insight.total.toLocaleString('th-TH')} แห่ง`));
  for (const d of insight.districts) assert.ok(html.includes(`data-id="${d.code}"`));
  assert.ok(html.includes(dataLine(asOf)), 'dataset · source · date · boundary line');
  for (const part of [PRODUCT_TITLE, 'CityMETER research', 'ตรวจถึง', 'OpenGISData-Thailand']) assert.ok(dataLine(asOf).includes(part), part);
  assert.ok(!/caveat|ข้อจำกัด|ไม่ใช่|ไม่นับในจำนวน/.test(html), 'no caveat on the first view');
  const ratio = densityRatio(insight);
  assert.ok(Math.abs(ratio - (insight.count / insight.areaKm2) / (insight.total / insight.provinceAreaKm2)) < 1e-9, 'share ÷ area share = density ratio');
  if (ratio >= 2) assert.ok(html.includes(`แน่นกว่าค่าเฉลี่ยของ`) && html.includes(`>${Math.round(ratio)}<`));
  assert.equal(overview.summary.venues, focusRows.length);
});

test('district profile: rank among districts with venues, venue list, measured zero is “0 แห่ง”', () => {
  const model = buildDistrictModel(summarizeDistricts(supply, districtsInScope(districts, 'BKK')));
  const ranked = rankAreas(model.areas, {kind: 'district'}).filter(a => a.count > 0);
  const top = ranked[0];
  const profile = buildDistrictProfile({area: top, rows: supply.filter(r => r.districtCode === top.id), rank: 1, of: ranked.length});
  assert.equal(profile.summary.venues, top.count);
  const html = renderDistrict(profile, {asOf});
  assert.ok(html.includes(`อันดับ 1 จาก ${ranked.length}`));
  const empty = model.areas.find(a => a.count === 0);
  if (empty) {
    const zero = renderDistrict(buildDistrictProfile({area: empty, rows: [], rank: 0, of: ranked.length}), {asOf});
    assert.ok(zero.includes('(0 แห่ง)'));
  }
  const m = groupMatrix(ranked, {areaLimit: 5});
  assert.ok(m.areas.length <= 5 && m.cells.length === m.areas.length * m.groups.length);
});

test('venue panel: field evidence, legacy size only with its method, missing is “ยังไม่มีข้อมูล”, components not counted', () => {
  const withLegacy = rows.find(r => details.get(r.id)?.size?.legacy?.gla);
  const p = buildVenueProfile({row: withLegacy, detail: details.get(withLegacy.id), byId, districts});
  const html = renderVenue(p, {asOf});
  assert.ok(html.includes('ค่าประมาณจากทะเบียนเดิม ไม่ใช่ GLA ทางการ'));
  assert.ok(html.includes('วิธี:'));
  assert.ok(html.includes('หลักฐานรายช่อง'));
  // Method, basis and limits sit in the collapsed evidence list, never on the visible panel.
  const visible = html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ');
  assert.ok(!/ไม่ใช่|ยังไม่ตรวจภาคสนาม|ค่าประมาณจาก|วิธี:/.test(visible), 'no caveat outside the evidence list');
  assert.ok(visible.includes('ราว'), 'an estimate reads as an estimate');
  const noOperator = rows.find(r => !r.operatorLabel && details.get(r.id));
  const h2 = renderVenue(buildVenueProfile({row: noOperator, detail: details.get(noOperator.id), byId, districts}), {asOf});
  assert.ok(h2.includes('ยังไม่มีข้อมูล'));
  const child = rows.find(r => !r.countable && r.parentId && byId.has(r.parentId));
  if (child) {
    const hc = renderVenue(buildVenueProfile({row: child, detail: details.get(child.id), byId, districts}), {asOf});
    assert.ok(hc.includes('ไม่นับแยก') && hc.includes(`data-id="${child.parentId}"`));
    const parent = byId.get(child.parentId);
    assert.ok((parent.children || []).includes(child.id));
  }
  const loading = renderVenue(buildVenueProfile({row: withLegacy, detail: null, byId, districts}), {asOf});
  assert.ok(loading.includes('กำลังโหลดรายละเอียด'));
  assert.ok(!loading.includes('ค่าประมาณจากทะเบียนเดิม'), 'no size before the detail loads');
});

test('legacy size never leaves the venue panel: no aggregate, ranking or overview mentions it', () => {
  const insight = summarizeAreaInsight(supply, districts);
  const model = buildDistrictModel(summarizeDistricts(supply, districtsInScope(districts, insight.province)));
  const overview = renderOverview({insight, model: buildOverviewModel({rows: supply, scopeRows: supply, areas: model.areas, readCode: insight.province}), focusMode: 'none', readCode: insight.province, asOf});
  assert.ok(!/GLA|ตร\.ม\./.test(overview));
  assert.ok(!('size' in supply[0]), 'core rows carry no size');
});

test('luxury link appears only for venues the Luxury Brands page can open', () => {
  const linked = rows.find(r => details.get(r.id)?.luxuryPlace);
  assert.ok(linked);
  const html = renderVenue(buildVenueProfile({row: linked, detail: details.get(linked.id), byId, districts}), {asOf});
  assert.ok(html.includes(`https://montri-th.github.io/luxurybrands/?place=${details.get(linked.id).luxuryPlace}`));
});

test('search finds qualified venues, components and pending records without fuzzy matching', () => {
  const r = searchAll('central', {rows, pending});
  assert.ok(r.qualifiedTotal > 0);
  assert.ok(r.qualified.every(x => x.countable));
  assert.equal(searchAll('', {rows, pending}).qualified.length, 0);
  const somePending = pending.rows[0];
  const p = searchAll(somePending[0], {rows, pending});
  assert.ok(p.pending.includes(0));
  const html = renderSearch(p, {pending, districts, asOf});
  assert.ok(html.includes('ยังยืนยันไม่ได้') && html.includes('ไม่นับ'));
  assert.ok(html.includes(somePending[7] === 'reviewed' ? 'ยังยืนยันไม่ได้' : 'รอตรวจ'));
  assert.equal(searchAll('zzzz-not-a-venue', {rows, pending}).qualifiedTotal, 0);
});

test('context card says the record is not counted, and whether it awaits review or closed unconfirmed', () => {
  const reviewed = pending.rows.findIndex(r => r[7] === 'reviewed');
  assert.ok(reviewed >= 0, 'this snapshot has reviewed records');
  // The 2026-10-25 16:39 export closed every review; an awaiting record is built from a reviewed one.
  let awaiting = pending.rows.findIndex(r => r[7] !== 'reviewed');
  let source = pending;
  if (awaiting < 0) { source = {...pending, rows: [pending.rows[reviewed].slice(0, 7), ...pending.rows]}; awaiting = 0; }
  const a = buildPendingCard(source, awaiting, districts);
  assert.equal(a.id, source.rows[awaiting][0]);
  assert.equal(a.reviewed, false);
  const ha = renderPending(a, {asOf});
  assert.ok(ha.includes('รอตรวจ · ไม่นับ'));
  const b = buildPendingCard(pending, reviewed, districts);
  assert.equal(b.reviewed, true);
  const hb = renderPending(b, {asOf});
  assert.ok(hb.includes('ยังยืนยันไม่ได้ · ไม่นับ'));
  assert.ok(!hb.includes('รอตรวจ ·'));
  assert.equal(buildPendingCard(pending, -1, districts), null);
});

test('the venue panel says how a venue passed: source evidence or an owner category rule', () => {
  const owner = rows.find(r => r.tier === 'owner' && r.ownerRule === 'market');
  const supported = rows.find(r => r.tier === 'supported');
  assert.ok(owner && supported);
  assert.equal(tierReading(owner), 'ผ่านนิยามตามกฎที่เจ้าของข้อมูลยอมรับ · ตลาด');
  assert.equal(tierReading(supported), 'ผ่านนิยามด้วยหลักฐานปัจจุบัน');
  assert.equal(tierReading({tier: 'owner', ownerRule: 'confirmed_managed_retail_component'}), 'เจ้าของข้อมูลยืนยันรายสถานที่ · พื้นที่ค้าปลีกที่บริหารร่วม');
  assert.equal(tierReading({tier: 'owner', ownerRule: 'new_rule'}), 'ผ่านนิยามตามกฎที่เจ้าของข้อมูลยอมรับ · กฎรายประเภท');
  const html = renderVenue(buildVenueProfile({row: owner, detail: details.get(owner.id), byId, districts}), {asOf});
  assert.ok(html.includes('ผ่านนิยามตามกฎที่เจ้าของข้อมูลยอมรับ · ตลาด'));
  const held = rows.find(r => r.countHold === 'count-review');
  if (held) assert.equal(hierarchyReading(held), 'รอตรวจการนับ · ยังไม่นับ');
  const dup = rows.find(r => r.countHold === 'duplicate');
  if (dup) assert.equal(hierarchyReading(dup), 'อาจซ้ำ · ไม่นับแยก');
  assert.equal(hierarchyReading({countable: true, countBasis: 'component-without-qualified-parent'}), '', 'a counted venue carries no caveat pill');
});

test('summaries in panels never count components', () => {
  const all = summarize(rows.filter(r => r.countable));
  assert.equal(all.venues, venues.meta.counts.countable);
});

test('the venue panel names the building it draws: validated host, the building the pin stands in, or none found', () => {
  const host = rows.find(r => r.hasBuilding && r.countable);
  const plain = rows.find(r => !r.hasBuilding && r.countable && hasPoint(r));
  assert.match(buildingReading(host, [], undefined).text, /อาคารของสถานที่/);
  const pinFeature = {properties: {geometry_role: 'pin_building_basemap', height_status: 'basemap_render_height'}};
  assert.match(buildingReading(plain, [pinFeature], 'inside').text, /อาคารที่หมุดตั้งอยู่/);
  assert.match(buildingReading(plain, [pinFeature], 'edge').note, /ไม่เกิน 3 ม\./);
  assert.equal(buildingReading(plain, [], null).text, 'ยังไม่พบอาคารที่ตำแหน่งหมุด');
  assert.equal(buildingReading(plain, [], undefined).text, '', 'not read yet → nothing said');
  const html = renderVenue(buildVenueProfile({row: plain, detail: details.get(plain.id), byId, districts}), {asOf, buildings: [pinFeature], pinState: 'inside'});
  assert.ok(html.includes('อาคารที่หมุดตั้งอยู่') && html.includes('OpenStreetMap'));
});

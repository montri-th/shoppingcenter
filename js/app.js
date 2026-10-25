/**
 * CityMETER · Shopping Centers & Retail Venues — application orchestration.
 *
 * One committed selection drives everything. Three row scopes, named as in Luxury Brands:
 *   scopeRows — countable venues after the filters (status, group, operator, province,
 *               search), BEFORE any district selection or focus. Comparison base for the
 *               Aha, the choropleth and the charts.
 *   baseRows  — scopeRows narrowed by the selected district (if any).
 *   rows      — baseRows narrowed by the district focus (if any). Pins, counters, the
 *               table and the panel counts use `rows`.
 *
 * Focus modes (state.focusAreaIds / state.autoFocus):
 *   auto     — default: the first-Aha districts (D1) carry the detail; URL stays clean.
 *   explicit — ?areas=1007,1004 chosen by the user.
 *   none     — ?areas=all: every district of the reading in detail.
 * The reading (readingProvince) is the province whose districts are drawn: the province
 * filter, the open district/venue/record, the Aha province in auto mode, else the country.
 *
 * Map: focus venues are accessible DOM pins (pins.js) up to MAX_DOM_PINS, the rest of the
 * scope are quiet GPU dots (venue-points.js), and pending records (D4) are lighter dots that
 * are never counted. One click router decides what a map click opens.
 * Camera: 3D presets (camera.js), basemap generated (map-style.js) on OpenFreeMap tiles.
 * Panel modes: overview | district | venue | pending (with a back stack); search results
 * replace the overview while a query is typed.
 * URL: q, status, group, operator, province, district, venue, record, pending, areas, view,
 * view3d, cam — restored on load. Resilience: core data first; map, details, pending and
 * logos are independent and retryable.
 */
import {GROUPS, STATUS_FILTERS, PROVINCES, provinceByCode, filterVenues, summarize, hasPoint, rowProvince, prepareRows, operatorRanking, districtWord, groupById, BANGKOK} from './model.js';
import {indexDistricts, summarizeDistricts, districtsInScope, districtLabel} from './areas.js';
import {summarizeAreaInsight, filterDistrictRows} from './area-insight.js';
import {renderInsightChart} from './charts.js';
import {provinceAreas} from './chart-model.js';
import {loadMapLibrary} from './vendors.js';
import {installVenuePins, MAX_DOM_PINS} from './pins.js';
import {installVenuePoints, POINT_LAYERS} from './venue-points.js';
import {installVenueBuildings, HOST_LAYERS} from './buildings.js';
import {installVenueXray} from './venue-xray.js';
import {configureVenueLogos, venueLogoMarkup} from './venue-logos.js';
import {installDistrictLayers, installAreaLabels, buildDistrictModel, featureBounds, FILL_MAX_ZOOM} from './map-layers.js';
import {installProvinceLayers, buildProvinceModel, provinceBounds, PROVINCE_FILL_MAX_ZOOM, PROVINCE_LABEL_MAX_ZOOM} from './provinces.js';
import {buildOverviewModel, buildDistrictProfile, buildVenueProfile, buildPendingCard, searchAll, indexPending} from './profile-model.js';
import {renderOverview, renderDistrict, renderVenue, renderPending, renderSearch, renderFilterChips, statusPill, esc, num, provinceShort, groupSwatch} from './panel.js';
import {buildMapStyle, basemapPalette, TILEJSON_URL, MASSING_BEFORE} from './map-style.js';
import {installMassing, outerRings} from './massing.js';
import {presetFor, applyPreset, fitPitched, framePoint} from './camera.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText} from './breadcrumb.js';
import {loadDetail, cachedDetail} from './details.js';
import {formatDensity} from './scales.js';
import {cueSVG} from './cues.js';

const $ = id => document.getElementById(id);
const FIELDS = ['search', 'status', 'group', 'operator', 'province'];
const URL_KEYS = Object.freeze({search: 'q', status: 'status', group: 'group', operator: 'operator', province: 'province'});
const BANGKOK_VIEW = {center: [100.536, 13.742], zoom: 12.4};
const THAILAND = [[97.3, 5.6], [105.7, 20.5]];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobilePortrait = () => matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
const THEME_KEY = 'citymeter-shoppingcenter-theme';

const state = {
  data: null, all: [], byId: new Map(), districts: new Map(), districtGeo: null, provinceGeo: null, buildingData: null, pending: null,
  scopeRows: [], baseRows: [], rows: [], insight: null, districtModel: null, provinceModel: null,
  view: 'rank', page: 0,
  focusAreaIds: [], autoFocus: true, focusIds: [],
  panel: {mode: 'overview', id: ''}, history: [],
  detail: null, detailError: false,
  showPending: true,
  map: null, loaded: false, mapTheme: '', initialCameraDone: false, tileTemplate: '', lastPreset: '',
  view3d: true, twoPoint: true,
  pins: null, points: null, buildings: null, massing: null, xray: null, districtLayers: null, districtLabels: null, provinceLayers: null, provinceLabels: null, marker: null,
};

/* ---------- helpers ---------- */
const values = () => Object.fromEntries(FIELDS.map(k => [k, $(k).value]));
const bottomSpace = () => $('insights').getBoundingClientRect().height + 12;
const activeFilterCount = f => FIELDS.filter(k => f[k]).length;
const overviewPanel = () => ({mode: 'overview', id: ''});
const sheetOffset = () => (mobilePortrait() ? [0, -Math.round(window.innerHeight * 0.2)] : [0, 0]);
const announce = text => { $('announcement').textContent = text; };
const theme = () => document.documentElement.dataset.theme;
const focusMode = () => (state.focusAreaIds.length ? 'explicit' : state.focusIds.length ? 'auto' : 'none');
const sheetOpen = () => mobilePortrait() && $('panel').classList.contains('is-open');
const venueLevel = () => state.panel.mode === 'venue';
const cameraPreset = () => presetFor({view3d: state.view3d, mode: state.panel.mode === 'overview' ? 'overview' : 'detail', twoPoint: state.twoPoint && venueLevel() && !sheetOpen()});
const animate = () => !reduced();
const currentVenue = () => (state.panel.mode === 'venue' ? state.byId.get(state.panel.id) || null : null);
const selectedDistrict = () => (state.panel.mode === 'district' ? state.districts.get(state.panel.id) || null : null);
const pendingCard = () => (state.panel.mode === 'pending' ? buildPendingCard(state.pending, Number(state.panel.id), state.districts) : null);
const asList = value => Array.isArray(value) ? value : (typeof value === 'string' ? (() => { try { const x = JSON.parse(value); return Array.isArray(x) ? x : []; } catch { return []; } })() : []);
const subjectWord = () => { const g = values().group; return g ? groupById(g).th : 'ศูนย์การค้าและสถานที่ค้าปลีก'; };

/** The province whose districts are drawn and ranked ('' = the whole country). */
function readingProvince() {
  const f = values();
  if (f.province) return f.province;
  if (state.panel.mode === 'district') return selectedDistrict()?.province || '';
  if (state.panel.mode === 'venue') { const r = currentVenue(); return r ? rowProvince(r) : ''; }
  if (state.panel.mode === 'pending') return pendingCard()?.province?.code || '';
  if (state.focusAreaIds.length) return state.districts.get(state.focusAreaIds[0])?.province || '';
  if (state.autoFocus && !f.search) return state.insight?.province || '';
  return '';
}

function saveURL() {
  const f = values(), p = new URLSearchParams();
  for (const k of FIELDS) if (f[k]) p.set(URL_KEYS[k], f[k]);
  if (state.panel.mode === 'district') p.set('district', state.panel.id);
  if (state.panel.mode === 'venue') p.set('venue', state.panel.id);
  if (state.panel.mode === 'pending') { const c = pendingCard(); if (c) p.set('record', c.id); }
  if (state.focusAreaIds.length) p.set('areas', state.focusAreaIds.join(','));
  else if (!state.autoFocus) p.set('areas', 'all');
  if (!state.showPending) p.set('pending', '0');
  if (state.view !== 'rank') p.set('view', state.view);
  if (!state.view3d) p.set('view3d', '0');
  if (!state.twoPoint) p.set('cam', 'model');
  history.replaceState(null, '', location.pathname + (p.size ? '?' + p : ''));
}

/* ---------- theme ---------- */
function applyTheme() {
  const value = $('theme').value;
  const next = value === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, value); } catch {}
  if (state.map && next !== state.mapTheme) {
    state.loaded = false;
    state.xray?.dispose(); state.xray = null;
    state.buildings?.dispose(); state.buildings = null;
    state.massing?.dispose(); state.massing = null;
    state.points = null; state.districtLayers = null; state.provinceLayers = null;
    state.mapTheme = next;
    state.map.setStyle(buildMapStyle(next), {diff: false});
  }
  if (state.data) { drawChart(); renderLegend(); }
}

/* ---------- selection ---------- */
const provinceScopeRows = () => filterVenues(state.all, {...values(), province: ''});

function update({fit = false, camera = true} = {}) {
  const f = values();
  const district = selectedDistrict();
  state.scopeRows = filterVenues(state.all, f);
  state.baseRows = district ? state.scopeRows.filter(r => r.districtCode === district.code) : state.scopeRows;
  state.insight = summarizeAreaInsight(state.scopeRows, state.districts, {province: f.province});
  state.focusIds = district ? [] : state.focusAreaIds.length ? state.focusAreaIds : (state.autoFocus && !f.search ? state.insight.districtIds : []);
  state.rows = state.focusIds.length ? filterDistrictRows(state.baseRows, new Set(state.focusIds)) : state.baseRows;
  state.page = 0;
  const readCode = readingProvince();
  state.districtModel = buildDistrictModel(summarizeDistricts(state.scopeRows, districtsInScope(state.districts, readCode)));
  state.provinceModel = state.provinceGeo?.features?.length ? buildProvinceModel(provinceScopeRows(), state.provinceGeo) : null;
  if (state.panel.mode === 'district' && !district) state.panel = overviewPanel();

  const s = summarize(state.rows);
  $('result-count').textContent = num(s.venues);
  $('filter-count').textContent = activeFilterCount(f) ? String(activeFilterCount(f)) : '';
  $('filter-chips').innerHTML = renderFilterChips(f, {status: STATUS_FILTERS, operator: operatorLabels()});
  renderPanel();
  renderLegend();
  updatePins();
  if (state.loaded) {
    updateSpatialLayers();
    if (fit) fitMap();
    else if (camera && state.lastPreset && cameraPreset() !== state.lastPreset) {
      const d = selectedDistrict();
      if (d) fitArea(d.feature); else applyPreset(state.map, cameraPreset(), {animate: animate()});
    }
    state.lastPreset = cameraPreset();
  }
  drawChart();
  renderTable();
  saveURL();
  announce(`พบ ${num(s.venues)} แห่ง`);
}

/**
 * Venues that carry detail on the map: the venue (with its components) at venue level,
 * nothing extra for a pending record, else the focused rows.
 */
function detailRows() {
  const v = currentVenue();
  if (v) {
    const family = [v, ...(v.children || []).map(id => state.byId.get(id)).filter(Boolean)];
    if (v.parentId && state.byId.get(v.parentId)) family.push(state.byId.get(v.parentId));
    return family;
  }
  if (state.panel.mode === 'pending') return [];
  return state.rows;
}

function updatePins() {
  const focus = detailRows().filter(hasPoint);
  const ids = new Set(focus.map(r => r.id));
  const gpuFocus = focus.length > MAX_DOM_PINS;
  const pointRows = state.scopeRows.filter(hasPoint);
  const inScope = new Set(state.scopeRows);
  for (const r of focus) if (!inScope.has(r)) pointRows.push(r);
  state.points?.update({rows: pointRows, focusIds: ids, gpuFocus, pending: state.pending, showPending: state.showPending});
  const domPins = gpuFocus ? focus.filter(r => r.id === currentVenue()?.id) : focus;
  state.pinPoints = domPins.map(r => [r.lon, r.lat]);
  if (state.pins) {
    state.pins.update(domPins);
    state.pins.select(currentVenue()?.id || '');
  }
  state.districtLabels?.layout();
}

/* ---------- breadcrumb ---------- */
function renderCrumbs() {
  const v = currentVenue();
  const c = pendingCard();
  const district = selectedDistrict() || (v?.districtCode ? state.districts.get(v.districtCode) : null) || c?.district || null;
  const province = values().province || (v ? rowProvince(v) : '') || c?.province?.code || (focusMode() !== 'none' && !values().search ? state.insight?.province : '') || '';
  const crumbs = buildBreadcrumb({province, district, venue: v ? {id: v.id, label: v.name} : c ? {id: '', label: c.name} : null});
  $('crumbs').innerHTML = renderBreadcrumb(crumbs);
  document.title = `${breadcrumbText(crumbs)} · ศูนย์การค้าและสถานที่ค้าปลีก · CityMETER`;
  return crumbs;
}

/* ---------- panel ---------- */
function statusRows(extra) {
  const f = values();
  const base = {...f, ...extra};
  return {
    planned: f.status === 'planned' || f.status === 'all' ? [] : filterVenues(state.all, {...base, status: 'planned'}),
    closed: f.status === 'closed' || f.status === 'all' ? [] : filterVenues(state.all, {...base, status: 'closed'}),
  };
}

function renderPanel() {
  const view = $('panel-view');
  const mode = state.panel.mode;
  const asOf = state.data.meta?.asOf || '';
  renderCrumbs();
  syncEyeToggle();
  let html = '';
  const f = values();
  if (mode === 'district') {
    const d = selectedDistrict();
    const ranked = [...state.districtModel.areas].filter(a => a.count > 0).sort((a, b) => b.density - a.density || b.count - a.count);
    const area = state.districtModel.areas.find(a => a.id === d.code) || {...d, count: 0, density: 0};
    const rank = ranked.findIndex(a => a.id === d.code) + 1;
    html = renderDistrict(buildDistrictProfile({area, rows: state.baseRows, rank, of: ranked.length, ...statusRows({district: d.code, province: ''})}), {asOf});
  } else if (mode === 'venue') {
    const v = currentVenue();
    const detail = state.detail?.id === v?.id ? state.detail : cachedDetail(v?.id, state.data.meta?.detail?.shards);
    html = renderVenue(buildVenueProfile({row: v, detail, byId: state.byId, districts: state.districts}), {asOf, buildings: venueHostFeatures(), detailError: state.detailError});
  } else if (mode === 'pending') {
    html = renderPending(pendingCard(), {asOf});
  }
  if (!html && f.search) {
    html = renderSearch(searchAll(f.search, {rows: state.all, pending: state.pending}), {pending: state.pending, districts: state.districts, asOf});
    $('map-aha').hidden = true;
  } else if (!html) {
    const readCode = readingProvince();
    const insight = state.insight;
    const areas = state.districtModel.areas;
    const model = buildOverviewModel({rows: state.rows, scopeRows: state.scopeRows, areas, kind: 'district', readCode, ...statusRows({province: readCode || f.province})});
    const provinces = (state.provinceModel?.provinces || []).filter(p => p.count > 0).sort((a, b) => b.count - a.count);
    html = renderOverview({insight, model, focusMode: focusMode(), readCode: f.province || (focusMode() === 'none' ? '' : readCode), national: !f.province, subject: subjectWord(), asOf, provinces});
    renderMapAha(insight);
  } else {
    $('map-aha').hidden = true;
  }
  view.innerHTML = html;
  view.dataset.mode = mode;
  const key = `${mode}:${state.panel.id}:${f.province}:${f.search}`;
  if (key !== renderPanel.lastKey) $('panel').scrollTop = 0;
  renderPanel.lastKey = key;
}

function renderMapAha(insight) {
  const el = $('map-aha');
  if (!insight.districts.length) { el.hidden = true; return; }
  const mode = focusMode();
  el.hidden = $('panel').classList.contains('is-open');
  const word = districtWord(insight.province);
  const crumb = `<p class="map-aha-crumb">ประเทศไทย › ${esc(provinceByCode(insight.province)?.th || '')}</p>`;
  el.innerHTML = mode === 'explicit'
    ? `<div>${crumb}<h2>กำลังสำรวจ ${num(insight.districts.length)} ${word}</h2><p>${num(insight.count)} แห่ง</p></div><button type="button" class="btn" data-action="all-districts" data-id="${esc(insight.province)}">ดูทุก${word}</button>`
    : `<div>${crumb}<h2>${num(Math.round(insight.share))}% ของ${esc(subjectWord())}ใน${esc(provinceShort(insight.province))} อยู่ใน ${num(insight.districts.length)} ${word}</h2><p>${insight.districts.map(d => esc(d.th)).join(' · ')}</p></div>${mode === 'auto'
      ? `<button type="button" class="btn" data-action="all-districts" data-id="${esc(insight.province)}">ดูทุก${word}</button>`
      : '<button type="button" class="btn primary" data-action="explore-top">โฟกัส</button>'}`;
}

function pushHistory() { state.history.push({...state.panel}); if (state.history.length > 20) state.history.shift(); }

function goBack() {
  const previous = state.history.pop();
  const leaving = state.panel.mode;
  state.panel = previous && previous.mode !== 'overview' ? previous : overviewPanel();
  if (state.panel.mode === 'venue') openVenueDetail(state.panel.id);
  update({fit: leaving === 'district' || state.panel.mode !== 'overview'});
}

function selectDistrict(code, {fromMap = false} = {}) {
  const d = state.districts.get(code);
  if (!d) return;
  if (state.panel.mode !== 'district' || state.panel.id !== code) pushHistory();
  state.focusAreaIds = [];
  state.panel = {mode: 'district', id: code};
  update({camera: false});
  if (!fromMap) openMobilePanel();
  if (state.loaded) { fitArea(d.feature); state.lastPreset = cameraPreset(); }
  announce(`${districtLabel(d)} ${num(state.baseRows.length)} แห่ง`);
}

function openVenueDetail(id) {
  state.detail = cachedDetail(id, state.data.meta?.detail?.shards);
  state.detailError = false;
  if (state.detail) return;
  loadDetail(id, {shards: state.data.meta?.detail?.shards || 32}).then(d => {
    if (state.panel.mode !== 'venue' || state.panel.id !== id) return;
    state.detail = d; renderPanel();
  }).catch(e => {
    console.warn('Venue detail', e);
    if (state.panel.mode === 'venue' && state.panel.id === id) { state.detailError = true; renderPanel(); }
  });
}

function selectVenue(id, {fromMap = false} = {}) {
  const r = state.byId.get(id);
  if (!r) return;
  if (state.panel.mode !== 'venue' || state.panel.id !== id) pushHistory();
  state.panel = {mode: 'venue', id};
  openVenueDetail(id);
  update({camera: false});
  if (state.loaded) { frameVenue(r); state.lastPreset = cameraPreset(); }
  if (!fromMap || mobilePortrait()) openMobilePanel();
  announce(`เลือก ${r.name}`);
}

function selectPending(index, {fromMap = false} = {}) {
  const c = buildPendingCard(state.pending, Number(index), state.districts);
  if (!c) return;
  pushHistory();
  state.panel = {mode: 'pending', id: String(index)};
  update({camera: false});
  if (state.loaded) { framePoint(state.map, [c.lon, c.lat], {preset: cameraPreset(), zoom: 15.5, offset: sheetOffset(), animate: animate()}); state.lastPreset = cameraPreset(); }
  if (!fromMap || mobilePortrait()) openMobilePanel();
  announce(`รายการรอตรวจ ${c.name}`);
}

/** Frame a venue on its host building(s) when it has qualified geometry, else on its point. */
function frameVenue(row, {instant = false} = {}) {
  const map = state.map, preset = cameraPreset();
  const targets = venueTargets();
  if (targets.length && preset !== 'plan' && !mobilePortrait()) {
    const ground = targets.flatMap(t => t.ring.map(([lng, lat]) => [lng, lat, 0]));
    const roof = targets.flatMap(t => t.ring.map(([lng, lat]) => [lng, lat, t.height]));
    const bounds = ground.reduce((b, p) => b.extend([p[0], p[1]]), new maplibregl.LngLatBounds([ground[0][0], ground[0][1]], [ground[0][0], ground[0][1]]));
    const h = map.getContainer().clientHeight;
    const padding = {top: Math.round(h * (preset === 'eye' ? 0.12 : 0.1)), bottom: 48, left: 48, right: 48};
    const foot = fitPitched(map, bounds, {preset, points: ground, padding, maxZoom: 17.6, minZoom: 14.5, apply: false});
    const minZoom = Math.max(14.5, (foot?.zoom ?? 17.6) - 1);
    fitPitched(map, bounds, {preset, points: [...ground, ...roof], padding, maxZoom: 17.6, minZoom, animate: animate() && !instant});
    return;
  }
  if (hasPoint(row)) framePoint(map, [row.lon, row.lat], {preset, zoom: 16, offset: sheetOffset(), animate: animate() && !instant});
}

/** Focus the first-Aha districts of the current reading (auto mode; URL stays clean). */
function exploreTop() { state.autoFocus = true; state.focusAreaIds = []; state.panel = overviewPanel(); state.history = []; update({fit: true}); closeMobilePanel(); }
/** Every district of a province in detail: province filter + areas=all. */
function allDistricts(code) {
  if (code && provinceByCode(code)) setProvinceFilter(code);
  state.autoFocus = false; state.focusAreaIds = []; state.panel = overviewPanel(); state.history = [];
  update({fit: true});
}
/** The whole country: no province, no focus. */
function showCountry() {
  $('province').value = ''; $('search').value = '';
  state.autoFocus = false; state.focusAreaIds = []; state.panel = overviewPanel(); state.history = [];
  update({fit: true});
}

function setProvinceFilter(code) {
  if (![...$('province').options].some(o => o.value === code)) {
    const o = document.createElement('option'); o.value = code; o.textContent = provinceByCode(code)?.th || code; $('province').append(o);
  }
  $('province').value = code;
}

/** Drill down into a province frame: the จังหวัด filter, overview, camera on the province (auto focus inside it). */
function selectProvince(code) {
  if (!provinceByCode(code)) return;
  setProvinceFilter(code);
  state.autoFocus = true; state.focusAreaIds = []; state.panel = overviewPanel(); state.history = [];
  update({fit: true});
  announce(`จังหวัด${provinceByCode(code).th}`);
}

function resetToOverview({fit = true} = {}) {
  state.focusAreaIds = []; state.autoFocus = true; state.panel = overviewPanel(); state.history = [];
  update({fit});
}

function clearFilter(key) {
  if (key === 'all') { $('filters').reset(); return; }
  $(key).value = '';
  update({fit: key !== 'search'});
}

function onPanelAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const {action, id} = target.dataset;
  switch (action) {
    case 'select-district': selectDistrict(id); break;
    case 'select-venue': selectVenue(id); break;
    case 'select-pending': selectPending(id); break;
    case 'select-province': selectProvince(id); break;
    case 'back': goBack(); break;
    case 'explore-top': exploreTop(); break;
    case 'all-districts': allDistricts(id); break;
    case 'country': showCountry(); break;
    case 'open-charts': openInsights(true); closeMobilePanel(); break;
    case 'open-table': $('results').hidden = false; closeMobilePanel(); $('toggle-table').focus({preventScroll: true}); break;
    case 'clear-filter': clearFilter(id); break;
    case 'set-group': $('group').value = id; state.panel = state.panel.mode === 'district' ? state.panel : overviewPanel(); update({fit: state.panel.mode === 'overview'}); break;
    case 'crumb-country': $('province').value = ''; showCountry(); break;
    case 'crumb-province': selectProvince(id); break;
    case 'crumb-district': selectDistrict(id); break;
    case 'crumb-venue': selectVenue(id); break;
    case 'crumb-expand': { const ol = target.closest('.crumbs'); ol.classList.add('is-expanded'); target.setAttribute('aria-expanded', 'true'); ol.querySelector('.crumb:not(.crumb-more)')?.focus({preventScroll: true}); break; }
    case 'toggle-pending': togglePending(); break;
    default: break;
  }
}

/* ---------- legend ---------- */
const provinceZoom = () => Boolean(state.provinceModel) && !readingProvince() && (state.map?.getZoom?.() ?? 6) < PROVINCE_FILL_MAX_ZOOM;
function renderLegend() {
  const atProvince = provinceZoom();
  const model = atProvince ? state.provinceModel : state.districtModel;
  const steps = $('legend-steps');
  const readCode = readingProvince();
  const word = readCode ? districtWord(readCode) : 'เขต/อำเภอ';
  $('legend-title').textContent = atProvince ? 'จังหวัด · จำนวนสถานที่' : `${word} · แห่ง/ตร.กม.`;
  if (!model || !model.classes.classes.length) steps.innerHTML = '<span class="hint">ไม่มีสถานที่ในตัวกรองนี้</span>';
  else {
    steps.innerHTML = model.classes.classes.map(c => `<span class="legend-step"><i style="background:${c.fill}" aria-hidden="true"></i>${esc(c.label)}</span>`).join('') +
      (model.zeroCount ? `<span class="legend-step" title="พื้นที่ที่ไม่มีสถานที่ในตัวกรองนี้ (วัดได้ว่าเป็นศูนย์)"><i class="legend-zero" aria-hidden="true"></i>0</span>` : '');
    $('legend-areas').title = atProvince
      ? `จำนวนสถานที่ต่อจังหวัด · ${model.classes.classCount} ระดับแบบควอนไทล์ · สีเดียวกันทั้งสองธีม`
      : `สถานที่ต่อตารางกิโลเมตรของ${word} (ตัวหาร = พื้นที่ตามขอบเขต OpenGISData-Thailand) · ${model.classes.classCount} ระดับแบบควอนไทล์ · สีเดียวกันทั้งสองธีม`;
  }
  $('toggle-pending').setAttribute('aria-pressed', String(state.showPending));
  $('pending-count').textContent = state.pending ? num(state.pending.rows.length) : '';
  document.querySelector('.map-panel').classList.toggle('is-3d', state.view3d);
  document.querySelector('.map-panel').classList.toggle('is-province-zoom', atProvince);
}

function togglePending() {
  state.showPending = !state.showPending;
  updatePins();
  renderLegend();
  saveURL();
  announce(state.showPending ? 'แสดงรายการรอตรวจนิยาม' : 'ซ่อนรายการรอตรวจนิยาม');
}

/* ---------- charts ---------- */
let chartDispose = null;
function operatorLabels() {
  return Object.fromEntries([...(state.data?.meta?.operatorGroups || []).map(g => [g.id, g.label]), ['__other__', 'ผู้บริหารรายอื่น'], ['__none__', 'ยังไม่ระบุผู้บริหาร']]);
}
function drawChart() {
  if (!state.data) return;
  chartDispose?.(); chartDispose = null;
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === state.view));
  $('chart').setAttribute('aria-labelledby', 'tab-' + state.view);
  const readCode = readingProvince();
  const kind = readCode ? 'district' : 'province';
  $('chart-scope').textContent = `${num(state.scopeRows.length)} แห่งในตัวกรอง · ${readCode ? `ทุก${districtWord(readCode)}ใน${provinceShort(readCode)}` : 'ทุกจังหวัด'}`;
  $('tab-rank').textContent = readCode ? `${districtWord(readCode)}หนาแน่น` : 'จังหวัด';
  if ($('insight-content').hidden) return;
  const areas = kind === 'district' ? state.districtModel.areas : provinceAreas(state.scopeRows, state.provinceModel);
  chartDispose = renderInsightChart({
    elementId: 'chart', view: state.view, areas, kind, unitWord: districtWord(readCode),
    operatorRows: operatorRanking(state.scopeRows), total: state.scopeRows.length,
    selectedId: state.panel.mode === 'district' ? state.panel.id : values().province, selectedOperator: values().operator, theme: theme(),
  }, selection => {
    if (selection.type === 'area') { if (kind === 'district') selectDistrict(selection.id, {fromMap: true}); else selectProvince(selection.id); }
    if (selection.type === 'operator') { $('operator').value = selection.id; update({fit: true}); }
  });
}

function openInsights(open) {
  $('insight-content').hidden = !open;
  $('insights').classList.toggle('is-collapsed', !open);
  $('toggle-insights').setAttribute('aria-expanded', String(open));
  $('toggle-insights').textContent = open ? 'ย่อกราฟ' : 'เปิดกราฟ';
  requestAnimationFrame(() => { syncBottomPanel(); drawChart(); });
}

function syncBottomPanel() {
  document.documentElement.style.setProperty('--bottom-panel-height', `${$('insights').getBoundingClientRect().height}px`);
  state.pins?.layout();
  state.districtLabels?.layout();
  state.provinceLabels?.layout();
}

/* ---------- table ---------- */
function renderTable() {
  const pageSize = 25, list = state.rows.length ? state.rows : [], start = state.page * pageSize, rs = list.slice(start, start + pageSize);
  $('result-rows').innerHTML = rs.map(r => {
    const g = groupById(r.group);
    const d = r.districtCode ? state.districts.get(r.districtCode) : null;
    return `<tr><td><button type="button" class="row-name venue-table-row" data-id="${esc(r.id)}">${venueLogoMarkup(r.id, {name: r.name, size: 'sm'}) || groupSwatch(g)}<span>${esc(r.name)}</span></button><small>${esc(r.nameEn && r.nameEn !== r.name ? r.nameEn : '')}</small></td>
      <td>${groupSwatch(g)} ${esc(g.th)}</td>
      <td>${r.operatorLabel ? esc(r.operatorLabel) : '<span class="hint">ยังไม่มีข้อมูล</span>'}</td>
      <td>${d ? esc(districtLabel(d)) : '<span class="hint">ยังไม่มีพิกัด</span>'}<small>${esc(provinceByCode(rowProvince(r))?.th || r.addrProvince || '')}</small></td>
      <td>${statusPill(r)}</td>
      <td class="data-number">${r.storeCount ? num(r.storeCount) : '<span class="hint">—</span>'}</td>
      <td><small class="data-number">${esc(r.id)}</small></td></tr>`;
  }).join('') || '<tr><td colspan="7">ไม่พบสถานที่ตามตัวกรอง</td></tr>';
  $('page-label').textContent = list.length ? `${num(start + 1)}–${num(Math.min(start + pageSize, list.length))} / ${num(list.length)}` : '0 แห่ง';
  $('prev-page').disabled = state.page === 0;
  $('next-page').disabled = start + pageSize >= list.length;
  for (const b of $('result-rows').querySelectorAll('[data-id]')) b.onclick = () => { selectVenue(b.dataset.id); $('panel').scrollTop = 0; };
}

/* ---------- map ---------- */
function cameraPadding() {
  const height = $('map').clientHeight, panel = $('insights').getBoundingClientRect().height;
  const edge = Math.min(48, Math.max(12, (height - panel) / 6));
  const mapTop = $('map').getBoundingClientRect().top, toolbar = document.querySelector('.map-toolbar').getBoundingClientRect();
  const aha = $('map-aha'), legend = $('map-legend');
  const chromeTop = !aha.hidden && aha.offsetHeight ? aha.getBoundingClientRect().top : legend.offsetHeight ? legend.getBoundingClientRect().top : null;
  let bottom = chromeTop != null ? height - (chromeTop - mapTop) + 12 : panel + edge;
  if (mobilePortrait() && $('panel').classList.contains('is-open')) bottom = Math.max(bottom, Math.round(window.innerHeight * 0.64) - (window.innerHeight - height - mapTop) + 8);
  return {top: Math.max(edge, toolbar.bottom - mapTop + 12), left: edge, right: edge, bottom: Math.min(height * 0.7, bottom)};
}

function pitchedPadding() {
  const mapTop = $('map').getBoundingClientRect().top, toolbar = document.querySelector('.map-toolbar').getBoundingClientRect();
  return {top: Math.round(toolbar.bottom - mapTop + 12), bottom: Math.round($('insights').getBoundingClientRect().height + 40), left: 24, right: 24};
}

function vertices(features) {
  const out = [];
  const walk = v => { if (typeof v[0] === 'number') out.push(v); else v.forEach(walk); };
  for (const f of features) walk(f.geometry.coordinates);
  return out;
}

/** Frame one district (flat plan while the phone sheet covers the map; the 3D preset applies when it closes). */
function fitArea(feature, {instant = false} = {}) {
  const preset = sheetOpen() ? 'plan' : cameraPreset();
  const pitched = preset !== 'plan' && !mobilePortrait();
  fitPitched(state.map, featureBounds(feature, maplibregl.LngLatBounds), {preset, padding: pitched ? pitchedPadding() : cameraPadding(), maxZoom: 16.5, minZoom: 7, animate: animate() && !instant, points: vertices([feature]), shift: mobilePortrait() ? -0.08 : null});
}

function fitBounds(b, {instant = false, points = null, maxZoom = 15} = {}) {
  const wide = b.getNorth() - b.getSouth() > 0.3 || b.getEast() - b.getWest() > 0.3;
  const preset = wide ? 'plan' : cameraPreset();
  const pitched = preset !== 'plan' && !mobilePortrait();
  fitPitched(state.map, b, {preset, padding: pitched ? pitchedPadding() : cameraPadding(), maxZoom, minZoom: 4.5, animate: animate() && !instant, points: wide ? null : points, shift: mobilePortrait() && !wide ? -0.12 : null});
}

function fitMap({instant = false} = {}) {
  if (!state.loaded) return;
  const d = selectedDistrict();
  if (d) { fitArea(d.feature, {instant}); return; }
  const v = currentVenue();
  if (v) { frameVenue(v, {instant}); return; }
  const c = pendingCard();
  if (c) { framePoint(state.map, [c.lon, c.lat], {preset: cameraPreset(), zoom: 15.5, animate: animate() && !instant}); return; }
  const LB = maplibregl.LngLatBounds;
  const focus = state.focusIds.map(id => state.districts.get(id)).filter(Boolean);
  if (focus.length) {
    const b = new LB();
    for (const x of focus) featureBounds(x.feature, LB).toArray().forEach(p => b.extend(p));
    fitBounds(b, {instant, points: vertices(focus.map(x => x.feature))});
    return;
  }
  const readCode = readingProvince();
  if (values().search) {
    const pts = state.rows.filter(hasPoint);
    if (pts.length) { const b = new LB(); pts.forEach(r => b.extend([r.lon, r.lat])); fitBounds(b, {instant, maxZoom: 15.5}); }
    return;
  }
  if (readCode) { const b = provinceBounds(state.provinceGeo, readCode, LB); if (b) { fitBounds(b, {instant, maxZoom: 13}); return; } }
  fitBounds(new LB(THAILAND[0], THAILAND[1]), {instant});
}

function updateSpatialLayers() {
  if (!state.loaded) return;
  const map = state.map;
  const readCode = readingProvince();
  const d = selectedDistrict();
  const pm = state.provinceLayers?.update({rows: provinceScopeRows(), readCode, visible: true}) || null;
  if (pm) state.provinceModel = pm;
  state.provinceLabels?.update(pm ? pm.provinces.filter(p => p.count > 0 && (!readCode || p.code === readCode)).map(p => ({...p, quiet: Boolean(readCode)})) : [], {visible: true, LngLatBounds: maplibregl.LngLatBounds, unit: 'แห่ง', maxZoom: readCode ? 7.5 : PROVINCE_LABEL_MAX_ZOOM});
  const dm = state.districtLayers?.update({summaries: state.districtModel.areas, selectedId: d?.code || '', focusIds: state.focusIds, visible: true, minzoom: readCode ? 0 : PROVINCE_FILL_MAX_ZOOM});
  if (dm) state.districtModel = dm;
  const labelAreas = (dm?.areas || []).filter(a => a.count > 0 || a.focused || a.id === d?.code).map(a => ({...a, center: Number.isFinite(a.feature.properties?.labelLon) ? [a.feature.properties.labelLon, a.feature.properties.labelLat] : null}));
  // Quiet (non-focus) district labels wait for a closer zoom so the focus reads first.
  state.districtLabels?.update(labelAreas, {selectedId: d?.code || '', visible: true, LngLatBounds: maplibregl.LngLatBounds, unit: 'แห่ง', minZoom: readCode ? 9.2 : 10, quietMinZoom: 13.2});
  renderLegend();
  const detail = detailRows();
  state.buildings?.update({rows: detail, enabled: true, theme: theme()});
  const hostFeatures = state.buildings?.displayedFeatures() || [];
  // Focus massing: small districts are decoded whole; large ones only around their venues (bounded tile budget).
  const focusDistricts = d ? [d] : state.focusIds.map(id => state.districts.get(id)).filter(Boolean);
  const smallArea = focusDistricts.length && focusDistricts.reduce((s, x) => s + x.areaKm2, 0) <= 40;
  const regions = smallArea ? focusDistricts.flatMap(x => outerRings(x.feature)) : circleRegions(detail.filter(hasPoint).slice(0, 60));
  const anchors = regions.length ? regions.map(ring => ring[0]) : detail.filter(hasPoint).slice(0, 60).map(r => [r.lon, r.lat]);
  state.massing?.update({
    regions, hosts: hostFeatures.flatMap(outerRings), anchors,
    enabled: true, city: state.view3d, zoom: map.getZoom(), latitude: map.getCenter().lat,
  })?.catch(e => console.warn('Massing', e));
  state.massing?.setScene(cameraPreset() === 'eye' ? 'eye' : 'default', venueTargets(hostFeatures));
  const hostColors = () => { const s = getComputedStyle(document.documentElement); return {fill: s.getPropertyValue('--map-active-layer').trim(), stroke: s.getPropertyValue('--map-selected-stroke').trim()}; };
  state.xray?.update(venueLevel() ? venueHostFeatures(hostFeatures).filter(f => f.properties?.render_as === 'extrusion') : [], {colors: hostColors()});
  state.xray?.setEnabled(state.view3d);
  updatePendingMarker();
  state.pins?.layout();
}

/** 24-gon rings of radius r metres around points (focus massing for large districts). */
function circleRegions(rows, r = 420) {
  return rows.map(row => {
    const ring = [];
    const dLat = r / 111320, dLng = r / (111320 * Math.cos((row.lat * Math.PI) / 180));
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; ring.push([row.lon + dLng * Math.cos(a), row.lat + dLat * Math.sin(a)]); }
    return ring;
  });
}

/** Host building features (footprints + parts) of the venue being looked at. */
function venueHostFeatures(hostFeatures = state.buildings?.displayedFeatures() || []) {
  const v = currentVenue();
  if (!v) return [];
  return hostFeatures.filter(f => asList(f.properties?.venue_ids).includes(v.id));
}
function venueTargets(hostFeatures) {
  return venueHostFeatures(hostFeatures).flatMap(f => outerRings(f).map(ring => ({ring, height: Number(f.properties?.display_height_m) || 3})));
}

/** A ring marker on the selected pending record (it has no pin of its own). */
function updatePendingMarker() {
  const c = pendingCard();
  if (!c || !state.map) { state.marker?.remove(); state.marker = null; return; }
  if (!state.marker) {
    const el = document.createElement('div');
    el.className = 'pending-marker';
    el.setAttribute('aria-hidden', 'true');
    state.marker = new maplibregl.Marker({element: el}).setLngLat([c.lon, c.lat]).addTo(state.map);
  } else state.marker.setLngLat([c.lon, c.lat]);
}

/** One router for map clicks: venue solid → venue dots → pending dots → host buildings → district → province. */
function routeClick(e) {
  const map = state.map;
  if (state.xray?.hitTest([e.point.x, e.point.y])) { const v = currentVenue(); if (v && state.panel.mode !== 'venue') selectVenue(v.id, {fromMap: true}); return; }
  const box = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
  const has = id => map.getLayer(id);
  const pick = (layers, at = box) => { const ls = layers.filter(has); return ls.length ? map.queryRenderedFeatures(at, {layers: ls})[0] : null; };
  let f = pick([POINT_LAYERS.focus, POINT_LAYERS.context]);
  if (f) { selectVenue(f.properties.id, {fromMap: true}); return; }
  f = pick([POINT_LAYERS.pending]);
  if (f) { selectPending(f.properties.i, {fromMap: true}); return; }
  f = pick([HOST_LAYERS.extrusion, HOST_LAYERS.outline], e.point);
  if (f) { const id = asList(f.properties?.venue_ids).find(x => state.byId.has(x)); if (id) { selectVenue(id, {fromMap: true}); return; } }
  f = pick([state.districtLayers?.layerIds.fill].filter(Boolean), e.point);
  if (f) { selectDistrict(f.properties.id, {fromMap: true}); return; }
  f = pick([state.provinceLayers?.layerIds.fill].filter(Boolean), e.point);
  if (f) selectProvince(f.properties.code);
}

let hoverFrame = 0;
function routeHover(e) {
  cancelAnimationFrame(hoverFrame);
  hoverFrame = requestAnimationFrame(() => {
    const map = state.map;
    if (!map) return;
    const layers = [POINT_LAYERS.focus, POINT_LAYERS.context, POINT_LAYERS.pending, HOST_LAYERS.extrusion, HOST_LAYERS.outline, state.districtLayers?.layerIds.fill, state.provinceLayers?.layerIds.fill].filter(id => id && map.getLayer(id));
    const over = Boolean(state.xray?.hitTest([e.point.x, e.point.y])) || map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], {layers}).length > 0;
    map.getCanvas().style.cursor = over ? 'pointer' : '';
  });
}

function installSpatialLayers() {
  const map = state.map;
  state.loaded = true;
  const palette = basemapPalette(theme());
  state.provinceLayers = state.provinceGeo?.features?.length ? installProvinceLayers(map, state.provinceGeo) : null;
  state.districtLayers = state.districtGeo?.features?.length ? installDistrictLayers(map) : null;
  // Draw order is depth order in MapLibre's 3D pass: the host (data) layer first, massing inserted BEFORE it.
  state.buildings = installVenueBuildings(map, state.buildingData, {rows: detailRows(), enabled: true, theme: theme(), beforeId: MASSING_BEFORE});
  state.massing = installMassing(map, {
    beforeId: map.getLayer(HOST_LAYERS.extrusion) ? HOST_LAYERS.extrusion : MASSING_BEFORE, colors: {quiet: palette.massingQuiet, focus: palette.massingFocus, ground: palette.ground},
    tileUrl: t => (state.tileTemplate ? state.tileTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y) : ''),
    onResult: result => { state.massingResult = result; $('map-status').dataset.massing = `${result.features || 0}`; },
  });
  try { state.xray = installVenueXray(map, {beforeId: MASSING_BEFORE}); }
  catch (e) { state.xray = null; console.warn('Venue x-ray unavailable', e); }
  // Venue and pending dots sit above every 3D layer so they are never hidden inside a building.
  state.points = installVenuePoints(map);
  updatePins();
  updateSpatialLayers();
  if (!state.initialCameraDone) { state.initialCameraDone = true; fitMap({instant: true}); state.lastPreset = cameraPreset(); }
}

function initMap() {
  if (!window.maplibregl) throw new Error('Map library is unavailable');
  try {
    state.mapTheme = theme();
    state.map = new maplibregl.Map({container: 'map', center: BANGKOK_VIEW.center, zoom: BANGKOK_VIEW.zoom, pitch: 0, maxPitch: 85, attributionControl: {compact: true}, style: buildMapStyle(state.mapTheme)});
    state.map.addControl(new maplibregl.NavigationControl({showCompass: true, visualizePitch: true}), 'top-right');
    state.districtLabels = installAreaLabels(state.map, $('map'), {className: 'district-label', hostId: 'district-labels', hostLabel: 'เขตและอำเภอบนแผนที่', minZoom: 9.2, verb: 'กดเพื่อสำรวจ', onSelect: id => selectDistrict(id, {fromMap: true}), reservedBottom: bottomSpace,
      avoid: () => state.pinPoints, onLayout: () => state.pins?.layout()});
    state.provinceLabels = installAreaLabels(state.map, $('map'), {className: 'province-label', hostId: 'province-labels', hostLabel: 'จังหวัดบนแผนที่', minZoom: 0, maxZoom: PROVINCE_LABEL_MAX_ZOOM, verb: 'กดเพื่อดูจังหวัด', detailZoomClass: false, onSelect: code => selectProvince(code), reservedBottom: bottomSpace});
    state.map.on('zoomend', () => { if (state.loaded) renderLegend(); });
    state.pins = installVenuePins(state.map, $('map'), {
      reservedBottom: bottomSpace,
      onSelect: r => selectVenue(r.id, {fromMap: true}),
      onLayout: stats => { $('map-status').textContent = `${num(stats.visiblePins)} หมุด · โลโก้ ${num(stats.visibleLogos)}/${num(stats.logoLimit)}`; },
    });
    state.map.on('style.load', installSpatialLayers);
    state.map.on('click', routeClick);
    state.map.on('mousemove', routeHover);
    state.map.on('error', e => console.warn('Map resource', e.error?.message || e));
    fetch(TILEJSON_URL).then(r => r.json()).then(j => { state.tileTemplate = j.tiles?.[0] || ''; if (state.loaded) updateSpatialLayers(); }).catch(e => console.warn('TileJSON', e));
  } catch (e) {
    state.loaded = false; state.initialCameraDone = false;
    for (const cleanup of [() => state.pins?.dispose(), () => state.districtLabels?.dispose(), () => state.provinceLabels?.dispose(), () => state.xray?.dispose(), () => state.buildings?.dispose(), () => state.massing?.dispose(), () => state.map?.remove()]) { try { cleanup(); } catch (err) { console.warn('Map cleanup', err); } }
    state.map = null; state.pins = null; state.districtLabels = null; state.provinceLabels = null; state.buildings = null; state.massing = null; state.xray = null; state.points = null; state.districtLayers = null; state.provinceLayers = null;
    throw e;
  }
}

async function startMap() {
  const el = $('map-failure');
  try { await loadMapLibrary(); el.hidden = true; initMap(); }
  catch (e) {
    el.hidden = false;
    el.innerHTML = `<p>โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้</p><p class="hint">${esc(e.message || '')}</p><button type="button" class="btn">ลองโหลดแผนที่ใหม่</button>`;
    el.querySelector('button').onclick = event => { event.target.disabled = true; startMap(); };
    console.warn(e);
  }
}

function toggle3d() {
  state.view3d = !state.view3d;
  $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
  syncEyeToggle();
  renderLegend();
  renderPanel();
  updateSpatialLayers();
  if (state.map) { applyPreset(state.map, cameraPreset(), {animate: animate()}); state.lastPreset = cameraPreset(); }
  saveURL();
}

function toggleTwoPoint() {
  state.twoPoint = !state.twoPoint;
  syncEyeToggle();
  if (state.map && state.view3d) {
    const v = currentVenue();
    if (v) frameVenue(v); else applyPreset(state.map, cameraPreset(), {animate: animate()});
    state.lastPreset = cameraPreset();
  }
  updateSpatialLayers();
  saveURL();
}
function syncEyeToggle() {
  const b = $('toggle-eye');
  b.setAttribute('aria-pressed', String(state.twoPoint));
  b.disabled = !state.view3d || !venueLevel();
}

/* ---------- mobile sheet ---------- */
function openMobilePanel() {
  if (!mobilePortrait()) return;
  $('panel').classList.add('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'true');
  $('map-aha').hidden = true;
}
function closeMobilePanel() {
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.remove('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'false');
  if (mobilePortrait()) {
    $('mobile-panel').focus({preventScroll: true});
    if (state.panel.mode === 'overview') renderPanel();
    else if (wasOpen && state.loaded) fitMap();
    updateSpatialLayers();
  }
}

/* ---------- data loading ---------- */
function validFeatureCollection(value, kind) {
  if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features)) return false;
  const position = p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const ring = r => Array.isArray(r) && r.length >= 4 && r.every(position);
  const polygon = p => Array.isArray(p) && p.length > 0 && p.every(ring);
  return value.features.every(f => {
    const p = f?.properties, g = f?.geometry;
    if (f?.type !== 'Feature' || !p || typeof p !== 'object') return false;
    if (!(g?.type === 'Polygon' ? polygon(g.coordinates) : g?.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates.every(polygon))) return false;
    if (kind === 'district') return typeof p.code === 'string' && /^\d{4}$/.test(p.code) && p.areaKm2 > 0 && !!provinceByCode(p.province);
    if (kind === 'province') return !!provinceByCode(p.code);
    return p.venue_ids == null || (Array.isArray(p.venue_ids) && p.venue_ids.every(id => typeof id === 'string'));
  });
}

async function fetchJSON(resource, {timeout = 15000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(resource, {signal: controller.signal, cache: 'no-cache'});
    if (!r.ok) { const e = new Error('โหลดข้อมูลไม่สำเร็จ'); e.status = r.status; throw e; }
    return await r.json();
  } catch (e) { e.resource = resource; e.phase = 'data'; throw e; }
  finally { clearTimeout(timer); }
}

function fillOptions() {
  const counts = new Map();
  for (const r of state.all) if (r.countable) counts.set(rowProvince(r), (counts.get(rowProvince(r)) || 0) + 1);
  for (const p of PROVINCES.filter(p => counts.has(p.code)).sort((a, b) => a.th.localeCompare(b.th, 'th'))) {
    const o = document.createElement('option'); o.value = p.code; o.textContent = p.th; $('province').append(o);
  }
  for (const g of GROUPS) { const o = document.createElement('option'); o.value = g.id; o.textContent = g.th; $('group').append(o); }
  for (const [value, label] of Object.entries(STATUS_FILTERS)) { if (!value) continue; const o = document.createElement('option'); o.value = value; o.textContent = label; $('status').append(o); }
  const opCounts = new Map();
  for (const r of state.all) if (r.countable && r.operatorGroup && r.operatorGroup !== 'other') opCounts.set(r.operatorGroup, (opCounts.get(r.operatorGroup) || 0) + 1);
  for (const g of (state.data.meta?.operatorGroups || []).filter(g => opCounts.has(g.id)).sort((a, b) => opCounts.get(b.id) - opCounts.get(a.id))) {
    const o = document.createElement('option'); o.value = g.id; o.textContent = g.label; $('operator').append(o);
  }
  for (const [value, label] of [['__other__', 'ผู้บริหารรายอื่น'], ['__none__', 'ยังไม่ระบุผู้บริหาร']]) { const o = document.createElement('option'); o.value = value; o.textContent = label; $('operator').append(o); }
  $('category-items').innerHTML = GROUPS.map(g => `<span>${groupSwatch(g)}${esc(g.th)}</span>`).join('');
}

function restoreFromURL() {
  const p = new URLSearchParams(location.search);
  for (const k of FIELDS) {
    const v = p.get(URL_KEYS[k]);
    if (v == null) continue;
    if (k === 'search') { $(k).value = v; continue; }
    if ([...$(k).options].some(o => o.value === v)) $(k).value = v;
  }
  if (['rank', 'mix', 'operators'].includes(p.get('view'))) state.view = p.get('view');
  const areas = p.get('areas') || '';
  if (areas === 'all') { state.autoFocus = false; state.focusAreaIds = []; }
  else state.focusAreaIds = [...new Set(areas.split(','))].filter(id => state.districts.has(id)).slice(0, 6);
  state.view3d = p.get('view3d') !== '0';
  state.twoPoint = p.get('cam') !== 'model';
  state.showPending = p.get('pending') !== '0';
  if (p.get('venue') && state.byId.has(p.get('venue'))) { state.panel = {mode: 'venue', id: p.get('venue')}; openVenueDetail(state.panel.id); }
  else if (p.get('district') && state.districts.has(p.get('district'))) state.panel = {mode: 'district', id: p.get('district')};
  state.pendingRecord = p.get('record') || '';
}

function wireEvents() {
  let timer;
  for (const f of FIELDS) $(f).addEventListener(f === 'search' ? 'input' : 'change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.focusAreaIds = [];
      state.history = [];
      if (f !== 'search' || state.panel.mode !== 'district') state.panel = overviewPanel();
      if (f === 'province') state.autoFocus = true;
      update({fit: f !== 'search' || Boolean($('search').value)});
    }, f === 'search' ? 220 : 0);
  });
  $('filters').addEventListener('submit', e => e.preventDefault());
  $('filters').addEventListener('reset', () => setTimeout(() => resetToOverview(), 0));
  for (const id of ['panel-view', 'filter-chips', 'map-aha', 'crumbs', 'map-legend']) $(id).addEventListener('click', onPanelAction);

  const tabs = [...document.querySelectorAll('[data-view]')];
  tabs.forEach((b, i) => {
    b.onclick = () => { state.view = b.dataset.view; drawChart(); saveURL(); };
    b.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[j].focus(); tabs[j].click();
    });
  });

  $('fit-map').onclick = () => showCountry();
  $('bangkok-map').onclick = () => selectProvince(BANGKOK);
  $('toggle-3d').onclick = toggle3d;
  $('toggle-eye').onclick = toggleTwoPoint;
  $('mobile-panel').onclick = () => { $('panel').classList.contains('is-open') ? closeMobilePanel() : openMobilePanel(); };
  $('close-mobile-panel').onclick = closeMobilePanel;
  document.querySelector('.skip').onclick = () => { openMobilePanel(); $('dataset-title').focus(); };
  $('toggle-insights').onclick = () => openInsights($('insight-content').hidden);
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncBottomPanel).observe($('insights')); else window.addEventListener('resize', syncBottomPanel);
  $('open-table').onclick = () => { $('results').hidden = false; closeMobilePanel(); $('toggle-table').focus(); };
  $('toggle-table').onclick = () => { $('results').hidden = true; $('open-table').focus(); };
  $('prev-page').onclick = () => { state.page--; renderTable(); };
  $('next-page').onclick = () => { state.page++; renderTable(); };
  $('theme').onchange = applyTheme;
  const colorMedia = matchMedia('(prefers-color-scheme: dark)');
  const onColorChange = () => { if ($('theme').value === 'auto') applyTheme(); };
  if (colorMedia.addEventListener) colorMedia.addEventListener('change', onColorChange); else colorMedia.addListener(onColorChange);
  matchMedia('(max-width: 760px) and (orientation: portrait)').addEventListener?.('change', () => { if (!mobilePortrait()) $('panel').classList.remove('is-open'); renderPanel(); });
}

/** Pending records (D4) load after the first paint: context dots and search, never counts. */
async function loadPending() {
  try {
    state.pending = indexPending(await fetchJSON('data/pending.json', {timeout: 30000}));
    const record = state.pendingRecord;
    if (record) {
      const i = state.pending.rows.findIndex(r => r[0] === record);
      if (i >= 0 && state.panel.mode === 'overview') { state.panel = {mode: 'pending', id: String(i)}; update({fit: true}); }
    }
    updatePins();
    renderLegend();
    if (values().search) renderPanel();
  } catch (e) { console.warn('Pending records unavailable', e); $('pending-count').textContent = ''; }
}

async function init() {
  try {
    const resources = ['data/venues.json', 'data/districts.geojson', 'data/provinces.geojson', 'data/venue-buildings.geojson', 'data/venue-logos.json'];
    const results = await Promise.allSettled(resources.map(r => fetchJSON(r)));
    if (results[0].status === 'rejected') throw results[0].reason;
    state.data = results[0].value;
    state.all = prepareRows(state.data.rows || []);
    state.byId = new Map(state.all.map(r => [r.id, r]));
    for (const [index, kind] of [[1, 'district'], [2, 'province'], [3, 'building']]) {
      if (results[index].status === 'fulfilled' && !validFeatureCollection(results[index].value, kind)) {
        const error = new Error('Invalid optional polygon FeatureCollection');
        error.resource = resources[index]; error.phase = 'data-schema';
        results[index] = {status: 'rejected', reason: error};
        console.warn('Optional dataset unavailable', error);
      }
    }
    state.districtGeo = results[1].status === 'fulfilled' ? results[1].value : {type: 'FeatureCollection', features: []};
    state.districts = indexDistricts(state.districtGeo);
    state.provinceGeo = results[2].status === 'fulfilled' ? results[2].value : {type: 'FeatureCollection', features: []};
    state.buildingData = results[3].status === 'fulfilled' ? results[3].value : {type: 'FeatureCollection', features: []};
    const logos = configureVenueLogos(results[4].status === 'fulfilled' ? results[4].value : {assets: []});
    if (!logos.complete) console.info('Venue logo registry', logos);

    fillOptions();
    restoreFromURL();
    $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
    syncEyeToggle();
    try { $('theme').value = localStorage.getItem(THEME_KEY) || 'auto'; } catch {}
    applyTheme();
    wireEvents();
    update();
    if (state.panel.mode !== 'overview') openMobilePanel();
    window.dispatchEvent(new CustomEvent('citymeter:ready'));
    startMap();
    loadPending();
  } catch (e) {
    window.dispatchEvent(new CustomEvent('citymeter:load-error', {detail: {message: 'โหลดข้อมูลสถานที่ไม่สำเร็จ กรุณาลองอีกครั้ง', resource: e.resource, status: e.status, phase: e.phase || 'startup', diagnostic: e.message}}));
    console.error(e);
  }
}

// Developer hook for live tuning in a browser console (not an API; may change without notice).
window.__citymeter = {state, get map() { return state.map; }, update, fitMap, updateSpatialLayers, applyPreset: (name, opts) => state.map && applyPreset(state.map, name, opts), fitPitched: (b, opts) => state.map && fitPitched(state.map, b, opts), cameraPadding, buildMapStyle, formatDensity, cueSVG};

init();

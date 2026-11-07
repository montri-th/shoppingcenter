/**
 * CityMETER · ศูนย์การค้า (Shopping centers) — application orchestration.
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
 * Panel modes: overview | district | venue | pending | brand | station (with a back stack); search results
 * replace the overview while a query is typed. Brand view (?brand=<key>): the venues whose shop
 * list has the brand (data/tenant-index.json, loaded on demand, like the nearby-centre comparison
 * of the venue panel); its pins are those venues and no district is focused. Station view (?station=<id>, as
 * CityMETER · Hotel): the venues of the filters within 500 m of an operating rail station of CityMETER · Transit
 * (data/stations.json, js/stations.js), framed with the radius drawn on the map.
 * First view (D33, owner 2026-11-07): the filter “ประเภท” starts on shopping centres, community malls and outlets
 * (model.js DEFAULT_GROUP; a link without `group` reads it, `?group=all` keeps every type) and the first finding ranks
 * districts by count, with the share within 500 m of a station against the rest of the province.
 * URL: q, status, group, operator, province, role, district, venue, brand, station, record, pending, areas, view,
 * view3d — restored on load. Shop counts (“ร้านข้างใน”) and the filter “ข้างในมี” (role) come from the shop-list index
 * and the centre facilities, loaded right after the core data (D22): until they arrive a shop figure reads “—”. Resilience: core data first; map, details, pending and
 * logos are independent and retryable.
 */
import {GROUPS, GROUP_SETS, DEFAULT_GROUP, STATUS_FILTERS, PROVINCES, provinceByCode, filterVenues, summarize, hasPoint, rowProvince, prepareRows, applyShopLists, operatorRanking, districtWord, groupById, groupLabel, contextState, BANGKOK} from './model.js';
import {parseStations, attachNearestStations, nearRail, rowsNearStation, installStationLayer, STATION_RADIUS_M, STATION_LAYERS} from './stations.js';
import {indexDistricts, summarizeDistricts, districtsInScope, districtLabel} from './areas.js';
import {summarizeAreaInsight, filterDistrictRows} from './area-insight.js';
import {renderInsightChart} from './charts.js';
import {provinceAreas} from './chart-model.js';
import {loadMapLibrary} from './vendors.js';
import {installVenuePins, MAX_DOM_PINS} from './pins.js';
import {installVenuePoints, POINT_LAYERS, pendingCount} from './venue-points.js';
import {installVenueBuildings, HOST_LAYERS} from './buildings.js';
import {installPinBuildings} from './pin-buildings.js';
import {createVenueModels} from './venue-models.js';
import {installVenueXray} from './venue-xray.js';
import {configureVenueLogos, venueLogoMarkup} from './venue-logos.js';
import {installDistrictLayers, installAreaLabels, buildDistrictModel, featureBounds, FILL_MAX_ZOOM} from './map-layers.js';
import {installProvinceLayers, buildProvinceModel, provinceBounds, PROVINCE_FILL_MAX_ZOOM, PROVINCE_LABEL_MAX_ZOOM} from './provinces.js';
import {createDistrictDetail, provincesAtPoints, DETAIL_MIN_ZOOM} from './district-detail.js';
import {buildOverviewModel, buildDistrictProfile, buildVenueProfile, buildPendingCard, searchAll, indexPending} from './profile-model.js';
import {renderOverview, renderDistrict, renderVenue, renderPending, renderSearch, renderBrand, renderStation, renderFilterChips, statusPill, esc, num, provinceShort, groupSwatch, icon, meters, PRODUCT_TITLE, SUBJECT, mapCardAha, mapCardVenue, mapCardDistrict, mapCardPending, mapCardSearch, mapCardBrand, mapCardStation} from './panel.js';
import {buildMapStyle, basemapPalette, TILEJSON_URL, MASSING_BEFORE, VENUE_XRAY_BEFORE} from './map-style.js';
import {installMassing, outerRings} from './massing.js';
import {presetFor, applyPreset, fitPitched, framePoint, fitBuilding, twoPointBearing, groundAt} from './camera.js';
import {createBuildingUnitStore, createCmTileLoader, CM_ATTRIBUTION} from './building-units.js';
import {installTerrain, TERRAIN} from './terrain.js';
import {guardRetainedTiles, guardElevationFreeze} from './maplibre-guard.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText} from './breadcrumb.js';
import {loadDetail, cachedDetail} from './details.js';
import {createTenantSelection, loadTenantIndex, comparePeers, brandPresence, searchBrands, roleVenueCounts, buildAmenities, AMENITY_LABELS, TENANT_ROLE_LABELS} from './tenants.js';
import {formatDensity, rampLegendHTML} from './scales.js';
import {cueSVG} from './cues.js';
import {mirrorMapCredits} from './map-credits.js';
import {lookLinks, lookTarget, lookBBox, streetViewView, createLookReader} from './look-around.js';

const $ = id => document.getElementById(id);
const FIELDS = ['search', 'status', 'group', 'operator', 'province', 'role'];
const URL_KEYS = Object.freeze({search: 'q', status: 'status', group: 'group', operator: 'operator', province: 'province', role: 'role'});
const INSIDE_LABELS = Object.freeze({...TENANT_ROLE_LABELS, ...AMENITY_LABELS});
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
  districtDetail: null, districtArgs: null,
  detail: null, detailError: false,
  showPending: true,
  map: null, loaded: false, mapTheme: '', initialCameraDone: false, tileTemplate: '', lastPreset: '',
  view3d: true,
  // Venue camera (two-point fit): what was framed, how often it was re-framed as buildings arrived, and
  // whether the user has moved the camera since (then a late building never moves it again).
  framed: null, userCamera: false,
  // Shop-list index (brand search, brand view, nearby centres): loaded on demand; brand from the URL waits for it.
  tenantIndex: null, tenantIndexState: 'idle', pendingBrand: '', brandLimit: 30,
  // D22: centre facilities (data/venue-amenities.json) and a ?role= that waits for the options it names.
  amenities: new Map(), pendingRole: '',
  // D37: the Street View view of the open venue (js/look-around.js), keyed by its drawn buildings; one tile reader.
  look: {id: '', key: '', view: null}, lookReader: null,
  pins: null, points: null, buildings: null, pinBuildings: null, massing: null, xray: null, districtLayers: null, districtLabels: null, provinceLayers: null, provinceLabels: null, marker: null,
  // Buildings per area (js/building-units.js, the CityMETER · Hotel rule): which อปท./เขต draw CityMETER Building V4;
  // one shared reader of its tiles; terrain mode (js/terrain.js) at hilly sites; research sites (data/venue-sites.json).
  buildingUnits: null, cmLoad: null, terrain: null, terrainActive: false, buildingSources: {osm: 0, cm: 0}, cmPins: 0,
  sites: new Map(), siteMeta: null,
  // Building masses from a venue's own design file (js/venue-models.js): an index at start, a venue's file when needed.
  models: null,
  // Operating rail stations of CityMETER · Transit (data/stations.json): list, index, meta, and the map layer.
  stationList: [], stationById: new Map(), stationMeta: null, stations: null,
};
const tenantSelection = createTenantSelection({changed: selection => {
  if (state.panel.mode === 'venue' && state.panel.id === selection.id) renderPanel();
}});

/* ---------- helpers ---------- */
const values = () => Object.fromEntries(FIELDS.map(k => [k, $(k).value]));
const bottomSpace = () => $('insights').getBoundingClientRect().height + 12;
const activeFilterCount = f => FIELDS.filter(k => f[k]).length;
const overviewPanel = () => ({mode: 'overview', id: ''});
const announce = text => { $('announcement').textContent = text; };
const theme = () => document.documentElement.dataset.theme;
const focusMode = () => (state.focusAreaIds.length ? 'explicit' : state.focusIds.length ? 'auto' : 'none');
const sheetOpen = () => mobilePortrait() && $('panel').classList.contains('is-open');
const venueLevel = () => state.panel.mode === 'venue';
// Venue level always uses the two-point eye camera when 3D is on (owner instruction 2026-10-25 18:49).
const cameraPreset = () => presetFor({view3d: state.view3d, mode: state.panel.mode === 'overview' ? 'overview' : 'detail', twoPoint: venueLevel(), portrait: mobilePortrait()});
const animate = () => !reduced();
const currentVenue = () => (state.panel.mode === 'venue' ? state.byId.get(state.panel.id) || null : null);
const selectedDistrict = () => (state.panel.mode === 'district' ? state.districts.get(state.panel.id) || null : null);
const pendingCard = () => (state.panel.mode === 'pending' ? buildPendingCard(state.pending, Number(state.panel.id), state.districts) : null);
let brandMemo = {key: '', index: null, value: null};
/** Brand view: where the brand of the shop lists is (null until the index is loaded). */
function currentBrand() {
  if (state.panel.mode !== 'brand' || !state.tenantIndex) return null;
  if (brandMemo.key !== state.panel.id || brandMemo.index !== state.tenantIndex) brandMemo = {key: state.panel.id, index: state.tenantIndex, value: brandPresence(state.tenantIndex, state.panel.id, state.byId)};
  return brandMemo.value;
}
const asList = value => Array.isArray(value) ? value : (typeof value === 'string' ? (() => { try { const x = JSON.parse(value); return Array.isArray(x) ? x : []; } catch { return []; } })() : []);
const subjectWord = () => {
  const f = values(), base = f.group ? groupLabel(f.group) : SUBJECT;
  return f.role ? `${f.group ? base : 'สถานที่'}ที่มี${INSIDE_LABELS[f.role] || f.role}` : base;
};
const currentStation = () => (state.panel.mode === 'station' ? state.stationById.get(state.panel.id) || null : null);
let stationMemo = {key: '', rows: null, value: null};
/** Station view: the venues of the filters within STATION_RADIUS_M of the open station, nearest first. */
function stationProfile() {
  const s = currentStation();
  if (!s) return null;
  if (stationMemo.key !== s.id || stationMemo.rows !== state.scopeRows) {
    const near = rowsNearStation(state.scopeRows, s, STATION_RADIUS_M);
    const rows = near.map(x => x.row);
    stationMemo = {key: s.id, rows: state.scopeRows, value: {station: s, radius: STATION_RADIUS_M, rows, distance: new Map(near.map(x => [x.row.id, x.m])), summary: summarize(rows)}};
  }
  return stationMemo.value;
}
/** The first finding counts venues within 500 m of a station only when the stations loaded (else no rail line). */
const railTest = () => (state.stationList.length ? r => nearRail(r, STATION_RADIUS_M) : null);

/** The province whose districts are drawn and ranked ('' = the whole country). */
function readingProvince() {
  const f = values();
  if (f.province) return f.province;
  if (state.panel.mode === 'district') return selectedDistrict()?.province || '';
  if (state.panel.mode === 'venue') { const r = currentVenue(); return r ? rowProvince(r) : ''; }
  if (state.panel.mode === 'pending') return pendingCard()?.province?.code || '';
  if (state.panel.mode === 'brand') { const b = currentBrand(); return b?.provinces.length === 1 ? b.provinces[0].code : ''; }
  // A station is read in the province of the nearest venue within its radius (stations carry no province code).
  if (state.panel.mode === 'station') { const first = stationProfile()?.rows.find(r => r.provinceCode); return first ? first.provinceCode : ''; }
  if (state.focusAreaIds.length) return state.districts.get(state.focusAreaIds[0])?.province || '';
  if (state.autoFocus && !f.search) return state.insight?.province || '';
  return '';
}

function saveURL() {
  const f = values(), p = new URLSearchParams();
  for (const k of FIELDS) {
    // D33: the first view's type set is the default and stays out of the link; every type is written as `all`.
    if (k === 'group') { if (f.group !== DEFAULT_GROUP) p.set(URL_KEYS.group, f.group || 'all'); continue; }
    if (f[k]) p.set(URL_KEYS[k], f[k]);
  }
  if (state.panel.mode === 'district') p.set('district', state.panel.id);
  if (state.panel.mode === 'venue') p.set('venue', state.panel.id);
  if (state.panel.mode === 'pending') { const c = pendingCard(); if (c) p.set('record', c.id); }
  if (state.panel.mode === 'brand') p.set('brand', state.panel.id);
  if (state.panel.mode === 'station') p.set('station', state.panel.id);
  if (state.focusAreaIds.length) p.set('areas', state.focusAreaIds.join(','));
  else if (!state.autoFocus) p.set('areas', 'all');
  if (!state.showPending) p.set('pending', '0');
  if (state.view !== 'rank') p.set('view', state.view);
  if (!state.view3d) p.set('view3d', '0');
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
    state.terrain?.dispose(); state.terrain = null; state.terrainActive = false;
    state.pinBuildings?.dispose(); state.pinBuildings = null;
    state.buildings?.dispose(); state.buildings = null;
    state.massing?.dispose(); state.massing = null;
    state.points = null; state.districtLayers = null; state.provinceLayers = null; state.stations = null;
    state.mapTheme = next;
    state.map.setStyle(buildMapStyle(next), {diff: false});
  }
  if (state.data) { drawChart(); renderLegend(); }
}

/* ---------- selection ---------- */
// Province fills and labels: the filtered venues; in brand view the places whose shop list has the brand (one per complex).
const provinceScopeRows = () => (state.panel.mode === 'brand' && currentBrand() ? currentBrand().placeRows : filterVenues(state.all, {...values(), province: ''}));

function update({fit = false, camera = true} = {}) {
  const f = values();
  if (state.panel.mode === 'station' && !currentStation()) state.panel = overviewPanel();
  const district = selectedDistrict();
  state.scopeRows = filterVenues(state.all, f);
  state.baseRows = district ? state.scopeRows.filter(r => r.districtCode === district.code) : state.scopeRows;
  // D33: districts ranked by count; the rail line counts venues within 500 m of an operating station.
  state.insight = summarizeAreaInsight(state.scopeRows, state.districts, {province: f.province, rank: 'count', near: railTest()});
  state.focusIds = district || ['brand', 'station'].includes(state.panel.mode) ? [] : state.focusAreaIds.length ? state.focusAreaIds : (state.autoFocus && !f.search ? state.insight.districtIds : []);
  state.rows = currentStation() ? stationProfile()?.rows || [] : state.focusIds.length ? filterDistrictRows(state.baseRows, new Set(state.focusIds)) : state.baseRows;
  state.page = 0;
  const readCode = readingProvince();
  state.districtModel = buildDistrictModel(summarizeDistricts(state.scopeRows, districtsInScope(state.districts, readCode)));
  state.provinceModel = state.provinceGeo?.features?.length ? buildProvinceModel(provinceScopeRows(), state.provinceGeo) : null;
  if (state.panel.mode === 'district' && !district) state.panel = overviewPanel();

  const s = summarize(state.rows);
  $('result-count').textContent = num(s.venues);
  $('filter-count').textContent = activeFilterCount(f) ? String(activeFilterCount(f)) : '';
  $('filter-chips').innerHTML = renderFilterChips(f, {status: STATUS_FILTERS, operator: operatorLabels(), role: INSIDE_LABELS});
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
  if (state.panel.mode === 'brand') return currentBrand()?.rows || [];
  if (state.panel.mode === 'station') return stationProfile()?.rows || [];
  return state.rows;
}

function updatePins() {
  const focus = detailRows().filter(hasPoint);
  const ids = new Set(focus.map(r => r.id));
  const gpuFocus = focus.length > MAX_DOM_PINS;
  const pointRows = state.scopeRows.filter(hasPoint);
  const inScope = new Set(state.scopeRows);
  for (const r of focus) if (!inScope.has(r)) pointRows.push(r);
  state.points?.update({rows: pointRows, focusIds: ids, gpuFocus, pending: state.pending, showPending: state.showPending, group: values().group});
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
  const st = currentStation();
  const province = values().province || (v ? rowProvince(v) : '') || c?.province?.code || (st ? readingProvince() : '') || (focusMode() !== 'none' && !values().search ? state.insight?.province : '') || '';
  const b = currentBrand();
  const crumbs = buildBreadcrumb({province: b ? '' : province, district: b ? null : district, venue: v ? {id: v.id, label: v.name} : c ? {id: '', label: c.name} : b ? {id: '', label: b.brand.name} : st ? {id: '', label: `สถานี${st.name}`} : null});
  $('crumbs').innerHTML = renderBreadcrumb(crumbs);
  document.title = `${breadcrumbText(crumbs)} · ${PRODUCT_TITLE} · CityMETER`;
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

/** The shop-list index meta once loaded (dataset count, check dates): the source of every “ร้านข้างใน” figure. */
const shopMeta = () => state.tenantIndex?.meta || null;

function renderPanel() {
  const view = $('panel-view');
  const mode = state.panel.mode;
  const asOf = state.data.meta?.asOf || '';
  renderCrumbs();
  syncEyeToggle();
  let html = '', cardHtml = '', cardLabel = 'ข้อค้นพบแรก';
  const f = values();
  if (mode === 'district') {
    const d = selectedDistrict();
    const ranked = [...state.districtModel.areas].filter(a => a.count > 0).sort((a, b) => b.density - a.density || b.count - a.count);
    const area = state.districtModel.areas.find(a => a.id === d.code) || {...d, count: 0, density: 0};
    const rank = ranked.findIndex(a => a.id === d.code) + 1;
    const profile = buildDistrictProfile({area, rows: state.baseRows, rank, of: ranked.length, ...statusRows({district: d.code, province: ''})});
    html = renderDistrict(profile, {asOf, shops: shopMeta()});
    cardHtml = mapCardDistrict(profile); cardLabel = 'เขตที่เลือก';
  } else if (mode === 'venue') {
    const v = currentVenue();
    const detail = state.detail?.id === v?.id ? state.detail : cachedDetail(v?.id, state.data.meta?.detail?.shards);
    const profile = buildVenueProfile({row: v, detail, byId: state.byId, districts: state.districts});
    const tenants = tenantSelection.state.id === v?.id ? tenantSelection.state : null;
    const peers = state.tenantIndex ? comparePeers(state.tenantIndex, v, state.byId) : null;
    html = renderVenue(profile, {asOf, shops: shopMeta(), buildings: venueHostFeatures(), pinState: state.pinBuildings?.stateOf(v?.id), detailError: state.detailError, tenants, peers, site: state.sites.get(v?.id) || null, model: state.models?.entry(v?.id) || null, transit: state.stationMeta,
      look: lookLinks(profile, state.look.id === v?.id ? state.look.view : null)});
    cardHtml = mapCardVenue(profile, {tenants}); cardLabel = 'สถานที่ที่เลือก';
  } else if (mode === 'pending') {
    const c = pendingCard();
    html = renderPending(c, {asOf});
    cardHtml = mapCardPending(c); cardLabel = 'รายการที่เลือก';
  } else if (mode === 'brand') {
    const b = currentBrand();
    html = b ? renderBrand(b, {meta: state.tenantIndex.meta, limit: state.brandLimit})
      : state.tenantIndexState === 'error' ? '<p class="hint">โหลดรายชื่อร้านไม่สำเร็จ <button type="button" class="link-button" data-action="retry-index">ลองอีกครั้ง</button></p>'
      : '<p class="hint" role="status">กำลังโหลดรายชื่อร้าน…</p>';
    cardHtml = mapCardBrand(b); cardLabel = 'แบรนด์ที่เลือก';
  } else if (mode === 'station') {
    const sp = stationProfile();
    html = renderStation(sp, {asOf, shops: shopMeta(), transit: state.stationMeta, subject: subjectWord()});
    cardHtml = mapCardStation(sp, {subject: subjectWord()}); cardLabel = 'สถานีที่เลือก';
  }
  if (!html && f.search) {
    const results = searchAll(f.search, {rows: state.all, pending: state.pending});
    ensureTenantIndex();
    const brands = state.tenantIndex ? searchBrands(state.tenantIndex, f.search) : null;
    html = renderSearch(results, {pending: state.pending, districts: state.districts, asOf, brands, shops: shopMeta()});
    cardHtml = mapCardSearch(results, {brands}); cardLabel = 'ผลค้นหา';
  } else if (!html) {
    const readCode = readingProvince();
    const insight = state.insight;
    const areas = state.districtModel.areas;
    const model = buildOverviewModel({rows: state.rows, scopeRows: state.scopeRows, areas, kind: 'district', readCode, ...statusRows({province: readCode || f.province})});
    const provinces = (state.provinceModel?.provinces || []).filter(p => p.count > 0).sort((a, b) => b.count - a.count);
    html = renderOverview({insight, model, focusMode: focusMode(), readCode: f.province || (focusMode() === 'none' ? '' : readCode), national: !f.province, subject: subjectWord(), asOf, provinces, shops: shopMeta(), transit: state.stationMeta});
    cardHtml = mapCardAha(insight, {mode: focusMode(), subject: subjectWord()});
  }
  view.innerHTML = html;
  view.dataset.mode = mode;
  if (mode === 'venue') refineLook(currentVenue());
  // Detail views (district, venue, record) put their heading first: the dataset title, search and
  // filters step aside, and the back button joins the breadcrumb row.
  const detail = mode !== 'overview';
  $('panel').classList.toggle('is-detail', detail);
  $('panel-back').hidden = !detail;
  renderMapCard(cardHtml, cardLabel, mode === 'overview' ? (f.search ? 'search' : 'aha') : mode);
  const key = `${mode}:${state.panel.id}:${f.province}:${f.search}`;
  if (key !== renderPanel.lastKey) $('panel').scrollTop = 0;
  renderPanel.lastKey = key;
}

/**
 * Street View facing the venue's building (D37): once the venue's buildings are drawn, read the basemap roads round
 * its main building (js/look-around.js) and give the panel's Street View link a viewpoint on the road in front of it
 * with the angle at the building. Until then (or with no road within 250 m) the link opens Google's panorama nearest
 * the venue point at Google's own angle. Patches the link in place; the next panel render reads the same view.
 */
function refineLook(v) {
  if (!v || !hasPoint(v)) return;
  const features = venueHostFeatures();
  const key = `${v.id}|${features.map(f => f.properties?.host_id || f.id || '').join(',')}|${state.tileTemplate ? 1 : 0}`;
  if (state.look.key === key) return;
  state.look = {id: v.id, key, view: state.look.id === v.id ? state.look.view : null};
  if (!state.tileTemplate) return; // the TileJSON is still on its way; the next render tries again
  state.lookReader ||= createLookReader({tileUrl: t => (state.tileTemplate ? state.tileTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y) : '')});
  const target = lookTarget(v, features);
  state.lookReader.read(lookBBox(target)).then(({roads, overheads, buildings}) => {
    if (state.look.key !== key) return;
    const view = streetViewView({target, roads, overheads, occluders: buildings});
    state.look.view = view;
    const link = document.querySelector('#panel-view a[data-look="streetview"]');
    if (!link || currentVenue()?.id !== v.id) return;
    const next = lookLinks({row: v}, view).find(l => l.id === 'streetview');
    if (next) { link.href = next.href; link.title = next.title; }
  }).catch(e => console.warn('Street View viewpoint unavailable', e.message || e));
}

/**
 * Phones: the map comes first (owner instruction 2026-10-25 18:49). A compact card over the map
 * carries the reading of the current level — the Aha, the venue (logo, name, strongest figure),
 * the district or the record — with one emphasised button that opens the panel.
 * Desktop hides the card (the side panel is always there).
 */
function renderMapCard(html, label, kind) {
  const el = $('map-aha');
  el.innerHTML = html;
  el.setAttribute('aria-label', label);
  el.dataset.kind = kind;
  document.querySelector('.map-panel').dataset.card = html ? kind : '';
  el.hidden = !html || $('panel').classList.contains('is-open');
}

function pushHistory() { state.history.push({...state.panel}); if (state.history.length > 20) state.history.shift(); }

function goBack() {
  const previous = state.history.pop();
  const leaving = state.panel.mode;
  state.panel = previous && previous.mode !== 'overview' ? previous : overviewPanel();
  if (state.panel.mode === 'venue') openVenueDetail(state.panel.id);
  update({fit: ['district', 'station'].includes(leaving) || state.panel.mode !== 'overview'});
}

function selectDistrict(code, {fromMap = false} = {}) {
  const d = state.districts.get(code);
  if (!d) return;
  if (state.panel.mode !== 'district' || state.panel.id !== code) pushHistory();
  state.focusAreaIds = [];
  state.panel = {mode: 'district', id: code};
  closeMobilePanel({refit: false, focus: false}); // phones: the map first, the card opens the details
  update({camera: false});
  if (state.loaded) { fitArea(d.feature); state.lastPreset = cameraPreset(); }
  announce(`${districtLabel(d)} ${num(state.baseRows.length)} แห่ง`);
}

function openVenueDetail(id) {
  tenantSelection.select(id);
  ensureTenantIndex();
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

// Every way in (pin, building, dot, list, search, URL) takes the same path; fromMap is kept for callers.
function selectVenue(id, {fromMap = false} = {}) {
  const r = state.byId.get(id);
  if (!r) return;
  if (state.panel.mode !== 'venue' || state.panel.id !== id) pushHistory();
  state.panel = {mode: 'venue', id};
  state.models?.ensure(id);
  openVenueDetail(id);
  closeMobilePanel({refit: false, focus: false}); // phones: the map first, the card opens the details
  update({camera: false});
  state.framed = null;
  if (state.loaded) { frameVenue(r); state.lastPreset = cameraPreset(); }
  announce(`เลือก ${r.name}`);
}

function selectPending(index, {fromMap = false} = {}) {
  const c = buildPendingCard(state.pending, Number(index), state.districts);
  if (!c) return;
  pushHistory();
  state.panel = {mode: 'pending', id: String(index)};
  closeMobilePanel({refit: false, focus: false});
  update({camera: false});
  if (state.loaded) { framePoint(state.map, [c.lon, c.lat], {preset: cameraPreset(), zoom: 15.5, offset: boxOffset(), animate: animate()}); state.lastPreset = cameraPreset(); }
  announce(`${contextState(c.reviewed)} ${c.name}`);
}

/**
 * Open an operating rail station of CityMETER · Transit (as CityMETER · Hotel): the venues of the filters within
 * STATION_RADIUS_M (straight line) of its reference point, framed with the radius drawn on the map.
 */
function selectStation(id) {
  const s = state.stationById.get(id);
  if (!s) return;
  if (state.panel.mode !== 'station' || state.panel.id !== id) pushHistory();
  state.focusAreaIds = [];
  state.panel = {mode: 'station', id};
  closeMobilePanel({refit: false, focus: false});
  update({camera: false});
  if (state.loaded) { fitStation(s); state.lastPreset = cameraPreset(); }
  announce(`สถานี${s.name} ${num(stationProfile()?.rows.length || 0)} แห่งในระยะ ${meters(STATION_RADIUS_M)}`);
}
/** The station's radius (and a margin) in the free map box. */
function fitStation(s = currentStation(), {instant = false} = {}) {
  if (!s || !state.loaded) return;
  const r = STATION_RADIUS_M + 150, dLat = r / 110574, dLon = r / (111320 * Math.cos((s.lat * Math.PI) / 180));
  const LB = maplibregl.LngLatBounds;
  const bounds = new LB([s.lon - dLon, s.lat - dLat], [s.lon + dLon, s.lat + dLat]);
  fitBounds(bounds, {instant, maxZoom: 16.5, points: [[s.lon - dLon, s.lat - dLat], [s.lon + dLon, s.lat - dLat], [s.lon + dLon, s.lat + dLat], [s.lon - dLon, s.lat + dLat]]});
}

/** Load the shop-list index once (brand search, brand view, nearby centres); a brand from the URL opens when it arrives. */
function ensureTenantIndex() {
  if (state.tenantIndex || state.tenantIndexState === 'loading') return;
  state.tenantIndexState = 'loading';
  loadTenantIndex().then(index => {
    state.tenantIndex = index; state.tenantIndexState = 'ready';
    const role = shopListsChanged();
    const key = state.pendingBrand;
    state.pendingBrand = '';
    if (key && index.brands.has(key) && state.panel.mode === 'overview') { state.panel = {mode: 'brand', id: key}; update({fit: true}); return; }
    if (state.panel.mode === 'brand') { update({camera: false}); fitBrand(); return; }
    // Shop figures change everywhere at once (panel, lists, table); a ?role= from the URL now filters the map.
    update({fit: Boolean(role), camera: Boolean(role)});
  }).catch(e => { console.warn('Tenant index unavailable', e); state.tenantIndexState = 'error'; if (state.panel.mode === 'brand') renderPanel(); });
}

/** Centre facilities named by research datasets with an official source (D22 filter, venue panel); optional. */
async function loadAmenities() {
  try {
    state.amenities = buildAmenities(await fetchJSON('data/venue-amenities.json', {timeout: 20000}));
    if (state.tenantIndex) { const role = shopListsChanged(); update({fit: Boolean(role), camera: Boolean(role)}); }
  } catch (e) { console.warn('Venue amenities unavailable', e); }
}

/**
 * D22: shop counts and what each venue has inside (roles of its shop list, sourced facilities) on every row, and the
 * options of the filter “ข้างในมี” (roles by how many countable venues list them, then facilities). Returns the role a
 * URL asked for once its option exists.
 */
function shopListsChanged() {
  applyShopLists(state.all, state.tenantIndex, state.amenities);
  const select = $('role'), current = select.value || state.pendingRole;
  const roles = roleVenueCounts(state.tenantIndex, state.all);
  const facilities = Object.keys(AMENITY_LABELS).map(kind => ({kind, venues: state.all.filter(r => r.countable && r._inside?.has(kind)).length})).filter(x => x.venues);
  select.replaceChildren(new Option('ทุกหมวด', ''));
  const shops = document.createElement('optgroup'); shops.label = 'ร้านในรายชื่อ';
  for (const {role, venues} of roles) shops.append(new Option(`${TENANT_ROLE_LABELS[role] || role} · ${num(venues)} แห่ง`, role));
  if (roles.length) select.append(shops);
  if (facilities.length) {
    const group = document.createElement('optgroup'); group.label = 'สิ่งอำนวยความสะดวก';
    for (const {kind, venues} of facilities) group.append(new Option(`${AMENITY_LABELS[kind]} · ${num(venues)} แห่ง`, kind));
    select.append(group);
  }
  select.disabled = !roles.length && !facilities.length;
  const ok = [...select.options].some(o => o.value === current);
  select.value = ok ? current : '';
  const restored = ok && current === state.pendingRole ? current : '';
  if (ok && current === state.pendingRole) state.pendingRole = '';
  return restored;
}

/** Brand view: the venues whose shop list has the brand, framed together; no district focus. */
function selectBrand(key) {
  if (!key) return;
  if (state.panel.mode !== 'brand' || state.panel.id !== key) pushHistory();
  state.panel = {mode: 'brand', id: key};
  state.brandLimit = 30;
  ensureTenantIndex();
  closeMobilePanel({refit: false, focus: false});
  update({camera: false});
  fitBrand();
  const b = currentBrand();
  if (b) announce(`${b.brand.name} พบใน ${num(b.places)} สถานที่`);
}
function fitBrand({instant = false} = {}) {
  const b = currentBrand();
  if (!state.loaded || !b) return;
  const pts = b.rows.filter(hasPoint);
  if (!pts.length) return;
  const LB = maplibregl.LngLatBounds;
  const bounds = new LB();
  pts.forEach(r => bounds.extend([r.lon, r.lat]));
  fitBounds(bounds, {instant, maxZoom: 15.5, points: pts.map(r => [r.lon, r.lat])});
  state.lastPreset = cameraPreset();
}

/**
 * The free part of the map in container pixels: below the toolbar, above whatever covers the
 * bottom (map card, legend, charts bar, open table, open phone sheet), left of the zoom control.
 */
function visibleBox() {
  const el = $('map'), r = el.getBoundingClientRect();
  const W = el.clientWidth, H = el.clientHeight;
  const shown = x => x && !x.hidden && x.offsetHeight > 0 && getComputedStyle(x).display !== 'none';
  let top = document.querySelector('.map-toolbar').getBoundingClientRect().bottom - r.top + 10;
  let bottom = H - 10;
  for (const x of [$('insights'), $('results'), $('map-legend'), $('map-aha')]) if (shown(x)) bottom = Math.min(bottom, x.getBoundingClientRect().top - r.top - 10);
  if (sheetOpen()) bottom = Math.min(bottom, window.innerHeight - $('panel').offsetHeight - r.top - 10);
  let right = W - 12;
  const nav = el.querySelector('.maplibregl-ctrl-top-right');
  if (nav?.offsetWidth) right = Math.min(right, nav.getBoundingClientRect().left - r.left - 8);
  const left = 12;
  if (bottom - top < 140) top = Math.max(4, bottom - 140); // very short screens borrow the toolbar strip
  return {left, top, right: Math.max(left + 120, right), bottom: Math.max(top + 120, bottom)};
}
/** Offset that puts a framed point in the middle of the free box (MapLibre flyTo `offset`). */
function boxOffset() {
  const b = visibleBox(), el = $('map');
  return [Math.round((b.left + b.right - el.clientWidth) / 2), Math.round((b.top + b.bottom - el.clientHeight) / 2)];
}

/**
 * Footprint and roof vertices of the venue's buildings, or a 90 m box round the pin while no building is known. On
 * terrain each point carries the ground it stands on as drawn (4th value, js/camera.js#fitBuilding): the roof at the
 * ground under the piece's centroid — where MapLibre lifts a fill-extrusion — the base at the lowest ground under it.
 */
function venuePoints(row, targets) {
  const terrain = Boolean(state.map?.terrain) && state.view3d;
  if (targets.length) return targets.flatMap(t => {
    if (!terrain) return t.ring.flatMap(([lng, lat]) => [[lng, lat, 0], [lng, lat, t.height]]);
    const {g, low} = ringGrounds(t.ring);
    return t.ring.flatMap(([lng, lat]) => [[lng, lat, 0, low], [lng, lat, t.height, g]]);
  });
  if (!hasPoint(row)) return [];
  const dLat = 45 / 110574, dLng = 45 / (111320 * Math.cos((row.lat * Math.PI) / 180));
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) => [[row.lon + a * dLng, row.lat + b * dLat, 0], [row.lon + a * dLng, row.lat + b * dLat, 12]]);
}
const targetsKey = targets => targets.map(t => `${t.ring.length}:${t.ring[0][0].toFixed(6)},${t.ring[0][1].toFixed(6)}:${t.height}`).sort().join('|');

/** Vertex mean of a ring ([lon, lat]): where MapLibre samples the ground of a fill-extrusion. */
function ringCentroid(ring) {
  const n = Math.max(1, ring.length - 1);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += ring[i]?.[0] || 0; y += ring[i]?.[1] || 0; }
  return [x / n, y / n];
}
/**
 * Ground of a drawn piece on terrain (0 without): `g` at its centroid — its roof is at height + g — and `low`, the
 * lowest ground under its outline's vertices, where its walls meet the slope (CityMETER · Hotel 0.3.2). A sample whose
 * DEM tile has not arrived (0) is left out; `fallback` stands in for a missing centroid sample.
 */
function ringGrounds(ring, fallback = 0) {
  const map = state.map;
  if (!map?.terrain || !ring?.length) return {g: 0, low: 0};
  const g = groundAt(map, ringCentroid(ring)) || fallback;
  let low = g;
  for (let i = 0; i < ring.length - 1; i++) { const e = groundAt(map, ring[i]); if (e && e < low) low = e; }
  return {g, low};
}

/**
 * Venue camera (owner instruction 2026-10-25 18:49: “tap a pin or a building → the 3D building
 * in two-point perspective, zoom to fit the viewport, always”). The eye camera turns corner-on to
 * the building and fills the free part of the map with every footprint and roof vertex. Until the
 * pin's building is known the pin is framed the same way; the camera turns to the building when it
 * arrives (at most twice, never after the user has moved the map). 3D off: the same box, flat.
 */
function frameVenue(row, {instant = false} = {}) {
  const map = state.map;
  if (!map || !row) return;
  const targets = venueTargets();
  const points = venuePoints(row, targets);
  if (!points.length) return;
  const box = visibleBox();
  state.userCamera = false;
  // The ground the frame was computed on (0 off terrain or before its DEM tile arrives): onGroundChange refits when it moves.
  state.framed = {id: row.id, key: targetsKey(targets), refits: state.framed?.id === row.id ? state.framed.refits : 0,
    ground: hasPoint(row) ? groundAt(map, [row.lon, row.lat]) : 0};
  if (!state.view3d) {
    const b = points.reduce((acc, q) => acc.extend([q[0], q[1]]), new maplibregl.LngLatBounds([points[0][0], points[0][1]], [points[0][0], points[0][1]]));
    const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
    fitPitched(map, b, {preset: 'plan', padding: {top: box.top, left: box.left, right: W - box.right, bottom: H - box.bottom}, maxZoom: 18.5, minZoom: 14, animate: animate() && !instant});
    return;
  }
  // Other drawn buildings (the venue's parent or components) should not stand between the camera and the venue.
  const others = (state.buildings?.displayedFeatures() || []).filter(f => !asList(f.properties?.venue_ids).includes(row.id) && f.properties?.render_as === 'extrusion')
    .flatMap(f => outerRings(f).map(ring => ({ring, height: Number(f.properties?.display_height_m) || 3})));
  const bearing = targets.length ? twoPointBearing(targets.map(t => t.ring), map.getBearing(), others) : map.getBearing();
  // On terrain: the other corners, opposite first (downhill of a building on a slope), when MapLibre would lift the
  // camera out of the ground (js/camera.js#fitBuilding).
  const alternates = targets.length ? [180, 90, -90].map(d => bearing + d) : [];
  fitBuilding(map, points, {box, bearing, alternates, maxZoom: targets.length ? 19.5 : 18, animate: animate() && !instant});
}

/**
 * The ground changed under the venue being looked at (terrain on or off, its DEM tiles arrived): the x-ray moves with
 * it, and the venue camera frames it again on the ground as drawn — unless the user moved the map; the re-frames of
 * refitVenueOnNewBuilding count here too (≤ 2).
 */
function onGroundChange() {
  if (!state.loaded) return;
  refreshMassing();
  const v = currentVenue();
  if (!v || !hasPoint(v) || !state.framed || state.framed.id !== v.id || state.userCamera || state.framed.refits >= 2) return;
  if (Math.abs(groundAt(state.map, [v.lon, v.lat]) - (state.framed.ground || 0)) < 3) return; // the frame still holds
  state.framed.refits++;
  frameVenue(v);
}

/** The pin's building arrived (or changed) after the venue was framed: turn to it, unless the user moved the map. */
function refitVenueOnNewBuilding() {
  const v = currentVenue();
  if (!v || !state.framed || state.framed.id !== v.id || state.userCamera || state.framed.refits >= 2) return;
  if (targetsKey(venueTargets()) === state.framed.key) return;
  state.framed.refits++;
  frameVenue(v);
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
    case 'select-station': selectStation(id); break;
    case 'select-pending': selectPending(id); break;
    case 'select-province': selectProvince(id); break;
    case 'back': goBack(); break;
    case 'explore-top': exploreTop(); break;
    case 'all-districts': allDistricts(id); break;
    case 'country': showCountry(); break;
    case 'open-charts': openInsights(true); closeMobilePanel(); break;
    case 'open-table': $('results').hidden = false; closeMobilePanel(); $('toggle-table').focus({preventScroll: true}); break;
    case 'open-panel': openMobilePanel(); break;
    case 'more-tenants': {
      if (state.panel.mode !== 'venue' || state.panel.id !== id) break;
      const firstNew = tenantSelection.state.limit;
      if (tenantSelection.more(id)) {
        const row = $('panel-view').querySelector(`[data-tenant-index="${firstNew}"]`);
        row?.focus({preventScroll: true});
        row?.scrollIntoView({block: 'nearest'});
        const total = tenantSelection.state.roster.items.length;
        announce(`แสดงร้าน ${num(Math.min(total, tenantSelection.state.limit))} จาก ${num(total)} ร้าน`);
      }
      break;
    }
    case 'select-brand': selectBrand(id); break;
    case 'tenant-role':
      if (state.panel.mode === 'venue' && state.panel.id === id && tenantSelection.setRole(id, target.dataset.role || '')) {
        const role = tenantSelection.state.role;
        $('panel-view').querySelector(`.mix-chip[data-role="${CSS.escape(role)}"]`)?.focus({preventScroll: true});
      }
      break;
    case 'more-brand-venues': if (state.panel.mode === 'brand' && state.panel.id === id) { state.brandLimit += 30; renderPanel(); } break;
    case 'retry-index': state.tenantIndexState = 'idle'; ensureTenantIndex(); renderPanel(); break;
    case 'retry-tenants':
      if (state.panel.mode === 'venue' && state.panel.id === id) { tenantSelection.select(id, {retry: true}); renderPanel(); }
      break;
    case 'clear-filter': clearFilter(id); break;
    case 'set-group': $('group').value = id; state.panel = ['district', 'station'].includes(state.panel.mode) ? state.panel : overviewPanel(); update({fit: state.panel.mode === 'overview'}); break;
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
const cssVar = (name, fallback = '') => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);
/** Hillshade in the theme's basemap tones (foundation colours, never data colours), as CityMETER · Hotel. */
function terrainColors() {
  const dark = theme() === 'dark';
  return dark
    ? {shadow: cssVar('--basemap-sky', '#0D1418'), highlight: cssVar('--basemap-label-quiet', '#8D9D99'), accent: cssVar('--basemap-sky', '#0D1418'), dark}
    : {shadow: cssVar('--basemap-label', '#5F635A'), highlight: cssVar('--basemap-halo', '#F6F7F3'), accent: cssVar('--basemap-label-quiet', '#7B877D'), dark};
}
const provinceZoom = () => Boolean(state.provinceModel) && !readingProvince() && (state.map?.getZoom?.() ?? 6) < PROVINCE_FILL_MAX_ZOOM;
function renderLegend() {
  const atProvince = provinceZoom();
  const model = atProvince ? state.provinceModel : state.districtModel;
  const steps = $('legend-steps');
  const readCode = readingProvince();
  const word = readCode ? districtWord(readCode) : 'เขต/อำเภอ';
  const brand = state.panel.mode === 'brand' ? currentBrand() : null;
  $('legend-title').textContent = atProvince ? (brand ? `จังหวัด · สถานที่ที่มี ${brand.brand.name}` : 'จังหวัด · จำนวนสถานที่') : `${word} · แห่ง/ตร.กม.`;
  if (!model || !model.ramp.levels.length) steps.innerHTML = '<span class="hint">ไม่มีสถานที่ในตัวกรองนี้</span>';
  else {
    steps.innerHTML = rampLegendHTML(model.ramp, {zero: model.zeroCount > 0, unit: atProvince ? 'แห่ง' : 'แห่ง/ตร.กม.'});
    $('legend-areas').title = atProvince
      ? `${brand ? `จำนวนสถานที่ที่มี ${brand.brand.name} ในรายชื่อร้าน` : 'จำนวนสถานที่'}ต่อจังหวัด · สีไล่ 41 ระดับของ LDS ตามลำดับค่า (ค่าต่ำสุดอ่อนสุด ค่าสูงสุดเข้มสุด) · สีเดียวกันทั้งสองธีม`
      : `สถานที่ต่อตารางกิโลเมตรของ${word} (ตัวหาร = พื้นที่เขต/อำเภอของ CityMETER ตามขอบเขตกรมแผนที่ทหาร) · สีไล่ 41 ระดับของ LDS ตามลำดับค่า · สีเดียวกันทั้งสองธีม`;
  }
  $('toggle-pending').setAttribute('aria-pressed', String(state.showPending));
  $('pending-count').textContent = state.pending ? num(pendingCount(state.pending, values().group)) : '';
  const terrainItem = $('legend-terrain');
  if (terrainItem) terrainItem.hidden = !(state.terrainActive && state.view3d);
  // Which outlines the buildings come from: CityMETER Building V4 inside CityMETER units, OpenStreetMap elsewhere.
  const src = state.buildingSources || {}, cmNow = (src.cm || 0) > 0 || state.cmPins > 0, osmNow = (src.osm || 0) > 0 || !cmNow;
  const sources = cmNow && osmNow ? 'CityMETER Building V4 และ OpenStreetMap (OpenFreeMap)' : cmNow ? 'CityMETER Building V4' : 'OpenStreetMap ผ่าน OpenFreeMap';
  const massingItem = document.querySelector('.legend-massing-item');
  if (massingItem) massingItem.title = `รูปทรงอาคารจาก ${sources}${cmNow ? ' · ความสูงของ CityMETER เป็นค่าประมาณจากแบบจำลอง' : ''}`;
  document.querySelector('.map-panel').classList.toggle('is-3d', state.view3d);
  document.querySelector('.map-panel').classList.toggle('is-province-zoom', atProvince);
}

function togglePending() {
  state.showPending = !state.showPending;
  updatePins();
  renderLegend();
  saveURL();
  announce(state.showPending ? 'แสดงรายการที่ยังยืนยันไม่ได้' : 'ซ่อนรายการที่ยังยืนยันไม่ได้');
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
  // One scope for every view, and the caption counts exactly what the views draw: venues with a
  // point inside a district of the province being read (else of the country). Rows without a point
  // are not in any bar; the panel names them ("อีก N แห่งยังระบุเขตไม่ได้") and the table lists them.
  const scope = state.scopeRows.filter(r => hasPoint(r) && r.districtCode && (!readCode || state.districts.get(r.districtCode)?.province === readCode));
  $('chart-scope').textContent = `${num(scope.length)} แห่ง · ${readCode ? `ทุก${districtWord(readCode)}ใน${provinceShort(readCode)}` : 'ทุกจังหวัด'}`;
  $('tab-rank').querySelector('.tab-label').textContent = readCode ? `${districtWord(readCode)}ที่แน่นที่สุด` : 'จังหวัด';
  if ($('insight-content').hidden) return;
  const areas = kind === 'district' ? state.districtModel.areas : provinceAreas(state.scopeRows, state.provinceModel);
  chartDispose = renderInsightChart({
    elementId: 'chart', view: state.view, areas, kind, unitWord: districtWord(readCode),
    operatorRows: operatorRanking(scope), total: scope.length,
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
  $('toggle-insights').innerHTML = `${icon(open ? 'expand' : 'collapse')}<span>${open ? 'ย่อกราฟ' : 'เปิดกราฟ'}</span>`;
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
      <td>${d ? esc(districtLabel(d)) : `<span class="hint">${hasPoint(r) ? 'หมุดอยู่นอกเส้นเขต' : 'ยังไม่มีพิกัด'}</span>`}<small>${esc(provinceByCode(rowProvince(r))?.th || r.addrProvince || '')}</small></td>
      <td>${r.rail ? `${esc(r.rail.station.name)}<small class="data-number">${esc(meters(r.rail.m))}</small>` : `<span class="hint">${state.stationList.length && hasPoint(r) ? 'เกิน 2 กม.' : '—'}</span>`}</td>
      <td>${statusPill(r)}</td>
      <td class="data-number">${r.shopCount ? num(r.shopCount) : '<span class="hint">—</span>'}</td>
      <td><small class="data-number">${esc(r.id)}</small></td></tr>`;
  }).join('') || '<tr><td colspan="8">ไม่พบสถานที่ตามตัวกรอง</td></tr>';
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

/**
 * The legend's box on the map canvas on wider screens: a pitched fit keeps every framed vertex out from under it, so the
 * legend never covers what the camera frames (a 1280 × 680 laptop had it over Pathum Wan, 7 Nov 2026), at the least
 * zoom-out that clears it (js/camera.js#fitPitched `avoid`). Phones frame above their dock (cameraPadding).
 */
function legendAvoid() {
  const legend = $('map-legend');
  if (mobilePortrait() || !(legend.offsetHeight > 0) || getComputedStyle(legend).display === 'none') return [];
  const box = $('map').getBoundingClientRect(), r = legend.getBoundingClientRect();
  return [{left: r.left - box.left - 8, top: r.top - box.top - 8, right: r.right - box.left + 8, bottom: r.bottom - box.top + 8}];
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
  fitPitched(state.map, featureBounds(feature, maplibregl.LngLatBounds), {preset, padding: pitched ? pitchedPadding() : cameraPadding(), maxZoom: 16.5, minZoom: 7, animate: animate() && !instant, points: vertices([feature]), shift: mobilePortrait() ? -0.08 : null, avoid: pitched ? legendAvoid() : []});
}

function fitBounds(b, {instant = false, points = null, maxZoom = 15, apply = true} = {}) {
  const wide = b.getNorth() - b.getSouth() > 0.3 || b.getEast() - b.getWest() > 0.3;
  const preset = wide ? 'plan' : cameraPreset();
  const pitched = preset !== 'plan' && !mobilePortrait();
  return fitPitched(state.map, b, {preset, padding: pitched ? pitchedPadding() : cameraPadding(), maxZoom, minZoom: 4.5, animate: animate() && !instant, points: wide ? null : points, shift: mobilePortrait() && !wide ? -0.12 : null, apply, avoid: pitched ? legendAvoid() : []});
}

/** City massing (OpenMapTiles buildings) exists from zoom 13; the 3D focus view needs it to read as a city. */
const MASSING_VIEW_ZOOM = 13.1;   // below the quiet-label zoom (13.2) so the first view keeps only the focus labels
// How far below MASSING_VIEW_ZOOM the whole-district fit may be and still zoom in to it (×1.3 at most). A phone needs
// about a zoom less to hold the three districts; zooming in there pushed them under the card (owner 5 Nov 2026 08:34,
// “หน้าแรก เปิดมาเจอแบบนี้ ให้ดูอะไรเหรอ”), so the phone frames them whole instead.
const MASSING_ZOOM_REACH = 0.4;

/** `target` zoomed in to `zoom` around the middle of the free map box (between the toolbar and the card or legend). */
function zoomInFreeBox(target, zoom) {
  const map = state.map;
  const start = {center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding()};
  map.jumpTo(target);
  const box = visibleBox();
  const around = map.unproject([(box.left + box.right) / 2, (box.top + box.bottom) / 2]);
  map.zoomTo(zoom, {around, duration: 0, animate: false});
  const camera = {center: map.getCenter(), zoom, pitch: target.pitch, bearing: target.bearing, padding: target.padding};
  map.jumpTo(start);
  return camera;
}

function fitMap({instant = false} = {}) {
  if (!state.loaded) return;
  const d = selectedDistrict();
  if (d) { fitArea(d.feature, {instant}); return; }
  const v = currentVenue();
  if (v) { frameVenue(v, {instant}); return; }
  const c = pendingCard();
  if (c) { framePoint(state.map, [c.lon, c.lat], {preset: cameraPreset(), zoom: 15.5, offset: boxOffset(), animate: animate() && !instant}); return; }
  if (state.panel.mode === 'brand') { fitBrand({instant}); return; }
  if (state.panel.mode === 'station') { fitStation(currentStation(), {instant}); return; }
  const LB = maplibregl.LngLatBounds;
  const focus = state.focusIds.map(id => state.districts.get(id)).filter(Boolean);
  if (focus.length) {
    const b = new LB();
    for (const x of focus) featureBounds(x.feature, LB).toArray().forEach(p => b.extend(p));
    const options = {instant, points: vertices(focus.map(x => x.feature))};
    // Dense city districts that fit just below the massing zoom: zoom in to it around the middle of the free map box,
    // so the first view shows the 3D city and the district fills still read around the venues. Further below (a phone),
    // the districts are framed whole: zooming in would push them under the card.
    const target = fitBounds(b, {...options, apply: false});
    if (target && target.pitch > 0 && target.zoom >= MASSING_VIEW_ZOOM - MASSING_ZOOM_REACH && target.zoom < MASSING_VIEW_ZOOM && detailRows().some(hasPoint)) {
      const camera = zoomInFreeBox(target, MASSING_VIEW_ZOOM);
      if (animate() && !instant) state.map.easeTo({...camera, duration: 650}); else state.map.jumpTo(camera);
      return;
    }
    fitBounds(b, options);
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

/** Detail polygon of a district once its province file is loaded (district-detail.js), else null (coarse polygon). */
const districtGeometry = code => state.districtDetail?.geometry(code) || null;

/**
 * Load the detail polygons the view needs — the province being read, and the provinces in view once zoomed in —
 * then redraw only the district layer (same ids, values and colours; a more faithful outline).
 */
function requestDistrictDetail() {
  const detail = state.districtDetail, map = state.map;
  if (!detail || !map || !state.districtLayers) return;
  const wanted = [];
  const readCode = readingProvince();
  if (readCode) wanted.push(readCode);
  if (map.getZoom() >= DETAIL_MIN_ZOOM) {
    // Sample the screen, not the bounds: a pitched camera's bounds reach the horizon, where outlines are too small to matter.
    const {width, height} = map.getCanvas().getBoundingClientRect(), top = map.getPitch() > 30 ? 0.35 : 0, points = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const p = map.unproject([width * (i + 0.5) / 5, height * (top + (1 - top) * (j + 0.5) / 5)]);
      points.push([p.lng, p.lat]);
    }
    wanted.push(...provincesAtPoints(points, state.provinceGeo));
  }
  const missing = wanted.filter(code => !detail.loaded(code));
  if (!missing.length) return;
  detail.ensure(missing).then(changed => {
    if (changed && state.loaded && state.districtArgs) state.districtLayers?.update({...state.districtArgs, geometryOf: districtGeometry});
  });
}

/**
 * Where the district fill switches off: the station view has none (0.01, not 0 — MapLibre reads a maxzoom of 0 as
 * unset), terrain mode reads the relief from its zoom.
 */
const districtFillMaxZoom = () => (state.panel.mode === 'station' ? 0.01 : state.terrainActive ? TERRAIN.minZoom : FILL_MAX_ZOOM);

function updateSpatialLayers() {
  if (!state.loaded) return;
  const map = state.map;
  // Terrain mode reads the land at hilly sites (CityMETER · Hotel 0.3): 3D view only; on is decided at the next move end.
  state.terrain?.setEnabled(state.view3d);
  const readCode = readingProvince();
  const d = selectedDistrict();
  const pm = state.provinceLayers?.update({rows: provinceScopeRows(), readCode, visible: true}) || null;
  if (pm) state.provinceModel = pm;
  state.provinceLabels?.update(pm ? pm.provinces.filter(p => p.count > 0 && (!readCode || p.code === readCode)).map(p => ({...p, quiet: Boolean(readCode)})) : [], {visible: true, LngLatBounds: maplibregl.LngLatBounds, unit: 'แห่ง', maxZoom: readCode ? 7.5 : PROVINCE_LABEL_MAX_ZOOM});
  state.districtArgs = {summaries: state.districtModel.areas, selectedId: d?.code || '', focusIds: state.focusIds, visible: true, minzoom: readCode ? 0 : PROVINCE_FILL_MAX_ZOOM,
    fillMaxZoom: districtFillMaxZoom()};
  const dm = state.districtLayers?.update({...state.districtArgs, geometryOf: districtGeometry});
  requestDistrictDetail();
  if (dm) state.districtModel = dm;
  // A station reads its radius: no district fill or district labels over it (outlines stay).
  const labelAreas = state.panel.mode === 'station' ? [] : (dm?.areas || []).filter(a => a.count > 0 || a.focused || a.id === d?.code).map(a => ({...a, center: Number.isFinite(a.feature.properties?.labelLon) ? [a.feature.properties.labelLon, a.feature.properties.labelLat] : null}));
  // Quiet (non-focus) district labels wait for a closer zoom so the focus reads first.
  state.districtLabels?.update(labelAreas, {selectedId: d?.code || '', visible: true, LngLatBounds: maplibregl.LngLatBounds, unit: 'แห่ง', minZoom: readCode ? 9.2 : 10, quietMinZoom: 13.2});
  renderLegend();
  const detail = detailRows();
  state.buildingUnits?.ensureMany(unitProvinces(detail));
  state.pinBuildings?.update({rows: detail.filter(r => r.countable && hasPoint(r)).map(pinRow), enabled: true});
  requestModels();
  state.buildings?.update({rows: detail, enabled: true, theme: theme()});
  refreshMassing(detail);
  updatePendingMarker();
  state.stations?.select(currentStation()?.id || '', STATION_RADIUS_M);
  state.pins?.layout();
}

/** A venue as the pin matcher reads it: its point, province (for its building units) and site points, if any. */
function pinRow(r) {
  const site = state.sites.get(r.id);
  return {id: r.id, lon: r.lon, lat: r.lat, province: r.provinceCode || rowProvince(r), ...(site ? {points: site.points} : {})};
}

/**
 * Provinces whose building units the view needs (js/building-units.js; one small file each): the province being
 * read, the open venue's, the focus districts', and — from zoom 13 — the provinces of the venues in view.
 */
function unitProvinces(detail = detailRows()) {
  const codes = new Set();
  const v = currentVenue();
  if (v) codes.add(v.provinceCode || rowProvince(v));
  const read = readingProvince();
  if (read) codes.add(read);
  for (const id of state.focusIds) { const p = state.districts.get(id)?.province; if (p) codes.add(p); }
  if (state.map && state.map.getZoom() >= 13) {
    const b = state.map.getBounds();
    for (const r of detail) if (hasPoint(r) && b.contains([r.lon, r.lat])) codes.add(r.provinceCode || rowProvince(r));
  }
  return [...codes].filter(Boolean);
}

/**
 * Massing input for the current view. The focus follows what the user opened: the venue
 * (a ring round it), the district (whole when small, rings round its central venues when
 * large) or the first-Aha districts. Fade anchors are venue points of that focus (the camera
 * centre is added by massing.js), never a boundary vertex.
 */
function focusGeometry(detail) {
  const venues = detail.filter(hasPoint);
  const v = currentVenue();
  if (v && hasPoint(v)) return {regions: circleRegions([v], Math.max(650, siteReach(v))), anchors: [[v.lon, v.lat]]};
  const st = currentStation();
  if (st) return {regions: circleRegions([st], STATION_RADIUS_M + 200), anchors: [[st.lon, st.lat], ...venues.slice(0, 40).map(r => [r.lon, r.lat])]};
  const d = selectedDistrict();
  const districts = d ? [d] : state.focusIds.map(id => state.districts.get(id)).filter(Boolean);
  if (!districts.length) return {regions: [], anchors: []};
  const labels = districts.map(x => {
    const p = x.feature?.properties || {};
    return Number.isFinite(p.labelLon) && Number.isFinite(p.labelLat) ? [p.labelLon, p.labelLat] : null;
  }).filter(Boolean);
  const centre = labels[0] || (venues[0] ? [venues[0].lon, venues[0].lat] : null);
  const near = centre ? [...venues].sort((a, b) => Math.hypot(a.lon - centre[0], a.lat - centre[1]) - Math.hypot(b.lon - centre[0], b.lat - centre[1])) : venues;
  const small = districts.reduce((sum, x) => sum + x.areaKm2, 0) <= 40;
  const regions = small ? districts.flatMap(x => outerRings(x.feature)) : circleRegions(near.slice(0, 24));
  return {regions, anchors: [...labels, ...near.slice(0, 60).map(r => [r.lon, r.lat])]};
}

/** Host + pin buildings into the massing tiers, the eye-view scene and the x-ray. */
function refreshMassing(detail = detailRows()) {
  const map = state.map;
  if (!map || !state.loaded) return;
  const hostFeatures = state.buildings?.displayedFeatures() || [];
  const pinRings = hostFeatures.filter(f => f._ring).map(f => f._ring);
  const hosts = hostFeatures.filter(f => !f._ring).flatMap(outerRings);
  const {regions, anchors} = focusGeometry(detail);
  // The buildings of a CityMETER unit replace OSM there; wait for the provinces' unit files (small) so the focus is
  // shaped once, from the right source. A file that fails leaves the area on OSM.
  const codes = focusProvinces(regions, detail);
  state.buildingUnits?.ensureMany(codes);
  if (!state.buildingUnits || codes.every(c => state.buildingUnits.settled(c))) {
    const zones = state.buildingUnits?.zonesFor(regions) || [];
    state.massing?.update({
      regions, hosts, pins: pinRings, anchors, zones,
      enabled: true, city: state.view3d, zoom: map.getZoom(), latitude: map.getCenter().lat,
    })?.catch(e => console.warn('Massing', e));
  }
  state.massing?.setScene(cameraPreset() === 'eye' ? 'eye' : 'default', venueTargets(hostFeatures));
  const hostColors = () => { const s = getComputedStyle(document.documentElement); return {fill: s.getPropertyValue('--map-active-layer').trim(), stroke: s.getPropertyValue('--map-selected-stroke').trim()}; };
  // On terrain every piece stands on the ground at its centroid, as MapLibre lifts fill-extrusions; the x-ray is drawn
  // over the ground, so its walls go down to the lowest ground under the piece, never deeper (CityMETER · Hotel 0.3.2).
  // The x-ray redraws the venue in its display shape (rounded like the focus tier, js/buildings.js#drawnFeatures).
  const solid = venueLevel() ? venueHostFeatures(state.buildings?.drawnFeatures() || []).filter(f => f.properties?.render_as === 'extrusion') : [];
  const lifted = state.view3d && map.terrain ? solid.map(f => {
    const {g, low} = ringGrounds(outerRings(f)[0] || []);
    const top = Number(f.properties?.display_height_m) || 3, base = Number(f.properties?.display_base_m) || 0;
    return {...f, properties: {...f.properties, display_height_m: top + g, display_base_m: base > 0 ? base + g : low}};
  }) : solid;
  state.xray?.update(lifted, {colors: hostColors()});
  state.xray?.setEnabled(state.view3d);
}

/** Provinces of the massing focus (the regions' venues and districts): their unit files decide the focus's buildings. */
function focusProvinces(regions, detail) {
  const codes = new Set();
  const v = currentVenue();
  if (v) codes.add(v.provinceCode || rowProvince(v));
  const d = selectedDistrict();
  if (d?.province) codes.add(d.province);
  for (const id of state.focusIds) { const p = state.districts.get(id)?.province; if (p) codes.add(p); }
  if (!codes.size && regions.length) for (const r of detail.slice(0, 60)) if (hasPoint(r)) codes.add(r.provinceCode || rowProvince(r));
  return [...codes].filter(Boolean);
}

/** Half-size (m) of the ring round a venue's pin that holds every building of its site, with a margin; 0 without one. */
function siteReach(r) {
  const site = state.sites.get(r?.id);
  if (!site?.points?.length || !hasPoint(r)) return 0;
  const kx = 111320 * Math.cos((r.lat * Math.PI) / 180), ky = 110574;
  return 80 + Math.max(...site.points.map(([lon, lat]) => Math.hypot((lon - r.lon) * kx, (lat - r.lat) * ky)));
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
  // Tapping the venue's own building frames it again (two-point view, every time).
  if (state.xray?.hitTest([e.point.x, e.point.y])) { const v = currentVenue(); if (v) selectVenue(v.id, {fromMap: true}); return; }
  const box = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
  const has = id => map.getLayer(id);
  const pick = (layers, at = box) => { const ls = layers.filter(has); return ls.length ? map.queryRenderedFeatures(at, {layers: ls})[0] : null; };
  let f = pick([POINT_LAYERS.focus, POINT_LAYERS.context]);
  if (f) { selectVenue(f.properties.id, {fromMap: true}); return; }
  f = pick([POINT_LAYERS.pending]);
  if (f) { selectPending(f.properties.i, {fromMap: true}); return; }
  f = pick([HOST_LAYERS.extrusion, HOST_LAYERS.outline], e.point);
  if (f) { const id = asList(f.properties?.venue_ids).find(x => state.byId.has(x)); if (id) { selectVenue(id, {fromMap: true}); return; } }
  const station = state.stations?.hitTest(e.point);
  if (station) { selectStation(station); return; }
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
    const layers = [POINT_LAYERS.focus, POINT_LAYERS.context, POINT_LAYERS.pending, HOST_LAYERS.extrusion, HOST_LAYERS.outline, state.stations ? STATION_LAYERS.ring : '', state.districtLayers?.layerIds.fill, state.provinceLayers?.layerIds.fill].filter(id => id && map.getLayer(id));
    const over = Boolean(state.xray?.hitTest([e.point.x, e.point.y])) || map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], {layers}).length > 0;
    map.getCanvas().style.cursor = over ? 'pointer' : '';
  });
}

function installSpatialLayers() {
  const map = state.map;
  state.loaded = true;
  // MapLibre 5.6.2 throws in its tile cover when the pitched venue camera zooms out through 13–14, and after an ease
  // on terrain stops clamping the centre to the ground (js/maplibre-guard.js, from CityMETER · Hotel; 5.6.2 only).
  guardRetainedTiles(map, maplibregl.getVersion?.());
  guardElevationFreeze(map, maplibregl.getVersion?.());
  const palette = basemapPalette(theme());
  state.provinceLayers = state.provinceGeo?.features?.length ? installProvinceLayers(map, state.provinceGeo) : null;
  state.districtLayers = state.districtGeo?.features?.length ? installDistrictLayers(map) : null;
  // Draw order is depth order in MapLibre's 3D pass: the host (data) layer first, massing inserted BEFORE it.
  state.buildings = installVenueBuildings(map, state.buildingData, {rows: detailRows(), enabled: true, theme: theme(), beforeId: MASSING_BEFORE});
  // Masses that arrived before the map: drawn now, and the open venue's panel reads them (no pin event may follow).
  state.buildings.setModelFeatures(state.models?.features() || []);
  if (venueLevel() && state.models?.loadedIds().length) renderPanel();
  // Pin buildings: the basemap building each counted pin stands in (owner instruction 2026-10-25).
  // Inside a CityMETER unit the pin's building comes from CityMETER Building V4 (same rules; OSM parts stay, LOD2).
  const units = state.buildingUnits;
  state.pinBuildings = installPinBuildings(map, {
    cm: units && state.cmLoad ? {settled: code => units.settled(code), zoneAt: point => units.zoneAt(point), load: state.cmLoad} : null,
    onChange: ({features, cm}) => {
      state.cmPins = cm || 0;
      state.massing?.creditPinBuildings(state.cmPins > 0);
      state.buildings?.setPinFeatures(features);
      refreshMassing();
      renderLegend();
      if (venueLevel()) { renderPanel(); refitVenueOnNewBuilding(); }
    },
  });
  state.massing = installMassing(map, {
    beforeId: map.getLayer(HOST_LAYERS.extrusion) ? HOST_LAYERS.extrusion : MASSING_BEFORE, colors: {quiet: palette.massingQuiet, focus: palette.massingFocus, ground: palette.ground},
    tileUrl: t => (state.tileTemplate ? state.tileTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y) : ''),
    // CityMETER Building V4 inside CityMETER units (js/building-units.js); credited in the attribution while drawn.
    cmLoad: state.cmLoad, cmAttribution: CM_ATTRIBUTION,
    onResult: result => {
      state.massingResult = result;
      // Venue buildings take the focus tier's corner radius and offset (owner 7 Nov 2026: one rounded style for all).
      if (result.radiusM > 0 && state.buildings) {
        const before = state.buildings.shape.radiusM;
        state.buildings.setShape({radiusM: result.radiusM, offsetM: result.offsetM});
        if (state.buildings.shape.radiusM !== before) refreshMassing();
      }
      const status = $('map-status');
      status.dataset.massing = `${result.features || 0}`;
      status.dataset.cmBuildings = `${result.cm?.kept || 0}`;
      state.buildingSources = {osm: result.osm || 0, cm: result.cm?.kept || 0};
      renderLegend();
    },
  });
  // Redraw only the selected solid over road text; retain nearby road/place labels.
  try { state.xray = installVenueXray(map, {beforeId: VENUE_XRAY_BEFORE}); }
  catch (e) { state.xray = null; console.warn('Venue x-ray unavailable', e); }
  // Terrain mode at hilly sites (js/terrain.js, as CityMETER · Hotel): 3D ground + hillshade under the data fills;
  // the district fill switches off from TERRAIN.minZoom so the relief reads. Flat Bangkok never draws it.
  try {
    const hillBefore = ['province-fill', 'district-fill', 'water'].find(id => map.getLayer(id));
    state.terrain = installTerrain(map, {beforeId: hillBefore, colors: terrainColors(), onChange: active => {
      state.terrainActive = active;
      if (state.districtArgs) state.districtLayers?.update({...state.districtArgs, fillMaxZoom: districtFillMaxZoom(), geometryOf: districtGeometry});
      renderLegend();
      onGroundChange();
    }, onLoaded: onGroundChange, site: () => { const v = venueLevel() ? currentVenue() : null; return v && hasPoint(v) ? [v.lon, v.lat] : null; }});
    state.terrain.setEnabled(state.view3d);
  } catch (e) { state.terrain = null; console.warn('Terrain unavailable', e); }
  // Rail stations (CityMETER · Transit): quiet, clickable context under the venue dots.
  try { state.stations = state.stationList.length ? installStationLayer(map, state.stationList) : null; }
  catch (e) { state.stations = null; console.warn('Station layer unavailable', e); }
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
    state.map = new maplibregl.Map({container: 'map', center: BANGKOK_VIEW.center, zoom: BANGKOK_VIEW.zoom, pitch: 0, maxPitch: 85, attributionControl: {compact: false}, style: buildMapStyle(state.mapTheme)});
    // Nothing on the map: the credit is a line under it and the live list is in the help dialog (js/map-credits.js).
    mirrorMapCredits(state.map, {list: $('map-credit-list')});
    state.map.addControl(new maplibregl.NavigationControl({showCompass: true, visualizePitch: true}), 'top-right');
    state.districtLabels = installAreaLabels(state.map, $('map'), {className: 'district-label', hostId: 'district-labels', hostLabel: 'เขตและอำเภอบนแผนที่', minZoom: 9.2, verb: 'กดเพื่อสำรวจ', onSelect: id => selectDistrict(id, {fromMap: true}), reservedBottom: bottomSpace,
      avoid: () => state.pinPoints, onLayout: () => state.pins?.layout()});
    state.provinceLabels = installAreaLabels(state.map, $('map'), {className: 'province-label', hostId: 'province-labels', hostLabel: 'จังหวัดบนแผนที่', minZoom: 0, maxZoom: PROVINCE_LABEL_MAX_ZOOM, verb: 'กดเพื่อดูจังหวัด', detailZoomClass: false, onSelect: code => selectProvince(code), reservedBottom: bottomSpace});
    state.map.on('zoomend', () => { if (state.loaded) renderLegend(); });
    state.map.on('moveend', () => { if (state.loaded) { requestDistrictDetail(); requestModels(); } });
    // A camera move started by the user (drag, pinch, wheel, keys) — a building found later never moves the camera again.
    state.map.on('movestart', e => { if (e.originalEvent) state.userCamera = true; });
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
    for (const cleanup of [() => state.pins?.dispose(), () => state.districtLabels?.dispose(), () => state.provinceLabels?.dispose(), () => state.xray?.dispose(), () => state.pinBuildings?.dispose(), () => state.buildings?.dispose(), () => state.massing?.dispose(), () => state.map?.remove()]) { try { cleanup(); } catch (err) { console.warn('Map cleanup', err); } }
    state.map = null; state.pins = null; state.districtLabels = null; state.provinceLabels = null; state.buildings = null; state.pinBuildings = null; state.massing = null; state.xray = null; state.points = null; state.districtLayers = null; state.provinceLayers = null;
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
  if (state.map) {
    if (venueLevel()) frameVenue(currentVenue()); else applyPreset(state.map, cameraPreset(), {animate: animate()});
    state.lastPreset = cameraPreset();
  }
  saveURL();
}

/** “มุมสถาปนิก”: frame the venue's building again in two-point perspective after the user moved the map. */
function reframeVenue() {
  const v = currentVenue();
  if (!v || !state.map) return;
  state.framed = null;
  frameVenue(v);
}
function syncEyeToggle() {
  $('toggle-eye').disabled = !state.view3d || !venueLevel();
}

/* ---------- mobile sheet ---------- */
// Phones show the map first (owner instruction 2026-10-25 18:49): every selection keeps the sheet
// closed and the map card offers “ดูรายละเอียด”. Opening the sheet keeps the venue's building in
// view above it; closing re-frames it in the larger map.
function openMobilePanel() {
  if (!mobilePortrait()) return;
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.add('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'true');
  $('map-aha').hidden = true;
  if (wasOpen) return;
  // Keyboard and screen-reader users land inside the sheet.
  ($('panel-back').hidden ? $('close-mobile-panel') : $('panel-back')).focus({preventScroll: true});
  if (!state.loaded) return;
  if (venueLevel()) frameVenue(currentVenue());
  else if (state.panel.mode === 'district') fitMap();
}
function closeMobilePanel({refit = true, focus = true} = {}) {
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.remove('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'false');
  if (!mobilePortrait()) return;
  if ($('map-aha').innerHTML.trim()) $('map-aha').hidden = false;
  if (!wasOpen) return;
  if (focus) $('mobile-panel').focus({preventScroll: true});
  if (refit && state.loaded && state.panel.mode !== 'overview') fitMap();
  updateSpatialLayers();
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
  // D33: the type set the first view reads comes first, then each type.
  for (const set of Object.values(GROUP_SETS)) { const o = document.createElement('option'); o.value = set.id; o.textContent = set.th; $('group').append(o); }
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
  // D33: a link without `group` reads the first view's type set; `group=all` keeps every type.
  $('group').value = DEFAULT_GROUP;
  for (const k of FIELDS) {
    const v = p.get(URL_KEYS[k]);
    if (v == null) continue;
    if (k === 'search') { $(k).value = v; continue; }
    if (k === 'group' && v === 'all') { $(k).value = ''; continue; }
    if ([...$(k).options].some(o => o.value === v)) $(k).value = v;
  }
  if (['rank', 'mix', 'operators'].includes(p.get('view'))) state.view = p.get('view');
  const areas = p.get('areas') || '';
  if (areas === 'all') { state.autoFocus = false; state.focusAreaIds = []; }
  else state.focusAreaIds = [...new Set(areas.split(','))].filter(id => state.districts.has(id)).slice(0, 6);
  state.view3d = p.get('view3d') !== '0';
  state.showPending = p.get('pending') !== '0';
  if (p.get('venue') && state.byId.has(p.get('venue'))) { state.panel = {mode: 'venue', id: p.get('venue')}; openVenueDetail(state.panel.id); }
  else if (p.get('district') && state.districts.has(p.get('district'))) state.panel = {mode: 'district', id: p.get('district')};
  else if (p.get('station') && state.stationById.has(p.get('station'))) state.panel = {mode: 'station', id: p.get('station')};
  else if (p.get('brand')) { state.pendingBrand = p.get('brand'); ensureTenantIndex(); }
  state.pendingRecord = p.get('record') || '';
  state.pendingRole = p.get('role') || '';
}

function wireEvents() {
  // An unavailable logo keeps the shop name and the neutral shop symbol readable.
  $('panel-view').addEventListener('error', event => {
    const image = event.target;
    if (image.matches?.('.tenant-logo img')) image.hidden = true;
  }, true);
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
  $('toggle-eye').onclick = reframeVenue;
  $('mobile-panel').onclick = () => { $('panel').classList.contains('is-open') ? closeMobilePanel() : openMobilePanel(); };
  $('close-mobile-panel').onclick = () => closeMobilePanel();
  $('panel-back').onclick = goBack;
  document.querySelector('.skip').onclick = () => { openMobilePanel(); (state.panel.mode === 'overview' ? $('dataset-title') : $('panel-back')).focus(); };
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

/**
 * Research sites (several buildings of one venue, “campus style”, as CityMETER · Hotel 0.3.6): one interior point per
 * building (data/venue-sites.json, scripts/build-venue-sites.py). A point more than SITE_MAX_M from the venue's pin, or a
 * venue not in the data, is left out; nothing else changes when the file is missing.
 */
const SITE_MAX_M = 600;
async function loadSites() {
  try {
    const doc = await fetchJSON('data/venue-sites.json', {timeout: 30000});
    state.siteMeta = doc?.meta || null;
    const out = new Map();
    for (const [id, site] of Object.entries(doc?.sites || {})) {
      const r = state.byId.get(id);
      if (!r || !hasPoint(r) || !Array.isArray(site?.points)) continue;
      const kx = 111320 * Math.cos((r.lat * Math.PI) / 180), ky = 110574;
      const points = site.points.filter(p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite) && Math.hypot((p[0] - r.lon) * kx, (p[1] - r.lat) * ky) <= SITE_MAX_M);
      if (points.length) out.set(id, {points, n: Number(site.n) || points.length, source: String(site.source || ''), url: site.url || '', checkedOn: site.checkedOn || ''});
    }
    state.sites = out;
    if (state.loaded) updateSpatialLayers();
    if (venueLevel()) renderPanel();
  } catch (e) { if (e?.status !== 404) console.warn('Venue sites unavailable', e); }
}

/**
 * Building masses from a venue's own design file (js/venue-models.js, owner 2026-11-06): the index loads at start, a
 * venue's file when the map shows its box from zoom 14 or the venue is opened. They replace its pin and site
 * buildings; the massing drops the tile buildings under them; the panel and the venue camera read them.
 */
function requestModels() {
  const map = state.map;
  if (!state.models || !map || !state.loaded) return;
  const shown = new Set(detailRows().map(r => r.id));
  state.models.ensureInView(map.getBounds(), map.getZoom(), id => shown.has(id));
}
function onModelsLoaded(id) {
  if (id === null) { const v = currentVenue(); if (v) state.models.ensure(v.id); requestModels(); return; } // the index
  if (!state.loaded) return;
  state.buildings?.setModelFeatures(state.models.features());
  refreshMassing();
  renderLegend();
  if (venueLevel()) { renderPanel(); refitVenueOnNewBuilding(); }
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
    const resources = ['data/venues.json', 'data/districts.geojson', 'data/provinces.geojson', 'data/venue-buildings.geojson', 'data/venue-logos.json', 'data/stations.json'];
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
    state.districtDetail = createDistrictDetail({fetchJSON: url => fetchJSON(url)});
    // Buildings per area (the CityMETER · Hotel rule, owner 2026-11-05): the national index first, a province's units
    // when the view needs them; one shared reader of CityMETER Building V4 tiles for the focus tier and the pins.
    state.cmLoad = createCmTileLoader();
    state.buildingUnits = createBuildingUnitStore({fetchJSON, onLoad: () => { if (state.loaded) updateSpatialLayers(); },
      onError: (code, e) => { console.warn('Building units unavailable', code, e?.message || e); if (state.loaded) updateSpatialLayers(); }});
    state.buildingUnits.loadIndex();
    state.provinceGeo = results[2].status === 'fulfilled' ? results[2].value : {type: 'FeatureCollection', features: []};
    state.buildingData = results[3].status === 'fulfilled' ? results[3].value : {type: 'FeatureCollection', features: []};
    const logos = configureVenueLogos(results[4].status === 'fulfilled' ? results[4].value : {assets: []});
    if (!logos.complete) console.info('Venue logo registry', logos);
    // Operating rail stations (CityMETER · Transit, D33): the nearest one of each located venue, the station layer and
    // view. Without the file the page reads as before: no rail line, no station layer.
    if (results[5].status === 'fulfilled') {
      state.stationList = parseStations(results[5].value);
      state.stationMeta = state.stationList.length ? results[5].value.meta || null : null;
      state.stationById = new Map(state.stationList.map(s => [s.id, s]));
      attachNearestStations(state.all, state.stationList);
    } else console.warn('Rail stations unavailable', results[5].reason);

    fillOptions();
    restoreFromURL();
    $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
    syncEyeToggle();
    try { $('theme').value = localStorage.getItem(THEME_KEY) || 'auto'; } catch {}
    applyTheme();
    wireEvents();
    update();
    window.dispatchEvent(new CustomEvent('citymeter:ready'));
    startMap();
    loadPending();
    ensureTenantIndex();
    loadAmenities();
    loadSites();
    state.models = createVenueModels({fetchJSON, onLoad: onModelsLoaded, onError: (id, e) => console.warn('Venue model unavailable', id || 'index', e?.message || e)});
    state.models.loadIndex();
  } catch (e) {
    window.dispatchEvent(new CustomEvent('citymeter:load-error', {detail: {message: 'โหลดข้อมูลสถานที่ไม่สำเร็จ กรุณาลองอีกครั้ง', resource: e.resource, status: e.status, phase: e.phase || 'startup', diagnostic: e.message}}));
    console.error(e);
  }
}

// Developer hook for live tuning in a browser console (not an API; may change without notice).
window.__citymeter = {state, get map() { return state.map; }, update, fitMap, updateSpatialLayers, applyPreset: (name, opts) => state.map && applyPreset(state.map, name, opts), fitPitched: (b, opts) => state.map && fitPitched(state.map, b, opts), cameraPadding, visibleBox, venueTargets: () => venueTargets(), buildMapStyle, formatDensity, cueSVG};

init();

/**
 * Venue buildings on the 3D map, one source, two kinds:
 *
 *  1. Host buildings of qualified venues: original building footprints and CityMETER building
 *     parts from the qualified host-geometry handoff (2026-10-23), joined to venues by the
 *     registry's own link table (13_BUILDING_LINKS). A parent footprint that has qualified parts
 *     renders as an outline, not an extra solid; unknown or disputed height keeps height_m null
 *     and uses a 3 m display fallback. Source semantics: CityMETER production
 *     CmDatasetBuilding3dPlugin (baseM/topM; 3 m display fallback),
 *     https://landometer.com/api/v2/citymeter-v3/building.
 *  2. Pin buildings (pin-buildings.js, owner instruction 2026-10-25): for a counted venue
 *     without host geometry, the basemap building its pin stands in. Drawn the same blue; the
 *     panel names which kind it is.
 *
 * Original polygons © OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright
 * No generated footprints, name joins, sales or measured-height claims.
 */
import {GEOJSON_MAXZOOM} from './map-layers.js';
const SOURCE = 'venue-buildings';
const EXTRUSION = 'venue-buildings-3d';
const OUTLINE = 'venue-buildings-outline';
/** Layer ids, exported so the massing tiers can be inserted BEFORE the host extrusion (draw order = depth order). */
export const HOST_LAYERS = Object.freeze({extrusion: EXTRUSION, outline: OUTLINE, source: SOURCE});
const active = new WeakMap();

function list(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  return [];
}

function colors(theme) {
  // Host buildings are map context, not a category: LDS map.activeLayer role
  // (light #347DA8 / dark #65B6DB) with the selected-stroke role for outlines.
  // Fallbacks are the exact values already distributed in assets/theme.css.
  const dark = theme === 'dark';
  const style = typeof document !== 'undefined' && typeof getComputedStyle === 'function'
    ? getComputedStyle(document.documentElement) : null;
  return {
    fill: style?.getPropertyValue('--map-active-layer').trim() || (dark ? '#65B6DB' : '#347DA8'),
    ink: style?.getPropertyValue('--map-selected-stroke').trim() || (dark ? '#68C4E2' : '#176B82'),
  };
}

export function buildingHeightLabel(properties = {}) {
  if (properties.height_status === 'basemap_render_height') {
    return 'อาคารที่หมุดตั้งอยู่ · รูปทรงจาก OpenStreetMap';
  }
  if (properties.height_status === 'model_height_review') {
    return 'ความสูงแบบจำลองรอตรวจ · 3 ม. เพื่อแสดงรูปทรง';
  }
  if (properties.height_status === 'unknown_display_fallback') {
    return properties.render_as === 'outline'
      ? 'ความสูง footprint ไม่ระบุ · ส่วนอาคารใช้ baseM/topM จากแหล่งข้อมูล'
      : 'ไม่มีข้อมูลความสูง · 3 ม. เป็นความสูงแสดงผลเท่านั้น';
  }
  const top = Number(properties.height_m);
  const base = Number(properties.base_m) || 0;
  if (!Number.isFinite(top)) return 'ไม่มีข้อมูลความสูง';
  const label = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 2});
  if (properties.geometry_role === 'host_building_part_not_shop_unit') {
    return `ส่วนอาคาร ${label.format(base)}–${label.format(top)} ม. ตาม CityMETER · ไม่ใช่ผลรังวัด`;
  }
  return `ความสูง${properties.height_status === 'citymeter_model_estimate' ? 'ประมาณจากแบบจำลอง' : 'ตามแหล่งข้อมูล'} ${label.format(top)} ม. · ไม่ใช่ผลรังวัด`;
}

/**
 * Call after MapLibre style.load; call dispose before replacing the map style.
 * Only explicitly joined venue_ids are selected. Venues without their
 * own verified geometry join remain uncovered rather than inheriting by proximity.
 */
export function installVenueBuildings(map, geojson, options = {}) {
  if (!map || typeof map.addSource !== 'function') throw new TypeError('A MapLibre map is required');
  active.get(map)?.dispose();
  const originals = geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)
    ? geojson.features.filter(f => f?.geometry && ['Polygon', 'MultiPolygon'].includes(f.geometry.type)) : [];
  let currentRows = Array.isArray(options.rows) ? options.rows : [];
  let enabled = options.enabled !== false;
  let theme = options.theme || 'light';
  let disposed = false;
  let displayed = [];
  let pins = [];
  let coverage;
  const onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
  const before = options.beforeId && map.getLayer(options.beforeId) ? options.beforeId : undefined;

  map.addSource(SOURCE, {
    type: 'geojson', data: {type: 'FeatureCollection', features: []}, maxzoom: GEOJSON_MAXZOOM,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · CityMETER',
  });
  const palette = colors(theme);
  map.addLayer({
    id: EXTRUSION, type: 'fill-extrusion', source: SOURCE, minzoom: 14,
    filter: ['==', ['get', 'render_as'], 'extrusion'],
    layout: {visibility: enabled ? 'visible' : 'none'},
    paint: {
      'fill-extrusion-color': palette.fill,
      'fill-extrusion-height': ['get', 'display_height_m'],
      'fill-extrusion-base': ['get', 'display_base_m'],
      'fill-extrusion-opacity': 0.92,
      'fill-extrusion-vertical-gradient': true,
    },
  }, before);
  map.addLayer({
    id: OUTLINE, type: 'line', source: SOURCE, minzoom: 12,
    filter: ['==', ['get', 'geometry_role'], 'host_building_footprint_not_shop_unit'],
    layout: {visibility: enabled ? 'visible' : 'none'},
    paint: {'line-color': palette.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, .6, 17, 1.5]},
  }, before);

  function getCoverage() { return {...coverage, unmatchedRowIds: [...(coverage?.unmatchedRowIds || [])]}; }

  function update(next = {}) {
    if (disposed) return getCoverage();
    if ('rows' in next) currentRows = Array.isArray(next.rows) ? next.rows : [];
    if ('enabled' in next) enabled = Boolean(next.enabled);
    if ('theme' in next) theme = next.theme || 'light';
    const byId = new Map(currentRows.map(r => [String(r.id), r]));
    const matched = new Set();
    const hosts = new Set();
    const unknownHosts = new Set();
    const estimatedHosts = new Set();
    const disputedHosts = new Set();
    const venues = new Set();
    displayed = [];
    for (const feature of originals) {
      const properties = feature.properties || {};
      const ids = list(properties.venue_ids).filter(id => byId.has(String(id))).map(String);
      if (!ids.length) continue;
      const rs = ids.map(id => byId.get(id));
      ids.forEach(id => matched.add(id));
      rs.forEach(r => venues.add(r.id));
      hosts.add(properties.host_id);
      if (properties.render_as === 'extrusion' && properties.height_status === 'unknown_display_fallback') unknownHosts.add(properties.host_id);
      if (properties.height_status === 'citymeter_model_estimate') estimatedHosts.add(properties.host_id);
      if (properties.height_status === 'model_height_review') disputedHosts.add(properties.host_id);
      displayed.push({...feature, properties: {...properties,
        selected_venue_ids: ids,
        height_label: buildingHeightLabel(properties),
      }});
    }
    // Pin buildings only for venues without host geometry (host geometry always wins).
    const pinVenues = new Set();
    let pinParts = 0;
    for (const feature of pins) {
      const ids = list(feature.properties?.venue_ids).map(String).filter(id => byId.has(id) && !matched.has(id));
      if (!ids.length) continue;
      ids.forEach(id => pinVenues.add(id));
      pinParts++;
      const {_ring, ...plain} = feature;
      displayed.push({...plain, properties: {...feature.properties, selected_venue_ids: ids, height_label: buildingHeightLabel(feature.properties)}, _ring});
    }
    const unmatchedRows = currentRows.filter(r => !matched.has(String(r.id)) && !pinVenues.has(String(r.id)));
    coverage = {
      totalRows: byId.size, matchedRows: matched.size, unmatchedRows: unmatchedRows.length,
      matchedVenues: venues.size, unmatchedVenues: unmatchedRows.length,
      hostBuildings: hosts.size, features: displayed.length,
      unknownHeightBuildings: unknownHosts.size, estimatedHeightBuildings: estimatedHosts.size,
      disputedHeightBuildings: disputedHosts.size,
      pinVenues: pinVenues.size, pinParts,
      unmatchedRowIds: unmatchedRows.map(r => r.id), enabled,
      geometryRole: 'host_building_not_shop_unit', fallbackHeightM: 3,
    };
    const source = map.getSource(SOURCE);
    if (source) source.setData({type: 'FeatureCollection', features: displayed.map(({_ring, ...f}) => f)});
    const palette = colors(theme);
    if (map.getLayer(EXTRUSION)) {
      map.setLayoutProperty(EXTRUSION, 'visibility', enabled ? 'visible' : 'none');
      map.setPaintProperty(EXTRUSION, 'fill-extrusion-color', palette.fill);
    }
    if (map.getLayer(OUTLINE)) {
      map.setLayoutProperty(OUTLINE, 'visibility', enabled ? 'visible' : 'none');
      map.setPaintProperty(OUTLINE, 'line-color', palette.ink);
    }
    return getCoverage();
  }

  function click(event) {
    if (!enabled || disposed || !onSelect) return;
    const picked = event.features?.[0];
    if (!picked) return;
    const feature = displayed.find(f => String(f.id) === String(picked.id)) || picked;
    const ids = list(feature.properties?.selected_venue_ids).map(String);
    const rs = currentRows.filter(r => ids.includes(String(r.id)));
    if (!rs.length) return;
    // One delivery per click, whichever layer (extrusion, outline, points) is hit first.
    if (event.originalEvent && event.originalEvent.__citymeterHandled) return;
    if (event.originalEvent) event.originalEvent.__citymeterHandled = true;
    onSelect({type: 'building', feature, rows: rs, venueIds: rs.map(r => r.id), heightLabel: buildingHeightLabel(feature.properties)});
  }
  function enter() { if (enabled) map.getCanvas().style.cursor = 'pointer'; }
  function leave() { map.getCanvas().style.cursor = ''; }
  for (const layer of [EXTRUSION, OUTLINE]) {
    map.on('click', layer, click); map.on('mouseenter', layer, enter); map.on('mouseleave', layer, leave);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const layer of [OUTLINE, EXTRUSION]) {
      map.off('click', layer, click); map.off('mouseenter', layer, enter); map.off('mouseleave', layer, leave);
      if (map.getLayer(layer)) map.removeLayer(layer);
    }
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    if (active.get(map) === controller) active.delete(map);
    leave();
  }
  /** Features currently drawn (hosts of the passed rows) — used to keep OSM massing from swallowing them. */
  function displayedFeatures() { return disposed || !enabled ? [] : displayed.slice(); }
  /** Replace the pin buildings (features from pin-buildings.js) and redraw. */
  function setPinFeatures(features) { pins = Array.isArray(features) ? features : []; return update(); }
  const controller = {update, getCoverage, displayedFeatures, setPinFeatures, dispose};
  active.set(map, controller);
  update();
  return controller;
}

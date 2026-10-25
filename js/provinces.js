/**
 * Province frames for the country view.
 *
 * Below PROVINCE_FILL_MAX_ZOOM every province is filled with the LDS `count` family
 * (venues per province, quantile classes of its own; the legend switches with it); from
 * there up only the outline remains until PROVINCE_OUTLINE_MAX_ZOOM, where the districts
 * carry the reading. When a province is read (filter, district or venue) its own fill steps
 * aside for its districts and the other provinces go quiet (outline only).
 *
 * Boundaries: data/provinces.geojson, dissolved from the same OpenGISData-Thailand districts
 * (DOPA-credited, CC BY 4.0) that assign every venue — frames for navigation, never an
 * administrative claim. Ids are CityMETER production province codes.
 * EVID-05: measured (nonzero), measured_zero (0 venues in the current filter: lowest fill +
 * zero outline). Every province is in the frame set, so nothing is out of scope here.
 */
import {PROVINCES, provinceByCode} from './model.js';
import {summarizeProvinces} from './areas.js';
import {buildClasses, classify} from './scales.js';
import {featureBounds, firstLineLayerId} from './map-layers.js';

export const PROVINCE_FILL_MAX_ZOOM = 9;
export const PROVINCE_OUTLINE_MAX_ZOOM = 12;
export const PROVINCE_LABEL_MAX_ZOOM = 9;
const SOURCE = 'provinces';
export const PROVINCE_LAYERS = Object.freeze({fill: 'province-fill', zero: 'province-zero-outline', outline: 'province-outline', selected: 'province-selected'});

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

/** Per-province model: located venues per province among `rows` (the filters WITHOUT the province filter). */
export function buildProvinceModel(rows, geojson) {
  const counts = summarizeProvinces(rows);
  const provinces = (geojson?.features || []).map(f => {
    const code = f.properties?.code;
    const meta = provinceByCode(code) || {code, th: f.properties?.th || code, en: f.properties?.en || code};
    const count = counts.get(code) || 0;
    const center = Number.isFinite(f.properties?.labelLon) ? [f.properties.labelLon, f.properties.labelLat] : null;
    return {id: code, code, name: meta.th, label: `จังหวัด${meta.th}`, nameEn: meta.en, count, areaKm2: f.properties?.areaKm2 || null, feature: f, center};
  }).filter(p => provinceByCode(p.code));
  const classes = buildClasses(provinces.map(p => p.count), {kind: 'count'});
  for (const p of provinces) { const c = classify(p.count, classes); p.state = c.state; p.fill = c.fill; p.ink = c.ink; }
  return {provinces, classes, zeroCount: provinces.filter(p => p.state === 'measured_zero').length};
}

export function installProvinceLayers(map, geojson, {onSelect} = {}) {
  const beforeId = firstLineLayerId(map);
  map.addSource(SOURCE, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, promoteId: 'code',
    attribution: 'ขอบเขตจังหวัด: <a href="https://github.com/chingchai/OpenGISData-Thailand" target="_blank" rel="noopener">OpenGISData-Thailand</a> (CC BY 4.0)'});
  const outlineColor = () => ['case', ['==', ['get', 'quiet'], 1], cssVar('--border-default', '#C9D0CB'), cssVar('--border-emphasis', '#7D877F')];
  map.addLayer({
    id: PROVINCE_LAYERS.fill, type: 'fill', source: SOURCE, maxzoom: PROVINCE_FILL_MAX_ZOOM,
    filter: ['==', ['get', 'filled'], 1],
    paint: {'fill-color': ['get', 'fill'], 'fill-opacity': 1, 'fill-antialias': true},
  }, beforeId);
  map.addLayer({
    id: PROVINCE_LAYERS.zero, type: 'line', source: SOURCE, maxzoom: PROVINCE_FILL_MAX_ZOOM,
    filter: ['all', ['==', ['get', 'state'], 'measured_zero'], ['==', ['get', 'filled'], 1]],
    paint: {'line-color': cssVar('--data-zero-outline', '#7D877F'), 'line-width': 1.5},
  }, beforeId);
  map.addLayer({
    id: PROVINCE_LAYERS.outline, type: 'line', source: SOURCE, maxzoom: PROVINCE_OUTLINE_MAX_ZOOM,
    paint: {'line-color': outlineColor(), 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 1.1, 12, 1.5], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 1, 12, 0.35]},
  });
  map.addLayer({
    id: PROVINCE_LAYERS.selected, type: 'line', source: SOURCE, maxzoom: 13,
    filter: ['==', ['get', 'selected'], 1],
    paint: {'line-color': cssVar('--map-selected-stroke', '#176B82'), 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.6, 9, 2.4], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 1, 13, 0.3]},
  });
  if (onSelect) {
    map.on('click', PROVINCE_LAYERS.fill, e => {
      if (e.originalEvent?.__citymeterHandled) return;
      const f = e.features?.[0];
      if (f) { e.originalEvent.__citymeterHandled = true; onSelect(f.properties.code); }
    });
    map.on('mouseenter', PROVINCE_LAYERS.fill, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', PROVINCE_LAYERS.fill, () => { map.getCanvas().style.cursor = ''; });
  }
  let current = {provinces: [], classes: null, zeroCount: 0};

  /** rows: the filtered scope WITHOUT the province filter; readCode: the province being read ('' = country). */
  function update({rows = [], readCode = '', visible = true} = {}) {
    current = buildProvinceModel(rows, geojson);
    for (const p of current.provinces) { p.selected = p.code === readCode; p.quiet = Boolean(readCode) && !p.selected; }
    const features = current.provinces.map(p => ({
      type: 'Feature', geometry: p.feature.geometry,
      properties: {code: p.code, name: p.name, count: p.count, state: p.state, fill: p.fill, filled: readCode ? 0 : 1, quiet: p.quiet ? 1 : 0, selected: p.selected ? 1 : 0},
    }));
    map.getSource(SOURCE)?.setData({type: 'FeatureCollection', features});
    for (const id of Object.values(PROVINCE_LAYERS)) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    return current;
  }
  function dispose() {
    for (const id of Object.values(PROVINCE_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }
  return {update, dispose, model: () => current, layerIds: PROVINCE_LAYERS};
}

/** Bounds of one province frame (for the drill-down fit). */
export function provinceBounds(geojson, code, LngLatBounds) {
  const f = (geojson?.features || []).find(x => x.properties?.code === code);
  return f ? featureBounds(f, LngLatBounds) : null;
}

export {PROVINCES};

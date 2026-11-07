/**
 * Rail stations of CityMETER · Transit (montri-th/transit; data/stations.json pins the commit, the file SHA-256 and the
 * release — scripts/build-stations.py) as quiet context on the map, as in CityMETER · Hotel 0.3: operating stations only
 * — a station under construction is a project, not a service, and is not drawn. A station is a click target: it opens
 * the station panel (the venues of the filters within STATION_RADIUS_M in a straight line), whose radius is drawn as a
 * dashed circle. Foundation colours from the theme (context marks, not a data scale or a category): card fill,
 * secondary-text stroke, selected stroke; the name from zoom 13.5 in the basemap's own font.
 *
 * Each located venue also gets its nearest operating station within RAIL_REACH_M (`row.rail = {station, m}`): the
 * first finding's rail line (D33, owner 2026-11-07) counts the venues within STATION_RADIUS_M, and the venue panel names
 * the station. Distances are straight lines between reference points (haversine), not walking distances.
 */
import {GEOJSON_MAXZOOM} from './map-layers.js';
import {hasPoint} from './model.js';

export const STATION_RADIUS_M = 500;
export const RAIL_REACH_M = 2000;
export const STATION_MIN_ZOOM = 10.5;
export const STATION_LABEL_ZOOM = 13.5;
export const STATION_LAYERS = Object.freeze({radius: 'venue-station-radius', ring: 'venue-station-ring', label: 'venue-station-label', selected: 'venue-station-selected'});
const SOURCE = 'venue-stations', SELECTED = 'venue-station-selected', RADIUS = 'venue-station-radius';
const EMPTY = {type: 'FeatureCollection', features: []};

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

/** Metres between two points (haversine, mean Earth radius — the formula of CityMETER · Hotel). */
export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371008.8, rad = Math.PI / 180;
  const p1 = lat1 * rad, p2 = lat2 * rad, dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** data/stations.json → [{id, name, nameEn, lon, lat, lines, codes}]; rows without an id, a name or a point are dropped. */
export function parseStations(doc) {
  const fields = Array.isArray(doc?.fields) ? doc.fields : [];
  const at = k => fields.indexOf(k);
  const [id, name, nameEn, lon, lat, lines, codes] = ['id', 'name', 'nameEn', 'lon', 'lat', 'lines', 'codes'].map(at);
  if (id < 0 || name < 0 || lon < 0 || lat < 0) return [];
  const out = [];
  for (const r of Array.isArray(doc?.stations) ? doc.stations : []) {
    if (!Array.isArray(r)) continue;
    const s = {id: String(r[id] || ''), name: String(r[name] || ''), nameEn: nameEn >= 0 ? String(r[nameEn] || '') : '', lon: Number(r[lon]), lat: Number(r[lat]),
      lines: lines >= 0 ? String(r[lines] || '') : '', codes: codes >= 0 ? String(r[codes] || '') : ''};
    if (s.id && s.name && Number.isFinite(s.lon) && Number.isFinite(s.lat) && Math.abs(s.lon) <= 180 && Math.abs(s.lat) <= 90) out.push(s);
  }
  return out;
}

/** Stations bucketed by 0.02° cells (≈ 2.2 km): a lookup reads its cell and the eight round it. */
function gridOf(stations) {
  const grid = new Map();
  for (const s of stations) {
    const key = `${Math.floor(s.lon / 0.02)}:${Math.floor(s.lat / 0.02)}`;
    (grid.get(key) || grid.set(key, []).get(key)).push(s);
  }
  return grid;
}

/**
 * Sets `row.rail` on every row: the nearest station within `reach` metres as {station, m}, else null (also for a row
 * without a point). Returns the number of rows that got a station.
 */
export function attachNearestStations(rows, stations, {reach = RAIL_REACH_M} = {}) {
  const grid = gridOf(stations || []);
  let n = 0;
  for (const r of rows || []) {
    r.rail = null;
    if (!hasPoint(r) || !grid.size) continue;
    const cx = Math.floor(r.lon / 0.02), cy = Math.floor(r.lat / 0.02);
    let best = null, bestM = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const s of grid.get(`${cx + dx}:${cy + dy}`) || []) {
        const m = distanceM(r.lat, r.lon, s.lat, s.lon);
        if (m < bestM || (m === bestM && best && s.id < best.id)) { best = s; bestM = m; }
      }
    }
    if (best && bestM <= reach) { r.rail = {station: best, m: bestM}; n++; }
  }
  return n;
}

/** Within STATION_RADIUS_M of an operating station (needs attachNearestStations first). */
export const nearRail = (r, radius = STATION_RADIUS_M) => Boolean(r?.rail) && r.rail.m <= radius;

/**
 * The located rows within `radius` metres of a station (straight line), nearest first, each with its distance. A venue
 * near two stations is listed at both: station views never add stations together.
 */
export function rowsNearStation(rows, station, radius = STATION_RADIUS_M) {
  if (!station) return [];
  const dLat = radius / 110574, dLon = radius / (111320 * Math.cos((station.lat * Math.PI) / 180));
  const out = [];
  for (const r of rows || []) {
    if (!hasPoint(r) || Math.abs(r.lat - station.lat) > dLat * 1.01 || Math.abs(r.lon - station.lon) > dLon * 1.01) continue;
    const m = distanceM(station.lat, station.lon, r.lat, r.lon);
    if (m <= radius) out.push({row: r, m});
  }
  return out.sort((a, b) => a.m - b.m || String(a.row.name).localeCompare(String(b.row.name), 'th'));
}

/** A circle of `metres` round a point as a closed lon/lat ring (display only: the radius the panel counts in). */
export function circleRing(lon, lat, metres, steps = 72) {
  const dLat = metres / 110574, dLon = metres / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({length: steps}, (_, i) => { const a = (i / steps) * 2 * Math.PI; return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]; });
  return [...ring, ring[0]];
}

/** Stations as GeoJSON points (reference point unchanged). */
export function stationCollection(stations = []) {
  return {type: 'FeatureCollection', features: stations.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))
    .map(s => ({type: 'Feature', geometry: {type: 'Point', coordinates: [s.lon, s.lat]}, properties: {id: s.id, name: s.name}}))};
}

export function installStationLayer(map, stations = []) {
  const data = stationCollection(stations);
  const byId = new Map(data.features.map(f => [f.properties.id, f]));
  map.addSource(SOURCE, {type: 'geojson', data, maxzoom: GEOJSON_MAXZOOM});
  map.addSource(SELECTED, {type: 'geojson', data: EMPTY, maxzoom: GEOJSON_MAXZOOM});
  map.addSource(RADIUS, {type: 'geojson', data: EMPTY, maxzoom: GEOJSON_MAXZOOM});
  map.addLayer({id: STATION_LAYERS.radius, type: 'line', source: RADIUS,
    paint: {'line-color': cssVar('--map-selected-stroke', '#176B82'), 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.9}});
  map.addLayer({id: STATION_LAYERS.ring, type: 'circle', source: SOURCE, minzoom: STATION_MIN_ZOOM,
    paint: {'circle-radius': ['interpolate', ['linear'], ['zoom'], STATION_MIN_ZOOM, 2.2, 13, 3.4, 16, 5.5],
      'circle-color': cssVar('--surface-card', '#FCFCFA'), 'circle-stroke-color': cssVar('--text-secondary', '#4E5B52'),
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], STATION_MIN_ZOOM, 0.8, 14, 1.6]}});
  map.addLayer({id: STATION_LAYERS.label, type: 'symbol', source: SOURCE, minzoom: STATION_LABEL_ZOOM,
    layout: {'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-optional': true, 'text-max-width': 8},
    paint: {'text-color': cssVar('--text-secondary', '#4E5B52'), 'text-halo-color': cssVar('--surface-card', '#FCFCFA'), 'text-halo-width': 1.4}});
  map.addLayer({id: STATION_LAYERS.selected, type: 'circle', source: SELECTED,
    paint: {'circle-radius': 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': cssVar('--map-selected-stroke', '#176B82'), 'circle-stroke-width': 2.5}});

  /** Mark the open station and draw its counting radius (metres), or clear both. */
  function select(id, radius = 0) {
    const f = id ? byId.get(id) : null;
    map.getSource(SELECTED)?.setData(f ? {type: 'FeatureCollection', features: [f]} : EMPTY);
    const [lon, lat] = f ? f.geometry.coordinates : [];
    map.getSource(RADIUS)?.setData(f && radius > 0 ? {type: 'FeatureCollection', features: [{type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: circleRing(lon, lat, radius)}}]} : EMPTY);
  }
  /** The station id under a screen point ('' when none). */
  function hitTest(point, radius = 7) {
    if (!map.getLayer(STATION_LAYERS.ring) || map.getZoom() < STATION_MIN_ZOOM) return '';
    const hits = map.queryRenderedFeatures([[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]], {layers: [STATION_LAYERS.ring]});
    let best = '', bestD = Infinity;
    for (const h of hits) {
      const f = byId.get(h.properties?.id);
      if (!f) continue;
      const p = map.project(f.geometry.coordinates), d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
      if (d < bestD) { bestD = d; best = f.properties.id; }
    }
    return best;
  }
  function dispose() {
    for (const id of Object.values(STATION_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of [SOURCE, SELECTED, RADIUS]) if (map.getSource(id)) map.removeSource(id);
  }
  return {select, hitTest, dispose, layerIds: STATION_LAYERS, count: data.features.length};
}

/**
 * GPU point layers — built for the full registry (tens of thousands of points), not the DOM.
 *
 *  pending-points  — records still waiting for the definition check (owner decision D4):
 *                    quiet light dots from zoom 11, never counted, no logo, not in the tab
 *                    order; hidden with the legend switch (URL pending=0).
 *  venue-context   — qualified venues outside the focus: small neutral dots.
 *  venue-focus     — qualified venues in the focus when the focus is larger than the DOM pin
 *                    budget (pins.js MAX_DOM_PINS): group colour + group shape icons. Below
 *                    the budget the focus is drawn by the accessible DOM pins instead, so a
 *                    venue is never drawn twice.
 *
 * Colours come from theme tokens (series fills, --text-disabled, --border-default, marker
 * roles); icons are re-created with the style on theme change. One point = one record.
 */
import {GROUPS, hasPoint} from './model.js';
import {cueImage} from './cues.js';

export const POINT_LAYERS = Object.freeze({pending: 'pending-points', context: 'venue-context', focus: 'venue-focus'});
const SOURCES = {venues: 'venue-points', pending: 'pending-points'};
export const PENDING_MIN_ZOOM = 11;

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

function addIcons(map) {
  const stroke = cssVar('--map-marker-stroke', '#182327'), halo = cssVar('--map-marker-halo', '#FFFFFF');
  for (const g of GROUPS) {
    const id = `venue-icon-${g.id}`;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, cueImage(g.cue, {fill: cssVar(`--series-${g.series}-fill`, '#8AA4AA'), stroke, halo}), {pixelRatio: 2});
  }
}

/** Point features for venues: id, group, focus flag. Coordinates are the source reference point. */
export function venueFeatures(rows, focusIds) {
  return {
    type: 'FeatureCollection',
    features: rows.filter(hasPoint).map(r => ({
      type: 'Feature', geometry: {type: 'Point', coordinates: [r.lon, r.lat]},
      properties: {id: r.id, group: r.group, focus: focusIds.has(r.id) ? 1 : 0, status: r.status},
    })),
  };
}

/** Pending records arrive columnar (data/pending.json): [id, name, lon, lat, province, district, group]. */
export function pendingFeatures(pending) {
  const rows = Array.isArray(pending?.rows) ? pending.rows : [];
  return {
    type: 'FeatureCollection',
    features: rows.filter(r => Number.isFinite(r[2]) && Number.isFinite(r[3])).map((r, i) => ({
      type: 'Feature', geometry: {type: 'Point', coordinates: [r[2], r[3]]}, properties: {i, id: r[0]},
    })),
  };
}

export function installVenuePoints(map, {onSelect, onSelectPending} = {}) {
  addIcons(map);
  map.addSource(SOURCES.pending, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
  map.addSource(SOURCES.venues, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
  map.addLayer({
    id: POINT_LAYERS.pending, type: 'circle', source: SOURCES.pending, minzoom: PENDING_MIN_ZOOM,
    paint: {
      'circle-color': cssVar('--border-default', '#C9D0CB'),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.4, 14, 2.4, 17, 3.4],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0, 14, 0.6],
      'circle-stroke-color': cssVar('--text-disabled', '#A7B3A9'),
      'circle-opacity': 0.9,
    },
  });
  map.addLayer({
    id: POINT_LAYERS.context, type: 'circle', source: SOURCES.venues,
    filter: ['==', ['get', 'focus'], 0],
    paint: {
      'circle-color': cssVar('--text-disabled', '#A7B3A9'),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 10, 2, 14, 3.2, 17, 4.2],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 14, 0.8],
      'circle-stroke-color': cssVar('--map-marker-halo', '#FFFFFF'),
    },
  });
  map.addLayer({
    id: POINT_LAYERS.focus, type: 'symbol', source: SOURCES.venues,
    filter: ['==', ['get', 'focus'], 1],
    layout: {
      'icon-image': ['concat', 'venue-icon-', ['get', 'group']],
      // smaller at country zoom, where thousands of venues sit over the province ramp
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.3, 6, 0.42, 10, 0.65, 14, 0.9, 17, 1.1],
      'icon-allow-overlap': true, 'icon-ignore-placement': true, 'visibility': 'none',
    },
  });
  for (const [layer, handler] of [[POINT_LAYERS.context, onSelect], [POINT_LAYERS.focus, onSelect], [POINT_LAYERS.pending, onSelectPending]]) {
    if (!handler) continue;
    map.on('click', layer, e => {
      if (e.originalEvent?.__citymeterHandled) return;
      const f = e.features?.[0];
      if (!f) return;
      e.originalEvent.__citymeterHandled = true;
      handler(layer === POINT_LAYERS.pending ? f.properties.i : f.properties.id);
    });
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }

  let pendingSet = false;
  /**
   * rows: every qualified venue in the current scope that has a point; focusIds: the ids with
   * detail; gpuFocus: draw the focus here (true when the focus exceeds the DOM budget).
   */
  function update({rows = [], focusIds = new Set(), gpuFocus = false, pending = null, showPending = true} = {}) {
    // Focus venues are drawn by the DOM pins unless gpuFocus: keep them out of the context dots either way.
    map.getSource(SOURCES.venues)?.setData(venueFeatures(rows, focusIds));
    if (map.getLayer(POINT_LAYERS.focus)) map.setLayoutProperty(POINT_LAYERS.focus, 'visibility', gpuFocus ? 'visible' : 'none');
    if (pending && !pendingSet) { map.getSource(SOURCES.pending)?.setData(pendingFeatures(pending)); pendingSet = true; }
    if (map.getLayer(POINT_LAYERS.pending)) map.setLayoutProperty(POINT_LAYERS.pending, 'visibility', showPending ? 'visible' : 'none');
  }
  function dispose() {
    for (const id of Object.values(POINT_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of Object.values(SOURCES)) if (map.getSource(id)) map.removeSource(id);
  }
  return {update, dispose, layerIds: POINT_LAYERS};
}

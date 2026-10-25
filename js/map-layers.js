/**
 * District layers (เขต/อำเภอ) on the MapLibre map.
 *
 * The districts of the province being read (or every district when the country is read)
 * carry a choropleth of venues per km² in the LDS `density.area` family (scales.js). The
 * fill sits beneath the basemap's first line layer so roads and labels stay readable above
 * an exact, opaque data colour; from zoom 14.5 it switches off (hard switch) and only the
 * outlines and HTML labels remain, letting pins and host buildings carry the reading.
 *
 * Focus + quiet: with a focus (automatic first-Aha districts, an explicit set or one selected
 * district) only those districts keep their fill; the rest of the scope stays as quiet
 * outlines. Value states follow EVID-05: measured, measured_zero (lowest fill + zero outline)
 * and out_of_scope (districts outside the reading: not drawn).
 */
import {buildRamp, classify} from './scales.js';
import {pointInRing} from './geometry.js';

/**
 * maxzoom of every GeoJSON source the page adds. MapLibre 5.6.2 throws in SourceCache._updateRetainedTiles
 * (“reading 'key'”) when a pitched camera sits between maxzoom − 1 and maxzoom of a GeoJSON source and a
 * near tile of the level-of-detail cover reaches maxzoom before it has data (seen 2026-10-25 with the
 * two-point venue camera at zoom 17.7 and the default maxzoom 18). Every venue camera zoom (≤ 19.5)
 * stays two levels below 22.
 */
export const GEOJSON_MAXZOOM = 22;

/** Outer-ring containment for a Polygon / MultiPolygon feature (labels only; holes are ignored). */
function featureContains(feature, lngLat) {
  const g = feature?.geometry;
  if (!g) return true;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polygons.some(rings => rings[0] && pointInRing(lngLat, rings[0]));
}

export const FILL_MAX_ZOOM = 14.5;
const SOURCE = 'districts';
const LAYERS = {fill: 'district-fill', zero: 'district-zero-outline', outline: 'district-outline', selected: 'district-selected'};

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

/** First basemap line layer id, so data fills stay under roads and labels. */
export function firstLineLayerId(map) {
  const layers = map.getStyle()?.layers || [];
  return (layers.find(l => l.type === 'line') || layers.find(l => l.type === 'symbol'))?.id;
}

export function featureBounds(feature, LngLatBounds) {
  const b = new LngLatBounds();
  const walk = v => { if (typeof v[0] === 'number') b.extend(v); else v.forEach(walk); };
  walk(feature.geometry.coordinates);
  return b;
}

/**
 * Per-district model for the layer, legend, labels and charts: every scoped district with
 * its EVID-05 state and its sample of the 41-sample ramp. `summaries` come from areas.summarizeDistricts().
 */
export function buildDistrictModel(summaries) {
  const ramp = buildRamp(summaries.map(s => s.density), {kind: 'density'});
  const areas = summaries.map(s => {
    const c = classify(s.density, ramp);
    return {...s, state: c.state, fill: c.fill, ink: c.ink, classLabel: c.label, rampIndex: c.index};
  });
  return {areas, ramp, zeroCount: areas.filter(a => a.state === 'measured_zero').length};
}

export function installDistrictLayers(map, {onSelect} = {}) {
  const beforeId = firstLineLayerId(map);
  map.addSource(SOURCE, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, maxzoom: GEOJSON_MAXZOOM, promoteId: 'id',
    attribution: 'ขอบเขตเขต/อำเภอ: <a href="https://github.com/chingchai/OpenGISData-Thailand" target="_blank" rel="noopener">OpenGISData-Thailand</a> (CC BY 4.0)'});
  const outlineColor = () => ['case', ['==', ['get', 'quiet'], 1], cssVar('--border-default', '#C9D0CB'), cssVar('--border-emphasis', '#7D877F')];
  map.addLayer({
    id: LAYERS.fill, type: 'fill', source: SOURCE, maxzoom: FILL_MAX_ZOOM,
    filter: ['==', ['get', 'filled'], 1],
    paint: {'fill-color': ['get', 'fill'], 'fill-opacity': 1, 'fill-antialias': true},
  }, beforeId);
  map.addLayer({
    id: LAYERS.zero, type: 'line', source: SOURCE, maxzoom: FILL_MAX_ZOOM,
    filter: ['all', ['==', ['get', 'state'], 'measured_zero'], ['==', ['get', 'filled'], 1]],
    paint: {'line-color': cssVar('--data-zero-outline', '#7D877F'), 'line-width': 2},
  }, beforeId);
  map.addLayer({
    id: LAYERS.outline, type: 'line', source: SOURCE,
    paint: {'line-color': outlineColor(), 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 1, 15, ['case', ['==', ['get', 'quiet'], 1], 1, 1.8]], 'line-dasharray': [3, 2]},
  });
  map.addLayer({
    id: LAYERS.selected, type: 'line', source: SOURCE,
    filter: ['==', ['get', 'selected'], 1],
    paint: {'line-color': cssVar('--map-selected-stroke', '#176B82'), 'line-width': 3},
  });
  if (onSelect) {
    map.on('click', LAYERS.fill, e => {
      if (e.originalEvent?.__citymeterHandled) return;
      const f = e.features?.[0];
      if (f) onSelect(f.properties.id);
    });
    map.on('mouseenter', LAYERS.fill, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LAYERS.fill, () => { map.getCanvas().style.cursor = ''; });
  }
  let current = {areas: [], classes: null, zeroCount: 0};

  /**
   * summaries: the scoped districts (areas.summarizeDistricts); focusIds: districts with
   * detail (empty = all); selectedId: the open district; minzoom: where the reading starts
   * (country reading starts at the province fill limit so the frames read first).
   */
  function update({summaries = [], selectedId = '', focusIds = [], visible = true, minzoom = 0} = {}) {
    current = buildDistrictModel(summaries);
    const focus = new Set(selectedId ? [selectedId] : focusIds);
    const focusMode = focus.size > 0;
    for (const a of current.areas) { a.focused = !focusMode || focus.has(a.id); a.quiet = focusMode && !focus.has(a.id); }
    const features = current.areas.map(a => ({
      type: 'Feature', geometry: a.feature.geometry,
      properties: {id: a.id, name: a.name, count: a.count, state: a.state, fill: a.fill || '#000000', filled: a.focused ? 1 : 0, quiet: a.quiet ? 1 : 0,
        selected: a.id === selectedId || (!selectedId && focusIds.includes(a.id)) ? 1 : 0},
    }));
    map.getSource(SOURCE)?.setData({type: 'FeatureCollection', features});
    for (const id of Object.values(LAYERS)) {
      if (!map.getLayer(id)) continue;
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      const max = id === LAYERS.fill || id === LAYERS.zero ? FILL_MAX_ZOOM : 24;
      map.setLayerZoomRange(id, minzoom, max);
    }
    return current;
  }

  function dispose() {
    for (const id of Object.values(LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }

  return {update, dispose, model: () => current, layerIds: LAYERS};
}

/**
 * HTML labels for areas: name + count badge, collision-managed against each other and the
 * map chrome. Used for districts and (with its own class and zoom window) province frames.
 */
export function installAreaLabels(map, container, {onSelect, reservedBottom = () => 0, className = 'area-label', hostId = 'area-labels', hostLabel = 'พื้นที่บนแผนที่', minZoom = 0, maxZoom = Infinity, verb = 'กดเพื่อสำรวจ', detailZoomClass = true, avoid = null, onLayout = null} = {}) {
  const host = document.createElement('div');
  host.id = hostId;
  host.className = 'area-labels';
  host.setAttribute('aria-label', hostLabel);
  container.append(host);
  let labels = [], frame = 0, zoomWindow = {minZoom, maxZoom, quietMinZoom: minZoom};
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  function layout() {
    const width = container.clientWidth, height = container.clientHeight - reservedBottom();
    const panel = container.closest('.map-panel'), rect = container.getBoundingClientRect();
    const chrome = [...panel.querySelectorAll('.map-toolbar, .map-legend, .map-status, .map-aha, .maplibregl-ctrl-top-right')]
      .filter(e => e.offsetWidth && e.offsetHeight)
      .map(e => { const b = e.getBoundingClientRect(); return {left: b.left - rect.left - 4, right: b.right - rect.left + 4, top: b.top - rect.top - 4, bottom: b.bottom - rect.top + 4}; });
    const placed = [];
    const zoom = map.getZoom();
    // Data first: a label moves off the venue points it would cover (pins treat visible labels as
    // blockers); when no nearby slot is clear of points, it keeps the first slot clear of chrome.
    const keepClear = [];
    for (const c of (typeof avoid === 'function' ? avoid() : null) || []) {
      const q = map.project(c);
      if (q.x >= 0 && q.x <= width && q.y >= 0 && q.y <= height) keepClear.push(q);
    }
    const covered = box => keepClear.reduce((n, q) => n + (q.x > box.left - 3 && q.x < box.right + 3 && q.y > box.top - 3 && q.y < box.bottom + 3 ? 1 : 0), 0);
    if (detailZoomClass) panel.classList.toggle('is-detail-zoom', zoom >= FILL_MAX_ZOOM);
    const inWindow = zoom >= zoomWindow.minZoom && zoom < zoomWindow.maxZoom;
    // Focused and larger counts first, so the quiet ones give way when space is short.
    const order = [...labels].sort((a, b) => Number(a.quiet) - Number(b.quiet) || b.count - a.count);
    for (const e of order) {
      const p = map.project(e.center);
      const quietHidden = e.quiet && zoom < zoomWindow.quietMinZoom;
      e.button.hidden = !(e.visible && inWindow && !quietHidden && p.x > 0 && p.x < width && p.y > 48 && p.y < height);
      if (e.button.hidden) continue;
      const w = e.button.offsetWidth, h = e.button.offsetHeight;
      // first slot clear of chrome, labels and points; else the clear slot that covers the fewest points
      let position = null, fallback = null;
      for (const [dx, dy] of [[0, 0], [0, -30], [0, 30], [-40, 0], [40, 0], [0, -60], [0, 60]]) {
        const x = p.x + dx, y = p.y + dy;
        const box = {left: x - w / 2 - 4, right: x + w / 2 + 4, top: y - h / 2 - 3, bottom: y + h / 2 + 3};
        if (box.left < 4 || box.right > width - 4 || box.top < 48 || box.bottom > height || placed.some(b => overlaps(box, b)) || chrome.some(b => overlaps(box, b))) continue;
        // a moved label must still sit on its own area, or it names the neighbour
        if ((dx || dy) && e.feature) { const ll = map.unproject([x, y]); if (!featureContains(e.feature, [ll.lng, ll.lat])) continue; }
        const n = covered(box);
        if (!n) { position = {x, y, box}; break; }
        if (!fallback || n < fallback.n) fallback = {x, y, box, n};
      }
      position ||= fallback;
      e.button.hidden = !position;
      if (position) { e.button.style.left = `${position.x}px`; e.button.style.top = `${position.y}px`; placed.push(position.box); }
    }
    onLayout?.();
  }
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };

  /** areas: [{id, name, count, state, quiet, center:[lng,lat] | feature}] */
  function update(areas, {selectedId = '', visible = true, LngLatBounds, unit = 'แห่ง', minZoom: nextMin, maxZoom: nextMax, quietMinZoom} = {}) {
    if (nextMin != null) zoomWindow.minZoom = nextMin;
    if (nextMax != null) zoomWindow.maxZoom = nextMax;
    zoomWindow.quietMinZoom = quietMinZoom ?? zoomWindow.minZoom;
    host.replaceChildren();
    labels = [];
    for (const a of areas) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${className} is-${a.state}${a.id === selectedId ? ' is-selected' : ''}${a.quiet ? ' is-quiet' : ''}`;
      button.innerHTML = '<span class="label-name"></span><span class="label-count data-number" aria-hidden="true"></span>';
      button.querySelector('.label-name').textContent = a.name;
      button.querySelector('.label-count').textContent = String(a.count);
      button.setAttribute('aria-label', `${a.label || a.name}: ${a.count} ${unit} ${verb}`);
      button.title = `${a.label || a.name} · ${a.count} ${unit}`;
      button.setAttribute('aria-pressed', String(a.id === selectedId));
      if (a.state === 'measured_zero') button.classList.add('is-zero');
      button.onclick = () => onSelect?.(a.id);
      const center = a.center || (a.feature ? featureBounds(a.feature, LngLatBounds).getCenter().toArray() : null);
      if (!center) continue;
      host.append(button);
      labels.push({button, center, visible, quiet: Boolean(a.quiet), count: a.count || 0, feature: a.feature || null});
    }
    schedule();
  }
  map.on('move', schedule);
  map.on('resize', schedule);
  return {update, layout: schedule, dispose() { cancelAnimationFrame(frame); map.off('move', schedule); map.off('resize', schedule); host.remove(); }};
}

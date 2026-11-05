/**
 * Terrain mode, as in CityMETER · Hotel 0.3 (owner 2026-11-05 00:34: “ช่วยปรับการแสดงผล 3d building mass พร้อม terrain
 * ในรูปแบบเดียวกับ https://montri-th.github.io/hotel”).
 *
 * Terrain mode switches on by itself at site scale only where the land has relief: 3D view on, zoom ≥
 * TERRAIN.minZoom and the visible ground spans at least TERRAIN.reliefOn metres (p95 − p5 of a DEM sample of the
 * view; off again below TERRAIN.reliefOff or below TERRAIN.offZoom). With a venue open its site decides instead
 * (siteRelief, ±1 km round the pin, no hysteresis): the eye camera's pitched bounds reach kilometres past the venue.
 * Flat cities (Bangkok) never draw terrain. In terrain mode:
 *  - the ground is 3D (MapLibre terrain, heights exaggerated × TERRAIN.exaggeration — the legend says so); buildings
 *    stand on it (MapLibre lifts fill-extrusions by the ground at their centroid; the venue x-ray is lifted by the app);
 *  - a quiet hillshade under the data fills, water and roads (foundation tones of the theme, never a data colour);
 *  - the เขต/อำเภอ choropleth switches off from TERRAIN.minZoom (a hard switch, never a fade: data colours keep their
 *    opacity, LDS) so the relief is readable; outlines, pins, labels and buildings carry the reading.
 *
 * DEM: Terrain Tiles on AWS (Mapzen/Tilezen terrarium; SRTM 30 m over Thailand, surveyed 2000), fetched by the browser.
 */

export const TERRAIN = Object.freeze({exaggeration: 1.5, minZoom: 12.5, offZoom: 12.2, reliefOn: 30, reliefOff: 20, probeZoom: 11, factZoom: 13, demMaxZoom: 14});
export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const DEM_ATTRIBUTION = 'ภูมิประเทศ: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles on AWS</a> (Mapzen · SRTM)';
export const TERRAIN_SOURCES = Object.freeze({terrain: 'terrain-dem', hillshade: 'terrain-hillshade-dem'});
export const HILLSHADE_LAYER = 'terrain-hillshade';
/** Terrarium RGB → metres. */
export const terrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

const tileOf = (lon, lat, z) => {
  const n = 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  const xf = ((lon + 180) / 360) * n, yf = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return {x: Math.floor(xf), y: Math.floor(yf), px: Math.min(255, Math.floor((xf - Math.floor(xf)) * 256)), py: Math.min(255, Math.floor((yf - Math.floor(yf)) * 256))};
};

const demCache = new Map();
/** Decoded DEM tile (RGBA bytes of 256 × 256) or null when it cannot be read. Browser only. */
export function demTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!demCache.has(key)) {
    demCache.set(key, new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        try {
          const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), {width: 256, height: 256});
          const ctx = canvas.getContext('2d', {willReadFrequently: true});
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, 256, 256).data);
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = DEM_TILES.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    }));
    if (demCache.size > 400) demCache.delete(demCache.keys().next().value);
  }
  return demCache.get(key);
}

/** Ground elevation (m) at a point, or null. */
export async function elevationAt(lon, lat, z = TERRAIN.factZoom) {
  const t = tileOf(lon, lat, z);
  const d = await demTile(z, t.x, t.y);
  if (!d) return null;
  const i = (t.py * 256 + t.px) * 4;
  return terrarium(d[i], d[i + 1], d[i + 2]);
}

/** Robust relief of a lon/lat box: p95 − p5 of an n × n sample (m), or null. */
export async function reliefOf([west, south, east, north], {z = TERRAIN.probeZoom, n = 14} = {}) {
  const values = [];
  const jobs = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const lon = west + ((i + 0.5) / n) * (east - west), lat = south + ((j + 0.5) / n) * (north - south);
    jobs.push(elevationAt(lon, lat, z).then(v => { if (Number.isFinite(v) && v > -50) values.push(v); }));
  }
  await Promise.all(jobs);
  if (values.length < n) return null;
  values.sort((a, b) => a - b);
  const q = p => values[Math.min(values.length - 1, Math.floor(p * values.length))];
  return q(0.95) - q(0.05);
}

/**
 * Keyed jobs that run when the camera is still. MapLibre 5.6.2 reads the elevation centre of a running ease on every
 * frame once a terrain is set (Map._updateElevation); a terrain set during an ease that started without one has none,
 * so the frame throws (“reading 'wrap'”) and the render loop stops for good — seen live 2026-11-01 when a stay's
 * building camera was flying while terrain mode switched on. Terrain changes therefore wait for the move to end, a
 * tick later (the instant jumps of a camera fit end first); the last job per key wins.
 */
export function stillScheduler(map, {defer = fn => setTimeout(fn, 0)} = {}) {
  const pending = new Map();
  let waiting = false;
  function run(key, fn) {
    if (typeof map.isMoving !== 'function' || !map.isMoving()) { pending.delete(key); fn(); return; }
    pending.set(key, fn);
    if (waiting) return;
    waiting = true;
    map.once('moveend', () => defer(() => {
      waiting = false;
      const jobs = [...pending]; pending.clear();
      for (const [k, f] of jobs) run(k, f);
    }));
  }
  return {run, cancel: key => pending.delete(key), clear: () => pending.clear(), get pending() { return [...pending.keys()]; }};
}

/**
 * Relief (m) of the land round a point: p95 − p5 of a 12 × 12 sample of the DEM at the probe zoom over a box of
 * ±1 km — the view's own reading, at the scale of a site. (The 500 m rings of the terrain facts read SRTM's urban
 * surface as relief: 47 m round a Bangkok tower block, 18 m here; 31 m round Sri Panwa's hill, 154 m above Patong.)
 */
export function siteRelief(lon, lat, {halfM = 1000} = {}) {
  const dLat = halfM / 110574, dLon = halfM / (111320 * Math.cos((lat * Math.PI) / 180));
  return reliefOf([lon - dLon, lat - dLat, lon + dLon, lat + dLat], {n: 12});
}

/**
 * Mount terrain mode on a map (after style.load). options.colors: {shadow, highlight, accent}; options.onChange(active);
 * options.onLoaded() once the DEM under the view has loaded; options.site() → [lon, lat] of a building or stay being
 * looked at, or null: then the relief round that point decides (siteRelief, ±1 km; owner 2026-11-01: “อยากให้เห็น
 * อาคารบนภูมิประเทศ”) — the building camera's view is too close, and its pitched bounds too far, to read the land.
 * Returns {setEnabled(on3d), evaluate(), active(), retheme(colors), dispose()}.
 */
export function installTerrain(map, {beforeId = 'water', colors = {}, onChange = null, onLoaded = null, site = null, exaggeration = TERRAIN.exaggeration} = {}) {
  let enabled = true, mode = false, token = 0, timer = 0, palette = colors;
  const hasLayer = id => Boolean(map.getLayer(id));
  function ensure() {
    if (!map.getSource(TERRAIN_SOURCES.terrain)) map.addSource(TERRAIN_SOURCES.terrain, {type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: TERRAIN.demMaxZoom, attribution: DEM_ATTRIBUTION});
    // A second source for the hillshade (MapLibre recommends one raster-dem source per use).
    if (!map.getSource(TERRAIN_SOURCES.hillshade)) map.addSource(TERRAIN_SOURCES.hillshade, {type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: TERRAIN.demMaxZoom});
    if (!hasLayer(HILLSHADE_LAYER)) {
      map.addLayer({id: HILLSHADE_LAYER, type: 'hillshade', source: TERRAIN_SOURCES.hillshade, layout: {visibility: 'none'}, paint: hillshadePaint(palette)}, map.getLayer(beforeId) ? beforeId : undefined);
    }
  }
  const still = stillScheduler(map);
  const whenStill = still.run;
  function setMode(on) {
    if (on === mode) { still.cancel('mode'); return; }
    whenStill('mode', () => applyMode(on));
  }
  function applyMode(on) {
    if (on === mode) return;
    mode = on;
    if (on) {
      ensure();
      map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', 'visible');
      map.setTerrain({source: TERRAIN_SOURCES.terrain, exaggeration});
      // Symbols placed before the first DEM tile arrives can stay hidden until the terrain is set again (seen in
      // the mockup, MapLibre 5.6.2): re-apply once when the terrain source has loaded.
      const refresh = e => {
        if (e.sourceId !== TERRAIN_SOURCES.terrain || !e.isSourceLoaded) return;
        map.off('sourcedata', refresh);
        whenStill('refresh', () => {
          if (!mode) return;
          map.setTerrain(null); map.setTerrain({source: TERRAIN_SOURCES.terrain, exaggeration});
          // The ground under the view is known now: whatever stands on it (the building camera, the x-ray) can follow.
          onLoaded?.();
        });
      };
      map.on('sourcedata', refresh);
    } else {
      map.setTerrain(null);
      if (hasLayer(HILLSHADE_LAYER)) map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', 'none');
    }
    onChange?.(mode);
  }
  async function evaluate() {
    const my = ++token, zoom = map.getZoom();
    if (!enabled || zoom < TERRAIN.offZoom) { setMode(false); return; }
    if (zoom < TERRAIN.minZoom && !mode) return;
    // A building or stay being looked at: its site decides (a fixed reading, no hysteresis) — the bounds of a camera
    // pitched at 75° reach kilometres past the site, where SRTM reads a city's towers as relief.
    const at = typeof site === 'function' ? site() : null;
    const near = Array.isArray(at) && at.every(Number.isFinite) ? await siteRelief(at[0], at[1]).catch(() => null) : null;
    if (my !== token) return;
    if (Number.isFinite(near)) { setMode(near >= TERRAIN.reliefOn); return; }
    const b = map.getBounds();
    const relief = await reliefOf([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    if (my !== token || relief === null) return;
    setMode(relief >= TERRAIN.reliefOn || (mode && relief >= TERRAIN.reliefOff));
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(evaluate, 120); };
  map.on('moveend', schedule);
  return {
    /** Off at once (2D, or the view leaves site scale); on is decided at the next move end. */
    setEnabled(on) { enabled = Boolean(on); if (!enabled) { clearTimeout(timer); token++; setMode(false); } else schedule(); },
    evaluate,
    active: () => mode,
    retheme(next) { palette = next || palette; if (hasLayer(HILLSHADE_LAYER)) for (const [k, v] of Object.entries(hillshadePaint(palette))) map.setPaintProperty(HILLSHADE_LAYER, k, v); },
    dispose() {
      clearTimeout(timer); token++; still.clear();
      map.off('moveend', schedule);
      try { if (mode) map.setTerrain(null); } catch { /* style already gone */ }
      if (hasLayer(HILLSHADE_LAYER)) map.removeLayer(HILLSHADE_LAYER);
      for (const id of Object.values(TERRAIN_SOURCES)) if (map.getSource(id)) map.removeSource(id);
      mode = false;
    },
  };
}

/** Quiet hillshade in the theme's foundation tones (light: ink shadow, white highlight; dark: black shadow). */
export function hillshadePaint({shadow = '#182327', highlight = '#FFFFFF', accent = '#7B877D', dark = false} = {}) {
  return {'hillshade-exaggeration': dark ? 0.7 : 0.55, 'hillshade-illumination-direction': 315, 'hillshade-shadow-color': shadow, 'hillshade-highlight-color': highlight, 'hillshade-accent-color': accent};
}

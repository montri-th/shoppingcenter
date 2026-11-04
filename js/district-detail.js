/**
 * Detail district polygons, one file per province (data/districts/<province>.geojson), loaded when the reading
 * needs them: the province being read, and every province in view once the map is zoomed in past
 * DETAIL_MIN_ZOOM. data/districts.geojson stays the coarse national file for the country view, so the first paint
 * does not wait for detail and nothing is fetched for provinces nobody looks at.
 *
 * Why (owner, 4 Nov 2026 21:56): at city zoom the coarse outline of a small district (Samphanthawong, 1.4 km²)
 * crossed the Chao Phraya into Thonburi. The detail polygons are the same RTSD district polygons (simplified to a few
 * metres in small districts), so ids, values and colours never change — only the outline is drawn more faithfully.
 *
 * Pure loader, no MapLibre: `provincesInView(bounds, provinces)` picks the provinces covering the view; `geometry(code)`
 * returns a district's detail geometry once its province is loaded; a failed file is retried on a later call
 * (the coarse polygon stays meanwhile).
 */
import {pointInRing} from './geometry.js';

export const DETAIL_MIN_ZOOM = 9;
export const DETAIL_MAX_PROVINCES_IN_VIEW = 4;

const PROVINCE_CODE = /^[A-Z]{2,4}$/;

/** Bounding box [west, south, east, north] of a Polygon / MultiPolygon feature. */
export function featureBox(feature) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = v => {
    if (typeof v[0] === 'number') { w = Math.min(w, v[0]); e = Math.max(e, v[0]); s = Math.min(s, v[1]); n = Math.max(n, v[1]); }
    else for (const x of v) walk(x);
  };
  if (feature?.geometry?.coordinates) walk(feature.geometry.coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/**
 * Province codes that cover the view box [west, south, east, north]: a GRID × GRID sample of the view, each point
 * located in the coarse province polygons (bounding box first, then the outer rings). Most-covered first, at most
 * `limit` — so a zoomed-in view fetches the one or two provinces it shows, not every province whose box it touches.
 * `provinces` is the province FeatureCollection (properties.code).
 */
const GRID = 5;
export function provincesInView(view, provinces, {limit = DETAIL_MAX_PROVINCES_IN_VIEW} = {}) {
  if (!view) return [];
  const [vw, vs, ve, vn] = view, points = [];
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) points.push([vw + (ve - vw) * (i + 0.5) / GRID, vs + (vn - vs) * (j + 0.5) / GRID]);
  return provincesAtPoints(points, provinces, {limit});
}

/** Province codes containing the given [lon, lat] points (a sample of what the camera shows), most points first. */
export function provincesAtPoints(points, provinces, {limit = DETAIL_MAX_PROVINCES_IN_VIEW} = {}) {
  if (!points?.length || !provinces?.features) return [];
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const shapes = [];
  for (const f of provinces.features) {
    const code = f?.properties?.code, box = featureBox(f), g = f?.geometry;
    if (!code || !box || box[0] > e || box[2] < w || box[1] > n || box[3] < s) continue;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
    shapes.push({code, box, rings});
  }
  const hits = new Map();
  for (const pt of points) {
    const hit = shapes.find(sh => pt[0] >= sh.box[0] && pt[0] <= sh.box[2] && pt[1] >= sh.box[1] && pt[1] <= sh.box[3]
      && sh.rings.some(r => pointInRing(pt, r)));
    if (hit) hits.set(hit.code, (hits.get(hit.code) || 0) + 1);
  }
  return [...hits].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([code]) => code);
}

function validDetail(json, province) {
  if (json?.type !== 'FeatureCollection' || !Array.isArray(json.features)) return false;
  return json.features.every(f => {
    const g = f?.geometry, code = f?.properties?.code;
    return typeof code === 'string' && /^\d{4}$/.test(code) && (g?.type === 'Polygon' || g?.type === 'MultiPolygon') && Array.isArray(g.coordinates);
  }) && (!json.metadata?.province || json.metadata.province === province);
}

/**
 * createDistrictDetail({fetchJSON, base}) → {load(province), ensure(codes), geometry(code), loaded(province), size()}.
 * `fetchJSON(url)` resolves to parsed JSON (the page's fetchJSON with timeout); `ensure` resolves to true when at
 * least one new province arrived, so the caller redraws once.
 */
export function createDistrictDetail({fetchJSON, base = 'data/districts/'} = {}) {
  const geometries = new Map(), done = new Set(), inflight = new Map();

  function load(province) {
    if (!PROVINCE_CODE.test(String(province || ''))) return Promise.resolve(false);
    if (done.has(province)) return Promise.resolve(false);
    if (inflight.has(province)) return inflight.get(province);
    const job = Promise.resolve()
      .then(() => fetchJSON(`${base}${province}.geojson`))
      .then(json => {
        if (!validDetail(json, province)) throw new Error(`invalid district detail ${province}`);
        for (const f of json.features) geometries.set(f.properties.code, f.geometry);
        done.add(province);
        return true;
      })
      .catch(error => { console.warn('District detail unavailable', province, error); return false; })
      .finally(() => inflight.delete(province));
    inflight.set(province, job);
    return job;
  }

  async function ensure(codes) {
    const results = await Promise.all([...new Set(codes)].map(load));
    return results.some(Boolean);
  }

  return {
    load, ensure,
    geometry: code => geometries.get(code) || null,
    loaded: province => done.has(province),
    size: () => done.size,
  };
}

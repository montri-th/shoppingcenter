/**
 * Building masses from a venue's own design file (owner 2026-11-06 09:19: “ผม upload .skp สำหรับ PARC Bangna และ
 * Live Ramintra … simplify ให้เหมาะสมที่ user จะใช้งานร่วมกับอาคารอื่นๆในเวบได้ลื่นไหล optimize ให้ดี”; 09:22 “จะชึ้นใหม่
 * ให้พอได้รูปร่าง 3d building mass ก็ได้นะครับ ให้โหลดเร็วๆไม่หนัก”).
 *
 * data/venue-models.json lists the venues that have one (id, file, lon/lat box, parts, bytes, source); a venue's file
 * (data/venue-models/<id>.json: LOD1 boxes, a base and a top per part, a few tens of KB) is fetched only when the map
 * shows its box from MODEL_MIN_ZOOM or the venue is opened, once. Nothing else changes when the index is missing.
 *
 * The masses are drawn by js/buildings.js in the host blue and replace the venue's pin and site buildings (the design
 * file wins, as validated host geometry does); the massing tiers drop the tile buildings they overlap (they are hosts).
 * A mass is the design's shape and height, placed on the map by the method its file records — never a survey.
 */
export const MODEL_MIN_ZOOM = 14;
export const MODEL_ROLE = 'owner_model_mass';
export const MODEL_HEIGHT_STATUS = 'owner_model_design';

const finite = v => typeof v === 'number' && Number.isFinite(v);
const validRing = r => Array.isArray(r) && r.length >= 4 && r.every(p => Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1]));

/** Pure: one venue's model file into features for js/buildings.js (bad parts are left out, never repaired). */
export function modelFeatures(id, doc) {
  const features = [];
  const parts = doc?.type === 'FeatureCollection' && Array.isArray(doc.features) ? doc.features : [];
  parts.forEach((f, i) => {
    const g = f?.geometry;
    if (g?.type !== 'Polygon' || !Array.isArray(g.coordinates) || !g.coordinates.length || !g.coordinates.every(validRing)) return;
    const top = Number(f.properties?.height_m), base = Number(f.properties?.base_m) || 0;
    if (!Number.isFinite(top) || top <= base || base < 0) return;
    features.push({type: 'Feature', id: `model:${id}:${i}`, geometry: g, properties: {
      host_id: `model:${id}:${i}`, venue_ids: [String(id)], geometry_role: MODEL_ROLE, render_as: 'extrusion',
      height_status: MODEL_HEIGHT_STATUS, height_m: top, base_m: base, display_height_m: top, display_base_m: base,
      model_part: i,
    }});
  });
  return features;
}

const boxOf = e => Array.isArray(e?.bbox) && e.bbox.length === 4 && e.bbox.every(finite) ? e.bbox : null;
/** Pure: do a [w, s, e, n] box and map bounds ({_sw, _ne} or [[w, s], [e, n]]) meet? */
export function boxMeets(box, bounds) {
  if (!box || !bounds) return false;
  const sw = bounds._sw ? [bounds._sw.lng, bounds._sw.lat] : bounds[0], ne = bounds._ne ? [bounds._ne.lng, bounds._ne.lat] : bounds[1];
  return !(box[2] < sw[0] || box[0] > ne[0] || box[3] < sw[1] || box[1] > ne[1]);
}

/**
 * fetchJSON(url) → Promise of JSON; onLoad(id) after a venue's masses arrive. Every file is fetched at most once; a
 * failed file is retried on the next ask after `retryMs`.
 */
export function createVenueModels({fetchJSON, onLoad = () => {}, onError = () => {}, retryMs = 30000, indexUrl = 'data/venue-models.json'} = {}) {
  let index = new Map(), meta = null, indexState = 'idle';
  const loaded = new Map(), pending = new Map(), failedAt = new Map();
  async function loadIndex() {
    if (indexState !== 'idle') return;
    indexState = 'loading';
    try {
      const doc = await fetchJSON(indexUrl, {timeout: 20000});
      meta = doc?.meta || null;
      const next = new Map();
      for (const e of Array.isArray(doc?.models) ? doc.models : []) {
        if (!e?.venue_id || typeof e.file !== 'string' || !/^data\/venue-models\/[A-Za-z0-9_-]+\.json$/.test(e.file) || !boxOf(e)) continue;
        next.set(String(e.venue_id), e);
      }
      index = next;
      indexState = 'ready';
      onLoad(null);
    } catch (e) {
      indexState = 'failed';
      if (e?.status !== 404) onError(null, e);
    }
  }
  function ensure(id) {
    const key = String(id || '');
    const e = index.get(key);
    if (!e || loaded.has(key) || pending.has(key)) return pending.get(key) || null;
    if (failedAt.has(key) && Date.now() - failedAt.get(key) < retryMs) return null;
    const job = Promise.resolve().then(() => fetchJSON(e.file, {timeout: 30000})).then(doc => {
      loaded.set(key, modelFeatures(key, doc));
      failedAt.delete(key);
      onLoad(key);
    }).catch(err => { failedAt.set(key, Date.now()); onError(key, err); }).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  }
  /** Fetch the files whose box the view meets (zoom ≥ MODEL_MIN_ZOOM); `allowed(id)` filters (e.g. venues on the map). */
  function ensureInView(bounds, zoom, allowed = () => true) {
    if (!(zoom >= MODEL_MIN_ZOOM)) return [];
    const out = [];
    for (const [id, e] of index) if (!loaded.has(id) && allowed(id) && boxMeets(boxOf(e), bounds)) { const j = ensure(id); if (j) out.push(j); }
    return out;
  }
  return {
    loadIndex, ensure, ensureInView,
    features: () => [...loaded.values()].flat(),
    entry: id => index.get(String(id)) || null,
    has: id => index.has(String(id)),
    loadedIds: () => [...loaded.keys()],
    get meta() { return meta; },
    get state() { return indexState; },
  };
}

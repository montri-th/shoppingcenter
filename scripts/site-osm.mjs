// OpenStreetMap buildings for the site research helper (scripts/site-candidates.mjs). Inside a CityMETER unit the map
// draws a site point's building from CityMETER Building V4, and the OpenStreetMap building when CityMETER has none there
// (js/pin-buildings.js matchInUnit). This reads the same OpenFreeMap tiles as the map (js/map-style.js TILEJSON_URL,
// z14 `building` layer) with the map's own decoder, so a point it accepts stands in a building the map draws.
// Research tool only: nothing here enters the page.
import {parseVectorTile, lonLatToTile, tilesForBBox} from '../js/mvt.js';
import {cmParts, pointInRing} from '../js/pin-buildings.js';
import {TILEJSON_URL} from '../js/map-style.js';

export const OSM_TILE_ZOOM = 14;

/**
 * A reader of OpenStreetMap buildings: `osmBuildingAt([lon, lat])` → {areaM2, outer} of the building holding the point, or
 * null; `osmBuildingAt.partsIn(bbox)` → the parts of every tile over a box (scripts/site-draft.mjs osmOnly). One tile cache.
 */
export function createOsmReader({fetchImpl = globalThis.fetch, headers = {}, tileJsonUrl = TILEJSON_URL} = {}) {
  let template = null;
  const tiles = new Map();
  async function buildingLayer(t) {
    if (!template) {
      const res = await fetchImpl(tileJsonUrl, {headers});
      if (!res.ok) throw new Error(`TileJSON HTTP ${res.status}`);
      template = (await res.json()).tiles?.[0];
      if (!template) throw new Error('the TileJSON lists no tiles');
    }
    const key = `${t.z}/${t.x}/${t.y}`;
    if (!tiles.has(key)) {
      tiles.set(key, (async () => {
        const res = await fetchImpl(template.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y), {headers});
        if (res.status === 204) return null;
        if (!res.ok) throw new Error(`tile ${key} HTTP ${res.status}`);
        return parseVectorTile(new Uint8Array(await res.arrayBuffer())).layers.building || null;
      })());
    }
    return tiles.get(key);
  }
  async function osmBuildingAt([lon, lat]) {
    const t = lonLatToTile(lon, lat, OSM_TILE_ZOOM);
    const layer = await buildingLayer(t);
    const part = cmParts(layer, t).find(p => pointInRing([lon, lat], p.outer) && !p.holes.some(h => pointInRing([lon, lat], h)));
    return part ? {areaM2: Math.round(part.areaM2), outer: part.outer} : null;
  }
  /** Every building part of the z14 tiles over a [west, south, east, north] box (a building cut by a tile edge is two parts). */
  osmBuildingAt.partsIn = async bbox => {
    const parts = [];
    for (const t of tilesForBBox(bbox, OSM_TILE_ZOOM)) parts.push(...cmParts(await buildingLayer(t), t));
    return parts;
  };
  return osmBuildingAt;
}

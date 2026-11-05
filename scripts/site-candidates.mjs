#!/usr/bin/env node
// Research helper for the shopping-centre site tab (multi-building sites, "campus style"; owner 2026-11-05
// “Megabangna มีหลายอาคาร ในที่ดินใหญ่มาก แต่ปัจจุบันแสดงไม่ครบ ควรทำยังไง” → brief the research team). Same method as
// CityMETER · Hotel (scripts/site-candidates.mjs there). Run from the root of a clone of this repo (Node 20+, no
// packages). It reads the buildings with the code the map uses (js/mvt.js, js/building-units.js, js/pin-buildings.js),
// so every point it writes stands inside a building the map draws. It writes nothing in data/ — the research sheet
// stays the record; outputs go to sites/ (git-ignored).
//
//   node scripts/site-candidates.mjs candidates <venue_id> [--reach 250]
//       → sites/<venue_id>/candidates.json · candidates.csv · candidates.svg (numbered buildings, north up, pin red)
//   node scripts/site-candidates.mjs row <venue_id> (--pick 1,2,5 | --site site.geojson [--add 3,7] [--drop 12])
//       --source site_layout|dol_parcels+site_layout --evidence <https page of the layout> [--main "…"] [--notes "…"] [--by "…"]
//       → sites/<venue_id>/row.json · picked.svg and the row in sites/site_rows.csv (one row per venue_id)
//   node scripts/site-candidates.mjs check <venue_id> --points "lon,lat;lon,lat"
//       → which drawn building holds each point (a sheet row's buildings_in_boundary); exits 1 if one is outside
//   node scripts/site-candidates.mjs rank [--groups mall,community,outlet] [--reach 250] [--min-area 2000]
//       → sites/rank.csv: an internal work list for the research team, never published (D3: the legacy GLA/GFA estimates
//         stay out of rankings on the page). Largest reported floor area first (legacy GFA, an approximate value: big
//         projects are where several buildings are most likely), then the rest by the large buildings near the point.
//         Hints: `gap` = GFA ÷ drawn footprint ÷ max(1, drawn height ÷ 4 m) — how many times the building the map draws
//         would have to be stacked to hold the reported floor area; a drawn building under 1,000 m² usually means the pin
//         stands on a small building next to the centre. Neighbours' buildings count in `large_buildings` too.
//
// Buildings come from CityMETER Building V4 where the map uses it (data/building-units, the 1.15 rule). Where the map
// uses OpenStreetMap the helper stops with osm_area: leave the row and tell the owner.
import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync} from 'node:fs';
import {parseVectorTile, tilesForBBox} from '../js/mvt.js';
import {zonesOf, zoneAt, cmTileUrl, CM_SOURCE_LAYER} from '../js/building-units.js';
import {cmParts, interiorPoint, pointInRing} from '../js/pin-buildings.js';
import {tileBox} from '../js/massing.js';

const MAX_SITE_M = 600;   // scripts/build-venue-sites.py and js/app.js SITE_MAX_M
const SOURCES = ['dol_parcels+site_layout', 'site_layout', 'dol_parcels'];
const COLUMNS = ['venue_id', 'venue_name', 'boundary_status', 'boundary_source', 'boundary_evidence_url', 'boundary_geojson', 'buildings_in_boundary',
  'building_count', 'main_building_note', 'checked_by', 'checked_on', 'notes'];
const UA = {'User-Agent': 'citymeter-shoppingcenter-research/0.1'};
const [cmd, venueArg] = process.argv.slice(2);
const argv = process.argv.slice(cmd === 'rank' ? 3 : 4);
const opt = (k, d = '') => { const i = argv.indexOf(`--${k}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const ids = s => (s ? s.split(',').map(x => Number(x.trim())).filter(Number.isInteger) : []);
const fail = msg => { console.error(`STOP: ${msg}`); process.exit(1); };
if (!['candidates', 'row', 'check', 'rank'].includes(cmd) || (cmd !== 'rank' && !venueArg)) fail('usage: node scripts/site-candidates.mjs candidates|row|check <venue_id> [options] · rank [options]');
if (!existsSync('js/massing.js') || !existsSync('data/venues.json')) fail('run from the root of a clone of montri-th/shoppingcenter');

const venues = JSON.parse(readFileSync('data/venues.json', 'utf8')).rows;
const byId = new Map(venues.map(r => [r.id, r]));
const unitFiles = new Map();
function zonesOfProvince(code) {
  if (!unitFiles.has(code)) unitFiles.set(code, existsSync(`data/building-units/${code}.json`) ? JSON.parse(readFileSync(`data/building-units/${code}.json`, 'utf8')) : null);
  const json = unitFiles.get(code);
  return {zones: json ? zonesOf(json) : [], units: json?.units || []};
}
const metres = lat => ({kx: 111320 * Math.cos((lat * Math.PI) / 180), ky: 110574});
const tileCache = new Map();
async function tileLayer(tile, tileUnit, tileType) {
  const key = `${tile.z}/${tile.x}/${tile.y}|${tileUnit.id}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(cmTileUrl(tile, tileUnit, tileType), {headers: UA});
          if (res.status === 204) return {extent: 4096, features: []};
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return parseVectorTile(new Uint8Array(await res.arrayBuffer())).layers[CM_SOURCE_LAYER] || {extent: 4096, features: []};
        } catch (e) { if (attempt === 2) throw e; await new Promise(r => setTimeout(r, 800 * (attempt + 1))); }
      }
    })());
  }
  return tileCache.get(key);
}

/** The CityMETER buildings within `reach` metres of a venue's point, numbered by distance (1 = nearest). */
async function buildingsNear(row, reach) {
  const point = [row.lon, row.lat];
  const {zones, units} = zonesOfProvince(row.provinceCode);
  const zone = zoneAt(zones, point);
  if (!zone) {
    const unit = units.find(u => u.source !== 'cm' && u.bbox && point[0] >= u.bbox[0] && point[0] <= u.bbox[2] && point[1] >= u.bbox[1] && point[1] <= u.bbox[3]);
    return {zone: null, reason: unit ? `osm_area (${unit.name}: the map draws OpenStreetMap buildings here)` : 'no_unit (the point is in no building unit of data/building-units)'};
  }
  const {kx, ky} = metres(row.lat);
  const box = [row.lon - reach / kx, row.lat - reach / ky, row.lon + reach / kx, row.lat + reach / ky];
  const near = zones.filter(z => z.bbox[0] <= box[2] && box[0] <= z.bbox[2] && z.bbox[1] <= box[3] && box[1] <= z.bbox[3]);
  const seen = new Set(), found = [];
  for (const tile of tilesForBBox(box, 14)) {
    const tb = tileBox(tile);
    for (const z of near) for (const tu of z.tileUnits) {
      if (!(tu.bbox[0] <= tb[2] && tb[0] <= tu.bbox[2] && tu.bbox[1] <= tb[3] && tb[1] <= tu.bbox[3])) continue;
      const layer = await tileLayer(tile, tu, z.tileType);
      for (const part of cmParts(layer, tile, seen)) {
        const ip = interiorPoint(part);
        if (zoneAt(zones, ip) !== z) continue;   // the map draws a building from the unit holding its interior point
        let dist = Infinity;
        if (pointInRing(point, part.outer) && !part.holes.some(h => pointInRing(point, h))) dist = 0;
        else for (const [x, y] of part.outer) dist = Math.min(dist, Math.hypot((x - row.lon) * kx, (y - row.lat) * ky));
        if (dist > reach) continue;
        found.push({point: ip.map(v => +v.toFixed(6)), outer: part.outer, holes: part.holes, area_m2: Math.round(part.areaM2),
          height_m: part.height, dist_m: Math.round(dist)});
      }
    }
  }
  found.sort((a, b) => a.dist_m - b.dist_m || b.area_m2 - a.area_m2);
  found.forEach((c, i) => { c.cid = i + 1; });
  return {zone, candidates: found};
}

function venueOf(id) {
  const row = byId.get(id);
  if (!row) fail(`${id} is not in data/venues.json`);
  if (!Number.isFinite(row.lon) || !Number.isFinite(row.lat)) fail(`${id} has no point on the map — leave its row todo`);
  return row;
}

/** North-up SVG of the candidates: pin red, picked buildings blue, every building numbered. */
function svg(row, candidates, picked = new Set(), site = null) {
  const {kx, ky} = metres(row.lat);
  const pts = candidates.flatMap(c => c.outer);
  const xs = pts.map(p => (p[0] - row.lon) * kx), ys = pts.map(p => (p[1] - row.lat) * ky);
  const pad = 30, minX = Math.min(0, ...xs) - pad, maxX = Math.max(0, ...xs) + pad, minY = Math.min(0, ...ys) - pad, maxY = Math.max(0, ...ys) + pad;
  const W = 1200, scale = W / (maxX - minX), H = Math.round((maxY - minY) * scale);
  const P = ([lon, lat]) => [((lon - row.lon) * kx - minX) * scale, (maxY - (lat - row.lat) * ky) * scale];
  const path = ring => ring.map((p, i) => `${i ? 'L' : 'M'}${P(p).map(v => v.toFixed(1)).join(',')}`).join('') + 'Z';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const shapes = candidates.map(c => `<path d="${[c.outer, ...c.holes].map(path).join('')}" fill="${picked.has(c.cid) ? '#5aa9d6' : '#d7dbd8'}" fill-rule="evenodd" stroke="#4a5550" stroke-width="1"/>`).join('');
  const labels = candidates.map(c => { const [x, y] = P(c.point); const fs = c.area_m2 >= 1500 ? 16 : 11; return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${c.cid}</text>`; }).join('');
  const siteRings = site ? site.map(r => `<path d="${path(r)}" fill="none" stroke="#e46a1f" stroke-width="3"/>`).join('') : '';
  const [px, py] = P([row.lon, row.lat]);
  const bar = 100 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 60}" viewBox="0 0 ${W} ${H + 60}"><rect width="100%" height="100%" fill="#fff"/>${shapes}${siteRings}${labels}` +
    `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="8" fill="#d62828" stroke="#fff" stroke-width="2"/>` +
    `<text x="16" y="${H + 26}" font-size="16" font-family="sans-serif">${esc(row.name)} · ${esc(row.id)} · north up · numbered by distance from the pin (red) · CityMETER Building V4</text>` +
    `<line x1="16" y1="${H + 44}" x2="${(16 + bar).toFixed(1)}" y2="${H + 44}" stroke="#111" stroke-width="3"/><text x="${(22 + bar).toFixed(1)}" y="${H + 49}" font-size="13" font-family="sans-serif">100 m</text></svg>`;
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function readRows(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean), out = [];
  const parse = line => { const cells = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch; } cells.push(cur); return cells; };
  const head = parse(lines[0]);
  for (const line of lines.slice(1)) { const cells = parse(line); out.push(Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']))); }
  return out;
}

if (cmd === 'candidates') {
  const row = venueOf(venueArg), reach = Number(opt('reach', '250'));
  if (!(reach > 0 && reach <= MAX_SITE_M)) fail(`--reach must be 1–${MAX_SITE_M} m`);
  const res = await buildingsNear(row, reach);
  if (!res.zone) fail(`${row.id}: ${res.reason} — skip the row as osm_area`);
  const dir = `sites/${row.id}`;
  mkdirSync(dir, {recursive: true});
  writeFileSync(`${dir}/candidates.json`, JSON.stringify({venue_id: row.id, name: row.name, point: [row.lon, row.lat], unit: res.zone.name, reach, read_on: new Date().toISOString().slice(0, 10), candidates: res.candidates}));
  writeFileSync(`${dir}/candidates.csv`, ['cid,dist_m,area_m2,height_m,lon,lat', ...res.candidates.map(c => [c.cid, c.dist_m, c.area_m2, c.height_m, ...c.point].join(','))].join('\n') + '\n');
  writeFileSync(`${dir}/candidates.svg`, svg(row, res.candidates));
  console.log(`${row.id} ${row.name}: ${res.candidates.length} CityMETER buildings within ${reach} m (unit ${res.zone.name}) → ${dir}/candidates.svg`);
  // Other counted venues with their own pin nearby: their buildings are theirs unless the site plan says otherwise.
  const {kx, ky} = metres(row.lat);
  const others = venues.filter(v => v.id !== row.id && v.countable && Number.isFinite(v.lon) && Math.hypot((v.lon - row.lon) * kx, (v.lat - row.lat) * ky) <= reach + 100)
    .map(v => ({v, held: res.candidates.find(c => pointInRing([v.lon, v.lat], c.outer) && !c.holes.some(h => pointInRing([v.lon, v.lat], h)))}));
  for (const {v, held} of others) console.log(`  other venue: ${v.id} ${v.name} (${v.group})${held ? ` — its pin stands in building ${held.cid}` : ''}`);
  for (const c of res.candidates.slice(0, 12)) console.log(`  ${String(c.cid).padStart(3)}  ${String(c.dist_m).padStart(4)} m  ${String(c.area_m2).padStart(7)} m²  ${c.height_m ?? '–'} m  ${c.point.join(',')}`);
} else if (cmd === 'row' || cmd === 'check') {
  const row = venueOf(venueArg), dir = `sites/${row.id}`;
  if (!existsSync(`${dir}/candidates.json`)) fail(`run candidates for ${row.id} first`);
  const cand = JSON.parse(readFileSync(`${dir}/candidates.json`, 'utf8')).candidates;
  const inside = (c, p) => pointInRing(p, c.outer) && !c.holes.some(h => pointInRing(p, h));
  if (cmd === 'check') {
    const pts = opt('points').split(/[;\s]+/).filter(Boolean).map(p => p.split(',').map(Number));
    if (!pts.length || pts.some(p => p.length !== 2 || !p.every(Number.isFinite))) fail('--points must be "lon,lat;lon,lat"');
    let outside = 0;
    const buildings = new Set();
    for (const p of pts) { const held = cand.filter(c => inside(c, p)).map(c => c.cid); if (!held.length) outside++; held.forEach(c => buildings.add(c)); console.log(`${p.join(',')} → ${held.length ? `building ${held.join(' + ')}` : 'OUTSIDE every drawn building'}`); }
    console.log(`${pts.length - outside} of ${pts.length} points stand in a drawn building; ${buildings.size} buildings`);
    process.exit(outside ? 1 : 0);
  }
  const source = opt('source'), evidence = opt('evidence');
  if (!SOURCES.includes(source)) fail(`--source must be one of ${SOURCES.join(' | ')}`);
  if (!/^https:\/\//.test(evidence) || /docs\.google|drive\.google|google\.[a-z.]+\/maps|maps\.app\.goo\.gl/.test(evidence)) fail('--evidence must be a public https page of the site layout (no Google Maps, Drive or Docs link)');
  let picked = new Set(ids(opt('pick'))), siteRings = null;
  if (opt('site')) {
    const g = JSON.parse(readFileSync(opt('site'), 'utf8'));
    const geom = g.type === 'FeatureCollection' ? g.features[0].geometry : g.type === 'Feature' ? g.geometry : g;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    siteRings = polys.map(p => p[0]);
    picked = new Set(cand.filter(c => polys.some(p => pointInRing(c.point, p[0]) && !p.slice(1).some(h => pointInRing(c.point, h)))).map(c => c.cid));
    ids(opt('add')).forEach(i => picked.add(i));
    ids(opt('drop')).forEach(i => picked.delete(i));
  }
  const chosen = cand.filter(c => picked.has(c.cid));
  if (!chosen.length) fail('no building picked (--pick 1,2 or --site site.geojson)');
  const unknown = [...picked].filter(i => !cand.some(c => c.cid === i));
  if (unknown.length) fail(`not a candidate number: ${unknown.join(', ')}`);
  const far = chosen.filter(c => Math.hypot(...[c.point[0] - row.lon, c.point[1] - row.lat].map((d, i) => d * [metres(row.lat).kx, metres(row.lat).ky][i])) > MAX_SITE_M);
  if (far.length) fail(`buildings ${far.map(c => c.cid).join(', ')} are more than ${MAX_SITE_M} m from the venue point`);
  const record = {venue_id: row.id, venue_name: row.name, boundary_status: 'checked', boundary_source: source, boundary_evidence_url: evidence,
    boundary_geojson: siteRings ? JSON.stringify({type: 'MultiPolygon', coordinates: siteRings.map(r => [r.map(p => p.map(v => +v.toFixed(6)))])}) : '',
    buildings_in_boundary: chosen.map(c => c.point.join(',')).join(';'), building_count: chosen.length, main_building_note: opt('main'),
    checked_by: opt('by'), checked_on: new Date().toISOString().slice(0, 10), notes: opt('notes')};
  writeFileSync(`${dir}/row.json`, JSON.stringify(record, null, 1));
  writeFileSync(`${dir}/picked.svg`, svg(row, cand, picked, siteRings));
  const all = readRows('sites/site_rows.csv').filter(r => r.venue_id !== row.id);
  all.push(record);
  writeFileSync('sites/site_rows.csv', [COLUMNS.join(','), ...all.map(r => COLUMNS.map(k => csvCell(r[k])).join(','))].join('\n') + '\n');
  console.log(`${row.id}: ${chosen.length} buildings → sites/site_rows.csv · check ${dir}/picked.svg against the layout`);
} else {
  // rank: a work list of venues whose point has several large buildings around it.
  const groups = new Set(opt('groups', 'mall,community,outlet').split(','));
  const reach = Number(opt('reach', '250')), minArea = Number(opt('min-area', '2000'));
  // The building the map draws for a venue: its checked host geometry (largest piece), else the CityMETER building at its pin.
  const hosts = new Map();
  const ringM2 = (ring, lat) => { const {kx, ky} = metres(lat); let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky; return Math.abs(a) / 2; };
  if (existsSync('data/venue-buildings.geojson')) {
    for (const f of JSON.parse(readFileSync('data/venue-buildings.geojson', 'utf8')).features) {
      const polys = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      for (const v of f.properties?.venue_ids || []) {
        const lat = polys[0]?.[0]?.[0]?.[1] ?? 13.7;
        const area = polys.reduce((sum, p) => sum + ringM2(p[0], lat) - p.slice(1).reduce((h, r) => h + ringM2(r, lat), 0), 0);
        const prev = hosts.get(v);
        if (!prev || area > prev.area) hosts.set(v, {area: Math.round(area), height: Number(f.properties.display_height_m) || null});
      }
    }
  }
  const sizes = new Map();
  if (existsSync('data/details')) for (const file of readdirSync('data/details')) for (const [vid, v] of Object.entries(JSON.parse(readFileSync(`data/details/${file}`, 'utf8')).venues || {})) if (v.size?.legacy?.gfa) sizes.set(vid, {gfa: Math.round(v.size.legacy.gfa), basis: v.size.legacy.basis || ''});
  const list = venues.filter(r => r.countable && r.status === 'supply' && groups.has(r.group) && Number.isFinite(r.lon) && Number.isFinite(r.lat));
  const out = [];
  let done = 0;
  const work = list.slice();
  async function worker() {
    while (work.length) {
      const row = work.shift();
      let res;
      try { res = await buildingsNear(row, reach); } catch (e) { res = {zone: null, reason: `tile_error (${e.message})`}; }
      const large = res.candidates?.filter(c => c.area_m2 >= minArea) || [];
      const pin = res.candidates?.find(c => c.dist_m === 0);
      const host = hosts.get(row.id);
      const drawn = host ? {area: host.area, height: host.height, from: 'host geometry'} : pin ? {area: pin.area_m2, height: Number(pin.height_m) || null, from: 'CityMETER at pin'} : null;
      const size = sizes.get(row.id);
      const floorsNeeded = size && drawn?.area ? size.gfa / drawn.area : null;
      const floorsDrawn = drawn?.height ? drawn.height / 4 : 1;
      out.push({venue_id: row.id, name: row.name, group: row.group, province: row.provinceCode, district: row.districtCode,
        unit: res.zone?.name || '', drawn_from: drawn?.from || '', drawn_m2: drawn?.area || '', drawn_height_m: drawn?.height ?? '',
        gfa_legacy_m2: size?.gfa || '', size_basis: size?.basis || '', floors_needed: floorsNeeded ? +floorsNeeded.toFixed(1) : '',
        gap: floorsNeeded ? +(floorsNeeded / Math.max(1, floorsDrawn)).toFixed(1) : '',
        large_buildings: res.zone ? large.length : '', large_area_m2: res.zone ? large.reduce((sum, c) => sum + c.area_m2, 0) : '',
        hint: [floorsNeeded && floorsNeeded / Math.max(1, floorsDrawn) >= 3 ? 'reported floor area ≥ 3× what the drawn building holds' : '',
          drawn && drawn.area < 1000 ? 'pin on a small building — check the pin' : '', !drawn && res.zone ? 'no building at the pin' : ''].filter(Boolean).join(' · '),
        note: res.zone ? '' : res.reason});
      if (++done % 25 === 0) console.error(`${done}/${list.length}`);
    }
  }
  await Promise.all(Array.from({length: 4}, worker));
  out.sort((a, b) => (Number(b.gfa_legacy_m2) || 0) - (Number(a.gfa_legacy_m2) || 0) || (Number(b.large_buildings) || -1) - (Number(a.large_buildings) || -1) || (Number(b.large_area_m2) || 0) - (Number(a.large_area_m2) || 0));
  mkdirSync('sites', {recursive: true});
  const cols = Object.keys(out[0] || {venue_id: ''});
  writeFileSync('sites/rank.csv', [['rank', ...cols].join(','), ...out.map((r, i) => [i + 1, ...cols.map(k => csvCell(r[k]))].join(','))].join('\n') + '\n');
  console.log(`sites/rank.csv: ${out.length} venues (${[...groups].join(', ')}) · large = CityMETER buildings ≥ ${minArea} m² within ${reach} m of the point`);
}

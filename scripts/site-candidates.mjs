#!/usr/bin/env node
// Research helper for the shopping-centre site tab (multi-building sites, "campus style"; owner 2026-11-05
// “Megabangna มีหลายอาคาร ในที่ดินใหญ่มาก แต่ปัจจุบันแสดงไม่ครบ ควรทำยังไง” → brief the research team). Same method as
// CityMETER · Hotel (scripts/site-candidates.mjs there). Run from the root of a clone of this repo (Node 20+, no
// packages). It reads the buildings with the code the map uses (js/mvt.js, js/building-units.js, js/pin-buildings.js),
// so every point it writes stands inside a building the map draws. It writes nothing in data/ — the research sheet
// stays the record; outputs go to sites/ (git-ignored).
//
//   node scripts/site-candidates.mjs candidates <venue_id> [--reach 250]
//       → sites/<venue_id>/candidates.json · candidates.csv · candidates.png and .svg (numbered buildings, north up, pin red)
//   node scripts/site-candidates.mjs row <venue_id> (--pick 1,2,5 | --site site.geojson [--add 3,7] [--drop 12])
//       [--osm-point "lon,lat;lon,lat"]
//       --source site_layout|dol_parcels+site_layout|osm_outline|osm_outline+site_layout --evidence <https page of the layout
//       or of the OpenStreetMap outline> [--main "…"] [--notes "…"] [--by "…"]
//       → sites/<venue_id>/row.json · picked.png and .svg and the row in sites/site_rows.csv (one row per venue_id)
//       --osm-point: a building of the site that CityMETER does not have. The map then draws its OpenStreetMap outline
//       (js/pin-buildings.js matchInUnit), so the point must stand in no CityMETER building and in an OpenStreetMap one
//       (read from the map's OpenFreeMap tiles, scripts/site-osm.mjs); the row's notes name it.
//   node scripts/site-candidates.mjs draft <venue_id> (--drafts <CSV of the SITE_DRAFTS tab> | --osm way/<id> | --outline <file.geojson>)
//       → sites/<venue_id>/draft.png and .svg (drafted buildings blue, the OpenStreetMap outline orange), draft.json,
//         draft-site.geojson and candidates.json, and the `row` command that accepts the draft once it is reviewed.
//       A draft is every CityMETER building whose interior point stands in the OpenStreetMap area that holds the pin
//       (landuse=retail, a shop=mall area or amenity=marketplace; scripts/site-draft.mjs; owner 2026-11-05 20:38). It
//       also lists the buildings the outline cuts, OpenStreetMap buildings CityMETER does not have (for --osm-point) and
//       other counted venues whose pin is in the outline. --osm reads the outline from Overpass (overpass-api.de).
//   node scripts/site-candidates.mjs check <venue_id> --points "lon,lat;lon,lat" [--osm "lon,lat"]
//       → which drawn building holds each point (a sheet row's buildings_in_boundary); exits 1 if one is outside.
//       Points of the row's --osm-point go in --osm as well.
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
import {sitePng, siteSvg} from './site-picture.mjs';
import {createOsmReader} from './site-osm.mjs';
import {outlinePolys, polysFromOverpass, polysGeoJson, outlineStats, otherPinsIn, draftReach, draftPick, edgeHints, osmOnly, boxMeets} from './site-draft.mjs';

const MAX_SITE_M = 600;   // scripts/build-venue-sites.py and js/app.js SITE_MAX_M
const SOURCES = ['dol_parcels+site_layout', 'site_layout', 'dol_parcels', 'osm_outline', 'osm_outline+site_layout'];
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const COLUMNS = ['venue_id', 'venue_name', 'boundary_status', 'boundary_source', 'boundary_evidence_url', 'boundary_geojson', 'buildings_in_boundary',
  'building_count', 'main_building_note', 'checked_by', 'checked_on', 'notes'];
const UA = {'User-Agent': 'citymeter-shoppingcenter-research/0.1'};
const [cmd, venueArg] = process.argv.slice(2);
const argv = process.argv.slice(cmd === 'rank' ? 3 : 4);
const opt = (k, d = '') => { const i = argv.indexOf(`--${k}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const ids = s => (s ? s.split(',').map(x => Number(x.trim())).filter(Number.isInteger) : []);
const fail = msg => { console.error(`STOP: ${msg}`); process.exit(1); };
if (!['candidates', 'row', 'check', 'draft', 'rank'].includes(cmd) || (cmd !== 'rank' && !venueArg)) fail('usage: node scripts/site-candidates.mjs candidates|draft|row|check <venue_id> [options] · rank [options]');
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

/** The pictures of one venue: PNG for any image viewer, SVG for a browser (scripts/site-picture.mjs). */
function pictures(base, row, candidates, picked = new Set(), site = null, marks = []) {
  writeFileSync(`${base}.png`, sitePng(row, candidates, picked, site, marks));
  writeFileSync(`${base}.svg`, siteSvg(row, candidates, picked, site, marks));
}

const osmBuildingAt = createOsmReader({headers: UA});
const pointList = (s, flag) => {
  const pts = (s || '').split(/[;\s]+/).filter(Boolean).map(p => p.split(',').map(Number));
  if (pts.some(p => p.length !== 2 || !p.every(Number.isFinite))) fail(`${flag} must be "lon,lat;lon,lat"`);
  return pts.map(p => p.map(v => +v.toFixed(6)));
};
/** A site building CityMETER does not have: no CityMETER building holds the point and an OpenStreetMap building does. */
async function osmPoint(row, p) {
  const {kx, ky} = metres(row.lat);
  const d = Math.hypot((p[0] - row.lon) * kx, (p[1] - row.lat) * ky);
  if (d > MAX_SITE_M) fail(`${p.join(',')} is ${Math.round(d)} m from the venue point (more than ${MAX_SITE_M} m)`);
  const near = await buildingsNear({...row, lon: p[0], lat: p[1]}, 40);
  const held = near.zone ? near.candidates.find(c => c.dist_m === 0) : null;
  if (held) fail(`${p.join(',')}: CityMETER has a building here (${held.area_m2} m²) — pick its number from candidates, not --osm-point`);
  let osm;
  try { osm = await osmBuildingAt(p); } catch (e) { fail(`${p.join(',')}: could not read the OpenStreetMap buildings (${e.message})`); }
  if (!osm) fail(`${p.join(',')}: no OpenStreetMap building here either — the map would draw nothing`);
  return {point: p, area_m2: osm.areaM2, dist_m: Math.round(d)};
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function readRows(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean), out = [];
  const parse = line => { const cells = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch; } cells.push(cur); return cells; };
  const head = parse(lines[0]);
  for (const line of lines.slice(1)) { const cells = parse(line); out.push(Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']))); }
  return out;
}

/** sites/<venue_id>/candidates.json and .csv: the numbered buildings `row` and `check` read. */
function writeCandidates(row, res, reach) {
  const dir = `sites/${row.id}`;
  mkdirSync(dir, {recursive: true});
  writeFileSync(`${dir}/candidates.json`, JSON.stringify({venue_id: row.id, name: row.name, point: [row.lon, row.lat], unit: res.zone.name, reach, read_on: new Date().toISOString().slice(0, 10), candidates: res.candidates}));
  writeFileSync(`${dir}/candidates.csv`, ['cid,dist_m,area_m2,height_m,lon,lat', ...res.candidates.map(c => [c.cid, c.dist_m, c.area_m2, c.height_m, ...c.point].join(','))].join('\n') + '\n');
  return dir;
}

/** The polygons of one OpenStreetMap way or relation, read from Overpass with `out geom`. */
async function overpassOutline(type, id) {
  const q = `[out:json][timeout:60];${type === 'way' ? 'way' : 'rel'}(${id});out tags geom;`;
  let res;
  try {
    res = await fetch(OVERPASS_URL, {method: 'POST', headers: {...UA, 'Content-Type': 'application/x-www-form-urlencoded'}, body: `data=${encodeURIComponent(q)}`});
  } catch (e) { fail(`could not reach Overpass (${e.message}) — try again later, or give --outline <file.geojson>`); }
  if (!res.ok) fail(`Overpass answered HTTP ${res.status} — try again in a minute`);
  const e = (await res.json()).elements?.find(x => x.type === type && String(x.id) === String(id));
  if (!e) fail(`${type}/${id} is not in OpenStreetMap (deleted, or a typo)`);
  const polys = polysFromOverpass(e);
  if (!polys) fail(`${type}/${id} is not a closed area`);
  return {polys, tags: e.tags || {}};
}

if (cmd === 'candidates') {
  const row = venueOf(venueArg), reach = Number(opt('reach', '250'));
  if (!(reach > 0 && reach <= MAX_SITE_M)) fail(`--reach must be 1–${MAX_SITE_M} m`);
  const res = await buildingsNear(row, reach);
  if (!res.zone) fail(`${row.id}: ${res.reason} — skip the row as osm_area`);
  const dir = writeCandidates(row, res, reach);
  pictures(`${dir}/candidates`, row, res.candidates);
  console.log(`${row.id} ${row.name}: ${res.candidates.length} CityMETER buildings within ${reach} m (unit ${res.zone.name}) → ${dir}/candidates.png (also .svg)`);
  // Other counted venues with their own pin nearby: their buildings are theirs unless the site plan says otherwise.
  const {kx, ky} = metres(row.lat);
  const others = venues.filter(v => v.id !== row.id && v.countable && Number.isFinite(v.lon) && Math.hypot((v.lon - row.lon) * kx, (v.lat - row.lat) * ky) <= reach + 100)
    .map(v => ({v, held: res.candidates.find(c => pointInRing([v.lon, v.lat], c.outer) && !c.holes.some(h => pointInRing([v.lon, v.lat], h)))}));
  for (const {v, held} of others) console.log(`  other venue: ${v.id} ${v.name} (${v.group})${held ? ` — its pin stands in building ${held.cid}` : ''}`);
  for (const c of res.candidates.slice(0, 12)) console.log(`  ${String(c.cid).padStart(3)}  ${String(c.dist_m).padStart(4)} m  ${String(c.area_m2).padStart(7)} m²  ${c.height_m ?? '–'} m  ${c.point.join(',')}`);
} else if (cmd === 'draft') {
  const row = venueOf(venueArg), today = new Date().toISOString().slice(0, 10);
  let polys, osmRef = '', tags = {}, sheet = null;
  if (opt('drafts')) {
    sheet = readRows(opt('drafts')).find(r => (r.venue_id || '').trim() === row.id);
    if (!sheet) fail(`${row.id} is not in ${opt('drafts')}`);
    if (!sheet.outline_geojson) fail(`${row.id}: no draft (${sheet.draft_class || 'no class'}${sheet.draft_note ? `: ${sheet.draft_note}` : ''}) — do this site by hand (brief §4), or give --osm way/<id> of an outline you checked`);
    polys = outlinePolys(JSON.parse(sheet.outline_geojson));
    osmRef = (sheet.osm_outline || '').trim();
  } else if (opt('osm')) {
    const m = /^(way|relation)\/(\d+)$/.exec(opt('osm'));
    if (!m) fail('--osm must be way/<id> or relation/<id> (the part after openstreetmap.org/)');
    ({polys, tags} = await overpassOutline(m[1], m[2]));
    osmRef = opt('osm');
  } else if (opt('outline')) {
    polys = outlinePolys(JSON.parse(readFileSync(opt('outline'), 'utf8')));
  } else fail('draft needs --drafts <CSV of the SITE_DRAFTS tab>, --osm way/<id> or --outline <file.geojson>');
  if (!polys.length) fail(`${row.id}: the outline holds no polygon`);
  const stats = outlineStats(row, polys);
  if (stats.maxDistM > MAX_SITE_M) fail(`${row.id}: the outline reaches ${stats.maxDistM} m from the venue point (more than ${MAX_SITE_M} m) — do this site by hand`);
  const reach = draftReach(stats.maxDistM);
  const res = await buildingsNear(row, reach);
  if (!res.zone) fail(`${row.id}: ${res.reason} — skip the row as osm_area`);
  const dir = writeCandidates(row, res, reach);
  pictures(`${dir}/candidates`, row, res.candidates);   // the same numbers as draft.png (an older candidates picture would not match)
  const picked = draftPick(res.candidates, polys);
  const hints = edgeHints(res.candidates, picked, polys);
  const others = otherPinsIn(row, polys, venues);
  let osm = null, osmNote = '';
  try { osm = osmOnly(await osmBuildingAt.partsIn(stats.bbox), res.candidates, polys); } catch (e) { osmNote = `could not read the OpenStreetMap buildings (${e.message})`; }
  const {kx, ky} = metres(row.lat), pad = 40;
  const [w, s, e, n] = stats.bbox, box = [w - pad / kx, s - pad / ky, e + pad / kx, n + pad / ky];
  const inView = res.candidates.filter(c => boxMeets(c.outer, box));
  pictures(`${dir}/draft`, row, inView, picked, polys.flat(), (osm || []).map(o => o.point));
  writeFileSync(`${dir}/draft-site.geojson`, JSON.stringify(polysGeoJson(polys, {venue_id: row.id, osm: osmRef, source: 'OpenStreetMap contributors (ODbL)', drafted_on: today})));
  const points = res.candidates.filter(c => picked.has(c.cid)).map(c => c.point);
  const draft = {venue_id: row.id, name: row.name, osm: osmRef, tags, unit: res.zone.name, reach, pin_m: stats.pinM, max_dist_m: stats.maxDistM,
    outline_m2: stats.areaM2, building_count: points.length, points, cids: [...picked].sort((a, b) => a - b), mostly_outside: hints.mostlyOutside,
    mostly_inside: hints.mostlyInside, osm_only: osm, other_venues: others.map(v => ({id: v.id, name: v.name, group: v.group})), drafted_on: today};
  writeFileSync(`${dir}/draft.json`, JSON.stringify(draft, null, 1));
  console.log(`${row.id} ${row.name}: draft of ${points.length} CityMETER buildings in ${osmRef || 'the outline'} (${stats.areaM2.toLocaleString('en')} m², farthest vertex ${stats.maxDistM} m${stats.pinM ? `, the pin ${stats.pinM} m outside it` : ''}) → ${dir}/draft.png (also .svg)`);
  if (sheet) {
    const was = pointList(sheet.draft_points, 'draft_points');
    const same = (a, b) => Math.abs(a[0] - b[0]) < 2e-6 && Math.abs(a[1] - b[1]) < 2e-6;
    const gone = was.filter(p => !points.some(q => same(p, q))).length, added = points.filter(p => !was.some(q => same(p, q))).length;
    console.log(gone || added ? `  CityMETER buildings changed since the sheet's draft: ${added} new, ${gone} gone — review the picture as usual` : `  same ${points.length} buildings as the draft in the sheet`);
  }
  if (hints.mostlyOutside.length) console.log(`  check: drafted but mostly outside the outline: ${hints.mostlyOutside.join(', ')}`);
  if (hints.mostlyInside.length) console.log(`  check: not drafted but mostly inside the outline: ${hints.mostlyInside.join(', ')}`);
  if (others.length) console.log(`  other counted venues have their pin in this outline (their buildings are theirs — --drop them): ${others.map(v => `${v.id} ${v.name} (${v.group})`).join(' · ')}`);
  if (osm?.length) console.log(`  OpenStreetMap buildings CityMETER does not have (add with --osm-point only if they belong to the centre): ${osm.map(o => `${o.point.join(',')} ≈${o.area_m2} m²`).join('; ')}`);
  if (osmNote) console.log(`  ${osmNote} — run draft again online to see OpenStreetMap buildings CityMETER does not have`);
  const evidence = osmRef ? `https://www.openstreetmap.org/${osmRef}` : '<https page of the layout>';
  console.log(`  accept after review: node scripts/site-candidates.mjs row ${row.id} --site ${dir}/draft-site.geojson --source osm_outline --evidence ${evidence} --main "…" --by "…"   [--add n,n] [--drop n,n] [--osm-point "lon,lat"]`);
} else if (cmd === 'row' || cmd === 'check') {
  const row = venueOf(venueArg), dir = `sites/${row.id}`;
  if (!existsSync(`${dir}/candidates.json`)) fail(`run candidates for ${row.id} first`);
  const cand = JSON.parse(readFileSync(`${dir}/candidates.json`, 'utf8')).candidates;
  const inside = (c, p) => pointInRing(p, c.outer) && !c.holes.some(h => pointInRing(p, h));
  if (cmd === 'check') {
    const pts = pointList(opt('points'), '--points'), osmPts = pointList(opt('osm'), '--osm');
    if (!pts.length) fail('--points must be "lon,lat;lon,lat"');
    const same = (a, b) => Math.abs(a[0] - b[0]) < 2e-6 && Math.abs(a[1] - b[1]) < 2e-6;
    let outside = 0, fromOsm = 0;
    const buildings = new Set();
    for (const p of pts) {
      const held = cand.filter(c => inside(c, p)).map(c => c.cid);
      held.forEach(c => buildings.add(c));
      if (held.length) { console.log(`${p.join(',')} → building ${held.join(' + ')}`); continue; }
      if (osmPts.some(q => same(p, q))) { const o = await osmPoint(row, p); fromOsm++; console.log(`${p.join(',')} → OpenStreetMap building ≈${o.area_m2} m² (CityMETER has none here)`); continue; }
      outside++;
      console.log(`${p.join(',')} → OUTSIDE every drawn building`);
    }
    console.log(`${pts.length - outside} of ${pts.length} points stand in a drawn building; ${buildings.size + fromOsm} buildings${fromOsm ? ` (${fromOsm} from OpenStreetMap)` : ''}`);
    process.exit(outside ? 1 : 0);
  }
  const source = opt('source'), evidence = opt('evidence');
  if (!SOURCES.includes(source)) fail(`--source must be one of ${SOURCES.join(' | ')}`);
  if (!/^https:\/\//.test(evidence) || /docs\.google|drive\.google|google\.[a-z.]+\/maps|maps\.app\.goo\.gl/.test(evidence)) fail('--evidence must be a public https page of the site layout (no Google Maps, Drive or Docs link)');
  let picked = new Set(ids(opt('pick'))), siteRings = null, sitePolys = null;
  if (opt('site')) {
    sitePolys = outlinePolys(JSON.parse(readFileSync(opt('site'), 'utf8')));
    if (!sitePolys.length) fail(`${opt('site')} holds no polygon`);
    siteRings = sitePolys.flat();
    picked = draftPick(cand, sitePolys);   // interior point in the site: the rule of `draft` as well
    ids(opt('add')).forEach(i => picked.add(i));
    ids(opt('drop')).forEach(i => picked.delete(i));
  }
  const chosen = cand.filter(c => picked.has(c.cid));
  const osm = [];
  for (const p of pointList(opt('osm-point'), '--osm-point')) if (!osm.some(o => o.point.join() === p.join())) osm.push(await osmPoint(row, p));
  if (!chosen.length && !osm.length) fail('no building picked (--pick 1,2 or --site site.geojson)');
  const unknown = [...picked].filter(i => !cand.some(c => c.cid === i));
  if (unknown.length) fail(`not a candidate number: ${unknown.join(', ')}`);
  const far = chosen.filter(c => Math.hypot(...[c.point[0] - row.lon, c.point[1] - row.lat].map((d, i) => d * [metres(row.lat).kx, metres(row.lat).ky][i])) > MAX_SITE_M);
  if (far.length) fail(`buildings ${far.map(c => c.cid).join(', ')} are more than ${MAX_SITE_M} m from the venue point`);
  const record = {venue_id: row.id, venue_name: row.name, boundary_status: 'checked', boundary_source: source, boundary_evidence_url: evidence,
    boundary_geojson: sitePolys ? JSON.stringify({type: 'MultiPolygon', coordinates: sitePolys}) : '',
    buildings_in_boundary: [...chosen.map(c => c.point.join(',')), ...osm.map(o => o.point.join(','))].join(';'), building_count: chosen.length + osm.length,
    main_building_note: opt('main'), checked_by: opt('by'), checked_on: new Date().toISOString().slice(0, 10),
    notes: [opt('notes'), osm.length ? `OpenStreetMap outline (CityMETER has no building): ${osm.map(o => `${o.point.join(',')} ≈${o.area_m2} m²`).join('; ')}` : ''].filter(Boolean).join(' · ')};
  writeFileSync(`${dir}/row.json`, JSON.stringify(record, null, 1));
  pictures(`${dir}/picked`, row, cand, picked, siteRings, osm.map(o => o.point));
  const all = readRows('sites/site_rows.csv').filter(r => r.venue_id !== row.id);
  all.push(record);
  writeFileSync('sites/site_rows.csv', [COLUMNS.join(','), ...all.map(r => COLUMNS.map(k => csvCell(r[k])).join(','))].join('\n') + '\n');
  console.log(`${row.id}: ${chosen.length + osm.length} buildings${osm.length ? ` (${osm.length} from OpenStreetMap)` : ''} → sites/site_rows.csv · check ${dir}/picked.png (also .svg) against the layout`);
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

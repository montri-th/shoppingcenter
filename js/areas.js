/**
 * Areas = official districts (เขต/อำเภอ) and provinces.
 *
 * Membership is precomputed by scripts/build-data.py: point-in-polygon of each located
 * venue's reference point against the full-resolution OpenGISData-Thailand boundaries
 * (DOPA-credited, CC BY 4.0), with district ids = CityMETER production district codes.
 * The simplified geometry in data/districts.geojson is display-only, so a dot drawn near
 * a boundary keeps the area it was assigned to. Nothing is ever assigned by name.
 *
 * Density = countable venues ÷ district area (ตร.กม., `areaKm2` of the same boundary source).
 */
import {hasPoint, districtWord, provinceByCode} from './model.js';

/** Index of district features: code → {code, province, th, en, areaKm2, feature}. */
export function indexDistricts(geojson) {
  const map = new Map();
  for (const f of geojson?.features || []) {
    const p = f.properties || {};
    if (!p.code || !(p.areaKm2 > 0)) continue;
    map.set(p.code, {code: p.code, province: p.province, th: p.th, en: p.en, areaKm2: p.areaKm2, feature: f});
  }
  return map;
}

export function districtLabel(d) {
  if (!d) return '';
  return `${districtWord(d.province)}${d.th}`;
}

/** Province area as the sum of its districts (same boundary source as the densities). */
export function provinceArea(districts, provinceCode) {
  let a = 0;
  for (const d of districts.values()) if (d.province === provinceCode) a += d.areaKm2;
  return a;
}

/**
 * Per-district summary of `rows` for the districts in `scope` (an iterable of district
 * records). Every scoped district is returned, with measured zeros, so the map and the
 * charts can show EVID-05 `measured_zero` instead of hiding them.
 */
export function summarizeDistricts(rows, scope) {
  const counts = new Map();
  for (const r of rows) {
    if (!hasPoint(r) || !r.districtCode) continue;
    const e = counts.get(r.districtCode) || {count: 0, groups: new Map(), rows: []};
    e.count++;
    e.groups.set(r.group, (e.groups.get(r.group) || 0) + 1);
    e.rows.push(r);
    counts.set(r.districtCode, e);
  }
  const out = [];
  for (const d of scope) {
    const e = counts.get(d.code);
    const count = e ? e.count : 0;
    out.push({...d, id: d.code, name: d.th, label: districtLabel(d), count, density: count / d.areaKm2,
      groups: e ? Object.fromEntries(e.groups) : {}, rows: e ? e.rows : []});
  }
  return out;
}

/** Per-province counts of located rows. */
export function summarizeProvinces(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (!hasPoint(r) || !r.provinceCode) continue;
    counts.set(r.provinceCode, (counts.get(r.provinceCode) || 0) + 1);
  }
  return counts;
}

/** Districts a reading scope covers: one province, or every district when the country is read. */
export function districtsInScope(districts, provinceCode = '') {
  const all = [...districts.values()];
  return provinceCode ? all.filter(d => d.province === provinceCode) : all;
}

export const provinceName = code => provinceByCode(code)?.th || code || '';

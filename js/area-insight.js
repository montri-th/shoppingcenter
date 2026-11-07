/**
 * First Aha (owner decision D1, 2026-10-25): the three districts with the most venues per
 * square kilometre in the province of the densest district — or in the province the user
 * reads. Default snapshot: ปทุมวัน · บางรัก · ราชเทวี, 32 of Bangkok's 181 venues on 1.2%
 * of its area. Those figures are regression fixtures (data/venues.json meta.checks.aha),
 * never UI constants: everything is recomputed from the rows passed in.
 *
 * Numerator   = located countable venues in the three districts (disjoint by construction).
 * Denominator = located countable venues in the province (rows without a selected point or
 *               outside every boundary cannot acquire an area and are left out of both).
 * Area share  = area of the three districts ÷ province area (sum of its districts, same
 *               boundary source). Ranking: density, then count, then district code.
 * Rows must already be filtered (status, group, operator, search) — this module never filters.
 *
 * D33 (owner 2026-11-07 11:56, option ข): the first view reads shopping centres, community malls and outlets
 * (model.js GROUP_SETS.centres) and ranks districts by count — the districts with the most of them in the province of
 * the district with the most — as the CityMETER Hotel/Hospital/School demos do. `rank: 'density'` keeps D1.
 * `near` (row → boolean, e.g. within 500 m of an operating rail station) adds the share of the three districts' venues
 * that pass it, against the rest of the province (same denominators: located venues of the scope).
 */
import {summarizeDistricts, districtsInScope, provinceArea} from './areas.js';

export const AHA_SIZE = 3;

const byDensity = (a, b) => b.density - a.density || b.count - a.count || String(a.code).localeCompare(String(b.code));
const byCount = (a, b) => b.count - a.count || b.density - a.density || String(a.code).localeCompare(String(b.code));

/**
 * @param rows       filtered rows (scopeRows)
 * @param districts  Map from indexDistricts()
 * @param province   production province code to read, or '' to start from the top district
 * @param rank       'density' (D1) or 'count' (D33)
 * @param near       optional row predicate for the rail line (D33)
 */
export function summarizeAreaInsight(rows = [], districts, {province = '', rank = 'density', near = null} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const order = rank === 'count' ? byCount : byDensity;
  const empty = {province: province || '', rank, districts: [], districtIds: [], count: 0, total: 0, share: 0, areaKm2: 0, provinceAreaKm2: 0, areaShare: 0, rail: null};
  if (!districts?.size) return empty;
  let code = province;
  if (!code) {
    const nationwide = summarizeDistricts(list, districtsInScope(districts)).filter(d => d.count > 0).sort(order);
    if (!nationwide.length) return empty;
    code = nationwide[0].province;
  }
  const inProvince = summarizeDistricts(list, districtsInScope(districts, code));
  const ranked = inProvince.filter(d => d.count > 0).sort(order).slice(0, AHA_SIZE);
  const total = inProvince.reduce((s, d) => s + d.count, 0);
  const count = ranked.reduce((s, d) => s + d.count, 0);
  const areaKm2 = ranked.reduce((s, d) => s + d.areaKm2, 0);
  const provinceAreaKm2 = provinceArea(districts, code);
  let rail = null;
  if (typeof near === 'function') {
    const ids = new Set(ranked.map(d => d.code)), provinceIds = new Set(inProvince.map(d => d.code));
    const located = list.filter(r => r.districtCode && provinceIds.has(r.districtCode));
    const focus = located.filter(r => ids.has(r.districtCode)), rest = located.filter(r => !ids.has(r.districtCode));
    rail = {focus: {near: focus.filter(near).length, total: focus.length}, rest: {near: rest.filter(near).length, total: rest.length}};
  }
  return {
    province: code,
    rank,
    rail,
    districts: ranked,
    districtIds: ranked.map(d => d.code),
    count, total,
    share: total ? (count / total) * 100 : 0,
    areaKm2, provinceAreaKm2,
    areaShare: provinceAreaKm2 ? (areaKm2 / provinceAreaKm2) * 100 : 0,
    // Secondary finding: the district with the most venues in the whole filtered scope.
    topCount: summarizeDistricts(list, districtsInScope(districts)).sort((a, b) => b.count - a.count || byDensity(a, b))[0] || null,
  };
}

/** Rows of `rows` that lie in the given district ids (focus filter). Original references, original order. */
export function filterDistrictRows(rows, idSet) {
  if (!(idSet instanceof Set) || !idSet.size) return [];
  return (Array.isArray(rows) ? rows : []).filter(r => r.districtCode && idSet.has(r.districtCode));
}

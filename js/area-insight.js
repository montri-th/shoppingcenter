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
 */
import {summarizeDistricts, districtsInScope, provinceArea} from './areas.js';

export const AHA_SIZE = 3;

const byDensity = (a, b) => b.density - a.density || b.count - a.count || String(a.code).localeCompare(String(b.code));

/**
 * @param rows       filtered rows (scopeRows)
 * @param districts  Map from indexDistricts()
 * @param province   production province code to read, or '' to start from the densest district
 */
export function summarizeAreaInsight(rows = [], districts, {province = ''} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const empty = {province: province || '', districts: [], districtIds: [], count: 0, total: 0, share: 0, areaKm2: 0, provinceAreaKm2: 0, areaShare: 0};
  if (!districts?.size) return empty;
  let code = province;
  if (!code) {
    const nationwide = summarizeDistricts(list, districtsInScope(districts)).filter(d => d.count > 0).sort(byDensity);
    if (!nationwide.length) return empty;
    code = nationwide[0].province;
  }
  const inProvince = summarizeDistricts(list, districtsInScope(districts, code));
  const ranked = inProvince.filter(d => d.count > 0).sort(byDensity).slice(0, AHA_SIZE);
  const total = inProvince.reduce((s, d) => s + d.count, 0);
  const count = ranked.reduce((s, d) => s + d.count, 0);
  const areaKm2 = ranked.reduce((s, d) => s + d.areaKm2, 0);
  const provinceAreaKm2 = provinceArea(districts, code);
  return {
    province: code,
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

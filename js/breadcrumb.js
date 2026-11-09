/**
 * Breadcrumb — ประเทศไทย › จังหวัด › เขต/อำเภอ › สถานที่ — the CityMETER production hierarchy, through the shared shell
 * (js/shell/breadcrumb.js, citymeter-shell 0.4.3). Production (landometer.com/v3/citymeter) drills country → province →
 * district with the ids served by /api/v2/citymeter-v3/base/info/lv0 (province `abbrEn`, e.g. BKK) and
 * /info/lv1/{provinceId} (district `code`, e.g. 1007); every administrative crumb carries its production deep link with
 * `?d=shoppingCenter`, and the address names the same path (`at=BKK/D/1007`).
 * The district crumb comes from the venue's precomputed point-in-polygon membership (never from the address text); a
 * venue without a selected point shows its address province only. The venue (or the pending record, or the station)
 * is the last level, with no production link; a brand page is the country and the brand (a network crumb). With four
 * crumbs on narrow screens the upper levels fold behind “…”.
 */
import {provinceByCode, districtWord} from './model.js';
import {buildBreadcrumb as shellBreadcrumb, renderBreadcrumb, breadcrumbText} from './shell/breadcrumb.js';

/** Production dataset code (`?d=`). */
export const DATASET = 'shoppingCenter';
const shellProvince = code => { const p = provinceByCode(code); return p ? {code: p.code, th: p.th} : null; };

/**
 * Pure model. province: production code or ''; district: {code, th, province} or null; venue: {id, label} or null (a
 * venue, a pending record or a station); brand: {id, label} or null.
 */
export function buildBreadcrumb({province = '', district = null, venue = null, brand = null} = {}) {
  const code = district?.province || province || '';
  return shellBreadcrumb({
    province: code,
    area: district ? {id: district.code, name: district.th, province: code} : null,
    network: brand ? {id: brand.id, name: brand.label} : null,
    site: venue?.label ? {id: venue.id || '', name: venue.label, province: code} : null,
  }, {dataset: DATASET, provinceByCode: shellProvince, areaWord: districtWord});
}

export {renderBreadcrumb, breadcrumbText};

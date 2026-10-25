/**
 * Breadcrumb — ประเทศไทย › จังหวัด › เขต/อำเภอ › สถานที่ — aligned with CityMETER production.
 *
 * Production (landometer.com/v3/citymeter) drills country → province → district with the
 * ids served by /api/v2/citymeter-v3/base/info/lv0 (province `abbrEn`, e.g. BKK) and
 * /info/lv1/{provinceId} (district `code`, e.g. 1007). This demo uses the same codes and
 * serialises the levels as query parameters for static hosting:
 *   ?province=BKK&district=1007&venue=<venue_id>
 * The district crumb comes from the venue's precomputed point-in-polygon membership (never
 * from the address text); a venue without a selected point shows its address province only.
 * The venue is the last level; with four crumbs on narrow screens the upper levels fold
 * behind “…”.
 */
import {provinceByCode, districtWord} from './model.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/**
 * Pure model. province: production code or ''; district: {code, th, province} or null;
 * venue: {id, label} or null.
 */
export function buildBreadcrumb({province = '', district = null, venue = null} = {}) {
  const crumbs = [{level: 'country', label: 'ประเทศไทย', action: 'crumb-country'}];
  const p = provinceByCode(district?.province || province);
  if (p) crumbs.push({level: 'province', label: p.th, code: p.code, action: 'crumb-province'});
  if (district) crumbs.push({level: 'district', label: `${districtWord(district.province)}${district.th}`, id: district.code, action: 'crumb-district'});
  if (venue?.label) crumbs.push({level: 'venue', label: venue.label, id: venue.id, action: 'crumb-venue'});
  crumbs[crumbs.length - 1].current = true;
  return crumbs;
}

export function renderBreadcrumb(crumbs) {
  const collapsible = crumbs.length >= 4;
  const items = crumbs.map((c, i) => {
    const fold = collapsible && i < crumbs.length - 2;
    const inner = c.current
      ? `<span class="crumb is-current" aria-current="location">${esc(c.label)}</span>`
      : `<button type="button" class="crumb" data-action="${esc(c.action)}" data-id="${esc(c.id || c.code || '')}">${esc(c.label)}</button>`;
    return `<li${fold ? ' class="is-collapsible"' : ''}>${inner}</li>`;
  });
  if (collapsible) items.splice(crumbs.length - 2, 0, '<li class="crumb-ellipsis"><button type="button" class="crumb crumb-more" data-action="crumb-expand" aria-expanded="false" aria-label="แสดงระดับบน">…</button></li>');
  return `<ol class="crumbs${collapsible ? ' is-collapsible' : ''}">${items.join('')}</ol>`;
}

/** Compact text form for the mobile map card and the document title. */
export const breadcrumbText = crumbs => crumbs.map(c => c.label).join(' › ');

/**
 * Venue logos — identity support for the venue panel, lists and map pins.
 * Registry: data/venue-logos.json, built by scripts/build-venue-logos.py from the research
 * sheet tab 10_VENUE_LOGOS and the logo files verified byte-for-byte against its sha256.
 *
 * Rules: the venue name stays the record of identity; a logo never changes a row, a name,
 * a coordinate or a status. Lookup goes by venue_id only — nothing is fuzzy-matched.
 * Parent-complex and shared chain/department-store marks keep their role label.
 * Collecting the files is not a trademark licence.
 */
const FILE_PATTERN = /^assets\/venue-logos\/[A-Za-z0-9._-]+\.(svg|png|jpe?g|webp)$/;
const MIME_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']);
export const ROLE_LABELS = Object.freeze({
  venue_specific: '', parent_complex: 'โลโก้โครงการแม่', shared_department_store_banner: 'โลโก้ห้างสรรพสินค้าในเครือ', shared_chain_banner: 'โลโก้เครือ',
});
let assets = new Map(), byVenue = new Map(), meta = {}, configured = false;

function approvedAsset(item) {
  // Keys are the sheet's logo_key (VL-…, BVL-… or a named key): an identifier only, never markup or a path.
  if (!item || typeof item !== 'object' || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(item.key || '') || !FILE_PATTERN.test(item.file || '')) return null;
  const width = Number(item.width), height = Number(item.height);
  if (!MIME_TYPES.has(item.mime) || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !(width > 0) || !(height > 0)) return null;
  return Object.freeze({key: item.key, file: item.file, mime: item.mime, width, height, sha256: item.sha256,
    background: /^#[0-9A-Fa-f]{6}$/.test(item.background || '') ? item.background : '#E5E9E6',
    sourcePage: typeof item.sourcePage === 'string' ? item.sourcePage : ''});
}

/** Load the registry; returns coverage and rejected records (never throws on a bad catalog). */
export function configureVenueLogos(catalog) {
  assets = new Map(); byVenue = new Map(); meta = {};
  const issues = [];
  if (!Array.isArray(catalog?.assets)) issues.push({reason: 'invalid_catalog'});
  for (const item of catalog?.assets || []) { const a = approvedAsset(item); if (a) assets.set(a.key, a); else issues.push({reason: 'invalid_asset', key: item?.key}); }
  for (const v of catalog?.venues || []) {
    if (typeof v?.id === 'string' && v.id && assets.has(v.key) && !byVenue.has(v.id)) byVenue.set(v.id, {key: v.key, role: v.role || 'venue_specific'});
  }
  meta = catalog?.meta && typeof catalog.meta === 'object' ? catalog.meta : {};
  configured = true;
  return {assets: assets.size, venues: byVenue.size, issues, complete: issues.length === 0 && !(meta.pending || []).length};
}

/** The logo for a venue id, or null. */
export function getVenueLogo(id, name = '') {
  if (!configured || !id) return null;
  const link = byVenue.get(id);
  const asset = link && assets.get(link.key);
  return asset ? {...asset, role: link.role, roleLabel: ROLE_LABELS[link.role] ?? '', alt: `โลโก้ ${name}`.trim()} : null;
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/**
 * Markup: a backplate box with the image (decorative unless `decorative: false`).
 * size sm (list rows, 28 px) | md (facts, 36 px) | lg (venue heading, 56 px) | pin (map label).
 */
export function venueLogoMarkup(id, {name = '', className = '', size = 'sm', decorative = true} = {}) {
  const logo = getVenueLogo(id, name);
  if (!logo) return '';
  const role = logo.roleLabel ? ` data-role="${esc(logo.role)}" title="${esc(logo.roleLabel)}"` : ` data-role="${esc(logo.role)}"`;
  return `<span class="venue-logo venue-logo-${esc(size)}${className ? ' ' + esc(className) : ''}" style="--venue-logo-bg:${esc(logo.background)}"${role}><img src="${esc(logo.file)}" width="${Math.round(logo.width)}" height="${Math.round(logo.height)}" alt="${decorative ? '' : esc(logo.alt)}" loading="lazy" decoding="async"></span>`;
}

export function venueLogoMeta() { return {...meta, count: assets.size, venues: byVenue.size}; }

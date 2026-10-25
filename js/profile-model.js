/**
 * Panel models — pure, no DOM. They assemble what the reading panel says at each level:
 * overview (country or province), district, venue, pending record and search results.
 * Every count comes from the rows passed in; nothing is a constant of the snapshot.
 */
import {GROUPS, groupById, summarize, operatorRanking, hasPoint, normalizeText, rowProvince, provinceByCode, districtWord} from './model.js';
import {districtLabel} from './areas.js';
import {rankAreas} from './chart-model.js';

export function groupMix(rows) {
  return GROUPS.map(g => ({...g, count: rows.filter(r => r.group === g.id).length})).filter(g => g.count);
}

const byName = (a, b) => a.name.localeCompare(b.name, 'th');
const byGroupThenName = (a, b) => GROUPS.findIndex(g => g.id === a.group) - GROUPS.findIndex(g => g.id === b.group) || byName(a, b);

/**
 * Overview at country or province level.
 * rows: focus rows; scopeRows: filtered scope; areas: district or province summaries with fill.
 */
export function buildOverviewModel({rows, scopeRows, areas = [], kind = 'district', planned = [], closed = [], readCode = ''}) {
  const summary = summarize(rows);
  const scope = summarize(scopeRows);
  const ranking = rankAreas(areas, {kind}).filter(a => a.count > 0);
  // Not in any district: no selected point, or a point outside every boundary line (coast, border).
  const unlocated = scopeRows.filter(r => !(hasPoint(r) && r.districtCode) && (!readCode || rowProvince(r) === readCode));
  return {
    summary, scope, ranking, kind,
    groups: groupMix(rows),
    operators: operatorRanking(rows).slice(0, 5),
    planned: [...planned].sort(byName),
    closed: [...closed].sort(byName),
    unlocated,
    readCode,
  };
}

/** District profile. rows: scope rows inside the district; area: the district summary (with class). */
export function buildDistrictProfile({area, rows, rank = 0, of = 0, planned = [], closed = []}) {
  if (!area) return null;
  const s = summarize(rows);
  return {
    id: area.code, name: area.th, label: districtLabel(area), province: area.province,
    provinceName: provinceByCode(area.province)?.th || area.province,
    areaKm2: area.areaKm2, density: area.density, count: area.count, classLabel: area.classLabel, fill: area.fill, state: area.state,
    rank, of, summary: s,
    groups: groupMix(rows),
    operators: operatorRanking(rows).slice(0, 6),
    venues: [...rows].sort(byGroupThenName),
    planned: [...planned].sort(byName), closed: [...closed].sort(byName),
  };
}

/**
 * Venue profile: the core row plus its detail record (null while the shard loads).
 * byId resolves the parent and children; districts resolves the area of the point.
 */
export function buildVenueProfile({row, detail = null, byId, districts}) {
  if (!row) return null;
  const district = row.districtCode ? districts?.get(row.districtCode) || null : null;
  const parent = row.parentId ? byId.get(row.parentId) || null : null;
  const children = (row.children || []).map(id => byId.get(id)).filter(Boolean).sort(byName);
  const province = provinceByCode(row.provinceCode) || null;
  const addressProvince = row.addrProvince || '';
  return {
    row, detail, group: groupById(row.group), district, parent, children,
    province, addressProvince,
    // A boundary assignment that differs from the written address is named (venue evidence list), never hidden.
    addressDiffers: Boolean(province && addressProvince && addressProvince.replace(/^จังหวัด/, '') !== province.th),
    areaLabel: district ? `${districtWord(district.province)}${district.th}` : '',
  };
}

/**
 * Pending record card (D4): context only, never counted. `reviewed` = the definition review closed
 * without confirming the record (pending.json state "reviewed"); otherwise it still awaits review.
 */
export function buildPendingCard(pending, index, districts) {
  const r = pending?.rows?.[index];
  if (!r) return null;
  const [id, name, lon, lat, provinceCode, districtCode, group, state] = r;
  const district = districtCode ? districts?.get(districtCode) || null : null;
  return {id, name, lon, lat, group: groupById(group), province: provinceByCode(provinceCode), district, index, reviewed: state === 'reviewed'};
}

/**
 * Search across qualified venues (countable and components) and pending records.
 * Substring on normalised names, aliases, operators and ids — no fuzzy matching.
 */
export function searchAll(query, {rows = [], pending = null, limit = 30} = {}) {
  const q = normalizeText(query);
  if (!q) return {query: '', qualified: [], components: [], pending: [], pendingTotal: 0};
  const hit = r => (r._search || '').includes(q);
  const qualified = rows.filter(r => r.countable && hit(r)).sort(byName);
  const components = rows.filter(r => !r.countable && hit(r)).sort(byName);
  const pendingHits = [];
  let pendingTotal = 0;
  for (const [i, key] of (pending?._keys || []).entries()) {
    if (!key.includes(q)) continue;
    pendingTotal++;
    if (pendingHits.length < limit) pendingHits.push(i);
  }
  return {query, qualified: qualified.slice(0, limit), qualifiedTotal: qualified.length, otherStatus: qualified.filter(r => r.status !== 'supply').length,
    components: components.slice(0, limit), pending: pendingHits, pendingTotal};
}

/** Index pending names once for search. */
export function indexPending(pending) {
  if (!pending?.rows) return pending;
  Object.defineProperty(pending, '_keys', {value: pending.rows.map(r => normalizeText(`${r[1]}|${r[0]}`)), enumerable: false});
  return pending;
}

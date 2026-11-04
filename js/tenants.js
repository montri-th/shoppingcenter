/**
 * Registry-linked shops. Optional, loaded only after selecting a venue; never changes map totals.
 *
 * The roster shards (data/tenants/NN.json) carry the items of one venue. The tenant index
 * (data/tenant-index.json, scripts/build-tenant-index.py) carries one compact row per published item
 * for three reading aids that look across venues: brand search, where a brand is listed (brand
 * view) and the comparison with nearby centres. Roles always come from tenantRole(), brands are
 * matched by normalizeText() of the shown brand — a search and display aid, never a join for
 * counting. Counts read “in the list”: the roster is a partial list, not a census.
 */
import {shardOf} from './details.js';
import {normalizeText, hasPoint} from './model.js';

export const TENANT_PAGE_SIZE = 10;
export const TENANT_RANK_POLICY = 'venue-role-v1';
const SHARDS = 32;

/** Failed requests are evicted so the panel's retry can recover without reloading the map. */
export function createTenantLoader(fetchImpl = (...args) => fetch(...args)) {
  const cache = new Map();
  let profiles;
  const read = async path => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(path, {cache: 'no-cache', signal: controller.signal});
      if (!response.ok) throw new Error(`tenant data: ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  };
  const readProfiles = () => profiles ||= read('data/tenant-profiles.json').catch(() => null);
  return async id => {
    const path = `data/tenants/${String(shardOf(id, SHARDS)).padStart(2, '0')}.json`;
    if (!cache.has(path)) cache.set(path, read(path).then(json => {
      if (!json?.venues || typeof json.venues !== 'object') throw new Error('Invalid tenant shard');
      return json;
    }).catch(error => { cache.delete(path); throw error; }));
    const [json, profileData] = await Promise.all([cache.get(path), readProfiles()]);
    const roster = json.venues[id] || {items: [], observations: 0};
    if (!Array.isArray(roster.items)) throw new Error('Invalid tenant roster');
    return {...roster, profile: profileData?.venues?.[id] || null, meta: json.meta || {}};
  };
}

export const loadTenants = createTenantLoader();

/** Selection state outlives panel repaints. Late responses never replace a newly selected venue. */
export function createTenantSelection({load = loadTenants, changed = () => {}} = {}) {
  let request = 0;
  let state = {id: '', loading: false, error: false, roster: null, limit: TENANT_PAGE_SIZE, role: ''};
  return {
    get state() { return state; },
    async select(id, {retry = false} = {}) {
      if (state.id === id && !retry) return;
      const token = ++request;
      state = {id, loading: true, error: false, roster: null, limit: TENANT_PAGE_SIZE, role: ''};
      try {
        const roster = await load(id);
        if (token !== request) return;
        state = {...state, loading: false, roster};
      } catch {
        if (token !== request) return;
        state = {...state, loading: false, error: true};
      }
      changed(state);
    },
    more(id) {
      if (id !== state.id || !state.roster || state.loading) return false;
      const length = state.role ? (state.roster.items || []).filter(item => tenantRole(item) === state.role).length : state.roster.items?.length || 0;
      if (state.limit >= length) return false;
      state = {...state, limit: Math.min(length, state.limit + TENANT_PAGE_SIZE)};
      changed(state);
      return true;
    },
    /** Show one role of the list ('' = every shop); the page restarts at ten. */
    setRole(id, role = '') {
      if (id !== state.id || !state.roster || state.loading) return false;
      const next = state.role === role ? '' : role;
      state = {...state, role: next, limit: TENANT_PAGE_SIZE};
      changed(state);
      return true;
    },
  };
}

const text = value => String(value || '').toLowerCase();
const collator = new Intl.Collator('th', {numeric: true, sensitivity: 'base'});

/** Linked datasets that are one kind of tenant take their role from the dataset, never from a category word. */
export const DATASET_ROLES = Object.freeze({
  'research.th.fitness': 'fitness', 'research.th.apparel': 'apparel', 'research.th.sport': 'sport',
  'research.th.furniture': 'home', 'research.th.pet': 'pet', 'research.th.massage_spa': 'spa',
  'research.th.salon_barber': 'hair', 'research.th.nail': 'nail',
  'research.th.beauty': 'beauty', 'research.th.beauty_clinic': 'clinic', 'research.th.playground': 'family',
  'research.th.car_service': 'car',
});

/** Role is a display judgement, not a footfall score. No network size, sales, GLA or logo bonus. */
export function tenantRole(item) {
  const category = text(`${item.category || ''} ${item.storeFormat || ''}`);
  const dataset = text(item.dataset);
  // A linked dataset that is one kind of tenant (CityMETER Fitness: gyms and studios) takes its role from the dataset.
  if (DATASET_ROLES[dataset]) return DATASET_ROLES[dataset];
  if (/fitness/.test(dataset)) return 'fitness';
  if (/cinema|entertainment|โรงภาพยนตร์/.test(category)) return 'entertainment';
  if (/^(department_store|department store|ห้างสรรพสินค้า)$/.test(text(item.category))
    || (!/luxury/.test(dataset) && /^(department_store|department store)$/.test(text(item.storeFormat)))) return 'department';
  if (/convenience|mini.?mart|go.?fresh|express|ร้านสะดวกซื้อ/.test(category)) return 'convenience';
  if (/grocery|supermarket|hypermarket|wholesale|ซูเปอร์|ไฮเปอร์/.test(category + ' ' + dataset)) return 'grocery';
  if (/restaurant_or_cafe/.test(category)) return 'food';
  if (/cafe|café|coffee|beverage|\btea\b|คาเฟ่|กาแฟ|เครื่องดื่ม/.test(category)) return 'cafe';
  if (/restaurant|food|dining|อาหาร/.test(category + ' ' + dataset)) return 'dining';
  if (/luxury/.test(dataset)) return /beauty/.test(category) ? 'beauty' : 'destination';
  if (/camera/.test(dataset + ' ' + category)) return 'camera';
  if (/gold/.test(dataset + ' ' + category)) return 'gold';
  if (/pharmacy/.test(dataset + ' ' + category)) return 'pharmacy';
  if (/optical/.test(dataset + ' ' + category)) return 'optical';
  if (/bank/.test(dataset + ' ' + category)) return 'bank';
  if (/electronics|computer|mobile|gadget|เทคโนโลยี|คอมพิวเตอร์/.test(category)) return 'technology';
  return 'shop';
}

export const TENANT_ROLE_LABELS = Object.freeze({
  entertainment: 'ความบันเทิง', department: 'ห้างสรรพสินค้า', grocery: 'ซูเปอร์มาร์เก็ตและของใช้',
  convenience: 'ร้านสะดวกซื้อ', destination: 'แฟชั่นและแบรนด์หรู', apparel: 'เสื้อผ้าและแฟชั่น', sport: 'กีฬาและเอาท์ดอร์', beauty: 'ความงาม', dining: 'ร้านอาหาร', food: 'อาหารและเครื่องดื่ม', cafe: 'คาเฟ่และเครื่องดื่ม', technology: 'เทคโนโลยีและอุปกรณ์',
  camera: 'กล้องและอุปกรณ์', home: 'บ้านและเฟอร์นิเจอร์', gold: 'ทองและเครื่องประดับ', spa: 'นวดและสปา', hair: 'ทำผมและตัดผม', nail: 'ทำเล็บ', pharmacy: 'ยาและสุขภาพ', pet: 'สัตว์เลี้ยง', optical: 'แว่นตา', bank: 'บริการธนาคาร', fitness: 'ฟิตเนสและสตูดิโอ',
  family: 'เครื่องเล่นและครอบครัว', clinic: 'คลินิกความงาม', car: 'บริการรถยนต์', shop: 'ร้านค้าและบริการ',
});

// Editorial display priority, not visits or sales: anchors and destinations first, then everyday shopping and services.
const BASE = {department: 100, entertainment: 95, grocery: 90, destination: 85, apparel: 80, sport: 76, family: 74, beauty: 72, dining: 70, food: 68, technology: 67, fitness: 66, camera: 65, home: 64, gold: 60, spa: 58, clinic: 57, cafe: 55, hair: 52, nail: 51, pharmacy: 50, pet: 48, optical: 45, convenience: 40, bank: 35, car: 33, shop: 30};

export function tenantPriority(item, venue = {}, profile = null) {
  const role = tenantRole(item);
  const name = text(`${venue.name || ''} ${venue.nameEn || ''}`);
  const brand = text(item.brand).trim();
  // Only an explicitly sourced anchor outranks the role judgement.
  if (item.role === 'anchor' && item.roleSourceUrl) return 300;
  // A named host banner or a specialty centre gives this tenant a centre-specific role.
  const namedAnchor = brand.length >= 4 && name.includes(brand) && ['department', 'entertainment', 'grocery'].includes(role);
  if (namedAnchor) return 250;
  // A curated venue profile must cite the centre/operator's own positioning.
  const profileRank = profile?.sourceUrl && Array.isArray(profile.roleOrder) ? profile.roleOrder.indexOf(role) : -1;
  if (profileRank >= 0) return 200 - profileRank;
  if ((/camera|กล้อง/.test(name) && role === 'camera') || (/gold|jewel|ทอง|อัญมณี/.test(name) && role === 'gold') || (/outlet/.test(venue.group || '') && role === 'destination')) return 220;
  if (venue.group === 'fuel') return ({dining: 180, food: 175, cafe: 170, convenience: 160, grocery: 150}[role] || BASE[role]);
  if (['community', 'hoststore', 'market'].includes(venue.group)) return ({grocery: 180, dining: 150, food: 145, cafe: 130, pharmacy: 110, convenience: 100}[role] || BASE[role]);
  return BASE[role];
}

/** Stable, venue-specific ordering; equal roles sort by name, branch, then source-qualified ID. */
export function rankTenants(items = [], venue = {}, profile = null) {
  return [...items].sort((a, b) => tenantPriority(b, venue, profile) - tenantPriority(a, venue, profile)
    || collator.compare(a.displayName || a.brand || a.name || '', b.displayName || b.brand || b.name || '')
    || collator.compare(a.branch || '', b.branch || '')
    || String(a.id).localeCompare(String(b.id)));
}

/* ---------- tenant index: brand search, brand presence, nearby centres ---------- */

/** Brand key used across venues: the search key of the shown brand (model.js#normalizeText). Search and display only. */
export const brandKey = value => normalizeText(value);

/** Venue groups whose shops are compared with each other (centres and host stores, not markets or fuel stations). */
export const COMPARABLE_GROUPS = Object.freeze(['mall', 'community', 'outlet', 'component', 'hoststore']);
export const PEER_RADIUS_KM = 5;
export const PEER_LIMIT = 5;

/** data/tenant-index.json → per venue role counts and brands, per brand the venues that list it. */
export function buildTenantIndex(json) {
  const {venueIds = [], datasets = [], categories = [], formats = [], brands = [], rows = []} = json || {};
  const list = brands.map(([key, name]) => ({key, name, venues: new Map(), roles: new Map(), role: 'shop'}));
  const venues = new Map();
  for (const [v, b, d, c, f] of rows) {
    const vid = venueIds[v], brand = list[b];
    if (!vid || !brand) continue;
    const role = tenantRole({dataset: datasets[d], category: categories[c], storeFormat: formats[f]});
    let entry = venues.get(vid);
    if (!entry) venues.set(vid, entry = {items: 0, roles: new Map(), brands: new Map()});
    entry.items++;
    entry.roles.set(role, (entry.roles.get(role) || 0) + 1);
    if (!entry.brands.has(brand.key)) entry.brands.set(brand.key, role);
    brand.venues.set(vid, (brand.venues.get(vid) || 0) + 1);
    brand.roles.set(role, (brand.roles.get(role) || 0) + 1);
  }
  for (const brand of list) brand.role = [...brand.roles].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || 'shop';
  return {meta: json?.meta || {}, venues, brands: new Map(list.filter(b => b.venues.size).map(b => [b.key, b])), list: list.filter(b => b.venues.size)};
}

/** Loaded once, on demand; a failure is evicted so a later call can retry. */
export function createTenantIndexLoader(fetchImpl = (...args) => fetch(...args)) {
  let promise = null;
  return () => promise ||= (async () => {
    const response = await fetchImpl('data/tenant-index.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error(`tenant index: ${response.status}`);
    const json = await response.json();
    if (!Array.isArray(json?.rows) || !Array.isArray(json?.brands)) throw new Error('Invalid tenant index');
    return buildTenantIndex(json);
  })().catch(error => { promise = null; throw error; });
}
export const loadTenantIndex = createTenantIndexLoader();

/** Brands whose name contains the query (search key), names that start with it first, then the most widely listed. */
export function searchBrands(index, query, {limit = 6} = {}) {
  const q = normalizeText(query);
  if (!index || q.length < 2) return {total: 0, brands: []};
  const hits = index.list.filter(b => b.key.includes(q));
  hits.sort((a, b) => Number(b.key.startsWith(q)) - Number(a.key.startsWith(q)) || b.venues.size - a.venues.size || collator.compare(a.name, b.name));
  return {total: hits.length, brands: hits.slice(0, limit)};
}

const RAD = Math.PI / 180;
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

/** The venue and its parent and components: one complex, never compared with itself. */
function family(row, byId) {
  const ids = new Set([row.id, ...(row.children || [])]);
  if (row.parentId) { ids.add(row.parentId); for (const id of byId.get(row.parentId)?.children || []) ids.add(id); }
  return ids;
}

/**
 * Nearby centres with a shop list: countable supply venues of the comparable groups within radiusKm
 * (straight line between venue points), nearest first, at most `limit`, each with at least three listed shops.
 * Returns the roles and brands the nearby lists have that this list does not, and the brands only this list has.
 */
export function comparePeers(index, row, byId, {radiusKm = PEER_RADIUS_KM, limit = PEER_LIMIT} = {}) {
  if (!index || !row || !hasPoint(row) || !COMPARABLE_GROUPS.includes(row.group)) return null;
  const here = index.venues.get(row.id) || {items: 0, roles: new Map(), brands: new Map()};
  const skip = family(row, byId);
  const peers = [];
  for (const [id, entry] of index.venues) {
    const r = byId.get(id);
    if (!r || skip.has(id) || !r.countable || r.status !== 'supply' || !hasPoint(r) || !COMPARABLE_GROUPS.includes(r.group) || entry.items < 3) continue;
    const km = distanceKm(row, r);
    if (km <= radiusKm) peers.push({row: r, km, entry});
  }
  peers.sort((a, b) => a.km - b.km || collator.compare(a.row.name, b.row.name));
  const near = peers.slice(0, limit);
  const roleAt = new Map(), brandAt = new Map();
  for (const p of near) {
    for (const role of p.entry.roles.keys()) roleAt.set(role, (roleAt.get(role) || 0) + 1);
    for (const key of p.entry.brands.keys()) brandAt.set(key, (brandAt.get(key) || 0) + 1);
  }
  const need = Math.min(2, near.length);
  const brandOf = key => index.brands.get(key);
  const missingRoles = [...roleAt].filter(([role]) => !here.roles.has(role)).map(([role, peers]) => ({role, peers}))
    .sort((a, b) => b.peers - a.peers || (BASE[b.role] || 0) - (BASE[a.role] || 0));
  const missingBrands = [...brandAt].filter(([key, n]) => n >= need && !here.brands.has(key) && brandOf(key)).map(([key, peers]) => ({brand: brandOf(key), peers}))
    .sort((a, b) => b.peers - a.peers || b.brand.venues.size - a.brand.venues.size || collator.compare(a.brand.name, b.brand.name));
  const onlyHere = [...here.brands.keys()].filter(key => !brandAt.has(key) && brandOf(key)).map(brandOf)
    .sort((a, b) => (BASE[b.role] || 0) - (BASE[a.role] || 0) || collator.compare(a.name, b.name));
  return {radiusKm, peers: near.map(p => ({row: p.row, km: p.km, items: p.entry.items})), within: peers.length, hereItems: here.items,
    missingRoles, missingBrands, onlyHere};
}

/**
 * Where a brand is listed: the venues (a complex counted once — a component and its parent are one place),
 * by province and venue group, and the brands most often listed in the same venues (two or more shared).
 */
export function brandPresence(index, key, byId) {
  const brand = index?.brands.get(key);
  if (!brand) return null;
  const rows = [...brand.venues.keys()].map(id => byId.get(id)).filter(Boolean);
  const root = r => (r.parentId && byId.has(r.parentId) && brand.venues.has(r.parentId) ? r.parentId : r.id);
  const places = new Set(rows.map(root));
  const placeRows = rows.filter(r => root(r) === r.id);
  const provinces = new Map(), groups = new Map();
  for (const r of placeRows) {
    // The same membership as the province fills (areas.js#summarizeProvinces): a located point in a province, else ''.
    const code = hasPoint(r) && r.provinceCode ? r.provinceCode : '';
    provinces.set(code, (provinces.get(code) || 0) + 1);
    groups.set(r.group, (groups.get(r.group) || 0) + 1);
  }
  const shared = new Map();
  for (const id of brand.venues.keys()) for (const other of index.venues.get(id)?.brands.keys() || []) {
    if (other !== key) shared.set(other, (shared.get(other) || 0) + 1);
  }
  const coBrands = [...shared].filter(([, n]) => n >= 2).map(([k, n]) => ({brand: index.brands.get(k), shared: n})).filter(x => x.brand)
    .sort((a, b) => b.shared - a.shared || collator.compare(a.brand.name, b.brand.name)).slice(0, 8);
  const byProvince = [...provinces].map(([code, count]) => ({code, count})).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  // Venues in the order of their province (most places first), then by name; unlocated last.
  const rank = new Map(byProvince.map((p, i) => [p.code, p.code ? i : byProvince.length]));
  const codeOf = r => (hasPoint(r) && r.provinceCode ? r.provinceCode : '');
  rows.sort((a, b) => (rank.get(codeOf(a)) ?? byProvince.length) - (rank.get(codeOf(b)) ?? byProvince.length) || collator.compare(a.name, b.name));
  return {brand, rows, placeRows, places: places.size, provinces: byProvince,
    groups: [...groups].map(([id, count]) => ({id, count})).sort((a, b) => b.count - a.count), coBrands};
}

/**
 * Shop roles across venues (D22, owner 4 Nov 2026): how many countable venues list each role, largest first
 * (ties by display priority). The filter “ข้างในมี” keeps the venues whose shop list has the role; a venue
 * without a list is unknown, never “none”.
 */
export function roleVenueCounts(index, rows) {
  const counts = new Map();
  for (const r of rows) {
    if (!r.countable) continue;
    for (const role of index?.venues.get(r.id)?.roles.keys() || []) counts.set(role, (counts.get(role) || 0) + 1);
  }
  return [...counts].map(([role, venues]) => ({role, venues})).sort((a, b) => b.venues - a.venues || (BASE[b.role] || 0) - (BASE[a.role] || 0));
}

/** Centre facilities the research datasets name with an official source (data/venue-amenities.json). */
export const AMENITY_LABELS = Object.freeze({'pet-area': 'พื้นที่สำหรับสัตว์เลี้ยง'});

/** data/venue-amenities.json → venue id → [{kind, name, sourceUrl, checkedOn, basis}] (kinds in AMENITY_LABELS only). */
export function buildAmenities(json) {
  const out = new Map();
  for (const [id, list] of Object.entries(json?.venues || {})) {
    const ok = (Array.isArray(list) ? list : []).filter(a => AMENITY_LABELS[a?.kind] && /^https?:\/\//.test(a.sourceUrl || '') && /^\d{4}-\d{2}-\d{2}$/.test(a.checkedOn || ''));
    if (ok.length) out.set(id, ok);
  }
  return out;
}

/** Role counts of a roster, largest first (ties by display priority): the shop mix of one venue. */
export function tenantMix(items = []) {
  const counts = new Map();
  for (const item of items) { const role = tenantRole(item); counts.set(role, (counts.get(role) || 0) + 1); }
  return [...counts].map(([role, count]) => ({role, count})).sort((a, b) => b.count - a.count || (BASE[b.role] || 0) - (BASE[a.role] || 0));
}

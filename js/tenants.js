/** Registry-linked shops. Optional, loaded only after selecting a venue; never changes map totals. */
import {shardOf} from './details.js';

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
  let state = {id: '', loading: false, error: false, roster: null, limit: TENANT_PAGE_SIZE};
  return {
    get state() { return state; },
    async select(id, {retry = false} = {}) {
      if (state.id === id && !retry) return;
      const token = ++request;
      state = {id, loading: true, error: false, roster: null, limit: TENANT_PAGE_SIZE};
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
      const length = state.roster.items?.length || 0;
      if (state.limit >= length) return false;
      state = {...state, limit: Math.min(length, state.limit + TENANT_PAGE_SIZE)};
      changed(state);
      return true;
    },
  };
}

const text = value => String(value || '').toLowerCase();
const collator = new Intl.Collator('th', {numeric: true, sensitivity: 'base'});

/** Role is a display judgement, not a footfall score. No network size, sales, GLA or logo bonus. */
export function tenantRole(item) {
  const category = text(`${item.category || ''} ${item.storeFormat || ''}`);
  const dataset = text(item.dataset);
  // A linked dataset that is one kind of tenant (CityMETER Fitness: gyms and studios) takes its role from the dataset.
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
  convenience: 'ร้านสะดวกซื้อ', destination: 'แฟชั่นและแบรนด์หรู', beauty: 'ความงาม', dining: 'ร้านอาหาร', food: 'อาหารและเครื่องดื่ม', cafe: 'คาเฟ่และเครื่องดื่ม', technology: 'เทคโนโลยีและอุปกรณ์',
  camera: 'กล้องและอุปกรณ์', gold: 'ทองและเครื่องประดับ', pharmacy: 'ยาและสุขภาพ', optical: 'แว่นตา', bank: 'บริการธนาคาร', fitness: 'ฟิตเนสและสตูดิโอ', shop: 'ร้านค้าและบริการ',
});

const BASE = {department: 100, entertainment: 95, grocery: 90, destination: 85, beauty: 72, dining: 70, food: 68, technology: 67, fitness: 66, camera: 65, gold: 60, cafe: 55, pharmacy: 50, optical: 45, convenience: 40, bank: 35, shop: 30};

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

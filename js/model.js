/**
 * Dataset vocabulary, shared filters and summaries — CityMETER · Shopping Centers & Retail Venues.
 *
 * Rows are the core records of data/venues.json: one qualified retail venue or site
 * (owner retail-venue definition, 2026-10-23). Parent complexes and retail components
 * are separate rows; only `countable` rows enter any number. The full evidence of a
 * row lives in a detail shard loaded when the venue opens (js/details.js).
 * Nothing in this module mutates a row; missing values stay missing (never 0).
 */

/**
 * Display groups (Inference for navigation, Product Statement §2.2 + 2026-10-25 change:
 * hyper/supermarkets with tenant areas are their own group because the pending queue holds
 * ~2,500 of them). Order = legend order. `series` is the landometer-series-10-v8 entry and
 * `cue` its non-colour shape; orange/gold series (2, 3) are left out so pins never blend
 * into the density.area choropleth. Ids must match scripts/build-data.py GROUP_IDS.
 */
export const GROUPS = Object.freeze([
  {id: 'mall', th: 'ศูนย์การค้า', short: 'ศูนย์การค้า', series: 1, cue: 'circle'},
  {id: 'community', th: 'คอมมูนิตี้มอลล์', short: 'คอมมูนิตี้มอลล์', series: 7, cue: 'hexagon'},
  {id: 'market', th: 'ตลาด', short: 'ตลาด', series: 4, cue: 'diamond'},
  {id: 'hoststore', th: 'ไฮเปอร์มาร์เก็ตและซูเปอร์มาร์เก็ตที่มีร้านเช่า', short: 'ไฮเปอร์/ซูเปอร์มาร์เก็ต', series: 5, cue: 'cross'},
  {id: 'component', th: 'พื้นที่ค้าปลีกในโครงการ', short: 'ในโครงการ', series: 6, cue: 'star'},
  {id: 'outlet', th: 'เอาท์เล็ต', short: 'เอาท์เล็ต', series: 8, cue: 'ring'},
  {id: 'fuel', th: 'จุดพักรถและสถานีบริการ', short: 'จุดพักรถ', series: 10, cue: 'plus'},
  {id: 'other', th: 'อื่น ๆ', short: 'อื่น ๆ', series: 9, cue: 'dash'},
]);
const GROUP_MAP = new Map(GROUPS.map(g => [g.id, g]));
export const groupById = id => GROUP_MAP.get(id) || GROUP_MAP.get('other');

/** Operation status of a countable venue (operation_group): supply is what every count uses. */
export const STATUSES = Object.freeze({
  supply: 'เปิดอยู่หรือรอยืนยันสถานะ',
  planned: 'โครงการที่กำลังมา',
  closed: 'ปิดตามหลักฐาน',
});
/** Status filter values. '' = supply (default). */
export const STATUS_FILTERS = Object.freeze({'': 'เปิดอยู่หรือรอยืนยัน', planned: 'โครงการที่กำลังมา', closed: 'ปิดตามหลักฐาน', all: 'ทุกสถานะ'});

export const TIERS = Object.freeze({
  supported: 'ผ่านนิยามด้วยหลักฐานปัจจุบัน',
  historical: 'ผ่านนิยามด้วยหลักฐานย้อนหลัง',
  planned: 'โครงการที่ผ่านนิยาม',
});

/**
 * The 77 provinces as CityMETER production names them: `code` is production `abbrEn`
 * (the path segment of /v3/citymeter/{code}), `dopa` the numeric code. Source:
 * https://landometer.com/api/v2/citymeter-v3/base/info/lv0 (read 2026-10-25).
 */
export const PROVINCES = Object.freeze([
  {code: 'BKK', dopa: '10', th: 'กรุงเทพมหานคร', en: 'Bangkok'},
  {code: 'SPK', dopa: '11', th: 'สมุทรปราการ', en: 'Samut Prakan'},
  {code: 'NBI', dopa: '12', th: 'นนทบุรี', en: 'Nonthaburi'},
  {code: 'PTE', dopa: '13', th: 'ปทุมธานี', en: 'Pathum Thani'},
  {code: 'AYA', dopa: '14', th: 'พระนครศรีอยุธยา', en: 'Phra Nakhon Si Ayutthaya'},
  {code: 'ATG', dopa: '15', th: 'อ่างทอง', en: 'Ang Thong'},
  {code: 'LRI', dopa: '16', th: 'ลพบุรี', en: 'Lop Buri'},
  {code: 'SBR', dopa: '17', th: 'สิงห์บุรี', en: 'Sing Buri'},
  {code: 'CNT', dopa: '18', th: 'ชัยนาท', en: 'Chai Nat'},
  {code: 'SRI', dopa: '19', th: 'สระบุรี', en: 'Saraburi'},
  {code: 'CBI', dopa: '20', th: 'ชลบุรี', en: 'Chon Buri'},
  {code: 'RYG', dopa: '21', th: 'ระยอง', en: 'Rayong'},
  {code: 'CTI', dopa: '22', th: 'จันทบุรี', en: 'Chanthaburi'},
  {code: 'TRT', dopa: '23', th: 'ตราด', en: 'Trat'},
  {code: 'CCO', dopa: '24', th: 'ฉะเชิงเทรา', en: 'Chachoengsao'},
  {code: 'PRI', dopa: '25', th: 'ปราจีนบุรี', en: 'Prachin Buri'},
  {code: 'NYK', dopa: '26', th: 'นครนายก', en: 'Nakhon Nayok'},
  {code: 'SKW', dopa: '27', th: 'สระแก้ว', en: 'Sa Kaeo'},
  {code: 'NMA', dopa: '30', th: 'นครราชสีมา', en: 'Nakhon Ratchasima'},
  {code: 'BRM', dopa: '31', th: 'บุรีรัมย์', en: 'Buri Ram'},
  {code: 'SRN', dopa: '32', th: 'สุรินทร์', en: 'Surin'},
  {code: 'SSK', dopa: '33', th: 'ศรีสะเกษ', en: 'Si Sa Ket'},
  {code: 'UBN', dopa: '34', th: 'อุบลราชธานี', en: 'Ubon Ratchathani'},
  {code: 'YST', dopa: '35', th: 'ยโสธร', en: 'Yasothon'},
  {code: 'CPM', dopa: '36', th: 'ชัยภูมิ', en: 'Chaiyaphum'},
  {code: 'ACR', dopa: '37', th: 'อำนาจเจริญ', en: 'Amnat Charoen'},
  {code: 'BKN', dopa: '38', th: 'บึงกาฬ', en: 'Bueng Kan'},
  {code: 'NBP', dopa: '39', th: 'หนองบัวลำภู', en: 'Nong Bua Lam Phu'},
  {code: 'KKN', dopa: '40', th: 'ขอนแก่น', en: 'Khon Kaen'},
  {code: 'UDN', dopa: '41', th: 'อุดรธานี', en: 'Udon Thani'},
  {code: 'LEI', dopa: '42', th: 'เลย', en: 'Loei'},
  {code: 'NKI', dopa: '43', th: 'หนองคาย', en: 'Nong Khai'},
  {code: 'MKM', dopa: '44', th: 'มหาสารคาม', en: 'Maha Sarakham'},
  {code: 'RET', dopa: '45', th: 'ร้อยเอ็ด', en: 'Roi Et'},
  {code: 'KSN', dopa: '46', th: 'กาฬสินธุ์', en: 'Kalasin'},
  {code: 'SNK', dopa: '47', th: 'สกลนคร', en: 'Sakon Nakhon'},
  {code: 'NPM', dopa: '48', th: 'นครพนม', en: 'Nakhon Phanom'},
  {code: 'MDH', dopa: '49', th: 'มุกดาหาร', en: 'Mukdahan'},
  {code: 'CMI', dopa: '50', th: 'เชียงใหม่', en: 'Chiang Mai'},
  {code: 'LPN', dopa: '51', th: 'ลำพูน', en: 'Lamphun'},
  {code: 'LPG', dopa: '52', th: 'ลำปาง', en: 'Lampang'},
  {code: 'UTT', dopa: '53', th: 'อุตรดิตถ์', en: 'Uttaradit'},
  {code: 'PRE', dopa: '54', th: 'แพร่', en: 'Phrae'},
  {code: 'NAN', dopa: '55', th: 'น่าน', en: 'Nan'},
  {code: 'PYO', dopa: '56', th: 'พะเยา', en: 'Phayao'},
  {code: 'CRI', dopa: '57', th: 'เชียงราย', en: 'Chiang Rai'},
  {code: 'MSN', dopa: '58', th: 'แม่ฮ่องสอน', en: 'Mae Hong Son'},
  {code: 'NSN', dopa: '60', th: 'นครสวรรค์', en: 'Nakhon Sawan'},
  {code: 'UTI', dopa: '61', th: 'อุทัยธานี', en: 'Uthai Thani'},
  {code: 'KPT', dopa: '62', th: 'กำแพงเพชร', en: 'Kamphaeng Phet'},
  {code: 'TAK', dopa: '63', th: 'ตาก', en: 'Tak'},
  {code: 'STI', dopa: '64', th: 'สุโขทัย', en: 'Sukhothai'},
  {code: 'PLK', dopa: '65', th: 'พิษณุโลก', en: 'Phitsanulok'},
  {code: 'PCT', dopa: '66', th: 'พิจิตร', en: 'Phichit'},
  {code: 'PNB', dopa: '67', th: 'เพชรบูรณ์', en: 'Phetchabun'},
  {code: 'RBR', dopa: '70', th: 'ราชบุรี', en: 'Ratchaburi'},
  {code: 'KRI', dopa: '71', th: 'กาญจนบุรี', en: 'Kanchanaburi'},
  {code: 'SPB', dopa: '72', th: 'สุพรรณบุรี', en: 'Suphan Buri'},
  {code: 'NPT', dopa: '73', th: 'นครปฐม', en: 'Nakhon Pathom'},
  {code: 'SKN', dopa: '74', th: 'สมุทรสาคร', en: 'Samut Sakhon'},
  {code: 'SKM', dopa: '75', th: 'สมุทรสงคราม', en: 'Samut Songkhram'},
  {code: 'PBI', dopa: '76', th: 'เพชรบุรี', en: 'Phetchaburi'},
  {code: 'PKN', dopa: '77', th: 'ประจวบคีรีขันธ์', en: 'Prachuap Khiri Khan'},
  {code: 'NST', dopa: '80', th: 'นครศรีธรรมราช', en: 'Nakhon Si Thammarat'},
  {code: 'KBI', dopa: '81', th: 'กระบี่', en: 'Krabi'},
  {code: 'PNA', dopa: '82', th: 'พังงา', en: 'Phangnga'},
  {code: 'PKT', dopa: '83', th: 'ภูเก็ต', en: 'Phuket'},
  {code: 'SNI', dopa: '84', th: 'สุราษฎร์ธานี', en: 'Surat Thani'},
  {code: 'RNG', dopa: '85', th: 'ระนอง', en: 'Ranong'},
  {code: 'CPN', dopa: '86', th: 'ชุมพร', en: 'Chumphon'},
  {code: 'SKA', dopa: '90', th: 'สงขลา', en: 'Songkhla'},
  {code: 'STN', dopa: '91', th: 'สตูล', en: 'Satun'},
  {code: 'TRG', dopa: '92', th: 'ตรัง', en: 'Trang'},
  {code: 'PLG', dopa: '93', th: 'พัทลุง', en: 'Phatthalung'},
  {code: 'PTN', dopa: '94', th: 'ปัตตานี', en: 'Pattani'},
  {code: 'YLA', dopa: '95', th: 'ยะลา', en: 'Yala'},
  {code: 'NWT', dopa: '96', th: 'นราธิวาส', en: 'Narathiwat'},
]);
const BY_CODE = new Map(PROVINCES.map(p => [p.code, p]));
const BY_TH = new Map(PROVINCES.map(p => [p.th, p]));
export const provinceByCode = code => BY_CODE.get(String(code || '').toUpperCase()) || null;
/** Address province (Thai name as written in the record) → production province, exact name only. */
export const provinceByThai = name => BY_TH.get(String(name || '').replace(/^จังหวัด/, '').trim()) || null;
export const BANGKOK = 'BKK';
/** Bangkok divides into เขต, every other province into อำเภอ. */
export const districtWord = provinceCode => (provinceCode === BANGKOK ? 'เขต' : 'อำเภอ');

/** A row that can be drawn and assigned to an area: a selected reference point inside Thailand. */
export const hasPoint = r => Boolean(r?.located) && Number.isFinite(r.lat) && Number.isFinite(r.lon) &&
  r.lat >= 5 && r.lat <= 21 && r.lon >= 97 && r.lon <= 106;

/** Province used by filters and lists: area membership when located, else the record's address province. */
export const rowProvince = r => r.provinceCode || provinceByThai(r.addrProvince)?.code || '';

/** Lower-case, NFKC, no spaces or punctuation — for substring search on names, ids and operators. */
export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('th-TH').replace(/[\s​'’"`.,·\-–—/()]+/g, '');
}

export function searchKey(r) {
  return [r.name, r.nameEn, r.operatorLabel, r.id, r.scId, ...(r.aliases || [])].map(normalizeText).join('|');
}

/**
 * Shared filter used by map, counters, charts, panel and table.
 * f = {status: ''|'planned'|'closed'|'all', group, operator, province, district, search}
 * Only countable rows enter; components and duplicate holds stay out of every count.
 */
export function filterVenues(rows, f = {}) {
  const q = normalizeText(f.search || '');
  return rows.filter(r => {
    if (!r.countable) return false;
    const status = f.status || '';
    if (status === '' && r.status !== 'supply') return false;
    if ((status === 'planned' || status === 'closed') && r.status !== status) return false;
    if (f.group && r.group !== f.group) return false;
    if (f.operator && (f.operator === '__none__' ? r.operatorGroup : f.operator === '__other__' ? r.operatorGroup !== 'other' : r.operatorGroup !== f.operator)) return false;
    if (f.province && rowProvince(r) !== f.province) return false;
    if (f.district && r.districtCode !== f.district) return false;
    return !q || (r._search || searchKey(r)).includes(q);
  });
}

/** Rows that carry an area: countable, located, assigned to a district. */
export const areaRows = rows => rows.filter(r => hasPoint(r) && r.districtCode);

/** Counts for a selection. Missing operator stays missing (not counted as an operator). */
export function summarize(rows) {
  const groups = GROUPS.map(g => ({...g, count: rows.filter(r => r.group === g.id).length})).filter(g => g.count);
  const operators = new Set(rows.filter(r => r.operatorLabel).map(r => r.operatorGroup === 'other' ? `o:${r.operatorLabel}` : r.operatorGroup));
  return {
    venues: rows.length,
    located: rows.filter(hasPoint).length,
    unlocated: rows.filter(r => !hasPoint(r)).length,
    groups,
    operators: operators.size,
    operatorKnown: rows.filter(r => r.operatorLabel).length,
    districts: new Set(areaRows(rows).map(r => r.districtCode)).size,
    provinces: new Set(areaRows(rows).map(r => r.provinceCode)).size,
    storeVenues: rows.filter(r => r.storeCount > 0).length,
    stores: rows.reduce((s, r) => s + (r.storeCount || 0), 0),
  };
}

/** Operator groups with their venue counts in `rows` (Inference: curated name table, DATA_METHOD.md). */
export function operatorRanking(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!r.operatorLabel) continue;
    const key = r.operatorGroup === 'other' ? `o:${r.operatorLabel}` : r.operatorGroup;
    const e = by.get(key) || {id: r.operatorGroup === 'other' ? '' : r.operatorGroup, label: r.operatorLabel, count: 0, grouped: r.operatorGroup !== 'other'};
    e.count++;
    by.set(key, e);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'th'));
}

/** Prepare rows once after load: search key and nothing else (source values unchanged). */
export function prepareRows(rows) {
  for (const r of rows) Object.defineProperty(r, '_search', {value: searchKey(r), enumerable: false});
  return rows;
}

export const safeURL = value => {
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; }
  catch { return ''; }
};

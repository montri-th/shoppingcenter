/**
 * English for the “รอบศูนย์นี้” section (js/venue-locale.js), for the shell's page translation (js/shell/i18n.js; owner
 * 2026-11-08: TH/EN on every page). Thai stays the source text. Dataset, metric, unit and prior labels come in pairs
 * from data/locale/meta.json; place names from the facts of the open venue (registerNames) or stay Thai (keepThai).
 * This demo still declares Thai only (AGENTS.md); the section is covered ahead so it reads in English once the rest of
 * the page is. tests/venue-locale.test.js renders sample venues and checks that every Thai text has an English.
 */
import {registerDictionary, registerNames, keepThai, translate} from './shell/i18n.js';
import {PROVINCES} from './model.js';

const TYPE_EN = {'ศูนย์การค้า': 'shopping centers', 'คอมมูนิตี้มอลล์': 'community malls', 'เอาท์เล็ต': 'outlets'};
const LEVEL_EN = {
  'ย่าน': ['neighbourhood', 'neighbourhoods'], 'แขวง': ['subdistrict', 'subdistricts'], 'ตำบล': ['subdistrict', 'subdistricts'],
  'เขต': ['district', 'districts'], 'อำเภอ': ['district', 'districts'], 'เทศบาล/อปท.': ['local government area', 'local government areas'],
  'จังหวัด': ['province', 'provinces'],
};
const LEVEL_RE = Object.keys(LEVEL_EN).map(w => w.replace(/[./]/g, m => `\\${m}`)).join('|');
const DAY = {'วันธรรมดา': 'Weekday', 'วันหยุด': 'Weekend'};
const WEEKDAY = {'จันทร์': 'Monday', 'อังคาร': 'Tuesday', 'พุธ': 'Wednesday', 'พฤหัสบดี': 'Thursday', 'ศุกร์': 'Friday', 'เสาร์': 'Saturday', 'อาทิตย์': 'Sunday'};
const DAY_SHORT = {'จ.': 'Mon', 'อ.': 'Tue', 'พ.': 'Wed', 'พฤ.': 'Thu', 'ศ.': 'Fri', 'ส.': 'Sat', 'อา.': 'Sun'};
const SHORT_RE = '(จ\\.|อ\\.|พฤ\\.|พ\\.|ศ\\.|ส\\.|อา\\.)';
const BLOCK = {'เช้า': 'morning', 'กลางวัน': 'lunch', 'บ่าย': 'afternoon', 'เย็น': 'evening', 'ค่ำ': 'night'};
const provinceEN = th => {
  const s = String(th || '').replace(/^จังหวัด/, '');
  if (s === 'กรุงเทพฯ' || s === 'กรุงเทพมหานคร') return 'Bangkok';
  return PROVINCES.find(p => p.th === s)?.en || null;
};
/** “ย่านในกรุงเทพฯ” → “neighbourhoods in Bangkok”; “แขวงที่มีศูนย์ชุดอ้างอิง” → “subdistricts with centers of the reference set”. */
function groupEN(text) {
  const s = String(text || '').trim();
  let m = new RegExp(`^(${LEVEL_RE})ที่มีศูนย์ชุดอ้างอิง$`).exec(s);
  if (m) return `${LEVEL_EN[m[1]][1]} with centers of the reference set`;
  m = new RegExp(`^(${LEVEL_RE})ใน(.+)$`).exec(s);
  if (m) { const p = provinceEN(m[2]); return p ? `${LEVEL_EN[m[1]][1]} in ${p}` : null; }
  return null;
}
/** Ring universes: “ 488 ศูนย์” / “ศูนย์การค้า 288 แห่ง”. */
function universeEN(text) {
  const s = String(text || '').trim();
  let m = /^([\d,]+) ศูนย์$/.exec(s);
  if (m) return `${m[1]} centers`;
  m = /^(.+) ([\d,]+) แห่ง$/.exec(s);
  if (m && TYPE_EN[m[1]]) return `${m[2]} ${TYPE_EN[m[1]]}`;
  // the release's universe labels: “ศูนย์ชุดอ้างอิงที่มีพิกัด”, “ศูนย์การค้าชุดอ้างอิงที่มีพิกัด”
  m = /^(.+)ชุดอ้างอิงที่มีพิกัด$/.exec(s);
  if (m && (m[1] === 'ศูนย์' || TYPE_EN[m[1]])) return `located ${m[1] === 'ศูนย์' ? 'centers' : TYPE_EN[m[1]]} of the reference set`;
  return null;
}
const or = (...parts) => (parts.some(p => p == null) ? null : parts.join(''));
/** The page spells “center” as its title does (“Shopping centers”, owner 2026-10-25); the release's labels write “centre”. */
export const usSpelling = text => String(text ?? '').replace(/\b([Cc])entre(s?)\b/g, '$1enter$2');

/** The static words of the section. */
const EXACT = {
  'คน/ตร.กม.': 'people/km²',
  'รอบศูนย์นี้': 'Around this center', 'รัศมีเส้นตรง': 'Straight-line radius', 'รัศมี': 'Radius', 'เทียบกับ': 'Compare with',
  '(เปิดแท็บใหม่)': '(opens a new tab)', 'ระดับพื้นที่': 'Area level', 'พื้นที่ที่ศูนย์ตั้งอยู่': 'The area the center sits in',
  'ที่มีศูนย์ทั่วประเทศ': 'Areas with centers nationwide', 'ตัวเลขทุกรัศมี': 'Figures for every radius', 'ชุดข้อมูล': 'Dataset',
  'อันดับ 3 กม.': 'Rank at 3 km', 'จำนวนในรัศมี 1, 3 และ 5 กม. และอันดับที่ 3 กม.': 'Counts within 1, 3 and 5 km and the rank at 3 km',
  '* นับได้เฉพาะรายการที่มีพิกัด': '* only records with a point are counted',
  'ข้อมูลที่เปลี่ยนรายวันใน CityMETER': 'Data that changes daily in CityMETER', 'Locale Insights ของย่านนี้': 'Locale Insights of this neighbourhood',
  'ใครน่าจะอยู่รอบศูนย์ และช่วงไหนน่าจะคึก': 'Who is likely around, and when it is likely busy', 'สมมติฐานจากกฎ': 'Rule-based hypothesis',
  'ใช้เลือกสิ่งที่จะไปตรวจ ไม่ใช่จำนวนคน ยอดขาย หรือส่วนแบ่งลูกค้า': 'For choosing what to check — not people counts, sales or customer share',
  'ช่วงไหนน่าจะคึกกว่าปกติ': 'When it is likely busier than usual', 'ช่วงเวลาที่คาดว่าคึกหรือเงียบกว่าปกติ (สมมติฐาน)': 'Times expected to be busier or quieter than usual (hypothesis)',
  'ตรวจได้ด้วย': 'Check it with', 'ที่มาและวิธีของส่วนนี้': 'Sources and method of this section', 'ที่มาและวิธี': 'Sources and method',
  'นับรายการที่แหล่งระบุในรัศมีเส้นตรง 1 · 3 · 5 กม. จากจุดของศูนย์ ไม่ใช่ระยะเดินหรือขับรถ และไม่ใช่จำนวนคนเดิน':
    'Counts the records a source lists within straight-line radii of 1 · 3 · 5 km of the center’s point — not walking or driving distance, and not footfall',
  '0 คือไม่พบรายการในรัศมี ไม่ใช่ไม่มีข้อมูล': '0 means no record within the radius, not missing data',
  'ค่าพื้นที่มาจาก CityMETER production ตามหน่วยที่จุดของศูนย์ตั้งอยู่ ตัวเลขที่เป็นจำนวนเทียบกันต่อ ตร.กม. ของหน่วย':
    'Area values come from CityMETER production for the units the center’s point sits in; counts are compared per km² of the unit',
  'ชุดที่ยังมีพิกัดไม่ครบนับเฉพาะรายการที่มีพิกัด และติดดาวไว้ในตาราง': 'Datasets with incomplete points count only the records with a point and carry a star in the table',
  'ใกล้สุดอยู่ที่จุดของศูนย์นี้': 'nearest at this center’s point',
  'จุดของศูนย์ยังเป็นจุดอ้างอิง ไม่ใช่ขอบเขตหรือทางเข้าที่ผู้บริหารยืนยัน': 'The center’s point is a reference point, not an outline or entrance confirmed by the operator',
  'รัศมีเส้นตรงจากจุดของศูนย์ และขอบเขตพื้นที่ตาม CityMETER production': 'straight-line radii from the center’s point; area boundaries from CityMETER production',
  'ทะเบียนวิจัย CityMETER': 'CityMETER research registry', 'กำลังโหลดข้อมูลรอบศูนย์…': 'Loading the area around the center…', 'กำลังโหลด…': 'Loading…',
  'โหลดข้อมูลรอบศูนย์ไม่สำเร็จ': 'The area around the center did not load', 'โหลดสมมติฐานไม่สำเร็จ': 'The hypotheses did not load', 'ลองอีกครั้ง': 'Try again',
  'ศูนย์นี้ยังไม่มีจุดที่ผ่านเกณฑ์ จึงยังนับสิ่งที่อยู่รอบศูนย์ไม่ได้': 'This center has no accepted point yet, so what is around it cannot be counted',
  'ในรัศมีนี้ยังไม่พบรายการจากชุดข้อมูลที่นับได้': 'No record of the counted datasets within this radius', 'ยังไม่มีข้อมูลของพื้นที่ระดับนี้': 'No data for this area level yet',
  'ไม่พบในรัศมีนี้': 'none within this radius', 'รูปแบบถนนที่พบมาก': 'Most common road pattern', 'กรุงเทพมหานคร': 'Bangkok', 'ชี้หรือแตะเพื่อดูตัวเลข': 'point or tap for the figures', 'เส้นประคือค่ากลาง 50%': 'the dashed line is the median, 50%',
  'กลาง': 'Medium', 'คำอธิบายสัญลักษณ์': 'Legend',
  'คอนโดนับตามแขวง/ตำบลของฐานราคาประเมินตามนโยบายของชุดข้อมูล ไม่นับจุดบนแผนที่ในรัศมี':
    'Condominiums are counted by the subdistrict of the appraisal base, as the dataset’s policy says — map points are not counted in a radius',
  'ตัวอย่างสถานที่รอบศูนย์มาจากเดโม CityMETER ของแต่ละชุด กดชื่อเพื่อเปิดในเดโมนั้น · ระยะปัดเป็น 100 ม.':
    'Places named around the center come from each dataset’s CityMETER demo — click a name to open it there · distances rounded to 100 m',
  'ค่าเทอมคือค่าเล่าเรียนที่โรงเรียนประกาศ · ราคาที่พักคือราคาเริ่มต้นที่บันทึกในชุดข้อมูล ไม่ทราบช่วงเวลา · ค่าเช่าสำนักงานคือราคาที่ประกาศ':
    'Tuition is what the school publishes · stay prices are the lowest price the dataset recorded, period unknown · office rents are asking rents',
};

/** Patterns: numbers and names pass through; parts are translated with the same dictionary. */
const PATTERNS = [
  [/^ใน ([\d,]+) กม\. รอบศูนย์$/, 'Within $1 km of the center'],
  // the legend of the residents map (js/scales.js rampLegendHTML; the page's own legend pattern reads the unit too)
  [/^([\d,]+) ระดับสีตามลำดับค่า ต่ำสุด (<1|[\d,]+) สูงสุด ([\d,]+) คนต่อช่อง 250 × 250 ม\.$/, '$1 colour steps by rank, lowest $2, highest $3 people per 250 × 250 m cell'],
  [/^มากกว่า ([\d,]+)% ของ(.+)$/, (m) => or(`above ${m[1]}% of `, universeEN(m[2]) ?? groupEN(m[2]))],
  [/^สูงกว่า ([\d,]+)% ของ(.+) \(([\d,]+)\)$/, (m) => or(`higher than ${m[1]}% of `, groupEN(m[2]), ` (${m[3]})`)],
  [/^มากกว่า ([\d,]+)% ของ(.+) \(([\d,]+)\)$/, (m) => or(`above ${m[1]}% of `, groupEN(m[2]), ` (${m[3]})`)],
  [/^อยู่ในกลุ่ม(สูงสุด|ต่ำสุด) 1% ของ(.+?)(?: \(([\d,]+)\))?$/, (m) => or(`in the ${m[1] === 'สูงสุด' ? 'top' : 'bottom'} 1% of `, universeEN(m[2]) ?? groupEN(m[2]), m[3] ? ` (${m[3]})` : '')],
  [/^ไม่พบ เหมือน ([\d,]+)% ของ(.+)$/, (m) => or(`none found, like ${m[1]}% of `, universeEN(m[2]))],
  [/^ไม่มีในข้อมูล เหมือน ([\d,]+)% ของ(.+) \(([\d,]+)\)$/, (m) => or(`none in the data, like ${m[1]}% of `, groupEN(m[2]), ` (${m[3]})`)],
  [/^ต่อ ตร\.กม\. (.+)$/, (m, t) => or('per km²: ', t.part(m[1]))],
  [/^ทุกประเภท ([\d,]+) แห่ง$/, '$1 of all types'],
  [/^(ศูนย์การค้า|คอมมูนิตี้มอลล์|เอาท์เล็ต) ([\d,]+) แห่ง$/, (m) => `${m[2]} ${TYPE_EN[m[1]]}`],
  [/^ใน(.+)$/, (m) => { const p = provinceEN(m[1]); return p ? `In ${p}` : null; }],
  [/^ดูอีก ([\d,]+) รายการ$/, 'Show $1 more'],
  [/^ใกล้สุด ([\d,.]+) (ม\.|กม\.)$/, (m) => `nearest ${m[1]} ${m[2] === 'ม.' ? 'm' : 'km'}`],
  [/^มีพิกัด ([\d,]+) จาก ([\d,]+)(?: รายการ)?$/, '$1 of $2 have a point'],
  [/^เฉพาะ (.+)$/, (m) => `${m[1].replace(/ และ /g, ' and ')} only`],
  [/^ข้อมูล (.+)$/, (m, t) => `data ${t.date(m[1])}`],
  [/^ทะเบียนวิจัย CityMETER ([\d,]+) ชุด และ CityMETER production ([\d,]+) ชุด$/, 'CityMETER research registry, $1 datasets, and CityMETER production, $2 datasets'],
  [/^ข้อมูลรุ่น (\S+) \(release candidate\)$/, 'Data release $1 (release candidate)'],
  [/^ยังนับไม่ได้ในรุ่นนี้: (.+)$/, (m, t) => or('Not countable in this release: ', t.part(m[1]))],
  [/^ยังไม่มีพิกัดให้นับในรัศมี: (.+)$/, (m, t) => or('No points to count in the rings yet: ', t.part(m[1]))],
  [/^(.+) ใน(\S+) ([\d,]+) (\S+)$/, (m, t) => { const p = provinceEN(m[2]); return p ? or(t.part(m[1]), ` in ${p}: ${m[3]} `, t.part(m[4])) : null; }],
  [/^อันดับเทียบกับ(.+) ([\d,]+) แห่ง$/, (m) => or(`Rank against ${m[2]} `, universeEN(m[1]))],
  [/^อันดับในรัศมี ([\d,]+) กม\. เทียบกับ(.+) ([\d,]+) แห่ง$/, (m) => or(`Rank within ${m[1]} km against ${m[3]} `, universeEN(m[2]))],
  [/^อันดับของจำนวนในรัศมี ([\d,]+) กม\. เทียบกับ(.+)$/, (m) => or(`Rank of the counts within ${m[1]} km against `, universeEN(m[2]))],
  [/^จำนวนในรัศมี ([\d,]+) กม\. เทียบกับ(.+)$/, (m) => or(`Counts within ${m[1]} km against `, universeEN(m[2]))],
  [/^อันดับเป็นเปอร์เซ็นไทล์แบบ mid-rank เทียบกับ(.+) ([\d,]+) แห่ง ค่าที่เท่ากันนับครึ่ง$/, (m) => or(`Ranks are mid-rank percentiles against ${m[2]} `, universeEN(m[1]), '; equal values count half')],
  [/^อิงจาก (.+)$/, (m, t) => or('Based on ', t.part(m[1]))],
  [/^(.+) สูงกว่า ([\d,]+)% ของ(ศูนย์|พื้นที่ที่มีศูนย์)$/, (m, t) => or(t.part(m[1]), ` above ${m[2]}% of ${m[3] === 'ศูนย์' ? 'centers' : 'areas with centers'}`)],
  [/^(วันธรรมดา|วันหยุด) (เช้า|กลางวัน|บ่าย|เย็น|ค่ำ) ([\d:–]+) น\.$/, (m) => `${DAY[m[1]]} ${BLOCK[m[2]]} ${m[3]}`],
  [/^เวลาวันหยุดเริ่ม ([\d:–]+) น\.$/, 'Weekend times: morning $1'],
  [/^(เช้า|กลางวัน|บ่าย|เย็น|ค่ำ) ([\d:–]+)$/, (m) => `${BLOCK[m[1]]} ${m[2]}`],
  // the 7×24 grid: a cell's title, the opening hours read from the published text
  [/^(จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์) (\d\d:\d\d–\d\d:\d\d) น\. · (.+)$/, (m, t) => or(`${WEEKDAY[m[1]]} ${m[2]} · `, t.part(m[3]))],
  [/^ทุกวัน (\d\d:\d\d–\d\d:\d\d) น\.$/, 'daily $1'],
  [new RegExp(`^${SHORT_RE}(?:–${SHORT_RE})? (\\d\\d:\\d\\d–\\d\\d:\\d\\d) น\\.$`), m => `${DAY_SHORT[m[1]]}${m[2] ? `–${DAY_SHORT[m[2]]}` : ''} ${m[3]}`],
  [/^ย่านการค้า(.+)$/, (m, t) => or(t.name(m[1]), ' commercial district')],
  [/^จังหวัด(.+)$/, (m) => { const p = provinceEN(m[1]); return p ? `${p} Province` : null; }],
  // A unit name after its level word: the English its source gives, else the Thai name stays (shell rule §5.8).
  [new RegExp(`^(${LEVEL_RE})([^\\s].*)$`), (m, t) => (/^(ใน|ที่)/.test(m[2]) ? null : `${t.name(m[2])} ${LEVEL_EN[m[1]][0]}`)],
];

/** All the pairs a meta.json carries: datasets, metrics, units, subgroups, levels, live views, priors. */
export function localeDictionary(meta) {
  const exact = {...EXACT};
  const put = (th, en) => { if (th && en && th !== en) exact[th] = usSpelling(en); };
  const subs = new Map(), measures = new Map();
  for (const [th, [one]] of Object.entries(LEVEL_EN)) put(th, one[0].toUpperCase() + one.slice(1));
  for (const m of Object.values(meta?.ring || {})) {
    put(m.th, m.en); put(m.short?.[0], m.short?.[1]); put(m.unit?.[0], m.unit?.[1]); put(m.source?.[0], m.source?.[1]);
    for (const s of m.subgroups || []) { put(s[1], s[2]); if (s[1] && s[2]) subs.set(s[1], usSpelling(s[2])); }
    if (m.measure) { put(m.measure[1], m.measure[2]); measures.set(m.measure[1], usSpelling(m.measure[2])); }
  }
  for (const m of Object.values(meta?.area || {})) {
    put(m.th, m.en);
    for (const x of m.metrics || []) { put(x.th, x.en); put(x.unit?.[0], x.unit?.[1]); }
  }
  for (const [th, en] of Object.values(meta?.roadArchetypes || {})) put(th, en);
  for (const l of meta?.live || []) put(l.th, l.en);
  for (const g of meta?.ringGroups || []) put(g.th, g.en);
  for (const u of Object.values(meta?.universes || {})) put(u.th, u.en);
  for (const x of meta?.notCounted || []) put(x.th, x.en);
  const P = meta?.priors;
  if (P) {
    for (const [, th, en] of P.segments || []) put(th, en);
    for (const [th, en] of Object.values(P.levels || {})) put(th, en);
    for (const [th, en] of P.daypart || []) put(th, en);
    for (const [th, en] of Object.values(P.why || {})) put(th, en);
    for (const [th, en] of Object.values(P.targets || {})) put(th, en);
    for (const [th, en] of Object.values(P.signals || {})) put(th, en);
    for (const b of P.blocks || []) { put(b[1], b[2]); put(b[3], b[4]); }
    for (const dict of [P.mix, P.wtp, P.pref, P.pmf, P.check, P.rules, P.hoursBasis, P.tenantDatasets]) {
      for (const v of Object.values(dict || {})) put(v[0], v[1]);
    }
    for (const d of P.days || []) { put(d[0], d[1]); put(d[2], d[3]); }
    for (const [th, en] of P.gridLevels || []) put(th, en);
  }
  const C = meta?.context;
  if (C) {
    for (const v of Object.values(C.labels || {})) { put(v[0], v[1]); put(v[2], v[3]); }
    for (const g of Object.values(C.groups || {})) for (const [th, en] of Object.values(g || {})) put(th, en);
  }
  // The chart's tooltip lines with a count (0.9.3): subgroups (“ยางและ fast-fit 3 · ฟิล์ม กระจก และ PPF 5” → the name, then
  // the count) and a dataset's measure (“ห้อง 143” → “143 rooms”). First, so “เขตอุตสาหกรรม 1” is a subgroup, not a district.
  const escape = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = map => new RegExp(`^(${[...map.keys()].map(escape).join('|')}) ([\\d,]+)$`);
  const counted = [];
  if (subs.size) counted.push([named(subs), m => `${subs.get(m[1])} ${m[2]}`]);
  if (measures.size) counted.push([named(measures), m => `${m[2]} ${measures.get(m[1])}`]);
  // Any text alone in an element that carries its English (data-en: units and names that read differently by dataset).
  return {exact, patterns: [...counted, ...PATTERNS], contexts: [['[data-en]', {}, [[/^[\s\S]+$/, (m, t, el) => el.getAttribute('data-en') || null]]]]};
}

let registered = null;
/** Register the section's English once per meta. */
export function registerLocaleDictionary(meta) {
  if (!meta || registered === meta) return;
  registered = meta;
  const dict = localeDictionary(meta);
  // The page's own words win (js/lang-en.js: the title “Shopping centers”, the shop roles), so a Thai word reads one way
  // across the page; the section adds only the words the page does not have.
  for (const th of Object.keys(dict.exact)) if (translate(th) != null) delete dict.exact[th];
  registerDictionary(dict);
  keepThai(Object.values(meta.neighbourhoods || {}));
}

const THAI_TEXT = /[ก-๛]/;
const signalNamed = new WeakSet();
/**
 * Names in the observed context of one venue (signals/NN.json): a record's English name when its source gives one,
 * else the Thai name stays (keepThai) — record names, host venues, rail lines, brands, the operator description and the
 * published opening-hours text. Once per signals record.
 */
export function registerLocaleSignalNames(sg) {
  if (!sg || signalNamed.has(sg)) return;
  signalNamed.add(sg);
  const pairs = [], thai = [];
  const add = (th, en = '') => {
    if (!th || !THAI_TEXT.test(th)) return;
    if (en && en !== th && !THAI_TEXT.test(en)) pairs.push([th, en]); else thai.push(th);
  };
  for (const list of Object.values(sg.ex || {})) {
    for (const e of list || []) {
      add(e.n, e.e);
      add(e.h);
      add(e.un);
      add(e.b);
      (e.l || []).forEach((l, i) => add(l, e.le?.[i]));
    }
  }
  const a = sg.attr || {};
  if (a.label) add(a.label[0]);
  if (a.hours?.text) add(a.hours.text);
  for (const b of a.luxIn?.brands || []) add(b);
  if (pairs.length) registerNames(pairs);
  if (thai.length) keepThai(thai);
}

const named = new WeakSet();
/** Place names of one venue's units: the English that production gives, else the Thai stays. Once per facts record. */
export function registerLocaleNames(facts) {
  if (!facts || named.has(facts)) return;
  named.add(facts);
  const pairs = [], thai = [];
  for (const u of Object.values(facts?.units || {})) {
    if (!u?.[2]) continue;
    if (u[3]) pairs.push([u[2], u[3]]); else thai.push(u[2]);
  }
  if (pairs.length) registerNames(pairs);
  if (thai.length) keepThai(thai);
}

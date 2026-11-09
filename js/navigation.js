/**
 * This demo's navigation on the shared header code: the titles of its controls and its pictogram subset. The
 * nav-7 glyphs and the help dialog are js/shell/navigation.js, the dataset picker js/shell/header.js
 * (citymeter-shell: edit those in every repository at once, js/shell/manifest.json).
 */
import {installNavigation, NAV_GLYPHS, NAV_ICON_CONTRACT} from './shell/navigation.js';
import {installHeader} from './shell/header.js';

export {NAV_GLYPHS, NAV_ICON_CONTRACT};

/**
 * LDS pictogram / UI icon subset (Material Symbols Rounded, FILL 0 / wght 300 / GRAD 0 /
 * opsz 24). Test exception to the approved nav-7 subset — metric tiles approved by the owner
 * 2026-10-22, navigation and section icons added on the owner's instruction 2026-10-25; to
 * be registered in LDS if it proves itself. A separate subset, so the nav-7 bytes stay
 * unchanged. Every icon sits next to a text label. Roles → glyphs: brand diamond · store storefront · venue local_mall · area map · province location_city · exclusive star · gla square_foot · segment category · country public · view3d view_in_ar · architect architecture · help help · info info · chart bar_chart · rank leaderboard · mix stacked_bar_chart · operator domain · table table_rows · search search · filter tune · back arrow_back · expand expand_more · collapse expand_less · contact call · hours schedule · opened calendar_month · address location_on · coordinate my_location · checked event_available · building apartment · evidence fact_check · upcoming event_upcoming · closed do_not_disturb_on · idea lightbulb · layers layers · prev chevron_left · next chevron_right · palette palette · route route · touch touch_app.
 */
export const PICTOGRAM_CONTRACT = Object.freeze({
  family: 'LDS Material Symbols Rounded Pictogram',
  file: 'assets/icons/material-pictogram-300.woff2', bytes: 4496,
  sha256: 'ab4a8142c9d6856b1583c5d634805e0babf62c41c77447be800c8c4a43f9d363',
  manifest: 'assets/icons/material-pictogram-300.json',
  axes: Object.freeze({FILL: 0, wght: 300, GRAD: 0, opsz: 24}),
  glyphs: Object.freeze({brand: '\uEAD5', store: '\uEA12', venue: '\uE54C', area: '\uE55B', province: '\uE7F1', exclusive: '\uF09A', gla: '\uEA49', segment: '\uE72C', country: '\uE80B', view3d: '\uEFC9', architect: '\uEA3B', help: '\uE8FD', info: '\uE88E', chart: '\uE26B', rank: '\uF20C', mix: '\uE9E6', operator: '\uE7EE', table: '\uF101', search: '\uEF7A', filter: '\uE429', back: '\uE5C4', expand: '\uE5CF', collapse: '\uE5CE', contact: '\uF0D4', hours: '\uEFD6', opened: '\uEBCC', address: '\uF1DB', coordinate: '\uE55C', checked: '\uE614', building: '\uEA40', evidence: '\uF0C5', upcoming: '\uF238', closed: '\uF08F', idea: '\uE90F', layers: '\uE53B', prev: '\uE5CB', next: '\uE5CC', palette: '\uE40A', route: '\uEACD', touch: '\uE913'}),
  status: 'test exception to LDS nav-7 (metric tiles owner 2026-10-22; UI roles owner 2026-10-25)',
  fallback: 'Text labels carry the meaning; pictograms stay hidden until the font has loaded.',
});
const TITLES = {
  'fit-map': 'ดูทั้งประเทศ: ทุกจังหวัด ไม่มีโฟกัส',
  'bangkok-map': 'ไปที่กรุงเทพฯ และ 3 เขตที่หนาแน่นที่สุด',
  'toggle-3d': 'สลับมุมมอง 3 มิติ (อาคารทั้งเมือง) กับแผนผัง 2 มิติ',
  'toggle-eye': 'มุมสถาปนิก: จัดภาพอาคารของสถานที่ใหม่ มองเฉียงมุมแบบ 2 จุดลับตา เต็มจอ',
  'panel-back': 'กลับไปหน้าก่อน',
  'close-mobile-panel': 'ปิดแผงข้อมูล กลับไปแผนที่',
  'mobile-panel': 'เปิดแผงข้อมูลและตัวกรอง',
  'open-help': 'เปิดวิธีใช้',
  'toggle-insights': 'เปิดหรือย่อกราฟเทียบพื้นที่',
  'open-table': 'เปิดตารางสถานที่ตามตัวกรอง',
  'toggle-table': 'ปิดตารางและกลับไปแผนที่',
  'search': 'ค้นหาสถานที่ แบรนด์ในรายชื่อร้าน ผู้บริหาร หรือรหัส รวมรายการที่ยังยืนยันไม่ได้',
  'group': 'กรองตามกลุ่มประเภทสถานที่',
  'status': 'เลือกสถานที่ที่เปิดอยู่ ที่กำลังจะเปิด หรือที่ปิดแล้ว',
  'operator': 'กรองตามกลุ่มผู้บริหาร',
  'province': 'กรองตามจังหวัด',
  'prev-page': 'ดูหน้าก่อนหน้าของตาราง',
  'next-page': 'ดูหน้าถัดไปของตาราง',
  'tab-rank': 'เรียงพื้นที่ตามสถานที่ต่อตารางกิโลเมตร หรือจำนวน',
  'tab-mix': 'ดูประเภทในแต่ละพื้นที่',
  'tab-operators': 'ดูจำนวนสถานที่ตามผู้บริหาร',
};

// The Google links of the venue panel (D37) carry their own glyph (AI Mode, Google Maps, Street View) and say Google
// in their names, as CityMETER · Hotel's links do; screen readers hear “(เปิดแท็บใหม่)”. One icon per chip: the other
// chips that open a new tab (เว็บไซต์, รายชื่อร้าน) get the shared open_in_new glyph.
const EXTERNAL_CHIPS = '.chip-link[target="_blank"]:not(.look-link)';

if (typeof document !== 'undefined') {
  installNavigation({titles: TITLES, pictogramProbe: PICTOGRAM_CONTRACT.glyphs.store, externalLinks: EXTERNAL_CHIPS});
  installHeader();
}

/**
 * Approved LDS nav-7 glyphs and the accessible help dialog.
 *
 * Codepoints were verified from this exact font's cmap + GSUB tables. The
 * registry approves only the seven names below; unsupported actions keep
 * visible text and explanatory titles instead of borrowing misleading symbols.
 * Decoration is idempotent and never touches pins, charts, filters or data.
 */
export const NAV_GLYPHS = Object.freeze({
  open_in_new: '', menu: '', close: '',
  light_mode: '', dark_mode: '', contrast: '', groups: '',
});
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
export const NAV_ICON_CONTRACT = Object.freeze({
  assetId: 'icon.material-symbols-rounded.nav-7.300.01',
  file: 'assets/icons/material-nav-300.woff2', bytes: 2500,
  sha256: 'd7e283106ed2898726b24504c4e0f5ad524292984a90a4d29553c7dcf53b9657',
  axes: Object.freeze({FILL: 0, wght: 300, GRAD: 0, opsz: 24}),
  fallback: 'Visible labels remain usable; hide icon glyphs if the font cannot load.',
});

function makeIcon(name) {
  if (!Object.hasOwn(NAV_GLYPHS, name)) throw new Error(`Unapproved navigation glyph: ${name}`);
  const icon = document.createElement('span');
  icon.className = 'nav-icon';
  icon.dataset.navIcon = name;
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = NAV_GLYPHS[name];
  return icon;
}
function decorate(element, name) {
  if (!element) return;
  const current = [...element.children].find(child => child.classList.contains('nav-icon'));
  if (current?.dataset.navIcon === name) return;
  if (current) current.replaceWith(makeIcon(name)); else element.prepend(makeIcon(name));
  element.classList.add('nav-decorated');
}

const TITLES = {
  'fit-map': 'ดูทั้งประเทศ: ทุกจังหวัด ไม่มีโฟกัส',
  'bangkok-map': 'ไปที่กรุงเทพฯ และ 3 เขตที่หนาแน่นที่สุด',
  'toggle-3d': 'สลับมุมมอง 3 มิติ (อาคารทั้งเมือง) กับแผนผัง 2 มิติ',
  'toggle-eye': 'มุมสถาปนิก: มองสถานที่จากระดับถนน อาคารรอบข้างจางลง',
  'mobile-panel': 'เปิดแผงข้อมูลและตัวกรอง',
  'open-help': 'เปิดวิธีใช้',
  'toggle-insights': 'เปิดหรือย่อกราฟเทียบพื้นที่',
  'open-table': 'เปิดตารางสถานที่ตามตัวกรอง',
  'toggle-table': 'ปิดตารางและกลับไปแผนที่',
  'search': 'ค้นหาชื่อสถานที่ ผู้บริหาร หรือรหัส รวมรายการที่ยังยืนยันไม่ได้',
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

function decorateNavigation() {
  const byId = (id, name) => decorate(document.getElementById(id), name);
  byId('close-help', 'close');
  byId('mobile-panel', 'menu');
  byId('close-mobile-panel', 'close');
  byId('toggle-table', 'close');
  const mode = document.getElementById('theme');
  if (mode) decorate(mode.closest('label'), mode.value === 'dark' ? 'dark_mode' : mode.value === 'light' ? 'light_mode' : 'contrast');
  for (const anchor of document.querySelectorAll('.source-link[target="_blank"], .usage-dialog a[target="_blank"], .top-actions a[target="_blank"], .links a[target="_blank"]')) {
    // This glyph only marks destinations that really open a new browsing context.
    decorate(anchor, 'open_in_new');
  }
  for (const [id, title] of Object.entries(TITLES)) {
    const element = document.getElementById(id);
    if (element && element.title !== title) element.title = title;
  }
  const reset = document.querySelector('#filters button[type="reset"]');
  if (reset) reset.title = 'ล้างตัวกรอง';
}

function installHelp() {
  const dialog = document.getElementById('usage-help'), opener = document.getElementById('open-help'), close = document.getElementById('close-help');
  if (!dialog || !opener || !close) return;
  let returnFocus = opener;
  opener.addEventListener('click', () => {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : opener;
    if (!dialog.open) dialog.showModal();
    close.focus({preventScroll: true});
  });
  close.addEventListener('click', () => dialog.close());
  // Native dialog supplies modal focus containment and Escape/cancel behavior.
  dialog.addEventListener('close', () => { const target = returnFocus?.isConnected ? returnFocus : opener; target.focus({preventScroll: true}); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}

export function installNavigation() {
  decorateNavigation();
  installHelp();
  document.getElementById('theme')?.addEventListener('change', decorateNavigation);
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; decorateNavigation(); });
  });
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded']});
  if (document.fonts?.load) {
    document.fonts.load('300 24px "LDS Material Symbols Rounded Nav"', '')
      .then(faces => { document.documentElement.classList.add(faces.length ? 'nav-icons-ready' : 'nav-icons-unavailable'); })
      .catch(() => document.documentElement.classList.add('nav-icons-unavailable'));
    document.fonts.load('300 20px "LDS Material Symbols Rounded Pictogram"', PICTOGRAM_CONTRACT.glyphs.store)
      .then(faces => { document.documentElement.classList.add(faces.length ? 'pictograms-ready' : 'pictograms-unavailable'); })
      .catch(() => document.documentElement.classList.add('pictograms-unavailable'));
  } else document.documentElement.classList.add('nav-icons-unavailable', 'pictograms-unavailable');
  return () => observer.disconnect();
}

if (typeof document !== 'undefined') installNavigation();

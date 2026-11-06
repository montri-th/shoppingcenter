# CityMETER ศูนย์การค้า (Shopping centers) — Implementation Plan

รุ่นแผน 0.13 · 6 พ.ย. 2569 · ใช้คู่กับ [PRODUCT_STATEMENT.md](../PRODUCT_STATEMENT.md) (รุ่น 0.16) · รุ่น 0.13: เว็บรุ่น 0.1.13 ไซต์จากร่าง OpenStreetMap ที่ Claude ตรวจ (D28) · รุ่น 0.12: S33 ร่างไซต์จาก OpenStreetMap ให้ทีมตรวจ (D27) · รุ่น 0.11: เว็บรุ่น 0.1.11–0.1.12 และ S33 งานวิจัยไซต์หลายอาคารส่งทีมวิจัย · รุ่น 0.10: S31 ครบในเว็บรุ่น 0.1.10 · รุ่น 0.9: S32 อาคารต่อพื้นที่ (CityMETER Building V4) + ภูมิประเทศ + ไซต์หลายอาคาร (D25) และ S31 โลโก้ของชุดข้อมูลวิจัย (D26, บางส่วน) ในเว็บรุ่น 0.1.9 · รุ่น 0.8: S27 (D22 + D23) และ S28 (ลิงก์ศูนย์ที่ตรวจแล้ว) ทำแล้วในเว็บรุ่น 0.1.8 · S30 ตัวกรอง “ข้างในมี” และพื้นที่สำหรับสัตว์เลี้ยง · รุ่น 0.7 บันทึกคำสั่งเจ้าของ 21:23–21:56 น. (D22–D24): S27–S28 จากรอเจ้าของเป็นงานที่ทำ และ S29 รูปเขตกรมแผนที่ทหาร (ทำแล้วในเว็บ 0.1.7) · รุ่น 0.6 เพิ่มงาน S23–S26 ตามคำขอเจ้าของ 4 พ.ย. 2569 19:43 น. (D20–D21) · ก่อนหน้า: รุ่น 0.5 · 25 ต.ค. 2569 · ต้นแบบ: CityMETER Luxury Brands รุ่น 0.5 (commit `0ed2b9d`) · รุ่น 0.2 บันทึกสิ่งที่สร้างจริงในเว็บรุ่น 0.1.0 และสถานะงาน (§7) · รุ่น 0.3 บันทึกการอัปเดตข้อมูลหลังปิดรายการรอตรวจรอบแรก (export 15:06 น.), กฎรายประเภทของเจ้าของ (D7), สเกล 41 สี (D8) และการแสดงรายการที่ตรวจแล้วยังยืนยันไม่ได้ (D9) · รุ่น 0.4 บันทึกข้อมูลหลังปิดคิวครบ (export 16:39 น.), ชื่อ “ศูนย์การค้า” (D10), ข้อความแบบข้อค้นพบก่อนไม่มี caveat (D11), อาคารที่หมุดตั้งอยู่ (D12), กราฟ amCharts (D13), ไอคอนตาม LDS (D14), ดุสิต เซ็นทรัล พาร์ค เป็นบริบท (D15) และการแก้มวลอาคารชานเมือง/ต่างจังหวัด (S14–S18) · S19 ตัวเลขบนจอเดียวกันบวกกันได้ · รุ่น 0.5 บันทึกคำสั่งเจ้าของ 18:49 น.: กล้อง 2 จุดลับตาเต็มจอเมื่อกดหมุดหรืออาคาร (D16) มือถือแผนที่มาก่อน (D17) และแผงสถานที่ชื่อ/โลโก้ก่อน (D18) — S20–S22

เป้าหมายรุ่นแรก (0.1.0): เว็บที่หน้าตาและพฤติกรรมเหมือน Luxury Brands — เมือง 3 มิติที่โฟกัสข้อค้นพบแรกทันที โฟกัสแล้วเงียบ basemap กระดาษ อาคารของสถานที่ที่มองเห็นและกดได้เสมอ breadcrumb ที่ใช้รหัสจังหวัดของ production — แต่หน่วยของข้อมูลคือ **สถานที่ค้าปลีก** ไม่ใช่สาขาของแบรนด์ และหน่วยพื้นที่คือ **เขต/อำเภอ** ตามขอบเขตทางการ ไม่ใช่ย่านที่วาดเอง เผยแพร่ที่ `https://montri-th.github.io/shoppingcenter/`

## 1. สิ่งที่ล็อกแล้ว (จาก Product Statement §8)

| รหัส | ข้อตัดสินใจ | ผลต่อการพัฒนา |
|---|---|---|
| D1 | ข้อค้นพบแรก = 3 เขตที่มีแห่ง/ตร.กม. สูงสุดของจังหวัดที่มีเขตหนาแน่นที่สุด (รูปเขต RTSD 4 พ.ย. 2569: สัมพันธวงศ์ พระนคร บางรัก — 50 จาก 861 แห่งของกรุงเทพฯ บนพื้นที่ 0.7% แน่นกว่าค่าเฉลี่ยราว 8 เท่า; snapshot 16:39 น. บนรูปเดิม 49 จาก 856; รอบก่อน ปทุมวัน บางรัก ราชเทวี 36 จาก 185) | สูตรใน `js/area-insight.js` คำนวณจากข้อมูลทุกครั้ง ไม่ใช่ค่าคงที่; ภาพแรก = preset `city` ที่เห็นสามเขตนี้ |
| D2 | ชื่อเต็ม “ศูนย์การค้าและสถานที่ค้าปลีก: จำนวน ประเภท และผู้บริหาร” | ชื่อรองใน JSON-LD (title ตาม D10); ไม่มีตัวชี้วัด GLA หรือ segment |
| D3 | ขนาดแบบค่าประมาณเดิมแสดงเฉพาะในรายละเอียดสถานที่ พร้อมวิธีคำนวณ | หน้าจอแสดง “พื้นที่เช่าราว …” วิธีอยู่ในหลักฐานรายช่อง (D11); ไม่มีใน filter, กราฟ, ตาราง, ผลรวม หรืออันดับ |
| D4 | รายการที่ยังไม่ผ่านนิยามเป็นจุดเทาเงียบ ซ่อนได้ ค้นหาได้ ไม่นับ (ณ วันตัดสิน 10,423 รายการ; snapshot 16:39 น. รอตรวจ 0 + ยังยืนยันไม่ได้ 4,869) | ชั้น circle ของ MapLibre แยกจากหมุด DOM; ไม่อยู่ใน tab order; ไม่เข้าตัวเลขใด |
| D5 | ผู้ใช้บริการทั่วไปเป็นกลุ่มรอง | ไม่มีฟิลเตอร์สิ่งอำนวยความสะดวก |
| D6 | พื้นที่ย่อยที่โครงการแม่ไม่ผ่านนิยาม นับเป็นสถานที่เองเฉพาะที่เป็นศูนย์การค้า/มอลล์ (6 แห่ง รวมเซ็นทรัล พาร์ค) — ใช้กับบทบาทพื้นที่ย่อยเท่านั้น | `ORPHAN_COUNTED_GROUPS` + `OWNER_SHOPPING_CENTRES` ใน `scripts/build-data.py`; แถวมี `countBasis`; หลักฐานรายช่องบอกเหตุผล; test `owner decision D6` |
| D7 | กฎรายประเภทที่เจ้าของยอมรับ (บันทึกในทะเบียน: `owner_<กฎ>_definition_accepted_*`, `owner_confirmed_*`) นับเป็นผ่านนิยาม | `qualification_rule()` → tier `owner` + `ownerRule`; แผงสถานที่ใช้ `tierReading()` (“ผ่านนิยามตามกฎที่เจ้าของข้อมูลยอมรับ · <กฎ>”); count role เป็น allowlist (`COUNTED_ROLES` / `COMPONENT_ROLES` / `HELD_ROLES`) พร้อม `countHold` และ gate `countRoleFallback` |
| D8 | สเกลสีใช้ครบ 41 สีตาม LDS | `buildRamp()` ใน `js/scales.js` (rank → LUT index 0–40) สำหรับเขต จังหวัด และ matrix; `rampLegendHTML()` แสดงครบ 41 สีพร้อม ticks; ตัวเลขบนสีที่หมึกไม่ถึง 4.5:1 อยู่บนพื้นรอง |
| D9 (ข้อเสนอ) | `reviewed_definition_unconfirmed` แสดงในชั้นจุดเทาเดียวกับรอตรวจ ติดป้าย “ยังยืนยันไม่ได้” | tier `unconfirmed`; `pending.json` field ที่ 8 `state = "reviewed"`; legend “ยังยืนยันไม่ได้ <จำนวน>”; การ์ด “ยังยืนยันไม่ได้ · ไม่นับ” |
| D10 | Title TH “ศูนย์การค้า” · EN “Shopping centers” (ความหมายเดิม) | header, `<title>` “[หน้า] · ศูนย์การค้า · CityMETER”, H1, og, JSON-LD name (`PRODUCT_TITLE` ใน `js/panel.js`); ข้อความที่นับทุกกลุ่มใช้ “สถานที่ค้าปลีก” (`SUBJECT`) |
| D11 | Aha first ไม่มี caveat บนหน้าจอ ใช้คำของ ICP | `js/panel.js` เขียนใหม่: วิธี/ฐาน/“ไม่ใช่ …” ย้ายเข้า `<details>` หลักฐานรายช่อง; ป้ายสั้น (กำลังจะเปิด · ปิดแล้ว · ยังยืนยันไม่ได้ · ร้านข้างใน); ข้อค้นพบบอก “แน่นกว่าค่าเฉลี่ย N เท่า” (`densityRatio`); test ตัด `<details>` แล้วห้ามเหลือคำ caveat |
| D12 | อาคารที่หมุดตั้งอยู่สำหรับทุกหมุดที่นับได้ 8 ประเภท | `js/pin-buildings.js` (pin-in-footprint ≤ 3 ม. ต่อ polygon part บน z14 tile ที่โหลดแล้ว, parts ของ outline, ชิ้นใน tile ข้างเคียง) → `buildings.setPinFeatures()` สีเดียวกับ host; massing ทิ้ง building เดียวกันจาก focus tier (`sameBuilding`) และไม่ซ่อน feature ที่ถูกรวมด้วย id; แผงบอกชนิดอาคาร |
| D13 | กราฟ amCharts | `vendor/amcharts5/amcharts5-5.20.8.mjs` (esbuild ESM ของ npm 5.20.8, exports am5/am5xy/Animated) + LICENSE; `js/charts.js` โหลดเมื่อเปิดกราฟ, root ต่อกราฟ dispose ทุกครั้ง, focusableGroup + Enter, HTML fallback |
| D14 | ไอคอนตาม LDS | `scripts/build-pictogram-font.py` สร้าง subset 40 glyph (FILL 0 wght 300 GRAD 0 opsz 24) + เขียน CSS block; nav-7 ไม่แก้ไบต์; `PICTOGRAM_CONTRACT` ใน `js/navigation.js` |
| D15 (ข้อเสนอ) | `parent_context_*` เป็นบริบท | `qualification_rule()` → `excluded`; เซ็นทรัล พาร์ค นับผ่าน D6; ผ่านนิยาม 6,135 = ชีต |
| D16 | กดหมุดหรืออาคาร → อาคาร 3 มิติ 2-point perspective เต็มจอเสมอ | `js/camera.js` `fitBuilding()` (preset `eye` pitch 75° fov 24°, padding ศูนย์ ขอบฟ้าอยู่นอกภาพ) + `twoPointBearing()` (ทิศผนังหลัก + 45° เลือกมุมที่อาคารอื่นของครอบครัวสถานที่บังน้อยสุด แล้วใกล้ bearing ปัจจุบันสุด) · `js/app.js` `frameVenue()` / `visibleBox()` (พื้นที่ว่างใต้ toolbar เหนือการ์ด legend แถบกราฟ ตาราง หรือแผงล่าง) · ยังไม่รู้อาคาร → กรอบ 90 ม. รอบหมุด แล้ว `refitVenueOnNewBuilding()` เมื่ออาคารของหมุดมาถึง (≤ 2 ครั้ง ไม่ทำเมื่อผู้ใช้เลื่อนแผนที่เอง) · ปุ่ม “มุมสถาปนิก” = จัดภาพใหม่ · GeoJSON sources ทั้งหมด `maxzoom: 22` กัน MapLibre 5.6.2 crash ที่ zoom 17–18 |
| D17 | มือถือแผนที่มาก่อน | ทุกการเลือกปิดแผงล่าง แสดงการ์ด `#map-aha` ตามระดับ (`mapCardAha/Venue/District/Pending/Search` ใน `js/panel.js`) พร้อมปุ่ม primary “ดูรายละเอียด” (`data-action="open-panel"`) · เปิดแผงแล้วจัดอาคารใหม่เหนือแผง ปิดแล้วจัดใหม่เต็มแผนที่ · attribution ของแผนที่ขยับขึ้นเหนือการ์ด |
| D18 | แผงสถานที่กระชับ ชื่อ/โลโก้ก่อน | ระดับรายละเอียด: `#panel.is-detail` ซ่อนหัวข้อชุดข้อมูล (คงไว้ให้ screen reader) ค้นหา และตัวกรอง · ปุ่มกลับ `#panel-back` อยู่แถว breadcrumb · `renderVenue()`: โลโก้ + ชื่อ → สถานะ → ตัวเลขหลัก (ค่าที่รายงานเท่านั้น) → ปุ่มติดต่อ → ข้อเท็จจริงสั้น · พิกัด หมายเหตุเวลาเปิด ที่อยู่ต่างจังหวัด และ “ยังไม่พบอาคาร” ย้ายไปหลักฐานรายช่อง |

## 2. สถาปัตยกรรม (fork จาก Luxury Brands)

Static HTML/CSS + ES modules ไม่มี build step ไม่มี framework ไลบรารีภายนอกคือ MapLibre GL 5.6.2 (URL ที่ pin ไว้) และ amCharts 5.20.8 (bundle ใน repository พร้อม LICENSE, D13) basemap และมวลอาคารจาก OpenFreeMap กราฟ HTML/SVG ที่วาดเองเป็นทางสำรอง `npm test` ใช้ Node test runner ข้อมูลทั้งหมดสร้างล่วงหน้าโดยสคริปต์ Python ใน `scripts/` แล้ว commit เป็นไฟล์ใน `data/`

| โมดูล | จาก Luxury | สิ่งที่เปลี่ยน |
|---|---|---|
| `index.html`, `styles.css`, `navigation.css`, `assets/theme.css`, `js/launch.js`, `js/vendors.js` | คงโครงหน้าจอ, launch overlay, tokens, ฟอนต์ LDS, icons | ข้อความไทยใหม่ทั้งหมด; ช่องค้นหา; legend กลุ่มประเภท + สวิตช์ “รายการรอตรวจ”; public origin ใหม่ |
| `js/model.js` | taxonomy, ตัวกรองร่วม, `PROVINCES` | กลุ่มประเภท 8 กลุ่ม (เพิ่มไฮเปอร์/ซูเปอร์มาร์เก็ตที่มีร้านเช่า), ระดับการผ่านนิยาม, สถานะ (อุปทาน / โครงการอนาคต / ปิดตามหลักฐาน), กลุ่มผู้บริหาร; `PROVINCES` ครบ 77 จังหวัดจาก production (`base/info/lv0` → `abbrEn`) |
| `js/neighborhoods.js` → `js/areas.js` | point-in-polygon + membership | membership คำนวณล่วงหน้าใน pipeline (`provinceCode`, `districtCode` ต่อแถว) จากขอบเขตความละเอียดเต็ม; client ใช้เฉพาะสรุปต่อพื้นที่ |
| `js/area-insight.js` | Aha 3 ย่าน | Aha 3 เขตตามแห่ง/ตร.กม. (สูตร §4); คืน `{province, districtIds, count, total, share, areaKm2, provinceAreaKm2, areaShare}` |
| `js/scales.js` | LUT `count` 41 ค่า + EVID-05 | เพิ่ม LUT `density.area` 41 ค่า (scaleVersion `554812a7…`); ใช้ครบ 41 ตัวอย่างตามลำดับค่าของการอ่าน (`buildRamp`, D8) แทน class table 3/5 ระดับ (§5); `count` ใช้กับจังหวัดและตาราง matrix |
| `js/map-layers.js` | choropleth ย่าน + focus/quiet | choropleth เขต/อำเภอ (`density.area`) ภายในจังหวัดที่อ่านอยู่; เขตนอกโฟกัสเป็นเส้นบาง; ป้ายชิปชื่อเขต |
| `js/provinces.js` | กรอบจังหวัด country view | ใช้ 77 จังหวัด, ค่า = จำนวนสถานที่ (`count` classes แบบประกาศคงที่), ป้ายชิป, drill-down |
| `js/pins.js` | หมุดรายแถว DOM, context pins, โลโก้ zoom ≥ 14 | หนึ่งหมุด = หนึ่งสถานที่ที่ผ่านนิยามและระบุตำแหน่งได้; สีกลุ่ม + **รูปทรงกำกับ** (SVG ต่อหมุด); โครงการอนาคตเป็นหมุดเส้นประ, ปิดตามหลักฐานเป็นหมุดกลวง; โลโก้สถานที่แทนโลโก้แบรนด์ |
| **ใหม่** `js/venue-points.js` | — | GPU layers: รายการรอตรวจ (circle minzoom 11, สีเทา token, ไม่มีโลโก้, กดแล้วเปิดการ์ดย่อ, ซ่อนได้ `pending=0`) · จุดบริบทของทุกสถานที่ที่ผ่านนิยาม · สัญลักษณ์รูปทรงของสถานที่ในโฟกัสเมื่อเกิน 600 หมุด |
| **ใหม่** `js/cues.js`, `js/details.js`, `js/evidence.js` | — | รูปทรงกำกับ 8 แบบ (SVG + canvas icon) · โหลดรายละเอียดรายสถานที่จาก shard · ข้อความอ่านหลักฐานรายช่อง |
| `js/buildings.js`, `js/venue-xray.js`, `js/massing.js`, `js/mvt.js`, `js/geometry.js`, `js/camera.js`, `js/map-style.js` | อาคารของสถานที่, x-ray, มวลอาคารสองชั้น, กล้อง, basemap | id เชื่อมอาคารเปลี่ยนเป็น `venue_id`; `buildings.js` รับอาคารที่หมุดตั้งอยู่ด้วย (D12); `massing.js` วัดการจางจากจุดสถานที่ในโฟกัส + กลางภาพ และจาก part ที่ใกล้ที่สุดของ feature ที่ถูกรวม; focus tier ตามหน้าที่เปิด (วง 650 ม. รอบสถานที่ · ทั้งเขตเมื่อ ≤ 40 ตร.กม. ไม่เช่นนั้นวงรอบ 24 สถานที่ใกล้ศูนย์กลางเขต) |
| **ใหม่** `js/pin-buildings.js` | — | อาคารที่หมุดตั้งอยู่จาก tile ของแผนที่ฐาน (D12) |
| `js/profile-model.js`, `js/panel.js` | โปรไฟล์ย่าน/สถานที่/ร้าน | โหมด: ภาพรวม (ประเทศ/จังหวัด) · เขต/อำเภอ · สถานที่ · รายการรอตรวจ · ผลค้นหา; แผงสถานที่แสดงหลักฐานรายช่อง (§6) |
| `js/chart-model.js`, `js/charts.js` | อันดับ / matrix / exclusive-shared | amCharts (D13): อันดับพื้นที่ (สลับแห่ง/ตร.กม. กับจำนวน) · ประเภทในแต่ละพื้นที่ (สัดส่วน/จำนวน + ปุ่มคำอธิบายพร้อมรูปทรง) · ผู้บริหารที่ระบุชื่อได้ (หางยาวและไม่ระบุอยู่เหนือกราฟ) · ขอบเขตเดียวกันทุกมุมมอง: สถานที่ที่อยู่ในเขต/อำเภอของจังหวัดที่อ่าน หรือของทั้งประเทศ และคำบรรยายกราฟนับชุดเดียวกันนี้ · fallback HTML ช่องเท่ากันแบบเดิม |
| `js/breadcrumb.js` | ประเทศไทย › จังหวัด › ย่าน › สถานที่ | ประเทศไทย › จังหวัด › เขต/อำเภอ › สถานที่ (เขตในกรุงเทพฯ, อำเภอนอกกรุงเทพฯ) |
| `js/venue-logos.js` | ทะเบียนโลโก้สถานที่ | ค้นด้วย `venue_id` เท่านั้น ไม่ fuzzy |
| ตัดออก | `brand-logos.js`, `data/luxury.json`, `legacy-audit.json`, `neighborhoods.geojson`, เอกสารย่าน | — |

## 3. สัญญาข้อมูล (data contract)

สร้างโดย `scripts/build-data.py` จาก export CSV ของ Research Master (01_VENUES, 10_VENUE_LOGOS, 09_RELATIONSHIPS), ชุดรูปทรงอาคาร `CityMETER-retail-venue-host-geometry-2026-10-23`, ขอบเขต OpenGISData-Thailand (commit `fafcea1`) และรายชื่อจังหวัด/เขตของ production (`/api/v2/citymeter-v3/base/info/lv0`, `/info/lv1/{provinceId}`) บันทึก sha256 ของทุก input ใน `meta.inputs`

| ไฟล์ | เนื้อหา | ขนาดเป้าหมาย |
|---|---|---|
| `data/venues.json` | `meta` (snapshot, นิยาม, ตารางจับคู่กลุ่ม, counts, checks, inputs + SHA-256) + `rows` 6,135 สถานที่ที่ผ่านนิยามแบบ core fields (ตัวตน กลุ่ม การนับ สถานะ ผู้บริหาร จุด พื้นที่) | จริง 3.43 MB (gzip 392 KB ที่ Pages ส่งจริง) — โหลดภาพแรกราว 3 วินาทีในการจำลอง 7,800 แห่ง |
| `data/details/NN.json` | หลักฐานรายช่องเต็มต่อสถานที่ แบ่ง shard ด้วย FNV-1a ของ `venue_id` (อย่างน้อย 32 shard เพิ่มเองตามขนาดทะเบียน) โหลดเมื่อเปิดสถานที่ | รอบนี้ 256 shard เฉลี่ย 72 KB (37–129 KB) |
| `data/pending.json` | รายการที่ยังไม่ผ่านนิยามที่ระบุตำแหน่งได้แบบ columnar: `id, name, lon, lat, provinceCode, districtCode, group, state` (`state = "reviewed"` เมื่อตรวจแล้วยังยืนยันไม่ได้) | ≤ 1.2 MB (4,851 จุดรอบนี้; โหลดหลังภาพแรก) |
| `data/build-report.json` | คำของสถานะการผ่านนิยาม บทบาทการนับ และพิกัดพร้อมกฎที่อ่าน ประเภทที่จัดด้วย keyword พื้นที่ย่อยที่ไม่มีโครงการแม่ — สำหรับตรวจก่อนเผยแพร่ ไม่ได้โหลดโดยหน้าเว็บ | — |
| `data/provinces.geojson` | 77 จังหวัด simplified, `id` = รหัส production (`BKK`), `dopa`, `th`, `en`, `areaKm2` | ≤ 300 KB |
| `data/districts.geojson` | 928 เขต/อำเภอ simplified แบบรักษา topology, `id` = รหัส 4 หลัก (= `code` ของ production), `province`, `th`, `en`, `areaKm2` | ≤ 1.5 MB |
| `data/venue-buildings.geojson` | 130 รูปทรงของ 77 สถานที่ที่ผ่านนิยาม (footprint 77, part 53) map เข้า schema ของ `buildings.js`; ความสูงที่ไม่รู้คงเป็น `null` | ≤ 900 KB (จริง 195 KB) |
| `data/venue-logos.json`, `assets/venue-logos/` | โลโก้ที่ตรง sha256 ของทะเบียน (โหลดผ่าน Drive connector) | — |

แถวใน `venues.json` (ชื่อฟิลด์ camelCase): ตัวตน (`id` = `venue_id`, `name`, `nameTh`, `nameEn`, `scId` = `mall_external_id`, `citymeterId`, `citymeterStatus`) · ประเภท (`group`, `groupBasis` evidence/legacy, `venueType`, `legacyType`, `subtype`) · นิยาม (`tier` supported/owner/historical/planned, `ownerRule`, `qualification`, `countable`, `countRole`, `countHold`, `parentId`, `hierarchyRole`) · สถานะ (`status` supply/planned/closed, `operationGroup`, `operation`) · ผู้บริหารและการติดต่อ (`operator`, `operatorGroup`, `website`, `directory`, `phone`, `hours`, `hoursScope`, `yearOpened`) · ขนาด (`size` เฉพาะค่าที่มี: reported GLA/GFA/site/floors/tenants พร้อมขอบเขต, legacy GLA/GFA พร้อม `basis`) · ที่ตั้ง (`address`, `addrProvince`, `addrDistrict`, `lat`, `lon`, `located`, `coordinateStatus`, `coordinateRole`) · พื้นที่ (`provinceCode`, `districtCode` จาก point-in-polygon เฉพาะ `located`) · ร้านข้างใน (`stores` = จำนวนยืนยัน + ชุดข้อมูล) · หลักฐาน (`ev` ต่อช่อง: basis, url, checkedOn) · `logoKey`, `buildings`

กติกา: ไม่มีลิงก์ `docs.google.com` / `drive.google.com` หรือรหัสชีตภายในในไฟล์สาธารณะ (หลักฐานที่เป็นไฟล์ภายในแสดงเป็น “เอกสารภายใน” ไม่มีลิงก์) · ค่าว่างคือ `null` ไม่ใช่ 0 · ไม่แก้ค่าต้นทาง ค่าดิบที่ใช้จัดกลุ่มอยู่คู่กันเสมอ

## 4. ตัวเลขและกติกาการนับ

- **ผ่านนิยาม** = `venue_qualification_status` กลุ่ม definition-supported / qualified หรือกฎรายประเภทของเจ้าของ (ปัจจุบัน 717 · ตามกฎของเจ้าของ 5,191 · ย้อนหลัง 223 · อนาคต 4 = 6,135 ตรงกับชีต); `pending_*` = รอตรวจ (0) และ `reviewed_*_unconfirmed` = ยังยืนยันไม่ได้ (4,869) — ไม่นับทั้งสองอย่าง; `parent_context_*` เป็นบริบท (D15)
- **นับได้** = ผ่านนิยาม และ `count_role` อยู่ในบทบาทที่นับ (ไม่ใช่พื้นที่ย่อย อาจซ้ำ รอตรวจการนับ หรือบริบท; สถานะที่ระบุว่าอาจซ้ำไม่นับเสมอ) + พื้นที่ย่อยที่เป็นศูนย์การค้า/มอลล์ซึ่งโครงการแม่ไม่ผ่านนิยาม (D6, 6 แห่ง) → 6,084
- **อุปทาน** = นับได้ ไม่ใช่ `future_project` และไม่ใช่ `closed_source_evidence` → 6,079
- **ระบุตำแหน่งได้** = `coordinate_status` เป็นจุดที่เลือกแล้ว (ไม่ใช่ `not_collected*`, `held_*`, `not_selected*`, ว่าง) → 6,014 ใน 77 จังหวัด 734 เขต/อำเภอ; อีก 55 แห่งไม่มีพิกัดที่ผ่านเกณฑ์และ 10 แห่งมีจุดนอกขอบเขต — อยู่ในรายการและตาราง ไม่เข้าตัวเลขรายพื้นที่
- **ไม่นับแยก** (51: พื้นที่ย่อย 22 · อาจซ้ำ 16 · รอตรวจการนับ 12 · บริบท 1) ไม่บวกกับโครงการแม่; แสดงในแผงของโครงการแม่เมื่อหา parent ได้; ที่หา parent ไม่ได้และไม่เข้า D6 (41) รายงานเป็นรายการตรวจสอบพร้อม `hold`
- **ข้อค้นพบแรก (D1):** ในขอบเขตตัวกรองปัจจุบัน (ไม่รวมการเลือกพื้นที่) หาเขตที่มีแห่ง/ตร.กม. สูงสุดของประเทศ → จังหวัด P ของเขตนั้น (หรือจังหวัดที่ผู้ใช้เลือก) → เรียงเขตใน P ตามแห่ง/ตร.กม. (เสมอกันใช้จำนวน แล้วรหัส) เลือก 3 เขตแรกที่มี ≥ 1 แห่ง → ตัวตั้ง = จำนวนในสามเขต · ตัวหาร = อุปทานที่ระบุตำแหน่งได้ใน P · บริบทพื้นที่ = ผลรวมพื้นที่สามเขต ÷ พื้นที่ P (ผลรวมพื้นที่เขตจากแหล่งขอบเขตเดียวกัน) · ทุกตัวเลขมาพร้อม dataset · source · date · boundary
- **ผู้บริหาร:** `operatorGroup` จากตารางชื่อที่ประกาศไว้ (ชื่อบริษัทที่ระบุก่อนในข้อความ; รวมสะกดไทย/อังกฤษของบริษัทเดียวกัน) — Inference ที่เผยแพร่ใน `DATA_METHOD.md`; ข้อความดิบแสดงในรายละเอียดเสมอ; กราฟเรียกว่า “สัดส่วนจำนวนสถานที่” ไม่ใช่ market share

## 5. สีและสัญลักษณ์ (LDS 0.9.7)

- เขต/อำเภอ: `density.area` (แห่ง/ตร.กม.) ใช้ครบ 41 ตัวอย่างของ LUT ตามลำดับค่าของการอ่านนั้น (D8: mid-rank percentile ยืดเป็น index 0–40, ค่าเท่ากันได้สีเดียวกัน ไม่ interpolate) · legend แสดงครบ 41 สีพร้อมค่าที่ตำแหน่งของค่าต่ำสุด สูงสุด และใกล้ index 10/20/30 · measured zero = index 0 + `zeroOutline` · นอกจังหวัดที่อ่าน = out_of_scope ไม่ระบาย — รุ่น 0.2 ใช้ class table 3/5 ระดับ; เจ้าของสั่งให้ใช้ครบ 41 สี 25 ต.ค. 2569
- จังหวัดและช่อง matrix: `count` ด้วยกติกา 41 ตัวอย่างเดียวกัน · ตัวเลขบนช่องที่สี index 27–29 อยู่บนพื้นรองกลาง · HEX เดียวกันสองธีม
- กลุ่มประเภท: `landometer-series-10-v8` พร้อม cue ของ series — ศูนย์การค้า coral/circle · คอมมูนิตี้มอลล์ teal/hexagon · ตลาด lime/diamond · ไฮเปอร์/ซูเปอร์มาร์เก็ตที่มีร้านเช่า mint/cross · พื้นที่ค้าปลีกในโครงการ sky/star · เอาท์เล็ต blue/ring · สถานีบริการน้ำมันและจุดพักรถ green/plus · อื่น ๆ slate/dash (ไม่มีม่วงหรือน้ำตาล; ไม่ใช้ series 2–3 ส้ม/ทองที่ชนกับ choropleth)
- อาคารของสถานที่และอาคารที่หมุดตั้งอยู่: map role เดิมของ Luxury (`map.activeLayer`) · ไอคอน UI: Material Symbols Rounded FILL 0/wght 300 คู่คำสั้นเสมอ (D14) · รายการที่ยังไม่ผ่านนิยาม: `--border-default` ขนาดเล็ก · ไม่มี bracket หรือแถบสีซ้ายเชิงตกแต่ง · focus ring มองเห็นได้

## 6. หน้าจอและพฤติกรรม

- **ภาพแรก:** preset `city` (pitch 56, bearing 28) จัดกรอบ 3 เขตของ Aha, focus อัตโนมัติ; แผงแสดง “6% ของสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้ — 49 จาก 856 แห่ง บนพื้นที่เพียง 0.7% ของกรุงเทพฯ · แน่นกว่าค่าเฉลี่ยของกรุงเทพฯ 8 เท่า” (snapshot 16:39 น.; คำนวณใหม่ทุกครั้ง) + คำสั่ง: ดูทุกเขตในจังหวัด (`areas=all`) · ดูทั้งประเทศ · เทียบพื้นที่ — ไม่มี caveat บนหน้าแรก
- **ทั้งประเทศ (zoom < 9):** กรอบจังหวัดระบาย `count` + ป้ายชิป + รายการจังหวัดในแผง → drill-down
- **จังหวัด:** เขต/อำเภอของจังหวัดนั้นระบาย `density.area`; โปรไฟล์จังหวัด (จำนวนตามกลุ่ม ผู้บริหาร กำลังจะเปิด ปิดแล้ว และ “อีก k แห่งยังระบุเขต/อำเภอไม่ได้” — ไม่มีพิกัด หรือหมุดอยู่นอกเส้นเขต)
- **เขต/อำเภอ:** preset `model`; โปรไฟล์เขต + รายการสถานที่; สถานที่นอกเขตเป็นจุดเทา
- **สถานที่:** กล้อง 2 จุดลับตา (`eye`) จัดอาคารของสถานที่ให้เต็มพื้นที่แผนที่ที่ว่างทุกครั้งที่กดหมุดหรืออาคาร (D16) — ยังไม่รู้อาคารใช้กรอบรอบหมุดแล้วหันหาอาคารเมื่อพบ; แผงขึ้นด้วยโลโก้และชื่อ (D18); มือถือแผนที่มาก่อน การ์ดล่าง + “ดูรายละเอียด” (D17); อาคารสีน้ำเงิน = อาคารของสถานที่ หรืออาคารที่หมุดตั้งอยู่ (D12); มวลอาคารรอบ ๆ ในวง 650 ม.; หน้าจอแสดงค่า (ผู้บริหาร ติดต่อ เวลาเปิด ปีที่เปิด ขนาด ที่อยู่ พิกัด ร้านข้างใน อาคาร) ส่วนรายการหลักฐานรายช่อง (พับไว้, D11): ชื่อ (ฐานของชื่อ), กลุ่มประเภท + ค่าต้นทาง, การผ่านนิยาม (ด้วยหลักฐาน หรือกฎของเจ้าของ · ชื่อกฎ), เหตุผลที่ไม่นับแยก, สถานะ + แหล่ง, ผู้บริหาร, เว็บทางการ/ไดเรกทอรีร้าน/โทร/เวลาเปิด (+ขอบเขตของเวลา), ปีที่เปิด, ขนาด (ค่าที่รายงาน หรือค่าประมาณเดิมพร้อมวิธีคำนวณ — D3), ที่ตั้ง + บทบาทพิกัด, ร้านที่ยืนยันว่าอยู่ข้างใน (จำนวน + ชุดข้อมูล + ลิงก์ Luxury Brands `?place=` เมื่อมี), พื้นที่ย่อย/โครงการแม่, รหัส (`venue_id`, Shopping Center id, CityMETER id)
- **รายการที่ยังไม่ผ่านนิยาม:** กดจุดเทาแล้วได้การ์ดย่อ: ชื่อ ประเภท สถานะ (“รอตรวจ · ไม่นับ” หรือ “ยังยืนยันไม่ได้ · ไม่นับ”) พิกัด และรหัส
- **ค้นหา:** ชื่อไทย/อังกฤษ ผู้บริหาร และรหัส (substring หลัง normalize ไม่ fuzzy) ผลที่ผ่านนิยามมาก่อน รายการที่ยังไม่ผ่านนิยามติดป้ายสถานะ
- **ตัวกรอง:** กลุ่มประเภท · ผู้บริหาร · สถานะ (เปิดอยู่หรือรอยืนยัน ค่าเริ่มต้น / กำลังจะเปิด / ปิดแล้ว / ทุกสถานะ) · จังหวัด · ค้นหา
- **URL:** `province`, `district`, `venue`, `brand` (หน้าแบรนด์ D21, รุ่น 0.6), `record`, `pending`, `group`, `operator`, `status`, `q`, `areas`, `view`, `view3d` (`cam` เลิกใช้ในรุ่น 0.5: ระดับสถานที่ใช้กล้อง 2 จุดลับตาเสมอ — D16)
- **สามขอบเขตแถว** (สัญญาเดิม): `rows` → หมุด ตัวนับ ตาราง; `scopeRows` (ตัวกรองก่อนเลือกพื้นที่) → Aha, choropleth, กราฟ; `baseRows` → ฐานเทียบโปรไฟล์
- **ช่องทาง:** `<noscript>` + ตาราง HTML สรุปจังหวัดที่สร้างตอน build, JSON-LD `Dataset`, `data/venues.json` สำหรับ agent

## 7. แผนงาน

| ID | งาน | ผลลัพธ์ / หลักฐานที่ต้องได้ | สถานะ |
|---|---|---|---|
| S00 | Product Statement (MBB §7.2) | `PRODUCT_STATEMENT.md` รุ่น 0.6 + การตัดสินใจ D1–D4, D6–D8, D10–D14 และข้อเสนอ D5, D9, D15 | done |
| S01 | Pipeline สถานที่ | `scripts/build-data.py` → `venues.json`, `details/`, `pending.json`, `build-report.json`; counts 6,135/6,084/6,079/6,014 และ D1 49/856 ตรงกับ `meta.checks.aha` ด้วย test (รอบ 15:06 น. 6,045/5,997/5,992/5,928 และ 49/838) · `npm run data:refresh` รันใหม่ด้วยคำสั่งเดียว และพิมพ์รายการ REVIEW ก่อน gate | done |
| S02 | ขอบเขต + รหัส production | provinces 77 / districts 928 simplified; ทุก `id` ตรง production lv0/lv1 (remap `4026` → `4029` บันทึกใน meta) | done |
| S03 | อาคารของสถานที่ | 130 รูปทรงของ 77 สถานที่ (parts 10 · footprint 67); parent ที่มี parts เป็น outline; ความสูงไม่รู้คง `null` + display fallback 3 ม. | done |
| S04 | โลโก้สถานที่ | ไฟล์ตรง SHA-256 ของทะเบียน; ไม่มีลิงก์ Drive · จำนวนไฟล์ที่ตรวจแล้วอยู่ใน `data/venue-logos.json` `meta.status` (ครบ 113 จาก 113 · ผูกกับ 108 สถานที่ที่นับได้) | done |
| S05 | Model + ตัวกรอง + Aha | `model.js`, `areas.js`, `area-insight.js` + unit tests บนข้อมูลจริง | done |
| S06 | แผนที่ | choropleth เขต/จังหวัด, หมุดรูปทรง, จุด GPU ของรายการรอตรวจและบริบท, อาคาร, มวลอาคาร focus (S16 ปรับใหม่) | done |
| S07 | แผง + breadcrumb + URL | ทุกโหมดใน §6; crumbs 4 ระดับ; permalink คืนสถานะ | done |
| S08 | กราฟ + ตาราง | เขตหนาแน่น, matrix ช่องเท่ากัน, ผู้บริหาร; ตารางทีละ 25 แถว (S17 เปลี่ยนเป็น amCharts) | done |
| S09 | ข้อความ, help, SEO, noscript | คำไทยสั้นตาม Voice; ไม่มี caveat บนหน้าแรก; JSON-LD + ตาราง noscript สร้างด้วย `scripts/build-static.py` | done |
| S10 | ทดสอบ | `npm test` (ผลล่าสุดใน `handoff/VERIFICATION.md`); harness 20 สถานการณ์ (390/1280 × light/dark, ล้มเหลวของแผนที่, คีย์บอร์ด); Chrome จริงบน live — ผลใน `handoff/VERIFICATION.md` | done |
| S11 | Release | push `main`, เปิด Pages (main, /), `verify:live` ทุกไฟล์ตรง manifest (ผลล่าสุดใน `handoff/VERIFICATION.md`) · import map ให้ทุก module ใช้ cache tag เดียวกับ entry | done |
| S12 | Handoff | README, DATA_METHOD, AGENTS, docs/BUILD_CARD, `assets/manifest.json`, `handoff-manifest.json` (local) · เก็บ PS + แผนใน Drive `02_CityMETER/03_OUTPUTS_AND_EXAMPLES` · product-statement / implementation-plan แบบ JSON ยังไม่ทำ (เลื่อนไปรอบหลังข้อมูลชุดใหญ่) | partial |
| S13 | อัปเดตข้อมูลหลังปิดรายการรอตรวจรอบแรก | export 15:06 น. 25 ต.ค. 2569 · จัดกฎสถานะใหม่ (D7, `unconfirmed`, `not_qualifying`) · บทบาทการนับใหม่ · ประเภทใหม่ 60 ค่า · สเกล 41 สี (D8) · เอกสารทุกฉบับ · ตรวจ live | done |
| S14 | อัปเดตข้อมูลหลังปิดคิวครบ | export 16:39 น. · บทบาท `retail_component_scope_not_entire_hotel_tower` · ประเภทใหม่ 92 ค่า · ชื่อกฎ `exact_inside_multiple_businesses`, `foodland_tooklaedee` · `parent_context_*` → บริบท (D15) · ผ่านนิยาม 6,135 = ชีต | done |
| S15 | อาคารที่หมุดตั้งอยู่ (D12) | `js/pin-buildings.js` + `buildings.js` + panel · ทดสอบกับ tile จริงของ OpenFreeMap ใน Chrome ก่อนเผยแพร่ (สีลม: สีลมเอจ podium+tower, พาร์ค สีลม ขอบ 1 ม., ตลาดในอาคาร) · unit tests 8 ข้อ | done (ตรวจ live หลังเผยแพร่ใน `handoff/VERIFICATION.md`) |
| S16 | มวลอาคารชานเมือง/ต่างจังหวัด | สาเหตุ (ตรวจบน live ที่ซีคอน บางแค): จุดวัดการจางเป็นเขตโฟกัสของหน้าแรก และ feature ที่ถูกรวม 4,204 หลังวัดจากจุดแรก → จางหายทั้ง tile · แก้: จุดสถานที่ในโฟกัส + กลางภาพ, part ที่ใกล้ที่สุด, focus ตามหน้าที่เปิด | done (ตรวจ live ใน `handoff/VERIFICATION.md`) |
| S17 | กราฟ amCharts + ไอคอน LDS (D13, D14) | bundle 5.20.8 + LICENSE, สามมุมมองพร้อมสวิตช์และปุ่มคำอธิบาย, focus group + Enter, fallback HTML · glyph 40 ตัว | done |
| S18 | ชื่อและข้อความ (D10, D11) | title “ศูนย์การค้า”, ข้อความแผงทั้งหมดเขียนใหม่, help, legend, JSON-LD, noscript, เอกสาร | done |
| S19 | ตัวเลขบนจอเดียวกันต้องบวกกันได้ | ตรวจ live พบคำบรรยายกราฟ “878 แห่ง · ทุกเขตในกรุงเทพฯ” คู่กับ “49 จาก 856 แห่ง” (22 แห่งไม่มีพิกัด) · แก้: กราฟนับเฉพาะสถานที่ในเขต/อำเภอ, บรรทัด “อีก k แห่งยังระบุเขต/อำเภอไม่ได้” รวมจุดนอกเส้นเขต, ตาราง “หมุดอยู่นอกเส้นเขต” · วันเปิดแสดงวันที่ครั้งเดียว (ไม่ซ้ำปี) · tag `20261025-r7` | done (ตรวจ live ใน `handoff/VERIFICATION.md`) |
| S20 | กล้อง 2 จุดลับตาเต็มจอ (D16) | `fitBuilding()` + `twoPointBearing()` + `occlusionScore()` + `visibleBox()`; unit tests ด้วยกล้อง pinhole ตามสูตร MapLibre (เต็มกรอบ ± 1%, กึ่งกลาง ± 1.5 px, หลบอาคารที่บัง) · harness: เกษรวิลเลจ desktop เต็มความสูง 100% / มือถือเต็มความกว้าง 100% · GeoJSON `maxzoom 22` แก้ MapLibre crash | done (ตรวจ live ใน `handoff/VERIFICATION.md`) |
| S21 | มือถือแผนที่มาก่อน (D17) | การ์ด 5 แบบ + ปุ่ม “ดูรายละเอียด” · แผงล่างไม่เปิดเองอีก (รวมการเปิดจาก URL) · โฟกัสคีย์บอร์ดเข้าแผงเมื่อเปิด · attribution เหนือการ์ด | done |
| S22 | แผงสถานที่กระชับ (D18) | `is-detail` + `#panel-back` · hero โลโก้/ชื่อ · ตัวเลขหลักเฉพาะค่าที่รายงาน · ปุ่มติดต่อ (tel:) · `hoursShort()` · tests 101 | done |
| S23 | ทบทวนชุดข้อมูลใหม่ในทะเบียน | Registry export 4 พ.ย. 2569 (R01 29 ชุด) + `02_STORES`/แท็บสถานที่ของ research master 11 ชุด · ตารางความลึก/ความกว้างและลิงก์ศูนย์ใน PS §9 · ระบุชุดที่ลิงก์ศูนย์ยังเป็น candidate | done |
| S24 | ชุดข้อมูลร้านค้าที่แหล่งทางการระบุชื่อศูนย์ (D20) | `scripts/link-research-tenants.py` + `named_gate` · 7 ชุด 1,252 รายการ · หนึ่งแบรนด์ต่อหนึ่งสถานที่ · รายการเดิมไบต์เดิม · `tests/research-tenants.test.js` (fixture ของเกณฑ์) และ `tests/tenant-roster.test.js` (receipt ↔ shard) | done |
| S25 | ดัชนีรายชื่อร้าน | `scripts/build-tenant-index.py` → `data/tenant-index.json` (3,713 แถว · 593 แบรนด์ · 110 KB) · test เทียบทุกแถวกับ shard และคีย์แบรนด์กับ `normalizeText()` | done |
| S26 | ส่วนผสมร้าน · เทียบศูนย์ใกล้เคียง · หน้าแบรนด์ (D21) | `tenantMix` / `comparePeers` / `brandPresence` / `searchBrands` ใน `js/tenants.js` · `renderTenantMix` / `renderPeers` / `renderBrand` / `mapCardBrand` ใน `js/panel.js` · โหมดแผง `brand` + `?brand=` · สีจังหวัดของแบรนด์ · `tests/tenant-index.test.js` · ตรวจ 390/1280 × สว่าง/มืดใน harness และบนเว็บจริง (`handoff/VERIFICATION.md`) | done |
| S27 | D22 + D23 (เจ้าของอนุมัติ 21:23–21:24 น.) | ตัวเลข “ร้านข้างใน” ของภาพรวม ย่าน รายการ ตาราง การ์ด และแผงสถานที่จากรายชื่อชุดเดียวกัน (`applyShopLists` · `r.shopCount` · ไม่มีรายชื่อ = “—”) · หน่วยสาขา (`same_branch` / `branches` ใน `link-research-tenants.py`) · tests `panel.test.js` D22 · `research-tenants.test.js` สองสาขา + สาขาเดียวจากสองแหล่ง · `tenant-roster.test.js` ไม่มีสาขาซ้ำ | done (0.1.8) |
| S28 | ลิงก์ศูนย์ที่ยังเป็น candidate (เจ้าของสั่ง 21:23 น.: “ช่วย research ให้ดี ผูกกับศูนย์การค้าให้ถูกต้อง อย่าเดา”) | `scripts/review-candidate-hosts.py` (5 ข้อ · ปรับรูปแบบตายตัว · จุดสังเกต NEAR_HOST · ชื่อทางการที่มีแหล่ง) + adapter 4 ชุด · ผ่าน 1,769 จาก 2,789 แถว ขึ้นเว็บ 1,761 สาขา · ตรวจย้อนรายแถวที่ผ่าน (ข้อความเกินชื่อศูนย์) พบและแก้ 1 แถว “ก่อนถึงเซ็นทรัลบางนา” · sheet ทบทวนของทีมวิจัย (ภายใน) | done (0.1.8) |
| S30 | ตัวกรอง “ข้างในมี” + พื้นที่สำหรับสัตว์เลี้ยง (D22 · §9.3 ข้อ 4) | `#role` / `?role=` ตามบทบาทจาก `tenantRole()` และ `data/venue-amenities.json` (Pet 5 แห่ง) · ไม่มีรายชื่อไม่เข้า · บรรทัด “สัตว์เลี้ยง” + หลักฐานในแผงสถานที่ | done (0.1.8) |
| S31 | โลโก้แบรนด์ของชุดใหม่ (D26) | `scripts/collect-research-logos.py` อ่าน 01_BRANDS (export 5 พ.ย. 2569) + ไฟล์หรือแพ็ก zip ของทีมวิจัย ใช้เฉพาะไฟล์ที่ SHA-256 ตรงและบทบาท `brand_primary` · พื้นรองจากชีตหรือจากภาพ (SVG ใช้ภาพที่ `scripts/render-svg-logos.cjs` วาด) · `link-research-tenants.py --manifest` ใส่ `logo` ให้รายการ · พื้นรองจากขอบของโลโก้ (`plate_for`) และ `surfaceConflict` · 293 แบรนด์ · 2,506/3,032 รายการ | done (0.1.10) |
| S32 | อาคารต่อพื้นที่ ภูมิประเทศ และไซต์หลายอาคาร (D25) | `scripts/build-building-units.py` → `data/building-units/` (กฎ 1.15 ของ hotel; ใช้ผลของ hotel `177e592` + นับใหม่) · `js/building-units.js` · `js/massing.js` (อาคาร CityMETER ในหน่วย CityMETER; คงอาคาร OSM แบบหลายส่วน; ชั้นบริบทวาดชิ้นที่ซ่อนกลับ) · `js/pin-buildings.js` (`matchInUnit`) · `js/terrain.js` + `js/maplibre-guard.js` (จาก hotel) · `fitBuilding` บนพื้นจริง (`js/camera.js`) · `scripts/build-venue-sites.py --sites <CSV แท็บไซต์>` → `data/venue-sites.json` (ตอนนี้ว่าง: แท็บไซต์ของศูนย์การค้าเปิด 5 พ.ย. 2569 ยังไม่มีแถว `checked`) · tests `building-units`, `terrain`, `maplibre-guard`, `pin-buildings`, `massing`, `venue-xray` | done (0.1.9) · ไซต์รอวิจัย (S33) |
| S33 | งานวิจัยไซต์หลายอาคารของศูนย์การค้า (เจ้าของ 5 พ.ย. 2569 08:41 น. → ทีมวิจัยทำ) | `scripts/site-candidates.mjs` (`candidates` · `row` · `check` · `rank`) อ่านอาคาร CityMETER Building V4 ด้วยโค้ดเดียวกับแผนที่ · ภาพ PNG ที่ไม่ต้องติดตั้ง package (`scripts/site-picture.mjs`, test `site-picture`) และ SVG ภาพเดียวกัน — เพิ่ม PNG หลังทีมรายงานว่าเปิด SVG ไม่ได้ (5 พ.ย. 2569) · `row --osm-point` สำหรับอาคารที่ CityMETER ไม่มีแต่ OpenStreetMap มี (หน้าเว็บวาดรูปทรง OSM ตาม `matchInUnit`; `scripts/site-osm.mjs`, test `site-osm`) — เจ้าของ 13:09 ให้รวม Topgolf ที่ CityMETER Building V4 ไม่มี · ใบสั่งงานและแท็บไซต์ `SITE_BOUNDARY_CHECK` ภายใน (381 ศูนย์ เริ่มที่เมกาบางนา) · `draft` ร่างจากขอบเขต OpenStreetMap ที่หมุดตั้งอยู่ (`scripts/site-draft.mjs`, test `site-draft`; เจ้าของ 20:38 น. D27) — แท็บภายใน `SITE_DRAFTS` (5 พ.ย. 2569: `ready` 118 · `one_building` 9 · `osm_area` 8 · `empty` 3 · `by_hand` 1 · `not_drafted` 242) · `row --source osm_outline` · หลังทีมส่ง: export CSV → `build-venue-sites.py --sites` → `npm test` → cache tag → push → ตรวจ live | ทำแล้ว (0.1.13, 6 พ.ย. 2569): Claude ตรวจและเผยแพร่ 119 ไซต์ 1,685 อาคาร (D28) · แถวรอเขียนลงแท็บไซต์เมื่อเจ้าของอนุญาต · ศูนย์ที่ยังไม่มีไซต์ 262 แห่ง · เมกาบางนา: เจ้าของตอบ 13:09 ให้รวมทุกอาคาร รอบ MEGA Park และ Topgolf (อู่รถเมล์ ขสมก. ข้าง Topgolf ไม่นับ — เจ้าของ 17:20 น.) |
| S29 | รูปเขตที่ไม่ข้ามแม่น้ำ (D24) | `scripts/build-boundaries.py` (รูป RTSD ชุดเดียวกับ production + รหัส OpenGISData ตามพื้นที่ทับซ้อน + พื้นที่ production) · `scripts/relocate-districts.py` · `data/districts/<จังหวัด>.geojson` + `js/district-detail.js` (โหลดเมื่อซูมเข้า) · สีพื้นที่ใต้ชั้นน้ำ · `tests/district-detail.test.js` | done |

## 8. เกณฑ์รับงาน

| ID | สถานการณ์ | ผลที่ต้องเห็น |
|---|---|---|
| AC01 | เปิดหน้า | ภาพแรก = 3D city preset ที่ 3 เขต Aha; แผงเริ่มด้วย Aha + ตัวตั้ง/ตัวหาร/บริบทพื้นที่/แน่นกว่าค่าเฉลี่ย + คำสั่ง; ไม่มี caveat บนหน้าจอ; ตัวเลขคำนวณจาก `venues.json` |
| AC02 | ไม่นับปน | ตัวเลขทุกตัวนับเฉพาะ countable; พื้นที่ย่อยไม่บวก parent; โครงการอนาคต/ปิดแยกบรรทัด; รายการรอตรวจไม่เข้าตัวเลขใด |
| AC03 | รายการที่ยังไม่ผ่านนิยาม | จุดเทาที่ zoom ≥ 11 ไม่มีโลโก้ ไม่อยู่ใน tab order; สวิตช์ซ่อนได้และจำใน URL; ค้นหาเจอพร้อมป้ายสถานะ (รอตรวจ / ตรวจแล้วยังยืนยันไม่ได้) |
| AC04 | ไม่มีพิกัด | 55 แห่งอยู่ในรายการ/ตารางพร้อมป้าย ไม่มีหมุดและไม่เข้าตัวเลขรายพื้นที่ |
| AC05 | ขนาด (D3) | ค่าประมาณเดิมมีเฉพาะในแผงสถานที่ (“ราว …”) วิธีคำนวณในหลักฐานรายช่อง; ไม่มีผลรวม อันดับ หรือ filter ขนาด |
| AC06 | choropleth | ใช้ครบ 41 สีของ LUT และ legend แสดงทั้ง 41 สี; สีตรง legend และกราฟอันดับ; หน่วย “แห่ง/ตร.กม.” และตัวหารบอกชัด; measured zero มีเส้นขอบศูนย์; HEX เดียวกันสองธีม |
| AC07 | หมุด | หนึ่งหมุดต่อสถานที่; สี + รูปทรงตามกลุ่ม; เส้นประ = กำลังจะเปิด; กลวง = ปิดแล้ว; โลโก้เฉพาะ zoom ≥ 14 ในโฟกัส ≤ 250 |
| AC08 | อาคารของสถานที่ | มองเห็นและกดได้เสมอใน 3D (ลำดับชั้นเดิม + x-ray); parent ที่มี parts เป็น outline; ความสูงที่ไม่รู้ไม่ถูกอ้างเป็นข้อเท็จจริง; ทุกหมุดที่นับได้ที่ตั้งอยู่ในอาคารของแผนที่ฐานมีอาคารสีน้ำเงินที่ zoom ≥ 14; มวลอาคารเห็นได้ในชานเมืองและต่างจังหวัดเมื่อซูมเข้า · กดหมุดหรืออาคาร → กล้องเฉียงมุม 45° จากผนังหลัก ฐานและหลังคาทุกจุดอยู่ในพื้นที่ว่างและเต็มด้านใดด้านหนึ่ง (± 3%) ทั้ง desktop และมือถือ, เปิด/ปิดแผงล่างแล้วจัดใหม่ (D16) |
| AC09 | breadcrumb | ประเทศไทย › จังหวัด › เขต/อำเภอ › สถานที่; `province` = รหัส production; `district` = รหัส 4 หลักของ production |
| AC10 | หลักฐานรายช่อง | ทุกช่องในแผงสถานที่มีแหล่งหรือบอกว่ายังไม่มี; ไม่มีลิงก์ Drive/Docs; missing ไม่แสดงเป็น 0 |
| AC11 | ร้านข้างใน | จำนวนยืนยัน + ชุดข้อมูล; ลิงก์ Luxury Brands เปิดสถานที่เดียวกันได้จริงเมื่อ id ตรง; candidate ไม่นับ |
| AC12 | desktop/mobile, light/dark | header 48 px; ไม่มี horizontal overflow ที่ 390 px; ภาษาไทยไม่ล้น; basemap ทั้งสองธีม · มือถือ: แผงล่างปิดหลังทุกการเลือก การ์ดล่างมีปุ่ม “ดูรายละเอียด” เป็นปุ่มหลักปุ่มเดียว attribution ไม่ถูกบัง (D17) · ชื่อและโลโก้ของสถานที่อยู่ในภาพแรกของแผงโดยไม่ต้องเลื่อน (D18) |
| AC13 | คีย์บอร์ด/reduced motion | focus เห็นชัด; หมุด กราฟ (focus group + Enter) แผง toolbar ใช้คีย์บอร์ดได้; กล้องและกราฟไม่ animate เมื่อ reduced motion |
| AC14 | ความล้มเหลว | core data ล้ม → ข้อความ + ลองใหม่; map/tiles ล้ม → แผง กราฟ ตารางยังใช้ได้; pending โหลดไม่ได้ → ตัวเลขไม่เปลี่ยน |
| AC15 | release | commit, live bytes และ manifest ตรงกัน (`verify:live`); ไม่มี secret หรือ URL ภายใน |

## 9. ทดสอบและเผยแพร่

```sh
npm run data:refresh -- <csv-export-dir> <geometry-bundle-dir> [<logo-files-dir> ...]   # build-data + logos + static + test
npm test
npm start                      # http://127.0.0.1:4173/
npm run handoff:manifest
npm run verify:live
```

ใน container ของงานนี้ tile/glyph ของ OpenFreeMap ถูก proxy ปฏิเสธ — ตรวจ layout, แผง, กราฟ และชั้นข้อมูลด้วย Playwright + MapLibre จาก npm โดยตอบ tile ว่าง (ทั้งกับไฟล์ local และกับ live URL) แล้วยืนยันรูปลักษณ์จริง (basemap, มวลอาคาร, อาคารที่หมุดตั้งอยู่, 3D) บน live ผ่าน Chrome ของเจ้าของ ห้ามรายงานว่าเผยแพร่แล้วจากผลในเครื่อง

Repository `montri-th/shoppingcenter` · branch `main` · Pages แบบ branch deploy · ใส่ attribution ของ OpenFreeMap/OpenMapTiles/OpenStreetMap และ OpenGISData-Thailand (CC BY 4.0) · ไม่รวม raw internal sources หรือ governed LDS package ใน repository

## D19 — Tenant roster, release 0.1.1

Only the venue-panel tenant section changes. Optional fixed-32 shards load on selection, session state guards stale requests and retains increments of ten through panel repaints. More never runs venue selection or camera fitting. Names survive missing/failed logos; verified original logo bytes load lazily. Editorial role priority uses sourced centre positioning where available; equal roles sort deterministically. Current roster counts belong only to the selected panel; core/map/card/area aggregate files remain unchanged. Public export preserves source roles, raw status, public URLs/dates, source-qualified IDs and unresolved multiple-card identity. See DATA_METHOD §9.1 and data/tenants/build-report.json. Verify pagination, stale selection, optional failures, keyboard focus, desktop/390px light/dark and live file parity before declaring delivery.

## 0.1.5 — Linked dataset tenants (CityMETER Fitness)

Owner 30 Oct 2026 06:23. A linked research dataset adds tenant entries without touching the canonical roster: `scripts/link-dataset-tenants.py` reads the Fitness public release at a pinned commit, keeps branches whose sheet of record accepted one registry venue and whose source still lists them, gates them with `build-tenant-data.py#linked_gate` (role `dataset_accepted_host_link`), copies `brand_primary` logos byte for byte, rewrites only the linked dataset's items and recomputes the published aggregates of `data/tenants/build-report.json` (`linkedDatasets` keeps commit, file hashes, counts and omissions). Panel: role `fitness`, dataset label, cross-link to CityMETER Fitness by venue id. Acceptance: canonical items byte-identical; 139 items at 124 venues; tests for the gate, the published receipt and the cross-link; live parity and a live walk of a venue with Fitness branches (Gaysorn Village, Erawan Bangkok).


## 0.1.6 — Named-host research datasets and shop-list reading aids (D20–D21)

Owner 4 Nov 2026 19:43. Seven research datasets (Sport, Apparel, Furniture DIY & Kitchenware, Pet, Massage & Spa, Salon & Barber, Nail) add 1,252 entries through `scripts/link-research-tenants.py`: the official source names the host and the dataset's own sheet matched it to one registry venue by exact or reviewed unique alias (`named_gate`, role `dataset_source_named_host_listing`, the canonical `official_chain_exact_named_host_listing` standard); current, approved scope, own shop or counter, within 300 m, one brand once per venue; inputs are the `02_STORES` CSV exports (SHA-256 in `build-report.json#linkedDatasets`). `scripts/build-tenant-index.py` writes `data/tenant-index.json` for the shop-mix chips, the nearby-centre comparison (5 km, ≤ 5 centres with ≥ 3 listed shops) and the brand view (`?brand=`). Venue cores, primary counts and area/map/table totals stay as D19. URL parameters: add `brand`. Rebuild order: canonical → Fitness → named-host → index.

## 0.1.7 — District polygons that follow the river (D24)

Owner 4 Nov 2026 21:56. Cause: OpenGISData-Thailand polygons are coarse in Bangkok (Samphanthawong 12 vertices, 5 on screen) and the district fill was drawn above the water fill. Fix: the RTSD 2019 polygons that CityMETER production uses (`scripts/build-boundaries.py`; codes by overlap; production areas), membership recomputed on the published snapshot (`scripts/relocate-districts.py`, 80 venues + 47 context rows), coarse national file + per-province detail loaded on demand (`js/district-detail.js`, `update({geometryOf})`), data fills before the basemap `water` layer. Tests: `tests/district-detail.test.js`. Next full build: `scripts/refresh-data.sh` reads `.cache/reference/rtsd/build` (fetched and pinned by `scripts/fetch-reference.py`).

## 0.1.8 — Branches, reviewed host links, list-based shop counts and “ข้างในมี” (D22–D23)

Owner 4 Nov 2026 21:23–21:24. Build order unchanged: `build-tenant-data.py` → `link-dataset-tenants.py` (Fitness) → `link-research-tenants.py --exports <dir> --exported-on <date> --crosswalk <R04 csv> --review-log <internal csv>` → `build-tenant-index.py`. The link script also writes `data/venue-amenities.json`. The page loads `data/tenant-index.json` and `data/venue-amenities.json` right after the core data; until then shop figures read “—”. Cache tag `20261105-r16`, package 0.1.8.

## 0.1.9 — Buildings per area, terrain, sites and research-dataset logos (D25–D26)

Owner 5 Nov 2026 00:34. Ported from CityMETER · Hotel 0.3.x (`montri-th/hotel@177e592`): `js/building-units.js`, `js/terrain.js`, `js/maplibre-guard.js` and the CityMETER paths of `js/massing.js`, `js/pin-buildings.js` and `js/camera.js`, adapted to this page's fade and city layers (`CITY_LAYER` → `focus-context-3d` → `cm-buildings-credit` → `focus-massing-3d` → occluder → host). `data/building-units/` is rebuilt with `python3 scripts/build-building-units.py --api <production dumps> --geom <outlines> --counts <ohsome counts> --reuse <hotel checkout> --out .` when venues move or a new province gets venues; units with no venue are not listed. Tenant build order with logos: `build-tenant-data.py` → `link-dataset-tenants.py` → `collect-research-logos.py --brands <01_BRANDS dir> --exported-on <date> --files <packs or dirs> [--svg-renders <dir>]` → `link-research-tenants.py … --manifest assets/tenant-logos-manifest.json` → `build-tenant-index.py`. Cache tag `20261105-r17`, package 0.1.9.

## 0.1.10 — Every research-dataset logo the sheets hold (D26)

Owner 5 Nov 2026 07:29 approved downloading the research team's logo packs (six ZIP files and three Drive folders, kept outside the repository). `collect-research-logos.py` runs with every pack as `--files` and `--svg-renders`; then `link-research-tenants.py … --manifest` and `build-tenant-index.py`. Only `logo` fields change. Plates: `plate_for` on the outline pixels; a stated surface the mark would vanish on is overruled and counted (`surfaceConflict`). Cache tag `20261105-r18`, package 0.1.10.

## 0.1.11–0.1.12 — Dataset names and the phone first view

0.1.11 (`20261105-r19`): Thai names for the reviewed datasets in the shop list's source line (`js/evidence.js` `STORE_DATASETS`; `tests/dataset-labels.test.js`). 0.1.12 (`20261105-r20`, owner 5 Nov 2026 08:34 “หน้าแรก เปิดมาเจอแบบนี้ ให้ดูอะไรเหรอ”): the zoom-in to 13.1 applies only within 0.4 zoom of the whole-district fit (`zoomInFreeBox`); a portrait phone uses `cityPortrait` (pitch 40, north up); the map credit sits above the bottom bar and the phone legend and card stay above its live height (`trackAttribution`).

## S33 — Multi-building sites in research (no page change)

Owner 5 Nov 2026 08:41 “Megabangna มีหลายอาคาร ในที่ดินใหญ่มาก แต่ปัจจุบันแสดงไม่ครบ ควรทำยังไง” → the research team does it. The team works from an internal brief and the internal site tab `SITE_BOUNDARY_CHECK` (381 rows ordered by `node scripts/site-candidates.mjs rank`, Mega Bangna first) and writes only its own columns; every building point comes from `scripts/site-candidates.mjs`. When rows are `checked`: export the tab as CSV → `python3 scripts/build-venue-sites.py --sites <CSV> --exported-on <date>` → `npm test` → cache tag → push → live check.

Owner 5 Nov 2026 13:09, on the 300 m picture of Mega Bangna: “ใช่ทุกตึกเลยครับ ยังมี อาคารรอบๆ MegaPark และ Top Golf ด้วยครับ”. Observed the same day: OpenStreetMap outlines “เมกาซิตี้ บางนา” (way 824156321, ≈ 443,600 m², every vertex within 542 m of the pin) and “ท็อปกอล์ฟ เมกาซิตี้” (way 947660848) hold 83 CityMETER buildings, and 5 more buildings of the 300 m picture lie just outside the first outline (88 with them, as the owner named the whole picture); Topgolf's curved roof (OSM way 1178018314, ≈ 3,480 m², ≈ 550 m from the pin) is not in CityMETER Building V4, so `row --osm-point` adds it the way the page draws it (`matchInUnit` falls back to the OpenStreetMap building, which the map's OpenFreeMap tile of 1 Nov 2026 holds). Seven CityMETER buildings at the BMTA bus depot next to Topgolf (OSM way 1180996202) are not counted: owner 17:20 “อู่ ขสมก เช่าที่ดินเมกาบางนา ไม่ต้องนับ”. All of it stays within the 600 m site limit.

Owner 17:20 asked whether this method should cover every centre and how long it would take; 20:38: “ลองตามที่พี่แนะนำได้เลย เริ่มที่ ราว 130 ศูนย์ที่ร่างได้เลย ตรวจแห่งละ 3–5 นาที ก่อน”. `node scripts/site-candidates.mjs draft <venue_id> --drafts <CSV of SITE_DRAFTS>` drafts a site from the smallest OpenStreetMap area that holds the pin (landuse=retail, a shop=mall area that is not a building, or amenity=marketplace) and every CityMETER building whose interior point stands in it (`scripts/site-draft.mjs`; `row --site` uses the same rule). The classification of the 381 centres ran in a browser from the same file on GitHub Pages with OpenStreetMap read through Overpass on 5 พ.ย. 2569 (192 centres before an outage, the other 189 when it came back); the drafts ran in the helper itself. Tab SITE_DRAFTS: 118 `ready` (1,603 buildings), 9 `one_building`, 8 `osm_area`, 3 `empty`, 1 `by_hand` (Mega Bangna), 242 `not_drafted` (shared 31 · beyond 600 m 1 · near 3 · commercial 32 · mall building only 82 · none 93). The team reviews each draft (brief §6A) and accepts it with `row --source osm_outline`; the build reads `osm_outline` as “ขอบเขตพื้นที่จาก OpenStreetMap”.

## 0.1.13 — Sites from OpenStreetMap drafts, reviewed by Claude's rules (D28)

Owner 5 Nov 2026 23:57 “ภาคผนวก ข คืออะไรไม่เข้าใจครับ ผมต้องทำอะไรต่อ พี่ทำให้จบเลยได้มั้ย” → Claude reviewed the 118 ready drafts with fixed rules (DATA_METHOD §11.1: OpenStreetMap points and land of other uses read from the map's OpenFreeMap tiles of 1 Nov 2026 while Overpass was down, the buildings an outline cuts, the main building never) and wrote one row per site with `scripts/site-candidates.mjs row --source osm_outline_auto`; Mega Bangna as the owner answered (`osm_outline`, 89 buildings). All 119 rows pass `check`. `scripts/build-venue-sites.py --staged` → `data/venue-sites.json`: 119 sites, 1,685 buildings, input kind `staged_rows` until the research site tab holds the rows (the owner's OK for that write is pending). `js/buildings.js` draws a site's other buildings for venues with validated host geometry (test `buildings-sites`); `js/panel.js` reads “ทั้งโครงการ N อาคาร” for them and labels an OpenStreetMap link “ขอบเขตใน OpenStreetMap”. `site-candidates.mjs` dates are ICT. Cache tag `20261106-r21`, package 0.1.13.

0.1.14 (`20261106-r22`): a partial site (one point still waiting for a tile) is drawn as its tiles arrive — `js/pin-buildings.js#emit` signature; the 0.1.13 live check had found Mega Bangna frozen at its first snapshot.

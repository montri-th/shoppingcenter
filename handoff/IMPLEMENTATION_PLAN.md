# CityMETER ศูนย์การค้า (Shopping centers) — Implementation Plan

รุ่นแผน 0.4 · 25 ต.ค. 2569 · ใช้คู่กับ [PRODUCT_STATEMENT.md](../PRODUCT_STATEMENT.md) (รุ่น 0.6) · ต้นแบบ: CityMETER Luxury Brands รุ่น 0.5 (commit `0ed2b9d`) · รุ่น 0.2 บันทึกสิ่งที่สร้างจริงในเว็บรุ่น 0.1.0 และสถานะงาน (§7) · รุ่น 0.3 บันทึกการอัปเดตข้อมูลหลังปิดรายการรอตรวจรอบแรก (export 15:06 น.), กฎรายประเภทของเจ้าของ (D7), สเกล 41 สี (D8) และการแสดงรายการที่ตรวจแล้วยังยืนยันไม่ได้ (D9) · รุ่น 0.4 บันทึกข้อมูลหลังปิดคิวครบ (export 16:39 น.), ชื่อ “ศูนย์การค้า” (D10), ข้อความแบบข้อค้นพบก่อนไม่มี caveat (D11), อาคารที่หมุดตั้งอยู่ (D12), กราฟ amCharts (D13), ไอคอนตาม LDS (D14), ดุสิต เซ็นทรัล พาร์ค เป็นบริบท (D15) และการแก้มวลอาคารชานเมือง/ต่างจังหวัด (S14–S18)

เป้าหมายรุ่นแรก (0.1.0): เว็บที่หน้าตาและพฤติกรรมเหมือน Luxury Brands — เมือง 3 มิติที่โฟกัสข้อค้นพบแรกทันที โฟกัสแล้วเงียบ basemap กระดาษ อาคารของสถานที่ที่มองเห็นและกดได้เสมอ breadcrumb ที่ใช้รหัสจังหวัดของ production — แต่หน่วยของข้อมูลคือ **สถานที่ค้าปลีก** ไม่ใช่สาขาของแบรนด์ และหน่วยพื้นที่คือ **เขต/อำเภอ** ตามขอบเขตทางการ ไม่ใช่ย่านที่วาดเอง เผยแพร่ที่ `https://montri-th.github.io/shoppingcenter/`

## 1. สิ่งที่ล็อกแล้ว (จาก Product Statement §8)

| รหัส | ข้อตัดสินใจ | ผลต่อการพัฒนา |
|---|---|---|
| D1 | ข้อค้นพบแรก = 3 เขตที่มีแห่ง/ตร.กม. สูงสุดของจังหวัดที่มีเขตหนาแน่นที่สุด (snapshot 16:39 น.: สัมพันธวงศ์ พระนคร บางรัก — 49 จาก 856 แห่งของกรุงเทพฯ บนพื้นที่ 0.7% แน่นกว่าค่าเฉลี่ยราว 8 เท่า; รอบก่อน ปทุมวัน บางรัก ราชเทวี 36 จาก 185) | สูตรใน `js/area-insight.js` คำนวณจากข้อมูลทุกครั้ง ไม่ใช่ค่าคงที่; ภาพแรก = preset `city` ที่เห็นสามเขตนี้ |
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
| `js/chart-model.js`, `js/charts.js` | อันดับ / matrix / exclusive-shared | amCharts (D13): อันดับพื้นที่ (สลับแห่ง/ตร.กม. กับจำนวน) · ประเภทในแต่ละพื้นที่ (สัดส่วน/จำนวน + ปุ่มคำอธิบายพร้อมรูปทรง) · ผู้บริหารที่ระบุชื่อได้ (หางยาวและไม่ระบุอยู่เหนือกราฟ) · ขอบเขตเดียวกันทุกมุมมอง: จังหวัดที่อ่าน หรือทั้งประเทศ · fallback HTML ช่องเท่ากันแบบเดิม |
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
- **จังหวัด:** เขต/อำเภอของจังหวัดนั้นระบาย `density.area`; โปรไฟล์จังหวัด (จำนวนตามกลุ่ม ผู้บริหาร กำลังจะเปิด ปิดแล้ว และ “อีก k แห่งยังไม่มีพิกัด”)
- **เขต/อำเภอ:** preset `model`; โปรไฟล์เขต + รายการสถานที่; สถานที่นอกเขตเป็นจุดเทา
- **สถานที่:** มุมสถาปนิก (`eye`) เมื่อมีรูปทรงอาคารที่ผ่านเกณฑ์ ไม่เช่นนั้น `model` ที่จุด; อาคารสีน้ำเงิน = อาคารของสถานที่ หรืออาคารที่หมุดตั้งอยู่ (D12); มวลอาคารรอบ ๆ ในวง 650 ม.; หน้าจอแสดงค่า (ผู้บริหาร ติดต่อ เวลาเปิด ปีที่เปิด ขนาด ที่อยู่ พิกัด ร้านข้างใน อาคาร) ส่วนรายการหลักฐานรายช่อง (พับไว้, D11): ชื่อ (ฐานของชื่อ), กลุ่มประเภท + ค่าต้นทาง, การผ่านนิยาม (ด้วยหลักฐาน หรือกฎของเจ้าของ · ชื่อกฎ), เหตุผลที่ไม่นับแยก, สถานะ + แหล่ง, ผู้บริหาร, เว็บทางการ/ไดเรกทอรีร้าน/โทร/เวลาเปิด (+ขอบเขตของเวลา), ปีที่เปิด, ขนาด (ค่าที่รายงาน หรือค่าประมาณเดิมพร้อมวิธีคำนวณ — D3), ที่ตั้ง + บทบาทพิกัด, ร้านที่ยืนยันว่าอยู่ข้างใน (จำนวน + ชุดข้อมูล + ลิงก์ Luxury Brands `?place=` เมื่อมี), พื้นที่ย่อย/โครงการแม่, รหัส (`venue_id`, Shopping Center id, CityMETER id)
- **รายการที่ยังไม่ผ่านนิยาม:** กดจุดเทาแล้วได้การ์ดย่อ: ชื่อ ประเภท สถานะ (“รอตรวจ · ไม่นับ” หรือ “ยังยืนยันไม่ได้ · ไม่นับ”) พิกัด และรหัส
- **ค้นหา:** ชื่อไทย/อังกฤษ ผู้บริหาร และรหัส (substring หลัง normalize ไม่ fuzzy) ผลที่ผ่านนิยามมาก่อน รายการที่ยังไม่ผ่านนิยามติดป้ายสถานะ
- **ตัวกรอง:** กลุ่มประเภท · ผู้บริหาร · สถานะ (เปิดอยู่หรือรอยืนยัน ค่าเริ่มต้น / กำลังจะเปิด / ปิดแล้ว / ทุกสถานะ) · จังหวัด · ค้นหา
- **URL:** `province`, `district`, `venue`, `pending`, `group`, `operator`, `status`, `q`, `areas`, `view`, `view3d`, `cam`
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
| AC08 | อาคารของสถานที่ | มองเห็นและกดได้เสมอใน 3D (ลำดับชั้นเดิม + x-ray); parent ที่มี parts เป็น outline; ความสูงที่ไม่รู้ไม่ถูกอ้างเป็นข้อเท็จจริง; ทุกหมุดที่นับได้ที่ตั้งอยู่ในอาคารของแผนที่ฐานมีอาคารสีน้ำเงินที่ zoom ≥ 14; มวลอาคารเห็นได้ในชานเมืองและต่างจังหวัดเมื่อซูมเข้า |
| AC09 | breadcrumb | ประเทศไทย › จังหวัด › เขต/อำเภอ › สถานที่; `province` = รหัส production; `district` = รหัส 4 หลักของ production |
| AC10 | หลักฐานรายช่อง | ทุกช่องในแผงสถานที่มีแหล่งหรือบอกว่ายังไม่มี; ไม่มีลิงก์ Drive/Docs; missing ไม่แสดงเป็น 0 |
| AC11 | ร้านข้างใน | จำนวนยืนยัน + ชุดข้อมูล; ลิงก์ Luxury Brands เปิดสถานที่เดียวกันได้จริงเมื่อ id ตรง; candidate ไม่นับ |
| AC12 | desktop/mobile, light/dark | header 48 px; ไม่มี horizontal overflow ที่ 390 px; ภาษาไทยไม่ล้น; basemap ทั้งสองธีม |
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

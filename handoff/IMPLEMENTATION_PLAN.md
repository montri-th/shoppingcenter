# CityMETER Shopping Centers & Retail Venues — Implementation Plan

รุ่นแผน 0.2 · 25 ต.ค. 2569 · ใช้คู่กับ [PRODUCT_STATEMENT.md](../PRODUCT_STATEMENT.md) (รุ่น 0.3) · ต้นแบบ: CityMETER Luxury Brands รุ่น 0.5 (commit `0ed2b9d`) · รุ่น 0.2 บันทึกสิ่งที่สร้างจริงในเว็บรุ่น 0.1.0 และสถานะงาน (§7)

เป้าหมายรุ่นแรก (0.1.0): เว็บที่หน้าตาและพฤติกรรมเหมือน Luxury Brands — เมือง 3 มิติที่โฟกัสข้อค้นพบแรกทันที โฟกัสแล้วเงียบ basemap กระดาษ อาคารของสถานที่ที่มองเห็นและกดได้เสมอ breadcrumb ที่ใช้รหัสจังหวัดของ production — แต่หน่วยของข้อมูลคือ **สถานที่ค้าปลีก** ไม่ใช่สาขาของแบรนด์ และหน่วยพื้นที่คือ **เขต/อำเภอ** ตามขอบเขตทางการ ไม่ใช่ย่านที่วาดเอง เผยแพร่ที่ `https://montri-th.github.io/shoppingcenter/`

## 1. สิ่งที่ล็อกแล้ว (จาก Product Statement §8)

| รหัส | ข้อตัดสินใจ | ผลต่อการพัฒนา |
|---|---|---|
| D1 | ข้อค้นพบแรก = 3 เขตที่มีแห่ง/ตร.กม. สูงสุดของจังหวัดที่มีเขตหนาแน่นที่สุด (ค่าเริ่มต้น: ปทุมวัน บางรัก ราชเทวี — 32 จาก 181 แห่งของกรุงเทพฯ บนพื้นที่ 1.2%) | สูตรใน `js/area-insight.js` คำนวณจากข้อมูลทุกครั้ง ไม่ใช่ค่าคงที่; ภาพแรก = preset `city` ที่เห็นสามเขตนี้ |
| D2 | ชื่อบนหน้า “ศูนย์การค้าและสถานที่ค้าปลีก: จำนวน ประเภท และผู้บริหาร” | title/description/JSON-LD ใช้ชื่อนี้; ไม่มีตัวชี้วัด GLA หรือ segment |
| D3 | ขนาดแบบค่าประมาณเดิมแสดงเฉพาะในรายละเอียดสถานที่ พร้อมวิธีคำนวณ | ไม่มีใน filter, กราฟ, ตาราง, ผลรวม หรืออันดับ |
| D4 | รายการรอตรวจนิยาม 10,423 รายการเป็นจุดเทาเงียบ ซ่อนได้ ค้นหาได้ ไม่นับ | ชั้น circle ของ MapLibre แยกจากหมุด DOM; ไม่อยู่ใน tab order; ไม่เข้าตัวเลขใด |
| D5 | ผู้ใช้บริการทั่วไปเป็นกลุ่มรอง | ไม่มีฟิลเตอร์สิ่งอำนวยความสะดวก |

## 2. สถาปัตยกรรม (fork จาก Luxury Brands)

Static HTML/CSS + ES modules ไม่มี build step ไม่มี framework ไลบรารีภายนอกตัวเดียวคือ MapLibre GL 5.6.2 (URL ที่ pin ไว้) basemap และมวลอาคารจาก OpenFreeMap กราฟวาดเองเป็น HTML/SVG `npm test` ใช้ Node test runner ข้อมูลทั้งหมดสร้างล่วงหน้าโดยสคริปต์ Python ใน `scripts/` แล้ว commit เป็นไฟล์ใน `data/`

| โมดูล | จาก Luxury | สิ่งที่เปลี่ยน |
|---|---|---|
| `index.html`, `styles.css`, `navigation.css`, `assets/theme.css`, `js/launch.js`, `js/vendors.js` | คงโครงหน้าจอ, launch overlay, tokens, ฟอนต์ LDS, icons | ข้อความไทยใหม่ทั้งหมด; ช่องค้นหา; legend กลุ่มประเภท + สวิตช์ “รายการรอตรวจ”; public origin ใหม่ |
| `js/model.js` | taxonomy, ตัวกรองร่วม, `PROVINCES` | กลุ่มประเภท 8 กลุ่ม (เพิ่มไฮเปอร์/ซูเปอร์มาร์เก็ตที่มีร้านเช่า), ระดับการผ่านนิยาม, สถานะ (อุปทาน / โครงการอนาคต / ปิดตามหลักฐาน), กลุ่มผู้บริหาร; `PROVINCES` ครบ 77 จังหวัดจาก production (`base/info/lv0` → `abbrEn`) |
| `js/neighborhoods.js` → `js/areas.js` | point-in-polygon + membership | membership คำนวณล่วงหน้าใน pipeline (`provinceCode`, `districtCode` ต่อแถว) จากขอบเขตความละเอียดเต็ม; client ใช้เฉพาะสรุปต่อพื้นที่ |
| `js/area-insight.js` | Aha 3 ย่าน | Aha 3 เขตตามแห่ง/ตร.กม. (สูตร §4); คืน `{province, districtIds, count, total, share, areaKm2, provinceAreaKm2, areaShare}` |
| `js/scales.js` | LUT `count` 41 ค่า + EVID-05 | เพิ่ม LUT `density.area` 41 ค่า (scaleVersion `554812a7…`); classes แบบ quantile ต่อการอ่าน โดยสีมาจาก class table 5 หรือ 3 ระดับของ LDS เท่านั้น (§5); `count` ใช้กับจังหวัดและตาราง matrix |
| `js/map-layers.js` | choropleth ย่าน + focus/quiet | choropleth เขต/อำเภอ (`density.area`) ภายในจังหวัดที่อ่านอยู่; เขตนอกโฟกัสเป็นเส้นบาง; ป้ายชิปชื่อเขต |
| `js/provinces.js` | กรอบจังหวัด country view | ใช้ 77 จังหวัด, ค่า = จำนวนสถานที่ (`count` classes แบบประกาศคงที่), ป้ายชิป, drill-down |
| `js/pins.js` | หมุดรายแถว DOM, context pins, โลโก้ zoom ≥ 14 | หนึ่งหมุด = หนึ่งสถานที่ที่ผ่านนิยามและระบุตำแหน่งได้; สีกลุ่ม + **รูปทรงกำกับ** (SVG ต่อหมุด); โครงการอนาคตเป็นหมุดเส้นประ, ปิดตามหลักฐานเป็นหมุดกลวง; โลโก้สถานที่แทนโลโก้แบรนด์ |
| **ใหม่** `js/venue-points.js` | — | GPU layers: รายการรอตรวจ (circle minzoom 11, สีเทา token, ไม่มีโลโก้, กดแล้วเปิดการ์ดย่อ, ซ่อนได้ `pending=0`) · จุดบริบทของทุกสถานที่ที่ผ่านนิยาม · สัญลักษณ์รูปทรงของสถานที่ในโฟกัสเมื่อเกิน 600 หมุด |
| **ใหม่** `js/cues.js`, `js/details.js`, `js/evidence.js` | — | รูปทรงกำกับ 8 แบบ (SVG + canvas icon) · โหลดรายละเอียดรายสถานที่จาก shard · ข้อความอ่านหลักฐานรายช่อง |
| `js/buildings.js`, `js/venue-xray.js`, `js/massing.js`, `js/mvt.js`, `js/geometry.js`, `js/camera.js`, `js/map-style.js` | อาคารของสถานที่, x-ray, มวลอาคารสองชั้น, กล้อง, basemap | ใช้ต่อแทบไม่แก้; id เชื่อมอาคารเปลี่ยนเป็น `venue_id`; focus tier ของมวลอาคารใช้วงรัศมีรอบสถานที่ในโฟกัส (เขตนอกกรุงเทพฯ ใหญ่เกินกว่าจะ decode ทั้งเขต) |
| `js/profile-model.js`, `js/panel.js` | โปรไฟล์ย่าน/สถานที่/ร้าน | โหมด: ภาพรวม (ประเทศ/จังหวัด) · เขต/อำเภอ · สถานที่ · รายการรอตรวจ · ผลค้นหา; แผงสถานที่แสดงหลักฐานรายช่อง (§6) |
| `js/chart-model.js`, `js/charts.js` | อันดับ / matrix / exclusive-shared | อันดับพื้นที่ (แห่ง/ตร.กม. ของเขต หรือจำนวนต่อจังหวัด) · ตารางพื้นที่ × กลุ่มประเภท (ช่องเท่ากัน) · ผู้บริหาร (สัดส่วนจำนวนสถานที่) |
| `js/breadcrumb.js` | ประเทศไทย › จังหวัด › ย่าน › สถานที่ | ประเทศไทย › จังหวัด › เขต/อำเภอ › สถานที่ (เขตในกรุงเทพฯ, อำเภอนอกกรุงเทพฯ) |
| `js/venue-logos.js` | ทะเบียนโลโก้สถานที่ | ค้นด้วย `venue_id` เท่านั้น ไม่ fuzzy |
| ตัดออก | `brand-logos.js`, `data/luxury.json`, `legacy-audit.json`, `neighborhoods.geojson`, เอกสารย่าน | — |

## 3. สัญญาข้อมูล (data contract)

สร้างโดย `scripts/build-data.py` จาก export CSV ของ Research Master (01_VENUES, 10_VENUE_LOGOS, 09_RELATIONSHIPS), ชุดรูปทรงอาคาร `CityMETER-retail-venue-host-geometry-2026-10-23`, ขอบเขต OpenGISData-Thailand (commit `fafcea1`) และรายชื่อจังหวัด/เขตของ production (`/api/v2/citymeter-v3/base/info/lv0`, `/info/lv1/{provinceId}`) บันทึก sha256 ของทุก input ใน `meta.inputs`

| ไฟล์ | เนื้อหา | ขนาดเป้าหมาย |
|---|---|---|
| `data/venues.json` | `meta` (snapshot, นิยาม, ตารางจับคู่กลุ่ม, counts, checks, inputs + SHA-256) + `rows` 565 สถานที่ที่ผ่านนิยามแบบ core fields (ตัวตน กลุ่ม การนับ สถานะ ผู้บริหาร จุด พื้นที่) | ≤ 900 KB (จริง 364 KB, gzip 48 KB) |
| `data/details/NN.json` | หลักฐานรายช่องเต็มต่อสถานที่ แบ่ง shard ด้วย FNV-1a ของ `venue_id` (อย่างน้อย 32 shard เพิ่มเองตามขนาดทะเบียน) โหลดเมื่อเปิดสถานที่ | รอบนี้ 32 shard เฉลี่ย 68 KB (37–99 KB) |
| `data/pending.json` | รายการรอตรวจที่ระบุตำแหน่งได้แบบ columnar: `id, name, lon, lat, provinceCode, districtCode, group` | ≤ 1.2 MB (จริง 1.39 MB สำหรับ 10,401 จุด — จะเล็กลงเมื่อรายการรอตรวจถูกปิด; โหลดหลังภาพแรก) |
| `data/build-report.json` | คำของสถานะการผ่านนิยามและพิกัดพร้อมกฎที่อ่าน ประเภทที่จัดด้วย keyword พื้นที่ย่อยที่ไม่มีโครงการแม่ — สำหรับตรวจก่อนเผยแพร่ ไม่ได้โหลดโดยหน้าเว็บ | — |
| `data/provinces.geojson` | 77 จังหวัด simplified, `id` = รหัส production (`BKK`), `dopa`, `th`, `en`, `areaKm2` | ≤ 300 KB |
| `data/districts.geojson` | 928 เขต/อำเภอ simplified แบบรักษา topology, `id` = รหัส 4 หลัก (= `code` ของ production), `province`, `th`, `en`, `areaKm2` | ≤ 1.5 MB |
| `data/venue-buildings.geojson` | 127 รูปทรงของ 74 สถานที่ที่ผ่านนิยาม (footprint 74, part 53) map เข้า schema ของ `buildings.js`; ความสูงที่ไม่รู้คงเป็น `null` | ≤ 900 KB (จริง 192 KB) |
| `data/venue-logos.json`, `assets/venue-logos/` | โลโก้ที่ตรง sha256 ของทะเบียน (โหลดผ่าน Drive connector) | — |

แถวใน `venues.json` (ชื่อฟิลด์ camelCase): ตัวตน (`id` = `venue_id`, `name`, `nameTh`, `nameEn`, `scId` = `mall_external_id`, `citymeterId`, `citymeterStatus`) · ประเภท (`group`, `groupBasis` evidence/legacy, `venueType`, `legacyType`, `subtype`) · นิยาม (`tier` supported/historical/planned, `qualification`, `countable`, `countRole`, `parentId`, `hierarchyRole`) · สถานะ (`status` supply/planned/closed, `operationGroup`, `operation`) · ผู้บริหารและการติดต่อ (`operator`, `operatorGroup`, `website`, `directory`, `phone`, `hours`, `hoursScope`, `yearOpened`) · ขนาด (`size` เฉพาะค่าที่มี: reported GLA/GFA/site/floors/tenants พร้อมขอบเขต, legacy GLA/GFA พร้อม `basis`) · ที่ตั้ง (`address`, `addrProvince`, `addrDistrict`, `lat`, `lon`, `located`, `coordinateStatus`, `coordinateRole`) · พื้นที่ (`provinceCode`, `districtCode` จาก point-in-polygon เฉพาะ `located`) · ร้านข้างใน (`stores` = จำนวนยืนยัน + ชุดข้อมูล) · หลักฐาน (`ev` ต่อช่อง: basis, url, checkedOn) · `logoKey`, `buildings`

กติกา: ไม่มีลิงก์ `docs.google.com` / `drive.google.com` หรือรหัสชีตภายในในไฟล์สาธารณะ (หลักฐานที่เป็นไฟล์ภายในแสดงเป็น “เอกสารภายใน” ไม่มีลิงก์) · ค่าว่างคือ `null` ไม่ใช่ 0 · ไม่แก้ค่าต้นทาง ค่าดิบที่ใช้จัดกลุ่มอยู่คู่กันเสมอ

## 4. ตัวเลขและกติกาการนับ

- **ผ่านนิยาม** = `venue_qualification_status` กลุ่ม definition-supported / qualified (ปัจจุบัน 506 · ย้อนหลัง 55 · อนาคต 4 = 565); `pending_*` = รอตรวจ ไม่นับ
- **นับได้** = ผ่านนิยาม และ `count_role` ไม่ใช่พื้นที่ย่อย/อาจซ้ำ → 540
- **อุปทาน** = นับได้ ไม่ใช่ `future_project` และไม่ใช่ `closed_source_evidence` → 536
- **ระบุตำแหน่งได้** = `coordinate_status` เป็นจุดที่เลือกแล้ว (ไม่ใช่ `not_collected*`, `held_*`, `not_selected*`, ว่าง) → 483 ใน 57 จังหวัด 160 เขต/อำเภอ; อีก 53 แห่งอยู่ในรายการและตาราง ไม่อยู่บนแผนที่และไม่เข้าตัวเลขรายพื้นที่
- **พื้นที่ย่อย** (25) ไม่บวกกับโครงการแม่; แสดงในแผงของโครงการแม่เมื่อหา parent ได้; ที่หา parent ไม่ได้รายงานเป็นรายการตรวจสอบ
- **ข้อค้นพบแรก (D1):** ในขอบเขตตัวกรองปัจจุบัน (ไม่รวมการเลือกพื้นที่) หาเขตที่มีแห่ง/ตร.กม. สูงสุดของประเทศ → จังหวัด P ของเขตนั้น (หรือจังหวัดที่ผู้ใช้เลือก) → เรียงเขตใน P ตามแห่ง/ตร.กม. (เสมอกันใช้จำนวน แล้วรหัส) เลือก 3 เขตแรกที่มี ≥ 1 แห่ง → ตัวตั้ง = จำนวนในสามเขต · ตัวหาร = อุปทานที่ระบุตำแหน่งได้ใน P · บริบทพื้นที่ = ผลรวมพื้นที่สามเขต ÷ พื้นที่ P (ผลรวมพื้นที่เขตจากแหล่งขอบเขตเดียวกัน) · ทุกตัวเลขมาพร้อม dataset · source · date · boundary
- **ผู้บริหาร:** `operatorGroup` จากตารางชื่อที่ประกาศไว้ (ชื่อบริษัทที่ระบุก่อนในข้อความ; รวมสะกดไทย/อังกฤษของบริษัทเดียวกัน) — Inference ที่เผยแพร่ใน `DATA_METHOD.md`; ข้อความดิบแสดงในรายละเอียดเสมอ; กราฟเรียกว่า “สัดส่วนจำนวนสถานที่” ไม่ใช่ market share

## 5. สีและสัญลักษณ์ (LDS 0.9.7)

- เขต/อำเภอ: `density.area` (แห่ง/ตร.กม.) classes แบบ quantile ของการอ่านนั้น (ขอบแสดงใน legend ทุกครั้ง) จาก class table 5 ระดับ (LUT index 0/10/20/30/40) หรือ 3 ระดับ (0/20/40) เมื่อค่าแบ่ง 5 ระดับไม่ได้ · measured zero = fill ต่ำสุด + `zeroOutline` · นอกจังหวัดที่อ่าน = out_of_scope ไม่ระบาย — เปลี่ยนจากแผน 0.1 (thresholds คงที่) เพราะจำนวนสถานที่ต่อเขตต่างกันมากระหว่างจังหวัด และทะเบียนกำลังโตหลายเท่า thresholds ที่ตรึงจาก snapshot นี้จะไม่แยกค่าในรอบหน้า
- จังหวัด: `count` quantile แบบจำนวนเต็มด้วยกติกา table เดียวกัน · HEX เดียวกันสองธีม
- กลุ่มประเภท: `landometer-series-10-v8` พร้อม cue ของ series — ศูนย์การค้า coral/circle · คอมมูนิตี้มอลล์ teal/hexagon · ตลาด lime/diamond · ไฮเปอร์/ซูเปอร์มาร์เก็ตที่มีร้านเช่า mint/cross · พื้นที่ค้าปลีกในโครงการ sky/star · เอาท์เล็ต blue/ring · จุดพักรถและสถานีบริการ green/plus · อื่น ๆ slate/dash (ไม่มีม่วงหรือน้ำตาล; ไม่ใช้ series 2–3 ส้ม/ทองที่ชนกับ choropleth)
- อาคารของสถานที่: map role เดิมของ Luxury · รายการรอตรวจ: `--text-disabled` ขนาดเล็ก · ไม่มี bracket หรือแถบสีซ้ายเชิงตกแต่ง · focus ring มองเห็นได้

## 6. หน้าจอและพฤติกรรม

- **ภาพแรก:** preset `city` (pitch 56, bearing 28) จัดกรอบ 3 เขตของ Aha, focus อัตโนมัติ; แผงแสดง “18% ของศูนย์การค้าและสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้ — 32 จาก 181 แห่ง บนพื้นที่ 1.2% ของเมือง” + คำสั่ง: ดูทุกเขตในจังหวัด (`areas=all`) · ดูทั้งประเทศ · เทียบพื้นที่ — ไม่มี caveat บนหน้าแรก
- **ทั้งประเทศ (zoom < 9):** กรอบจังหวัดระบาย `count` + ป้ายชิป + รายการจังหวัดในแผง → drill-down
- **จังหวัด:** เขต/อำเภอของจังหวัดนั้นระบาย `density.area`; โปรไฟล์จังหวัด (จำนวนตามกลุ่ม ผู้บริหาร โครงการที่กำลังมา ปิดตามหลักฐาน และ “อีก k แห่งยังไม่มีพิกัดที่ผ่านเกณฑ์”)
- **เขต/อำเภอ:** preset `model`; โปรไฟล์เขต + รายการสถานที่; สถานที่นอกเขตเป็นจุดเทา
- **สถานที่:** มุมสถาปนิก (`eye`) เมื่อมีรูปทรงอาคารที่ผ่านเกณฑ์ ไม่เช่นนั้น `model` ที่จุด; แผงหลักฐานรายช่อง: ชื่อ (ฐานของชื่อ), กลุ่มประเภท + ค่าต้นทาง, การผ่านนิยาม, สถานะ + แหล่ง, ผู้บริหาร, เว็บทางการ/ไดเรกทอรีร้าน/โทร/เวลาเปิด (+ขอบเขตของเวลา), ปีที่เปิด, ขนาด (ค่าที่รายงาน หรือค่าประมาณเดิมพร้อมวิธีคำนวณ — D3), ที่ตั้ง + บทบาทพิกัด, ร้านที่ยืนยันว่าอยู่ข้างใน (จำนวน + ชุดข้อมูล + ลิงก์ Luxury Brands `?place=` เมื่อมี), พื้นที่ย่อย/โครงการแม่, รหัส (`venue_id`, Shopping Center id, CityMETER id)
- **รายการรอตรวจ:** กดจุดเทาแล้วได้การ์ดย่อ: ชื่อ ประเภทตามแหล่งเดิม “รอตรวจนิยาม — ไม่นับในตัวเลข” และบันทึกใน production
- **ค้นหา:** ชื่อไทย/อังกฤษ ผู้บริหาร และรหัส (substring หลัง normalize ไม่ fuzzy) ผลที่ผ่านนิยามมาก่อน รายการรอตรวจติดป้าย
- **ตัวกรอง:** กลุ่มประเภท · ผู้บริหาร · สถานะ (อุปทาน ค่าเริ่มต้น / โครงการอนาคต / ปิดตามหลักฐาน / ทั้งหมดที่ผ่านนิยาม) · จังหวัด · ค้นหา
- **URL:** `province`, `district`, `venue`, `pending`, `group`, `operator`, `status`, `q`, `areas`, `view`, `view3d`, `cam`
- **สามขอบเขตแถว** (สัญญาเดิม): `rows` → หมุด ตัวนับ ตาราง; `scopeRows` (ตัวกรองก่อนเลือกพื้นที่) → Aha, choropleth, กราฟ; `baseRows` → ฐานเทียบโปรไฟล์
- **ช่องทาง:** `<noscript>` + ตาราง HTML สรุปจังหวัดที่สร้างตอน build, JSON-LD `Dataset`, `data/venues.json` สำหรับ agent

## 7. แผนงาน

| ID | งาน | ผลลัพธ์ / หลักฐานที่ต้องได้ | สถานะ |
|---|---|---|---|
| S00 | Product Statement (MBB §7.2) | `PRODUCT_STATEMENT.md` รุ่น 0.3 + การตัดสินใจ D1–D4 | done |
| S01 | Pipeline สถานที่ | `scripts/build-data.py` → `venues.json`, `details/`, `pending.json`, `build-report.json`; counts 565/540/536/483 และ D1 32/181 ตรงกับ `meta.checks.aha` ด้วย test · `npm run data:refresh` รันใหม่ด้วยคำสั่งเดียว | done |
| S02 | ขอบเขต + รหัส production | provinces 77 / districts 928 simplified; ทุก `id` ตรง production lv0/lv1 (remap `4026` → `4029` บันทึกใน meta) | done |
| S03 | อาคารของสถานที่ | 127 รูปทรงของ 74 สถานที่ (parts 10 · footprint 64); parent ที่มี parts เป็น outline; ความสูงไม่รู้คง `null` + display fallback 3 ม. | done |
| S04 | โลโก้สถานที่ | ไฟล์ตรง SHA-256 ของทะเบียน; ไม่มีลิงก์ Drive · ไฟล์ครบตามที่ระบุใน `data/venue-logos.json` `meta.status` | done (ดูจำนวนไฟล์ใน VERIFICATION) |
| S05 | Model + ตัวกรอง + Aha | `model.js`, `areas.js`, `area-insight.js` + unit tests บนข้อมูลจริง | done |
| S06 | แผนที่ | choropleth เขต/จังหวัด, หมุดรูปทรง, จุด GPU ของรายการรอตรวจและบริบท, อาคาร, มวลอาคาร focus (ทั้งเขตเมื่อ ≤ 40 ตร.กม. ไม่เช่นนั้นวงรัศมี 420 ม. รอบสถานที่ในโฟกัส ≤ 60 แห่ง) | done |
| S07 | แผง + breadcrumb + URL | ทุกโหมดใน §6; crumbs 4 ระดับ; permalink คืนสถานะ | done |
| S08 | กราฟ + ตาราง | เขตหนาแน่น, matrix ช่องเท่ากัน, ผู้บริหาร; ตารางทีละ 25 แถว | done |
| S09 | ข้อความ, help, SEO, noscript | คำไทยสั้นตาม Voice; ไม่มี caveat บนหน้าแรก; JSON-LD + ตาราง noscript สร้างด้วย `scripts/build-static.py` | done |
| S10 | ทดสอบ | `npm test` ผ่าน; browser 390/1280 × light/dark (harness ใน container + Chrome จริงบน live) — ผลใน `handoff/VERIFICATION.md` | ดู VERIFICATION |
| S11 | Release | push `main`, เปิด Pages, `verify:live` ตรงทุกไฟล์ | ดู VERIFICATION |
| S12 | Handoff | README, DATA_METHOD, AGENTS, docs/BUILD_CARD, `assets/manifest.json`, `handoff-manifest.json` (local) · เก็บ PS + แผนใน Drive `02_CityMETER/03_OUTPUTS_AND_EXAMPLES` · product-statement / implementation-plan แบบ JSON ยังไม่ทำ (เลื่อนไปรอบหลังข้อมูลชุดใหญ่) | partial |

## 8. เกณฑ์รับงาน

| ID | สถานการณ์ | ผลที่ต้องเห็น |
|---|---|---|
| AC01 | เปิดหน้า | ภาพแรก = 3D city preset ที่ 3 เขต Aha; แผงมี Aha + ตัวตั้ง/ตัวหาร/บริบทพื้นที่ + คำสั่ง; ตัวเลขคำนวณจาก `venues.json` |
| AC02 | ไม่นับปน | ตัวเลขทุกตัวนับเฉพาะ countable; พื้นที่ย่อยไม่บวก parent; โครงการอนาคต/ปิดแยกบรรทัด; รายการรอตรวจไม่เข้าตัวเลขใด |
| AC03 | รายการรอตรวจ | จุดเทาที่ zoom ≥ 11 ไม่มีโลโก้ ไม่อยู่ใน tab order; สวิตช์ซ่อนได้และจำใน URL; ค้นหาเจอพร้อมป้าย |
| AC04 | ไม่มีพิกัด | 53 แห่งอยู่ในรายการ/ตารางพร้อมป้าย ไม่มีหมุดและไม่เข้าตัวเลขรายพื้นที่ |
| AC05 | ขนาด (D3) | ค่าประมาณเดิมมีเฉพาะในแผงสถานที่พร้อมวิธีคำนวณ; ไม่มีผลรวม อันดับ หรือ filter ขนาด |
| AC06 | choropleth | ระดับสีตรง legend และกราฟอันดับ; หน่วย “แห่ง/ตร.กม.” และตัวหารบอกชัด; measured zero มีเส้นขอบศูนย์; HEX เดียวกันสองธีม |
| AC07 | หมุด | หนึ่งหมุดต่อสถานที่; สี + รูปทรงตามกลุ่ม; เส้นประ = อนาคต; กลวง = ปิดตามหลักฐาน; โลโก้เฉพาะ zoom ≥ 14 ในโฟกัส ≤ 250 |
| AC08 | อาคารของสถานที่ | มองเห็นและกดได้เสมอใน 3D (ลำดับชั้นเดิม + x-ray); parent ที่มี parts เป็น outline; ความสูงที่ไม่รู้ไม่ถูกอ้างเป็นข้อเท็จจริง |
| AC09 | breadcrumb | ประเทศไทย › จังหวัด › เขต/อำเภอ › สถานที่; `province` = รหัส production; `district` = รหัส 4 หลักของ production |
| AC10 | หลักฐานรายช่อง | ทุกช่องในแผงสถานที่มีแหล่งหรือบอกว่ายังไม่มี; ไม่มีลิงก์ Drive/Docs; missing ไม่แสดงเป็น 0 |
| AC11 | ร้านข้างใน | จำนวนยืนยัน + ชุดข้อมูล; ลิงก์ Luxury Brands เปิดสถานที่เดียวกันได้จริงเมื่อ id ตรง; candidate ไม่นับ |
| AC12 | desktop/mobile, light/dark | header 48 px; ไม่มี horizontal overflow ที่ 390 px; ภาษาไทยไม่ล้น; basemap ทั้งสองธีม |
| AC13 | คีย์บอร์ด/reduced motion | focus เห็นชัด; หมุด กราฟ แผง toolbar ใช้คีย์บอร์ดได้; กล้องไม่ animate เมื่อ reduced motion |
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

ใน container ของงานนี้ tile/glyph ของ OpenFreeMap ถูก proxy ปฏิเสธ — ตรวจ layout, แผง, กราฟ และชั้นข้อมูลด้วย Playwright + MapLibre จาก npm โดยตอบ tile ว่าง แล้วยืนยันรูปลักษณ์จริง (basemap, มวลอาคาร, 3D) บน live ผ่าน Chrome ของเจ้าของ ห้ามรายงานว่าเผยแพร่แล้วจากผลในเครื่อง

Repository `montri-th/shoppingcenter` · branch `main` · Pages แบบ branch deploy · ใส่ attribution ของ OpenFreeMap/OpenMapTiles/OpenStreetMap และ OpenGISData-Thailand (CC BY 4.0) · ไม่รวม raw internal sources หรือ governed LDS package ใน repository

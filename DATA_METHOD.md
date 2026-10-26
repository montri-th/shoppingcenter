# วิธีจัดทำข้อมูล — ศูนย์การค้า (Shopping centers)

เอกสารนี้อธิบายว่าเว็บนับอะไร นับอย่างไร และอะไรที่ตัวเลขพิสูจน์ไม่ได้ ใช้คู่กับ [Product Statement](PRODUCT_STATEMENT.md) (รุ่น 0.6) ชื่อบนหน้าจอคือ “ศูนย์การค้า” (Shopping centers) ส่วนขอบเขตของข้อมูลยังเป็นศูนย์การค้าและสถานที่ค้าปลีกตามนิยามของเจ้าของ โค้ดที่ทำตามกติกาเหล่านี้คือ `scripts/build-data.py` (สร้างข้อมูล) และ `js/model.js`, `js/areas.js`, `js/area-insight.js`, `js/scales.js`, `js/pin-buildings.js`, `js/massing.js` (อ่านและคำนวณบนหน้าเว็บ) ค่าที่ใช้จริงของแต่ละรอบบันทึกใน `meta` ของ [data/venues.json](data/venues.json) และ [data/build-report.json](data/build-report.json)

ป้ายหลักฐานตาม Landometer Master Brand Brief v0.5.3 §3.7: **Observed fact** (จากแหล่งใน scope ของแหล่งนั้น) · **Owner-stated** · **Inference** (การตีความของผู้จัดทำ) · **Hypothesis**

## 1. แหล่งข้อมูลและหน่วย

| แหล่ง | ใช้ทำอะไร | ตัวตนของรอบนี้ |
|---|---|---|
| CityMETER Shopping Centers & Retail Venues — Research Master แท็บ `01_VENUES` | ทะเบียนสถานที่ หลักฐานรายช่อง การผ่านนิยาม สถานะ พิกัด | export 25 ต.ค. 2569 16:39 น. หลังเจ้าของปิดคิวตรวจนิยามครบ (เหลือ 0 จาก 11,009) · SHA-256 `a8d9a5f9…` ใน `meta.inputs` (internal working reference) |
| แท็บ `09_RELATIONSHIPS` | ชื่อเรียกอื่น (alias) และความสัมพันธ์โครงการแม่–พื้นที่ย่อย | SHA-256 ใน `meta.inputs` |
| แท็บ `10_VENUE_LOGOS` | ทะเบียนโลโก้ (ไฟล์ บทบาท SHA-256) | ไฟล์ใช้ได้เมื่อ SHA-256 ตรงเท่านั้น |
| แท็บ `13_BUILDING_LINKS` + geometry bundle `CityMETER-retail-venue-host-geometry-2026-10-23` | รูปทรงอาคารของสถานที่ที่ผ่านเกณฑ์ | `selected-host-geometry.geojson` SHA-256 `9c948f99…` |
| OpenGISData-Thailand `districts.geojson` (อ้างอิงกรมการปกครอง, CC BY 4.0) | ขอบเขตเขต/อำเภอ 928 รายการ และจังหวัดที่ dissolve จากเขต | commit `fafcea1` · SHA-256 `329315c2…` |
| CityMETER production `base/info/lv0` และ `base/info/lv1/{provinceId}` | รหัสจังหวัด (`abbrEn` เช่น `BKK`) และรหัสเขต 4 หลักที่ breadcrumb ใช้ | 77 จังหวัด · 928 เขต/อำเภอ |
| CityMETER: Luxury Brands `data/luxury.json` | ลิงก์จากสถานที่ไปหน้า Luxury Brands (`?place=`) เมื่อเปิดสถานที่เดียวกันได้ | 39 สถานที่ |

**Grain:** หนึ่งแถว = หนึ่งสถานที่ (site) โดยโครงการแม่ (parent complex) และพื้นที่ค้าปลีกย่อย (retail component) เป็นคนละแถวที่เชื่อมกันด้วย `parent_venue_id` · join key คือ `venue_id` เท่านั้น ชื่อใช้ค้นหาอย่างเดียว

## 2. นิยามและการนับ

นิยาม retail venue ของเจ้าของ (Owner-stated, 23 ต.ค. 2569): สถานที่ที่มี **หลายกิจการขายผู้บริโภค** และมี **ผู้ดำเนินการรายเดียวบริหารพื้นที่ร่วม** การผ่านนิยามมาจาก `venue_qualification_status` ที่ทีมวิจัยบันทึกพร้อมหลักฐาน หรือกฎรายประเภทที่เจ้าของยอมรับและบันทึกไว้ในทะเบียน (ข้อ 2.1) หน้าเว็บไม่ตัดสินนิยามเอง

| ระดับ | กติกา (ฟิลด์ใน 01_VENUES) | รอบนี้ |
|---|---|---:|
| ทะเบียน | ทุกแถว | 11,009 |
| **ผ่านนิยาม** (`tier`) | `definition_supported*` / `qualified_*` = หลักฐานปัจจุบัน (`supported`) · `owner_<กฎ>_definition_accepted_*` และ `owner_confirmed_*` = ตามกฎที่เจ้าของข้อมูลยอมรับ (`owner`, ฟิลด์ `ownerRule`) · `historical_*` และ `definition_supported_historically_*` = หลักฐานย้อนหลัง · `planned_*` = โครงการอนาคต | 6,135 (717 · 5,191 · 223 · 4) — ตรงกับตัวเลขของชีต “ผ่านตามหลักฐานหรือเกณฑ์ที่ตกลง 6,135” |
| **นับได้** (`countable`) | ผ่านนิยาม และ `count_role` เป็นบทบาทที่นับ: `venue_site`, `venue_site_candidate`, `parent_complex`, `managed_site_parent`, `pending_scope_boundary_review`, `retail_scope_pending_terminal_boundary`, `retail_component_scope_not_entire_hotel_tower` · **ไม่นับแยก** (ฟิลด์ `countHold`): พื้นที่ย่อย `child_zone`, `child_venue`, `component_within_managed_site`, `retail_component_within_managed_site`, `retail_subarea_do_not_count_as_separate_parent_mall`, `child_component_not_independent_center_count` · อาจซ้ำ `duplicate_candidate_hold` และสถานะที่ระบุว่าอาจซ้ำ (`…_duplicate_count_held`, `…_duplicate_review`) แม้บทบาทจะเป็นบทบาทที่นับ · รอตรวจการนับ `retail_component_scope_count_review` · บริบทหลายสถานที่ `aggregate_context_not_independent_venue`, `individual_store_context_not_counted_as_venue` · **ยกเว้น (D6):** พื้นที่ย่อยที่ไม่มีโครงการแม่ในชุดที่ผ่านนิยาม นับเป็นสถานที่ของตัวเองเมื่อเป็นศูนย์การค้าหรือมอลล์ (กลุ่มจากหลักฐานเป็นศูนย์การค้าหรือคอมมูนิตี้มอลล์ หรือเจ้าของระบุ) | 6,084 (รวม D6 6 แห่ง) · ไม่นับแยก 51: พื้นที่ย่อย 22 · อาจซ้ำ 16 · รอตรวจการนับ 12 · บริบท 1 |
| **อุปทาน** (`status = supply`) | นับได้ และ `operation_group` ไม่ใช่ `future_project` (→ กำลังจะเปิด) หรือ `closed_source_evidence` (→ ปิดแล้ว) | 6,079 · กำลังจะเปิด 3 · ปิดแล้ว 2 |
| **ระบุตำแหน่งได้** (`located`) | พิกัดอยู่ในประเทศ และ `coordinate_status` / `coordinate_role` เป็นจุดอ้างอิงที่เลือกแล้ว (ไม่ใช่ `held_*`, `withheld_*`, `not_collected*`, `not_selected*`, `*not_revalidated*`, role `held_*` / `not_selected*` / `no_*`) | 6,014 จาก 6,079 (ไม่มีพิกัดที่ผ่านเกณฑ์ 55 · จุดอยู่นอกขอบเขตเขต/อำเภอ 10) |
| **รอตรวจนิยาม** | `pending_*`, `definition_pending*` และค่าที่ลงท้าย `_pending` ที่ไม่อยู่ในกลุ่มข้างบน | 0 (คิวปิดครบ) |
| **ตรวจแล้ว ยังยืนยันนิยามไม่ได้** (บนหน้าจอ “ยังยืนยันไม่ได้”) | ค่าที่ขึ้นต้น `reviewed_` และมีคำ `unconfirmed` (รอบนี้ `reviewed_definition_unconfirmed`) | 4,869 |
| **ทะเบียนสรุปว่าไม่ใช่สถานที่แยก** | ค่าที่ขึ้นต้น `excluded` `rejected` `disqualified` `not_` `non_` `out_of_scope` `definition_not_` `definition_failed` `fails_` `does_not_` หรือมีคำ `not_independent_venue` `not_retail_venue` `not_a_retail` `not_qualified` `not_qualifying` `not_eligible` · และ `parent_context_*` (โครงการแม่ที่ทะเบียนปิดเป็นบริบท ห้างข้างในผ่านนิยามแยก) | 5 (ตรงกับชีต: ไม่เข้าเกณฑ์ 2 + บริบทศูนย์แม่/ผู้เช่า 3) |

- ตัวเลขทุกตัวบนหน้าเว็บ (ตัวนับ แผนที่ กราฟ ตาราง ข้อค้นพบแรก) นับจาก **อุปทานที่นับได้** ตามตัวกรอง; สถานะ “กำลังจะเปิด” และ “ปิดแล้ว” แสดงเป็นรายการแยกในแผง เลือกดูได้จากตัวกรองสถานะ และไม่รวมกับอุปทาน
- พื้นที่ย่อยไม่บวกกับโครงการแม่: แสดงในแผงของโครงการแม่ (“พื้นที่ย่อยในโครงการ · ไม่นับแยก”) และเปิดดูหลักฐานได้ · แผงของแถวที่ไม่นับแยกมีป้ายสั้นจาก `countHold` (“พื้นที่ย่อย · ไม่นับแยก” · “อาจซ้ำ · ไม่นับแยก” · “รอตรวจการนับ · ยังไม่นับ” · “บริบทของหลายสถานที่ · ไม่นับ”)
- **Owner decision D6 (25 ต.ค. 2569):** พื้นที่ย่อยที่ผ่านนิยามแต่โครงการแม่ไม่อยู่ในชุดที่ผ่านนิยาม จะถูกนับที่ระดับของตัวเองเมื่อเป็นศูนย์การค้าหรือมอลล์ — รอบนี้ 6 แห่ง: เซ็นทรัล พาร์ค (โครงการแม่ ดุสิต เซ็นทรัล พาร์ค ถูกทะเบียนปิดเป็นบริบท — ดู §14 ข้อ 6), วัน แบงค็อก (พื้นที่ค้าปลีก), สามย่านมิตรทาวน์, สีลมคอมเพล็กซ์ (สามแห่งนี้เจ้าของระบุว่าเป็นศูนย์การค้า; วัน แบงค็อก และสีลมคอมเพล็กซ์มีประเภทจากหลักฐานเป็น `retail_zone` จึงแสดงในกลุ่มศูนย์การค้าด้วยฐาน “เจ้าของระบุ”), อาทาระ มอลล์ ศรีราชา และมหานคร คิวบ์ (ประเภทจากหลักฐานเป็นคอมมูนิตี้มอลล์/ศูนย์การค้า) · หลักฐานรายช่องของสถานที่บอกว่า “นับเป็นสถานที่ของตัวเอง · โครงการแม่ไม่อยู่ในชุดที่ผ่านนิยาม” (ไม่ขึ้นบนหน้าจอหลัก) · ถ้าทะเบียนเพิ่มโครงการแม่ที่ผ่านนิยามในภายหลัง ระบบจะนับที่โครงการแม่แทนโดยอัตโนมัติ จำนวนรวมไม่ซ้ำ · D6 ใช้กับบทบาทพื้นที่ย่อยเท่านั้น ไม่ใช้กับรายการที่อาจซ้ำ รอตรวจการนับ หรือบริบท
- สถานที่ที่ยังไม่มีพิกัดที่ผ่านเกณฑ์อยู่ในตารางและผลค้นหาพร้อมป้าย “ยังไม่มีพิกัด” ไม่ถูกวางบนแผนที่ และไม่เข้าตัวเลขรายพื้นที่ จุดที่อยู่นอกเส้นเขตทุกเส้น (ริมทะเลหรือชายแดน) ก็ไม่เข้าตัวเลขรายพื้นที่เช่นกัน ตารางเขียนว่า “หมุดอยู่นอกเส้นเขต” แผงภาพรวมบอกจำนวนรวมของทั้งสองกลุ่มครั้งเดียว (“อีก k แห่งยังระบุเขต/อำเภอไม่ได้ · ดูในตาราง”) และคำบรรยายกราฟนับเฉพาะสถานที่ที่อยู่ในเขต/อำเภอ สองตัวเลขนี้บวกกันได้จำนวนทั้งหมดของขอบเขตที่อ่าน ตัวกรองจังหวัดใช้จังหวัดในที่อยู่เฉพาะแถวที่ไม่อยู่ในเขต/อำเภอใด
- ค่าที่ไม่มีคือไม่มี: ไม่แสดง 0 แทนค่าว่าง แผงแสดง “ยังไม่มีข้อมูล”
- **คำใหม่ของทะเบียน:** ค่า `venue_qualification_status` ที่ไม่ตรงกฎใดถือเป็นรอตรวจ (ไม่นับ) และถูกรายงานใน `meta.checks.qualificationFallback` · `count_role` ใหม่ของแถวที่ผ่านนิยามไม่นับและถูกรายงานใน `meta.checks.countRoleFallback` · test ไม่ผ่านจนกว่าจะจัดเข้ากฎทั้งสองอย่าง เพื่อไม่ให้รอบอัปเดตนับหรือซ่อนรายการโดยไม่มีคนตรวจ (ค่า `owner_<กฎ>_definition_accepted_*` ใหม่อ่านเป็นกฎของเจ้าของได้เอง และแสดงชื่อกฎกลาง “กฎรายประเภท” จนกว่าจะเพิ่มชื่อไทยใน `js/model.js`)

### 2.1 กฎรายประเภทที่เจ้าของข้อมูลยอมรับ (Owner-stated)

ทะเบียนรอบนี้บันทึกว่าเจ้าของยอมรับกฎรายประเภทเป็นการผ่านนิยาม (`owner_<กฎ>_definition_accepted_identity_current_and_count_separate`: ยอมรับนิยาม ตัวตนเป็นปัจจุบัน การนับแยกพิจารณาจาก `count_role`) กฎเหล่านี้ใช้แทนหลักฐานผู้บริหารพื้นที่ร่วมรายเดียวของประเภทนั้น ไม่ได้เพิ่มหลักฐานนั้น — เช่น ตลาด 3,858 จาก 3,904 แห่งยังมี `shared_area_governance_status = pending_single_operator_evidence` หลักฐานรายช่องของสถานที่จึงเขียนว่า “ผ่านนิยามตามกฎที่เจ้าของข้อมูลยอมรับ · <กฎ>” แทน “ผ่านนิยามด้วยหลักฐานปัจจุบัน”

| กฎ (`ownerRule`) | บนหน้าจอ | ผ่านนิยาม | อุปทาน |
|---|---|---:|---:|
| `market` | ตลาด | 3,904 | 3,898 (อาจซ้ำ 4 · พื้นที่ย่อย 1 · บริบท 1) |
| `fuel_retail_presence` | สถานีบริการน้ำมันที่มีร้านค้า | 1,173 | 1,173 |
| `exact_inside_multiple_businesses` | มีหลายกิจการอยู่ภายในที่เดียวกัน | 47 | 46 (พื้นที่ย่อย 1) |
| `lotus_restaurant_presence` | โลตัสที่มีร้านอาหาร | 26 | 26 |
| `anchor_second_business` | ร้านหลักที่มีกิจการอื่นอยู่ด้วย | 18 | 3 (การนับแยกยังรอตรวจ 12 · พื้นที่ย่อย 3) |
| `foodland_plus_tooklaedee` / `foodland_tooklaedee` | ฟู้ดแลนด์ที่มีร้านถูกและดี | 17 + 1 | 17 (พื้นที่ย่อย 1) |
| `project_source_common_management_inferred` | แหล่งข้อมูลโครงการบ่งชี้ผู้บริหารร่วม | 3 | 3 |
| `confirmed_managed_retail_component` (`owner_confirmed_*`) | เจ้าของข้อมูลยืนยันรายสถานที่ · พื้นที่ค้าปลีกที่บริหารร่วม | 2 | 2 |
| รวม | | 5,191 | 5,168 |

ตลาดที่ผ่านด้วยกฎนี้ส่วนใหญ่มีสถานะปัจจุบันแบบรอยืนยัน (`operation_group = needs_review`, `operation_status = not_revalidated` 3,574 แห่ง) จึงอยู่ใน “เปิดอยู่หรือรอยืนยันสถานะ” ตามกฎอุปทานเดิม แผงสถานที่บอกสถานะของแต่ละแห่ง

## 3. กลุ่มประเภทบนหน้าจอ (Inference — ใช้นำทาง ไม่ใช่การจัดประเภทใหม่)

กลุ่มมาจาก `venue_type` ที่มีหลักฐานก่อน (`groupBasis = evidence`); ถ้าค่านั้นยังไม่อยู่ในตาราง ใช้คำในชื่อประเภทตามลำดับ (`evidence-keyword`); ใช้ `legacy_venue_type` เฉพาะเมื่อ `venue_type` เป็น `unclassified` (`legacy` — แผงสถานที่ติดป้าย “ประเภทตามแหล่งเดิม”); `owner` เฉพาะสถานที่ที่เจ้าของระบุว่าเป็นศูนย์การค้าตาม D6 ค่าต้นทางแสดงในแผงสถานที่เสมอ ประเภทใหม่ 60 ค่าที่มากับกฎของเจ้าของ (และ 92 ค่าที่มากับการปิดคิวรอบ 16:39 น.)ถูกตรวจการจัดด้วยคำทีละค่าแล้วบันทึกลงตาราง (`TYPE_GROUP_ADDED_2026_10_25`) จึงไม่มีประเภทที่ผ่านนิยามซึ่งยังต้องใช้ keyword

| กลุ่ม | สี / รูปทรง | อุปทาน (ระบุตำแหน่งได้) |
|---|---|---:|
| ศูนย์การค้า (`mall`) | series 1 coral · วงกลม | 253 (238) |
| คอมมูนิตี้มอลล์ (`community`) | series 7 teal · หกเหลี่ยม | 153 (128) |
| ตลาด (`market`) | series 4 lime · ข้าวหลามตัด | 4,026 (4,017) |
| ไฮเปอร์มาร์เก็ตและซูเปอร์มาร์เก็ตที่มีร้านเช่า (`hoststore`) | series 5 mint · กากบาท | 174 (174) |
| พื้นที่ค้าปลีกในโครงการ (`component`) | series 6 sky · ดาว | 120 (107) |
| เอาท์เล็ต (`outlet`) | series 8 blue · วงแหวน | 13 (13) |
| สถานีบริการน้ำมันและจุดพักรถ (`fuel`) | series 10 green · บวก | 1,333 (1,331) |
| อื่น ๆ (`other`) | series 9 slate · ขีด | 7 (6) |

สีจาก `landometer-series-10-v8` ของ LDS 0.9.7 ใน `assets/theme.css` (ไม่มีม่วงหรือน้ำตาล; เว้น series 2–3 ที่เป็นส้ม/ทองซึ่งชนกับสเกลความหนาแน่น) รูปทรงกำกับทุกหมุดและทุกคำอธิบาย สีจึงไม่ใช่ทางเดียวที่บอกประเภท กลุ่ม `hoststore` แยกออกมาเพราะรายการรอตรวจจำนวนมากเป็นไฮเปอร์มาร์เก็ต/ซูเปอร์มาร์เก็ตที่มีร้านเช่า · กลุ่ม `fuel` เปลี่ยนชื่อเป็น “สถานีบริการน้ำมันและจุดพักรถ” (สั้น: สถานีบริการ) รอบนี้ เพราะส่วนใหญ่เป็นสถานีบริการที่มีร้านค้าตามกฎของเจ้าของ ไม่ใช่จุดพักรถ

**ตารางจับคู่ `venue_type` → กลุ่ม** (ตัวเต็มใน `meta.groupMapping.evidence`)

| กลุ่ม | `venue_type` (หลักฐาน) | `legacy_venue_type` |
|---|---|---|
| ศูนย์การค้า | `shopping_center`, `shopping_center_building`, `shopping_center_under_construction`, `retail_complex`, `managed_retail_center`, `lifestyle_center`, `power_center`, `entertainment_anchored_mall`, `specialty_shopping_center`, `specialty_retail_center`, `specialty_retail_and_consumer_services_center`, `department_store_or_retail_complex`, `fashion_retail_and_wholesale_center`, `former_fashion_retail_and_wholesale_center`, `shopping_office_retail_building`, `mixed_use_retail_venue`, `mixed_use_retail_host`, `mixed_use_parent_with_retail_component` | `mega_mall`, `traditional_regional_mall`, `entertainment_anchored_mall`, `mixed_use_super_regional` |
| คอมมูนิตี้มอลล์ | `community_shopping_center`, `community_shopping_center_candidate`, `community_shopping_center_opening_unconfirmed`, `community_mall`, `community_retail_center`, `community_food_and_retail_mall`, `community_retail_and_sports_complex`, `convenience_retail_center`, `retail_and_service_complex`, `retail_and_dining_complex`, `retail_service_plaza`, `specialty_retail_and_cultural_center` | `avenue`, `boutique_retail`, `convenience_strip`, `home_improvement_center` |
| ตลาด | `retail_market`, `fresh_market`, `market_unspecified`, `periodic_market`, `periodic_walking_street_market`, `licensed_type_1_market`, `floating_market`, `street_market`, `night_market`, `community_market`, `roadside_fresh_market`, `wholesale_produce_market`, `mixed_wholesale_retail_market`, `creative_market_and_retail_space`, `fresh_market_and_community_retail_center`, `community_mall_and_managed_market_complex`, `community_market_and_retail_complex`, `retail_bazaar_candidate` | `wet_market_covered`, `night_market`, `wholesale_agricultural_market`, `walking_street` |
| ไฮเปอร์/ซูเปอร์มาร์เก็ตที่มีร้านเช่า | `supermarket_store_or_host_component`, `hypermarket_store_or_host_component`, `wholesale_store`, `wholesale_store_or_host_component`, `specialty_retail_store_or_host_component`, `factory_outlet_retail_store`, `retail_store` | `supermarket_anchored`, `hypermarket_anchored`, `wholesale_club` |
| พื้นที่ค้าปลีกในโครงการ | `managed_retail_component`, `managed_retail_component_candidate`, `retail_zone`, `mixed_use_retail_component`, `office_retail_podium`, `residential_retail_podium`, `resort_retail_component`, `hospital_retail_component`, `duty_free_retail_component`, `transport_terminal_retail_component`, `transport_terminal_retail_scope` | `terminal_duty_free` |
| เอาท์เล็ต | `outlet_shopping_center`, `outlet_center` | `premium_outlet_village`, `standard_outlet` |
| สถานีบริการน้ำมันและจุดพักรถ | `fuel_station_retail_scope_unconfirmed`, `fuel_station_with_source_listed_retail_component`, `fuel_station_with_retail_component`, `fuel_station_with_historical_retail_component`, `multi_tenant_travel_retail_stop`, `highway_retail_rest_stop` | `gas_station_retail` |
| อื่น ๆ | `managed_retail_entertainment_precinct`, `retail_precinct`, `heritage_retail_destination_under_redevelopment`, `retail_food_and_wholesale_mixed_destination` | — |

ตารางข้างบนย่อเฉพาะค่าหลัก รอบ 25 ต.ค. 2569 เพิ่มประเภทที่มากับกฎของเจ้าของ: ตลาด 34 ค่า (เช่น `covered_market_source_reported`, `agricultural_wholesale_market`, `walking_street_market`, `municipal_market`) · ไฮเปอร์/ซูเปอร์มาร์เก็ต 16 (เช่น `grocery_store_with_source_listed_restaurant_component`, `supermarket_with_source_listed_consumer_unit_component`) · ในโครงการ 3 · อื่น ๆ 3 (`historic_retail_district`, `historic_retail_district_walking_street`, `retail_food_district`) · คอมมูนิตี้มอลล์ 1 · รอบ 16:39 น. เพิ่มอีก 92 ค่า (ตลาด 50 · ไฮเปอร์/ซูเปอร์มาร์เก็ต 16 · ในโครงการ 9 · คอมมูนิตี้มอลล์ 8 · อื่น ๆ 4 · สถานีบริการ 3 · ศูนย์การค้า 2; `TYPE_GROUP_ADDED_2026_10_25`)

**กฎคำสำหรับประเภทใหม่** (ลำดับแรกที่ตรงชนะ, `meta.groupMapping.keywords`): `fuel` / `rest_stop` / `travel_retail` → สถานีบริการ · `store_or_host_component` / `retailer_multibusiness` / `store_multibusiness` / `factory_outlet` / `single_retail` / `showroom` / `retail_store` / `supermarket` / `hypermarket` / `grocery` / `wholesale_store` → ไฮเปอร์/ซูเปอร์มาร์เก็ต · `component` / `podium` → ในโครงการ · `market` / `bazaar` → ตลาด · `outlet_center` / `outlet_shopping` / `outlet_village` → เอาท์เล็ต · `community` / `retail_and_dining` / `retail_and_service` → คอมมูนิตี้มอลล์ · `shopping_center` / `shopping_mall` / `department_store` / `plaza` / `mall` → ศูนย์การค้า · ไม่ตรงคำใด → อื่น ๆ

## 4. ผู้บริหาร (Inference)

`operator_name` เป็นข้อความอิสระ จึงจัดกลุ่มด้วยตารางชื่อที่ประกาศไว้: หาชื่อบริษัทในตารางที่ปรากฏ **ก่อนสุด** ในข้อความ (รวมสะกดไทย/อังกฤษของบริษัทเดียวกัน) ไม่พบในตาราง → กลุ่ม “อื่น ๆ” โดยคงชื่อที่ตัดคำอธิบายในวงเล็บออกแล้ว · ว่าง → “ยังไม่มีข้อมูล” · ข้อความดิบแสดงในแผงสถานที่เสมอ กราฟผู้บริหารเรียกว่า **สัดส่วนจำนวนสถานที่** ไม่ใช่ market share (LDS Location Profile `li.market_share`) และไม่ได้ถ่วงด้วยขนาด

| กลุ่ม | คำที่ใช้จับ | อุปทาน |
|---|---|---:|
| CP Axtra (Lotus’s) | CP Axtra · ซีพี แอ็กซ์ตร้า · Lotus’s | 202 |
| Central Pattana | Central Pattana · เซ็นทรัลพัฒนา · Siam Future Development · SF Development | 55 |
| Central Retail | Central Retail · (CRP) · สรรพสินค้าเซ็นทรัล | 32 |
| ปตท. บริหารธุรกิจค้าปลีก | ปตท.บริหารธุรกิจค้าปลีก · PTT Retail | 25 |
| Home Product Center | Home Product Center · โฮม โปรดักส์ เซ็นเตอร์ | 22 |
| Index Living Mall | Index Living Mall · อินเด็กซ์ ลิฟวิ่งมอลล์ · The Walk Company | 18 |
| เทศบาลและ อปท. | เทศบาล · องค์การบริหารส่วนตำบล · อบต. | 17 |
| Asset World (AWC) · ALLY · Big C | ชื่อไทย/อังกฤษของแต่ละบริษัท | 11 · 11 · 11 |
| OLM / Pena House | OLM PROPERTY · Outlet Mall Company · Pena House | 10 |
| The Mall Group | The Mall Group · เดอะมอลล์ | 9 |
| JAS Asset · Siam Piwat · Major Cineplex · Chic Republic · MBK · Minor | ชื่อไทย/อังกฤษของแต่ละบริษัท | 7 · 6 · 6 · 6 · 4 · 3 |
| อื่น ๆ (ชื่อของตัวเอง 160 ราย) | — | 225 |
| ยังไม่มีข้อมูล | — | 5,399 |

รอบนี้ผู้บริหารที่ระบุได้มี 680 จาก 6,079 แห่ง (ตลาดและสถานีบริการที่ผ่านด้วยกฎของเจ้าของส่วนใหญ่ยังไม่มีชื่อผู้บริหาร) กราฟผู้บริหาร (amCharts) จึงวาดเฉพาะผู้บริหารที่ระบุชื่อได้ 12 อันดับแรก และบอกจำนวน “ผู้บริหารรายอื่น” กับ “ยังไม่ระบุผู้บริหาร” ไว้เหนือกราฟเสมอ (ไม่ให้แท่งของรายการที่ไม่รู้กดแท่งอื่นจนอ่านไม่ได้) เปอร์เซ็นต์คิดจากสถานที่ทั้งหมดในจังหวัดที่อ่าน (หรือทั้งประเทศ) · ข้อสังเกต: “บริษัท ปิโตรเลียมไทยคอร์ปอเรชั่น จำกัด” (33) และ “Tops” (13) ยังไม่อยู่ในตารางชื่อ จึงแสดงเป็นชื่อของตัวเอง

## 5. พื้นที่

- **สมาชิกภาพ:** point-in-polygon ของจุดอ้างอิงที่เลือกแล้ว กับขอบเขตเขต/อำเภอความละเอียดเต็ม (shapely `covers`; จุดบนเส้นแบ่งใช้รหัสที่น้อยกว่า) คำนวณครั้งเดียวใน pipeline แล้วบันทึก `provinceCode` / `districtCode` ต่อแถว ไม่ใช้ชื่อหรือที่อยู่จัดเข้าพื้นที่ และไม่จับเข้าพื้นที่ใกล้ที่สุด จุดที่อยู่นอกขอบเขตทุกเขตไม่มีพื้นที่ (รอบนี้ 10 แห่งที่ผ่านนิยาม — ตลาดริมทะเลหรือริมแม่น้ำชายแดน เช่น ตลาดอาหารทะเลอ่างศิลา ตลาดริมเมย — นับในอุปทานแต่ไม่อยู่ในเขตใด และรายการที่ยังไม่ผ่านนิยาม 1 จุด)
- **รหัส:** จังหวัดใช้ `abbrEn` ของ production (77) · เขต/อำเภอใช้รหัส 4 หลักของ production; ขอบเขต `4026` เวียงเก่า (ขอนแก่น) ไม่มีใน production จึงจับคู่ด้วยชื่อในจังหวัดเดียวกันเป็น `4029` (`meta.checks.districtCodeRemaps`)
- **พื้นที่ ตร.กม.:** ใช้ค่า `area_sqkm` ที่มากับขอบเขต OpenGISData-Thailand เป็นตัวหารของ “แห่ง/ตร.กม.”; พื้นที่จังหวัด = ผลรวมพื้นที่เขตของจังหวัดจากแหล่งเดียวกัน
- **รูปทรงที่แสดง:** mapshaper 0.6.102 ลดจุด 14% แบบ keep-shapes (planar, precision 0.0001) เพื่อการแสดงผลเท่านั้น จังหวัด dissolve จากเขตที่ลดจุดแล้ว ตำแหน่งป้ายใช้ representative point ของรูปทรงเต็ม สมาชิกภาพไม่เปลี่ยนตามการลดจุด
- เขต/อำเภอเป็นขอบเขตการปกครอง ไม่ใช่ catchment หรือย่านการค้า และกรอบจังหวัดเป็นบริบทนำทาง ไม่ใช่คำยืนยันเขตปกครอง

## 6. ข้อค้นพบแรก (Owner decision D1)

ทุกครั้งที่ข้อมูลหรือตัวกรองเปลี่ยน (`js/area-insight.js`; Python คำนวณซ้ำไว้ตรวจใน `meta.checks.aha`):

1. ใช้อุปทานที่นับได้และมี `districtCode` ตามตัวกรอง (ก่อนการเลือกพื้นที่)
2. หาเขตที่มีแห่ง/ตร.กม. สูงสุดของประเทศ (เสมอกันใช้จำนวน แล้วรหัส) → จังหวัด P ของเขตนั้น (ถ้าผู้ใช้เลือกจังหวัด ใช้จังหวัดนั้น)
3. เรียงเขตใน P ตามแห่ง/ตร.กม. เลือก 3 เขตแรกที่มีอย่างน้อย 1 แห่ง
4. ตัวตั้ง = จำนวนในสามเขต · ตัวหาร = อุปทานที่ระบุตำแหน่งได้ใน P · บริบทพื้นที่ = ผลรวมพื้นที่สามเขต ÷ พื้นที่ P

รอบนี้: สัมพันธวงศ์ 5.05 · พระนคร 4.55 · บางรัก 4.52 แห่ง/ตร.กม. → **49 จาก 856 แห่งของกรุงเทพฯ (5.7%) บนพื้นที่ 10.65 จาก 1,566.58 ตร.กม. (0.68%)** — แผงแสดงอัตราส่วนสองค่านี้เป็น “แน่นกว่าค่าเฉลี่ยของกรุงเทพฯ 8 เท่า” (สัดส่วนจำนวน ÷ สัดส่วนพื้นที่ = ความหนาแน่นของสามเขต ÷ ความหนาแน่นของจังหวัด ปัดเป็นจำนวนเต็ม แสดงเมื่อ ≥ 2) (รอบ 15:06 น.: 49 จาก 838 · ก่อนรวมกฎรายประเภทของเจ้าของ: ปทุมวัน บางรัก ราชเทวี 36 จาก 185 · ก่อน D6: 32 จาก 181) ตลาดในย่านเยาวราช–สำเพ็งและพระนครทำให้สามเขตนี้ขึ้นมาแทน เป็นคำอธิบายการกระจุกตัวของสถานที่ที่ผ่านนิยามในชุดนี้ ไม่ใช่คำตัดสินศักยภาพ ช่องว่างตลาด หรือ “ทำเลทอง”

## 7. สเกลสีของพื้นที่ (LDS 0.9.7)

| ระดับ | ค่า | สเกล | วิธีให้สี |
|---|---|---|---|
| เขต/อำเภอ (ในจังหวัดที่อ่าน) | แห่ง/ตร.กม. | `density.area` LUT 41 ค่า (`scaleVersion 554812a7…`) | ใช้ครบ 41 ค่า ตามลำดับค่าของเขตที่อ่าน |
| จังหวัด (ทั้งประเทศ, zoom < 9) | จำนวนสถานที่ที่ระบุตำแหน่งได้ | `count` LUT 41 ค่า (`scaleVersion 4ff5c1fb…`) | ใช้ครบ 41 ค่า ตามลำดับค่าของจังหวัด |
| ช่องตารางพื้นที่ × ประเภท | จำนวนสถานที่ | `count` LUT 41 ค่า | ใช้ครบ 41 ค่า ตามลำดับค่าของช่อง |

**คำสั่งเจ้าของ 25 ต.ค. 2569: สเกลสีใช้ครบ 41 สีตาม LDS** — ทุกพื้นที่และทุกช่องใช้ตัวอย่างสีหนึ่งใน 41 ค่าของ LUT ตรง ๆ (DATAVIZ-02 continuous ramp) ไม่ใช้ชุด 3/5 ระดับอีก วิธี (consumer-supplied ตาม DATAVIZ-02 และประกาศในคำอธิบายแผนที่): เรียงค่าที่มากกว่า 0 ของพื้นที่ที่กำลังอ่าน แต่ละค่าได้ตำแหน่ง LUT ตาม mid-rank percentile ที่ยืดให้ค่าต่ำสุดอยู่ index 0 และค่าสูงสุดอยู่ index 40 (ค่าเดียวอยู่ index 40) ค่าเท่ากันได้สีเดียวกัน ไม่มีการ interpolate ระหว่างตัวอย่าง ค่าสูงสุดปิดสเกลเอง (ไม่มีชั้นเปิดหรือการ clamp) และแผนที่ ป้าย กราฟ และคำอธิบายแผนที่อ่านค่าชุดเดียวกัน (`buildRamp` ใน `js/scales.js`) · class table 3/5/7/9 ของ LDS ยังเก็บไว้เป็น token คงที่ (`--scale-count-1…5`) แต่ไม่ใช้ระบายข้อมูล

ความต่างที่ต้องรายงาน: สัญญา MapLegend ของ LDS 0.9.7 เขียนถึง classes 3/5/7/9 ส่วน DATAVIZ-02 เปิดให้ใช้ continuous ramp ของ LUT 41 ค่าเดียวกัน — หน้านี้ทำตามคำสั่งเจ้าของ (อำนาจสูงกว่า LDS ตามลำดับของโครงการ) โดยไม่สร้างสีใหม่

- คำอธิบายแผนที่แสดงทั้ง 41 สีเรียงกัน พร้อมค่าจริงที่ตำแหน่งของค่าต่ำสุด สูงสุด และค่าที่ใกล้ index 10 · 20 · 30 (ห่างกันอย่างน้อย 8 ตำแหน่ง) ชื่อที่ screen reader อ่านบอกวิธี ค่าต่ำสุด สูงสุด และหน่วย · สีคำนวณใหม่ตามตัวกรองและพื้นที่ที่อ่าน จึงเทียบสีข้ามตัวกรองไม่ได้ — เทียบด้วยตัวเลขในกราฟอันดับหรือตาราง
- สถานะข้อมูลตาม EVID-05: **ศูนย์ที่วัดได้** (เขตในจังหวัดที่ไม่มีสถานที่) ใช้ตัวอย่าง index 0 พร้อมเส้นขอบศูนย์ และช่องศูนย์ในคำอธิบายใช้สีเดียวกับที่แผนที่วาด · **ไม่มีข้อมูล** ไม่ระบาย · **นอกขอบเขตการอ่าน** ไม่ระบาย เหลือเส้นขอบบาง
- HEX เดียวกันทั้งธีมสว่างและมืด ไม่มีสูตร dark ไม่ปรับความโปร่งใสของสีข้อมูล ป้ายชื่อพื้นที่เป็นชิปหมึกที่มีพื้นรองของตัวเอง ตัวเลขในช่องตารางที่วางบนสีซึ่งหมึกทั้งสองแบบไม่ถึง 4.5:1 (`count` index 27–29) อยู่บนพื้นรองกลาง โดยสีของช่องยังเป็นสีข้อมูลเดิม
- เมื่อซูมเกิน 14.5 สีพื้นที่ถอยเป็นเส้นขอบ เพื่อให้หมุดและอาคารอ่านได้

## 8. สถานะ

| `operation_group` | บนหน้าจอ |
|---|---|
| `operating_source_evidence`, `official_listing_not_field_verified` | มีหลักฐานว่าเปิด |
| `partially_operating` | ทยอยเปิด |
| `needs_review`, `current_operation_unconfirmed`, `operation_conflict`, `recent_source_evidence_current_operation_separate`, `historical_primary_current_reverification_pending`, ว่าง | รอยืนยันสถานะ (แผงสถานที่บอกรายละเอียดของแต่ละค่า) |
| `future_project` | กำลังจะเปิด (หมุดเส้นประ) |
| `closed_source_evidence` | ปิดแล้ว (หมุดกลวง; หลักฐานรายช่องเขียนว่า “ปิดตามหลักฐาน”) |

สถานะมาจากแหล่งที่อ้างไว้ ไม่ใช่การตรวจภาคสนาม “ผ่านนิยาม” จึงไม่เท่ากับ “ยืนยันว่าเปิดวันนี้” · รอบนี้อุปทาน 6,079 แห่งเป็นรอยืนยันสถานะ 4,193 แห่ง (ส่วนใหญ่เป็นตลาด) และมีหลักฐานว่าเปิดหรือทยอยเปิด 1,886 แห่ง

## 9. รายละเอียดสถานที่และหลักฐานรายช่อง

แผงสถานที่โหลดรายละเอียดจาก `data/details/NN.json` (NN = FNV-1a 32-bit ของ `venue_id` แบบ UTF-8 mod จำนวน shard; อย่างน้อย 32 shard และเพิ่มเป็นสองเท่าเมื่อเฉลี่ยเกิน 40 สถานที่ต่อ shard) แต่ละช่องมีฐานของค่า ลิงก์แหล่งสาธารณะ และวันที่ตรวจเมื่อมี · **หน้าจอหลักไม่มี caveat (เจ้าของสั่ง 25 ต.ค. 2569):** ส่วนที่มองเห็นแสดงค่าอย่างเดียว ส่วนวิธี ฐานของค่า คำว่า “ไม่ใช่ …” บทบาทพิกัด ขอบเขตของเวลาเปิด และวิธีของขนาด อยู่ในรายการ “หลักฐานรายช่อง” ที่พับไว้ (test ตัด `<details>` ออกแล้วต้องไม่เหลือคำเหล่านี้)

- **ลิงก์:** เก็บเฉพาะ URL สาธารณะ ตัดลิงก์ `docs.google.com` / `drive.google.com` / `googleusercontent.com` และ host ภายในออก หลักฐานที่เป็นเอกสารภายในแสดงเป็นข้อความไม่มีลิงก์ test ตรวจทุกไฟล์ใน repository ว่าไม่มีรหัสไฟล์ Drive/Sheets
- **เวลาเปิด:** แสดงเวลา ส่วนขอบเขตของเวลา (`opening_hours_scope` — บางแห่งเป็นเวลาของร้านหลัก ไม่ใช่ของทั้งสถานที่) และหมายเหตุในวงเล็บท้ายข้อความเวลา (เช่น ที่มาของเวลาหรือ “operating days not specified”) อยู่ในหลักฐานรายช่องพร้อมข้อความเต็ม
- **ตัวเลขหลักบนแผง (D18):** ร้านที่ยืนยันว่าอยู่ข้างใน · GLA หรือจำนวนชั้นที่แหล่งรายงานโดยตรง · วันหรือปีที่เปิด — ค่าประมาณเดิม (D3) ไม่ขึ้นเป็นตัวเลขหลัก ค่าที่ไม่มีไม่แสดงเป็น 0 แต่ไม่ขึ้นช่อง · พิกัดและเมื่อที่อยู่กับจุดอยู่คนละจังหวัด อยู่ในหลักฐานรายช่อง
- **ขนาด (Owner decision D3):** GLA/GFA ที่แหล่งรายงานโดยตรงแสดงพร้อมขอบเขต · ค่าประมาณเดิม (`gla_sqm_legacy`, `gfa_sqm_legacy`) แสดง **เฉพาะในแผงสถานที่** เป็น “พื้นที่เช่าราว … ตร.ม.” และเฉพาะเมื่อไม่มีค่าที่แหล่งรายงานโดยตรง วิธีคำนวณกับคำว่า “ค่าประมาณจากทะเบียนเดิม ไม่ใช่ GLA ทางการ” อยู่ในหลักฐานรายช่อง ไม่อยู่ในตัวกรอง กราฟ ตาราง ผลรวม หรืออันดับ
- **ร้านที่อยู่ข้างใน:** นับเฉพาะลิงก์ที่ชุดข้อมูลร้านค้าของ CityMETER ยืนยันแล้ว แยกตามชุดข้อมูลต้นทาง candidate ไม่นับ ลิงก์ไป Luxury Brands แสดงเมื่อ CityMETER id ของสถานที่อยู่ในข้อมูลที่หน้านั้นเปิดได้
- **รหัส:** `venue_id` (join key) · Shopping Center id (`mall_external_id`) · CityMETER id (`citymeter_venue_id`) พร้อมลิงก์บันทึกใน production เมื่อมี

### 9.1 รายชื่อร้านและลำดับ — D19 (25 ต.ค. 2569)

`data/tenants/NN.json` เป็นรายชื่อแบบ lazy ใช้ FNV-1a UTF-8 ของ venue ID mod **32** คงที่ แยกจาก detail shards โหลดเมื่อเลือกสถานที่ แสดง 10 รายการแล้วดูเพิ่มไม่เกิน 10 จนครบ คงจำนวนที่ขยายเมื่อแผงวาดใหม่ ปุ่มดูเพิ่มไม่ผ่านทางเดินกล้อง โหลดผิดพลาดลองใหม่ได้ ชื่อยังอ่านได้เมื่อไม่มี/โหลดโลโก้ไม่สำเร็จ

รายชื่อเผยแพร่ 2,230 รายการใน 461 venue จาก 2,232 source observations: primary graph เดิม 1,579 (อีก 10 อยู่กับ host นอกชุด qualified ที่หน้าเว็บแสดง) + official restaurant chain ที่ตรวจ exact named host 644 + Grocery locatives ที่ตรง parent relationship เดิม 7 แยก `sourceRole` และ `relationshipBasis` ชัดเจน ไม่ใช้ spatial/name candidates ที่ยังไม่ผ่าน ไม่เขียนกลับความสัมพันธ์ต้นทางหรือเปลี่ยน core data โดยอัตโนมัติ พัก Greyhound The Crystal และ Pizza Hut/Taco Bell Pantip Chiang Mai เพราะ canonical venue ID กำกวม; Mahatun Plaza อยู่นอกชุด qualified จึงคงเป็น omitted source item

ตัวเลขและรายชื่อในแผงสถานที่ใช้ roster ล่าสุด ส่วนแผนที่ การ์ด ย่าน กราฟ และตารางคง primary-link snapshot เดิม รายชื่อเป็นการสังเกตตามแหล่ง/วันที่ ไม่ใช่ tenant census ทั้งศูนย์หรือคำยืนยันว่าทุกร้านเปิดวันนี้ `sourceUrl` เป็นหลักฐานรายรายการ (เก็บหลายลิงก์ใน `sourceUrls`); `checkedOn`/`sourceDate`/สถานะต้นทางคงแยกกัน สถานะขัดกันแสดงข้างชื่อ

คงสาขาที่ native ID/โทรศัพท์ต่างกัน เช่น MK M111/M206 ที่เดอะมอลล์งามวงศ์วาน บัตร Dairy Queen สองศูนย์ที่ยังแยกหน้าร้านไม่ได้เก็บเป็นรายการเดียวต่อ brand/host พร้อม `sourceObservations`, `sourceObservationCount` และ `identityStatus`; source observations จึงมากกว่ารายการแสดงผลสองรายการ

ลำดับ `venue-role-v1`: ร้านหลักที่มีหลักฐาน → ร้านหลักซึ่งตรงชื่อศูนย์ → บทบาทจาก positioning ทางการใน `data/tenant-profiles.json` (11 ศูนย์) → specialty/รูปแบบศูนย์ → บทบาททั่วไป โดยบทบาทเท่ากันเรียงชื่อ สาขา และ ID คงที่ Community/hoststore/market เน้นของใช้และอาหาร; สถานีบริการเน้นอาหาร เครื่องดื่มและร้านสะดวกซื้อ; ศูนย์แฟชั่นหรูหรือไอทีที่มี positioning ใช้บทบาทนั้นนำ เป็นการประเมินของ CityMETER ไม่มีคะแนนจากขนาดเครือ โลโก้ GLA เดิม ยอดขาย หรือ footfall ไม่ใช่อิทธิพลที่วัดจริง เคาน์เตอร์ในห้างไม่ถูกอ่านเป็นห้างทั้งแห่ง และหมวดผสม restaurant/cafe ใช้ “อาหารและเครื่องดื่ม” โดยไม่เดาประเภทย่อย

โลโก้ 1,609 รายการใช้ไฟล์เดิม 178 ไฟล์ จับคู่ `dataset|brandId` และตรวจ SHA-256 กับ `assets/tenant-logos-manifest.json`; ไม่มี fuzzy matching โหลดภาพ lazy เฉพาะรายการที่แสดง ใช้พื้นรองตาม asset ให้เห็นทั้งสองธีม การรวบรวมไฟล์ไม่ใช่ใบอนุญาตเครื่องหมายการค้า

สร้างซ้ำด้วย `python3 scripts/build-tenant-data.py --observations <reviewed-tenant-observations.json> --logos assets/tenant-logos-manifest.json` โดย input ที่ตรวจแล้วเก็บในงานวิจัยภายใน เผยแพร่เฉพาะ input hash และผลรวมใน `data/tenants/build-report.json` ไม่เผยแพร่รหัสไฟล์ภายใน

ตัวแทนจำหน่ายหลายแบรนด์ 8 รายการใช้ชื่อร้านจริงและไม่ใช้โลโก้ของผู้ผลิตแทนโลโก้ร้าน; สาขา mono-brand ที่มีชื่อร้าน/ผู้ดำเนินการชัดเจนคงชื่อเต็มจากต้นทางและโลโก้แบรนด์ของ boutique แยก BVLGARI boutique กับ SHH Pendulum ที่สยามพารากอนคนละยูนิตและใช้หลักฐานสาขาทางการที่ตรวจแก้แล้ว โดยไม่แก้ master ต้นทางอัตโนมัติ


## 10. รายการที่ยังไม่ผ่านนิยาม (Owner decision D4)

รายการที่ยังไม่ผ่านนิยามมีสองสถานะ: **รอตรวจ** (รอบนี้ 0 — คิวปิดครบ) และ **ยังยืนยันไม่ได้** (4,869 — `reviewed_definition_unconfirmed`; ไม่ใช่การสรุปว่าไม่ใช่สถานที่ค้าปลีก) ที่มีพิกัด 4,851 รายการ อยู่ใน `data/pending.json` แบบ columnar (`id, name, lon, lat, provinceCode, districtCode, group, state`; `state = "reviewed"` สำหรับที่ยังยืนยันไม่ได้ — รอบนี้ทุกจุด) โหลดหลังภาพแรก วาดเป็นจุดเทาเล็กด้วย GPU layer ที่ zoom ≥ 11 ไม่มีโลโก้ ไม่อยู่ใน tab order ซ่อนได้จากคำอธิบายแผนที่ (“ยังยืนยันไม่ได้ 4,851”, `?pending=0`) ค้นหาได้พร้อมป้ายสถานะและคำว่าไม่นับ และกดแล้วได้การ์ดย่อ “ยังยืนยันไม่ได้ · ไม่นับ” ไม่เข้าตัวเลข สี หรือกราฟใด ๆ ถ้าโหลดไม่ได้ ตัวเลขทั้งหมดไม่เปลี่ยน

## 11. อาคารของสถานที่

รูปทรงมาจาก geometry bundle ที่ทีมวิจัยตรวจแล้ว เชื่อมด้วย `13_BUILDING_LINKS` (`qualified_host_observation_ids`, `preferred_part_observation_ids`) เข้ากับ `venue_id` ที่ผ่านนิยาม รอบนี้ 130 รูปทรงของ 77 สถานที่ (parts 10 สถานที่ · footprint อย่างเดียว 67 สถานที่; 75 สถานที่อยู่ในชุดที่นับได้ — เซ็นทรัล พาร์ค นับแล้วรอบนี้ — ส่วนเกษรอัมรินทร์ และอาคารผู้โดยสารหลักที่ 1 เป็นพื้นที่ย่อย)

- parts ใช้ `selected_base_m` → `selected_top_m`; โครงการแม่ที่มี parts วาดเป็นเส้นขอบ
- footprint ที่มีความสูงจากโมเดลหรือ OSM ยกตามความสูงนั้น; ความสูงที่ไม่รู้ใช้แผ่นแสดงผล 3 ม. โดย `height_m` คงเป็น `null`; ความสูงที่รอตรวจ (`model_height_review`) ใช้ 3 ม. ในการแสดงผลและเก็บค่าเดิมไว้ในข้อมูล
- อาคารของสถานที่เป็นชั้นข้อมูลเดียวที่มีสีข้อมูล (LDS map role) มวลอาคารทั้งเมืองจาก OpenFreeMap/OSM เป็นบริบท ความสูงไม่ใช่ข้อเท็จจริงของชุดนี้ และการปัดมุมโค้งในพื้นที่โฟกัสเป็นการแสดงผลเท่านั้น
- **อาคารที่หมุดตั้งอยู่ (เจ้าของสั่ง 25 ต.ค. 2569: “หมุดศูนย์การค้า ทั้ง 8 ประเภท ถึงแม้ไม่ยืนยัน Operator ถ้า mapped กับ 3d building ได้ก็ต้องแสดง 3d building ทั้งหมด”):** สถานที่ที่นับได้ซึ่งไม่มีรูปทรงข้างบน แสดงอาคารจาก layer `building` ของ tile แผนที่ฐาน (OpenMapTiles z14 ของ OpenFreeMap, © OpenStreetMap contributors) ที่หมุดตั้งอยู่ข้างใน หรือห่างขอบไม่เกิน 3 ม. (ความละเอียดของ tile) คำนวณบนเครื่องผู้ใช้เมื่อแผนที่หยุดนิ่งที่ zoom ≥ 14 (`js/pin-buildings.js`) — ทำทีละรูปหลายเหลี่ยม เพราะ OpenFreeMap รวมอาคารที่สูงเท่ากันใน tile เดียวเป็น MultiPolygon ที่ใช้ id เดียว · อาคารที่มี building:parts (เส้นขอบ `hide_3d`) ใช้ parts ข้างในเส้นขอบ · รูปหลายเหลี่ยมที่ใหญ่เกิน 150,000 ตร.ม. ไม่นับเป็นอาคารของสถานที่ · ชิ้นของอาคารเดียวกันใน tile ข้างเคียงหาได้จากพื้นที่ซ้อนกันจริง (ไม่ใช่ผนังที่ติดกัน) · ไม่ใช้ชื่อ และไม่ใช้อาคารที่ใกล้ที่สุด ตลาดเปิดโล่งที่หมุดไม่อยู่ในอาคารจึงไม่มีอาคาร · วาดสีน้ำเงินเดียวกับอาคารของสถานที่ ขยายออก 0.8 ม. และยก 0.4 ม. ให้ครอบสำเนาสีเทาของแผนที่ฐาน ความสูงตาม `render_height` ของแผนที่ฐาน (อาคารที่แหล่งไม่มีความสูงใช้ค่าตั้งต้นของ schema) · แผงสถานที่บอกว่า “อาคารของสถานที่” หรือ “อาคารที่หมุดตั้งอยู่” หรือ “ยังไม่พบอาคารที่ตำแหน่งหมุด” · รูปทรงเหล่านี้ไม่ได้บันทึกเป็นไฟล์ข้อมูลของชุดนี้
- **มวลอาคารทั้งเมืองอ่านได้ทุกที่:** มวลอาคารนอกโฟกัสจางลงตามระยะ (500 → 2,200 ม.) วัดจากจุดของสถานที่ในโฟกัสและจากกลางภาพ (ขยับจุดเมื่อกลางภาพเลื่อนเกิน 300 ม. ที่ zoom ≥ 12.5) และอาคารที่ OpenFreeMap รวมเป็นชิ้นเดียววัดจากชิ้นที่ใกล้ที่สุด · หน้าสถานที่โฟกัสวงรัศมี 650 ม. รอบสถานที่ — แก้อาการที่ชานเมืองและต่างจังหวัดไม่มีอาคาร 3 มิติ (สาเหตุเดิม: จุดวัดระยะเป็นจุดยอดของเขตโฟกัสหรือ 60 แถวแรกของข้อมูล และอาคารที่ถูกรวมทั้ง tile วัดจากจุดแรกของมัน จึงจางหายทั้ง tile)
- สิทธิ์: ODbL (OpenStreetMap) เว้นแต่รูปทรงระบุอื่น · README ของ bundle ระบุว่าการที่ production ใช้ได้ไม่ได้พิสูจน์สิทธิ์เผยแพร่ต่อแบบเปิดโดยลำพัง

## 12. โลโก้สถานที่

ทะเบียน `10_VENUE_LOGOS` (113 ไฟล์ · 4 บทบาท: โลโก้ของสถานที่โดยตรง, โลโก้โครงการแม่, โลโก้ห้างสรรพสินค้าในเครือ, โลโก้เครือ) ไฟล์ถูกใช้เมื่อ SHA-256 ตรงกับชีตเท่านั้น และคัดลอกไม่แก้ไข รอบนี้ครบ 113 ไฟล์ (ทะเบียนโลโก้ไม่เปลี่ยนจากรอบก่อน) ผูกกับ 108 สถานที่ที่นับได้ ([data/venue-logos.json](data/venue-logos.json)); ถ้ารอบหน้ามีไฟล์ที่ยังไม่มาถึง จะอยู่ใน `meta.pending` และสถานที่นั้นแสดงชื่อโดยไม่มีโลโก้ พื้นรองต่อโลโก้คำนวณจากภาพ (โลโก้โปร่งใสบน `#E5E9E6`, โลโก้สีอ่อนโปร่งใสบน `#182327`, ไฟล์ทึบบน `#FFFFFF`) ค้นด้วย `venue_id` เท่านั้น ชื่อสถานที่ยังเป็นตัวตนหลัก การรวบรวมไฟล์ไม่ใช่ใบอนุญาตเครื่องหมายการค้า

## 13. สิ่งที่ตัวเลขพิสูจน์ไม่ได้

- ไม่ใช่สำมะโนศูนย์การค้าหรือสถานที่ค้าปลีกของไทย และรายการที่ยังยืนยันไม่ได้ไม่ถูกนับ
- อาคารที่หมุดตั้งอยู่เป็นรูปทรงจากแผนที่ฐานที่ตำแหน่งหมุด ไม่ได้ยืนยันว่าเป็นอาคารของสถานที่นั้นทั้งหลัง และความสูงเป็นค่าของแผนที่ฐาน
- การผ่านนิยามด้วยกฎรายประเภทของเจ้าของ (ตลาด สถานีบริการน้ำมันที่มีร้านค้า และอื่น ๆ) เป็น Owner-stated ไม่ได้เพิ่มหลักฐานผู้บริหารพื้นที่ร่วมรายเดียวของแต่ละแห่ง
- ผ่านนิยามไม่ยืนยันว่าเปิดวันนี้ สถานะมาจากแหล่ง ไม่ใช่ภาคสนาม
- จุดอ้างอิงไม่ใช่ประตูทางเข้า บางจุดเป็นจุดของร้านหลักในสถานที่ (`retailer_branch_reference_point…`)
- จำนวนสถานที่ไม่ใช่ market share, capacity, footfall, ยอดขาย, ค่าเช่า, อัตราว่าง หรือ occupancy และอันดับพื้นที่ไม่พิสูจน์ช่องว่างตลาด
- ขนาดแบบค่าประมาณเดิมไม่ใช่ GLA ทางการ (GLA ที่รายงานโดยตรงมีน้อยมากในทะเบียน)
- ลิงก์ร้านที่ยืนยันแล้วครอบคลุมเฉพาะบางสถานที่และบางชุดข้อมูล การไม่มีร้านในแผงไม่ได้แปลว่าสถานที่ไม่มีร้าน

## 14. ความต่างของหลักฐานที่รอเจ้าของตัดสิน (MBB §0.4)

1. **ค่า `historical_*_pending`:** รอบนี้ 5 แถว (`historical_managed_retail_definition_current_scope_pending` 3 · `historical_definition_current_retail_scope_pending` 2) นับเป็นหลักฐานย้อนหลังตามคำขึ้นต้น `historical_` (รอบ 24 ต.ค. ตัวเลขผ่านนิยามต่างจาก 00_README 4 แถวพอดีด้วยเหตุนี้; รอบนี้ไม่ได้ export 00_README จึงยังไม่ได้เทียบใหม่)
2. **ผ่านนิยามแต่ไม่นับแยก 51 รายการ** — นับได้ด้วย D6 6 แห่ง (เซ็นทรัล พาร์ค, วัน แบงค็อก (พื้นที่ค้าปลีก), สามย่านมิตรทาวน์, สีลมคอมเพล็กซ์, อาทาระ มอลล์ ศรีราชา, มหานคร คิวบ์) ส่วนที่ไม่มีโครงการแม่ในชุดที่ผ่านนิยามและยังไม่นับ 41 รายการ: พื้นที่ย่อย 12 (Foodland The Brio Mall Sai 4, ตลาดจริงใจ Farmers’ Market เซ็นทรัลอุดรธานี, mpark มหาราช, PARK11, อาคารผู้โดยสารหลักที่ 1, SinoPark แพรกษา, อาคารยิ่งเจริญพลาซ่า, ตลาดเสรีมาร์เก็ต เดอะไนน์ พระราม 9, กาดนั่งก้อม@หนองกระทิง, กาดอัศวิน, ตลาดรุ่งโรจน์ คลอง4, อาคารโบ๊ท อาเขต) · อาจซ้ำ 16 (เช่น ตลาดมโนรมย์ / ตลาดมโนรมย์ 4, ตลาดดวงแก้วพลาซ่า ×2, ตลาดเอซีสายไหม / ตลาดเอ.ซี.สายไหม, วิคตอรี่ ฮับ, Mayfair Avenue, เจ-พาร์ค ศรีราชา นิฮอน มูระ, ตลาดนัดเซนทริค จันทบุรี, มาร์เก็ตเพลสทองหล่อซอย15, ศูนย์การค้าพาวิลเลี่ยนไนท์บาซาร์ เชียงใหม่, พาเพลิน มาร์เก็ต, Think Park Night Market, ตลาดฟันฟรายเดย์ อเวนิว, สถานีบริการ ปตท. พระราม 2 กม.5) · การนับแยกยังรอตรวจ 12 (บิ๊กซี ฟู้ดเพลส 9 สาขาและบิ๊กซี 3 สาขาที่ผ่านกฎ “ร้านหลักที่มีกิจการอื่นอยู่ด้วย”) · บริบทหลายสถานที่ 1 (ตลาดโรงเกลือ) — รายการเต็มพร้อม `hold` ใน `meta.checks.componentsWithoutParent`
3. **วิคตอรี่ ฮับ (`SC-C3713`)** มีสถานะ `definition_supported_named_property_duplicate_count_held` แต่ `count_role = venue_site_candidate` — ถือตามสถานะว่าอาจซ้ำ (เกี่ยวกับ Victory Mall `SC-C1899`) จึงไม่นับจนกว่าทะเบียนจะตัดสิน
4. **จังหวัดในที่อยู่ต่างจากขอบเขตทางการ 510 รายการทั้งทะเบียน** (ผ่านนิยาม 37 · ยังไม่ผ่านนิยาม 473) ส่วนใหญ่อยู่ในจังหวัดที่ติดกัน (แนวกรุงเทพฯ–สมุทรปราการ–ปทุมธานี และระยอง–ชลบุรี) แต่ 4 รายการที่ผ่านนิยามมีที่อยู่กับจุดอยู่คนละจังหวัดที่ไม่ติดกัน — ตลาดบ้านหนองหล่าย (`SC-000667`, ที่อยู่กรุงเทพฯ จุดอยู่ลำปาง), ตลาดไทยพิทักษ์ สลกบาตร (`SC-002473`, กำแพงเพชร/อุตรดิตถ์), ตลาดเสริมพานิช (`SC-007425`, ปทุมธานี/ชัยนาท), ตลาดโกดังมาร์เก็ต @ มวกเหล็ก (`SC-012746`, สระบุรี/อำนาจเจริญ) — น่าจะเป็นพิกัดหรือที่อยู่ผิดในทะเบียน (Inference) รุ่นนี้นับตามจุดตามกฎเดิมและแสดงที่อยู่คู่กันในแผงสถานที่
5. **5 รายการที่ทะเบียนสรุปว่าไม่ใช่สถานที่แยก (ตรงกับชีต: ไม่เข้าเกณฑ์ 2 + บริบทศูนย์แม่/ผู้เช่า 3):** `individual_tenant_component_not_independent_venue` — PASAYA Premium Outlet Cha Am (`SC-016088`), Villa Market ชิค รีพับบลิค ราชพฤกษ์ (`SC-SM-06783`) · `owner_not_qualifying_retail_venue_scope` — โลตัส ลำลูกกา คลอง 4 (`SC-SM-04133`), โลตัส บ่อสร้าง (`SC-SM-04152`) · `parent_context_retail_child_qualified_separately` — ดุสิต เซ็นทรัล พาร์ค (`SC-C0139`) ไม่แสดงและไม่นับ
6. **ดุสิต เซ็นทรัล พาร์ค** (`SC-C0139`, `parent_context_retail_child_qualified_separately`) — รอบ 15:06 น. นับโครงการแม่แทนห้าง รอบนี้ทำตามสถานะของทะเบียน: โครงการแม่เป็นบริบท ไม่นับ และห้างข้างใน เซ็นทรัล พาร์ค (`SC-001066`, `child_venue`, ประเภท `shopping_center`) นับเป็นสถานที่ของตัวเองตาม D6 — จำนวนรวมเท่าเดิม ตัวเลขผ่านนิยามตรงกับชีต (6,135) และอาคารที่ตรวจแล้วของเซ็นทรัล พาร์ค (โพเดียม 13.6 ม. · ทาวเวอร์ 82 ม.) ขึ้นเป็นสีน้ำเงิน
7. **10 แห่งที่ผ่านนิยามมีจุดนอกขอบเขตเขต/อำเภอ** (ตลาดริมทะเลหรือริมแม่น้ำชายแดน) นับในอุปทานทั้งประเทศ แต่ไม่อยู่ในตัวเลขรายพื้นที่ใด — ไม่จับเข้าพื้นที่ใกล้ที่สุดตามกฎ
8. **ทุกแถวยังมี `release_status` แบบ hold** (ตัวตน รูปทรง สิทธิ์ และฟิลด์ที่เหลือ) — หน้านี้เป็น research demo ที่เจ้าของให้เผยแพร่ ไม่ใช่ production release
9. **ชื่อชุดข้อมูลใน Registry** (“จำนวน พื้นที่เช่า และกลุ่มตลาด”) สัญญาเรื่องพื้นที่เช่าและกลุ่มตลาดเกินข้อมูลรุ่นนี้ หน้านี้ใช้ชื่อบนหน้าจอ “ศูนย์การค้า” / “Shopping centers” (D10) และเก็บชื่อเต็มตาม D2 เป็นชื่อรองใน metadata
10. **ชื่อไทยที่ยังยืนยันไม่ได้ 1,237 รายการ และสถานะเปิดจริง/ผู้บริหารล่าสุดที่หลักฐานยังไม่พอ** แยกรอยืนยันในชีต (Owner-stated 25 ต.ค. 2569) — หน้านี้แสดงตามค่าที่มี และหลักฐานรายช่องบอกฐานของชื่อแต่ละแห่ง
11. **โลโก้ของ เซ็นทรัล พาร์ค (`SC-001066`)** ใน `10_VENUE_LOGOS` ใช้ไฟล์เดียวกับ ดุสิต เซ็นทรัล พาร์ค (`SC-C0139`, key `VL-8a8cd8d752f15540`, role `venue_specific`) คือโลโก้ “DUSIT CENTRAL PARK” ของทั้งโครงการจาก dusitcentralpark.com — เมื่อโครงการแม่เป็นบริบท (D15) โลโก้นี้จึงขึ้นบนห้าง เซ็นทรัล พาร์ค ทั้งในแผงและบนแผนที่ · ใช้ต่อ หรือเพิ่มโลโก้ของห้างเองในทะเบียน (รอเจ้าของตัดสิน)

## Additional dated MLA membership evidence — 26 October 2026

The PARC MLA crosswalk covers the project and15 competitors. Original venue/store source populations remain separate from this additional dated evidence. New venue identities are exact named project matches, never a nearest retailer or market. Current selected points win over older MLA alternatives; the newly selected Bangkok Mall point is a project-site reference, not an entrance or footprint. Dadfa’s leased-retail project supports historical definition with current operation unconfirmed. JAS has primary corporate portfolio and exact component-address evidence; approximately19,850sqm is reported leasable area, not surveyed area. PADDIO remains a future project: construction year, Zone1/2 area and floors do not become an actual opening date or whole-site GFA.

Only80 dated public membership observations pass the strict MLA gate. Each has an actual observation date, public branch/host-specific URL, source authority/hash/row identity and exact canonical host. Current operation remains unconfirmed. Of these,78 create display entries and2 corroborate exact existing outlets without raising primary or displayed shop counts. Nineteen held cases stay outside public files. Source dates, actual reading dates, carried-forward listing identities and reconciliation dates remain distinct. Native Sheets DATE columns retain the workbook’s readable full-year date display.

Logo mappings use13 exact brand/approved-alias relationships to11 original source-qualified files;9 files were already locally verified and newly copied byte-for-byte into the public library. Shared-banner and manufacturer substitutions stay held. The roster covers6 hosts with MLA membership facts and does not establish a current complete directory for all15 competitors. Source/source-qualified display grain and primary9-dataset graph grain remain separate.


## Owner-confirmed tenant follow-up - 26 October 2026

The canonical ledger now contains the owner's replies to all 19 held MLA cases and one distinct replacement concept. The latest native source and review cells were re-read before deriving this release. Owner assertions are dated 26 October 2026 and retain their own authority; they are not new website checks or field observations. Only the scope actually confirmed is promoted: names/aliases and host membership do not by themselves establish current operation.

71 Mookata, ANGPANG and the old Dadfa Ohkajhu are closed according to the owner and excluded from the current roster. LOPIA is not open, planned for February 2027 (month only) and remains explicitly hidden with no automatic release. Grill & Ground by Ohkajhu is a separate owner-confirmed new concept at Dadfa; no exact opening day, legal operator, category or logo is inferred. Gravity coffee remains reviewed-unconfirmed and excluded. Moon/Monn is one identity; MitPlaJum corroborates its existing Lasalle outlet; The Fitness host correction does not assert a relocation or a current opening. Historical observations remain in the private ledger.

The public roster preserves original source-qualified entries and their dates. Dated memberships and owner confirmations remain partial coverage, not a current census. The original nine-dataset graph and all primary venue/map/area totals are unchanged.

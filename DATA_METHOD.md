# วิธีจัดทำข้อมูล — ศูนย์การค้าและสถานที่ค้าปลีก

เอกสารนี้อธิบายว่าเว็บนับอะไร นับอย่างไร และอะไรที่ตัวเลขพิสูจน์ไม่ได้ ใช้คู่กับ [Product Statement](PRODUCT_STATEMENT.md) (รุ่น 0.3) โค้ดที่ทำตามกติกาเหล่านี้คือ `scripts/build-data.py` (สร้างข้อมูล) และ `js/model.js`, `js/areas.js`, `js/area-insight.js`, `js/scales.js` (อ่านและคำนวณบนหน้าเว็บ) ค่าที่ใช้จริงของแต่ละรอบบันทึกใน `meta` ของ [data/venues.json](data/venues.json) และ [data/build-report.json](data/build-report.json)

ป้ายหลักฐานตาม Landometer Master Brand Brief v0.5.3 §3.7: **Observed fact** (จากแหล่งใน scope ของแหล่งนั้น) · **Owner-stated** · **Inference** (การตีความของผู้จัดทำ) · **Hypothesis**

## 1. แหล่งข้อมูลและหน่วย

| แหล่ง | ใช้ทำอะไร | ตัวตนของรอบนี้ |
|---|---|---|
| CityMETER Shopping Centers & Retail Venues — Research Master แท็บ `01_VENUES` | ทะเบียนสถานที่ หลักฐานรายช่อง การผ่านนิยาม สถานะ พิกัด | export 25 ต.ค. 2569 · SHA-256 `f958df66…` ใน `meta.inputs` (internal working reference) |
| แท็บ `09_RELATIONSHIPS` | ชื่อเรียกอื่น (alias) และความสัมพันธ์โครงการแม่–พื้นที่ย่อย | SHA-256 ใน `meta.inputs` |
| แท็บ `10_VENUE_LOGOS` | ทะเบียนโลโก้ (ไฟล์ บทบาท SHA-256) | ไฟล์ใช้ได้เมื่อ SHA-256 ตรงเท่านั้น |
| แท็บ `13_BUILDING_LINKS` + geometry bundle `CityMETER-retail-venue-host-geometry-2026-10-23` | รูปทรงอาคารของสถานที่ที่ผ่านเกณฑ์ | `selected-host-geometry.geojson` SHA-256 `9c948f99…` |
| OpenGISData-Thailand `districts.geojson` (อ้างอิงกรมการปกครอง, CC BY 4.0) | ขอบเขตเขต/อำเภอ 928 รายการ และจังหวัดที่ dissolve จากเขต | commit `fafcea1` · SHA-256 `329315c2…` |
| CityMETER production `base/info/lv0` และ `base/info/lv1/{provinceId}` | รหัสจังหวัด (`abbrEn` เช่น `BKK`) และรหัสเขต 4 หลักที่ breadcrumb ใช้ | 77 จังหวัด · 928 เขต/อำเภอ |
| CityMETER: Luxury Brands `data/luxury.json` | ลิงก์จากสถานที่ไปหน้า Luxury Brands (`?place=`) เมื่อเปิดสถานที่เดียวกันได้ | 39 สถานที่ |

**Grain:** หนึ่งแถว = หนึ่งสถานที่ (site) โดยโครงการแม่ (parent complex) และพื้นที่ค้าปลีกย่อย (retail component) เป็นคนละแถวที่เชื่อมกันด้วย `parent_venue_id` · join key คือ `venue_id` เท่านั้น ชื่อใช้ค้นหาอย่างเดียว

## 2. นิยามและการนับ

นิยาม retail venue ของเจ้าของ (Owner-stated, 23 ต.ค. 2569): สถานที่ที่มี **หลายกิจการขายผู้บริโภค** และมี **ผู้ดำเนินการรายเดียวบริหารพื้นที่ร่วม** การผ่านนิยามมาจาก `venue_qualification_status` ที่ทีมวิจัยบันทึกพร้อมหลักฐาน หน้าเว็บไม่ตัดสินนิยามเอง

| ระดับ | กติกา (ฟิลด์ใน 01_VENUES) | รอบนี้ |
|---|---|---:|
| ทะเบียน | ทุกแถว | 10,988 |
| **ผ่านนิยาม** (`tier`) | `definition_supported*` / `qualified_*` / `parent_context_retail_child_qualified_separately` = หลักฐานปัจจุบัน · `historical_*` และ `definition_supported_historically_*` = หลักฐานย้อนหลัง · `planned_*` = โครงการอนาคต | 565 (506 · 55 · 4) |
| **นับได้** (`countable`) | ผ่านนิยาม และ `count_role` ไม่ใช่ `child_zone`, `child_venue`, `component_within_managed_site`, `retail_component_within_managed_site`, `retail_subarea_do_not_count_as_separate_parent_mall`, `duplicate_candidate_hold` · **ยกเว้น (D6):** พื้นที่ย่อยที่ไม่มีโครงการแม่ในชุดที่ผ่านนิยาม นับเป็นสถานที่ของตัวเองเมื่อเป็นศูนย์การค้าหรือมอลล์ (กลุ่มจากหลักฐานเป็นศูนย์การค้าหรือคอมมูนิตี้มอลล์ หรือเจ้าของระบุ) และไม่ใช่รายการที่อาจซ้ำ | 545 (รวม D6 5 แห่ง) |
| **อุปทาน** (`status = supply`) | นับได้ และ `operation_group` ไม่ใช่ `future_project` (→ โครงการที่กำลังมา) หรือ `closed_source_evidence` (→ ปิดตามหลักฐาน) | 541 · กำลังมา 3 · ปิด 1 |
| **ระบุตำแหน่งได้** (`located`) | พิกัดอยู่ในประเทศ และ `coordinate_status` / `coordinate_role` เป็นจุดอ้างอิงที่เลือกแล้ว (ไม่ใช่ `held_*`, `withheld_*`, `not_collected*`, `not_selected*`, `*not_revalidated*`, role `held_*` / `not_selected*` / `no_*`) | 488 จาก 541 |
| **รอตรวจนิยาม** | `pending_*`, `definition_pending*` และค่าที่ลงท้าย `_pending` ที่ไม่อยู่ในกลุ่มข้างบน | 10,421 |
| **ทะเบียนสรุปว่าไม่ใช่สถานที่แยก** | ค่าที่ขึ้นต้น `excluded` `rejected` `disqualified` `not_` `non_` `out_of_scope` `definition_not_` `definition_failed` `fails_` `does_not_` หรือมีคำ `not_independent_venue` `not_retail_venue` `not_a_retail` `not_qualified` `not_eligible` | 2 |

- ตัวเลขทุกตัวบนหน้าเว็บ (ตัวนับ แผนที่ กราฟ ตาราง ข้อค้นพบแรก) นับจาก **อุปทานที่นับได้** ตามตัวกรอง; สถานะ “โครงการที่กำลังมา” และ “ปิดตามหลักฐาน” เลือกดูได้จากตัวกรองสถานะและไม่รวมกับอุปทาน
- พื้นที่ย่อยไม่บวกกับโครงการแม่: แสดงในแผงของโครงการแม่ (“พื้นที่ค้าปลีกในโครงการนี้ — ไม่นับแยก”) และเปิดดูหลักฐานได้
- **Owner decision D6 (25 ต.ค. 2569):** พื้นที่ย่อยที่ผ่านนิยามแต่โครงการแม่ไม่อยู่ในชุดที่ผ่านนิยาม จะถูกนับที่ระดับของตัวเองเมื่อเป็นศูนย์การค้าหรือมอลล์ — รอบนี้ 5 แห่ง: วัน แบงค็อก (พื้นที่ค้าปลีก), สามย่านมิตรทาวน์, สีลมคอมเพล็กซ์ (สามแห่งนี้เจ้าของระบุว่าเป็นศูนย์การค้า; วัน แบงค็อก และสีลมคอมเพล็กซ์มีประเภทจากหลักฐานเป็น `retail_zone` จึงแสดงในกลุ่มศูนย์การค้าด้วยฐาน “เจ้าของระบุ”), อาทาระ มอลล์ ศรีราชา และมหานคร คิวบ์ (ประเภทจากหลักฐานเป็นคอมมูนิตี้มอลล์/ศูนย์การค้า) · แผงสถานที่บอกว่า “นับเป็นสถานที่ · โครงการแม่ยังไม่อยู่ในชุดที่ผ่านนิยาม” · ถ้าทะเบียนเพิ่มโครงการแม่ที่ผ่านนิยามในภายหลัง ระบบจะนับที่โครงการแม่แทนโดยอัตโนมัติ จำนวนรวมไม่ซ้ำ
- สถานที่ที่ยังไม่มีพิกัดที่ผ่านเกณฑ์อยู่ในตารางและผลค้นหาพร้อมป้าย “ยังไม่มีพิกัด” ไม่ถูกวางบนแผนที่ และไม่เข้าตัวเลขรายพื้นที่ แผงจังหวัดบอกจำนวนที่เหลือตามจังหวัดในที่อยู่ (“อีก k แห่ง…ยังไม่มีพิกัดที่ผ่านเกณฑ์”) และตัวกรองจังหวัดใช้จังหวัดในที่อยู่เฉพาะแถวที่ไม่มีจุด
- ค่าที่ไม่มีคือไม่มี: ไม่แสดง 0 แทนค่าว่าง แผงแสดง “ยังไม่มีข้อมูล”
- **คำใหม่ของทะเบียน:** ค่า `venue_qualification_status` ที่ไม่ตรงกฎใดถือเป็นรอตรวจ (ไม่นับ) และถูกรายงานใน `meta.checks.qualificationFallback`; test `every qualification status was read by a reviewed rule` ไม่ผ่านจนกว่าจะจัดเข้ากฎ เพื่อไม่ให้รอบอัปเดตนับหรือซ่อนรายการโดยไม่มีคนตรวจ

## 3. กลุ่มประเภทบนหน้าจอ (Inference — ใช้นำทาง ไม่ใช่การจัดประเภทใหม่)

กลุ่มมาจาก `venue_type` ที่มีหลักฐานก่อน (`groupBasis = evidence`); ถ้าค่านั้นยังไม่อยู่ในตาราง ใช้คำในชื่อประเภทตามลำดับ (`evidence-keyword`); ใช้ `legacy_venue_type` เฉพาะเมื่อ `venue_type` เป็น `unclassified` (`legacy` — แผงสถานที่ติดป้าย “ประเภทตามแหล่งเดิม”); `owner` เฉพาะสถานที่ที่เจ้าของระบุว่าเป็นศูนย์การค้าตาม D6 ค่าต้นทางแสดงในแผงสถานที่เสมอ รอบนี้สถานที่ที่นับได้จัดจากหลักฐาน 539 แห่ง จากประเภทเดิม 4 แห่ง และจากเจ้าของระบุ 2 แห่ง ไม่มีประเภทที่ผ่านนิยามซึ่งต้องใช้ keyword

| กลุ่ม | สี / รูปทรง | อุปทาน (ระบุตำแหน่งได้) |
|---|---|---:|
| ศูนย์การค้า (`mall`) | series 1 coral · วงกลม | 243 (228) |
| คอมมูนิตี้มอลล์ (`community`) | series 7 teal · หกเหลี่ยม | 123 (98) |
| ตลาด (`market`) | series 4 lime · ข้าวหลามตัด | 64 (64) |
| ไฮเปอร์มาร์เก็ตและซูเปอร์มาร์เก็ตที่มีร้านเช่า (`hoststore`) | series 5 mint · กากบาท | 3 (3) |
| พื้นที่ค้าปลีกในโครงการ (`component`) | series 6 sky · ดาว | 70 (60) |
| เอาท์เล็ต (`outlet`) | series 8 blue · วงแหวน | 13 (13) |
| จุดพักรถและสถานีบริการ (`fuel`) | series 10 green · บวก | 21 (19) |
| อื่น ๆ (`other`) | series 9 slate · ขีด | 4 (3) |

สีจาก `landometer-series-10-v8` ของ LDS 0.9.7 ใน `assets/theme.css` (ไม่มีม่วงหรือน้ำตาล; เว้น series 2–3 ที่เป็นส้ม/ทองซึ่งชนกับสเกลความหนาแน่น) รูปทรงกำกับทุกหมุดและทุกคำอธิบาย สีจึงไม่ใช่ทางเดียวที่บอกประเภท กลุ่ม `hoststore` แยกออกมาเพราะรายการรอตรวจจำนวนมากเป็นไฮเปอร์มาร์เก็ต/ซูเปอร์มาร์เก็ตที่มีร้านเช่า และจะเข้ามาเมื่อผ่านนิยาม

**ตารางจับคู่ `venue_type` → กลุ่ม** (ตัวเต็มใน `meta.groupMapping.evidence`)

| กลุ่ม | `venue_type` (หลักฐาน) | `legacy_venue_type` |
|---|---|---|
| ศูนย์การค้า | `shopping_center`, `shopping_center_building`, `shopping_center_under_construction`, `retail_complex`, `managed_retail_center`, `lifestyle_center`, `power_center`, `entertainment_anchored_mall`, `specialty_shopping_center`, `specialty_retail_center`, `specialty_retail_and_consumer_services_center`, `department_store_or_retail_complex`, `fashion_retail_and_wholesale_center`, `former_fashion_retail_and_wholesale_center`, `shopping_office_retail_building`, `mixed_use_retail_venue`, `mixed_use_retail_host`, `mixed_use_parent_with_retail_component` | `mega_mall`, `traditional_regional_mall`, `entertainment_anchored_mall`, `mixed_use_super_regional` |
| คอมมูนิตี้มอลล์ | `community_shopping_center`, `community_shopping_center_candidate`, `community_shopping_center_opening_unconfirmed`, `community_mall`, `community_retail_center`, `community_food_and_retail_mall`, `community_retail_and_sports_complex`, `convenience_retail_center`, `retail_and_service_complex`, `retail_and_dining_complex`, `retail_service_plaza`, `specialty_retail_and_cultural_center` | `avenue`, `boutique_retail`, `convenience_strip`, `home_improvement_center` |
| ตลาด | `retail_market`, `fresh_market`, `market_unspecified`, `periodic_market`, `periodic_walking_street_market`, `licensed_type_1_market`, `floating_market`, `street_market`, `night_market`, `community_market`, `roadside_fresh_market`, `wholesale_produce_market`, `mixed_wholesale_retail_market`, `creative_market_and_retail_space`, `fresh_market_and_community_retail_center`, `community_mall_and_managed_market_complex`, `community_market_and_retail_complex`, `retail_bazaar_candidate` | `wet_market_covered`, `night_market`, `wholesale_agricultural_market`, `walking_street` |
| ไฮเปอร์/ซูเปอร์มาร์เก็ตที่มีร้านเช่า | `supermarket_store_or_host_component`, `hypermarket_store_or_host_component`, `wholesale_store`, `wholesale_store_or_host_component`, `specialty_retail_store_or_host_component`, `factory_outlet_retail_store`, `retail_store` | `supermarket_anchored`, `hypermarket_anchored`, `wholesale_club` |
| พื้นที่ค้าปลีกในโครงการ | `managed_retail_component`, `managed_retail_component_candidate`, `retail_zone`, `mixed_use_retail_component`, `office_retail_podium`, `residential_retail_podium`, `resort_retail_component`, `hospital_retail_component`, `duty_free_retail_component`, `transport_terminal_retail_component`, `transport_terminal_retail_scope` | `terminal_duty_free` |
| เอาท์เล็ต | `outlet_shopping_center`, `outlet_center` | `premium_outlet_village`, `standard_outlet` |
| จุดพักรถและสถานีบริการ | `fuel_station_retail_scope_unconfirmed`, `multi_tenant_travel_retail_stop`, `highway_retail_rest_stop` | `gas_station_retail` |
| อื่น ๆ | `managed_retail_entertainment_precinct`, `retail_precinct`, `heritage_retail_destination_under_redevelopment`, `retail_food_and_wholesale_mixed_destination` | — |

**กฎคำสำหรับประเภทใหม่** (ลำดับแรกที่ตรงชนะ, `meta.groupMapping.keywords`): `fuel` / `rest_stop` / `travel_retail` → จุดพักรถ · `store_or_host_component` / `retailer_multibusiness` / `store_multibusiness` / `factory_outlet` / `single_retail` / `showroom` / `retail_store` / `supermarket` / `hypermarket` / `grocery` / `wholesale_store` → ไฮเปอร์/ซูเปอร์มาร์เก็ต · `component` / `podium` → ในโครงการ · `market` / `bazaar` → ตลาด · `outlet_center` / `outlet_shopping` / `outlet_village` → เอาท์เล็ต · `community` / `retail_and_dining` / `retail_and_service` → คอมมูนิตี้มอลล์ · `shopping_center` / `shopping_mall` / `department_store` / `plaza` / `mall` → ศูนย์การค้า · ไม่ตรงคำใด → อื่น ๆ

## 4. ผู้บริหาร (Inference)

`operator_name` เป็นข้อความอิสระ จึงจัดกลุ่มด้วยตารางชื่อที่ประกาศไว้: หาชื่อบริษัทในตารางที่ปรากฏ **ก่อนสุด** ในข้อความ (รวมสะกดไทย/อังกฤษของบริษัทเดียวกัน) ไม่พบในตาราง → กลุ่ม “อื่น ๆ” โดยคงชื่อที่ตัดคำอธิบายในวงเล็บออกแล้ว · ว่าง → “ยังไม่มีข้อมูล” · ข้อความดิบแสดงในแผงสถานที่เสมอ กราฟผู้บริหารเรียกว่า **สัดส่วนจำนวนสถานที่** ไม่ใช่ market share (LDS Location Profile `li.market_share`) และไม่ได้ถ่วงด้วยขนาด

| กลุ่ม | คำที่ใช้จับ | อุปทาน |
|---|---|---:|
| CP Axtra (Lotus’s) | CP Axtra · ซีพี แอ็กซ์ตร้า · Lotus’s | 77 |
| Central Pattana | Central Pattana · เซ็นทรัลพัฒนา · Siam Future Development · SF Development | 54 |
| Central Retail | Central Retail · (CRP) · สรรพสินค้าเซ็นทรัล | 32 |
| Home Product Center | Home Product Center · โฮม โปรดักส์ เซ็นเตอร์ | 22 |
| ปตท. บริหารธุรกิจค้าปลีก | ปตท.บริหารธุรกิจค้าปลีก · PTT Retail | 19 |
| Index Living Mall | Index Living Mall · อินเด็กซ์ ลิฟวิ่งมอลล์ · The Walk Company | 18 |
| เทศบาลและ อปท. | เทศบาล · องค์การบริหารส่วนตำบล · อบต. | 13 |
| Asset World (AWC) | Asset World · AWC | 11 |
| ALLY | ALLY CPM · ALLY REIT | 11 |
| OLM / Pena House | OLM PROPERTY · Outlet Mall Company · Pena House | 10 |
| Big C | Big C · บิ๊กซี | 10 |
| The Mall Group | The Mall Group · เดอะมอลล์ | 9 |
| Siam Piwat · Major Cineplex · Chic Republic · JAS Asset · MBK · Minor | ชื่อไทย/อังกฤษของแต่ละบริษัท | 6 · 6 · 6 · 5 · 4 · 3 |
| อื่น ๆ (ชื่อของตัวเอง) | — | 153 |
| ยังไม่มีข้อมูล | — | 72 |

## 5. พื้นที่

- **สมาชิกภาพ:** point-in-polygon ของจุดอ้างอิงที่เลือกแล้ว กับขอบเขตเขต/อำเภอความละเอียดเต็ม (shapely `covers`; จุดบนเส้นแบ่งใช้รหัสที่น้อยกว่า) คำนวณครั้งเดียวใน pipeline แล้วบันทึก `provinceCode` / `districtCode` ต่อแถว ไม่ใช้ชื่อหรือที่อยู่จัดเข้าพื้นที่ และไม่จับเข้าพื้นที่ใกล้ที่สุด จุดที่อยู่นอกขอบเขตทุกเขตไม่มีพื้นที่ (รอบนี้มีเฉพาะในรายการรอตรวจ 11 จุด)
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

รอบนี้: ปทุมวัน 2.75 · บางรัก 1.76 · ราชเทวี 0.98 แห่ง/ตร.กม. → **36 จาก 185 แห่งของกรุงเทพฯ (19.5%) บนพื้นที่ 19.17 จาก 1,566.58 ตร.กม. (1.2%)** (ก่อน D6: 32 จาก 181) เป็นคำอธิบายการกระจุกตัวของสถานที่ที่ผ่านนิยามในชุดนี้ ไม่ใช่คำตัดสินศักยภาพ ช่องว่างตลาด หรือ “ทำเลทอง”

## 7. สเกลสีของพื้นที่ (LDS 0.9.7)

| ระดับ | ค่า | สเกล | Classes |
|---|---|---|---|
| เขต/อำเภอ (ในจังหวัดที่อ่าน) | แห่ง/ตร.กม. | `density.area` LUT 41 ค่า (`scaleVersion 554812a7…`) | quantile ของค่าที่มากกว่า 0 ในการอ่านนั้น · ขอบปัดเป็นเลขนัยสำคัญ 2 หลัก ชั้นบนสุดเปิด (“> x”) |
| จังหวัด (ทั้งประเทศ, zoom < 9) | จำนวนสถานที่ที่ระบุตำแหน่งได้ | `count` LUT 41 ค่า (`scaleVersion 4ff5c1fb…`) | quantile แบบจำนวนเต็ม |
| ช่องตารางพื้นที่ × ประเภท | จำนวนสถานที่ | `count` | quantile แบบจำนวนเต็ม · ตัวเลขบนช่องผ่าน contrast 4.5:1 ทุกระดับของ table 3 และ 5 |

สีมาจาก class table ของ LDS เท่านั้น: table 5 ระดับ (LUT index 0/10/20/30/40) เมื่อค่าแบ่ง quantile ได้ 5 ระดับ ไม่เช่นนั้น table 3 ระดับ (0/20/40) · ถ้าค่ามีเพียง 1–2 ระดับ ระดับต่ำสุดใช้ตำแหน่งแรกและสูงสุดใช้ตำแหน่งสุดท้ายของ table 3 ระดับ ตำแหน่งที่ไม่มีค่าไม่ถูกวาด (ไม่มีชุด 2 หรือ 4 สี และไม่มีการผสมสี)

- ขอบของ classes แสดงในคำอธิบายแผนที่ทุกครั้ง และคำนวณใหม่ตามตัวกรอง จึงเทียบสีข้ามตัวกรองไม่ได้ — เทียบด้วยตัวเลขในกราฟอันดับหรือตาราง
- สถานะข้อมูลตาม EVID-05: **ศูนย์ที่วัดได้** (เขตในจังหวัดที่ไม่มีสถานที่) ใช้สีต่ำสุดพร้อมเส้นขอบศูนย์ · **ไม่มีข้อมูล** ไม่ระบาย · **นอกขอบเขตการอ่าน** ไม่ระบาย เหลือเส้นขอบบาง
- HEX เดียวกันทั้งธีมสว่างและมืด ไม่มีสูตร dark ไม่ปรับความโปร่งใสของสีข้อมูล ป้ายชื่อพื้นที่เป็นชิปหมึกที่มีพื้นรองของตัวเอง ตัวเลขจึงไม่วางบนสีส้มเข้มที่หมึกทั้งสองแบบไม่ถึง 4.5:1
- เมื่อซูมเกิน 14.5 สีพื้นที่ถอยเป็นเส้นขอบ เพื่อให้หมุดและอาคารอ่านได้

## 8. สถานะ

| `operation_group` | บนหน้าจอ |
|---|---|
| `operating_source_evidence`, `official_listing_not_field_verified` | มีหลักฐานว่าเปิด |
| `partially_operating` | ทยอยเปิด |
| `needs_review`, `operation_conflict`, `recent_source_evidence_current_operation_separate`, ว่าง | รอยืนยันสถานะ |
| `future_project` | โครงการที่กำลังมา (หมุดเส้นประ) |
| `closed_source_evidence` | ปิดตามหลักฐาน (หมุดกลวง) |

สถานะมาจากแหล่งที่อ้างไว้ ไม่ใช่การตรวจภาคสนาม “ผ่านนิยาม” จึงไม่เท่ากับ “ยืนยันว่าเปิดวันนี้”

## 9. รายละเอียดสถานที่และหลักฐานรายช่อง

แผงสถานที่โหลดรายละเอียดจาก `data/details/NN.json` (NN = FNV-1a 32-bit ของ `venue_id` แบบ UTF-8 mod จำนวน shard; อย่างน้อย 32 shard และเพิ่มเป็นสองเท่าเมื่อเฉลี่ยเกิน 40 สถานที่ต่อ shard) แต่ละช่องมีฐานของค่า ลิงก์แหล่งสาธารณะ และวันที่ตรวจเมื่อมี

- **ลิงก์:** เก็บเฉพาะ URL สาธารณะ ตัดลิงก์ `docs.google.com` / `drive.google.com` / `googleusercontent.com` และ host ภายในออก หลักฐานที่เป็นเอกสารภายในแสดงเป็นข้อความไม่มีลิงก์ test ตรวจทุกไฟล์ใน repository ว่าไม่มีรหัสไฟล์ Drive/Sheets
- **เวลาเปิด:** แสดงพร้อมขอบเขตของเวลา (`opening_hours_scope`) เพราะบางแห่งเป็นเวลาของร้านหลัก ไม่ใช่ของทั้งสถานที่
- **ขนาด (Owner decision D3):** GLA/GFA ที่แหล่งรายงานโดยตรงแสดงพร้อมขอบเขต · ค่าประมาณเดิม (`gla_sqm_legacy`, `gfa_sqm_legacy`) แสดง **เฉพาะในแผงสถานที่** พร้อมวิธีคำนวณและคำว่า “ค่าประมาณจากทะเบียนเดิม ไม่ใช่ GLA ทางการ” ไม่อยู่ในตัวกรอง กราฟ ตาราง ผลรวม หรืออันดับ
- **ร้านที่อยู่ข้างใน:** นับเฉพาะลิงก์ที่ชุดข้อมูลร้านค้าของ CityMETER ยืนยันแล้ว แยกตามชุดข้อมูลต้นทาง candidate ไม่นับ ลิงก์ไป Luxury Brands แสดงเมื่อ CityMETER id ของสถานที่อยู่ในข้อมูลที่หน้านั้นเปิดได้
- **รหัส:** `venue_id` (join key) · Shopping Center id (`mall_external_id`) · CityMETER id (`citymeter_venue_id`) พร้อมลิงก์บันทึกใน production เมื่อมี

## 10. รายการรอตรวจนิยาม (Owner decision D4)

รายการรอตรวจที่ระบุตำแหน่งได้ (10,401 จาก 10,421) อยู่ใน `data/pending.json` แบบ columnar (`id, name, lon, lat, provinceCode, districtCode, group`) โหลดหลังภาพแรก วาดเป็นจุดเทาเล็กด้วย GPU layer ที่ zoom ≥ 11 ไม่มีโลโก้ ไม่อยู่ใน tab order ซ่อนได้จากคำอธิบายแผนที่ (`?pending=0`) ค้นหาได้พร้อมป้าย “รอตรวจนิยาม — ไม่นับ” และกดแล้วได้การ์ดย่อ ไม่เข้าตัวเลข สี หรือกราฟใด ๆ ถ้าโหลดไม่ได้ ตัวเลขทั้งหมดไม่เปลี่ยน

## 11. อาคารของสถานที่

รูปทรงมาจาก geometry bundle ที่ทีมวิจัยตรวจแล้ว เชื่อมด้วย `13_BUILDING_LINKS` (`qualified_host_observation_ids`, `preferred_part_observation_ids`) เข้ากับ `venue_id` ที่ผ่านนิยาม รอบนี้ 127 รูปทรงของ 74 สถานที่ (parts 10 สถานที่ · footprint อย่างเดียว 64 สถานที่; 71 สถานที่อยู่ในชุดที่นับได้)

- parts ใช้ `selected_base_m` → `selected_top_m`; โครงการแม่ที่มี parts วาดเป็นเส้นขอบ
- footprint ที่มีความสูงจากโมเดลหรือ OSM ยกตามความสูงนั้น; ความสูงที่ไม่รู้ใช้แผ่นแสดงผล 3 ม. โดย `height_m` คงเป็น `null`; ความสูงที่รอตรวจ (`model_height_review`) ใช้ 3 ม. ในการแสดงผลและเก็บค่าเดิมไว้ในข้อมูล
- อาคารของสถานที่เป็นชั้นข้อมูลเดียวที่มีสีข้อมูล (LDS map role) มวลอาคารทั้งเมืองจาก OpenFreeMap/OSM เป็นบริบท ความสูงไม่ใช่ข้อเท็จจริงของชุดนี้ และการปัดมุมโค้งในพื้นที่โฟกัสเป็นการแสดงผลเท่านั้น
- สิทธิ์: ODbL (OpenStreetMap) เว้นแต่รูปทรงระบุอื่น · README ของ bundle ระบุว่าการที่ production ใช้ได้ไม่ได้พิสูจน์สิทธิ์เผยแพร่ต่อแบบเปิดโดยลำพัง

## 12. โลโก้สถานที่

ทะเบียน `10_VENUE_LOGOS` (113 ไฟล์ · 4 บทบาท: โลโก้ของสถานที่โดยตรง, โลโก้โครงการแม่, โลโก้ห้างสรรพสินค้าในเครือ, โลโก้เครือ) ไฟล์ถูกใช้เมื่อ SHA-256 ตรงกับชีตเท่านั้น และคัดลอกไม่แก้ไข รอบนี้ 95 จาก 113 ไฟล์ ที่เหลืออยู่ใน `meta.pending` ของ [data/venue-logos.json](data/venue-logos.json) และสถานที่นั้นแสดงชื่อโดยไม่มีโลโก้ พื้นรองต่อโลโก้คำนวณจากภาพ (โลโก้โปร่งใสบน `#E5E9E6`, โลโก้สีอ่อนโปร่งใสบน `#182327`, ไฟล์ทึบบน `#FFFFFF`) ค้นด้วย `venue_id` เท่านั้น ชื่อสถานที่ยังเป็นตัวตนหลัก การรวบรวมไฟล์ไม่ใช่ใบอนุญาตเครื่องหมายการค้า

## 13. สิ่งที่ตัวเลขพิสูจน์ไม่ได้

- ไม่ใช่สำมะโนศูนย์การค้าหรือสถานที่ค้าปลีกของไทย และรายการรอตรวจยังไม่ผ่านการตัดสิน
- ผ่านนิยามไม่ยืนยันว่าเปิดวันนี้ สถานะมาจากแหล่ง ไม่ใช่ภาคสนาม
- จุดอ้างอิงไม่ใช่ประตูทางเข้า บางจุดเป็นจุดของร้านหลักในสถานที่ (`retailer_branch_reference_point…`)
- จำนวนสถานที่ไม่ใช่ market share, capacity, footfall, ยอดขาย, ค่าเช่า, อัตราว่าง หรือ occupancy และอันดับพื้นที่ไม่พิสูจน์ช่องว่างตลาด
- ขนาดแบบค่าประมาณเดิมไม่ใช่ GLA ทางการ (GLA ที่รายงานโดยตรงมีน้อยมากในทะเบียน)
- ลิงก์ร้านที่ยืนยันแล้วครอบคลุมเฉพาะบางสถานที่และบางชุดข้อมูล การไม่มีร้านในแผงไม่ได้แปลว่าสถานที่ไม่มีร้าน

## 14. ความต่างของหลักฐานที่รอเจ้าของตัดสิน (MBB §0.4)

1. **ผ่านนิยาม 565 vs 561 ใน 00_README:** ต่างกัน 4 แถวพอดีกับค่า `historical_*_current_*_pending` — เจ้าคุณปาร์ค (`SC-001653`), เดอะ ล้ง 1919 (`SC-C0295`), พาร์คเลน (`SC-001730`), ตลาดสดเทศบาลตำบลศรีพนมมาศ (`SC-C2790`) รุ่นนี้นับเป็นหลักฐานย้อนหลังตามคำขึ้นต้น `historical_` (Inference: README น่าจะไม่นับกลุ่มนี้)
2. **พื้นที่ย่อยที่ไม่มีโครงการแม่ที่ผ่านนิยาม 18 รายการ** — เจ้าของตัดสิน D6 (25 ต.ค. 2569) ให้นับ 5 แห่งที่เป็นศูนย์การค้า/มอลล์ (วัน แบงค็อก (พื้นที่ค้าปลีก), สามย่านมิตรทาวน์, สีลมคอมเพล็กซ์, อาทาระ มอลล์ ศรีราชา, มหานคร คิวบ์) ส่วนอีก 13 รายการยังไม่นับจนกว่าทะเบียนจะผูกโครงการแม่หรือเปลี่ยน `count_role`: mpark มหาราช, PARK11, อาคารผู้โดยสารหลักที่ 1, SinoPark แพรกษา, อาคารยิ่งเจริญพลาซ่า, ตลาดเสรีมาร์เก็ต เดอะไนน์ พระราม 9, ตลาดรุ่งโรจน์ คลอง4, อาคารโบ๊ท อาเขต, กาดนั่งก้อม@หนองกระทิง, กาดอัศวิน และรายการที่อาจซ้ำ 3 รายการ (ตลาดนัดเซนทริค จันทบุรี, มาร์เก็ตเพลสทองหล่อซอย15, ศูนย์การค้าพาวิลเลี่ยนไนท์บาซาร์ เชียงใหม่) — รายการเต็มพร้อมสถานะ `counted` ใน `meta.checks.componentsWithoutParent`
3. **จังหวัดในที่อยู่ต่างจากขอบเขตทางการ 510 รายการทั้งทะเบียน** (ผ่านนิยาม 7 · รอตรวจ 503) ส่วนใหญ่อยู่ตามแนวกรุงเทพฯ–สมุทรปราการ–ปทุมธานี รุ่นนี้นับตามขอบเขตและแสดงที่อยู่เดิมคู่กันในแผงสถานที่
4. **2 รายการที่ทะเบียนสรุปว่าไม่ใช่สถานที่แยก** (`individual_tenant_component_not_independent_venue`: พรีเมี่ยมเอาท์เล็ท ชะอำ `SC-016088`, Villa Market ชิค รีพับบลิค ราชพฤกษ์ `SC-SM-06783`) ถูกนำออกจากจุดรอตรวจ — รายการรอตรวจจึงเป็น 10,421 (เดิมรายงาน 10,423)
5. **ดุสิต เซ็นทรัล พาร์ค** (`SC-C0139`, `parent_context_retail_child_qualified_separately`) ถูกนับเป็นสถานที่ ส่วนเซ็นทรัล พาร์ค (`SC-001066`, `child_venue`) ไม่นับแยก ตาม `count_role` ของทะเบียนและ `09_RELATIONSHIPS` (“Do not sum parent + child”) — จำนวนรวมถูก แต่แถวที่ถูกนับคือโครงการแม่ (กลุ่มศูนย์การค้าตาม `mixed_use_parent_with_retail_component`)
6. **รูปทรงอาคาร 77 สถานที่ใน bundle** แต่ 3 สถานที่ยังรอตรวจนิยาม (โลตัส หนองบัวลำภู, โลตัส ชุมพร, โลตัส สุราษฎร์ธานี) จึงแสดง 74 — จะแสดงเองเมื่อผ่านนิยาม
7. **ทุกแถวยังมี `release_status` แบบ hold** (ตัวตน รูปทรง สิทธิ์ และฟิลด์ที่เหลือ) — หน้านี้เป็น research demo ที่เจ้าของให้เผยแพร่ ไม่ใช่ production release
8. **ชื่อชุดข้อมูลใน Registry** (“จำนวน พื้นที่เช่า และกลุ่มตลาด”) สัญญาเรื่องพื้นที่เช่าและกลุ่มตลาดเกินข้อมูลรุ่นนี้ หน้านี้ใช้ชื่อตาม D2

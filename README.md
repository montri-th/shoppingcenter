# CityMETER: ศูนย์การค้า (Shopping centers)

**Live demo: [montri-th.github.io/shoppingcenter](https://montri-th.github.io/shoppingcenter/)** · [Source repository](https://github.com/montri-th/shoppingcenter) · [Product statement](PRODUCT_STATEMENT.md) · [วิธีจัดทำข้อมูล](DATA_METHOD.md)

ย่านนี้มีพื้นที่ค้าปลีกแบบไหนอยู่แล้ว ของใคร มีร้านอะไรอยู่ข้างใน และอะไรกำลังจะเปิด: แผนที่เมือง 3 มิติของศูนย์การค้า ตลาด และสถานที่ค้าปลีกในไทย ที่นับเฉพาะสถานที่ที่ผ่านนิยาม แยกประเภทก่อนเทียบ และเปิดดูที่มาได้ทุกช่อง หน้าตาและพฤติกรรมเดียวกับ [CityMETER: Luxury Brands](https://montri-th.github.io/luxurybrands/) แต่หน่วยของข้อมูลคือ **สถานที่ค้าปลีก** และหน่วยพื้นที่คือ **เขต/อำเภอตามขอบเขตทางการ**

ชื่อบนหน้าจอ (เจ้าของสั่ง 25 ต.ค. 2569): ไทย **ศูนย์การค้า** · อังกฤษ **Shopping centers** — ความหมายของชุดข้อมูลยังเป็นศูนย์การค้าและสถานที่ค้าปลีกตามนิยามเดิม

**Research snapshot: ข้อมูลตรวจถึง 7 พ.ย. 2569 · Grain: หนึ่งสถานที่ (site / parent complex / retail component แยกแถว) · สถานะ: public research demo ไม่ใช่ production release**

## ตัวเลขของ snapshot นี้

ที่มา: CityMETER Shopping Centers & Retail Venues Research Master แท็บ 01_VENUES (export 7 พ.ย. 2569 00:26 น. · 11,139 รายการ · คิวตรวจนิยามยังเป็น 0) · ขอบเขต: รูปเขตกรมแผนที่ทหาร (RTSD 2562) ชุดเดียวกับ CityMETER production ใช้รหัสเขตของ OpenGISData-Thailand (commit `fafcea1`) และรหัสจังหวัดของ CityMETER production · ค่าล่าสุดอ่านจาก `meta.counts` ใน [data/venues.json](data/venues.json) เสมอ ตารางนี้เป็นภาพ ณ วันที่ข้างต้น

| สิ่งที่นับ | จำนวน | ความหมาย |
|---|---:|---|
| ทะเบียนทั้งหมด | 11,139 รายการ | ทุกอย่างที่เคยถูกเรียกว่าพื้นที่ค้าปลีก ไม่ใช่จำนวนศูนย์การค้าที่เปิดจริง |
| ผ่านนิยาม retail venue | 6,265 รายการ | ด้วยหลักฐานปัจจุบัน 789 · ตามกฎรายประเภทที่เจ้าของข้อมูลยอมรับ 5,247 (ตลาด 3,904 · สถานีบริการน้ำมันที่มีร้านค้า 1,173 · มีหลายกิจการอยู่ภายใน 66 · ร้านหลักกับกิจการที่สอง 55 · อื่น ๆ 49) · หลักฐานย้อนหลัง 224 · โครงการอนาคต 5 |
| นับได้ (หักที่ไม่นับแยก 114: พื้นที่ย่อย 85 · อาจซ้ำ 16 · รอตรวจการนับ 12 · บริบทหลายสถานที่ 1) | 6,151 แห่ง | เปิดอยู่หรือรอยืนยันสถานะ 6,145 · กำลังจะเปิด 4 · ปิดแล้ว 2 · รวมพื้นที่ค้าปลีกที่เป็นศูนย์การค้าแต่โครงการแม่ไม่อยู่ในชุดที่ผ่านนิยาม 7 แห่ง (D6) |
| มีพิกัดในเขต/อำเภอ (จาก 6,145) | 6,080 แห่ง | 77 จังหวัด 733 เขต/อำเภอ · 61 แห่งไม่มีพิกัดที่ผ่านเกณฑ์ · 4 แห่งพิกัดอยู่นอกขอบเขตเขต/อำเภอ (ริมทะเลหรือแนวชายแดน) จึงไม่นับในพื้นที่ใด |
| ตรวจแล้ว ยังยืนยันไม่ได้ | 4,866 รายการ | `reviewed_definition_unconfirmed` · บนแผนที่เป็นจุดเทาเงียบ 4,848 จุด ซ่อนได้ ค้นหาได้ ไม่นับในตัวเลขใด ๆ (D4) · รอตรวจ 0 |
| ทะเบียนสรุปว่าไม่ใช่สถานที่แยก | 8 รายการ | รวมโครงการแม่ที่เป็นบริบท ดุสิต เซ็นทรัล พาร์ค (ห้างที่นับคือ เซ็นทรัล พาร์ค) · ไม่แสดงและไม่นับ |
| อาคารของสถานที่ที่มีรูปทรงผ่านเกณฑ์ | 77 สถานที่ (75 อยู่ในชุดที่นับได้) | 130 รูปทรง: parts 10 สถานที่ · footprint อย่างเดียว 67 สถานที่ · สถานที่อื่นแสดงอาคารที่หมุดตั้งอยู่จากแผนที่ฐานเมื่อหาได้ |
| ร้านที่ชุดข้อมูลร้านค้ายืนยันว่าอยู่ข้างใน (ความสัมพันธ์แบบ primary ในทะเบียน) | 1,626 รายการใน 425 สถานที่ที่นับได้ | ประวัติ — หน้าเว็บรุ่น 0.1.8 ไม่ใช้ตัวเลขนี้แล้ว (D22) · 74 รายการของ 43 สถานที่ที่เพิ่มหลัง 26 ต.ค. ยังไม่อยู่ในรายชื่อร้าน |
| รายชื่อร้านข้างใน (ทุกตัวเลข “ร้านข้างใน” ของหน้าเว็บ · 5 พ.ย. 2569) | 5,493 สาขา ใน 619 สถานที่ จาก 21 ชุดข้อมูล | หนึ่งรายการคือหนึ่งสาขา (D23) · ชุดเดิม 2,461 · 7 ชุดที่ sheet จับคู่ชื่อศูนย์ (Sport 319 · Apparel 681 · Furniture 107 · Pet 58 · Massage & Spa 21 · Salon & Barber 62 · Nail 23) · 4 ชุดที่ผ่านการตรวจลิงก์ศูนย์ (Beauty 1,075 · Beauty Clinic 436 · Playground 103 · Car Service 147) · สถานที่ที่ยังไม่มีรายชื่อแสดง “—” |

ข้อค้นพบแรก (คำนวณใหม่ทุกครั้งจากข้อมูล ไม่ใช่ค่าคงที่): **50 จาก 889 แห่งของกรุงเทพฯ (6%) อยู่ใน 3 เขตที่แน่นที่สุด — สัมพันธวงศ์ พระนคร บางรัก — บนพื้นที่ 10.8 จาก 1,571.4 ตร.กม. (0.7%) หรือแน่นกว่าค่าเฉลี่ยของกรุงเทพฯ ราว 8 เท่า** ตัวหารคือสถานที่ที่นับได้และมีพิกัดในกรุงเทพฯ (เป็นจำนวนสถานที่ ไม่ใช่ยอดขาย footfall ค่าเช่า หรืออัตราว่าง) · อำเภอที่มีมากที่สุดในประเทศ: เมืองเชียงใหม่ 103 แห่ง

ตลาดเป็นกลุ่มใหญ่ที่สุดของชุดนี้ (4,024 จาก 6,080 แห่งที่มีพิกัด) รองลงมาคือสถานีบริการน้ำมันและจุดพักรถ (1,331) ศูนย์การค้า 243 · ไฮเปอร์/ซูเปอร์มาร์เก็ตที่มีร้านเช่า 210 · คอมมูนิตี้มอลล์ 146 · พื้นที่ค้าปลีกในโครงการ 107 · เอาท์เล็ต 13 · อื่น ๆ 6 ตลาดส่วนใหญ่ยังมีสถานะปัจจุบันแบบรอยืนยัน — นับใน “เปิดอยู่หรือรอยืนยันสถานะ” ตามกฎเดิม และแผงสถานที่บอกสถานะของแต่ละแห่ง

## ใช้งาน

```sh
npm start        # http://127.0.0.1:4173/
npm test         # Node ≥ 20
```

ไม่มี build step และไม่มี framework: HTML/CSS + ES modules ไลบรารีภายนอกสองตัว: MapLibre GL 5.6.2 (pin ไว้ใน `js/vendors.js`) และ amCharts 5.20.8 สำหรับกราฟ (bundle ไว้ใน `vendor/amcharts5/` พร้อม LICENSE — free linkware licence คงโลโก้ amCharts ทุกกราฟ; ถ้าโหลดไม่ได้ใช้กราฟ HTML แทน) basemap และมวลอาคารจาก [OpenFreeMap](https://openfreemap.org/) (OpenMapTiles schema, ข้อมูล OpenStreetMap) ชุดทดสอบตรวจสัญญาข้อมูล (ตัวเลขตรงกับ meta, รหัสจังหวัด/เขตตรง production, ไม่มีลิงก์หรือรหัสไฟล์ภายใน, ทุกสถานะและบทบาทการนับถูกจัดกฎ), การนับ, ข้อค้นพบแรก, สเกลสี LDS 41 ระดับ, แผงข้อมูล, โลโก้, หมุด, อาคารของหมุด, มวลอาคาร, กราฟ, breadcrumb และ import map ของ cache tag ส่วนหน้าจอจริงตรวจในเบราว์เซอร์แยกต่างหาก ([handoff/VERIFICATION.md](handoff/VERIFICATION.md))

## สิ่งที่สำรวจได้

- **ข้อค้นพบก่อน (Aha first):** หน้าแรกเป็นเมือง 3 มิติที่โฟกัส 3 เขตที่มีสถานที่ต่อ ตร.กม. สูงสุดของจังหวัดที่มีเขตหนาแน่นที่สุด พร้อมตัวตั้ง ตัวหาร บริบทพื้นที่ และความแน่นเทียบค่าเฉลี่ย คำสั่งถัดไป: ดูทุกเขต (`?areas=all`) · ทั้งประเทศ · เทียบพื้นที่ · ไม่มี caveat บนหน้าจอ — วิธีและข้อจำกัดอยู่ในรายการ “หลักฐานรายช่อง” (พับไว้) วิธีใช้ และเอกสาร
- **นับเฉพาะที่ผ่านนิยาม:** ผ่านด้วยหลักฐาน หรือด้วยกฎรายประเภทที่เจ้าของข้อมูลยอมรับ (Owner-stated: ตลาด สถานีบริการน้ำมันที่มีร้านค้า และอื่น ๆ — หลักฐานรายช่องบอกว่าผ่านทางใด) · โครงการแม่ไม่บวกกับพื้นที่ย่อย · พื้นที่ค้าปลีกที่เป็นศูนย์การค้าแต่โครงการแม่ไม่อยู่ในชุดที่ผ่านนิยามนับเป็นสถานที่ของตัวเอง (D6) · รายการที่อาจซ้ำหรือการนับแยกยังรอตรวจไม่นับ · กำลังจะเปิดและปิดแล้วแยกไว้ · รายการที่ยังยืนยันไม่ได้เป็นจุดเทาเงียบที่ zoom ≥ 11 ไม่อยู่ใน tab order ซ่อนได้ (`?pending=0`)
- **8 กลุ่มประเภทพร้อมรูปทรงกำกับ:** ศูนย์การค้า · คอมมูนิตี้มอลล์ · ตลาด · ไฮเปอร์มาร์เก็ตและซูเปอร์มาร์เก็ตที่มีร้านเช่า · พื้นที่ค้าปลีกในโครงการ · เอาท์เล็ต · สถานีบริการน้ำมันและจุดพักรถ · อื่น ๆ (สี `landometer-series-10-v8` + รูปทรง ไม่พึ่งสีอย่างเดียว)
- **พื้นที่:** ทั้งประเทศ = กรอบจังหวัดระบายจำนวนสถานที่ (LDS `count`) · จังหวัด = เขต/อำเภอระบายสถานที่ต่อ ตร.กม. (LDS `density.area`) · ใช้ครบ 41 สีของ LUT ตามลำดับค่าของพื้นที่ที่อ่าน (D8) คำอธิบายแผนที่แสดงทั้ง 41 สีพร้อมค่า · ศูนย์ที่วัดได้มีเส้นขอบศูนย์ แยกจากไม่มีข้อมูล · HEX เดียวกันทั้งสองธีม
- **สถานที่:** กดหมุดหรืออาคาร = อาคาร 3 มิติมองเฉียงมุมแบบ 2 จุดลับตา เต็มพื้นที่แผนที่ที่ว่างทุกครั้ง (D16) · แผงขึ้นด้วยโลโก้และชื่อ แล้วตัวเลขหลัก (ร้านข้างใน ค่าที่รายงาน ปีที่เปิด) ปุ่มติดต่อ (เว็บไซต์ · รายชื่อร้าน · โทร) ผู้บริหาร เวลาเปิด ขนาด (ค่าประมาณเดิมขึ้นต้นด้วย “ราว” เฉพาะแผงนี้ ไม่รวม ไม่จัดอันดับ — D3) ที่อยู่ (D18) · ร้านข้างในพร้อมลิงก์ไป Luxury Brands เมื่อเปิดสถานที่เดียวกันได้ · พื้นที่ย่อยและโครงการแม่ · หลักฐานรายช่องพร้อมวิธี วันที่ตรวจ และพิกัด · รหัส `venue_id` / Shopping Center id / CityMETER id
- **มือถือ:** แผนที่มาก่อนเสมอ แผงล่างซ่อนไว้ · การ์ดเหนือแผนที่บอกข้อค้นพบ หรือชื่อ/โลโก้ของสถานที่ เขต หรือผลค้นหา พร้อมปุ่ม “ดูรายละเอียด” (D17)
- **อาคาร 3 มิติ:** สีน้ำเงิน = อาคารของสถานที่ (รูปทรงที่ตรวจแล้ว) หรือ **อาคารที่หมุดตั้งอยู่** สำหรับทุกหมุดที่นับได้ทั้ง 8 ประเภท (เจ้าของสั่ง 25 ต.ค. 2569: หมุดอยู่ในรูปทรงอาคารของแผนที่ฐาน OpenStreetMap หรือห่างขอบไม่เกิน 3 ม. — ไม่ใช้ชื่อหรืออาคารที่ใกล้ที่สุด) · มวลอาคารของเมืองอ่านได้รอบจุดที่ผู้ใช้กำลังดูทั่วประเทศ (จางลงตามระยะจากหมุดในโฟกัสและจากกลางภาพ) · “มุมสถาปนิก” จัดภาพอาคารใหม่
- **breadcrumb:** ประเทศไทย › จังหวัด › เขต/อำเภอ › สถานที่ ด้วยรหัสของ CityMETER production (`?province=BKK&district=1007&venue=<venue_id>`)
- **กราฟ (amCharts):** เขตที่แน่นที่สุด (สลับเรียงตามแห่ง/ตร.กม. หรือจำนวน สีเดียวกับแผนที่) · ประเภทในแต่ละพื้นที่ (สัดส่วนหรือจำนวน ซ่อน/แสดงประเภทจากปุ่มคำอธิบาย) · ผู้บริหาร (สัดส่วนจำนวนสถานที่ ไม่ใช่ market share) · ชี้เพื่อดูตัวเลข กดหรือ Enter เพื่อเจาะลง · ตารางสถานที่ทีละ 25 แถว
- **ไอคอน LDS:** Material Symbols Rounded (FILL 0 / wght 300) คู่กับคำสั้น ๆ บนปุ่ม แท็บ และหัวข้อ ไม่ใช้แทนคำหรือหลักฐาน
- **ค้นหา:** ชื่อไทย/อังกฤษ ชื่อเรียกอื่น ผู้บริหาร รหัส และ**แบรนด์ในรายชื่อร้าน** (substring หลัง normalize ไม่ fuzzy) รายการที่ยังยืนยันไม่ได้ติดป้ายสถานะและว่าไม่นับ
- **ร้านข้างใน (0.1.6):** ชิปส่วนผสมร้านตามหมวด กดเพื่อดูเฉพาะหมวด · “เทียบศูนย์ใกล้เคียง” ในรัศมี 5 กม. บอกหมวดและแบรนด์ที่ศูนย์ใกล้เคียงมีแต่ยังไม่อยู่ในรายชื่อของที่นี่ และแบรนด์ที่มีที่นี่ที่เดียว · หน้าแบรนด์ `?brand=<key>` บอกสถานที่ที่มีแบรนด์ในรายชื่อ จังหวัด และแบรนด์ที่มักอยู่ร่วมกัน โดยแผนที่ระดับประเทศระบายจังหวัดด้วยจำนวนสถานที่ที่มีแบรนด์นั้น
- ไม่มีลิงก์เอกสารภายในในหน้าเว็บหรือไฟล์ข้อมูล · missing ไม่แสดงเป็น 0

## อัปเดตข้อมูล

เว็บรองรับทะเบียนที่โตขึ้นโดยไม่ต้องแก้โค้ด: จุดทั้งหมดวาดด้วย GPU layer, หมุด DOM เฉพาะส่วนที่โฟกัส (≤ 600 ไม่เช่นนั้นเป็นสัญลักษณ์ GPU), รายละเอียดสถานที่แยกเป็น shard ที่เพิ่มจำนวนเองตามขนาดทะเบียน, อาคารของหมุดคำนวณเฉพาะหมุดในภาพ และตัวเลข ข้อค้นพบแรก สเกลสี และตารางสรุปคำนวณใหม่จากข้อมูลทุกครั้ง

1. Export แท็บของ Research Master เป็น CSV ลงโฟลเดอร์เดียว: `01_VENUES`, `09_RELATIONSHIPS`, `10_VENUE_LOGOS` และ `13_BUILDING_LINKS` (ชื่อไฟล์ลงท้ายด้วย `<แท็บ>.csv`) พร้อมโฟลเดอร์ geometry bundle ที่แตก zip แล้ว และโฟลเดอร์ไฟล์โลโก้ใหม่ (ถ้ามี)
2. รันคำสั่งเดียว:
   ```sh
   npm run data:refresh -- <csv-export-dir> <geometry-bundle-dir> [<logo-files-dir> ...]
   ```
   สคริปต์ดึงขอบเขต (commit ที่ pin ไว้) และรหัสจังหวัด/เขตของ production ไว้ใน `.cache/` ครั้งแรก แล้วสร้าง `data/*`, ทะเบียนโลโก้ (ใช้ไฟล์ที่ SHA-256 ตรงกับชีตเท่านั้น และเก็บไฟล์เดิมไว้), ตาราง noscript และ JSON-LD จากนั้นรัน `npm test` และพิมพ์ตัวเลขสรุป
3. อ่าน [data/build-report.json](data/build-report.json) (สคริปต์พิมพ์รายการ REVIEW ก่อนรัน test): ค่า `venue_qualification_status` ใหม่ที่อ่านด้วยกฎ `fallback` (ถือเป็นรอตรวจ ไม่นับ และทำให้ test ไม่ผ่านจนกว่าจะจัดเข้ากฎใน `qualification_rule()` ของ `scripts/build-data.py`; สถานะ `owner_<กฎ>_definition_accepted_*` อ่านเป็นกฎของเจ้าของโดยอัตโนมัติ และควรเพิ่มชื่อไทยของกฎใน `OWNER_RULES` ของ `js/model.js`) · `count_role` ใหม่ของแถวที่ผ่านนิยาม (ไม่นับและทำให้ test ไม่ผ่านจนกว่าจะจัดเข้า `COUNTED_ROLES` / `COMPONENT_ROLES` / `HELD_ROLES`) · `venue_type` ที่ผ่านนิยามแต่จัดกลุ่มด้วย keyword (เพิ่มเข้า `TYPE_GROUP`) · คำของ `coordinate_status` ที่อ่านเป็นจุดที่เลือกแล้ว · พื้นที่ย่อยที่ไม่มีโครงการแม่
4. ตรวจหน้าจอใน `npm start` ทั้งจอแคบและ desktop สองธีม เปลี่ยน cache tag `?v=` ของ entry ใน `index.html` แล้วรัน `python3 scripts/build-static.py` (import map พาทุก module ไปที่ tag ใหม่) จากนั้น commit, push `main`, รอ Pages แล้ว `npm run handoff:manifest` และ `npm run verify:live` ผล local ไม่ใช่หลักฐานแทน live URL และอาคาร 3 มิติต้องตรวจในเบราว์เซอร์ที่โหลด tile ของ OpenFreeMap ได้จริง
5. ตัวเลขในเอกสาร (ตารางข้างบน, Product Statement §2.2, `docs/BUILD_CARD.md`) เป็นภาพของ snapshot ให้แก้พร้อมกันในรอบเดียวกัน

## Data and method

อ่าน [Product statement](PRODUCT_STATEMENT.md) และ [DATA_METHOD.md](DATA_METHOD.md) ก่อนตีความผล: นิยามและการนับ ตารางจับคู่กลุ่มประเภทและผู้บริหาร วิธีระบุพื้นที่ อาคารของหมุด สเกลสี ข้อจำกัด และความต่างของหลักฐานที่รอเจ้าของตัดสิน

- Research Master ใน Google Sheets และ CityMETER Dataset Registry (internal working reference; public demo data: [data/venues.json](data/venues.json))
- [CityMETER Shopping Center production](https://landometer.com/v3/citymeter?d=shoppingCenter) — รหัสจังหวัด/เขตและ CityMETER id
- รูปเขตกรมแผนที่ทหาร (RTSD 2562) ผ่าน [geoBoundaries](https://www.geoboundaries.org/) / OCHA HDX — ขอบเขตจังหวัดและเขต/อำเภอ (CC BY 3.0 IGO) ชุดเดียวกับ CityMETER production
- [OpenGISData-Thailand](https://github.com/chingchai/OpenGISData-Thailand) — รหัสและชื่อเขต/อำเภอที่ใช้จับคู่ (CC BY 4.0)

## Assets, สิทธิ์ และการตรวจ

ใช้ LDS **0.9.7 / v0.9.7-owner.1** (`standalone-0.9.7-r1`, `color-srgb-10`, SHA-256 `d3085cbc…d432d96`) เฉพาะค่าที่หน้านี้ใช้: tokens ใน [assets/theme.css](assets/theme.css), LUT 41 ค่าของ `count` และ `density.area` ใน [js/scales.js](js/scales.js) (ใช้ครบทั้ง 41 ค่าบนแผนที่ คำอธิบายแผนที่ และกราฟ), categorical series 1–10, fonts ใน `assets/lds/build-kit/` (OFL) และไอคอน Material Symbols Rounded: ชุด nav-7 ที่อนุมัติ (ไม่แก้ไบต์) กับชุด pictogram/UI 40 ตัว (`assets/icons/material-pictogram-300.*`, test exception ที่เจ้าของอนุมัติ 22 ต.ค. และสั่งเพิ่ม 25 ต.ค. 2569 — ยังไม่ขึ้นทะเบียนใน LDS) ไม่แนบคลัง LDS ทั้งชุด ไฟล์ asset บันทึกขนาดและ SHA-256 ใน [assets/manifest.json](assets/manifest.json) และทุกไฟล์ของ repository ใน `handoff/handoff-manifest.json` (สร้างด้วย `npm run handoff:manifest`) ผล hash ตรงไม่ใช่การรับรองว่าหน้าจอผ่านการตรวจหรือเป็น production

คง attribution ของ OpenFreeMap / OpenMapTiles / OpenStreetMap, กรมแผนที่ทหาร (RTSD) ผ่าน geoBoundaries / OCHA (CC BY 3.0 IGO) และ amCharts (โลโก้บนกราฟตาม free licence; [vendor/amcharts5/LICENSE](vendor/amcharts5/LICENSE)) รูปทรงอาคารของสถานที่มาจาก OpenStreetMap (ODbL) ผ่าน geometry bundle ของ CityMETER — README ของ bundle ระบุว่าการที่ production ใช้ได้ไม่ได้พิสูจน์สิทธิ์เผยแพร่ต่อแบบเปิดโดยลำพัง จึงคง field สิทธิ์ของแต่ละรูปทรงไว้ · อาคารที่หมุดตั้งอยู่เป็นรูปทรงจาก tile ของแผนที่ฐาน (© OpenStreetMap contributors) วาดบนเครื่องผู้ใช้ ไม่ได้เก็บเป็นไฟล์ข้อมูล

โลโก้สถานที่มาจากทะเบียน `10_VENUE_LOGOS` ของ Research Master: ครบ 113 ไฟล์ที่ตรวจ SHA-256 ตรงกับทะเบียนแล้ว ผูกกับ 108 สถานที่ที่นับได้ ([data/venue-logos.json](data/venue-logos.json)) สถานที่ที่ไม่มีโลโก้ในทะเบียนแสดงชื่อแทน ใช้ไฟล์ต้นฉบับไม่แก้สีหรือสัดส่วน ค้นด้วย `venue_id` เท่านั้น การรวบรวมไฟล์ไม่ใช่ใบอนุญาตเครื่องหมายการค้า สิทธิ์ยังเป็นของเจ้าของ

ทุกแถวในทะเบียนยังมี `release_status` แบบ hold (ตัวตน รูปทรง สิทธิ์ และฟิลด์ที่เหลือ) หน้านี้จึงเป็น research demo ที่เจ้าของให้เผยแพร่ ยังต้องมีกระบวนการอัปเดต สิทธิ์ข้อมูล และ field validation ก่อนยกระดับเป็น production dataset

## รายชื่อร้านในแผงสถานที่ — รุ่น 0.1.1 (`20261025-r9a`)

ปรับเฉพาะ “ร้านข้างใน”: แสดงชื่อร้านและโลโก้เมื่อมี เริ่ม 10 รายการ กดดูเพิ่มครั้งละไม่เกิน 10 จนครบ การโหลดรายชื่อเป็นส่วนเสริมหลังเลือกสถานที่ ไม่ขวางแผนที่ และการดูเพิ่มไม่ขยับกล้อง

เทียบ registry และ stable outlet IDs ล่าสุด 25 ต.ค. 2569: แสดง 2,230 รายการใน 461 สถานที่ จาก 2,232 source observations; 1,609 รายการมีโลโก้จากไฟล์เดิมที่ตรวจ SHA-256 แล้ว 178 ไฟล์ รายชื่อประกอบด้วย primary links เดิม 1,579 รายการที่อยู่ในชุดเผยแพร่ บวก official chain named-host 644 รายการ และ Grocery parent/tenant locatives 7 รายการ รวม Big C Foodplace ที่ PARC Bangna ไม่รวม candidate, ร้านใกล้เคียง หรือ venue ที่ยังไม่ผ่านนิยาม รายชื่อยังไม่ใช่ tenant census ทุกศูนย์หรือคำยืนยันการเปิดวันนี้

ลำดับเป็นการประเมินบทบาทต่อศูนย์จากร้านหลัก รูปแบบศูนย์และ positioning ทางการที่มีหลักฐาน (11 ศูนย์) ไม่ใช่อันดับยอดเข้าชมหรือยอดขาย บทบาทเท่ากันเรียงชื่ออย่างคงที่ วิธีและขอบเขตอยู่ในหลักฐานรายช่องและ [DATA_METHOD.md](DATA_METHOD.md) §9 จำนวนในแผงใช้ roster ล่าสุด; ตัวเลขรวมของแผนที่/การ์ด/ย่าน/กราฟยังใช้ snapshot เดิมเพื่อคงพฤติกรรมเดิมตามขอบเขตงาน

ไฟล์ที่เกี่ยวข้อง: `js/tenants.js`, `data/tenants/`, `data/tenant-profiles.json`, `assets/tenant-logos-manifest.json`, `scripts/build-tenant-data.py` และ tests ของ tenant build/interaction ผลการสร้างอยู่ใน `data/tenants/build-report.json` สร้างซ้ำจาก reviewed interchange ด้วย `python3 scripts/build-tenant-data.py --observations <reviewed-tenant-observations.json> --logos assets/tenant-logos-manifest.json` โดยเก็บไฟล์วิจัยต้นทางไว้ภายใน

## MLA PARC enrichment — 26 October 2026

PARC Bangna and15 competitors now reconcile to the same venue registry. Three distinct hosts were added: Dadfa Lasalle, The JAS Urban Srinakarin and planned PADDIO Bangna. The canonical registry has11,012 records;22 existing selected fields were updated with field-scoped provenance. Date-qualified records do not establish current opening or the latest operator appointment.

The tenant panel adds78 displayed listings from80 dated public membership observations;2 exact existing outlets receive corroborating evidence only. The additional evidence covers PARC, Little Walk Bangna, Lasalle’s Avenue, Central Bangna, Design Village Bangna and JAS Urban. It is partial historical/source coverage, not a complete current tenant census for every competitor. Nineteen reviewed cases remain held in the canonical ledger. Public rosters now contain2,308 display items at463 hosts, including1,621 items with verified local logos. Original9-dataset primary joins and BO/BP counts remain unchanged.

The source pipeline reads the canonical dated-observation ledger, verifies public branch-specific provenance and exact host identity, retains current operation as unconfirmed, and suppresses candidates/events and unresolved cases. Original brand files are reused only after exact brand or explicitly approved alias matching. No commercial terms, sales, rents, raw reviews or reviewer identities are exported. Map layout, road placement, camera and building geometry remain as release0.1.2.


## 0.1.4 - scoped owner tenant refresh and selected-building road labels

The current shop list follows the canonical owner decisions from 26 October 2026: explicit closed and planned/hidden entries are excluded, Grill & Ground is added separately at Dadfa, host/name corrections are applied without duplicate outlets, and owner assertions remain distinct from public-source checks in field evidence. LOPIA stays hidden until explicitly released.

Only the selected venue x-ray solid moves above road-name symbols, letting its walls and roof cover road text. Nearby roads, ordinary buildings, camera, palette, layouts and primary venue/area counts stay unchanged. Cache tag 20261026-r12 loads the coordinated release.

## 0.1.5 - CityMETER Fitness branches in the tenant list

Owner request 30 October 2026: map the CityMETER Fitness branches to the venues of this registry. The Fitness research sheet links each branch to a registry venue by id only (`accepted_identity_and_located_in`); its public release at commit `6775063` now feeds the tenant list as a linked dataset. 139 branches whose official source still lists them appear at 124 venues with verified brand logos (27 files); 8 announced or unclear rows stay out. Every existing tenant entry, venue core, map count and area figure is unchanged. A venue with Fitness branches links to the same venue in CityMETER Fitness, which links back by the same registry id. Cache tag 20261030-r13.

## 0.1.6 - new research datasets in the tenant list, shop mix, nearby centres and brand view

Owner request 4 November 2026 19:43: review the depth and breadth of the new datasets in the CityMETER Dataset Registry, compare them with the Product Statement and improve the demo for the ICP. The review is in `PRODUCT_STATEMENT.md` §9.

- **Seven more datasets in the tenant list** (`scripts/link-research-tenants.py`, gate `build-tenant-data.py#named_gate`): rows whose official source names the host and whose own research sheet matched it to one registry venue by exact or reviewed unique alias — the standard of the canonical `official_chain_exact_named_host_listing` — current, in approved scope, the brand's own shop or counter, within 300 m, one brand once per venue. Sport 315 · Apparel 667 · Furniture, DIY & Kitchenware 107 · Pet 58 · Massage & Spa 21 · Salon & Barber 61 · Nail 23. The list is now 3,713 entries at 529 venues from 17 datasets; every earlier entry is byte-identical. Beauty, Beauty Clinic, Playground and Car Service record their host links as candidates, so they stay out (`build-report.json#excludedDatasets`).
- **Reading aids for the ICP** (`data/tenant-index.json`, `scripts/build-tenant-index.py`): shop-mix chips in the venue panel; “เทียบศูนย์ใกล้เคียง” — centres with a shop list within 5 km, the roles and brands their lists have that this list does not, and what only this list has; brand search and the brand view with venues, provinces and brands that share venues.
- Venue cores, primary counts and the map/area/table totals are unchanged (D19). Cache tag `20261104-r14`.

## 0.1.7 - district polygons that follow the river

Owner 4 November 2026 21:56: the Samphanthawong outline crossed the Chao Phraya into Thonburi. The OpenGISData-Thailand polygon had 12 vertices (5 on screen), and the district fill was drawn over water.

- **Polygons of CityMETER production** (D24): RTSD 2019 district polygons via OCHA / geoBoundaries (CC BY 3.0 IGO). Production's district extents and areas match these polygons exactly. `scripts/build-boundaries.py` gives each polygon its OpenGISData code by overlap; areas come from production.
- **Membership recomputed** with the build's own point-in-polygon (`scripts/relocate-districts.py`): 80 venues and 47 context rows moved. 65 of the 80 now sit in the district their own address names (10 did before). First finding: สัมพันธวงศ์ · พระนคร · บางรัก, 50 of 861.
- **Smooth at every zoom:** the national file stays coarse. Each province's detailed polygons (`data/districts/<province>.geojson`, Bangkok 59 KB gzipped) load only when that province is read or in view from zoom 9 (`js/district-detail.js`). Data fills now sit under the basemap water, so rivers stay water. Cache tag `20261104-r15`.

## 0.1.8 - shop counts from the list, branches, reviewed host links and “ข้างในมี”

Owner 4 November 2026 21:23–21:24: do D22, research the candidate host links carefully (“ผูกกับศูนย์การค้าให้ถูกต้อง อย่าเดา”), fix the registry sync, add a pet-friendly filter and brand logos; count branches, not brands (“เมกาบางนา มี Starbucks 3 สาขา”).

- **Branches (D23):** one entry is one shop or counter the official source lists as its own entry; distinct entries of one brand at one venue stay separate; the same branch from another publisher or dataset is one entry with every outlet id.
- **Reviewed host links:** `scripts/review-candidate-hosts.py` accepts a candidate host of Beauty, Beauty Clinic, Playground or Car Service only when the source is the brand's or the host's own, the published branch label names the candidate and no other venue (not “before/near” it), the province agrees and the row's own point is near the venue or inside its footprint. Names are compared after one fixed normalisation (case, spacing, Thai silent letters, the operators' documented renamings) plus one sourced official name — nothing fuzzy. 1,769 of 2,789 candidate rows pass; 1,761 branches enter. The other 1,020 rows, with a reason each, are in an internal review sheet for the research team.
- **Shop counts everywhere from the list (D22):** overview, area, venue lists, table, cards and the venue panel read the same list — 5,493 branches at 619 venues from 21 datasets. A venue without a list reads “—”, never 0.
- **Filter “ข้างในมี” (`?role=`):** venues whose list has a shop role (roles of the new datasets included), or a centre pet area from the Pet dataset (`data/venue-amenities.json`, 5 venues, the centre's own page or the owner's report).
- Brand logos: the research masters hold verified logo files for 13 Apparel brands only, so none were added. The registry sync was repaired outside this repository. Cache tag `20261105-r16`.

## 0.1.9 - 3D buildings with terrain as in CityMETER · Hotel, CityMETER Building V4 and research-dataset logos

Owner 5 November 2026 00:34: “ช่วยปรับการแสดงผล 3d building mass พร้อม terrain ในรูปแบบเดียวกับ https://montri-th.github.io/hotel ทั้งส่วนที่เป็น multiple building property (campus style) รวมถึงการใช้แหล่งข้อมูลอาคารเสริมจาก CityMETER: building ด้วย … แล้วเพิ่ม logo ให้ครบถ้วน”

- **Building source per area (D25):** the hotel rule (owner 1 November 2026): per อปท. (Bangkok: เขต), CityMETER Building V4 when its building count is at least 1.15 × OpenStreetMap's, else OpenStreetMap. `data/building-units/` holds 2,175 units with a venue in 77 provinces: CityMETER 2,153 · OpenStreetMap 22 · gap 2. 1,643 units reuse the hotel's decisions; 532 were decided from production counts and ohsome (OSM 27 July 2026) counts (`scripts/build-building-units.py`). Inside a CityMETER unit the focus massing draws CityMETER buildings (production tiles, `height_m` model estimates), OSM buildings mapped in parts stay, and the city layer redraws the rest of any OpenFreeMap piece it hides. Pin buildings use the same source; the map credit names “CityMETER Building V4” while its buildings are on screen.
- **Terrain:** Terrain Tiles on AWS (SRTM), 1.5 × relief, on by itself in 3D from zoom 12.5 where the ground in view varies by 30 m or more (with a venue open: ±1 km of its pin). Hillshade sits under the data fills; district fills stop at zoom 12.5; buildings and the venue x-ray stand on the ground; the venue camera frames on the real ground. Legend item “ภูมิประเทศ ×1.5”.
- **Multi-building sites:** `data/venue-sites.json` (one interior point per building, count, source, public layout link, date) gives a venue all its buildings in blue and “ทั้งโครงการ N อาคาร”; `scripts/build-venue-sites.py --sites <CSV>` writes it from a site tab in the columns of the hotel’s `49_SITE_BOUNDARY_CHECK`. The research has no checked shopping-centre sites yet, so none are shown; drafts from OpenStreetMap outlines wait for the team's review (`scripts/site-candidates.mjs draft`, below).
- **Logos (D26):** from the 5 November 01_BRANDS exports, files whose bytes equal the sheet's SHA-256, `brand_primary` only (`scripts/collect-research-logos.py`): Apparel 90 brands (681 branches) and Sport 2 brands (17 branches). 201 more brands have a hash in the sheets but their files sit in the research team's Drive logo packs, not yet in this build. Cache tag `20261105-r17`.

## 0.1.10 - every research-dataset logo the sheets hold

Owner 5 November 2026 07:29 (“ได้”): download the research team's logo packs from Drive. Nine packs (six ZIP files and three folders zipped by Drive, about 127 MB, left in the owner's Downloads) hold the bytes of all 293 `brand_primary` logos the 5 November 01_BRANDS exports name for the published brands; only files whose SHA-256 equals the sheet's are used.

- **Logos:** 2,506 of the 3,032 items of the eleven research datasets now carry their brand's logo (Apparel, Beauty and Salon & Barber all; Beauty Clinic none — its sheet has no logo yet). Shared chain banners and context logos stay out. Roster, counts and branches are unchanged.
- **Plates:** a transparent logo sits on the dark plate when a fifth of its outline would nearly vanish on the soft surface (under 2:1) and almost none of it on the dark one; a surface the sheet states wins unless the image shows the mark would vanish on it (one conflict, counted in `build-report.json#researchLogos` for the research team). Cache tag `20261105-r18`.

## 0.1.11 - dataset names in the shop list's source line

The source line under a venue's shop list printed the registry ids of the four reviewed datasets (`research.TH.beauty`, `research.TH.beauty_clinic`, `research.TH.playground`, `research.TH.car_service`) since 0.1.8; they now read ร้านความงาม · คลินิกความงาม · เครื่องเล่นและครอบครัว · บริการรถยนต์, and `tests/dataset-labels.test.js` fails if a published dataset has no name. Cache tag `20261105-r19`.

## 0.1.12 - the phone first view shows the three districts

Owner 5 November 2026 08:34, on a phone: “หน้าแรก เปิดมาเจอแบบนี้ ให้ดูอะไรเหรอ”. The first view zoomed in to 13.1 (the city-massing zoom) even when the three focus districts needed a lower zoom, and centred them on the canvas, not in the free map box, so on a phone they sat under the card.

- **Camera:** the zoom-in to 13.1 now applies only when the whole-district fit is within 0.4 zoom of it, around the middle of the free box (desktop unchanged). A portrait phone frames the three districts whole, north up at pitch 40° (`cityPortrait` in `js/camera.js`): every district vertex inside the free box at 390 and 430 px.
- **Map credit:** the vendor stylesheet placed the credit at the bottom of the map, behind the bottom bar; it now sits above the bar. On a phone the legend and card stay above its live height while it is open (as CityMETER · Hotel) and drop back once it folds to its (i) button; on wider screens it wraps on the right of the legend. Cache tag `20261105-r20`.

## 0.1.16 - 37 hypermarkets and wholesale stores with a second business, and the 7 Nov export

Owner 6 Nov 2026 23:08–23:09: “ลองดูข้อมูลทุกๆ dataset ใน registry ที่มีการ เชื่อมกับ อาคารไว้ ว่ามี retail/commercial venue ไหนที่เราตกหล่นควรเพิ่มใน dataset = Shopping center … เลือกเพิ่มเข้า google sheet” and “รายงานผมหน่อยว่าได้เพิ่มจาก ใน web demo กี่ศูนย์การค้า เสร็จแล้วปรับ web demo เลยครับ”.

- **Rule (the owner's accepted `anchor_second_business`, 23 Oct 2026):** a Big C, Lotus's or Makro store of the Grocery dataset with a point counts as a venue when another consumer business lists this store as its location (its own branch page, or a CityMETER production point named after the store) within 300 m, no registry row of the same name or chain lies within 1.5 km, and nothing says it closed. Hotels, hospitals, offices, condominiums, government buildings, transport hubs and fuel stations were left out as hosts. 37 stores passed (Big C 28 · Lotus's 3 · Makro 6); for 23 the second business is a brand's own branch page, for 14 only a CityMETER production point name. 7 more were held: already in the registry 1.2 km away (1), inside a counted centre (1), the listing names a different store (2), one listing that fits two Big C in Hat Yai (2), only the operator's own food court (1). The rows are 11104–11140 of `01_VENUES`, read back cell by cell (3,441 of 3,441).
- **The page:** venue data from the 7 Nov 2026 00:26 export (11,139 rows): qualified 6,265 (+127) · countable 6,151 (+64) · located 6,080 (+58). Of the 127 new rows, the 37 above are counted (group “ไฮเปอร์/ซูเปอร์มาร์เก็ตที่มีร้านเช่า”, 173 → 210); the other 90 came from the research team on 6–7 Nov — 27 counted (shopping centres 7, community malls 19, one rest stop) and 63 retail areas in offices, hospitals, hotels and stations, which are qualified components shown but not counted (D6). No row left the set.
- **Shop lists:** the list (`data/tenants/`) is unchanged; `scripts/refresh-tenant-receipt.py` names the new venue core in its receipt after checking that every listed venue is still there and kept its count. 43 new venues carry 74 primary observations in the registry that the list does not hold yet, recorded in `build-report.json#venueCoreRefresh.awaitingRoster`; their shop figure reads “—”, not 0.
- After this export the 37 rows' status link (`operation_source_url`, BE11104–BE11140) was corrected in the sheet to the anchor's own store-locator page, as the sheet's other rows with `current_first_party_locator_listing_not_field_verified` have it (read back 37 of 37); the page shows it from the next export.
- `office_retail_component` reads as a component (`TYPE_GROUP_ADDED_2026_11_07`). Cache tag `20261107-r24`.

## 0.1.15 - LIVE Ramintra drawn from its own design file

Owner 6 Nov 2026 09:19–09:23: the SketchUp files of PARC Bangna and LIVE Ramintra into the page as light 3D building masses that work with the other buildings. LIVE Ramintra (`VN-af6f8f302b8c83`) is drawn as 15 LOD1 masses from its design file of 27 Oct 2026 (one 9.5 KB file in `data/venue-models/`, fetched only when the venue is opened or in view from zoom 14), placed where the owner chose from the review pictures: north up, the curved building on the frame under construction. They replace the venue's pin and site buildings in the host blue; the panel reads “มวลอาคารตามแบบของโครงการ”, with the file date, the placement and “not a survey” in “หลักฐานรายช่อง”. PARC Bangna is held (`"publish": false` in `scripts/venue-model-placements.json`): no single rotation and shift puts both halves of its file on the buildings standing today, and the owner chose to wait for an as-built file, so it keeps its 14 site buildings. The design files stay outside the repository. Method: `DATA_METHOD.md` §11.2; tests `venue-models`. Cache tag `20261106-r23`.

## 0.1.14 - a site is drawn whole while one of its points still waits

The live check of 0.1.13 found Mega Bangna drawn with 25–69 of its buildings, depending on the view: a site that still waited for one point (here Topgolf's roof, an OpenStreetMap building, in a tile not yet read) was drawn as its first snapshot and never grew (`js/pin-buildings.js` counted only final results in the change signature). Partial sites now count their parts too and grow as their tiles arrive (test `pin-buildings`: “a site that is still waiting for one point …”). Cache tag `20261106-r22`.

## 0.1.13 - sites drawn for 119 shopping centres

Owner 5 November 2026 23:57: “ภาคผนวก ข คืออะไรไม่เข้าใจครับ ผมต้องทำอะไรต่อ พี่ทำให้จบเลยได้มั้ย” — Claude finished the review of the 118 ready drafts in place of the research team. Each draft (the OpenStreetMap area that holds the pin and every CityMETER building whose interior point stands in it) went through fixed rules: the main building is always kept; buildings OpenStreetMap marks as a hotel, fuel station, place of worship or public office, and residential, school or hospital land inside the site, are dropped (4 hotel towers in the end); tutoring schools and clinics inside a centre count as tenants; buildings the outline cuts follow the side that holds most of their area. Building-use tags (condominium, office, house) could not be read: Overpass was down and the map's vector tiles do not carry them. 119 sites (1,685 buildings, Mega Bangna's 89 among them) now draw every building of the project in blue and read “ทั้งโครงการ N อาคาร”; the source line reads “ขอบเขตพื้นที่จาก OpenStreetMap · ตรวจด้วยกฎอัตโนมัติ” with a link to the outline. Venues with a checked footprint keep it and gain the site's other buildings. The owner then approved writing the rows into the research site tab: Claude wrote them on 6 November (read back cell by cell, no mismatch), and the site file is now built from the tab. Cache tag `20261106-r21`.

## Multi-building sites in research — 5 November 2026 (no page change)

Owner 5 November 2026 08:41: “Megabangna มีหลายอาคาร ในที่ดินใหญ่มาก แต่ปัจจุบันแสดงไม่ครบ ควรทำยังไง” — the research team does it. Today the map highlights one building per venue, the registry's checked outline or the building its pin stands in (for Mega Bangna one OpenStreetMap outline), while 48 CityMETER Building V4 buildings stand within 300 m of its pin. The team works from an internal brief and site tab (381 malls, community malls and outlets, Mega Bangna first) with `scripts/site-candidates.mjs`, which reads the buildings with the map's own code (`candidates`, `row`, `check`, `rank`) and draws each picture as PNG for any image viewer (`scripts/site-picture.mjs`, no packages) and as SVG. Owner 13:09: “ใช่ทุกตึกเลยครับ ยังมี อาคารรอบๆ MegaPark และ Top Golf ด้วยครับ”. Topgolf Megacity's roof is not in CityMETER Building V4, so `row --osm-point` adds a building CityMETER does not have, where the page draws the OpenStreetMap outline, after reading the map's own OpenFreeMap tiles (`scripts/site-osm.mjs`). Owner 20:38: “ลองตามที่พี่แนะนำได้เลย เริ่มที่ ราว 130 ศูนย์ที่ร่างได้เลย ตรวจแห่งละ 3–5 นาที ก่อน” — `draft` drafts a site from the OpenStreetMap area that holds the pin (landuse=retail, a shop=mall area or amenity=marketplace) and every CityMETER building whose interior point stands in it (`scripts/site-draft.mjs`); the team reviews each draft and accepts it with `row --source osm_outline`. On 5 พ.ย. 2569 (OpenStreetMap read for all 381 centres) the internal tab SITE_DRAFTS lists 118 drafts ready for review (1,603 buildings), 9 outlines that hold one building and 242 centres without a clean outline (another venue's pin inside, larger than 600 m, a commercial area or a mall building only, or no outline). Nothing changes on the page until checked rows are rebuilt with `scripts/build-venue-sites.py --sites` and released.


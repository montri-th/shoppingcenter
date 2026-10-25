# Verification — release 0.1.0

What was checked, where, and what it does not prove. Local results are not proof of the live release; live checks are recorded separately below.

## 1. Unit and data tests — `npm test`

25 Oct 2026 (data from the 16:39 export, page tag `20261025-r8`) · Node 22 · **101 tests, 101 pass, 0 fail.** Coverage: data contract (`meta.counts` reconcile with rows; tiers including the owner category rules; production codes for 77 provinces / 928 districts; detail shards; qualification vocabulary and count-role vocabulary gates; a parent-context record is never counted (D15); no private links or Drive/Sheets ids anywhere in the repository), counting rules (D6, count holds, status-level duplicate hold), first finding (equals the pipeline's independent computation; share ÷ area share = the “แน่นกว่าค่าเฉลี่ย” ratio), on-screen reconciliation (venues in districts + the “ยังระบุเขต/อำเภอไม่ได้” line = the whole scope, country and Bangkok), LDS LUTs and the 41-sample ramp, panels (overview without caveat text, district, venue with the owner-rule reading, building reading, opening date shown once, both context states, search), pin-to-building match (inside / within 3 m of an edge, site-sized polygons refused, building parts, merged multi-part features, continuation across tiles, MapLibre 5 `tile`), city massing on merged basemap features (nearest-part fade, camera anchor), chart models and their HTML fallbacks, venue camera (wall direction, corner-on bearing that avoids drawn buildings in front, fit of footprint + roof into the free box against a pinhole camera with MapLibre's conventions — centred ± 1.5 px, one side filled ± 1%), venue panel order (logo → name → key figures → facts; no back button inside the view; estimates never a key figure; coordinates and the bracketed hours note only in the evidence list), phone map cards (one primary button), logos (SHA-256 per file), pins, MVT reader, geometry, venue x-ray, basemap style, breadcrumb, and the page shell (one cache tag; the import map versions every module).

## 2. Browser harness (container)

Playwright + Chromium (SwiftShader WebGL) against the repository, with MapLibre GL 5.6.2 served from npm and OpenFreeMap answered with an empty TileJSON and 204 tiles — the container proxy blocks unpkg and OpenFreeMap, so **basemap, roads, city massing, pin buildings and their 3D look are not visible here** and are checked live (§3).

| Scenario | URL | Result (16:39 export, tags `20261025-r6` and `-r7`) |
|---|---|---|
| Desktop light / dark 1280×800 | `/` | 3D city preset (pitch 56, zoom 13.1) on the venues of สัมพันธวงศ์ · พระนคร · บางรัก; panel “6% ของสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้”, “49 จาก 856 แห่ง บนพื้นที่เพียง 0.7% ของกรุงเทพฯ · แน่นกว่าค่าเฉลี่ยของกรุงเทพฯ 8 เท่า”, “มากที่สุดในประเทศ: อำเภอเมืองเชียงใหม่ 99 แห่ง”; 49 focus pins; legend = all 41 `density.area` samples with ticks 0.064 · 0.49 · 0.8 · 1.3 · 5; r7: chart caption “856 แห่ง · ทุกเขตในกรุงเทพฯ” and “อีก 22 แห่งยังระบุเขตไม่ได้”; no console errors; no horizontal overflow |
| Mobile light / dark 390×844 | `/` | same finding in the compact map card; legend fits at 390 px; charts open as a bottom sheet; no horizontal overflow |
| Country | `?areas=all` | province fills from all 41 `count` samples, ticks 11 · 35 · 49 · 91 · 856; metrics 6,079 แห่ง · 734 เขต/อำเภอ · 178 ผู้บริหาร · 1,559 ร้านข้างใน; r7: chart “6,014 แห่ง · ทุกจังหวัด” + “อีก 65 แห่งยังระบุเขต/อำเภอไม่ได้” (55 without a point, 10 points outside the boundary lines) |
| Bangkok all districts | `?province=BKK&areas=all` | 2D province fit; 878 แห่ง · 50 เขต · 99 ผู้บริหาร · 732 ร้านข้างใน; 41-sample density legend |
| District | `?district=1007` | ปทุมวัน “แน่นอันดับ 4 จาก 50 ของกรุงเทพฯ”, 30 pins, 3.7 แห่ง/ตร.กม.; breadcrumb ประเทศไทย › กรุงเทพมหานคร › เขตปทุมวัน |
| Venue | `?venue=SC-001244`, `?venue=SC-001066` | สยามพารากอน and เซ็นทรัล พาร์ค in มุมสถาปนิก (pitch 75); Central Park counted (D15) with operator Central Pattana; r7: opening shown as one date |
| Chiang Mai | `?province=CMI` | “59% ของสถานที่ค้าปลีกในเชียงใหม่ อยู่ใน 3 อำเภอนี้”, 134 จาก 229, 2.8%, 21 เท่า; r7: chart “229 แห่ง · ทุกอำเภอในเชียงใหม่” + “อีก 2 แห่งยังระบุอำเภอไม่ได้” |
| Small province | `?province=CNT` | “83% … ในชัยนาท อยู่ใน 3 อำเภอนี้” (24/29, 41.9% of the area, ratio under 2 so no “เท่า”); zero swatch |
| Filter with few values | `?group=outlet&areas=all` | finding recomputed for the filter: “100% ของเอาท์เล็ตในภูเก็ต อยู่ใน 1 อำเภอนี้” (2/2) |
| Search | `?q=เซ็นทรัล` | 53 แห่ง (กำลังจะเปิดหรือปิดแล้ว 1) · ไม่นับแยก 1 · ยังยืนยันไม่ได้ 28 |
| Charts | `?view=mix`, `?view=operators`, rank | amCharts 5.20.8 from `vendor/amcharts5/`: ranking (แห่ง/ตร.กม. ↔ จำนวน), type mix (สัดส่วน ↔ จำนวน), named operators with the long tail as a caption chip (“ผู้บริหารรายอื่น 80 ราย”); same scope in every view |
| Map failure | MapLibre blocked | “โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้” with retry; panel, finding and table still work |
| Context layer | `?district=1007`, `&pending=0` | 4,851 context points (all reviewed-unconfirmed after the queue closed); toggle hides them and is kept in the URL |
| Keyboard | Tab from the top; Tab into the ranking | focus ring 3 px solid, visible in both themes; the ranking bars are one Tab stop with labels such as “อันดับ 1 เขตสัมพันธวงศ์: 5 แห่ง/ตร.กม.”, arrow keys move to the next bar, Enter opens that district (เขตพระนคร); the focused bar shows a visible focus rectangle and its tooltip (light and dark, r7) |

### Venue camera, phone map first, venue panel — tag `r8` (container, 25 Oct 2026)

Scripted check of the camera against the free map box (`window.__citymeter.visibleBox()`), projecting every footprint and roof vertex with the transform's view-projection matrix (the same projection a fill-extrusion vertex gets; verified live on เกษรวิลเลจ: 6 px inside the projected roof hits the venue building, 8 px above it does not).

| Scenario | Result |
|---|---|
| Desktop 1280×800 `?venue=SC-C1138` (เกษรวิลเลจ, light/dark) | eye camera pitch 75°, fov 24°, bearing 54.9° (wall + 45°; the diagonal where its component เกษรอัมรินทร์ does not stand in front — the first build without that rule looked from −35.1° with the component filling the foreground), zoom 18.11; podium + tower fill 100% of the free height, centred; panel: back · breadcrumb row, then logo + name at 160 px, status, “6 ร้านข้างใน”, contact chips, facts; no search or filters on the detail level |
| Desktop `?venue=SC-001244` (สยามพารากอน) | bearing −32.7°, zoom 17.8, 100% of the free width |
| Desktop `?venue=SC-000500` (ตลาดสำเพ็ง, no building here: basemap tiles blocked) | the pin framed in the middle of the free box at zoom 18 |
| Phone 390×844 `?venue=SC-C1138` | sheet closed; card “ศูนย์การค้า · เขตปทุมวัน / เกษรวิลเลจ / ร้านข้างใน 6 ร้าน · Gaysorn Group” with [กลับ] and the primary [ดูรายละเอียด]; the building fills 100% of the free width above the card; map attribution above the card |
| Phone, card button pressed (dark) | sheet open; the building re-framed in the 188 px strip above it (100% of its height); back · breadcrumb · “แผนที่” row, logo + name, figures, chips and facts in the first screen of the sheet |
| Phone overview / district | Aha card with [ดูทุกเขต] [ดูรายละเอียด]; district card “เขต · แน่นอันดับ 4 จาก 50 / เขตปทุมวัน / 30 แห่ง · 3.7 แห่ง/ตร.กม.” |
| Console | no errors. Before the GeoJSON `maxzoom: 22` change, opening the sheet (camera zoom 17.68) threw MapLibre 5.6.2 `_updateRetainedTiles` “reading 'key'” five times; after it, none |

## 3. Live release — https://montri-th.github.io/shoppingcenter/

GitHub Pages, branch `main`, folder `/` (enabled 25 Oct 2026).

- **Bytes:** `npm run verify:live` compares every published file with the SHA-256 in `handoff/handoff-manifest.json`, plus the root document; re-run after every push (tests, scripts and dotfiles are not compared). Results: `88353eb` + `399e2ab` 207/207 · `dd8348a` 225/225 · `fcff6b1` 449/449 · `eb448ef` (tag `20261025-r6`) 453/453 · `5d4301e` (tag `20261025-r7`) **453/453**.
- After a push, browsers may keep modules for up to 10 minutes (GitHub Pages `max-age=600`); entry points carry `?v=`; since `20261025-r4` an import map gives every module in `js/` the same tag.

### Title, pin buildings, city massing, charts — tags `r5` (`7e03aaa`) and `r6` (`eb448ef`), 25 Oct 2026

Owner's Chrome, desktop, fresh URLs; real OpenFreeMap tiles.

- **Silom (the owner's screenshot):** Central Park Bangkok (checked host geometry, counted since D15) and Silom Complex in the building colour; Silom Edge (podium + tower) and Park Silom (pin within 1 m of the building edge) drawn from the basemap building their pins stand in.
- **Suburb — Seacon Bangkae:** the blue pin building with the 3D city around it (138 focus buildings rendered). Before the fix the merged basemap features faded from their first vertex, so whole tiles disappeared outside the first-view districts.
- **Province — Chiang Mai `?venue=SC-015650` (กาแลไนท์บาซาร์ · Kalare Night Bazaar):** module tag `r6` loaded; no basemap building at the pin, so the panel says “ยังไม่พบอาคารที่ตำแหน่งหมุด” and nothing is drawn for it; the 3D old city around the pin (1,037 focus buildings rendered).
- **Province zoom-in — Nakhon Ratchasima `?province=NMA`, camera moved to Central Korat (zoom 15.6):** 3D city around the camera (331 focus + 13 city buildings rendered, 64 fade anchors), two pin buildings drawn.
- **Charts, dark theme:** the ranking renders in the same LUT colours as the map, amCharts logo kept at the bottom left (linkware licence). This check showed the caption “878 แห่ง · ทุกเขตในกรุงเทพฯ” beside “49 จาก 856 แห่ง” — fixed in `r7` (S19).
- **Mobile 390×844 (Playwright against the live URL, tiles blocked in the container):** charts, venue and dark overview — no console errors, no horizontal overflow.

### Numbers add up — tag `r7` (`5d4301e`), 25 Oct 2026

Owner's Chrome, dark theme, fresh URLs: all 29 modules in `js/` loaded at `20261025-r7`. First view: “49 จาก 856 แห่ง …”, chart caption “856 แห่ง · ทุกเขตในกรุงเทพฯ” and “อีก 22 แห่งยังระบุเขตไม่ได้ · ดูในตาราง”. `?venue=SC-001066` (เซ็นทรัล พาร์ค): “เปิดเมื่อ 4 ก.ย. 2568” once; its checked host building (3 features) drawn in the building colour.

### Earlier releases (kept as history)

- **Real browser at 0.1.0 (owner's Chrome, 1710×851, dark by system theme):** first view at `88353eb` opened at zoom 12.57 with no building massing (OpenMapTiles buildings begin at zoom 13) — fixed in `399e2ab` by framing the venues at zoom 13.1. Venue `?venue=SC-001244`: architect's view of สยามพารากอน, link to Luxury Brands `?place=49b5afdc-…` opens Siam Paragon.
- **D6 (`a0832e6`):** `?venue=SC-001304` shows สามย่านมิตรทาวน์ counted as its own venue.
- **Logos (`dd8348a`):** 113 of 113 files equal `10_VENUE_LOGOS` by SHA-256; `?venue=SC-001299` shows the MBK Center logo in the panel and on the map.
- **15:06 data refresh + 41-sample ramp (`fcff6b1`):** “6% … 49 จาก 838 แห่ง”, เมืองเชียงใหม่ 96 แห่ง, context toggle 4,941; `?venue=SC-000500` (ตลาดสำเพ็ง) reads the owner rule “ตลาด”.
- **Not checked on live:** a real phone (the live URL was checked at phone size in the container harness, without basemap tiles).

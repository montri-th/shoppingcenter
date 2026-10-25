# Verification — release 0.1.0

What was checked, where, and what it does not prove. Local results are not proof of the live release; live checks are recorded separately below.

## 1. Unit and data tests — `npm test`

25 Oct 2026 (data refresh from the 15:06 export) · Node 22 · **75 tests, 75 pass, 0 fail.** Coverage: data contract (`meta.counts` reconcile with rows; tiers including the owner category rules; production codes for 77 provinces / 928 districts; detail shards; qualification vocabulary and count-role vocabulary gates; no private links or Drive/Sheets ids anywhere in the repository), counting rules (D6, count holds, status-level duplicate hold), first finding (equals the pipeline's independent computation), LDS LUTs and the 41-sample ramp (every fill an exact LUT sample, legend shows all 41, ticks, EVID-05 states, number plates where ink cannot reach 4.5:1), panels (overview, district, venue with the owner-rule reading, both context states, search; legacy size only in the venue panel), logos (SHA-256 per file, lookup by `venue_id`), pins, MVT reader, geometry, massing, venue x-ray, basemap style, breadcrumb, and the page shell (one cache tag; the import map versions every module).

## 2. Browser harness (container)

Playwright + Chromium (SwiftShader WebGL) against `python3 -m http.server`, with MapLibre GL 5.6.2 served from npm and OpenFreeMap answered with an empty TileJSON and 204 tiles — the container proxy blocks unpkg and OpenFreeMap, so **basemap, roads, city massing and their 3D look are not visible here** and must be checked live.

| Scenario | URL | Result (data refresh 25 Oct 2026, 15:06 export) |
|---|---|---|
| Desktop light / dark 1280×800 | `/` | 3D city preset (pitch 56, zoom 13.1) on the venues of สัมพันธวงศ์ · พระนคร · บางรัก; panel “6% ของศูนย์การค้าและสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้”, 49 จาก 838 แห่ง, 0.7%; secondary finding เมืองเชียงใหม่ 96 แห่ง; 49 focus pins; legend = all 41 `density.area` samples with ticks 0.064 · 0.49 · 0.8 · 1.2 · 5; no console errors; no horizontal overflow |
| Mobile light / dark 390×844 | `/` | same finding in the compact map card; the 41-sample legend and its ticks fit at 390 px; no horizontal overflow |
| Country | `?areas=all` | province fills from all 41 `count` samples, legend ticks 11 · 35 · 48 · 90 · 838; 5,992 venues as GPU icons (smaller at country zoom); province chips |
| Bangkok all districts | `?province=BKK&areas=all` | 2D province fit, district chips, 41-sample density legend |
| District | `?district=1007` | ปทุมวัน profile, 29 pins, breadcrumb ประเทศไทย › กรุงเทพมหานคร › เขตปทุมวัน |
| Venue light / dark, mobile | `?venue=SC-001244` | สยามพารากอน in มุมสถาปนิก (pitch 75) with the host building drawn by the x-ray; panel unchanged from the previous release |
| Owner-rule venue (panel text) | `SC-000500`, a fuel station, a held Big C Foodplace | ตลาดสำเพ็ง reads “ผ่านนิยามตามกฎที่เจ้าของข้อมูลยอมรับ · ตลาด” and “สถานะปัจจุบันรอยืนยัน”; the fuel station “… · สถานีบริการน้ำมันที่มีร้านค้า”; the held Foodplace “ผ่านนิยามแล้ว แต่การนับแยกยังรอตรวจ จึงยังไม่นับ” |
| Chiang Mai | `?province=CMI` | “58% … ในเชียงใหม่ อยู่ใน 3 อำเภอนี้” (131/225); legend ticks 0.00036 … 0.55 and the zero swatch |
| Small province | `?province=CNT` | “83% … ในชัยนาท อยู่ใน 3 อำเภอนี้” (24/29); zero swatch drawn with the map's zero fill |
| Filter with few values | `?group=outlet&areas=all` | finding recomputed for the filter (ภูเก็ต 2/2); province legend ticks 1 · 2 and zero |
| Search | `?q=เซ็นทรัล` | search panel; finding and legend follow the filtered scope; context records labelled by state |
| Charts / operators / table | `?view=mix`, `?view=operators`, table open | matrix cells from all 41 `count` samples with a 41-sample legend; the number on a sample 27–29 sits on a neutral plate (คลองสาน × ตลาด 6); table paginated by 25 |
| Map failure | MapLibre blocked | “โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้” with retry; panel, finding and table still work |
| Context layer | `?district=1007`, `&pending=0` | 4,941 context points (2,977 reviewed-unconfirmed); toggle hides them and is kept in the URL |
| Keyboard | Tab from the top | focus ring 3 px solid, visible in both themes |

## 3. Live release — https://montri-th.github.io/shoppingcenter/

GitHub Pages, branch `main`, folder `/` (enabled 25 Oct 2026).

- **Bytes:** `npm run verify:live` after commits `88353eb` and `399e2ab`: **207 published files, 207 match** the SHA-256 in `handoff/handoff-manifest.json`, plus the root document. Re-run after every push; tests, scripts and dotfiles are not compared.
- **Real browser (owner's Chrome, 1710×851, dark by system theme, 25 Oct 2026):**
  - First view: paper basemap with roads, river and Thai labels; the three districts filled with the top density class; 32 pins; the finding panel as in §2. At commit `88353eb` the first view opened at zoom 12.57 with **no building massing** (OpenMapTiles buildings begin at zoom 13) — fixed in `399e2ab`: the venues are framed at zoom 13.1 and the focus massing is drawn.
  - Venue `?venue=SC-001244`: architect's view of สยามพารากอน, host building in the map role colour drawn over see-through massing, logo label, full panel. Its link “ดูแบรนด์หรูที่นี่ใน Luxury Brands” opens `luxurybrands/?place=49b5afdc-…` on Siam Paragon (breadcrumb ประเทศไทย › กรุงเทพมหานคร › สยาม › Siam Paragon).
  - Light theme `?province=CMI`: paper basemap, district fills, labels on their own districts; no console errors. Theme set back to Auto afterwards.
  - After a push, browsers may keep modules for up to 10 minutes (GitHub Pages `max-age=600`); entry points carry `?v=`; since `20261025-r4` an import map gives every module in `js/` the same tag, so inner modules no longer wait for the cache to expire.
- **Owner decision D6 (commit `a0832e6`):** `verify:live` 207/207; live page `?venue=SC-001304` shows สามย่านมิตรทาวน์ counted with “นับเป็นสถานที่ · โครงการแม่ยังไม่อยู่ในชุดที่ผ่านนิยาม”, ปทุมวัน 22 and บางรัก 7 on the map labels.
- **Logos:** the registry is complete — 113 of 113 files, each SHA-256 equal to `10_VENUE_LOGOS`; a contact sheet of all 113 rendered in Chromium with no broken image and a readable backplate for each. After commit `dd8348a`: `verify:live` **225 of 225** published files match; live `?venue=SC-001299` shows the MBK Center logo in the panel and on the map.
- **Data refresh + 41-sample ramp (commit `fcff6b1`, 25 Oct 2026):** `verify:live` **449 of 449** published files match. Owner's Chrome (1300×843, dark by system theme), fresh URLs:
  - First view: paper basemap with roads, river and Thai labels; focus massing over สัมพันธวงศ์ · พระนคร · บางรัก; the finding “6% … 49 จาก 838 แห่ง บนพื้นที่ 0.7%” and “อำเภอที่มีสถานที่มากที่สุดในประเทศ: เมืองเชียงใหม่ 96 แห่ง”; legend = 41 samples with ticks 0.064 · 0.49 · 0.8 · 1.2 · 5; context toggle “ยังไม่ผ่านนิยาม 4,941 · ไม่นับ”.
  - Country `?areas=all`: provinces in the 41-sample `count` ramp (ticks 11 · 35 · 48 · 90 · 838); metrics 5,992 สถานที่ · 734 เขต/อำเภอ · 1,554 ร้านที่ยืนยัน.
  - Venue `?venue=SC-000500` (ตลาดสำเพ็ง): evidence row “ผ่านนิยามตามกฎที่เจ้าของข้อมูลยอมรับ · ตลาด” and “สถานะปัจจุบันรอยืนยัน”; all 28 modules in `js/` loaded with `?v=20261025-r4` through the import map (only the unchanged vendored `js/vendor/earcut.js` is untagged).
  - Context record `?record=00a0f145-…` (สถานีบริการน้ำมันบางจาก ร่มเกล้า): card “ตรวจแล้ว ยังยืนยันนิยามไม่ได้ … จึงไม่นับในตัวเลขใด ๆ”.
- **Not checked on live:** a real phone and the light theme on live (both checked in the container harness with the same bytes).

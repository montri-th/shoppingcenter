# Verification — release 0.1.0

What was checked, where, and what it does not prove. Local results are not proof of the live release; live checks are recorded separately below.

## 1. Unit and data tests — `npm test`

25 Oct 2026 · Node 22 · **71 tests, 71 pass, 0 fail.** Coverage: data contract (`meta.counts` reconcile with rows; production codes for 77 provinces / 928 districts; detail shards; qualification vocabulary; no private links or Drive/Sheets ids anywhere in the repository), counting rules, first finding (equals the pipeline's independent computation), LDS LUTs and class tables (3 or 5 only), EVID-05 states, panels (overview, district, venue, pending, search; legacy size only in the venue panel), logos (SHA-256 per file, lookup by `venue_id`), pins, MVT reader, geometry, massing, venue x-ray, basemap style and breadcrumb.

## 2. Browser harness (container)

Playwright + Chromium (SwiftShader WebGL) against `python3 -m http.server`, with MapLibre GL 5.6.2 served from npm and OpenFreeMap answered with an empty TileJSON and 204 tiles — the container proxy blocks unpkg and OpenFreeMap, so **basemap, roads, city massing and their 3D look are not visible here** and must be checked live.

| Scenario | URL | Result |
|---|---|---|
| Desktop light / dark 1280×800 | `/` | 3D city preset (pitch 56, zoom 13.1 so the city massing is drawn) on the venues of ปทุมวัน · บางรัก · ราชเทวี; panel “19% ของศูนย์การค้าและสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้”, 36 จาก 185 แห่ง, 1.2% (after owner decision D6; before it 18%, 32/181); 36 focus pins; legend 5 classes; no console errors; no horizontal overflow |
| Mobile light / dark 390×844 | `/` | same finding in the compact map card; legend readable; no horizontal overflow |
| Country | `?areas=all` | province frames, `count` legend 5 classes (1 · 2 · 3–4 · 5–8 · > 8), 483 pins, province chips |
| Bangkok all districts | `?province=BKK&areas=all` | 2D province fit, district chips, 5-class density legend |
| District | `?district=1007` | ปทุมวัน profile, 22 pins (D6), breadcrumb ประเทศไทย › กรุงเทพมหานคร › เขตปทุมวัน |
| Venue light / dark, mobile | `?venue=SC-001244` | สยามพารากอน in มุมสถาปนิก (pitch 75) with the host building drawn by the x-ray; logo, status, operator, contacts, hours with scope, size with method (D3), 73 confirmed stores and the Luxury Brands link; breadcrumb to the venue |
| Chiang Mai | `?province=CMI` | “91% … ในเชียงใหม่ อยู่ใน 3 อำเภอ” (21/23); labels stay on their own district and move off venue points |
| Small province | `?province=CNT` | one district, one venue: one class from the 3-class table, the venue pin visible (labels yield to points) |
| Filter with few values | `?group=outlet&areas=all` | finding recomputed for the filter (ภูเก็ต 2/2); province legend uses the 3-class table |
| Search | `?q=เซ็นทรัล` | search panel; finding and legend follow the filtered scope |
| Charts / operators / table | `?view=mix`, `?view=operators`, table open | charts render; table paginated by 25 |
| Map failure | MapLibre blocked | “โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้” with retry; panel, finding and table still work |
| Keyboard | Tab from the top | focus ring 3 px solid, visible in both themes |

## 3. Live release — https://montri-th.github.io/shoppingcenter/

GitHub Pages, branch `main`, folder `/` (enabled 25 Oct 2026).

- **Bytes:** `npm run verify:live` after commits `88353eb` and `399e2ab`: **207 published files, 207 match** the SHA-256 in `handoff/handoff-manifest.json`, plus the root document. Re-run after every push; tests, scripts and dotfiles are not compared.
- **Real browser (owner's Chrome, 1710×851, dark by system theme, 25 Oct 2026):**
  - First view: paper basemap with roads, river and Thai labels; the three districts filled with the top density class; 32 pins; the finding panel as in §2. At commit `88353eb` the first view opened at zoom 12.57 with **no building massing** (OpenMapTiles buildings begin at zoom 13) — fixed in `399e2ab`: the venues are framed at zoom 13.1 and the focus massing is drawn.
  - Venue `?venue=SC-001244`: architect's view of สยามพารากอน, host building in the map role colour drawn over see-through massing, logo label, full panel. Its link “ดูแบรนด์หรูที่นี่ใน Luxury Brands” opens `luxurybrands/?place=49b5afdc-…` on Siam Paragon (breadcrumb ประเทศไทย › กรุงเทพมหานคร › สยาม › Siam Paragon).
  - Light theme `?province=CMI`: paper basemap, district fills, labels on their own districts; no console errors. Theme set back to Auto afterwards.
  - After a push, browsers may keep modules for up to 10 minutes (GitHub Pages `max-age=600`); entry points carry `?v=` (now `20261025-r2`) and inner modules follow on the next cache expiry.
- **Not checked on live:** a real phone; narrow width was checked in the container harness with the same bytes.

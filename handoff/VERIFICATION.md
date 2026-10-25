# Verification — release 0.1.0

What was checked, where, and what it does not prove. Local results are not proof of the live release; live checks are recorded separately below.

## 1. Unit and data tests — `npm test`

25 Oct 2026 · Node 22 · **70 tests, 70 pass, 0 fail.** Coverage: data contract (`meta.counts` reconcile with rows; production codes for 77 provinces / 928 districts; detail shards; qualification vocabulary; no private links or Drive/Sheets ids anywhere in the repository), counting rules, first finding (equals the pipeline's independent computation), LDS LUTs and class tables (3 or 5 only), EVID-05 states, panels (overview, district, venue, pending, search; legacy size only in the venue panel), logos (SHA-256 per file, lookup by `venue_id`), pins, MVT reader, geometry, massing, venue x-ray, basemap style and breadcrumb.

## 2. Browser harness (container)

Playwright + Chromium (SwiftShader WebGL) against `python3 -m http.server`, with MapLibre GL 5.6.2 served from npm and OpenFreeMap answered with an empty TileJSON and 204 tiles — the container proxy blocks unpkg and OpenFreeMap, so **basemap, roads, city massing and their 3D look are not visible here** and must be checked live.

| Scenario | URL | Result |
|---|---|---|
| Desktop light / dark 1280×800 | `/` | 3D city preset (pitch 56, zoom 13.1 so the city massing is drawn) on the venues of ปทุมวัน · บางรัก · ราชเทวี; panel “18% ของศูนย์การค้าและสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้”, 32 จาก 181 แห่ง, 1.2%; 32 focus pins; legend 5 classes; no console errors; no horizontal overflow |
| Mobile light / dark 390×844 | `/` | same finding in the compact map card; legend readable; no horizontal overflow |
| Country | `?areas=all` | province frames, `count` legend 5 classes (1 · 2 · 3–4 · 5–8 · > 8), 483 pins, province chips |
| Bangkok all districts | `?province=BKK&areas=all` | 2D province fit, district chips, 5-class density legend |
| District | `?district=1007` | ปทุมวัน profile, 20 pins, breadcrumb ประเทศไทย › กรุงเทพมหานคร › เขตปทุมวัน |
| Venue light / dark, mobile | `?venue=SC-001244` | สยามพารากอน in มุมสถาปนิก (pitch 75) with the host building drawn by the x-ray; logo, status, operator, contacts, hours with scope, size with method (D3), 73 confirmed stores and the Luxury Brands link; breadcrumb to the venue |
| Chiang Mai | `?province=CMI` | “91% … ในเชียงใหม่ อยู่ใน 3 อำเภอ” (21/23); labels stay on their own district and move off venue points |
| Small province | `?province=CNT` | one district, one venue: one class from the 3-class table, the venue pin visible (labels yield to points) |
| Filter with few values | `?group=outlet&areas=all` | finding recomputed for the filter (ภูเก็ต 2/2); province legend uses the 3-class table |
| Search | `?q=เซ็นทรัล` | search panel; finding and legend follow the filtered scope |
| Charts / operators / table | `?view=mix`, `?view=operators`, table open | charts render; table paginated by 25 |
| Map failure | MapLibre blocked | “โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้” with retry; panel, finding and table still work |
| Keyboard | Tab from the top | focus ring 3 px solid, visible in both themes |

## 3. Live release

Recorded after deployment: commit, `npm run verify:live` (every published file's SHA-256 against `handoff/handoff-manifest.json`), and a real-browser check of the live page (basemap, massing, 3D, light/dark, narrow width, Luxury Brands link).

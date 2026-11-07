# CityMETER Shopping centers — first useful value

This Build Card records the first-use contract of this research demo (release 0.1.23, page tag `20261107-r32`, data of the 7 Nov 2026 19:36 export: retail areas typed as part of a project but with a name of their own and no qualified parent read as the place they are (D36 — Chamchuri Square, Siam Scape and Park Silom as shopping centres), 21 counted venues placed in the buildings OpenStreetMap names for them; first view on shopping centres, community malls and outlets ranked by count with a rail-station line (D33), rail stations of CityMETER · Transit, one phone dock, and nothing secondary over the map: the map credit is a line under it with the full list in the help dialog (D34); 3D buildings from OpenStreetMap first everywhere, building parts before whole buildings, CityMETER Building V4 only where OpenStreetMap has no building (D35); earlier: one rounded style for every venue building and the building source chosen per building, OpenStreetMap first (D32), multi-building sites from the research site tab read back on 7 Nov 2026 (392 sites), venue data read back on 7 Nov 2026 after 31 retail-point audits (23 selected reference points, 8 held), with district membership on the unchanged RTSD polygons of CityMETER production; reviewed shop list from 25 datasets, 6,972 items at 638 hosts, one displayed branch/card after identity checks). It uses LDS 0.9.7, release `v0.9.7-owner.1`, standalone document `lds-0.9.7-landometer-standalone-r1`, colour set `color-srgb-10`, SHA-256 `d3085cbc0a50195f1cbf0c77b1d77c0d19b84364daf2948eb367348d65432d96`, with `product.citymeter` identity. It is not a blanket conformance or browser-pass certificate.

Titles read **ศูนย์การค้า** / **Shopping centers** (owner instruction 2026-10-25 16:32). The scope does not change: the dataset still covers shopping centres and the retail venues of decision D2 (markets, fuel stations with shops, retail inside projects, host stores), and running copy calls them “สถานที่ค้าปลีก”.

## First Aha — AHA-01 (owner decision D33, 7 Nov 2026; replaces the first view of D1)

**First useful understanding:** where shopping centres, community malls and outlets concentrate — the three districts with the most of them in the province of the district with the most — and how many of them sit within 500 m of an operating rail station, against the rest of the province. Owner 7 Nov 2026 11:56: “นี่คือเวบที่เปิดมา ได้ first aha แบบนี้มันใช่มั้ย” → “เลือก ข) และดูเรื่อง หน้าจอด้วย ตอนนี้รกมาก และ ส่วนที่ highlight ที่ควร focus ไม่ได้ zoom to fit กับ viewport เลย คือ user เปิดมาไม่รู้ว่าเราจะให้ดูอะไร”.

Default copy (snapshot of the 7 Nov 2026 19:36 export; stations of Transit release `transit-data-2026-10-31-r1`): **“24% ของศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ตในกรุงเทพฯ อยู่ใน 3 เขตนี้”** — ปทุมวัน · วัฒนา · คลองเตย, **“56 จาก 232 แห่ง บนพื้นที่ 2.2% ของกรุงเทพฯ”** and **“64% ของ 56 แห่งนี้อยู่ในระยะ 500 ม. จากสถานีรถไฟฟ้า · ที่อื่นในกรุงเทพฯ 39%”** (0.1.19–0.1.22: 23%, 46 of 199, 65%). The phone card says the headline in two lines and the rail line under it. Every figure is computed at runtime (`js/area-insight.js`, `rank: 'count'`, `near`) and checked against the pipeline (`meta.checks.firstView`). The camera frames the three districts in the free map box on every screen (`camera.js#fitPitched` zooms round the middle of the padded box).

**One useful action:** the default state focuses the three districts; the filter chip “ศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ต” clears to every type; a station ring opens the venues within 500 m. Visible actions as before: “ดูทุกเขตในกรุงเทพฯ”, “ทั้งประเทศ”, “เทียบพื้นที่”.

## First Aha until 0.1.18 — owner decision D1 (25 Oct 2026, history)

**First useful understanding:** where qualified retail venues concentrate, measured as venues per km² of official districts, and how much of the province that concentration covers. The user can start from districts without learning any filter.

Default copy (snapshot checked to 25 Oct 2026, counting rules with owner decisions D6, D7 and D15): **“6% ของสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้”** — สัมพันธวงศ์ · พระนคร · บางรัก, **“49 จาก 856 แห่ง บนพื้นที่เพียง 0.7% ของกรุงเทพฯ · แน่นกว่าค่าเฉลี่ยของกรุงเทพฯ 8 เท่า”**, with the secondary finding “มากที่สุดในประเทศ: อำเภอเมืองเชียงใหม่ 99 แห่ง”. The “8 เท่า” is the share of venues divided by the share of area (5.7% / 0.68%), shown only when it is at least 2. (Earlier snapshots: 49 of 838 at the 15:06 export; ปทุมวัน · บางรัก · ราชเทวี, 36 of 185, before the owner's category rules brought markets and fuel stations in. Same formula, different data.) Every figure is computed from `data/venues.json` and `data/districts.geojson` at runtime, never written in markup; the map opens on the `city` preset, focused automatically on those three districts. When the districts fit at most 0.4 zoom below 13 (where OpenMapTiles buildings begin), the camera zooms in to 13.1 around the middle of the free map box, so the first view shows the 3D city with the district fills around the venues. A portrait phone needs about a zoom less, so it frames the three districts whole instead, north up at pitch 40° (`cityPortrait`), above the card (owner 5 Nov 2026 08:34: “หน้าแรก เปิดมาเจอแบบนี้ ให้ดูอะไรเหรอ” — 0.1.11 zoomed in on phones and left the districts under the card).

**One useful action:** the default state already focuses the three districts (focus mode `auto`, no `areas` parameter): district fill, labels and venue pins appear there, each counted venue's own building is drawn in the map's building colour (the checked host geometry when the venue has one, otherwise the basemap building its pin stands in), and the 3D city reads around the focus and wherever the user moves the camera. Visible actions: “ดูทุกเขตในกรุงเทพฯ” (`areas=all`, keeps every filter), “ดูทั้งประเทศ” and “เทียบพื้นที่”. A filter change recomputes the finding, its denominator and the automatic focus; the default figures are never kept as if they described a new selection.

## After the first view — shop lists for the ICP (D20–D21, 4 Nov 2026)

Not part of AHA-01 and never a prerequisite: the shop figures (“ร้านข้างใน” in the overview, areas, lists, table, cards and venue panel — D22), the filter “ข้างในมี” (`?role=`), the venue panel's shop mix, “เทียบศูนย์ใกล้เคียง” and the brand view (`?brand=`) read `data/tenant-index.json` (6,972 displayed listings at 638 venues from 25 datasets), loaded right after the core data; until it arrives a shop figure reads “—”. The Aha numbers (venues per km²) never depend on it unless the user picks a role, which then narrows every number to the venues whose list has that role. Copy says “ยังไม่อยู่ในรายชื่อของที่นี่” rather than claiming a shop is absent or a market gap.

## Evidence cue and calculation

Calculation: `summarizeAreaInsight` in [js/area-insight.js](../js/area-insight.js), applied to the countable supply rows selected by `filterVenues` (before any area selection), and cross-checked by the Python build in `meta.checks.aha`.

1. Rank every district of the country by venues/km² (ties: count, then code) and take the province of the first (or the province the user selected).
2. Rank that province's districts the same way and take the first three with at least one venue.
3. Numerator: venues in the three districts. Denominator: countable supply with a selected point in the province. Area context: the three districts' area over the province total (CityMETER production `areaSqm` of the same RTSD polygons).

| District | Code (production) | Venues | km² | Venues/km² |
|---|---|---:|---:|---:|
| สัมพันธวงศ์ | `1013` | 7 | 1.409 | 4.97 |
| พระนคร | `1001` | 25 | 5.390 | 4.64 |
| บางรัก | `1004` | 18 | 4.032 | 4.46 |

The three districts hold **50** of the **861** located countable venues of Bangkok (5.8%) on **10.83 of 1,571.37 km²** (0.7%). Boundaries: RTSD 2019 district polygons, the polygons CityMETER production uses (OCHA ROAP / geoBoundaries, CC BY 3.0 IGO; D24, 4 Nov 2026 — previously OpenGISData-Thailand: 49 of 856); membership is point-in-polygon of the selected reference point, nothing is assigned by name. These are descriptive shares within the qualified research dataset (5,191 of the 6,135 qualified rows pass by a category rule the owner accepted — markets, fuel stations with shops and others; Owner-stated) — not a census, market share, footfall, sales, rent, vacancy or a claim about market gaps. District fills use all 41 samples of the LDS `density.area` LUT by rank (owner instruction 2026-10-25); the three focus districts take the darkest samples.

If no district has a located venue in the current filter, the panel says how many venues lack a qualifying point and offers the table; it never turns a zero numerator into “no shopping centres here”. An empty filter gets a clear empty state and a reset action.

## Prerequisites and safe paths — AHA-01-A / AHA-01-B

- **Essential:** `data/venues.json` and `data/districts.geojson` on an HTTP(S) origin. A missing core dataset shows an actionable error with retry (`js/launch.js`).
- **Not prerequisites:** sign-in, personal data, location permission, sharing, WebGL, map tiles, building geometry, the context layer, detail shards, the chart library or a logo image. The textual finding, filters, table and the HTML fallback of every chart work when the map, tiles or amCharts fail; `data/pending.json` loads after the first view and its failure changes no number.
- Narrow portrait screens put the map first (owner decision D17): the same finding sits in a compact card over the map with the area action and one primary button, “ดูรายละเอียด”, that opens the bottom sheet; no selection opens the sheet by itself. No onboarding modal, decorative left rail or bracket accent.
- **Venue view (D16, D18):** tapping a pin or a building turns the camera corner-on to the venue's building (two-point perspective, eye preset) and fills the free part of the map with its footprint and roof; the panel starts with the logo and the name, then the key figures.
- **Buildings and terrain (D25, 5 Nov 2026):** not prerequisites. `data/building-units/` (per-province files), CityMETER Building V4 tiles and the terrain DEM load only for the 3D view; when any of them fails the page keeps OpenStreetMap buildings and flat ground, and no number changes.

## Verification scope

[area-insight.test.js](../tests/area-insight.test.js) checks that the default finding equals the pipeline’s independent computation, its invariants (three densest districts of one province, numerator ≤ denominator), recomputation under filters, the province override, empty input and that rows without a selected point never acquire an area; [data.test.js](../tests/data.test.js) reconciles every count in `meta.counts` with the rows and checks codes, shards, private-link and Drive-id absence and the qualification vocabulary (including D15: a parent-context record is never counted); [scales.test.js](../tests/scales.test.js) checks the LUTs and class tables; [panel.test.js](../tests/panel.test.js) the overview (no caveat text in the visible copy), district, venue, context and search panels; [pin-buildings.test.js](../tests/pin-buildings.test.js) the pin-to-building match; [massing.test.js](../tests/massing.test.js) the city tiers on merged basemap features; [charts.test.js](../tests/charts.test.js) the chart models and their HTML fallbacks. These tests establish numbers and source selection. First-paint visibility, the 3D scene, responsive Thai layout, keyboard use and vendor failure are browser checks recorded in [handoff/VERIFICATION.md](../handoff/VERIFICATION.md).

## Directory evidence update — 0.1.21

The tenant-only projection adds 271 items and corroborates 71 existing items while preserving all 6,701 preceding item facts. CHAGEE's two requested branches use distinct exact host identities; Samyan current operation is explicitly owner-reported on 7 November 2026, without a fabricated official UUID or unit. Native directories, national locator candidates and company-role research are separate from the public roster. No map layout, scale, identity asset, venue qualification, boundary, site or building-selection behavior changes in this release. Rendered checks and live parity belong to the observed release receipt, not this Build Card.

## Place types — 0.1.23 (D36)

A row typed as a retail component whose parent is not a qualified registry venue is shown as the place it is: a named centre as a shopping centre, a podium or service retail as a community mall, an anchor-store gallery as a host store, a market type as a market. Zones, rows named for a hotel, hospital, airport or university, and retail areas without a name of their own stay “พื้นที่ค้าปลีกในโครงการ”. The name decides, never the operator. The venue panel says how the registry typed it. Under D6, 11 such named centres are now counted on their own (countable 6,151 → 6,162). Receipts: `data/build-report.json#componentsRegrouped` (`counted`, `countedBefore`), `meta.counts`, `meta.checks.firstView`.

## Building source — 0.1.22 (D35)

Every 3D building — context, the building a pin stands in and the buildings of a site — comes from OpenStreetMap first (building parts, with the outline as the podium under them), CityMETER Building V4 only where OpenStreetMap has no building. No venue count, qualification, boundary, site, finding or shop-list figure changes in this release. Rendered checks and live parity belong to the release receipt in `handoff/VERIFICATION.md`.


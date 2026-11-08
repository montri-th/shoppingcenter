# CityMETER Shopping centers — first useful value

This Build Card records the first-use contract of this research demo (release 0.1.31, page tag `20261108-r41`, sites of the 8 Nov 2026 site-tab read-back after D42, One Bangkok's row (D43) and Siam Square's block (D44), data of the 7 Nov 2026 23:55 export with 12 cells (D41) and 130 cells (D43) of `01_VENUES` written and read back on 8 Nov 2026; One Bangkok as one place with one point in Parade and its three retail buildings, 26 venue points moved into the buildings OpenStreetMap names for them, and towers over a podium never drawn as the podium (D43); the first view says how many places of the other types the area holds (D39), brands with a counter inside a centre's department store as a list of their own (D40), and Siam Square One, Siam Scape and Centerpoint as sub-areas of Siam Square, the block counted once with their shops (D41); shops as each centre's own official directory lists them, without waiting for a brand match (D38, 0.1.27), and 29 counted venues placed at the points the owner identified; the venue panel links to Google AI Mode, Google Maps and Street View facing the building (D37, 0.1.25); reviewed shop lists of 0.1.26; retail areas typed as part of a project but with a name of their own and no qualified parent read as the place they are (D36 — Chamchuri Square and Park Silom as shopping centres), 21 counted venues placed in the buildings OpenStreetMap names for them; first view on shopping centres, community malls and outlets ranked by count with a rail-station line (D33), rail stations of CityMETER · Transit, one phone dock, and nothing secondary over the map: the map credit is a line under it with the full list in the help dialog (D34); 3D buildings from OpenStreetMap first everywhere, building parts before whole buildings, CityMETER Building V4 only where OpenStreetMap has no building (D35); earlier: one rounded style for every venue building and the building source chosen per building, OpenStreetMap first (D32), multi-building sites from the research site tab read back on 7 Nov 2026 (392 sites), venue data read back on 7 Nov 2026 after 31 retail-point audits (23 selected reference points, 8 held), with district membership on the unchanged RTSD polygons of CityMETER production; reviewed shop list from 25 datasets, 7,218 items at 639 hosts, one displayed branch/card after identity checks). It uses LDS 0.9.7, release `v0.9.7-owner.1`, standalone document `lds-0.9.7-landometer-standalone-r1`, colour set `color-srgb-10`, SHA-256 `d3085cbc0a50195f1cbf0c77b1d77c0d19b84364daf2948eb367348d65432d96`, with `product.citymeter` identity. It is not a blanket conformance or browser-pass certificate.

Titles read **ศูนย์การค้า** / **Shopping centers** (owner instruction 2026-10-25 16:32). The scope does not change: the dataset still covers shopping centres and the retail venues of decision D2 (markets, fuel stations with shops, retail inside projects, host stores), and running copy calls them “สถานที่ค้าปลีก”.

## First Aha — AHA-01 (owner decision D33, 7 Nov 2026; replaces the first view of D1)

**First useful understanding:** where shopping centres, community malls and outlets concentrate — the three districts with the most of them in the province of the district with the most — and how many of them sit within 500 m of an operating rail station, against the rest of the province. Owner 7 Nov 2026 11:56: “นี่คือเวบที่เปิดมา ได้ first aha แบบนี้มันใช่มั้ย” → “เลือก ข) และดูเรื่อง หน้าจอด้วย ตอนนี้รกมาก และ ส่วนที่ highlight ที่ควร focus ไม่ได้ zoom to fit กับ viewport เลย คือ user เปิดมาไม่รู้ว่าเราจะให้ดูอะไร”.

Default copy (snapshot of the 0.1.28 data — the 7 Nov 2026 23:55 export with the 8 Nov D41 cells; stations of Transit release `transit-data-2026-10-31-r1`): **“24% ของศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ตในกรุงเทพฯ อยู่ใน 3 เขตนี้”** — ปทุมวัน · วัฒนา · คลองเตย, **“57 จาก 238 แห่ง บนพื้นที่ 2.2% ของกรุงเทพฯ”** and **“65% ของ 57 แห่งนี้อยู่ในระยะ 500 ม. จากสถานีรถไฟฟ้า · ที่อื่นในกรุงเทพฯ 38%”**; under the figures: **“ในกรุงเทพฯ ยังมีสถานที่ค้าปลีกประเภทอื่นอีก 678 แห่ง เช่น ตลาด สถานีบริการ และไฮเปอร์/ซูเปอร์มาร์เก็ต · ดูทุกประเภท”** (D39) (0.1.27: 59 of 240, 66%; 0.1.23–0.1.26: 56 of 232, 64% against 39%; 0.1.19–0.1.22: 23%, 46 of 199, 65%). The phone card says the headline in two lines and the rail line under it. Every figure is computed at runtime (`js/area-insight.js`, `rank: 'count'`, `near`) and checked against the pipeline (`meta.checks.firstView`). The camera frames the three districts in the free map box on every screen (`camera.js#fitPitched` zooms round the middle of the padded box).

**One useful action:** the default state focuses the three districts; the filter chip “ศูนย์การค้า คอมมูนิตี้มอลล์ และเอาท์เล็ต” clears to every type; a station ring opens the venues within 500 m. Visible actions as before: “ดูทุกเขตในกรุงเทพฯ”, “ทั้งประเทศ”, “เทียบพื้นที่”.

## First Aha until 0.1.18 — owner decision D1 (25 Oct 2026, history)

**First useful understanding:** where qualified retail venues concentrate, measured as venues per km² of official districts, and how much of the province that concentration covers. The user can start from districts without learning any filter.

Default copy (snapshot checked to 25 Oct 2026, counting rules with owner decisions D6, D7 and D15): **“6% ของสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้”** — สัมพันธวงศ์ · พระนคร · บางรัก, **“49 จาก 856 แห่ง บนพื้นที่เพียง 0.7% ของกรุงเทพฯ · แน่นกว่าค่าเฉลี่ยของกรุงเทพฯ 8 เท่า”**, with the secondary finding “มากที่สุดในประเทศ: อำเภอเมืองเชียงใหม่ 99 แห่ง”. The “8 เท่า” is the share of venues divided by the share of area (5.7% / 0.68%), shown only when it is at least 2. (Earlier snapshots: 49 of 838 at the 15:06 export; ปทุมวัน · บางรัก · ราชเทวี, 36 of 185, before the owner's category rules brought markets and fuel stations in. Same formula, different data.) Every figure is computed from `data/venues.json` and `data/districts.geojson` at runtime, never written in markup; the map opens on the `city` preset, focused automatically on those three districts. When the districts fit at most 0.4 zoom below 13 (where OpenMapTiles buildings begin), the camera zooms in to 13.1 around the middle of the free map box, so the first view shows the 3D city with the district fills around the venues. A portrait phone needs about a zoom less, so it frames the three districts whole instead, north up at pitch 40° (`cityPortrait`), above the card (owner 5 Nov 2026 08:34: “หน้าแรก เปิดมาเจอแบบนี้ ให้ดูอะไรเหรอ” — 0.1.11 zoomed in on phones and left the districts under the card).

**One useful action:** the default state already focuses the three districts (focus mode `auto`, no `areas` parameter): district fill, labels and venue pins appear there, each counted venue's own building is drawn in the map's building colour (the checked host geometry when the venue has one, otherwise the basemap building its pin stands in), and the 3D city reads around the focus and wherever the user moves the camera. Visible actions: “ดูทุกเขตในกรุงเทพฯ” (`areas=all`, keeps every filter), “ดูทั้งประเทศ” and “เทียบพื้นที่”. A filter change recomputes the finding, its denominator and the automatic focus; the default figures are never kept as if they described a new selection.

## After the first view — shop lists for the ICP (D20–D21, 4 Nov 2026)

Not part of AHA-01 and never a prerequisite: the shop figures (“ร้านข้างใน” in the overview, areas, lists, table, cards and venue panel — D22), the filter “ข้างในมี” (`?role=`), the venue panel's shop mix, “เทียบศูนย์ใกล้เคียง” and the brand view (`?brand=`) read `data/tenant-index.json` (7,218 displayed listings at 639 venues from 25 datasets), loaded right after the core data; until it arrives a shop figure reads “—”. The Aha numbers (venues per km²) never depend on it unless the user picks a role, which then narrows every number to the venues whose list has that role. Copy says “ยังไม่อยู่ในรายชื่อของที่นี่” rather than claiming a shop is absent or a market gap.

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

## Next steps in Google — 0.1.25 (D37)

Not part of AHA-01 and never a prerequisite. The venue panel's row “ดูต่อใน Google” holds three secondary actions, each CTA-01 with one truthful outcome: intent `external_handoff`, `destinationBinding.kind: external`, consequence `{class: none, external: false, cost: none, reversible: true}` (opening a page sends, changes or charges nothing), presentation `direct`.

| Action | Label | Destination |
|---|---|---|
| `look.ai` | ถาม AI Mode | Google AI Mode with a question about this venue for tenants, leasing teams and investors (DATA_METHOD §9.8) |
| `look.maps` | เปิด Google Maps | Google Maps search by name, district and province |
| `look.streetview` | ดู Street View | Street View on the road in front of the venue's building, facing it; Google's own angle at the venue point until the viewpoint is computed |

Each is an icon + label capsule of at least 44 × 44 css px (CTRL-01; the venue's own link chips were raised from 36 px in the same release), opens a new tab (`target="_blank" rel="noopener noreferrer"`, with “(เปิดแท็บใหม่)” for screen readers) and keeps the visible focus ring. Nothing Google returns is shown on the page or counted.

## Place types — 0.1.23 (D36)

A row typed as a retail component whose parent is not a qualified registry venue is shown as the place it is: a named centre as a shopping centre, a podium or service retail as a community mall, an anchor-store gallery as a host store, a market type as a market. Zones, rows named for a hotel, hospital, airport or university, and retail areas without a name of their own stay “พื้นที่ค้าปลีกในโครงการ”. The name decides, never the operator. The venue panel says how the registry typed it. Under D6, 11 such named centres are now counted on their own (countable 6,151 → 6,162). Receipts: `data/build-report.json#componentsRegrouped` (`counted`, `countedBefore`), `meta.counts`, `meta.checks.firstView`.

## Building source — 0.1.22 (D35)

Every 3D building — context, the building a pin stands in and the buildings of a site — comes from OpenStreetMap first (building parts, with the outline as the podium under them), CityMETER Building V4 only where OpenStreetMap has no building. No venue count, qualification, boundary, site, finding or shop-list figure changes in this release. Rendered checks and live parity belong to the release receipt in `handoff/VERIFICATION.md`.


## Tenant delivery — 0.1.26 (data release verified)

The published roster contains **7,218 displayed listings at 639 hosts from 25 datasets**: Park Silom 23, Central Park Bangkok 64 and One Bangkok Retail 97. Native component foreign keys remain exact while the One Bangkok retail parent presents its source-qualified listings once. Listings are source records/cards, not a census of independent physical shops.

The dated coverage audit accounts for all 11,139 native inventory rows, 26,955 official-directory observations and 211,203 native source-link rows. It keeps 1,129 accepted source links awaiting publication-gate review and 6,468 candidate-only host references separate from public eligibility; the parsed references contain zero unknown venue IDs. The inventory includes research candidates and components. It is not nationwide tenant or field coverage (DATA_METHOD §9.10).

The data/UI release `0442a9682ee00028409fd1b8f6208b482c39b858` is verified: GitHub Pages run `42393891384` succeeded, and the root document plus all 1,160 manifest files passed final-URL, 2xx-status and MIME checks before SHA-256 comparison (1,161 passed, zero failed; 8 Nov 2026 ICT). Actual live Chrome checks confirmed the three venue totals, Park Silom pagination and readable 390 px dark layout, retained One Bangkok component units, and the D37 Google actions. See the dated live receipt in [VERIFICATION.md](../handoff/VERIFICATION.md#0126--observed-dataui-release-0442a96-8-nov-2026-ict) for its scope and limits.


## Centre directories in the shop list — 0.1.27 (D38)

Every “ร้านข้างใน” figure now reads the brand roster plus the entries of each centre's own official directory: **22,159 entries at 639 venues** (roster 7,218 + directory 14,941 at 65 centres; export of `18_OFFICIAL_TENANTS`, 7 Nov 2026). A directory entry shows the name, floor, unit and category the centre lists, with its source link and check date; department-store brand counters, centre facilities, events, coming-soon rows and repeats are left out, and an entry the roster already shows at the venue is not shown twice. Brand search, brand views and the nearby-centre brand comparison read brand-linked shops only. A directory entry is a listed name on the check date — not a field-verified shop, a legal tenant or a physical-shop census (DATA_METHOD §9.11). The roster shards and the 0.1.26 coverage audit are byte-identical; the audit's receipt names the new venue core after a points-only check (`scripts/refresh-coverage-receipt.py`). Rendered checks and live parity belong to the release receipt in `handoff/VERIFICATION.md`.

## Other types, department-store brands and Siam Square — 0.1.28 (D39–D41)

The first view keeps its type set and adds one line under its figures: how many places of the other types the area holds, its three largest groups and a “ดูทุกประเภท” button (D39). Brands with a counter inside a centre's department store — 7,268 brands at 18 Central centres from 7,735 directory rows — are a folded section of the venue panel by store and floor with source link and check date, never shops and never in brand search (D40). Siam Square One, Siam Scape and Centerpoint are sub-areas of Siam Square in `01_VENUES` (12 cells written and read back on 8 Nov 2026): the block counts once (countable 6,162 → 6,159; first view 57 of 238), shows with the shopping centres, and its panel lists its sub-areas' shops with their names (13 → 42; the same rule gives Gaysorn Village 22) (D41). Roster and directory shards are byte-identical; the tenant and coverage receipts name the new core after a hierarchy-only check (`scripts/refresh-coverage-receipt.py --hierarchy`). Rendered checks and live parity belong to the release receipt in `handoff/VERIFICATION.md`.

## Separate venues — 0.1.29 (D42)

A venue's site never draws another venue's building (owner 8 Nov 2026 08:22, Emporium shown with EmQuartier's building). Three sites were corrected in the site tab (Emporium → one building, Central Eastville 58 → 28, Malin Plaza 19 → 8; 391 sites, 5,698 buildings); the build stops on a site point inside another venue's validated footprint, and the page drops a site building that holds another venue's point or covers its validated footprint (`js/site-guard.js`). First-use copy and numbers do not change. Method: `DATA_METHOD.md` §11.8.

## One Bangkok as one place — 0.1.30 (D43)

One Bangkok reads as one place (owner 8 Nov 2026 09:17): its point stands in Parade, its site is the three retail buildings OpenStreetMap names Parade, Post 1928 and The Storeys, its 195 directory rows show without zone names, and offices, hotels and residences stay background buildings. Nationwide, 138 counted venues had a reference point outside every drawn building; 26 now stand in the building OpenStreetMap names for them (read back from `01_VENUES`), and 112 wait for the research team. A building's piece in the next map tile is its continuation only with the same height, lying inside it across the tiles' shared strip, so a tower over a podium is never drawn as the podium. First-use copy and the first finding do not change. Method: `DATA_METHOD.md` §11.9.

## Siam Square, every building of the owner's block — 0.1.31 (D44)

Siam Square highlights every building of the block the owner defined on 7 Nov 2026 (owner 8 Nov 2026 11:40): 45 site points — the 43 CityMETER Building V4 buildings whose interior point stands in the block and the two OpenStreetMap buildings CityMETER lacks; the map draws every OpenStreetMap building of the block and the CityMETER buildings OpenStreetMap lacks, and the panel reads 38 buildings. Hotels, the police unit, schools and parking in the block stay (no D28 trimming). The evidence list reads “บล็อกตามที่เจ้าของข้อมูลกำหนด”. The site helper now keeps a row's point clear of the walls, so a building round a courtyard is no longer dropped. First-use copy and numbers do not change. Method: `DATA_METHOD.md` §11.10.


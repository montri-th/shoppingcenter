# CityMETER Shopping centers — first useful value

This Build Card records the first-use contract of this research demo (release 0.1.16, page tag `20261107-r24`, venue data refreshed from the 7 Nov 2026 00:26 export with district membership on the RTSD polygons of CityMETER production; shop list from 21 datasets checked to 4 Nov 2026, one entry per branch). It uses LDS 0.9.7, release `v0.9.7-owner.1`, standalone document `lds-0.9.7-landometer-standalone-r1`, colour set `color-srgb-10`, SHA-256 `d3085cbc0a50195f1cbf0c77b1d77c0d19b84364daf2948eb367348d65432d96`, with `product.citymeter` identity. It is not a blanket conformance or browser-pass certificate.

Titles read **ศูนย์การค้า** / **Shopping centers** (owner instruction 2026-10-25 16:32). The scope does not change: the dataset still covers shopping centres and the retail venues of decision D2 (markets, fuel stations with shops, retail inside projects, host stores), and running copy calls them “สถานที่ค้าปลีก”.

## First Aha — AHA-01 (owner decision D1, 25 Oct 2026)

**First useful understanding:** where qualified retail venues concentrate, measured as venues per km² of official districts, and how much of the province that concentration covers. The user can start from districts without learning any filter.

Default copy (snapshot checked to 25 Oct 2026, counting rules with owner decisions D6, D7 and D15): **“6% ของสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้”** — สัมพันธวงศ์ · พระนคร · บางรัก, **“49 จาก 856 แห่ง บนพื้นที่เพียง 0.7% ของกรุงเทพฯ · แน่นกว่าค่าเฉลี่ยของกรุงเทพฯ 8 เท่า”**, with the secondary finding “มากที่สุดในประเทศ: อำเภอเมืองเชียงใหม่ 99 แห่ง”. The “8 เท่า” is the share of venues divided by the share of area (5.7% / 0.68%), shown only when it is at least 2. (Earlier snapshots: 49 of 838 at the 15:06 export; ปทุมวัน · บางรัก · ราชเทวี, 36 of 185, before the owner's category rules brought markets and fuel stations in. Same formula, different data.) Every figure is computed from `data/venues.json` and `data/districts.geojson` at runtime, never written in markup; the map opens on the `city` preset, focused automatically on those three districts. When the districts fit at most 0.4 zoom below 13 (where OpenMapTiles buildings begin), the camera zooms in to 13.1 around the middle of the free map box, so the first view shows the 3D city with the district fills around the venues. A portrait phone needs about a zoom less, so it frames the three districts whole instead, north up at pitch 40° (`cityPortrait`), above the card (owner 5 Nov 2026 08:34: “หน้าแรก เปิดมาเจอแบบนี้ ให้ดูอะไรเหรอ” — 0.1.11 zoomed in on phones and left the districts under the card).

**One useful action:** the default state already focuses the three districts (focus mode `auto`, no `areas` parameter): district fill, labels and venue pins appear there, each counted venue's own building is drawn in the map's building colour (the checked host geometry when the venue has one, otherwise the basemap building its pin stands in), and the 3D city reads around the focus and wherever the user moves the camera. Visible actions: “ดูทุกเขตในกรุงเทพฯ” (`areas=all`, keeps every filter), “ดูทั้งประเทศ” and “เทียบพื้นที่”. A filter change recomputes the finding, its denominator and the automatic focus; the default figures are never kept as if they described a new selection.

## After the first view — shop lists for the ICP (D20–D21, 4 Nov 2026)

Not part of AHA-01 and never a prerequisite: the shop figures (“ร้านข้างใน” in the overview, areas, lists, table, cards and venue panel — D22), the filter “ข้างในมี” (`?role=`), the venue panel's shop mix, “เทียบศูนย์ใกล้เคียง” and the brand view (`?brand=`) read `data/tenant-index.json` (5,493 branches at 619 venues from 21 datasets), loaded right after the core data; until it arrives a shop figure reads “—”. The Aha numbers (venues per km²) never depend on it unless the user picks a role, which then narrows every number to the venues whose list has that role. Copy says “ยังไม่อยู่ในรายชื่อของที่นี่” rather than claiming a shop is absent or a market gap.

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

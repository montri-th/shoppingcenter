# CityMETER Shopping Centers & Retail Venues — first useful value

This Build Card records the first-use contract of this research demo (release 0.1.0, 25 Oct 2026). It uses LDS 0.9.7, release `v0.9.7-owner.1`, standalone document `lds-0.9.7-landometer-standalone-r1`, colour set `color-srgb-10`, SHA-256 `d3085cbc0a50195f1cbf0c77b1d77c0d19b84364daf2948eb367348d65432d96`, with `product.citymeter` identity. It is not a blanket conformance or browser-pass certificate.

## First Aha — AHA-01 (owner decision D1, 25 Oct 2026)

**First useful understanding:** where qualified retail venues concentrate, measured as venues per km² of official districts, and how much of the province that concentration covers. The user can start from districts without learning any filter.

Default copy (snapshot checked to 24 Oct 2026): **“18% ของศูนย์การค้าและสถานที่ค้าปลีกในกรุงเทพฯ อยู่ใน 3 เขตนี้”** — ปทุมวัน · บางรัก · ราชเทวี, **32 จาก 181 แห่ง บนพื้นที่ 1.2% ของกรุงเทพฯ**, with the secondary finding “เขตที่มีสถานที่มากที่สุดในประเทศ: ปทุมวัน 20 แห่ง”. Every figure is computed from `data/venues.json` and `data/districts.geojson` at runtime, never written in markup; the map opens on the `city` preset, focused automatically on those three districts. When the districts would fit just below zoom 13 (where OpenMapTiles buildings begin), the camera frames their venues at zoom 13.1 instead, so the first view shows the 3D city with the district fills around the venues.

**One useful action:** the default state already focuses the three districts (focus mode `auto`, no `areas` parameter): district fill, labels, venue pins, host buildings and rounded focus massing appear only there; the rest of the country stays visible but quiet. Visible actions: “ดูทุกเขตในกรุงเทพฯ” (`areas=all`, keeps every filter), “ดูทั้งประเทศ” and “เทียบพื้นที่”. A filter change recomputes the finding, its denominator and the automatic focus; the default figures are never kept as if they described a new selection.

## Evidence cue and calculation

Calculation: `summarizeAreaInsight` in [js/area-insight.js](../js/area-insight.js), applied to the countable supply rows selected by `filterVenues` (before any area selection), and cross-checked by the Python build in `meta.checks.aha`.

1. Rank every district of the country by venues/km² (ties: count, then code) and take the province of the first (or the province the user selected).
2. Rank that province's districts the same way and take the first three with at least one venue.
3. Numerator: venues in the three districts. Denominator: countable supply with a selected point in the province. Area context: the three districts' `area_sqkm` over the province total from the same boundary file.

| District | Code (production) | Venues | km² | Venues/km² |
|---|---|---:|---:|---:|
| ปทุมวัน | `1007` | 20 | 8.012 | 2.50 |
| บางรัก | `1004` | 5 | 3.985 | 1.25 |
| ราชเทวี | `1037` | 7 | 7.173 | 0.98 |

The three districts hold **32** of the **181** located countable venues of Bangkok (17.7%) on **19.17 of 1,566.58 km²** (1.2%). Boundaries: OpenGISData-Thailand districts (DOPA-credited, CC BY 4.0, commit `fafcea1`); membership is point-in-polygon of the selected reference point, nothing is assigned by name. These are descriptive shares within the qualified research dataset — not a census, market share, footfall, sales, rent, vacancy or a claim about market gaps.

If no district has a located venue in the current filter, the panel says how many venues lack a qualifying point and offers the table; it never turns a zero numerator into “no shopping centres here”. An empty filter gets a clear empty state and a reset action.

## Prerequisites and safe paths — AHA-01-A / AHA-01-B

- **Essential:** `data/venues.json` and `data/districts.geojson` on an HTTP(S) origin. A missing core dataset shows an actionable error with retry (`js/launch.js`).
- **Not prerequisites:** sign-in, personal data, location permission, sharing, WebGL, map tiles, building geometry, the pending layer, detail shards or a logo image. The textual finding, filters, charts and table work when the map or tiles fail; `data/pending.json` loads after the first view and its failure changes no number.
- Narrow portrait screens show the same finding and actions in a compact card over the map while the bottom sheet is closed. No onboarding modal, decorative left rail or bracket accent.

## Verification scope

[area-insight.test.js](../tests/area-insight.test.js) checks that the default finding equals the pipeline’s independent computation, its invariants (three densest districts of one province, numerator ≤ denominator), recomputation under filters, the province override, empty input and that rows without a selected point never acquire an area; [data.test.js](../tests/data.test.js) reconciles every count in `meta.counts` with the rows and checks codes, shards, private-link and Drive-id absence and the qualification vocabulary; [scales.test.js](../tests/scales.test.js) checks the LUTs and class tables; [panel.test.js](../tests/panel.test.js) the overview, district, venue, pending and search panels. These tests establish numbers and source selection. First-paint visibility, the 3D scene, responsive Thai layout, keyboard use and vendor failure are browser checks recorded in [handoff/VERIFICATION.md](../handoff/VERIFICATION.md).

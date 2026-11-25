#!/usr/bin/env python3
"""Write data/residents/: registered residents around each located center (modelled), for “รอบศูนย์นี้”.

  python3 scripts/build-residents.py --bundle <dir> --outlines <touched.json>

Owner 2026-11-20 08:26 (VERBATIM): “1 ขึ้นเลย / 2 พี่ตัดสินใจเลย” — put the row “คนที่มีชื่อในทะเบียนบ้านรอบศูนย์
(แบบจำลอง)” of the approved mock into the section, TH/EN; the colours of its map were left to Claude (per center: the
cells of the center's own 5 km map ranked on the 41 samples of the LDS `density.area` LUT, js/scales.js buildRamp).

Inputs (both outside this repository):
  --bundle    the extracted bundle 02-CityMETER__venue-locale-residents-519-venues-bundle__v3__2026-11-25 (results/
              residents_519.json and results/grids_250m.json, checked against its SHA256SUMS): bundle v2 (492 centres,
              every record unchanged: the 488 of v1 and the four placed on 2026-11-20, owner 11:57) and the 27 centres
              the export of 25 Nov 2026 locates (owner 2026-11-25 01:11 and 21:57), computed with the same scripts. Method: residents of a
              building = the subdistrict's registered population (Department of Provincial Administration, Oct 2026,
              `t_tot`) × the building's floor area ÷ the subdistrict floor area that CityMETER production caches (the
              production allocation, all buildings); summed over the buildings whose centroid lies within the
              straight-line radius. Read from the production API (GET only) on 20 Nov 2026 (the 27: 25 Nov 2026, the same
              population month; four published centres recomputed from those reads equal v2).
  --outlines  the subdistricts the 5 km radii touch, with the geometry production serves (base/info/geom): the bundle's
              `inputs/touched_with_geometry.json` (`inputs/touched.json` without geometry, response hashes in
              `inputs/fetch_log.csv`).
              Drawn as thin lines: projected around the center (azimuthal equidistant, the grid's projection), snapped
              to 40 m, coverage-simplified at 60 m, clipped to 5 km — a reading aid, not a boundary to measure on.

Published per center (shardOf(id, SHARDS), FNV-1a as js/details.js; one record per located center of the set):
  n     residents within 1 · 3 · 5 km (3 decimals, as ring and own: every figure the page rounds reads as from the
        bundle's own value, which the build checks)
  p     mid-rank percentile among the 488 located centers of bundle v1 [all], and among those of the same type [type],
        per radius: the rank reference is fixed (owner 2026-11-20 11:57, “อันดับแบบแนะนำ”), so a center placed later is
        ranked against the 488 and moves no one else's rank
  age   shares 0–14 · 15–59 · 60+ per radius (the subdistricts' age structure weighted by the residents inside)
  b     buildings counted per radius · sd subdistricts with a counted building per radius
  ring  [residents, residents per km²] of the rings 0–1 · 1–3 · 3–5 km
  own   [buildings, residents] of the center's own building(s) when the site join knows them
  g     residents per 250 m cell within 5 km, 40 × 40, rows north to south, columns west to east (1 decimal, as the
        bundle's grid); null = no counted building in the cell; 0 = counted buildings with under 0.05 residents
  o     the outlines as one SVG path in 25 m units around the center (y down)

Stops (a source error, not a value): a SHA-256 that differs from SHA256SUMS; a center of the bundle that is not a
located center of this set, or a located center without a record; a type count or a stored percentile that differs
from the recount; a radius or ring without residents; a quality count the page does not explain (buildings without
floor area, subdistricts without population, buildings cut at a tile edge); grid cells that do not add up to the 5 km
residents. Writing the same inputs again gives the same bytes.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'residents'
SHARDS = 128
RADII = ('1000', '3000', '5000')
RINGS = ('0-1000', '1000-3000', '3000-5000')
GROUPS = ('mall', 'community', 'outlet')
CELL_M, HALF = 250, 20  # cells -20..19 on both axes: 40 × 40 around the center
OUTLINE_UNIT_M, SNAP_M, SIMPLIFY_M = 25, 40, 60
RELEASE = 'venue-locale-residents-519-20261125-v3'
BUNDLE = '02-CityMETER__venue-locale-residents-519-venues-bundle__v3__2026-11-25'
RESULTS = 'results/residents_519.json'


def fail(msg):
    sys.exit(f'build-residents: {msg}')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def shard_of(vid, shards=SHARDS):
    """FNV-1a of the UTF-8 bytes, as js/details.js shardOf."""
    h = 0x811C9DC5
    for b in str(vid).encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h % shards


def mid_pct(x, values):
    below = sum(1 for v in values if v < x)
    equal = sum(1 for v in values if v == x)
    return 100 * (below + 0.5 * equal) / len(values)


def located_set():
    rows = json.loads((ROOT / 'data' / 'venues.json').read_text(encoding='utf-8'))['rows']
    return {r['id']: r for r in rows if r.get('countable') and r.get('status') == 'supply' and r.get('group') in GROUPS and r.get('located')}


def outline_path(vid, v, polys_ll):
    """Thin subdistrict lines around one center: one SVG path in 25 m units, y down."""
    import numpy as np
    import shapely
    from shapely.geometry import Point, shape
    from shapely.ops import linemerge, unary_union
    from pyproj import Transformer
    tf = Transformer.from_crs('EPSG:4326', f'+proj=aeqd +lat_0={v["lat"]} +lon_0={v["lon"]} +datum=WGS84 +units=m', always_xy=True)
    circle = Point(0, 0).buffer(5000, 64)
    reach = circle.buffer(300)
    polys = []
    for g in polys_ll:
        p = shapely.transform(shape(g), lambda xy: np.column_stack(tf.transform(xy[:, 0], xy[:, 1]))).intersection(reach)
        if p.is_empty:
            continue
        p = shapely.make_valid(shapely.set_precision(p, SNAP_M))
        if not p.is_empty:
            polys.append(p)
    if not polys:
        return ''
    try:
        polys = list(shapely.coverage_simplify(polys, SIMPLIFY_M))
    except Exception:  # not a valid coverage: the snapped polygons as they are
        pass
    lines = linemerge(unary_union([shapely.boundary(p) for p in polys]))
    clipped = lines.intersection(circle).simplify(SIMPLIFY_M / 2)
    out = []
    for ln in shapely.get_parts(clipped):
        if ln.geom_type != 'LineString':
            continue
        pts = []
        for x, y in ln.coords:
            q = (round(x / OUTLINE_UNIT_M), round(-y / OUTLINE_UNIT_M))
            if not pts or q != pts[-1]:
                pts.append(q)
        if len(pts) < 2:
            continue
        out.append(f'M{pts[0][0]} {pts[0][1]}' + ''.join(f'l{c - a} {d - b}' for (a, b), (c, d) in zip(pts, pts[1:])))
    return ''.join(out)


def half_up(x):
    """JS Math.round."""
    return math.floor(x + 0.5)


def about(x):
    """js/venue-locale.js aboutPeople: the nearest 10, 100 or 1,000 by size; None under 10."""
    if not x >= 10:
        return None
    step = 1000 if x >= 10000 else 100 if x >= 1000 else 10
    return half_up(x / step) * step


def dens(x):
    """js/venue-locale.js densityWords: two significant figures; None under 1."""
    if not x >= 1:
        return None
    d = 10 ** max(0, math.floor(math.log10(x)) - 1)
    return half_up(x / d) * d


def share(x, total):
    s = 100 * x / total
    return '<1' if s < 0.5 else half_up(s)


def pct(a):
    return half_up(a * 100)


def rank(p):
    """js/venue-locale.js rankWords."""
    return 'top' if p >= 99.5 else 'bottom' if p < 0.5 else half_up(p)


def compact(x):
    """1 decimal; whole numbers without the .0 (JSON stays a number)."""
    r = round(x, 1)
    return int(r) if r == int(r) else r


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--bundle', required=True, type=Path)
    ap.add_argument('--outlines', required=True, type=Path)
    args = ap.parse_args()
    import pyproj
    import shapely

    sums = {}
    for line in (args.bundle / 'SHA256SUMS').read_text(encoding='utf-8').splitlines():
        h, name = line.split(None, 1)
        sums[name.strip().removeprefix('./')] = h
    for name in (RESULTS, 'results/grids_250m.json', 'inputs/venues.json'):
        got = sha256(args.bundle / name)
        if sums.get(name) != got:
            fail(f'{name}: SHA-256 {got} differs from SHA256SUMS ({sums.get(name)})')
    R = json.loads((args.bundle / RESULTS).read_text(encoding='utf-8'))
    G = json.loads((args.bundle / 'results/grids_250m.json').read_text(encoding='utf-8'))
    V = {v['id']: v for v in json.loads((args.bundle / 'inputs/venues.json').read_text(encoding='utf-8'))}
    T = json.loads(args.outlines.read_text(encoding='utf-8'))

    located = located_set()
    venues = R['venues']
    if set(venues) != set(located):
        fail(f'bundle centers {len(venues)} vs located centers of the set {len(located)}: '
             f'only in bundle {sorted(set(venues) - set(located))[:5]}, only in the set {sorted(set(located) - set(venues))[:5]}')
    if set(V) != set(venues) or set(G['venues']) != set(venues):
        fail('venues.json, grids and results list different centers')
    for vid, row in located.items():
        if V[vid]['group'] != row['group']:
            fail(f'{vid}: type {V[vid]["group"]} in the bundle, {row["group"]} in data/venues.json')
        if abs(V[vid]['lon'] - row['lon']) > 1e-6 or abs(V[vid]['lat'] - row['lat']) > 1e-6:
            fail(f'{vid}: the point moved since the bundle ({V[vid]["lon"]},{V[vid]["lat"]} → {row["lon"]},{row["lat"]})')
    added = sorted(R['meta']['added']['venues'])
    reference = sorted(set(venues) - set(added))
    if len(reference) != 488 or set(added) - set(venues):
        fail(f'rank reference of {len(reference)} centers, added {added}')
    counts = {'all': len(reference), **{g: sum(1 for i in reference if located[i]['group'] == g) for g in GROUPS}}
    if R['meta']['universes'] != counts:
        fail(f'universes {R["meta"]["universes"]} vs recount of the reference {counts}')
    if G.get('cell_m') != CELL_M:
        fail(f'grid cell {G.get("cell_m")} m, expected {CELL_M}')

    # percentiles recounted from the residents themselves (all, and the same type), against the fixed reference
    for r in RADII:
        allv = [venues[i]['radii'][r]['residents'] for i in reference]
        by_type = {g: [venues[i]['radii'][r]['residents'] for i in reference if located[i]['group'] == g] for g in GROUPS}
        for vid, rec in venues.items():
            x = rec['radii'][r]['residents']
            for key, pool in (('pct_all', allv), ('pct_type', by_type[located[vid]['group']])):
                if abs(rec['radii'][r][key] - mid_pct(x, pool)) > 1e-9:
                    fail(f'{vid} {r} {key}: stored {rec["radii"][r][key]} vs recount {mid_pct(x, pool)}')

    by_venue = {}
    for sid, s in T.items():
        for vid in s.get('venues', []):
            by_venue.setdefault(vid, []).append(sid)
    provinces = {s.get('province_code') for s in T.values()}

    shards = {}
    for vid in sorted(venues):
        rec = venues[vid]
        radii = [rec['radii'][r] for r in RADII]
        for r, x in zip(RADII, radii):
            if not x['residents'] > 0 or not x['buildings'] > 0:
                fail(f'{vid} {r}: no residents or no building ({x["residents"]}, {x["buildings"]})')
            if x['buildings_no_gfa'] or x['area_share_no_gfa'] or x['gfa_share_no_population'] or x['cut_buildings']:
                fail(f'{vid} {r}: a quality count the page does not explain yet ({x["buildings_no_gfa"]}, {x["area_share_no_gfa"]}, '
                     f'{x["gfa_share_no_population"]}, {x["cut_buildings"]})')
            if x['age_share'] is None:
                fail(f'{vid} {r}: no age structure')
        if rec['touched_no_population']:
            fail(f'{vid}: {rec["touched_no_population"]} subdistricts without population')
        rings = [rec['rings'][k] for k in RINGS]
        if any(not k['residents'] > 0 for k in rings):
            fail(f'{vid}: a ring without residents')
        if abs(sum(k['residents'] for k in rings) - radii[2]['residents']) > 1e-6 * max(1, radii[2]['residents']):
            fail(f'{vid}: rings {sum(k["residents"] for k in rings)} vs 5 km {radii[2]["residents"]}')
        grid = [None] * (2 * HALF * 2 * HALF)
        total = 0.0
        for i, j, val in G['venues'][vid]:
            if not (-HALF <= i < HALF and -HALF <= j < HALF):
                fail(f'{vid}: cell {i},{j} outside 5 km')
            if not val >= 0:
                fail(f'{vid}: cell {i},{j} with {val}')
            grid[(HALF - 1 - j) * 2 * HALF + (i + HALF)] = compact(val)
            total += val
        if abs(total - radii[2]['residents']) > 0.05 * len(G['venues'][vid]) + 1:
            fail(f'{vid}: cells {total:.1f} vs 5 km {radii[2]["residents"]:.1f}')
        missing = [s for s in by_venue.get(vid, []) if not T[s].get('geom')]
        if missing or len(by_venue.get(vid, [])) != rec['touched_subdistricts']:
            fail(f'{vid}: outlines for {len(by_venue.get(vid, []))} subdistricts, {rec["touched_subdistricts"]} touched, {len(missing)} without geometry')
        out = {
            'n': [round(x['residents'], 3) for x in radii],
            'p': [[round(x['pct_all'], 4) for x in radii], [round(x['pct_type'], 4) for x in radii]],
            'age': [[round(x['age_share'][k], 6) for k in ('0_14', '15_59', '60p')] for x in radii],
            'b': [x['buildings'] for x in radii],
            'sd': [x['subdistricts'] for x in radii],
            'ring': [[round(k['residents'], 3), round(k['per_km2'], 3)] for k in rings],
            'g': grid,
            'o': outline_path(vid, V[vid], [T[s]['geom'] for s in sorted(by_venue.get(vid, []))]),
        }
        if rec['own_buildings']:
            out['own'] = [rec['own_buildings'], round(rec['own_building_residents'], 3)]
        # every figure the page rounds reads the same from the stored value as from the bundle's own value
        shown = lambda o, R5, own: (
            [about(x) for x in o['n']] + [about(k[0]) for k in o['ring']] + [dens(k[1]) for k in o['ring']]
            + [share(k[0], R5) for k in o['ring']] + [pct(a) for x in o['age'] for a in x] + [rank(q) for x in o['p'] for q in x]
            + ([about(own)] if own is not None else []))
        true = {'n': [x['residents'] for x in radii], 'ring': [[k['residents'], k['per_km2']] for k in rings],
                'age': [[x['age_share'][k] for k in ('0_14', '15_59', '60p')] for x in radii],
                'p': [[x['pct_all'] for x in radii], [x['pct_type'] for x in radii]]}
        if shown(out, out['n'][2], out.get('own', [0, None])[1]) != shown(true, true['n'][2], rec['own_building_residents'] if rec['own_buildings'] else None):
            fail(f'{vid}: a figure reads differently once stored (raise the precision)')
        shards.setdefault(shard_of(vid), {})[vid] = out

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    def dump(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'
    for k in range(SHARDS):
        (OUT / f'{k:03d}.json').write_text(dump({'venues': shards.get(k, {})}), encoding='utf-8')
    meta = {
        'schema': 'shoppingcenter-residents/1',
        'release': RELEASE,
        'asOf': '2026-11-25',
        # the day the 488 centres of bundle v1 were read from production; a centre placed later was read on the day
        # reference.addedOn names for it (js/venue-locale.js residentsReadOn)
        'readOn': '2026-11-20',
        'populationMonth': R['meta']['population_month'],
        'method': R['meta']['method'],
        'shards': SHARDS,
        'venues': len(venues),
        'universes': counts,
        'reference': {'n': len(reference), 'bundle': '02-CityMETER__venue-locale-residents-488-venues-bundle__v1__2026-11-20',
                      'added': added, 'addedOn': R['meta']['added']['placedOn']},
        'radii': [int(r) for r in RADII],
        'rings': [[int(a) for a in k.split('-')] for k in RINGS],
        'cell': {'m': CELL_M, 'n': 2 * HALF, 'first': [-HALF, HALF - 1],
                 'order': 'rows north to south, columns west to east; value = residents in the cell (1 decimal); null = no counted building; 0 = counted buildings with under 0.05 residents',
                 'projection': 'azimuthal equidistant centred on the center point (WGS84); cell = floor(x / 250 m), floor(y / 250 m)'},
        'outline': {'unit_m': OUTLINE_UNIT_M, 'snap_m': SNAP_M, 'simplify_m': SIMPLIFY_M, 'subdistricts': len(T), 'provinces': len(provinces),
                    'note': 'thin lines to read the map by, not boundaries to measure on'},
        'touchedSubdistricts': R['meta']['touched_subdistricts'],
        'buildings': R['meta']['buildings'],
        'input': {
            'bundle': BUNDLE,
            'sha256sums': sha256(args.bundle / 'SHA256SUMS'),
            'files': {name: sums[name] for name in (RESULTS, 'results/grids_250m.json', 'inputs/venues.json')},
            'outlines': {'file': args.outlines.name, 'sha256': sha256(args.outlines)},
            'tools': {'pyproj': pyproj.__version__, 'shapely': shapely.__version__},
        },
        'dataMethod': 'DATA_METHOD.md#registered-residents',
    }
    (OUT / 'meta.json').write_text(dump(meta), encoding='utf-8')
    sizes = [(OUT / f'{k:03d}.json').stat().st_size for k in range(SHARDS)]
    print(f'{OUT.relative_to(ROOT)}: {len(venues)} centers in {SHARDS} shards '
          f'({sum(sizes) / 1e6:.2f} MB, largest {max(sizes) / 1e3:.0f} KB) · release {RELEASE}')


if __name__ == '__main__':
    main()

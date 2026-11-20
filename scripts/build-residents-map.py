#!/usr/bin/env python3
"""Write data/residents-map/: what a reader finds their way by on the 5 km residents map of each located center —
the major roads with a few names, the rail lines with the nearest stations, and the rivers.

  python3 -I scripts/build-residents-map.py --osm <thailand-latest.osm.pbf>

Owner 2026-11-20 16:35 (VERBATIM): “heatmap วงกลมอันนี้ดี แต่ยังดูยากอยู่เพราะว่า user ดูไม่ออก ว่าอะไรอยู่ตรงไหน
อย่างน้อยควรแสดงแนวถนน overlay ใน heatmap ด้วย หรือ ทำวิธีอื่นๆที่ช่วย user จะได้เข้าใจง่ายขึ้น”

Inputs
  --osm             the Geofabrik extract of Thailand (OpenStreetMap, ODbL); kept outside the repository, only its SHA-256,
                    size and replication timestamp are published
  data/venues.json  the located centers of the set (as scripts/build-residents.py)
  data/stations.json the operating rail stations of CityMETER Transit (names and points)

Ways read (OpenStreetMap tags): highway = motorway · trunk · primary · secondary (links, construction and proposals
left out); railway = rail · subway · light_rail · monorail without a service tag (no yards, sidings or spurs) and not
used for industry, the military, tourism or tests; waterway = river.

Published per located center (shardOf(id, SHARDS), FNV-1a as js/details.js; 25 m units around the center, y down, the
same frame as the subdistrict outlines `o` of data/residents):
  r  [motorway, trunk, primary, secondary]: one SVG path each ('' when none), clipped to 5 km
  t  the rail lines, one SVG path
  w  the rivers, one SVG path
  s  the operating stations within 5 km, [[x, y], …] nearest first
  L  labels [[kind, x, y, align, th, en], …] — kind road · river · station; align c (centred) · l · r (beside the
     point); at most 4 roads, 1 river and 3 stations, placed so that on a 360 px map no two overlap, none leaves the
     circle and none covers the center pin or the ring labels; the nearest station is named first

Lines are simplified to SIMPLIFY_M before rounding to the 25 m grid. These are lines to read the map by, not a
network to measure on. Writing the same inputs again gives the same bytes.
"""
import argparse
import hashlib
import json
import math
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'residents-map'
SHARDS = 128
UNIT_M = 25
RADIUS_M = 5000
SIMPLIFY_M = 12
GROUPS = ('mall', 'community', 'outlet')
ROAD_CLASSES = ('motorway', 'trunk', 'primary', 'secondary')
RAIL_KINDS = ('rail', 'subway', 'light_rail', 'monorail')
RAIL_USAGE_OUT = {'industrial', 'military', 'tourism', 'test'}
MAX_ROAD_LABELS, MAX_RIVER_LABELS, MAX_STATION_LABELS = 4, 1, 3
# Label boxes are fitted on a map 360 px wide (the panel draws it 300–420 px): 12 px text in a chip.
MAP_PX = 360
MAP_UNITS = (2 * RADIUS_M / UNIT_M) * (40.8 / 40)  # the svg viewBox holds 40.8 cells of 250 m
U_PER_PX = MAP_UNITS / MAP_PX
CHAR_PX, PAD_PX, LINE_PX = 6.4, 12, 18
RING_LABEL_M = (1000, 3000, 5000)
# Which roads get a name: the ones a reader meets near the center — length within 3 km counts fully, the rest of the
# circle a quarter — by class (an expressway runs above the streets people name places by).
CLASS_WEIGHT = (0.8, 1.0, 1.0, 0.75)
NEAR_M = 3000
LABEL_RING_M = (900, 4500, 2000)  # a name sits between 0.9 and 4.5 km from the center, nearest 2 km first
CENTER_CLEAR_M = 150  # no name over the center point (owner 2026-11-20 17:19 review: the station at the center was not named)
# The center pin the page draws (0.9.4, owner 2026-11-20 19:35: “ขอปรับจุดของ venue ให้แสดงได้ชัดขึ้นหน่อย”): its tip at the
# center, a head of 0.8 cell (200 m) radius 1.5 cells (375 m) above it, and its halo; no name covers it.
PIN_HALF_W_M, PIN_TOP_M = 270, 650


def fail(msg):
    sys.exit(f'build-residents-map: {msg}')


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


def located_set():
    rows = json.loads((ROOT / 'data' / 'venues.json').read_text(encoding='utf-8'))['rows']
    return {r['id']: r for r in rows if r.get('countable') and r.get('status') == 'supply' and r.get('group') in GROUPS and r.get('located')}


def points_sha(V):
    """The centers the lines are drawn around: SHA-256 of “id,lon,lat” per line (7 decimals), sorted by id. The page
    test recomputes it from data/venues.json, so a center that moves, comes or goes asks for this build again."""
    text = ''.join(f'{vid},{V[vid]["lon"]:.7f},{V[vid]["lat"]:.7f}\n' for vid in sorted(V))
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def base_chars(text):
    """Characters that take width (Thai vowels above or below and tone marks do not)."""
    return sum(1 for ch in text if unicodedata.category(ch) not in ('Mn', 'Me', 'Cf'))


def short_th(name):
    for full, short in (('ถนน', 'ถ.'), ('ทางหลวงแผ่นดินหมายเลข', 'ทล.'), ('ทางหลวงหมายเลข', 'ทล.')):
        if name.startswith(full):
            return short + name[len(full):].strip()
    return name


def short_en(name):
    for full, short in ((' Road', ' Rd'), (' Expressway', ' Expwy'), (' Highway', ' Hwy'), (' Street', ' St')):
        if name.endswith(full):
            return name[: -len(full)] + short
    return name


def names_of(tags):
    """(th, en) display names of a way; '' when it has none."""
    th = tags.get('name:th') or tags.get('name') or ''
    en = tags.get('name:en') or ''
    if th and not any('฀' <= ch <= '๿' for ch in th):  # a Latin-only name serves both
        en = en or th
    return th.strip(), en.strip()


def read_osm(path, boxes):
    """The ways this build draws whose bounding box meets a center's box: [(kind, cls, th, en, [(lon, lat), …]), …]."""
    import osmium
    flt = osmium.filter.TagFilter(*[('highway', c) for c in ROAD_CLASSES], *[('railway', k) for k in RAIL_KINDS], ('waterway', 'river'))
    fp = osmium.FileProcessor(str(path)).with_locations().with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)).with_filter(flt)
    out = []
    for w in fp:
        t = {k: v for k, v in w.tags}
        if t.get('highway') in ROAD_CLASSES:
            kind, cls = 'road', ROAD_CLASSES.index(t['highway'])
        elif t.get('railway') in RAIL_KINDS:
            if 'service' in t or t.get('usage') in RAIL_USAGE_OUT:
                continue
            kind, cls = 'rail', RAIL_KINDS.index(t['railway'])
        elif t.get('waterway') == 'river':
            kind, cls = 'river', 0
        else:
            continue
        try:
            pts = [(n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError:
            continue
        if len(pts) < 2:
            continue
        lo0, la0 = min(p[0] for p in pts), min(p[1] for p in pts)
        lo1, la1 = max(p[0] for p in pts), max(p[1] for p in pts)
        cells = {(i, j) for i in range(math.floor(lo0 * 10), math.floor(lo1 * 10) + 1) for j in range(math.floor(la0 * 10), math.floor(la1 * 10) + 1)}
        if any(c in boxes for c in cells) if len(cells) < 400 else True:
            th, en = names_of(t)
            out.append((kind, cls, th, en, pts, w.id))
    return out


def svg_path(lines):
    """One SVG path in UNIT_M units (y down) from projected LineStrings in metres."""
    out = []
    for ln in lines:
        pts = []
        for x, y in ln.coords:
            q = (round(x / UNIT_M), round(-y / UNIT_M))
            if not pts or q != pts[-1]:
                pts.append(q)
        if len(pts) < 2:
            continue
        out.append(f'M{pts[0][0]} {pts[0][1]}' + ''.join(f'l{c - a} {d - b}' for (a, b), (c, d) in zip(pts, pts[1:])))
    return ''.join(out)


class Boxes:
    """Label boxes in UNIT_M units (x right, y down)."""

    def __init__(self):
        self.boxes = []

    @staticmethod
    def make(x, y, w, h, align):
        if align == 'c':
            return (x - w / 2, y - h / 2, x + w / 2, y + h / 2)
        if align == 'l':  # the label starts right of the point
            return (x + 8, y - h / 2, x + 8 + w, y + h / 2)
        return (x - 8 - w, y - h / 2, x - 8, y + h / 2)  # 'r': ends left of the point

    def free(self, b):
        return all(b[2] <= o[0] or b[0] >= o[2] or b[3] <= o[1] or b[1] >= o[3] for o in self.boxes)

    def add(self, b):
        self.boxes.append(b)


def inside(b, r_units):
    return all(math.hypot(x, y) <= r_units for x in (b[0], b[2]) for y in (b[1], b[3]))


def label_size(th, en):
    w = max(base_chars(th), base_chars(en or th)) * CHAR_PX + PAD_PX
    return w * U_PER_PX, LINE_PX * U_PER_PX


def fixed_obstacles():
    """The center pin and the ring labels the page draws (translate(2px, −100%) from the 45° point of each ring). A name
    keeps CENTER_CLEAR_M from the center and stays off the pin above it (PIN_HALF_W_M either side, PIN_TOP_M up), so the
    station a center stands at can be named beside it."""
    bx = Boxes()
    c = CENTER_CLEAR_M / UNIT_M
    bx.add((-c, -c, c, c))
    bx.add((-PIN_HALF_W_M / UNIT_M, -PIN_TOP_M / UNIT_M, PIN_HALF_W_M / UNIT_M, c))
    for r in RING_LABEL_M:
        x = (r / UNIT_M) * math.sqrt(0.5)
        w, h = (5 * CHAR_PX + 10) * U_PER_PX, LINE_PX * U_PER_PX
        bx.add((x, -x - h, x + w, -x))
    return bx


def place_line_labels(groups, bx, limit, kind):
    """groups: [(rank, th, en, [LineString metres …])]; a label at the first free point along the line, mid-ring first."""
    out = []
    for _rank, th, en, lines in sorted(groups, key=lambda g: g[0]):
        if len(out) >= limit:
            break
        w, h = label_size(th, en)
        cands = []
        for ln in lines:
            n = max(1, int(ln.length // 125))
            for k in range(n + 1):
                p = ln.interpolate(k / n, normalized=True)
                d = math.hypot(p.x, p.y)
                if LABEL_RING_M[0] <= d <= LABEL_RING_M[1]:
                    cands.append((abs(d - LABEL_RING_M[2]), round(p.x / UNIT_M), round(-p.y / UNIT_M)))
        for _score, x, y in sorted(cands):
            b = Boxes.make(x, y, w, h, 'c')
            if inside(b, (RADIUS_M - 150) / UNIT_M) and bx.free(b):
                bx.add(b)
                out.append([kind, x, y, 'c', th, en])
                break
    return out


def build_venue(v, ways_idx, ways, stations, tf_factory):
    import numpy as np
    import shapely
    from shapely.geometry import LineString, Point
    tf = tf_factory(v)
    circle = Point(0, 0).buffer(RADIUS_M, 128)
    near = Point(0, 0).buffer(NEAR_M, 64)
    roads = [[] for _ in ROAD_CLASSES]
    rails, rivers = [], []
    named_roads, named_rivers = {}, {}
    for wi in ways_idx:
        kind, cls, th, en, pts, _wid = ways[wi]
        xs, ys = tf.transform(np.array([p[0] for p in pts]), np.array([p[1] for p in pts]))
        ln = LineString(np.column_stack([xs, ys]))
        if not ln.intersects(circle):
            continue
        part = ln.intersection(circle)
        parts = [g for g in shapely.get_parts(part) if g.geom_type == 'LineString' and g.length > 0]
        if not parts:
            continue
        simple = [g.simplify(SIMPLIFY_M) for g in parts]
        if kind == 'road':
            roads[cls].extend(simple)
            if th:
                rec = named_roads.setdefault((short_th(th), short_en(en)), [cls, 0.0, []])
                rec[0] = min(rec[0], cls)
                w = CLASS_WEIGHT[cls]
                rec[1] += sum(w * (0.75 * g.intersection(near).length + 0.25 * g.length) for g in parts)
                rec[2].extend(parts)
        elif kind == 'rail':
            rails.extend(simple)
        else:
            rivers.extend(simple)
            if th or en:
                key = (th or en, en)  # a river named only in English carries that name on the Thai page too, never an empty label
                named_rivers.setdefault(key, [0, 0.0, []])
                named_rivers[key][1] += sum(g.length for g in parts)
                named_rivers[key][2].extend(parts)
    bx = fixed_obstacles()
    labels = []
    st_pts, seen = [], set()
    sx, sy = tf.transform(np.array([s[3] for s in stations]), np.array([s[4] for s in stations]))
    near = sorted((math.hypot(x, y), x, y, s) for x, y, s in zip(sx, sy, stations) if math.hypot(x, y) <= RADIUS_M)
    for _d, x, y, _s in near:
        q = [round(x / UNIT_M), round(-y / UNIT_M)]
        if q not in st_pts:
            st_pts.append(q)

    def name_station(d, x, y, s):
        """Beside the station point, right then left, where it is free; True once named."""
        if s[1] in seen:
            return False
        q = [round(x / UNIT_M), round(-y / UNIT_M)]
        th, en = f'สถานี{s[1]}', f'{s[2]} station' if s[2] else ''
        w, h = label_size(th, en)
        for align in ('l', 'r'):
            b = Boxes.make(q[0], q[1], w, h, align)
            if inside(b, (RADIUS_M - 150) / UNIT_M) and bx.free(b):
                bx.add(b)
                labels.append(['station', q[0], q[1], align, th, en])
                seen.add(s[1])
                return True
        return False

    # the nearest station first (where the center stands, the name a reader looks for), then the river (one, the
    # longest in the circle), the roads by class and length, and the next stations, nearest first
    if near:
        name_station(*near[0])
    river_groups = [(-ln_len, th, en, lines) for (th, en), (_c, ln_len, lines) in named_rivers.items() if ln_len >= 1000]
    labels += place_line_labels(river_groups, bx, MAX_RIVER_LABELS, 'river')
    road_groups = [(-score, th, en, lines) for (th, en), (cls, score, lines) in named_roads.items()
                   if score >= 400 and base_chars(th) <= 18 and base_chars(en or th) <= 20]
    labels += place_line_labels(road_groups, bx, MAX_ROAD_LABELS, 'road')
    for st in near[1:]:
        if len(seen) >= MAX_STATION_LABELS:
            break
        name_station(*st)
    return {
        'r': [svg_path(roads[c]) for c in range(len(ROAD_CLASSES))],
        't': svg_path(rails),
        'w': svg_path(rivers),
        's': st_pts,
        'L': labels,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--osm', required=True, type=Path)
    args = ap.parse_args()
    if not args.osm.is_file():
        fail(f'{args.osm}: not found')
    import osmium
    from pyproj import Transformer
    V = located_set()
    if not V:
        fail('no located centers')
    stations_doc = json.loads((ROOT / 'data' / 'stations.json').read_text(encoding='utf-8'))
    fields = stations_doc['fields']
    if fields[:5] != ['id', 'name', 'nameEn', 'lon', 'lat']:
        fail(f'data/stations.json fields {fields[:5]}')
    stations = stations_doc['stations']
    # 0.1° cells each center's 5 km box touches
    boxes = {}
    for vid, v in V.items():
        dlat = (RADIUS_M + 300) / 111_320
        dlon = dlat / max(0.2, math.cos(math.radians(v['lat'])))
        for i in range(math.floor((v['lon'] - dlon) * 10), math.floor((v['lon'] + dlon) * 10) + 1):
            for j in range(math.floor((v['lat'] - dlat) * 10), math.floor((v['lat'] + dlat) * 10) + 1):
                boxes.setdefault((i, j), set()).add(vid)
    ways = read_osm(args.osm, boxes)
    by_venue = {vid: [] for vid in V}
    for wi, (_k, _c, _th, _en, pts, _wid) in enumerate(ways):
        lo0, la0 = min(p[0] for p in pts), min(p[1] for p in pts)
        lo1, la1 = max(p[0] for p in pts), max(p[1] for p in pts)
        cand = set()
        for i in range(math.floor(lo0 * 10), math.floor(lo1 * 10) + 1):
            for j in range(math.floor(la0 * 10), math.floor(la1 * 10) + 1):
                cand |= boxes.get((i, j), set())
        for vid in cand:
            by_venue[vid].append(wi)

    def tf_factory(v):
        return Transformer.from_crs('EPSG:4326', f'+proj=aeqd +lat_0={v["lat"]} +lon_0={v["lon"]} +datum=WGS84 +units=m', always_xy=True)

    # centers with each kind of line within 5 km, and the names placed over all centers
    counts = {'withRoad': 0, 'withRail': 0, 'withRiver': 0, 'withStations': 0, 'labels': {'road': 0, 'river': 0, 'station': 0}}
    shards = {}
    for vid in sorted(V):
        rec = build_venue(V[vid], sorted(set(by_venue[vid]), key=lambda wi: (ways[wi][5], wi)), ways, stations, tf_factory)
        counts['withRoad'] += 1 if any(rec['r']) else 0
        counts['withRail'] += 1 if rec['t'] else 0
        counts['withRiver'] += 1 if rec['w'] else 0
        counts['withStations'] += 1 if rec['s'] else 0
        for lab in rec['L']:
            counts['labels'][lab[0]] += 1
        shards.setdefault(shard_of(vid), {})[vid] = rec
    OUT.mkdir(parents=True, exist_ok=True)
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    for k in range(SHARDS):
        (OUT / f'{k:03d}.json').write_text(dump({'venues': shards.get(k, {})}), encoding='utf-8')
    hdr = osmium.io.Reader(str(args.osm), osmium.osm.osm_entity_bits.NOTHING)
    stamp = hdr.header().get('osmosis_replication_timestamp')
    hdr.close()
    meta = {
        'schema': 'shoppingcenter-residents-map/1',
        'asOf': (stamp or '')[:10],
        'shards': SHARDS,
        'venues': len(V),
        'points': {'sha256': points_sha(V), 'of': 'id,lon,lat of each located center (7 decimals), one line each, sorted by id'},
        'unit_m': UNIT_M,
        'radius_m': RADIUS_M,
        'simplify_m': SIMPLIFY_M,
        'roads': list(ROAD_CLASSES),
        'rail': list(RAIL_KINDS),
        'labels': {'road': MAX_ROAD_LABELS, 'river': MAX_RIVER_LABELS, 'station': MAX_STATION_LABELS, 'fittedOnPx': MAP_PX},
        'source': {
            'osm': {'file': args.osm.name, 'sha256': sha256(args.osm), 'bytes': args.osm.stat().st_size, 'timestamp': stamp,
                    'publisher': 'Geofabrik extract of OpenStreetMap', 'license': 'ODbL 1.0', 'attribution': '© OpenStreetMap contributors'},
            'stations': {'file': 'data/stations.json', 'sha256': sha256(ROOT / 'data' / 'stations.json'), 'release': stations_doc['meta'].get('release'),
                         'asOf': stations_doc['meta'].get('asOf')},
            'venues': {'file': 'data/venues.json', 'sha256': sha256(ROOT / 'data' / 'venues.json')},
        },
        'counts': counts,
        'note': 'lines to read the map by, not a network to measure on; names as OpenStreetMap writes them, shortened (ถนน → ถ., Road → Rd)',
        'owner': '2026-11-20 16:35: heatmap วงกลมอันนี้ดี แต่ยังดูยากอยู่ … อย่างน้อยควรแสดงแนวถนน overlay ใน heatmap ด้วย',
    }
    (OUT / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    sizes = [(OUT / f'{k:03d}.json').stat().st_size for k in range(SHARDS)]
    print(f'{OUT.relative_to(ROOT)}: {len(V)} centers in {SHARDS} shards, {sum(sizes):,} bytes (largest {max(sizes):,}); '
          f'{len(ways):,} ways read; labels {counts["labels"]}; without a road {len(V) - counts["withRoad"]}')


if __name__ == '__main__':
    main()

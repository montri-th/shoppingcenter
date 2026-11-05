#!/usr/bin/env python3
"""Building source per area — which buildings the map draws in each อปท. (Bangkok: เขต).

  python3 -I scripts/build-building-units.py --api <base info cache> --geom <LAO geometry cache> \
      --counts <building-source counts JSON> --reuse <montri-th/hotel checkout> [--venues data/venues.json] --out .

Owner 2026-11-05 00:34: “ช่วยปรับการแสดงผล 3d building mass พร้อม terrain ในรูปแบบเดียวกับ https://montri-th.github.io/hotel
… รวมถึงการใช้แหล่งข้อมูลอาคารเสริมจาก CityMETER: building ด้วย เพื่อซ่อมพื้นที่ต่างจังหวัดที่ OSM มีข้อมูลอาคารจำกัด”. The
rule is CityMETER · Hotel's (owner decision 2026-11-01, “ใช้เกณฑ์ 15% … ได้”, “กรุงเทพฯ ใช้เขตเป็นหน่วย … ได้”):
  - unit = a CityMETER local administration (อปท., production base info `municipalityInfos`, outline from production
    `base/info/geom/{id}/MUNICIPALITY`) that holds at least one venue with a point; in Bangkok a เขต (`districtInfos`,
    buildings read per แขวง);
  - CityMETER Building V4 when its building count is at least 1.15 × the OpenStreetMap count of the same unit,
    otherwise OpenStreetMap; a unit where both hold fewer than THIN buildings is flagged `gap`;
  - a unit the hotel release already decided (same rule, its counts of 2026-11-01) is reused as decided (`--reuse`,
    its data/building-units files; `countsFrom` names the commit); every other unit is decided from `--counts`
    (CityMETER: production `building/info/lv1/{province}?version=V4`; OpenStreetMap: ways tagged building=* in the
    unit's bounding box as an upper bound, else in the unit polygon).
A venue is placed in a unit by its point: inside a reused unit's outline, else inside the production outline of an อปท.
whose extent holds it (point in polygon, never by name); in Bangkok by the เขต of its district code.

Output: data/building-units/index.json (meta, rule, per-province summary) and data/building-units/{PROV}.json (units
with id, code, name, source, basis, counts, box; a CityMETER unit also carries its simplified outline and the
production tile units it is read by, each with a national `slot` — js/massing.js#cmFeatureId).
"""
import argparse, collections, glob, hashlib, json, math, os, subprocess

RATIO = 1.15
THIN = 10
SIMPLIFY_DEG = 0.0001   # ≈ 11 m
MAX_VERTICES = 240


def dp(points, eps):
    """Douglas–Peucker on an OPEN polyline (first and last points kept)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        (x1, y1), (x2, y2) = points[s], points[e]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        idx, dmax = -1, eps
        for i in range(s + 1, e):
            px, py = points[i]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / length if length else math.hypot(px - x1, py - y1)
            if d > dmax:
                idx, dmax = i, d
        if idx > 0:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    return [p for p, k in zip(points, keep) if k]


def simplify(ring):
    """A closed ring simplified to at most MAX_VERTICES (split at the vertex farthest from the first)."""
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else list(ring)
    if len(pts) < 3:
        return None
    k = max(range(1, len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    eps = SIMPLIFY_DEG
    while True:
        a = dp(pts[:k + 1], eps)
        b = dp(pts[k:] + [pts[0]], eps)
        out = a + b[1:-1]
        if len(out) <= MAX_VERTICES or eps > 0.05:
            break
        eps *= 1.4
    out = [[round(x, 5), round(y, 5)] for x, y in out]
    dedup = [p for i, p in enumerate(out) if i == 0 or p != out[i - 1]]
    dedup.append(dedup[0])
    return dedup if len(dedup) >= 4 else None


def ring_area(r):
    return abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))) / 2


def polygons(geom):
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates'] if geom['type'] == 'MultiPolygon' else []


def outline(geom):
    out = []
    for p in polygons(geom):
        if not p or ring_area(p[0]) < 1e-9:
            continue
        outer = simplify(p[0])
        if not outer:
            continue
        holes = [h for h in (simplify(h) for h in p[1:] if ring_area(h) >= 1e-9) if h]
        out.append([outer] + holes)
    return out


def lonlat_bbox(extent):
    """EPSG:3857 [minx, miny, maxx, maxy] → lon/lat [w, s, e, n] (5 decimals)."""
    extent = json.loads(extent) if isinstance(extent, str) else extent
    lon = lambda x: x * 180 / 20037508.34
    lat = lambda y: math.degrees(2 * math.atan(math.exp(y / 6378137)) - math.pi / 2)
    return [round(lon(extent[0]), 5), round(lat(extent[1]), 5), round(lon(extent[2]), 5), round(lat(extent[3]), 5)]


def pip(pt, ring):
    x, y = pt
    inside = False
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[i - 1][0], ring[i - 1][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
    return inside


def in_polys(pt, polys):
    return any(pip(pt, p[0]) and not any(pip(pt, h) for h in p[1:]) for p in polys)


def decide(cm, osm, osm_upper, method):
    """Returns (source, basis): 'cm' or 'osm' by the 1.15 rule, with the evidence it rests on."""
    if method == 'bbox_upper_bound' and cm and osm_upper is not None and osm_upper * RATIO <= cm:
        return 'cm', 'cm_at_least_1.15x_osm_bbox_upper_bound'
    if osm is None:
        return 'osm', 'osm_count_unavailable_status_quo'
    if cm and cm >= RATIO * osm:
        return 'cm', 'cm_at_least_1.15x_osm'
    return 'osm', 'cm_below_1.15x_osm' if cm else 'cm_count_unavailable'


def is_gap(cm, osm, osm_upper):
    o = osm if osm is not None else osm_upper
    return (cm or 0) < THIN and o is not None and o < THIN


def sha256_file(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--api', required=True, help='production base info cache: base-lv0.json, base-<province id>.json')
    ap.add_argument('--geom', required=True, help='production อปท. outlines: <id>.json (base/info/geom/<id>/MUNICIPALITY)')
    ap.add_argument('--counts', required=True, help='building-source counts of the units the hotel release did not decide')
    ap.add_argument('--reuse', required=True, help='montri-th/hotel checkout (data/building-units)')
    ap.add_argument('--venues', default='data/venues.json')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    commit = subprocess.run(['git', '-C', a.reuse, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    reuse_tag = f'montri-th/hotel@{commit[:7]}' if commit else 'montri-th/hotel'
    reused, reused_province, reuse_files = {}, {}, {}
    for path in sorted(glob.glob(os.path.join(a.reuse, 'data', 'building-units', '*.json'))):
        if path.endswith('index.json'):
            continue
        doc = json.load(open(path, encoding='utf-8'))
        reuse_files[f"data/building-units/{os.path.basename(path)}"] = sha256_file(path)
        for u in doc['units']:
            reused[u['id']] = u
            reused_province[u['id']] = doc['province']
    reuse_index = os.path.join(a.reuse, 'data', 'building-units', 'index.json')
    reuse_meta = json.load(open(reuse_index, encoding='utf-8'))['meta'] if os.path.exists(reuse_index) else {}

    lv0 = json.load(open(os.path.join(a.api, 'base-lv0.json'), encoding='utf-8'))['value']['provinceInfos']
    counts_doc = json.load(open(a.counts, encoding='utf-8'))
    rows = {r['id']: r for r in counts_doc['rows']}
    munis, districts = {}, {}
    for p in lv0:
        base = json.load(open(os.path.join(a.api, f"base-{p['id']}.json"), encoding='utf-8'))['value']
        for m in base['municipalityInfos']:
            munis[m['id']] = {**m, 'province': p['abbrEn'], 'bbox': lonlat_bbox(m['extent'])}
        if p['abbrEn'] == 'BKK':
            for d in base['districtInfos']:
                districts[str(d['code'])] = d['id']
    geom_cache = {}

    def lao_outline(uid):
        if uid not in geom_cache:
            path = os.path.join(a.geom, uid + '.json')
            if not os.path.exists(path):
                geom_cache[uid] = None
            else:
                v = json.load(open(path, encoding='utf-8'))['value']
                geom_cache[uid] = (json.loads(v) if isinstance(v, str) else v) or None
        return geom_cache[uid]

    # Place every venue with a point in its unit (never by name).
    doc = json.load(open(a.venues, encoding='utf-8'))
    venues = [r for r in doc['rows'] if isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lon'), (int, float))]
    reused_cm = [u for u in reused.values() if u['source'] == 'cm' and u.get('outline')]
    unit_of, unplaced = {}, []
    for r in venues:
        pt = (r['lon'], r['lat'])
        hit = next((u['id'] for u in reused_cm if u['bbox'][0] <= pt[0] <= u['bbox'][2] and u['bbox'][1] <= pt[1] <= u['bbox'][3] and in_polys(pt, u['outline'])), None)
        if not hit and r.get('provinceCode') == 'BKK':
            hit = districts.get(str(r.get('districtCode') or ''))
        if not hit:
            cands = [m for m in munis.values() if m['bbox'][0] <= pt[0] <= m['bbox'][2] and m['bbox'][1] <= pt[1] <= m['bbox'][3]]
            inside = sorted(m['id'] for m in cands if (g := lao_outline(m['id'])) and in_polys(pt, polygons(g)))
            hit = inside[0] if inside else None
        if hit:
            unit_of[r['id']] = hit
        else:
            unplaced.append(r['id'])
    per_unit = collections.Counter(unit_of.values())

    prepared, missing = collections.defaultdict(list), []
    for uid, n in per_unit.items():
        if uid in reused:
            u = {k: v for k, v in reused[uid].items() if k != 'hotels'}
            u['tileUnits'] = [{k: v for k, v in t.items() if k != 'slot'} for t in u.get('tileUnits', [])]
            u.update({'venues': n, 'countsFrom': reuse_tag})
            prepared[reused_province[uid]].append(u)
            continue
        m = munis.get(uid)
        r = rows.get(uid)
        if not m or not r:
            missing.append(uid)
            continue
        src, basis = decide(r.get('cm'), r.get('osm'), r.get('osmUpper'), r.get('osmMethod'))
        u = {'id': uid, 'code': str(m['code']), 'name': m['nameTh'], 'kind': 'municipality', 'source': src, 'basis': basis, 'venues': n,
             'cm': r.get('cm'), 'osm': r.get('osm'), 'osmUpper': r.get('osmUpper'), 'osmMethod': r.get('osmMethod'),
             'gap': is_gap(r.get('cm'), r.get('osm'), r.get('osmUpper')), 'bbox': m['bbox'], 'osmBaseDay': r.get('osmBaseDay'), 'countsFrom': 'shoppingcenter'}
        if src == 'cm':
            g = lao_outline(uid)
            u.update({'tileType': 'MUNICIPALITY', 'tileUnits': [{'id': uid, 'bbox': m['bbox']}], 'outline': outline(g) if g else []})
            if not g:
                missing.append(uid)
        prepared[m['province']].append(u)
    if missing:
        raise SystemExit(f'units without counts or outline: {missing[:5]} (+{max(0, len(missing) - 5)})')

    # National slot of every CityMETER tile unit (js/massing.js#cmFeatureId): stable ids whatever the focus.
    all_tile_units = sorted({t['id'] for units in prepared.values() for u in units if u['source'] == 'cm' for t in u['tileUnits']})
    slot_of = {tid: i for i, tid in enumerate(all_tile_units)}
    assert len(slot_of) < 8192, 'tile-unit index exceeds the id space'
    out_dir = os.path.join(a.out, 'data', 'building-units')
    os.makedirs(out_dir, exist_ok=True)
    for old in glob.glob(os.path.join(out_dir, '*.json')):
        os.remove(old)
    summary, totals = [], collections.Counter()
    for code in sorted(prepared):
        units = sorted(prepared[code], key=lambda u: (-u['venues'], u['code']))
        for u in units:
            for t in u.get('tileUnits', []):
                t['slot'] = slot_of[t['id']]
        body = json.dumps({'province': code, 'units': units}, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(out_dir, f'{code}.json'), 'w', encoding='utf-8') as fh:
            fh.write(body)
        c = collections.Counter(u['source'] for u in units)
        gaps = sum(1 for u in units if u['gap'])
        totals.update(c); totals['gap'] += gaps
        summary.append({'province': code, 'units': len(units), 'cm': c['cm'], 'osm': c['osm'], 'gap': gaps,
                        'venues': {s: sum(u['venues'] for u in units if u['source'] == s) for s in ('cm', 'osm')},
                        'reused': sum(1 for u in units if u['countsFrom'] != 'shoppingcenter'),
                        'bytes': len(body.encode('utf-8')), 'sha256': hashlib.sha256(body.encode('utf-8')).hexdigest()})
    index = {
        'meta': {
            'rule': f'CityMETER Building V4 when its count ≥ {RATIO} × the OpenStreetMap count of the same unit, else OpenStreetMap (owner 2026-11-01, CityMETER · Hotel; brought here 2026-11-05); both under {THIN} buildings → flagged gap',
            'partsOverride': 'inside a CityMETER unit the page keeps OpenStreetMap buildings mapped in parts (building:part, OpenMapTiles hide_3d outlines) and leaves out the CityMETER buildings standing in their outline',
            'unit': 'อปท. (CityMETER production municipalityInfos) holding at least one venue with a point; Bangkok: เขต (tiles per แขวง)',
            'placement': 'venue point inside the unit outline (reused outline, else production base/info/geom); Bangkok by district code; never by name',
            'cm': {'dataset': 'CityMETER Building V4', 'counts': counts_doc.get('cm', {}).get('counts', ''), 'tiles': 'production building/detailMvt/{z}/{x}/{y}?inTileType&inTileId&version=V4', 'heights': 'height_m, model estimate'},
            'osm': {'dataset': 'OpenStreetMap', 'counts': counts_doc.get('osm', {}).get('counts', ''), 'osmBase': counts_doc.get('osm', {}).get('osmBase', '')},
            'reused': {'from': reuse_tag, 'rule': reuse_meta.get('rule', ''), 'countsBuiltAt': reuse_meta.get('countsBuiltAt', ''), 'files': reuse_files},
            'ids': 'a CityMETER tile unit carries a national slot; building id = 2^52 + (z14 tile, slot, ordinal) (js/massing.js#cmFeatureId)',
            'countsBuiltAt': counts_doc.get('builtAt', ''), 'countsSha256': sha256_file(a.counts),
            'venues': {'withPoint': len(venues), 'placed': len(unit_of), 'unplaced': len(unplaced)},
            'totals': dict(totals),
        },
        'provinces': summary,
    }
    with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({'totals': dict(totals), 'provinces': len(summary), 'units': sum(s['units'] for s in summary),
                      'reused': sum(s['reused'] for s in summary), 'venues': index['meta']['venues'],
                      'bytes': sum(s['bytes'] for s in summary)}, ensure_ascii=False))


if __name__ == '__main__':
    main()

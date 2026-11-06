#!/usr/bin/env python3
"""Write data/venue-models.json and data/venue-models/<venue_id>.json from LOD1 masses in model metres.

Owner 2026-11-06 09:19: “ผม upload .skp สำหรับ PARC Bangna และ Live Ramintra พี่ช่วยนำไปใช้งานร่วมกันใน website และ
simplify ให้เหมาะสมที่ user จะใช้งานร่วมกับอาคารอื่นๆในเวบได้ลื่นไหล optimize ให้ดี”; 09:22 “จะขึ้นใหม่ให้พอได้รูปร่าง
3d building mass ก็ได้นะครับ ให้โหลดเร็วๆไม่หนัก”.

usage: python3 scripts/build-venue-models.py <masses dir> [--spec scripts/venue-model-placements.json] [--out data]

<masses dir>/<venue_id>.masses.json comes from scripts/skp-masses.py (model metres: polygons, base and top above the
model's ground). The design files themselves stay outside the repository; only the derived boxes, the placement and
the file's date are published. The spec places each model on the map: local = R(theta) (p - centre) + shift, in
metres east/north of the venue's registry point (data/venues.json), and clips it to the site ring when one is given.
"""
import argparse, datetime, json, math, os, sys

from shapely import affinity
from shapely.geometry import MultiPolygon, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICT = datetime.timezone(datetime.timedelta(hours=7))


def venue_points(path):
    doc = json.load(open(path, encoding='utf-8'))
    return {r['id']: (r['lon'], r['lat']) for r in doc['rows'] if isinstance(r.get('lon'), (int, float)) and isinstance(r.get('lat'), (int, float))}


def lonlat(ring, lon0, lat0):
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    return [[round(lon0 + x / kx, 7), round(lat0 + y / ky, 7)] for x, y in ring]


def place(masses, spec, lon0, lat0):
    c, theta, t = spec['centre'], spec['rotation_deg'], spec['shift_m']
    clip = Polygon(spec['site_ring_m']).buffer(spec.get('site_buffer_m', 0)) if spec.get('site_ring_m') else None
    drop = spec.get('drop_parts', [])
    feats = []
    for i, m in enumerate(masses):
        if i in drop or m['top'] - m['base'] < spec.get('min_thickness_m', 0.5):
            continue
        g = Polygon(m['outer'], m.get('holes', [])).buffer(0)
        g = affinity.translate(g, -c[0], -c[1])
        g = affinity.rotate(g, theta, origin=(0, 0))
        g = affinity.translate(g, t[0], t[1])
        if clip is not None:
            g = g.intersection(clip)
        parts = list(g.geoms) if isinstance(g, MultiPolygon) else ([g] if not g.is_empty else [])
        for p in parts:
            if p.geom_type != 'Polygon' or p.area < spec.get('min_area_m2', 12):
                continue
            p = p.simplify(spec.get('simplify_m', 0.3), preserve_topology=True)
            rings = [lonlat(p.exterior.coords, lon0, lat0)] + [lonlat(h.coords, lon0, lat0) for h in p.interiors]
            feats.append({'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': rings},
                          'properties': {'base_m': round(m['base'], 1), 'height_m': round(m['top'], 1), 'area_m2': round(p.area)}})
    return feats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('masses')
    ap.add_argument('--spec', default=os.path.join(ROOT, 'scripts', 'venue-model-placements.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'data'))
    a = ap.parse_args()
    spec = json.load(open(a.spec, encoding='utf-8'))
    points = venue_points(os.path.join(a.out, 'venues.json'))
    os.makedirs(os.path.join(a.out, 'venue-models'), exist_ok=True)
    built_on = datetime.datetime.now(ICT).date().isoformat()
    index = []
    for vid, s in spec['venues'].items():
        if vid not in points:
            sys.exit(f'{vid}: not in data/venues.json with a point')
        lon0, lat0 = points[vid]
        masses = json.load(open(os.path.join(a.masses, f'{vid}.masses.json'), encoding='utf-8'))
        feats = place(masses['masses'], s['placement'], lon0, lat0)
        if not feats:
            sys.exit(f'{vid}: no mass left after placement')
        xs = [x for f in feats for r in f['geometry']['coordinates'] for x, _ in r]
        ys = [y for f in feats for r in f['geometry']['coordinates'] for _, y in r]
        far = max(math.hypot((x - lon0) * 111320 * math.cos(math.radians(lat0)), (y - lat0) * 110574) for x, y in zip(xs, ys))
        if far > 600:
            sys.exit(f'{vid}: a mass vertex lies {far:.0f} m from the registry point (limit 600 m)')
        meta = {'venue_id': vid, 'source': s['source'], 'placement': {k: v for k, v in s['placement'].items() if k != 'site_ring_m'},
                'ground_model_m': masses.get('ground_m'), 'builtOn': built_on}
        doc = {'type': 'FeatureCollection', 'meta': meta, 'features': feats}
        text = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
        rel = f'data/venue-models/{vid}.json'
        open(os.path.join(ROOT, rel) if a.out == os.path.join(ROOT, 'data') else os.path.join(a.out, 'venue-models', f'{vid}.json'), 'w', encoding='utf-8').write(text)
        index.append({'venue_id': vid, 'file': rel, 'bbox': [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)],
                      'parts': len(feats), 'bytes': len(text.encode('utf-8')), 'maxHeightM': max(f['properties']['height_m'] for f in feats),
                      'source': s['source']})
        print(f'{vid}: {len(feats)} parts, {len(text.encode("utf-8")):,} bytes, farthest vertex {far:.0f} m')
    out = {'meta': {'schemaVersion': 1, 'dataset': 'มวลอาคารตามแบบของโครงการ (LOD1)', 'builtOn': built_on,
                    'rule': 'one file per venue, loaded from zoom 14 or when the venue opens; replaces its pin and site buildings',
                    'notSurvey': True}, 'models': index}
    json.dump(out, open(os.path.join(a.out, 'venue-models.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()

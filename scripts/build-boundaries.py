#!/usr/bin/env python3
"""Rebuild the district boundary input of the data build from the RTSD district polygons that CityMETER production uses.

  python3 -I scripts/build-boundaries.py --rtsd <geoBoundaries-THA-ADM2.geojson> --ogd <OpenGISData districts.geojson> \
      --production <dir with base-info-lv0.json and prod-districts.json> --out <dir>

Writes <out>/districts.geojson in the schema scripts/build-data.py reads (amp_code, pro_code, amp_th, amp_en,
area_sqkm per feature) and <out>/crosswalk.json (one receipt per polygon).

Why (owner, 4 Nov 2026 21:56): the OpenGISData-Thailand polygons are coarse in Bangkok — Samphanthawong has 12 vertices
and its outline crossed the Chao Phraya into Thonburi. The Royal Thai Survey Department district polygons (2019, OCHA
ROAP / HDX COD-AB, distributed by geoBoundaries gbOpen THA ADM2, CC BY 3.0 IGO) follow the river. They are the polygons
CityMETER production uses: production's district extent (base/info/lv1 `extent`) equals their bounding box and
production's `areaSqm` equals their geodesic area.

Geometry: RTSD, unchanged (only made valid when a ring self-intersects).
Codes and names: each RTSD polygon takes the OpenGISData district (amp_code, pro_code, amp_th, amp_en) it overlaps
most; the build then maps codes to CityMETER production lv1 exactly as before. The match must be one-to-one, cover
both sets and share at least MIN_SHARE of the RTSD polygon, and the English names must agree (NAME_VARIANTS lists the
romanisations that differ); otherwise the script stops.
Area: CityMETER production lv1 areaSqm (the same polygons), so venues per km² use production's district area.
"""
import argparse
import difflib
import hashlib
import json
import re
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.strtree import STRtree
from shapely.validation import make_valid

MIN_SHARE = 0.75
# RTSD shapeName → OpenGISData amp_en where the romanisation differs (same district, same polygon by overlap).
NAME_VARIANTS = {'Vadhana': 'Watthana'}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def valid(geometry):
    g = shape(geometry)
    if not g.is_valid:
        g = make_valid(g)
        # make_valid can return a collection with stray lines; keep the polygonal part only.
        if g.geom_type == 'GeometryCollection':
            from shapely.geometry import MultiPolygon
            parts = [p for p in g.geoms if p.geom_type in ('Polygon', 'MultiPolygon')]
            polys = [q for p in parts for q in (p.geoms if p.geom_type == 'MultiPolygon' else [p])]
            g = MultiPolygon(polys)
    return g


def name_key(value):
    return re.sub(r'[^a-z]', '', str(value or '').lower())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--rtsd', required=True, help='geoBoundaries gbOpen THA ADM2 GeoJSON (RTSD 2019)')
    ap.add_argument('--ogd', required=True, help='OpenGISData-Thailand districts.geojson (codes and names)')
    ap.add_argument('--production', required=True, help='dir with prod-districts.json (CityMETER production lv1)')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    rtsd = json.loads(Path(a.rtsd).read_text())
    ogd = json.loads(Path(a.ogd).read_text())
    prod = json.loads((Path(a.production) / 'prod-districts.json').read_text())
    prod_by_code = {d['code']: d for ds in prod['provinces'].values() for d in ds}
    prod_by_name = {}
    for abbr, ds in prod['provinces'].items():
        for d in ds:
            prod_by_name.setdefault(d['th'], []).append(d)

    og = [(f['properties'], valid(f['geometry'])) for f in ogd['features']]
    tree = STRtree([g for _, g in og])
    features, receipts, used, problems = [], [], {}, []
    for i, f in enumerate(rtsd['features']):
        g = valid(f['geometry'])
        scores = sorted(((g.intersection(og[j][1]).area, j) for j in tree.query(g)), reverse=True)
        if not scores or scores[0][0] <= 0:
            problems.append(f"RTSD {f['properties'].get('shapeName')}: no overlapping district")
            continue
        inter, j = scores[0]
        p = og[j][0]
        share = inter / g.area
        rtsd_name = f['properties'].get('shapeName', '')
        names = (name_key(NAME_VARIANTS.get(rtsd_name, rtsd_name)), name_key(p['amp_en']))
        if share < MIN_SHARE:
            problems.append(f"RTSD {rtsd_name}: best overlap {share:.2f} with {p['amp_code']}")
        if difflib.SequenceMatcher(None, *names).ratio() < 0.75:
            problems.append(f"RTSD {rtsd_name} vs OpenGISData {p['amp_en']} ({p['amp_code']}): names disagree")
        if p['amp_code'] in used:
            problems.append(f"district {p['amp_code']} matched twice ({used[p['amp_code']]}, {rtsd_name})")
        used[p['amp_code']] = rtsd_name
        prod_d = prod_by_code.get(p['amp_code'])
        if not prod_d:
            same = [d for d in prod_by_name.get(p['amp_th'], []) if d['code'][:2] == p['pro_code']]
            prod_d = same[0] if len(same) == 1 else None
        if not prod_d or not prod_d.get('areaSqm'):
            problems.append(f"district {p['amp_code']} {p['amp_th']}: no production area")
            continue
        props = {'amp_code': p['amp_code'], 'amp_th': p['amp_th'], 'amp_en': p['amp_en'], 'pro_code': p['pro_code'],
                 'pro_th': p.get('pro_th'), 'pro_en': p.get('pro_en'), 'area_sqkm': round(prod_d['areaSqm'] / 1e6, 6),
                 'rtsd_shape_id': f['properties'].get('shapeID'), 'rtsd_shape_name': rtsd_name}
        features.append({'type': 'Feature', 'properties': props, 'geometry': mapping(g)})
        receipts.append({'rtsdIndex': i, 'rtsdName': rtsd_name, 'code': p['amp_code'], 'ogdName': p['amp_en'],
                         'shareOfRtsd': round(share, 4), 'shareOfOgd': round(inter / og[j][1].area, 4),
                         'productionCode': prod_d['code'], 'areaKm2': props['area_sqkm']})
    missing = sorted({p['amp_code'] for p, _ in og} - set(used))
    if missing:
        problems.append(f'OpenGISData districts without an RTSD polygon: {missing}')
    if problems:
        raise SystemExit('boundary crosswalk failed:\n  ' + '\n  '.join(problems))

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    features.sort(key=lambda f: f['properties']['amp_code'])
    source = {
        'geometry': 'Royal Thai Survey Department (RTSD) district polygons 2019 · OCHA ROAP / HDX COD-AB · geoBoundaries gbOpen THA ADM2',
        'license': 'CC BY 3.0 IGO',
        'url': 'https://www.geoboundaries.org/countryDownloads.html',
        'rtsdSha256': sha256(a.rtsd),
        'codes': 'OpenGISData-Thailand amp_code by largest overlap, then CityMETER production lv1 (as before)',
        'ogdSha256': sha256(a.ogd),
        'area': 'CityMETER production lv1 areaSqm (equal to the geodesic area of these polygons)',
    }
    (out / 'districts.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'metadata': source, 'features': features},
                                                       ensure_ascii=False, separators=(',', ':')))
    (out / 'crosswalk.json').write_text(json.dumps({'source': source, 'minShare': MIN_SHARE, 'nameVariants': NAME_VARIANTS,
                                                    'districts': receipts}, ensure_ascii=False, indent=1))
    low = sorted(r['shareOfRtsd'] for r in receipts)[:3]
    print(json.dumps({'districts': len(features), 'lowestShares': low, 'out': str(out)}))


if __name__ == '__main__':
    main()

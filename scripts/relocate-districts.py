#!/usr/bin/env python3
"""Re-derive district and province membership of the published snapshot from new boundary polygons.

  python3 -I scripts/relocate-districts.py --boundaries <dir from scripts/build-boundaries.py> \
      --production <dir with base-info-lv0.json and prod-districts.json> [--mapshaper <mapshaper>]

For a boundary change without a new export of the Research Master: the venue rows stay byte for byte except
provinceCode and districtCode, which are recomputed exactly as scripts/build-data.py assigns them (point-in-polygon of
the located reference point on the full-resolution polygons, Locator; unlocated rows keep none). The same functions of
build-data.py then rewrite the first finding (meta.checks.aha), the membership counts, meta.boundary, meta.inputs and
the boundary files (data/districts.geojson, data/provinces.geojson, data/districts/<province>.geojson). A later full
build with the same export and the same boundaries gives the same membership.

Reads and rewrites data/venues.json, data/details/*.json, data/pending.json, data/build-report.json and the
venueCoreSha256 receipt of data/tenants/build-report.json (venue ids never change); writes meta.relocation with the
date, the source and how many rows changed. Run once per boundary change, on the snapshot the build wrote.
"""
import argparse
import importlib.util
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
spec = importlib.util.spec_from_file_location('build_data', Path(__file__).with_name('build-data.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--boundaries', required=True)
    ap.add_argument('--production', required=True)
    ap.add_argument('--mapshaper', default=str(ROOT / '.cache/tools/node_modules/.bin/mapshaper'))
    ap.add_argument('--simplify', type=float, default=build.COARSE_PERCENT)
    ap.add_argument('--data', default=str(DATA))
    a = ap.parse_args()
    data = Path(a.data)

    districts_geojson, district_meta, district_geoms, prod_provinces, problems, remapped = build.load_boundaries(a.boundaries, a.production)
    if problems:
        raise SystemExit('boundary problems: ' + '; '.join(problems))
    locator = build.Locator(district_meta, district_geoms)
    prov_area = Counter()
    for d in district_meta:
        prov_area[d['province']] += d['areaKm2']

    def place(lon, lat):
        area = locator.locate(lon, lat)
        return (area['province'], area['code']) if area else (None, None)

    venues = json.loads((data / 'venues.json').read_text())
    meta = venues['meta']
    if not all(isinstance(r, dict) for r in venues['rows']):
        raise SystemExit('data/venues.json rows are not objects (build-data.py writes compact dict rows)')
    rows = venues['rows']
    changes, outside = [], Counter()
    for r in rows:
        if not r.get('located') or r.get('lat') is None or r.get('lon') is None:
            continue
        prov, code = place(r['lon'], r['lat'])
        if prov is None:
            outside[r.get('tier')] += 1
        if (prov, code) != (r.get('provinceCode'), r.get('districtCode')):
            changes.append({'id': r['id'], 'name': r.get('name'), 'from': [r.get('provinceCode'), r.get('districtCode')],
                            'to': [prov, code], 'addrDistrict': r.get('addrDistrict')})
            # compact() in build-data drops None values; keep the published shape.
            for key, value in (('provinceCode', prov), ('districtCode', code)):
                if value is None:
                    r.pop(key, None)
                else:
                    r[key] = value
    moved = {c['id']: c for c in changes}

    # detail shards carry the same two fields
    for path in sorted((data / 'details').glob('*.json')):
        shard = json.loads(path.read_text())
        touched = False
        for vid, rec in shard['venues'].items():
            if vid in moved:
                prov, code = moved[vid]['to']
                for key, value in (('provinceCode', prov), ('districtCode', code)):
                    if value is None:
                        rec.pop(key, None)
                    else:
                        rec[key] = value
                touched = True
        if touched:
            build.write_json(path, shard)

    # quiet context rows: [id, name, lon, lat, provinceCode, districtCode, group, state?]
    pending = json.loads((data / 'pending.json').read_text())
    pending_changes = 0
    for rec in pending['rows']:
        prov, code = place(rec[2], rec[3]) if rec[2] is not None and rec[3] is not None else (rec[4], rec[5])
        if rec[2] is not None and prov is None:
            outside['unconfirmed' if len(rec) > 7 and rec[7] == 'reviewed' else 'pending'] += 1
        if (prov, code) != (rec[4], rec[5]):
            rec[4], rec[5] = prov, code
            pending_changes += 1
    (data / 'pending.json').write_text(json.dumps(pending, ensure_ascii=False, separators=(',', ':')))

    countable = [r for r in rows if r.get('countable')]
    supply = [r for r in countable if r.get('status') == 'supply']
    located_supply = [r for r in supply if r.get('located') and r.get('districtCode')]
    aha, per_district, per_province = build.first_finding(located_supply, district_meta, prov_area)
    before = {k: meta['counts'].get(k) for k in ('locatedSupply', 'provinces', 'districts', 'locatedOutsideBoundaries')}
    meta['counts'].update({
        'locatedSupply': len(located_supply), 'provinces': len(per_province), 'districts': len(per_district),
        'locatedOutsideBoundaries': dict(outside), 'groups': dict(Counter(r['group'] for r in located_supply)),
    })
    old_aha = meta['checks']['aha']
    meta['checks'].update({'aha': aha, 'problems': problems, 'districtCodeRemaps': remapped})
    meta['boundary'] = build.BOUNDARY
    digest = build.sha256(Path(a.boundaries) / 'districts.geojson')
    meta['inputs']['districts'] = {'file': 'RTSD districts.geojson (scripts/build-boundaries.py)', 'sha256': digest}
    meta['relocation'] = {
        'on': datetime.now(timezone.utc).date().isoformat(), 'by': 'scripts/relocate-districts.py',
        'reason': 'district polygons changed to RTSD (the polygons of CityMETER production); venue rows otherwise unchanged',
        'venueRowsChanged': len(changes), 'contextRowsChanged': pending_changes,
    }
    venues['rows'] = rows
    build.write_json(data / 'venues.json', venues)

    report_path = data / 'build-report.json'
    if report_path.is_file():
        report = json.loads(report_path.read_text())
        if 'inputs' in report:
            report['inputs']['districts'] = meta['inputs']['districts']
        build.write_json(report_path, report)

    build.write_boundary_files(districts_geojson, district_meta, district_geoms, prod_provinces, prov_area, a.mapshaper, a.simplify, data)

    # The tenant roster was built against data/venues.json (venue ids only); record the relocated file it now pairs with.
    tenant_report = data / 'tenants' / 'build-report.json'
    if tenant_report.is_file():
        tr = json.loads(tenant_report.read_text())
        if 'venueCoreSha256' in tr:
            tr['venueCoreSha256'] = build.sha256(data / 'venues.json')
            tr['venueCoreRelocation'] = meta['relocation']
            tenant_report.write_text(json.dumps(tr, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'venueRowsChanged': len(changes), 'contextRowsChanged': pending_changes, 'countsBefore': before,
                      'countsAfter': {k: meta['counts'][k] for k in before}, 'ahaBefore': old_aha, 'ahaAfter': aha}, ensure_ascii=False, indent=1))
    (Path(a.boundaries) / 'relocation-changes.json').write_text(json.dumps(changes, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()

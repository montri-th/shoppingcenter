#!/usr/bin/env python3
"""Write the D33 first-view check (meta.checks.firstView) into data/venues.json without a full data refresh.

  python3 -I scripts/refresh-first-view.py

`scripts/build-data.py` writes meta.checks.firstView on every refresh. Use this script only when the published venues
are unchanged but the check must be (re)computed — e.g. a new data/stations.json, or the first release of the check
(0.1.19). It runs the pipeline's own function (`build-data.py#first_finding_d33`) on the published rows and the district
areas of data/districts.geojson (the areas the pipeline used), changes nothing but meta.checks.firstView, and prints the
result. data/venues.json changes, so run `python3 -I scripts/refresh-tenant-receipt.py --previous <the previous file>`
afterwards (the shop-list receipt names the venue core by its SHA-256).
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'


def load_build():
    spec = importlib.util.spec_from_file_location('build_data', ROOT / 'scripts' / 'build-data.py')
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [str(ROOT / 'scripts' / 'build-data.py')]
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


def main():
    build = load_build()
    venues = json.loads((DATA / 'venues.json').read_text(encoding='utf-8'))
    districts = [f['properties'] for f in json.loads((DATA / 'districts.geojson').read_text(encoding='utf-8'))['features']]
    rows = venues['rows']
    located_supply = [r for r in rows if r.get('countable') and r.get('status') == 'supply' and r.get('located') and r.get('districtCode')]
    stations, meta = build.load_stations()
    first_view = build.first_finding_d33(located_supply, districts, stations)
    if first_view and meta:
        first_view['stations'] = {k: meta.get(k) for k in ('commit', 'sha256', 'release', 'asOf')}
    venues['meta'].setdefault('checks', {})['firstView'] = first_view
    build.write_json(DATA / 'venues.json', venues)
    print(json.dumps(first_view, ensure_ascii=False))


if __name__ == '__main__':
    main()

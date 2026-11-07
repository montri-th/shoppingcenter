#!/usr/bin/env python3
"""Write data/stations.json: the operating rail stations of CityMETER · Transit, as quiet context on the map.

  python3 scripts/build-stations.py <checkout of montri-th/transit>

Same source and rule as CityMETER · Hotel (scripts/build-data.py --transit there): a station with status `operating`
(listed on its operator's current station roster) is a service and is drawn; a station under construction is a
project, not a service, and is left out. The file pins the Transit commit and the SHA-256 of data/transit.json, so the
page names the release it reads. Distances on the page are straight lines between reference points (js/stations.js).
"""
import hashlib, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    repo = sys.argv[1]
    path = os.path.join(repo, 'data', 'transit.json')
    raw = open(path, 'rb').read()
    transit = json.loads(raw)
    commit = subprocess.run(['git', '-C', repo, 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    lines = {l['id']: l for l in transit['lines']}
    stations = []
    for s in transit['stations']:
        if s.get('status') != 'operating' or not isinstance(s.get('lat'), (int, float)) or not isinstance(s.get('lng'), (int, float)):
            continue
        names = [lines[i].get('name') or i for i in s.get('lineIds', []) if i in lines]
        stations.append([s['id'], s['name'], s.get('nameEn') or '', round(s['lng'], 6), round(s['lat'], 6), ' · '.join(names), ' '.join(s.get('codes') or [])])
    stations.sort(key=lambda r: r[0])
    meta = transit.get('meta') or {}
    doc = {'meta': {'dataset': 'CityMETER · Transit — สถานีรถไฟฟ้าที่เปิดให้บริการ', 'source': 'https://github.com/montri-th/transit',
                    'commit': commit, 'file': 'data/transit.json', 'sha256': hashlib.sha256(raw).hexdigest(),
                    'release': meta.get('release', ''), 'asOf': meta.get('asOf', ''),
                    'rule': 'status operating only (on the operator\'s current roster); construction stations are projects, not services',
                    'distance': 'straight line between reference points; 500 m = the radius the station panel and the first finding count'},
           'fields': ['id', 'name', 'nameEn', 'lon', 'lat', 'lines', 'codes'], 'stations': stations}
    out = os.path.join(ROOT, 'data', 'stations.json')
    json.dump(doc, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(stations)} operating stations · commit {commit[:7]} · {os.path.getsize(out):,} bytes → data/stations.json')


if __name__ == '__main__':
    main()

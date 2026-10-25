#!/usr/bin/env python3
"""Fetch the reference inputs of the data build into a local cache (never committed).

  python3 scripts/fetch-reference.py [--out .cache/reference]

  <out>/ogd/districts.geojson               OpenGISData-Thailand at the pinned commit (CC BY 4.0, DOPA-credited)
  <out>/production/base-info-lv0.json       CityMETER production province list (base/info/lv0)
  <out>/production/prod-districts.json      CityMETER production district list per province (base/info/lv1/{id})
  <out>/reference-receipt.json              URLs, retrieval time and SHA-256 of what was written

The boundary commit is pinned so area membership only changes when someone moves the pin on purpose.
Downloads go through curl (the same client used for the first build) and stop on the first HTTP error.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OGD_COMMIT = 'fafcea179cda88b689f5697c3866a449e79cd298'
OGD_URL = f'https://raw.githubusercontent.com/chingchai/OpenGISData-Thailand/{OGD_COMMIT}/districts.geojson'
API = 'https://landometer.com/api/v2/citymeter-v3/base/info'


def fetch(url, dest=None):
    out = subprocess.run(['curl', '-sS', '--fail', '--retry', '2', '--max-time', '120', url], capture_output=True)
    if out.returncode != 0:
        sys.exit(f'fetch failed ({out.returncode}) {url}: {out.stderr.decode(errors="replace").strip()}')
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(out.stdout)
    return out.stdout


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=str(ROOT / '.cache' / 'reference'))
    args = ap.parse_args()
    out = Path(args.out)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

    districts = out / 'ogd' / 'districts.geojson'
    fetch(OGD_URL, districts)

    lv0_path = out / 'production' / 'base-info-lv0.json'
    lv0 = json.loads(fetch(f'{API}/lv0', lv0_path))
    provinces = {}
    for p in lv0['value']['provinceInfos']:
        lv1 = json.loads(fetch(f'{API}/lv1/{p["id"]}'))
        provinces[p['abbrEn']] = [{'id': d['id'], 'code': d['code'], 'th': d['nameTh'], 'en': d.get('nameEn'), 'areaSqm': d.get('areaSqm')}
                                  for d in lv1['value']['districtInfos']]
    lv1_path = out / 'production' / 'prod-districts.json'
    lv1_path.write_text(json.dumps({'retrieved': now, 'source': f'{API}/lv1/{{provinceId}}', 'provinces': provinces},
                                   ensure_ascii=False, indent=1))

    receipt = {
        'retrieved': now,
        'files': {
            'ogd/districts.geojson': {'url': OGD_URL, 'commit': OGD_COMMIT, 'sha256': sha(districts)},
            'production/base-info-lv0.json': {'url': f'{API}/lv0', 'sha256': sha(lv0_path), 'provinces': len(provinces)},
            'production/prod-districts.json': {'url': f'{API}/lv1/{{provinceId}}', 'sha256': sha(lv1_path),
                                               'districts': sum(len(v) for v in provinces.values())},
        },
    }
    (out / 'reference-receipt.json').write_text(json.dumps(receipt, indent=1) + '\n')
    print(json.dumps(receipt, indent=1))


if __name__ == '__main__':
    main()

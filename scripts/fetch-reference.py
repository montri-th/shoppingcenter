#!/usr/bin/env python3
"""Fetch the reference inputs of the data build into a local cache (never committed).

  python3 scripts/fetch-reference.py [--out .cache/reference]

  <out>/ogd/districts.geojson               OpenGISData-Thailand at the pinned commit (district codes and names only)
  <out>/rtsd/geoBoundaries-THA-ADM2.geojson RTSD district polygons 2019 (geoBoundaries gbOpen, CC BY 3.0 IGO), pinned by SHA-256
  <out>/rtsd/build/districts.geojson        RTSD polygons with OpenGISData codes and production areas (scripts/build-boundaries.py)
  <out>/production/base-info-lv0.json       CityMETER production province list (base/info/lv0)
  <out>/production/prod-districts.json      CityMETER production district list per province (base/info/lv1/{id})
  <out>/reference-receipt.json              URLs, retrieval time and SHA-256 of what was written

The boundary inputs are pinned (OpenGISData by commit, RTSD by content hash) so area membership only changes when
someone moves a pin on purpose. RTSD replaced OpenGISData as the polygons on 4 Nov 2026 (owner: the coarse
Samphanthawong outline crossed the Chao Phraya); they are the polygons CityMETER production uses.
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
RTSD_URL = ('https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/THA/ADM2/'
            'geoBoundaries-THA-ADM2.geojson')
RTSD_SHA256 = 'd3496a7a342e6b895afaa7c2b6710afac243cd45359d3ecb0adec487e4bd3d59'  # boundaryID THA-ADM2-78962969, build 2023-12-12


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

    rtsd = out / 'rtsd' / 'geoBoundaries-THA-ADM2.geojson'
    if not rtsd.is_file() or sha(rtsd) != RTSD_SHA256:
        fetch(RTSD_URL, rtsd)
    if sha(rtsd) != RTSD_SHA256:
        sys.exit(f'RTSD polygons changed upstream ({sha(rtsd)}); review the change, then move RTSD_SHA256 on purpose')
    subprocess.run([sys.executable, '-I', str(ROOT / 'scripts' / 'build-boundaries.py'), '--rtsd', str(rtsd), '--ogd', str(districts),
                    '--production', str(out / 'production'), '--out', str(out / 'rtsd' / 'build')], check=True)

    receipt = {
        'retrieved': now,
        'files': {
            'ogd/districts.geojson': {'url': OGD_URL, 'commit': OGD_COMMIT, 'sha256': sha(districts)},
            'rtsd/geoBoundaries-THA-ADM2.geojson': {'url': RTSD_URL, 'sha256': sha(rtsd), 'license': 'CC BY 3.0 IGO'},
            'rtsd/build/districts.geojson': {'by': 'scripts/build-boundaries.py', 'sha256': sha(out / 'rtsd' / 'build' / 'districts.geojson')},
            'production/base-info-lv0.json': {'url': f'{API}/lv0', 'sha256': sha(lv0_path), 'provinces': len(provinces)},
            'production/prod-districts.json': {'url': f'{API}/lv1/{{provinceId}}', 'sha256': sha(lv1_path),
                                               'districts': sum(len(v) for v in provinces.values())},
        },
    }
    (out / 'reference-receipt.json').write_text(json.dumps(receipt, indent=1) + '\n')
    print(json.dumps(receipt, indent=1))


if __name__ == '__main__':
    main()

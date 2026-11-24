#!/usr/bin/env python3
"""Mall logos that other CityMETER demos verified for the same venue id (D65, owner 2026-11-24).

  python3 -I scripts/attach-family-venue-logos.py --family <dir holding the demo checkouts> --checked-on YYYY-MM-DD

Owner 2026-11-24 07:53, VERBATIM: “ทำไมหลายร้านในศูนย์การค้าเราควรจะมี logo แล้ว แต่เวบเดโมไม่แสดงโลโก้ แก้ให้ครบทุก venue
และตรวจใน dataset อื่นๆด้วยในเคสนี้หาวิธีแก้ที่แก้ได้ทุกที่เหมือนกัน”. D64 fixed the shops; the venues themselves had the same
gap: CityMETER · Camera Shops ships the logos of Seacon Square, Future Park, Central Sriracha and some 30 Robinson Lifestyle
and Lotus's branches under the venue ids this demo gives them (a centre's externalId), and this demo showed none of them.

The rule is the kit's (scripts/logo-kit/citymeter_logos.py, VenuePool, citymeter-logos 1.1.0): a venue the research
registry (data/venue-logos.json, tab 10_VENUE_LOGOS) leaves without a logo takes the logo another demo links to the same
venue id — one artwork with one role across those demos, else none; the original bytes over a downscale; never by name or
distance. data/venue-logos.json is not changed. This writes
  data/venue-logo-links.json           {meta, assets, venues}: the links, the files they use, the counts and the pool
  assets/venue-logos-family/<sha20>.<ext>  the files (bytes as the source demo shipped them, SHA-256 checked)
js/venue-logos.js adds the links only to venues the registry leaves without a logo. Run it after every rebuild of
data/venues.json or data/venue-logos.json — tests/venue-logo-links.test.js fails while the bound hashes differ.
"""
import argparse
import collections
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts' / 'logo-kit'))
import citymeter_logos as kit  # noqa: E402

EXT = {'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}
FOLDER = 'assets/venue-logos-family'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--family', required=True, help='directory holding the demo checkouts (camera, luxurybrands, fitness, …)')
    ap.add_argument('--checked-on', required=True)
    a = ap.parse_args()
    family = os.path.abspath(a.family)
    if Path(family, 'shoppingcenter').resolve() != ROOT:
        sys.exit(f'--family must hold this checkout as shoppingcenter/ ({ROOT})')
    pool = kit.build_venue_pool(family)
    if pool.issues:
        sys.exit(f'venue pool issues: {pool.issues[:5]}')

    registry_path, venues_path = ROOT / 'data' / 'venue-logos.json', ROOT / 'data' / 'venues.json'
    registry = json.loads(registry_path.read_text(encoding='utf-8'))
    own_assets = {x['key']: x for x in registry['assets']}
    own_by_sha = {x['sha256']: x for x in registry['assets']}
    own = {v['id'] for v in registry['venues'] if v.get('key') in own_assets}
    rows = json.loads(venues_path.read_text(encoding='utf-8'))['rows']

    out = ROOT / FOLDER
    out.mkdir(parents=True, exist_ok=True)
    assets, links, keep = {}, [], set()
    counts, by_repo, by_role = collections.Counter(), collections.Counter(), collections.Counter()
    for row in rows:
        if row['id'] in own:
            counts['own'] += 1
            continue
        hit, why = pool.resolve(row['id'], exclude=('shoppingcenter',))
        if not hit:
            counts[why] += 1
            continue
        rec = pool.files[hit['sha256']]
        if rec['sha256'] in own_by_sha:          # the registry already ships these bytes for another venue
            key = own_by_sha[rec['sha256']]['key']
        else:
            key = 'VL-' + rec['sha256'][:16]
            file = f'{FOLDER}/{rec["sha256"][:20]}.{EXT[rec["mime"]]}'
            target = ROOT / file
            if target.exists():
                if kit.sha256_file(target) != rec['sha256']:
                    sys.exit(f'{file} exists with other bytes')
            else:
                target.write_bytes(open(os.path.join(family, rec['repo'], rec['path']), 'rb').read())
            keep.add(target.name)
            assets.setdefault(key, {'key': key, 'file': file, 'mime': rec['mime'], 'bytes': rec['bytes'], 'sha256': rec['sha256'],
                                    'width': rec['width'], 'height': rec['height'], 'background': rec['background'],
                                    'sourcePage': rec['sourcePage'], 'from': rec['repo'], 'sourcePath': rec['path']})
        links.append({'id': row['id'], 'key': key, 'role': hit['role'], 'from': hit['repo']})
        counts['added'] += 1
        by_repo[hit['repo']] += 1
        by_role[hit['role']] += 1
    stale = sorted(f.name for f in out.iterdir() if f.name not in keep)
    for name in stale:
        (out / name).unlink()

    body = {
        'meta': {
            'schemaVersion': '1', 'kit': f'{kit.KIT} {kit.VERSION}', 'checkedOn': a.checked_on,
            'rule': 'A venue the research registry (data/venue-logos.json) leaves without a logo takes the logo another CityMETER demo links to the same venue id (a Camera Shops or Luxury Brands centre externalId, a Fitness venue scId): one artwork with one role, else none; never by name or distance',
            'rights': 'โลโก้ใช้ระบุชื่อศูนย์บนจอ ไม่เปลี่ยนการนับร้านหรือข้อมูลศูนย์ การรวบรวมไฟล์ไม่ใช่ใบอนุญาตเครื่องหมายการค้า สิทธิ์ยังเป็นของเจ้าของ',
            'inputs': {'venuesSha256': kit.sha256_file(venues_path), 'registrySha256': kit.sha256_file(registry_path)},
            'pool': {k: v for k, v in pool.summary().items() if k != 'issues'},
            'counts': {'venues': len(rows), 'withOwnLogo': counts['own'], 'added': counts['added'], 'byDemo': dict(sorted(by_repo.items())),
                       'byRole': dict(sorted(by_role.items())), 'ambiguous': counts['ambiguous'], 'roleConflict': counts['role-conflict'],
                       'none': counts['none']},
            'filesRemoved': stale,
        },
        'assets': sorted(assets.values(), key=lambda x: x['key']),
        'venues': sorted(links, key=lambda x: x['id']),
    }
    (ROOT / 'data' / 'venue-logo-links.json').write_text(json.dumps(body, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(json.dumps(body['meta']['counts'], ensure_ascii=False), f'files {len(assets)}', f'removed {len(stale)}')


if __name__ == '__main__':
    main()

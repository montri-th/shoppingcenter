#!/usr/bin/env python3
"""Logos for every shop whose brand already has a verified logo in the CityMETER demo family (D64, owner 2026-11-24).

  python3 -I scripts/attach-family-logos.py --family <dir holding the demo checkouts> --checked-on YYYY-MM-DD

Owner 2026-11-24 07:53, VERBATIM: “ทำไมหลายร้านในศูนย์การค้าเราควรจะมี logo แล้ว แต่เวบเดโมไม่แสดงโลโก้ แก้ให้ครบทุก venue
และตรวจใน dataset อื่นๆด้วยในเคสนี้หาวิธีแก้ที่แก้ได้ทุกที่เหมือนกัน”.

Why logos were missing: a shop got a logo only when its own dataset id was in this repository's
assets/tenant-logos-manifest.json, which held 22 of the 563 restaurant files of CityMETER · Restaurants, none of Hobby,
Optical or Pharmacy, and a centre-directory entry got one only when the Research Master had linked its row to a brand id.
After You, Auntie Anne's, BreadTalk, Mister Donut and Starbucks at Terminal 21 Asok had verified logos in the family and
showed the shop symbol.

What this writes, beside the bound lists and never inside them (data/tenants/, data/directory/, the logo manifest and their
receipts stay byte-identical):
  data/logo-links/NN.json            32 shards, the FNV-1a shard of the venue id (as data/tenants/): per venue the shop item
                                     id → [logo key, basis], and the logo records the shard uses
  data/logo-links/build-report.json  the pool (demo, commit, files), the bound inputs, counts by basis and dataset, what is
                                     still without a logo and why
  assets/tenant-logos/<sha20>.<ext>  the files the links use, bytes as the source demo shipped them (SHA-256 checked)
The rule is the kit's (scripts/logo-kit/citymeter_logos.py): own id → the same id in another dataset → a name the research
sheets confirmed → one fixed rewrite (bilingual pair, legal suffix, store or food word, bank word); two different files =
no logo; a retailer marked suppressManufacturerLogo never takes the brand's logo. A shop that already has a logo keeps it.
Run it after every rebuild of data/tenants/ or data/directory/ — tests/logo-links.test.js fails while the bound hashes
differ.
"""
import argparse
import collections
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts' / 'logo-kit'))
import citymeter_logos as kit  # noqa: E402

SHARDS = 32
DIRECTORY = 'research.TH.shopping_directory'
EXT = {'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'}
BASIS_ORDER = ('own', 'same-id', 'label', 'bilingual', 'legal', 'descriptor', 'bank')


def shard_bytes(folder):
    return [(ROOT / 'data' / folder / f'{n:02d}.json').read_bytes() for n in range(SHARDS)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--family', required=True, help='directory holding the demo checkouts (restaurant, fitness, hotel, …)')
    ap.add_argument('--checked-on', required=True)
    a = ap.parse_args()

    family = os.path.abspath(a.family)
    if Path(family, 'shoppingcenter').resolve() != ROOT:
        sys.exit(f'--family must hold this checkout as shoppingcenter/ ({ROOT})')
    pool = kit.build_pool(family)
    if pool.issues:
        sys.exit(f'pool issues: {pool.issues[:5]}')

    roster_raw, directory_raw = shard_bytes('tenants'), shard_bytes('directory')
    links = [collections.defaultdict(dict) for _ in range(SHARDS)]
    used = [dict() for _ in range(SHARDS)]
    counts = collections.Counter()
    by_dataset = collections.defaultdict(collections.Counter)
    missing = collections.defaultdict(collections.Counter)      # dataset -> name -> items (no file anywhere)
    ambiguous = collections.Counter()
    copied, files = 0, {}

    for n in range(SHARDS):
        for folder, raw in (('tenants', roster_raw[n]), ('directory', directory_raw[n])):
            for venue, body in json.loads(raw).get('venues', {}).items():
                for item in body.get('items', []):
                    dataset = item.get('dataset')
                    if item.get('logo'):
                        counts['already'] += 1
                        by_dataset[dataset]['already'] += 1
                        continue
                    if dataset == DIRECTORY:
                        brand = item.get('brandId') or ''
                        ds, _, entity = brand.partition(':')
                        names = [item.get('name')]
                        group = ds or DIRECTORY
                    else:
                        ds, entity = dataset, item.get('brandId')
                        names = [item.get('brand'), item.get('displayBrand')]
                        group = dataset
                    names = [x for x in names if x]
                    digest, basis = pool.resolve(ds or None, entity or None, names, suppress=bool(item.get('suppressManufacturerLogo')))
                    if not digest:
                        counts[basis] += 1
                        by_dataset[group][basis] += 1
                        if basis == 'ambiguous':
                            ambiguous[names[0] if names else item['id']] += 1
                        elif basis == 'none':
                            missing[group][names[0] if names else item['id']] += 1
                        continue
                    rec = pool.files[digest]
                    key = digest[:20]
                    file = f'assets/tenant-logos/{key}.{EXT[rec["mime"]]}'
                    if key not in files:
                        target = ROOT / file
                        data = pool.read(digest)
                        if target.exists():
                            if kit.sha256_file(target) != digest:
                                sys.exit(f'{file} exists with other bytes')
                        else:
                            target.write_bytes(data)
                            copied += 1
                        files[key] = {'file': file, 'sha256': digest, 'mime': rec['mime'],
                                      'width': rec['width'], 'height': rec['height'], 'background': rec['background'],
                                      'source': rec['source']}
                    if key not in used[n]:
                        used[n][key] = {k: files[key][k] for k in ('file', 'sha256', 'mime', 'width', 'height', 'background')}
                    if item['id'] in links[n][venue]:
                        sys.exit(f'{venue}: item id {item["id"]} twice')
                    links[n][venue][item['id']] = [key, basis]
                    counts[basis] += 1
                    by_dataset[group][basis] += 1

    out = ROOT / 'data' / 'logo-links'
    out.mkdir(exist_ok=True)
    meta = {'schemaVersion': '1', 'kit': f'{kit.KIT} {kit.VERSION}', 'checkedOn': a.checked_on, 'shards': SHARDS,
            'rule': 'D64: own id → same id in another dataset → a name the research sheets confirmed → one fixed rewrite; '
                    'two different files give none; a shop that has a logo keeps it'}
    for n in range(SHARDS):
        body = {'meta': meta, 'logos': dict(sorted(used[n].items())),
                'venues': {v: dict(sorted(items.items())) for v, items in sorted(links[n].items())}}
        (out / f'{n:02d}.json').write_text(json.dumps(body, ensure_ascii=False, separators=(',', ':')) + '\n')

    added = sum(counts[b] for b in BASIS_ORDER)
    report = {
        'meta': meta,
        'inputs': {
            'rosterSha256': hashlib.sha256(b''.join(roster_raw)).hexdigest(),
            'directorySha256': hashlib.sha256(b''.join(directory_raw)).hexdigest(),
            'logoManifestSha256': kit.sha256_file(ROOT / 'assets' / 'tenant-logos-manifest.json'),
        },
        'pool': pool.summary() | {'files': len(pool.files)},
        'items': sum(counts.values()),
        'withLogoBefore': counts['already'],
        'added': added,
        'withLogoAfter': counts['already'] + added,
        'byBasis': {b: counts[b] for b in BASIS_ORDER},
        'notAttached': {k: counts[k] for k in ('suppressed', 'ambiguous', 'none')},
        'byDataset': {d: dict(sorted(c.items())) for d, c in sorted(by_dataset.items())},
        'files': len(files), 'filesCopied': copied,
        'ambiguousNames': [[k, v] for k, v in ambiguous.most_common()],
        'withoutLogoTop': {d: [[k, v] for k, v in c.most_common(25)] for d, c in sorted(missing.items())},
    }
    (out / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps({k: report[k] for k in ('items', 'withLogoBefore', 'added', 'withLogoAfter', 'byBasis', 'notAttached', 'files', 'filesCopied')}, ensure_ascii=False))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Compact index of the published tenant roster for brand search, brand presence and nearby-centre comparison.

  python3 -I scripts/build-tenant-index.py

Reads data/tenants/NN.json (the roster after scripts/build-tenant-data.py, link-dataset-tenants.py and
link-research-tenants.py) and writes data/tenant-index.json: one row per published item
[venue, brand, dataset, category, storeFormat] as indexes into small dictionaries. The page derives the tenant role with
js/tenants.js#tenantRole from (dataset, category, storeFormat), exactly as it does for the venue panel, so the index
never carries a second role vocabulary. Brand keys use js/model.js#normalizeText (search key) — a display and search
aid, never a join for counting. Nothing here changes venue cores, primary counts or the roster itself.
"""
import collections
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('research_linker', Path(__file__).with_name('link-research-tenants.py'))
linker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(linker)
SHARDS = 32


def main():
    tenants = ROOT / 'data/tenants'
    digest = hashlib.sha256()
    rows, names = [], collections.defaultdict(collections.Counter)
    checked = []
    for n in range(SHARDS):
        raw = (tenants / f'{n:02d}.json').read_bytes()
        digest.update(raw)
        for vid, roster in sorted(json.loads(raw)['venues'].items()):
            for item in roster['items']:
                shown = item.get('displayBrand') or item.get('brand') or item.get('name')
                key = linker.brand_key(shown)
                if not key:
                    raise SystemExit(f'{vid} {item["id"]}: empty brand key')
                names[key][' '.join(str(shown).split())] += 1
                rows.append((vid, key, item['dataset'], item.get('category') or '', item.get('storeFormat') or ''))
                if item.get('checkedOn'):
                    checked.append(item['checkedOn'])
    venues = sorted({r[0] for r in rows})
    brands = sorted(names)
    datasets = sorted({r[2] for r in rows})
    categories = sorted({r[3] for r in rows})
    formats = sorted({r[4] for r in rows})
    pos = lambda values: {v: i for i, v in enumerate(values)}
    vi, bi, di, ci, fi = map(pos, (venues, brands, datasets, categories, formats))
    report = json.loads((tenants / 'build-report.json').read_text())
    index = {
        'meta': {
            'schemaVersion': '1', 'scope': 'published tenant roster (data/tenants)', 'items': len(rows), 'venues': len(venues),
            'brands': len(brands), 'datasets': dict(sorted(collections.Counter(r[2] for r in rows).items())),
            'checkedFrom': min(checked) if checked else None, 'checkedTo': max(checked) if checked else None,
            'rosterAsOf': report.get('asOf'), 'rosterSha256': digest.hexdigest(),
            'fields': ['venue', 'brand', 'dataset', 'category', 'storeFormat'],
            'brandKey': 'js/model.js#normalizeText of the displayed brand; search and display only',
        },
        'venueIds': venues, 'datasets': datasets, 'categories': categories, 'formats': formats,
        # Display name of a brand key: its most frequent spelling, ties by Thai-aware text order of the spelling.
        'brands': [[k, sorted(names[k].items(), key=lambda kv: (-kv[1], kv[0]))[0][0]] for k in brands],
        'rows': [[vi[v], bi[b], di[d], ci[c], fi[f]] for v, b, d, c, f in rows],
    }
    (ROOT / 'data/tenant-index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({k: index['meta'][k] for k in ('items', 'venues', 'brands', 'checkedFrom', 'checkedTo')}, ensure_ascii=False))


if __name__ == '__main__':
    main()

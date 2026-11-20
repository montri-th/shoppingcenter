#!/usr/bin/env python3
"""Write data/compare/residents-workers.json: every located center on two ranks, for the comparison chart of “รอบศูนย์นี้”.

  python3 -I scripts/build-compare.py

Owner 2026-11-20 11:27 (VERBATIM): “ทำเฉพาะ "หาพิกัด 11 ศูนย์" และ * กราฟเทียบหลายศูนย์ * ตารางที่อ่านแทนแผนที่ได้”.
The chart is the one in the approved method (venue-locale-residents-in-radius-method v1 §4, “เทียบหลายศูนย์”): one axis is
people living near the center, the other people working near it, both as ranks, read in four quarters.

Inputs (all already published in this repository; nothing is fetched):
  data/residents/   registered residents within 1 · 3 · 5 km (modelled) and their mid-rank percentiles among the 488
                    located centers of the rank reference and the same type (written by scripts/build-residents.py)
  data/locale/      the generated prior of the group “คนทำงานและผู้เดินทาง” (priors/NN.json seg.workers: level, score =
                    mean of the two highest signal percentiles, the signals) of the release that data/locale/meta.json
                    names (venue-locale-shopping-20261120-v0.2.2-rc1 since release 0.9.1; its priors are those of v0.2.1)
  data/venues.json  which centers are located, and their type

Published per located center: [type, x of 1 · 3 · 5 km among all, x among the type, y among all, y among the type]
  x  the residents percentile, copied from data/residents (1 decimal)
  y  the workers score as a mid-rank percentile among the 488 centers of the rank reference (ties counted half),
     1 decimal — a rank of a generated prior, read in neutral tones on the page, never a count of workers

Rank reference (owner 2026-11-20 11:57, “อันดับแบบแนะนำ”): both axes rank against the 488 centers located in release
0.2.0; a center placed later (meta `reference.added` of data/residents and data/locale, which must agree) is ranked
against them, plotted with them, and moves no one else's rank.

Stops: a located center without a residents record or a workers score; a residents percentile that does not recount
from the published figures; universes or a rank reference that differ from data/residents and data/locale. Writing the same inputs again gives the same bytes.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'compare' / 'residents-workers.json'
GROUPS = ('mall', 'community', 'outlet')
SPLIT = 50  # the quarters split at the middle rank of both axes


def fail(msg):
    sys.exit(f'build-compare: {msg}')


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def mid_pct(x, values):
    below = sum(1 for v in values if v < x)
    equal = sum(1 for v in values if v == x)
    return 100 * (below + 0.5 * equal) / len(values)


def r1(x):
    return round(x + 0.0, 1)


def main():
    rows = json.loads((ROOT / 'data' / 'venues.json').read_text(encoding='utf-8'))['rows']
    located = {r['id']: r for r in rows if r.get('countable') and r.get('status') == 'supply' and r.get('group') in GROUPS and r.get('located')}
    rmeta_path = ROOT / 'data' / 'residents' / 'meta.json'
    rmeta = json.loads(rmeta_path.read_text(encoding='utf-8'))
    lmeta = json.loads((ROOT / 'data' / 'locale' / 'meta.json').read_text(encoding='utf-8'))

    inputs, residents, priors = [], {}, {}
    for path in sorted((ROOT / 'data' / 'residents').glob('*.json')):
        b = path.read_bytes()
        inputs.append(f'{path.relative_to(ROOT).as_posix()} {sha256_bytes(b)}')
        if path.name != 'meta.json':
            residents.update(json.loads(b)['venues'])
    for path in sorted((ROOT / 'data' / 'locale' / 'priors').glob('*.json')):
        b = path.read_bytes()
        inputs.append(f'{path.relative_to(ROOT).as_posix()} {sha256_bytes(b)}')
        priors.update(json.loads(b)['venues'])
    venues_bytes = (ROOT / 'data' / 'venues.json').read_bytes()
    inputs.append(f'data/venues.json {sha256_bytes(venues_bytes)}')

    if set(residents) != set(located):
        fail(f'residents and located centers differ: {sorted(set(residents) ^ set(located))[:5]}')
    added = sorted(rmeta['reference']['added'])
    if added != sorted(lmeta['reference']['added']) or set(added) - set(located):
        fail(f'the rank reference differs: residents {added}, locale {lmeta["reference"]["added"]}')
    reference = sorted(set(located) - set(added))
    universes = {'all': len(reference), **{g: sum(1 for v in reference if located[v]['group'] == g) for g in GROUPS}}
    if universes != rmeta['universes'] or universes['all'] != lmeta['reference']['n']:
        fail(f'universes {universes} differ from data/residents {rmeta["universes"]} or the locale reference {lmeta["reference"]["n"]}')

    workers = {}
    for vid in located:
        w = (priors.get(vid) or {}).get('seg', {}).get('workers')
        if not w or not isinstance(w[1], (int, float)):
            fail(f'{vid} has no workers score')
        workers[vid] = float(w[1])

    ids = sorted(located)
    by_type = {g: [v for v in reference if located[v]['group'] == g] for g in GROUPS}
    out = {}
    for vid in ids:
        g = located[vid]['group']
        rec = residents[vid]
        for i in range(3):
            all_n = [residents[v]['n'][i] for v in reference]
            same_n = [residents[v]['n'][i] for v in by_type[g]]
            if abs(rec['p'][0][i] - mid_pct(rec['n'][i], all_n)) > 1e-3 or abs(rec['p'][1][i] - mid_pct(rec['n'][i], same_n)) > 1e-3:
                fail(f'{vid} residents percentile at radius {i} does not recount')
        y_all = mid_pct(workers[vid], [workers[v] for v in reference])
        y_type = mid_pct(workers[vid], [workers[v] for v in by_type[g]])
        out[vid] = [GROUPS.index(g), [r1(x) for x in rec['p'][0]], [r1(x) for x in rec['p'][1]], r1(y_all), r1(y_type)]

    doc = {
        'schema': 'shoppingcenter-compare/1',
        'what': 'every located center on two ranks: registered residents nearby (x) and workers and commuters nearby (y)',
        'builtFrom': {
            'residents': {'release': rmeta['release'], 'asOf': rmeta['asOf'], 'populationMonth': rmeta['populationMonth']},
            'workers': {'release': lmeta['release']['id'], 'asOf': lmeta['asOf'], 'state': 'generated_prior', 'segment': 'workers'},
            'inputsSha256': sha256_bytes(('\n'.join(inputs) + '\n').encode('utf-8')),
        },
        'radii': rmeta['radii'],
        'groups': list(GROUPS),
        'universes': universes,
        'reference': {'n': len(reference), 'added': added},
        'split': SPLIT,
        'fields': ['type (index of groups)', 'x: residents percentile at 1 · 3 · 5 km among all', 'x among the same type', 'y: workers percentile among all', 'y among the same type'],
        'method': 'x: mid-rank percentile of the registered residents (modelled) within the straight-line radius, as data/residents · y: mid-rank percentile (ties counted half) of the workers score of the generated prior (mean of its two highest signal percentiles) · both among the 488 centers of the rank reference; a center placed later is ranked against them · quarters split at 50 on both axes',
        'dataMethod': 'DATA_METHOD.md#registered-residents',
        'venues': out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':'), sort_keys=False) + '\n'
    OUT.write_text(text, encoding='utf-8')
    print(f'build-compare: {len(out)} centers → {OUT.relative_to(ROOT)} ({len(text.encode("utf-8")):,} bytes)')


if __name__ == '__main__':
    main()

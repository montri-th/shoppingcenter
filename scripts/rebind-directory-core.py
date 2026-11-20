#!/usr/bin/env python3
"""Name a new venue core in data/directory/build-report.json after a points-only refresh, without the private export.

  python3 -I scripts/rebind-directory-core.py --previous <the data/venues.json the directory report names> --reason "…"

scripts/build-directory-listings.py binds the directory to one venue core (venueCoreSha256) and to the 32 roster shards
(rosterSha256), and tests/directory-listings.test.js fails while either is stale. The directory reads the core only
through the hosts and their parents (countable, children, parentId, name) and through the point of a registered child
zone (D43: a zone with a point of its own is named on the shop row). A points-only refresh — scripts/refresh-coverage-
receipt.py: only lat, lon, located, provinceCode and districtCode of some venues change — can therefore change the
directory only when a venue it places is a directory host, a registered child zone or a coverage row. This step proves
that none is, then names the new core. Anything else stops: rebuild the directory from its export.

Checks: --previous is the core the report names · the roster shards still hash to rosterSha256 · the same venue ids in
the same order · every venue other than the point fields unchanged · no venue whose point changed appears anywhere in
data/directory (shards, counts, report). Writes venueCoreSha256 and coreRebind; the shards and counts stay byte for byte.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARDS = 32
POINT_FIELDS = frozenset({'lat', 'lon', 'located', 'provinceCode', 'districtCode'})


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--previous', required=True, help='the venue core the directory report names (e.g. git show HEAD:data/venues.json)')
    ap.add_argument('--reason', required=True, help='why the core changed (the points-only refresh and its owner decision)')
    ap.add_argument('--data', default=str(ROOT / 'data'))
    a = ap.parse_args()
    data = Path(a.data)
    report_path = data / 'directory' / 'build-report.json'
    report = json.loads(report_path.read_text(encoding='utf-8'))

    previous_raw = Path(a.previous).read_bytes()
    if sha256(previous_raw) != report['venueCoreSha256']:
        raise SystemExit(f'--previous is not the core the directory report names ({sha256(previous_raw)[:12]} != {report["venueCoreSha256"][:12]})')
    roster = sha256(b''.join((data / 'tenants' / f'{n:02d}.json').read_bytes() for n in range(SHARDS)))
    if roster != report['rosterSha256']:
        raise SystemExit('the roster changed: rebuild data/directory (scripts/build-directory-listings.py)')
    current_raw = (data / 'venues.json').read_bytes()
    if sha256(current_raw) == report['venueCoreSha256']:
        raise SystemExit('the directory report already names this core')

    prev = json.loads(previous_raw)['rows']
    cur = json.loads(current_raw)['rows']
    if [r['id'] for r in prev] != [r['id'] for r in cur]:
        raise SystemExit('venue ids or their order changed: rebuild data/directory')
    placed = []
    for p, c in zip(prev, cur):
        changed = {k for k in set(p) | set(c) if p.get(k) != c.get(k)}
        if not changed:
            continue
        if changed - POINT_FIELDS:
            raise SystemExit(f'{c["id"]} changed {sorted(changed - POINT_FIELDS)}: rebuild data/directory')
        placed.append(c['id'])
    if not placed:
        raise SystemExit('no venue changed its point: nothing to rebind')

    text = ''.join((data / 'directory' / f'{n:02d}.json').read_text(encoding='utf-8') for n in range(SHARDS))
    text += (data / 'directory' / 'counts.json').read_text(encoding='utf-8') + report_path.read_text(encoding='utf-8')
    inside = [vid for vid in placed if f'"{vid}"' in text]
    if inside:
        raise SystemExit(f'{inside} appear in data/directory (host, child zone or coverage row): rebuild data/directory')

    report['venueCoreSha256'] = sha256(current_raw)
    report['coreRebind'] = {
        'previousCoreSha256': sha256(previous_raw),
        'venues': placed,
        'changedFields': sorted(POINT_FIELDS),
        'reason': a.reason,
        'on': datetime.now(timezone.utc).date().isoformat(),
        'check': 'no placed venue is a directory host, a registered child zone or a coverage row; shards and counts unchanged',
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'directory report names the new core: {len(placed)} venues placed, none in the directory')


if __name__ == '__main__':
    main()

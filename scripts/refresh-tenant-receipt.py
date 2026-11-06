#!/usr/bin/env python3
"""Re-receipt the published shop roster after a full refresh of the venue core, without changing the roster.

  python3 -I scripts/refresh-tenant-receipt.py --previous <the data/venues.json the roster receipt names>

scripts/build-tenant-data.py builds data/tenants/ against one venue core and stores its SHA-256 (venueCoreSha256).
A new export of the Research Master rewrites data/venues.json, so the receipt no longer names it. This step checks that
the roster still fits the new core and then names the new core:

- the previous core must be the one the receipt names (its SHA-256 equals venueCoreSha256);
- every venue that has a roster is still in the new core, and no venue kept from the previous core changed its
  storeCount (the registry's count of accepted primary observations) — either would need a roster rebuild, so it stops;
- a venue new to the core with storeCount > 0 has no roster yet: it is listed in venueCoreRefresh.awaitingRoster with
  its storeCount. Its shop figure on the page reads "—" until the roster lists its observations. A venue listed by an
  earlier refresh stays listed (its count may change) until a roster build covers it; earlier refreshes go to history.

Writes venueCoreSha256 and venueCoreRefresh into data/tenants/build-report.json; the shards and the index stay byte
for byte (tests/tenant-data-build.test.js checks both).
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
PRIMARY = 'registry_accepted_primary'


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--previous', required=True, help='the venue core the roster receipt names (e.g. git show HEAD:data/venues.json)')
    ap.add_argument('--data', default=str(DATA))
    a = ap.parse_args()
    data = Path(a.data)
    report_path = data / 'tenants' / 'build-report.json'
    report = json.loads(report_path.read_text())
    previous_sha = sha256(a.previous)
    if previous_sha != report['venueCoreSha256']:
        raise SystemExit(f'--previous is not the core the roster receipt names ({previous_sha[:12]} != {report["venueCoreSha256"][:12]})')
    old = {r['id']: r for r in json.loads(Path(a.previous).read_text())['rows']}
    core = json.loads((data / 'venues.json').read_text())
    new = {r['id']: r for r in core['rows']}

    primary, rostered = {}, set()
    for n in range(report['shards']):
        shard = json.loads((data / 'tenants' / f'{n:02d}.json').read_text())
        for venue, roster in shard['venues'].items():
            rostered.add(venue)
            primary[venue] = sum(i.get('sourceObservationCount', 1) for i in roster['items'] if i.get('sourceRole') == PRIMARY)

    # Venues an earlier refresh listed as awaiting a roster stay listed (their count may change: they have no roster yet).
    earlier = report.get('venueCoreRefresh') or {}
    waiting_before = {x['venueId'] for x in earlier.get('awaitingRoster', [])}
    problems = [f'{v}: has a roster but left the core' for v in sorted(rostered - set(new))]
    problems += [f'{v}: storeCount {old[v].get("storeCount") or 0} -> {new[v].get("storeCount") or 0}'
                 for v in sorted(set(old) & set(new)) if v not in waiting_before
                 and (old[v].get('storeCount') or 0) != (new[v].get('storeCount') or 0)]
    if problems:
        raise SystemExit('the roster needs a rebuild (scripts/build-tenant-data.py):\n  ' + '\n  '.join(problems))
    added = sorted(set(new) - set(old))
    awaiting = [{'venueId': v, 'storeCount': new[v]['storeCount']} for v in sorted(set(added) | (waiting_before & set(new)))
                if (new[v].get('storeCount') or 0) > 0]
    assert all(primary.get(x['venueId'], 0) == 0 for x in awaiting)

    report['venueCoreSha256'] = sha256(data / 'venues.json')
    report['venueCoreRefresh'] = {
        'on': datetime.now(timezone.utc).astimezone().date().isoformat(),
        'by': 'scripts/refresh-tenant-receipt.py',
        'reason': 'full refresh of the venue core from a new export of the Research Master; the roster is unchanged',
        'coreAsOf': core['meta'].get('asOf'),
        'export01VenuesSha256': core['meta'].get('inputs', {}).get('01_VENUES', {}).get('sha256'),
        'previousCoreSha256': previous_sha,
        # the core scripts/build-tenant-data.py built the roster on (kept from the first refresh after that build)
        'rosterBuiltOnCoreSha256': earlier.get('rosterBuiltOnCoreSha256') or earlier.get('previousCoreSha256') or previous_sha,
        'rowsAdded': len(added), 'rowsRemoved': len(set(old) - set(new)),
        'rowsChanged': sum(1 for v in set(old) & set(new) if old[v] != new[v]),
        'awaitingRoster': awaiting,
        'awaitingRosterObservations': sum(x['storeCount'] for x in awaiting),
        'note': 'venues in awaitingRoster are new to the core; the registry records accepted primary observations for '
                'them that the roster does not list yet, so their shop figure reads "—" (not zero) until it does',
        'history': earlier.get('history', []) + ([{k: earlier[k] for k in ('on', 'coreAsOf', 'export01VenuesSha256', 'previousCoreSha256',
                                                                            'rowsAdded', 'rowsRemoved', 'rowsChanged') if k in earlier}]
                                                 if earlier else []),
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f"receipt names the new core: +{len(added)} venues, {len(awaiting)} awaiting a roster "
          f"({report['venueCoreRefresh']['awaitingRosterObservations']} observations)")


if __name__ == '__main__':
    main()

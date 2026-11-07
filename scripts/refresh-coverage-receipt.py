#!/usr/bin/env python3
"""Re-receipt the tenant coverage audit after a venue-core refresh that cannot change its accounting.

  python3 -I scripts/refresh-coverage-receipt.py --previous <the data/venues.json the audit receipt names>

scripts/audit-tenant-coverage.py reads a private native snapshot and binds data/tenant-coverage-audit.json to one
venue core (venueCoreSha256) and to the 32 roster shards (publicRosterSha256). A new export of the Research Master
that only places points (lat, lon, located, provinceCode, districtCode — e.g. owner-identified building points)
changes no inventory row, venue identity, qualification, count role, name, group, status or tenant evidence, so the
audit's accounting still holds for the new core. This step proves that and then names the new core. Anything else
stops: rerun the private audit (scripts/tenant-coverage-audit-contract.md).

Checks: --previous is the core the receipt names · the roster shards still hash to publicRosterSha256 · the same
venue ids · for every venue, every field other than the point fields is unchanged. The receipt keeps the core the
audit actually read (auditedCoreSha256) next to the core it now names.

  python3 -I scripts/refresh-coverage-receipt.py --previous <core> --hierarchy ID,ID,… --decision "<owner decision>"

A hierarchy change the owner decided (e.g. D41, 8 Nov 2026: three places became sub-areas of Siam Square) changes, for
the named venues only, how the page counts and groups them (HIERARCHY_FIELDS: parent, children, count role, countable,
hold, count basis, display group and its basis). It adds no source record, publishes no new shop and moves no shop
between rosters (the shards must still hash to publicRosterSha256), so the audit's accounting of source records and
published items still holds. The audit's own component-to-parent map is explicit and was read before the change: the
receipt lists the named venues under hierarchyChange so the next private audit run reads the new parent links.
Every venue not named must be unchanged except for the point fields; a named venue may change nothing else.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POINT_FIELDS = frozenset({'lat', 'lon', 'located', 'provinceCode', 'districtCode'})
HIERARCHY_FIELDS = frozenset({'parentId', 'children', 'countRole', 'countable', 'countHold', 'countBasis', 'group', 'groupBasis'})


def sha256_bytes(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--previous', required=True, help='the venue core the coverage receipt names (e.g. git show HEAD:data/venues.json)')
    ap.add_argument('--data', default=str(ROOT / 'data'))
    ap.add_argument('--reason', default='new export of the Research Master that places points only; the roster and every other venue field are unchanged')
    ap.add_argument('--hierarchy', default='', help='comma-separated venue ids whose parent, count role, count and group an owner decision changed')
    ap.add_argument('--decision', default='', help='the owner decision behind --hierarchy (required with it)')
    a = ap.parse_args()
    named = {v.strip() for v in a.hierarchy.split(',') if v.strip()}
    if named and not a.decision.strip():
        raise SystemExit('--hierarchy needs --decision: the owner decision that changed these venues')
    data = Path(a.data)
    receipt_path = data / 'tenant-coverage-audit.json'
    receipt = json.loads(receipt_path.read_text())

    previous_raw = Path(a.previous).read_bytes()
    previous_sha = sha256_bytes(previous_raw)
    if previous_sha != receipt['venueCoreSha256']:
        raise SystemExit(f'--previous is not the core the coverage receipt names ({previous_sha[:12]} != {receipt["venueCoreSha256"][:12]})')

    digest = hashlib.sha256()
    for n in range(receipt['publicRosterShardCount']):
        digest.update((data / 'tenants' / f'{n:02d}.json').read_bytes())
    if digest.hexdigest() != receipt['publicRosterSha256']:
        raise SystemExit('the roster shards changed since the audit: rerun scripts/audit-tenant-coverage.py with the private native snapshot')

    core_raw = (data / 'venues.json').read_bytes()
    old = {r['id']: r for r in json.loads(previous_raw)['rows']}
    new = {r['id']: r for r in json.loads(core_raw)['rows']}
    if set(old) != set(new):
        raise SystemExit(f'venue ids changed (+{len(set(new) - set(old))} -{len(set(old) - set(new))}): rerun the private audit')
    unknown = sorted(named - set(new))
    if unknown:
        raise SystemExit(f'--hierarchy names venues that are not in the core: {unknown}')
    problems, fields, changed, hierarchy = [], set(), 0, {}
    for vid in sorted(new):
        if old[vid] == new[vid]:
            continue
        changed += 1
        diff = {f for f in set(old[vid]) | set(new[vid]) if old[vid].get(f) != new[vid].get(f)}
        fields |= diff
        allowed = POINT_FIELDS | (HIERARCHY_FIELDS if vid in named else frozenset())
        if diff - allowed:
            problems.append(f'{vid}: {sorted(diff - allowed)}')
        if diff & HIERARCHY_FIELDS:
            hierarchy[vid] = sorted(diff & HIERARCHY_FIELDS)
    if problems:
        raise SystemExit('fields other than the point fields (or, for --hierarchy venues, the hierarchy fields) changed — '
                         'rerun the private audit:\n  ' + '\n  '.join(problems[:20]))
    if named - set(hierarchy):
        raise SystemExit(f'--hierarchy names venues whose hierarchy did not change: {sorted(named - set(hierarchy))}')

    earlier = receipt.get('venueCoreRefresh') or {}
    new_sha = sha256_bytes(core_raw)
    receipt['venueCoreSha256'] = new_sha
    receipt['venueCoreRefresh'] = {
        'on': datetime.now(timezone.utc).astimezone().date().isoformat(),
        'by': 'scripts/refresh-coverage-receipt.py',
        'reason': a.reason,
        'auditedCoreSha256': earlier.get('auditedCoreSha256') or previous_sha,
        'previousCoreSha256': previous_sha,
        'coreSha256': new_sha,
        'rowsChanged': changed,
        'fieldsChanged': sorted(fields),
        'rosterUnchanged': True,
        **({'hierarchyChange': {
            'decision': a.decision.strip(),
            'venues': [{'venueId': vid, 'parentId': new[vid].get('parentId'), 'countable': new[vid].get('countable'),
                        'countRole': new[vid].get('countRole'), 'group': new[vid].get('group'), 'fieldsChanged': hierarchy[vid]}
                       for vid in sorted(hierarchy)],
            'note': 'no source record or roster item changed (a parent\'s panel may also show the listed shops of its sub-areas: '
                    'the same items); the audit read the parent links before this change, so its next private run reads the '
                    'new ones (componentPublicationHosts)'}} if hierarchy else {}),
        'history': earlier.get('history', []) + ([{k: earlier[k] for k in ('on', 'previousCoreSha256', 'coreSha256', 'rowsChanged') if k in earlier}]
                                                 if earlier else []),
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(f'coverage receipt names the new core: {changed} venues changed only {sorted(fields)}; the audit read {receipt["venueCoreRefresh"]["auditedCoreSha256"][:12]}')


if __name__ == '__main__':
    main()

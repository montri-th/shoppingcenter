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

  python3 -I scripts/refresh-coverage-receipt.py --previous <core> --added ID,… --changed ID,… --decision "<owner decision>"

An owner decision to publish the sheet's later venue rows before the next private audit (owner 2026-11-20: “ทุกอย่างที่
ชีตมีตอนนี้”, release 0.9.1). --added names venues new to the core: rows the registry gained after the audit's asOf. They
have no item in the roster (the shards must still hash to publicRosterSha256) and the audit never read them, so they are
listed under ownerRefresh.added and stay out of the audited counts, which keep the audit's asOf. --changed names existing
venues whose non-accounting fields changed (NON_ACCOUNTING_FIELDS: the operation group read from operation evidence, and
since release 0.11.0 the venue's own logo key from 10_VENUE_LOGOS; neither counts a source record, host link or published
item). The registry's row count before and after is written beside them
(rows the core leaves out as not qualified are in that count too). Anything else stops, as before.

  python3 -I scripts/refresh-coverage-receipt.py --previous <core> --hierarchy ID,… --removed ID,… --decision "<owner decision>"

--removed names venues that left the core because the registry no longer qualifies them (release 0.13.0, 27 Nov 2026:
the review of VN-1c297c786a5e91 closed unconfirmed, so it reads as quiet context and never enters a number). A removed
venue must have no item in the roster (the shards must still hash to publicRosterSha256); it is listed under
ownerRefresh.removed with its name and group, and the next private audit reads the core without it.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POINT_FIELDS = frozenset({'lat', 'lon', 'located', 'provinceCode', 'districtCode'})
HIERARCHY_FIELDS = frozenset({'parentId', 'children', 'countRole', 'countable', 'countHold', 'countBasis', 'group', 'groupBasis'})
# fields of the venue core that no part of the coverage accounting reads (source records, host links, published items):
# the operation group (0.9.1), the venue's own logo key, a link to 10_VENUE_LOGOS (0.11.0), and the alternate names
# 09_RELATIONSHIPS records for search (former_or_alternate_name, 0.13.0)
NON_ACCOUNTING_FIELDS = frozenset({'operationGroup', 'logoKey', 'aliases'})
# A count hold the registry writes into the qualification status (definition_supported_named_property_duplicate_count_held,
# 0.13.0) also moves the tier the row reads and drops an owner rule: for a --hierarchy venue that is no longer countable
# these two may change with the hierarchy fields (the row still enters no number).
HOLD_FIELDS = frozenset({'tier', 'ownerRule'})


def sha256_bytes(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--previous', required=True, help='the venue core the coverage receipt names (e.g. git show HEAD:data/venues.json)')
    ap.add_argument('--data', default=str(ROOT / 'data'))
    ap.add_argument('--reason', default='new export of the Research Master that places points only; the roster and every other venue field are unchanged')
    ap.add_argument('--hierarchy', default='', help='comma-separated venue ids whose parent, count role, count and group an owner decision changed')
    ap.add_argument('--decision', default='', help='the owner decision behind --hierarchy, --added or --changed (required with them)')
    ap.add_argument('--added', default='', help='comma-separated venue ids new to the core: registry rows added after the audit (owner decision)')
    ap.add_argument('--changed', default='', help='comma-separated venue ids whose non-accounting fields changed (owner decision)')
    ap.add_argument('--removed', default='', help='comma-separated venue ids that left the core: rows the registry no longer qualifies, '
                                                  'none with a roster item (owner decision)')
    a = ap.parse_args()
    split = lambda text: {v.strip() for v in text.split(',') if v.strip()}
    named, added_ids, changed_ids, removed_ids = split(a.hierarchy), split(a.added), split(a.changed), split(a.removed)
    if (named or added_ids or changed_ids or removed_ids) and not a.decision.strip():
        raise SystemExit('--hierarchy, --added, --changed and --removed need --decision: the owner decision that changed these venues')
    data = Path(a.data)
    receipt_path = data / 'tenant-coverage-audit.json'
    receipt = json.loads(receipt_path.read_text())

    previous_raw = Path(a.previous).read_bytes()
    previous_sha = sha256_bytes(previous_raw)
    if previous_sha != receipt['venueCoreSha256']:
        raise SystemExit(f'--previous is not the core the coverage receipt names ({previous_sha[:12]} != {receipt["venueCoreSha256"][:12]})')

    digest, rostered = hashlib.sha256(), set()
    for n in range(receipt['publicRosterShardCount']):
        raw = (data / 'tenants' / f'{n:02d}.json').read_bytes()
        digest.update(raw)
        rostered |= {vid for vid, roster in json.loads(raw)['venues'].items() if roster.get('items')}
    if digest.hexdigest() != receipt['publicRosterSha256']:
        raise SystemExit('the roster shards changed since the audit: rerun scripts/audit-tenant-coverage.py with the private native snapshot')

    core_raw = (data / 'venues.json').read_bytes()
    old = {r['id']: r for r in json.loads(previous_raw)['rows']}
    new = {r['id']: r for r in json.loads(core_raw)['rows']}
    if set(old) - set(new) != removed_ids or set(new) - set(old) != added_ids:
        raise SystemExit(f'venue ids changed (+{sorted(set(new) - set(old))[:5]} -{sorted(set(old) - set(new))[:5]}), --added names '
                         f'{sorted(added_ids)} and --removed {sorted(removed_ids)}: only venues new to the core, all of them named in '
                         '--added, may be added, and only venues named in --removed may leave; otherwise rerun the private audit')
    if removed_ids & rostered:
        raise SystemExit(f'venues with roster items left the core: {sorted(removed_ids & rostered)} — rerun the private audit')
    unknown = sorted((named | changed_ids) - set(old))
    if unknown:
        raise SystemExit(f'--hierarchy or --changed names venues that are not in the previous core: {unknown}')
    problems, fields, changed, hierarchy, owner_changed = [], set(), 0, {}, {}
    for vid in sorted(set(new) - added_ids):
        if old[vid] == new[vid]:
            continue
        changed += 1
        diff = {f for f in set(old[vid]) | set(new[vid]) if old[vid].get(f) != new[vid].get(f)}
        fields |= diff
        allowed = (POINT_FIELDS | (HIERARCHY_FIELDS if vid in named else frozenset())
                   | (HOLD_FIELDS if vid in named and not new[vid].get('countable') else frozenset())
                   | (NON_ACCOUNTING_FIELDS if vid in changed_ids else frozenset()))
        if diff - allowed:
            problems.append(f'{vid}: {sorted(diff - allowed)}')
        if diff & HIERARCHY_FIELDS:
            hierarchy[vid] = sorted(diff & (HIERARCHY_FIELDS | HOLD_FIELDS))
        if vid in changed_ids and diff & NON_ACCOUNTING_FIELDS:
            owner_changed[vid] = sorted(diff & NON_ACCOUNTING_FIELDS)
    if problems:
        raise SystemExit('fields other than the point fields (or, for --hierarchy venues, the hierarchy fields) changed — '
                         'rerun the private audit:\n  ' + '\n  '.join(problems[:20]))
    if named - set(hierarchy):
        raise SystemExit(f'--hierarchy names venues whose hierarchy did not change: {sorted(named - set(hierarchy))}')
    if changed_ids - set(owner_changed):
        raise SystemExit(f'--changed names venues whose non-accounting fields did not change: {sorted(changed_ids - set(owner_changed))}')
    old_meta, new_meta = json.loads(previous_raw).get('meta', {}), json.loads(core_raw).get('meta', {})

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
        **({'rowsAdded': len(added_ids)} if added_ids else {}),
        **({'rowsRemoved': len(removed_ids)} if removed_ids else {}),
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
        **({'ownerRefresh': {
            'decision': a.decision.strip(),
            'added': [{'venueId': vid, 'name': new[vid].get('name'), 'group': new[vid].get('group'), 'countable': new[vid].get('countable'),
                       'status': new[vid].get('status'), 'storeCount': new[vid].get('storeCount')} for vid in sorted(added_ids)],
            'changed': [{'venueId': vid, 'fieldsChanged': owner_changed[vid], **{f: new[vid].get(f) for f in owner_changed[vid]}}
                        for vid in sorted(owner_changed)],
            **({'removed': [{'venueId': vid, 'name': old[vid].get('name'), 'group': old[vid].get('group'), 'countable': old[vid].get('countable')}
                            for vid in sorted(removed_ids)]} if removed_ids else {}),
            'registryRows': {'previous': (old_meta.get('counts') or {}).get('registry'), 'now': (new_meta.get('counts') or {}).get('registry')},
            'note': 'rows the registry gained after the audit asOf' + (', rows it no longer qualifies' if removed_ids else '') +
                    ' and fields no part of the accounting reads; the coverage counts above are still the audit\'s own (asOf), '
                    'and the next private audit reads these rows'}}
           if (added_ids or owner_changed or removed_ids) else {}),
        'history': earlier.get('history', []) + ([{k: earlier[k] for k in ('on', 'previousCoreSha256', 'coreSha256', 'rowsChanged') if k in earlier}]
                                                 if earlier else []),
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(f'coverage receipt names the new core: {changed} venues changed only {sorted(fields)}; the audit read {receipt["venueCoreRefresh"]["auditedCoreSha256"][:12]}')


if __name__ == '__main__':
    main()

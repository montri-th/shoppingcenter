#!/usr/bin/env python3
"""Replace one dataset's roster input from a read-back, selected native ledger.

Inputs stay outside the public repository. Only whitelisted selected facts enter the
interchange: no private source references, raw owner replies or superseded snapshots.
The roster builder separately enforces evidence gates and explicit visibility holds.
"""
import argparse
import hashlib
import importlib.util
import json
from datetime import date, timedelta
from pathlib import Path

spec = importlib.util.spec_from_file_location('tenant_builder', Path(__file__).with_name('build-tenant-data.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def selected_date(value):
    if value in (None, ''):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return (date(1899, 12, 30) + timedelta(days=value)).isoformat()
    if builder.iso_date(value):
        return value
    raise ValueError('selected native DATE must be an ISO date or native serial')


def merge(base, table, as_of, dataset=builder.MLA_DATASET):
    headers, *values = table
    required = {'observation_id', 'registry_venue_id', 'display_name', 'source_role',
                'public_export_eligible', 'normalized_observation_json', 'source_authority',
                'primary_graph_observation', 'review_decision'}
    if not required.issubset(headers):
        raise ValueError('selected ledger headers missing')
    safe_fields = set(builder.ITEM_FIELDS) | {'accepted', 'primary', 'venueIds', 'sourceUrls',
                                             'visibilityHold', 'publicExportEligible', 'eventType', 'movementType'}
    replacement, seen = [], set()
    for values_row in values:
        row = dict(zip(headers, values_row))
        if not row.get('observation_id'):
            continue
        if row['observation_id'] in seen:
            raise ValueError('duplicate selected observation identity')
        seen.add(row['observation_id'])
        if row.get('primary_graph_observation') is not False:
            raise ValueError('additional ledger cannot rewrite the primary graph')
        if row.get('export_dataset_id') != dataset:
            raise ValueError('selected ledger dataset does not match replacement scope')
        normalized = json.loads(row['normalized_observation_json'])
        item = {k: v for k, v in normalized.items() if k in safe_fields}
        item.update(id=row['observation_id'], name=row['display_name'], displayName=row['display_name'],
                    brand=row.get('brand'), dataset=dataset, venueIds=[row['registry_venue_id']],
                    primary=False, accepted=row.get('public_export_eligible') is True,
                    publicExportEligible=row.get('public_export_eligible') is True,
                    sourceRole=row['source_role'], membershipStatus=row.get('membership_status'),
                    status=row.get('operation_status'), sourceAuthority=row['source_authority'],
                    sourceUrl=row.get('public_source_url'), sourceUrls=json.loads(row.get('public_source_urls_json') or '[]'),
                    sourceArtifactKey=row.get('source_artifact_key'), sourceRowKey=row.get('source_row_key'),
                    sourceSha256=row.get('source_sha256'))
        if row.get('category'):
            item['category'] = row['category']
        for source, dest in [('observed_on', 'observedOn'), ('source_date', 'sourceDate'),
                             ('source_checked_on', 'checkedOn'), ('reconciled_on', 'reconciledOn')]:
            item[dest] = selected_date(row.get(source))
        if item['sourceRole'] == builder.OWNER_ROLE:
            if row.get('source_match_status') != 'owner_confirmed_scoped_fact':
                raise ValueError('owner selected fact not reviewed as a scoped assertion')
            item.update(ownerAssertionDate=item['observedOn'],
                        relationshipBasis='owner_confirmed_scoped_identity_membership_or_state',
                        sourceGate='direct_owner_approved_fact_no_web_verification',
                        hostIdentityStatus='exact_canonical_venue_verified')
        matches = json.loads(row.get('matched_source_store_ids_json') or '[]')
        if matches:
            item['matchedSourceStoreIds'] = matches
            item['dedupeDisposition'] = row.get('dedupe_disposition')
        # A held row must not be reintroduced just because an older listing was accepted.
        if row.get('publication_use') == 'held_no_public_export':
            item['publicExportEligible'] = False
        replacement.append(item)
    result = {'meta': dict(base.get('meta', {})), 'observations': [
        item for item in base.get('observations', []) if item.get('dataset') != dataset] + replacement}
    result['meta']['asOf'] = as_of
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--base', required=True)
    ap.add_argument('--ledger', required=True, help='native read-back matrix: headers followed by bounded rows')
    ap.add_argument('--as-of', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    if not builder.iso_date(args.as_of):
        raise ValueError('--as-of requires ISO date')
    result = merge(json.loads(Path(args.base).read_text()), json.loads(Path(args.ledger).read_text()), args.as_of)
    result['meta']['selectedTenantLedgerSha256'] = hashlib.sha256(Path(args.ledger).read_bytes()).hexdigest()
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'observations': len(result['observations']), 'asOf': args.as_of}))


if __name__ == '__main__':
    main()

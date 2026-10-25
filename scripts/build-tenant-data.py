#!/usr/bin/env python3
"""Build the lazy tenant roster without changing venue or aggregate counts.

The input is a reviewed interchange JSON: {meta: {asOf, ...}, observations: [...] }.
Each observation must carry accepted=true, venueIds and the source-qualified outlet id.
Original primary host links require primary=true. Additional official branch observations
must be primary=false with the explicit reviewed exact-host role and relationship basis;
ordinary candidate / supplemental observations never enter the roster. The extraction
receipt belongs with the research inputs; this public build stores only its content hash.
An optional logo manifest maps "dataset|brandId" to a local file and its recorded SHA-256.
MLA listings use a separate, dated public-membership gate; they never upgrade current
operation or the original registry graph. Explicitly matched existing outlets receive
corroborating evidence rather than a second displayed shop.
"""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
SHARDS = 32
PRIVATE = re.compile(r'(?:docs|drive)\.google\.com', re.I)
MLA_ROLE = 'mla_dated_public_tenant_listing'
MLA_DATASET = 'research.MLA.PARC'
MLA_AUTHORITIES = {
    'google_business_profile_listing_observed_by_mla',
    'third_party_branch_directory_observed_by_mla',
    'official_merchant_branch_listing_observed_by_mla',
    'official_venue_directory_observed_by_mla',
    'public_named_host_directory_observed_by_mla',
}
ITEM_FIELDS = ('id', 'name', 'brand', 'brandId', 'dataset', 'branch', 'sourceUrl',
               'checkedOn', 'status', 'category', 'storeFormat', 'unitFloor',
               'evidenceStatus', 'statusSourceUrl', 'statusCheckedOn', 'role',
               'sourceRole', 'relationshipBasis', 'sourceDate', 'sourceSha256',
               'brandCrosswalkBasis', 'sourceObservationIds', 'sourceObservations',
               'sourceObservationCount', 'sourceBranchId', 'sourceIdRole',
               'physicalDistinctness', 'displayQualifier', 'identityStatus',
               'formatLogoKey', 'registeredChildVenueId', 'sourceGate', 'reconciledOn',
               'displayName', 'displayBrand', 'retailerRole', 'sourceStoreName',
               'representedBrands', 'displayIdentityBasis', 'sourceCorrectionBasis',
               'supersededSourceUrl', 'sourceCheckedOn', 'suppressManufacturerLogo',
               'hostIdentityStatus', 'membershipStatus', 'observedOn', 'sourceAuthority',
               'sourceArtifactKey', 'sourceRowKey', 'membershipEvidenceNote',
               'sourceCategoryL1', 'sourceCategoryL2', 'categoryVerificationStatus',
               'categoryConflict', 'latestListingRefreshOn', 'refreshIdentityBasis',
               'matchedSourceStoreIds', 'dedupeDisposition', 'identityNote')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def shard_of(value):
    h = 0x811c9dc5
    for b in str(value).encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xffffffff
    return h % SHARDS


def public_url(value):
    if not value or PRIVATE.search(str(value)):
        return None
    if any(c.isspace() for c in str(value)):
        return None
    u = urlparse(str(value))
    return str(value) if u.scheme in ('https', 'http') and u.netloc else None


def public_urls(value):
    values = value if isinstance(value, list) else [value]
    found = []
    for entry in values:
        for match in re.findall(r'https?://[^\s<>"\'|]+', str(entry or '')):
            url = public_url(match.rstrip(',;'))
            if url and url not in found:
                found.append(url)
    return found


def iso_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def public_membership_source(value):
    """Reject unscoped home/search pages; exact source scope is still a reviewed input fact."""
    url = public_url(value)
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.username or parsed.password or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    if host in {'localhost', '127.0.0.1', '::1'} or host.endswith('.googleusercontent.com'):
        return False
    query = parse_qs(parsed.query)
    if host in {'google.com', 'www.google.com'}:
        if parsed.path.startswith('/search'):
            return False
        if parsed.path.startswith('/maps/search') and not query.get('query_place_id'):
            return False
    return bool(parsed.path.strip('/') or query.get('cid') or query.get('query_place_id') or query.get('place_id'))


def mla_gate(observation, as_of):
    """A dated directory membership is neither a movement promotion nor a present-open claim."""
    if observation.get('sourceRole') != MLA_ROLE or observation.get('dataset') != MLA_DATASET:
        return 'mla_source_role'
    if observation.get('accepted') is not True or observation.get('primary') is not False:
        return 'mla_not_accepted_dated_membership'
    if (observation.get('relationshipBasis') != 'mla_dated_public_branch_or_host_listing_exact_canonical_host'
            or observation.get('sourceGate') != 'public_branch_specific_source_and_dated_membership_observation_reconciled_to_canonical_venue'
            or observation.get('hostIdentityStatus') != 'exact_canonical_venue_verified'):
        return 'mla_host_evidence_gate'
    ids = observation.get('venueIds')
    if not isinstance(ids, list) or len(ids) != 1 or not isinstance(ids[0], str) or not ids[0].strip():
        return 'mla_single_exact_host_required'
    if observation.get('membershipStatus') not in {'source_listed_at_observation', 'dated_directory_listed'}:
        return 'mla_membership_not_observed'
    if observation.get('status') != 'dated_listing_current_operation_unconfirmed':
        return 'mla_operation_not_promoted'
    if observation.get('eventType') or observation.get('movementType'):
        return 'mla_event_not_membership'
    observed = iso_date(observation.get('observedOn'))
    source_date = iso_date(observation.get('sourceDate')) if observation.get('sourceDate') else None
    if not observed or observed > iso_date(as_of) or (observation.get('sourceDate') and not source_date) or (source_date and source_date > iso_date(as_of)):
        return 'mla_missing_or_invalid_observation_date'
    if (observation.get('sourceAuthority') not in MLA_AUTHORITIES
            or not public_membership_source(observation.get('sourceUrl'))
            or not re.fullmatch(r'[a-fA-F0-9]{64}', str(observation.get('sourceSha256') or ''))
            or not str(observation.get('sourceArtifactKey') or '').strip()
            or not str(observation.get('sourceRowKey') or '').strip()):
        return 'mla_public_source_provenance'
    matches = observation.get('matchedSourceStoreIds')
    if matches is not None and (not isinstance(matches, list) or len(matches) != 1 or not isinstance(matches[0], str)
                                or observation.get('dedupeDisposition') != 'corroborate_existing_outlet_do_not_append'):
        return 'mla_explicit_existing_outlet_match_required'
    return None


def clean_item(observation):
    item = {key: observation[key] for key in ITEM_FIELDS if observation.get(key) not in (None, '')}
    if not item.get('sourceRole') and observation.get('rosterRole'):
        item['sourceRole'] = observation['rosterRole']
    for key in ('id', 'name', 'dataset'):
        if not isinstance(item.get(key), str) or not item[key].strip():
            raise ValueError(f'missing tenant {key}')
    count = item.get('sourceObservationCount', 1)
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise ValueError('sourceObservationCount must be a positive integer')
    for key in ('sourceObservationIds', 'sourceObservations'):
        if key in item and (not isinstance(item[key], list) or len(item[key]) != count):
            raise ValueError(f'{key} does not match sourceObservationCount')
    source_urls = public_urls(observation.get('sourceUrls', []))
    for url in public_urls(observation.get('sourceUrl')):
        if url not in source_urls:
            source_urls.append(url)
    item.pop('sourceUrl', None)
    if source_urls:
        item['sourceUrl'] = source_urls[0]
        item['sourceUrls'] = source_urls
    for key in ('statusSourceUrl',):
        if key in item:
            item[key] = next(iter(public_urls(item[key])), None)
            if item[key] is None:
                del item[key]
    if PRIVATE.search(json.dumps(item, ensure_ascii=False)):
        raise ValueError('private document reference in tenant item')
    return item


def verified_logo(record, root):
    if not record:
        return None
    file = record.get('file', '')
    if not isinstance(file, str) or not file.startswith('assets/tenant-logos/') or '..' in Path(file).parts:
        raise ValueError('tenant logo must be a local asset in assets/tenant-logos/')
    path = root / file
    if not path.is_file() or digest(path) != record.get('sha256'):
        raise ValueError(f'tenant logo bytes differ from recorded hash: {file}')
    result = {k: record[k] for k in ('file', 'sha256', 'mime', 'width', 'height', 'background') if record.get(k) is not None}
    if record.get('sourceUrl'):
        result['sourceUrl'] = public_url(record['sourceUrl'])
    return result


def build(payload, venue_file, logo_manifest=None, root=ROOT):
    document = json.loads(Path(venue_file).read_text())
    fields = document['meta']['coreFields']
    rows = [r if isinstance(r, dict) else dict(zip(fields, r)) for r in document['rows']]
    venues = {r['id']: r for r in rows}
    as_of = payload.get('meta', {}).get('asOf')
    if not iso_date(as_of):
        raise ValueError('input meta.asOf must be an ISO date')
    logos = logo_manifest or {}
    rosters = defaultdict(list)
    seen = set()
    omitted, datasets, status, source_roles = Counter(), Counter(), Counter(), Counter()
    input_rows = 0
    mla_counts = Counter()
    # Resolve original/official outlets before explicit MLA corroboration, independent of input order.
    observations = sorted(payload.get('observations', []), key=lambda row: row.get('sourceRole') == MLA_ROLE or row.get('dataset') == MLA_DATASET)
    for observation in observations:
        input_rows += 1
        is_mla = observation.get('sourceRole') == MLA_ROLE or observation.get('dataset') == MLA_DATASET
        mla_error = mla_gate(observation, as_of) if is_mla else None
        if is_mla and mla_error:
            omitted[mla_error] += 1
            continue
        original_primary = observation.get('primary') is True and not is_mla
        additional_official = (observation.get('primary') is False
                               and observation.get('sourceRole') == 'official_chain_exact_named_host_listing'
                               and observation.get('relationshipBasis') ==
                               'official_brand_or_host_directory_explicit_branch_venue_label_unique_canonical_alias_no_far_point_conflict'
                               and bool(public_urls(observation.get('sourceUrl'))))
        registered_grocery = (observation.get('primary') is False
                              and observation.get('sourceRole') == 'official_grocery_explicit_parent_host_listing'
                              and observation.get('sourceGate') ==
                              'official_named_branch_and_unit_house_address_agree_with_existing_Main_parent_identity'
                              and observation.get('relationshipBasis') ==
                              'official_branch_name_and_unit_address_agree_with_existing_Main_parent_venue_identity'
                              and bool(observation.get('registeredChildVenueId'))
                              and bool(public_urls(observation.get('sourceUrl'))))
        if observation.get('accepted') is not True or not (original_primary or additional_official or registered_grocery or is_mla):
            omitted['not_accepted_primary'] += 1
            continue
        item = clean_item(observation)
        key = item['id']
        if key in seen:
            raise ValueError(f'duplicate source-qualified observation id: {key}')
        seen.add(key)
        ids = observation.get('venueIds', [])
        if not isinstance(ids, list) or len(set(ids)) != len(ids) or not ids:
            raise ValueError(f'invalid accepted venue IDs: {key}')
        logo = (None if item.get('suppressManufacturerLogo') is True else
                verified_logo(logos.get(f"{item['dataset']}|{item.get('brandId', '')}"), root))
        if logo:
            item['logo'] = logo
        for venue_id in ids:
            if venue_id not in venues:
                omitted['host_outside_public_qualified_population'] += 1
                continue
            if is_mla and observation.get('matchedSourceStoreIds'):
                target_id = observation['matchedSourceStoreIds'][0]
                target = next((existing for existing in rosters[venue_id] if existing['id'] == target_id), None)
                if target is None:
                    omitted['mla_existing_outlet_match_not_in_same_host'] += 1
                    continue
                # Preserve selected identity, status, logo and original source-card count.
                target.setdefault('corroboratingMembershipEvidence', []).append(dict(item))
                mla_counts['corroboratingExistingListings'] += 1
                continue
            rosters[venue_id].append(dict(item))
            datasets[item['dataset']] += 1
            status[item.get('status', 'unknown')] += 1
            source_roles[item.get('sourceRole', 'unspecified')] += 1
            if is_mla:
                mla_counts['newDisplayedListings'] += 1
    shards = [dict() for _ in range(SHARDS)]
    mismatches = []
    for venue_id, items in sorted(rosters.items()):
        # Source order is deterministic. The consumer applies the documented contextual rank.
        items.sort(key=lambda row: row['id'])
        source_count = sum(item.get('sourceObservationCount', 1) for item in items)
        shards[shard_of(venue_id)][venue_id] = {'observations': len(items),
                                             'sourceObservationCount': source_count, 'items': items}
        old_count = venues[venue_id].get('storeCount') or 0
        if old_count != len(items):
            mismatches.append({'venueId': venue_id, 'summaryObservations': old_count, 'rosterObservations': len(items)})
    meta = {'schemaVersion': '1', 'asOf': as_of, 'shards': SHARDS,
            'scope': 'verified_registry_tenant_observations',
            'population': 'reviewed source observations with accepted host identity',
            'entryGrain': 'displayed retailer listings; unresolved duplicate source cards grouped',
            'rankPolicyVersion': 'contextual-tenant-role-v1'}
    outputs = [{'meta': meta, 'venues': shard} for shard in shards]
    report = {'asOf': as_of, 'inputObservations': input_rows, 'eligibleSourceObservations': len(seen),
              'publishedVenueHosts': len(rosters), 'publishedObservations': sum(map(len, rosters.values())),
              'publishedItems': sum(map(len, rosters.values())),
              'publishedSourceObservations': sum(item.get('sourceObservationCount', 1) for items in rosters.values() for item in items),
              'datasets': dict(sorted(datasets.items())), 'statuses': dict(sorted(status.items())),
              'sourceRoles': dict(sorted(source_roles.items())),
              'mlaMembership': dict(mla_counts),
              'withLogo': sum(bool(item.get('logo')) for items in rosters.values() for item in items),
              'retailerIdentity': {
                  'manufacturerLogosSuppressed': sum(item.get('suppressManufacturerLogo') is True for items in rosters.values() for item in items),
                  'monoBrandRetailerNames': sum(item.get('retailerRole') == 'source_named_mono_brand_boutique_retailer' for items in rosters.values() for item in items),
                  'publicSourceCorrections': sum(bool(item.get('sourceCorrectionBasis')) for items in rosters.values() for item in items),
                  'scope': 'retailer identity display only; source IDs and source-observation counts retained',
              },
              'omitted': dict(omitted), 'summaryDifferences': mismatches, 'shards': SHARDS,
              'scope': meta['scope'],
              'limits': ['Source observations are a partial roster, not a current tenant census.',
                         'Source-listed status and closure conflicts remain separate from host identity.',
                         'Ranking is a contextual editorial priority, not measured visits, sales or footfall.',
                         'Dated MLA membership does not establish current operation; existing-outlet corroboration is evidence, not another displayed/source-card count.',
                         'Venue core rows and aggregate store counts are not rewritten by this build.']}
    return outputs, report


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--observations', required=True)
    ap.add_argument('--venues', default=str(ROOT / 'data/venues.json'))
    ap.add_argument('--logos', help='optional verified local tenant-logo manifest')
    ap.add_argument('--out', default=str(ROOT / 'data/tenants'))
    args = ap.parse_args()
    payload = json.loads(Path(args.observations).read_text())
    logos = json.loads(Path(args.logos).read_text()) if args.logos else {}
    outputs, report = build(payload, args.venues, logos)
    report['inputSha256'] = digest(args.observations)
    report['venueCoreSha256'] = digest(args.venues)
    if args.logos:
        report['logoManifestSha256'] = digest(args.logos)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for n, output in enumerate(outputs):
        (out / f'{n:02d}.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    (out / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({**{k: report[k] for k in ('publishedVenueHosts', 'publishedObservations', 'withLogo')},
                      'summaryDifferenceHosts': len(report['summaryDifferences'])}))


if __name__ == '__main__':
    main()

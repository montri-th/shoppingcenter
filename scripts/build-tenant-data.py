#!/usr/bin/env python3
"""Build the lazy tenant roster without changing venue or aggregate counts.

The input is a reviewed interchange JSON: {meta: {asOf, ...}, observations: [...] }.
Each observation must carry accepted=true, venueIds and the source-qualified outlet id.
Original primary host links require primary=true. Additional official branch observations
must be primary=false with the explicit reviewed exact-host role and relationship basis;
ordinary candidate / supplemental observations never enter the roster. The extraction
receipt belongs with the research inputs; this public build stores only its content hash.
An optional logo manifest maps "dataset|brandId" to a local file and its recorded SHA-256.
"""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
SHARDS = 32
PRIVATE = re.compile(r'(?:docs|drive)\.google\.com', re.I)
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
               'supersededSourceUrl', 'sourceCheckedOn', 'suppressManufacturerLogo')


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
    if not as_of or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(as_of)):
        raise ValueError('input meta.asOf must be an ISO date')
    logos = logo_manifest or {}
    rosters = defaultdict(list)
    seen = set()
    omitted, datasets, status, source_roles = Counter(), Counter(), Counter(), Counter()
    input_rows = 0
    for observation in payload.get('observations', []):
        input_rows += 1
        original_primary = observation.get('primary') is True
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
        if observation.get('accepted') is not True or not (original_primary or additional_official or registered_grocery):
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
            rosters[venue_id].append(dict(item))
            datasets[item['dataset']] += 1
            status[item.get('status', 'unknown')] += 1
            source_roles[item.get('sourceRole', 'unspecified')] += 1
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

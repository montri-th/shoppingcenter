#!/usr/bin/env python3
"""Append reviewed official-directory listings to the existing tenant roster.

Input stays outside this repository. It is a field-limited interchange built only
after native research-master writes and their readbacks. This adapter does not
interpret a host-only sidecar as permission to publish every linked source row.
Food retains the existing official-chain role. Miscellaneous admits recognized
retail/service banners with an exact official consumer-directory host, while
retaining unresolved format and industry scope. Partner/employer lists, product
presences, provisional trade names, component holds and operation claims stay out.

Run after the other tenant linkers and before build-tenant-index.py. Re-running
removes only this adapter's previous additions and corroborations. Venue cores,
primary records, original statuses, logos and geometry remain unchanged.
"""
import argparse
import collections
import copy
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
MARKER = 'official-venue-network-2026-11-07:'
FOOD = 'research.TH.restaurants'
MISC = 'research.TH.miscellaneous'
FOOD_ROLE = 'official_chain_exact_named_host_listing'
MISC_ROLE = 'official_venue_directory_reconciled_consumer_listing'
DIRECTORY_ROLE = 'official_venue_directory_reconciled_registry_listing'
HOBBY_ROLE = 'official_brand_exact_named_host_listing'
SERVICE_ROLE = 'official_venue_directory_reconciled_service_observation'
REVIEWED_DATASETS = {'research.TH.' + key for key in (
    'apparel', 'bank', 'beauty', 'beauty_clinic', 'camera', 'fitness', 'furniture',
    'gold', 'grocery', 'hobby', 'luxury', 'massage_spa', 'optical', 'pet',
    'pharmacy', 'playground', 'sport')}
BOUNDED_SERVICE_DATASETS = {'research.TH.nail', 'research.TH.salon_barber', 'research.TH.hospital', 'research.TH.school'}
FOOD_BASIS = 'official_brand_or_host_directory_explicit_branch_venue_label_unique_canonical_alias_no_far_point_conflict'
MISC_BASIS = 'official_consumer_directory_recognized_banner_exact_reviewed_host_format_unresolved_no_industry_pos_upgrade'
DIRECTORY_DOMAINS = {
    'truedigitalpark.com', 'iconsiam.com', 'themalllifestore.com',
    'onebangkok.com', 'mega-bangna.com', 'futurepark.co.th',
    'centralpattana.co.th',
}
BRAND_LOCATORS = {'getfresh.co.th'}
RETAINED_PRIMARY_DOMAINS = {'starbucks.com', 'snpfood.com', 'cafe-amazon.com',
    'blackcanyon.co.th', 'samitivejhospitals.com', 'siphhospital.com',
    'bangkokhospital.com', 'fuji.co.th', 'bumrungrad.com', 'greyhoundcafe.co.th',
    'cocothailand.com', 'nadimos.com', 'mudandhound.co.th', 'yayoirestaurants.com', 'ootoya.com'}
PRIVATE = re.compile(r'(?:docs|drive)\.google\.com|googleusercontent\.com|/Users/|/private/|(?:target_)?spreadsheet_id', re.I)

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

builder = module('venue_network_builder', 'build-tenant-data.py')
linker = module('venue_network_research', 'link-research-tenants.py')

def sha256(raw):
    return hashlib.sha256(raw).hexdigest()

def public_source(url, domains):
    if not builder.public_url(url):
        return False
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password:
        return False
    domain = (parsed.hostname or '').lower().removeprefix('www.')
    return any(domain == d or domain.endswith('.' + d) for d in domains)

def gate(row, as_of):
    """Fail closed on the evidence role; native acceptance alone is insufficient."""
    if (row.get('accepted') is not True or row.get('primary') is not False
            or row.get('scopeApproved') is not True or row.get('canonicalIdentityAccepted') is not True):
        return 'not_reviewed_accepted_source_identity'
    kind = row.get('projectionKind', 'base')
    if kind not in {'base', 'original31_food', 'original31_hobby', 'selected_host_directory', 'bounded_service_directory'}:
        return 'unsupported_projection_kind'
    if row.get('dataset') not in {FOOD, MISC} | REVIEWED_DATASETS | BOUNDED_SERVICE_DATASETS:
        return 'dataset_out_of_scope'
    if kind == 'base' and row.get('dataset') not in {FOOD, MISC}:
        return 'dataset_requires_specific_projection_gate'
    if row.get('hostIdentityStatus') not in {'source_qualified_named_host_identity',
                                            'source_qualified_official_directory_host_identity'}:
        return 'host_identity_not_selected'
    ids = row.get('venueIds')
    if not isinstance(ids, list) or len(ids) != 1 or not ids[0]:
        return 'single_exact_host_required'
    if row.get('status') != 'publisher_listed_not_field_verified' or row.get('visibilityHold') or row.get('eventType'):
        return 'not_current_consumer_listing'
    checked = builder.iso_date(row.get('checkedOn'))
    if not checked or not builder.iso_date(as_of) or checked > builder.iso_date(as_of):
        return 'invalid_source_check_date'
    if ((not row.get('brandId') and not (kind == 'bounded_service_directory' and row.get('sourceConceptId')))
            or not row.get('brand') or not row.get('sourceRowKey')
            or not row.get('sourceBranchId') or not row.get('canonicalOutletIds')
            or not row.get('sourceHashScope')
            or not re.fullmatch('[a-f0-9]{64}', str(row.get('sourceSha256') or ''))):
        return 'missing_source_or_canonical_identity'
    authority, url = row.get('sourceAuthority'), row.get('sourceUrl')
    if authority == 'official_venue_consumer_directory':
        if not public_source(url, DIRECTORY_DOMAINS):
            return 'not_allowed_official_directory_url'
    elif authority == 'official_brand_consumer_locator' and row.get('dataset') in {FOOD, 'research.TH.hobby'}:
        domains = {'elephantparade.com'} if kind == 'original31_hobby' else BRAND_LOCATORS
        if not public_source(url, domains):
            return 'not_allowed_brand_consumer_locator'
    elif authority == 'retained_primary_brand_or_host_master' and kind == 'original31_food':
        if not public_source(url, RETAINED_PRIMARY_DOMAINS):
            return 'not_allowed_retained_primary_source'
    else:
        return 'nonconsumer_or_partner_employer_source'
    if kind == 'bounded_service_directory':
        if (row['dataset'] not in BOUNDED_SERVICE_DATASETS or authority != 'official_venue_consumer_directory'
                or not public_source(url, DIRECTORY_DOMAINS)
                or row.get('nativeServiceReadbackVerified') is not True
                or row.get('nativeIdentityHold') is not False
                or row.get('sourceListingRole') != 'bounded_consumer_service_observation'
                or row.get('selectedCoordinates') != [None, None]
                or row.get('sourceRecordTab') not in {'02_STORES', '16_DENTAL_VENUES', '31_LEARNING_BRANCH_EVIDENCE'}):
            return 'service_scope_or_identity_hold'
    elif kind == 'selected_host_directory':
        if (row['dataset'] not in REVIEWED_DATASETS or authority != 'official_venue_consumer_directory'
                or row.get('staticScreenVerified') is not True or row.get('nativeIdentityHold') is not False
                or row.get('sourceListingRole') != 'reviewed_current_directory_registry_membership'):
            return 'industry_directory_static_or_identity_hold'
    elif kind == 'original31_hobby':
        if (row['dataset'] != 'research.TH.hobby' or row.get('nativeIdentityHold') is not False
                or row.get('sourceListingRole') != 'reviewed_named_hotel_retail_branch'
                or row.get('selectedCoordinates') != [None, None]):
            return 'hobby_identity_or_rejected_point'
    elif row['dataset'] == FOOD:
        if row.get('sourceListingRole') != 'official_consumer_food_location':
            return 'food_listing_role_not_qualified'
    elif row['dataset'] == MISC:
        if (row.get('brandIdentityRole') != 'retail_banner_or_service_provider'
                or row.get('scopeStatus') not in {'existing_brand_new_scope_membership', 'miscellaneous_current_registry_gap'}):
            return 'misc_brand_scope_review'
        if row.get('sourceListingRole') not in {'format_unresolved', 'official_consumer_shop_directory_membership',
                                                'consumer_visible_store_or_service'}:
            return 'misc_non_branch_or_counter_product_presence'
        if row.get('storeFormat') != 'source_listed_consumer_location_format_unresolved':
            return 'misc_format_or_industry_pos_upgrade'
    else:
        return 'unsupported_projection_kind'
    return None

def food_item(rows, venue):
    row = rows[0]
    canonical = sorted({oid for r in rows for oid in r['canonicalOutletIds']})
    native = sorted({r['sourceRowKey'] for r in rows})
    rowkey = canonical[0] if len(canonical) == 1 else 'directory-' + sha256('|'.join(native).encode())[:20]
    branch = venue.get('name') or venue['id']
    item = {
        'id': f'{row["dataset"]}:{row.get("sourceRecordTab", "02_STORES")}:{rowkey}',
        'name': f'{row["brand"]} · {branch}', 'brand': row['brand'], 'brandId': row['brandId'],
        'dataset': row['dataset'], 'branch': branch, 'sourceStoreName': row['sourceStoreName'],
        'checkedOn': row['checkedOn'], 'status': row['status'], 'category': row['category'],
        'storeFormat': row['storeFormat'], 'unitFloor': row.get('unitFloor') or '',
        'evidenceStatus': row['evidenceStatus'],
        'sourceRole': SERVICE_ROLE if row.get('projectionKind') == 'bounded_service_directory' else
                      DIRECTORY_ROLE if row.get('projectionKind') == 'selected_host_directory' else
                      HOBBY_ROLE if row.get('projectionKind') == 'original31_hobby' else
                      FOOD_ROLE if row['dataset'] == FOOD else MISC_ROLE,
        'relationshipBasis': FOOD_BASIS if row['dataset'] == FOOD else MISC_BASIS if row['dataset'] == MISC else
                             'reviewed_exact_named_host_current_publisher_listing_original_registry_qualifications_retained',
        'sourceUrl': row['sourceUrl'], 'sourceUrls': sorted({r['sourceUrl'] for r in rows}),
        'sourceSha256': row['sourceSha256'], 'sourceArtifactKey': row['sourceArtifactKey'],
        'sourceHashScope': row['sourceHashScope'],
        'sourceRowKey': rowkey, 'sourceBranchId': row['sourceBranchId'],
        'sourceGate': 'reviewed_official_consumer_source_exact_host_and_retained_canonical_identity',
        'hostIdentityStatus': row['hostIdentityStatus'], 'sourceAuthority': row['sourceAuthority'],
        'sourceObservationIds': native, 'sourceObservationCount': len(native),
        'matchedSourceStoreIds': canonical,
        'physicalDistinctness': 'source_listing_observation_not_independently_verified_storefront',
        'reconciledOn': row.get('reconciledOn', row['checkedOn']),
        'identityNote': 'Exact official named host; source listing, operation not field verified. '
                        'Supporting research identities retained; no outlet merge or selected-point inference. '
                        'Source hash scope: ' + row['sourceHashScope'] + '.'
    }
    item['sourceEvidence'] = [{'sourceObservationId': r['sourceRowKey'], 'sourceUrl': r['sourceUrl'],
                              'checkedOn': r['checkedOn'], 'sourceSha256': r['sourceSha256'],
                              'sourceHashScope': r['sourceHashScope']} for r in rows]
    if row.get('nativeQualificationNote'):
        item['identityNote'] += ' Original research qualification: ' + row['nativeQualificationNote']
    if row.get('projectionKind') == 'bounded_service_directory':
        item['sourceRecordTab'] = row['sourceRecordTab']
        item['brandIdentityRole'] = 'native_brand' if row.get('brandId') else 'publisher_named_service_concept_not_canonical_brand_master'
        if row.get('sourceConceptId'):
            item['sourceConceptId'] = row['sourceConceptId']
    if row['dataset'] == MISC:
        item['identityNote'] += ' Recognized consumer banner; shop/counter format unresolved; no Camera/Hobby POS upgrade.'
    return item

def own_record(item):
    return str(item.get('sourceArtifactKey') or '').startswith(MARKER)

def remove_own(items):
    result = []
    for value in items:
        if own_record(value):
            continue
        item = copy.deepcopy(value)
        if 'corroboratingMembershipEvidence' in item:
            evidence = [x for x in item['corroboratingMembershipEvidence'] if not own_record(x)]
            if evidence: item['corroboratingMembershipEvidence'] = evidence
            else: item.pop('corroboratingMembershipEvidence')
        result.append(item)
    return result

def current_ids(item):
    ids = {item['id'].rsplit(':', 1)[-1], *item.get('sourceObservationIds', []),
           *item.get('matchedSourceStoreIds', [])}
    if (own_record(item) and item.get('sourceAuthority') == 'official_venue_consumer_directory') or str(item.get('sourceBranchId') or '').startswith(('truedigitalpark:', 'iconsiam-', 'themall-', 'onebangkok:', 'mega-', 'futurepark:', 'centralpattana:')):
        ids.add(item['sourceBranchId'])
    for evidence in item.get('corroboratingMembershipEvidence', []):
        ids.update(current_ids(evidence))
    return ids

def ring_contains(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        ax, ay = a[:2]; bx, by = b[:2]
        cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
        if abs(cross) <= 1e-12 and min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by):
            return True
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside

def contains(point, geometry):
    polygons = [geometry['coordinates']] if geometry.get('type') == 'Polygon' else geometry.get('coordinates', []) if geometry.get('type') == 'MultiPolygon' else []
    return any(rings and ring_contains(point, rings[0]) and not any(ring_contains(point, r) for r in rings[1:]) for rings in polygons)

def point_checker(venues, buildings):
    footprints = collections.defaultdict(list)
    for feature in buildings.get('features', []):
        for vid in feature.get('properties', {}).get('venue_ids') or []:
            footprints[vid].append(feature['geometry'])
    def check(own, vid):
        venue = venues[vid]
        if None in own or venue.get('lat') is None:
            return True, None
        lat, lon = own
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return False, None
        distance = linker.hosts.distance_m(own, (venue['lat'], venue['lon']))
        # Exact footprint containment is deliberately stricter than a buffered-near test.
        return distance <= 300 or any(contains((lon, lat), g) for g in footprints[vid]), round(distance)
    return check

def merge(payload, rosters, venues, point_check, audit=None):
    as_of = payload.get('meta', {}).get('asOf')
    if not builder.iso_date(as_of):
        raise ValueError('meta.asOf must be a full ISO date')
    if (payload['meta'].get('nativeFoodAllWritesVerified') is not True
            or payload['meta'].get('nativeMiscAllWritesVerified') is not True):
        raise ValueError('native data readback receipts are required')
    for kind, flag in [('selected_host_directory', 'selectedHostNativeReadbackVerified'),
                       ('bounded_service_directory', 'boundedServiceNativeReadbackVerified'),
                       ('original31_food', 'original31NativeReadbackVerified'),
                       ('original31_hobby', 'original31NativeReadbackVerified')]:
        if any(r.get('projectionKind') == kind for r in payload['observations']) and payload['meta'].get(flag) is not True:
            raise ValueError('specific source master readback receipt is required')
    original = {vid: remove_own(items) for vid, items in rosters.items()}
    result = copy.deepcopy(original)
    omitted, additions, corroborations = collections.Counter(), [], []
    omission_rows = []
    def omit(rows, reason):
        omitted[reason] += len(rows)
        omission_rows.extend({'sourceId': r['sourceRowKey'], 'kind': r.get('projectionKind', 'base'),
                              'brand': r['brand'], 'venueId': r['venueIds'][0], 'reason': reason} for r in rows)
    new_corroborations = []
    corroborated_existing_keys, corroborated_new_keys = set(), set()
    grouped = collections.OrderedDict()
    seen = set()
    for row in sorted(payload['observations'], key=lambda r: (r['dataset'], r['sourceRowKey'])):
        key = (row['dataset'], row['sourceRowKey'])
        if key in seen: raise ValueError('duplicate publisher source observation')
        seen.add(key)
        reason = gate(row, as_of)
        if reason:
            omit([row], reason); continue
        vid = row['venueIds'][0]
        if vid not in venues:
            omit([row], 'host_outside_public_qualified_population'); continue
        ok, _ = point_check(row.get('selectedCoordinates') or [None, None], vid)
        if not ok:
            omit([row], 'far_point_conflict'); continue
        # Several component observations accepted as one native Misc branch stay one branch.
        group = (row['dataset'], vid, tuple(row['canonicalOutletIds'])) if row['dataset'] == MISC or row.get('projectionKind') else (row['dataset'], vid, row['sourceRowKey'])
        grouped.setdefault(group, []).append(row)
    taken = set()
    for group, rows in grouped.items():
        vid = rows[0]['venueIds'][0]
        item = food_item(rows, venues[vid])
        ids = {oid for r in rows for oid in [*r.get('existingSourceIds', []), *r['canonicalOutletIds']]}
        ids.update(r['sourceBranchId'] for r in rows if r.get('projectionKind') in {'selected_host_directory', 'bounded_service_directory'})
        # Include this run's already-attached evidence on original branches: a
        # second native row can refer to the same current directory card.
        exact = [x for x in result.get(vid, []) if not own_record(x) and current_ids(x) & ids]
        if len(exact) > 1:
            omit(rows, 'multiple_existing_outlet_identities'); continue
        matches = exact
        if not matches:
            brand = linker.brand_key(item['brand'])
            floor = linker.floor_key(item)
            matches = [x for x in original.get(vid, []) if (vid, x['id']) not in taken
                       and linker.brand_key(x.get('displayBrand') or x.get('brand') or x['name']) == brand
                       and ((not rows[0].get('projectionKind') and (not floor or not linker.floor_key(x)))
                            or (floor and floor == linker.floor_key(x)))]
        if len(matches) > 1:
            omit(rows, 'ambiguous_existing_same_brand_branch'); continue
        if matches:
            target = next(x for x in result[vid] if x['id'] == matches[0]['id'])
            # Preserve original identity, status, logo and original observation counts.
            target.setdefault('corroboratingMembershipEvidence', []).append(item)
            taken.add((vid, target['id']))
            corroborated_existing_keys.add((vid, target['id']))
            corroborations.append((vid, item)); continue
        # Reconcile with additions from this run too, including shared canonical
        # outlets in two industries. Different publisher entries with distinct
        # native outlet IDs remain distinct unless unit evidence proves otherwise.
        new_matches = [x for x in result.get(vid, []) if own_record(x) and current_ids(x) & ids]
        if not new_matches:
            floor = linker.floor_key(item)
            new_matches = [x for x in result.get(vid, []) if own_record(x)
                           and linker.brand_key(x['brand']) == linker.brand_key(item['brand'])
                           and floor and floor == linker.floor_key(x)
                           and urlparse(x['sourceUrl']).hostname != urlparse(item['sourceUrl']).hostname]
        if len(new_matches) > 1:
            omit(rows, 'multiple_new_outlet_identities'); continue
        if new_matches:
            target = new_matches[0]
            target.setdefault('corroboratingMembershipEvidence', []).append(item)
            corroborated_new_keys.add((vid, target['id']))
            new_corroborations.append((vid, item)); continue
        # An unresolved generic same-brand host match does not create a new unit.
        if rows[0].get('projectionKind') and any(
                linker.brand_key(x.get('displayBrand') or x.get('brand') or x['name']) == linker.brand_key(item['brand'])
                and (not linker.floor_key(item) or not linker.floor_key(x)) for x in result.get(vid, [])):
            omit(rows, 'same_brand_host_unit_unresolved'); continue
        result.setdefault(vid, []).append(item)
        additions.append((vid, item))
    for items in result.values(): items.sort(key=lambda x: x['id'])
    # No mutation of an original fact, even when a fresh directory corroborates it.
    for vid, items in original.items():
        assert remove_own(result[vid]) == sorted(items, key=lambda x: x['id'])
    if audit is not None:
        audit['omittedObservations'] = omission_rows
    return result, {'inputObservations': len(payload['observations']),
                    'newItems': len(additions), 'newHosts': len({v for v, _ in additions}),
                    'newSourceObservations': sum(x['sourceObservationCount'] for _, x in additions),
                    'corroboratingExistingItems': len(corroborated_existing_keys),
                    'corroboratingExistingEvidenceGroups': len(corroborations),
                    'corroboratingSourceObservations': sum(x['sourceObservationCount'] for _, x in corroborations),
                    'corroboratingNewItems': len(corroborated_new_keys),
                    'corroboratingNewEvidenceGroups': len(new_corroborations),
                    'corroboratingNewSourceObservations': sum(x['sourceObservationCount'] for _, x in new_corroborations),
                    'newItemsByDataset': dict(sorted(collections.Counter(x['dataset'] for _, x in additions).items())),
                    'omitted': dict(sorted(omitted.items()))}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--observations', required=True)
    args = parser.parse_args()
    path = Path(args.observations).resolve()
    if ROOT == path or ROOT in path.parents:
        raise SystemExit('Research interchange must stay outside the public repository')
    raw = path.read_bytes(); payload = json.loads(raw)
    core_path = ROOT / 'data/venues.json'; core_before = core_path.read_bytes()
    venue_doc = json.loads(core_before)
    venues = {r['id']: r for r in venue_doc['rows']}
    buildings = json.loads((ROOT / 'data/venue-buildings.geojson').read_text())
    folder = ROOT / 'data/tenants'
    shards = [json.loads((folder / f'{n:02}.json').read_text()) for n in range(builder.SHARDS)]
    rosters = {vid: r['items'] for s in shards for vid, r in s['venues'].items()}
    result, receipt = merge(payload, rosters, venues, point_checker(venues, buildings))
    manifest = json.loads((ROOT / 'assets/tenant-logos-manifest.json').read_text())
    for vid, items in result.items():
        for item in items:
            if own_record(item):
                logo = builder.verified_logo(manifest.get(f"{item['dataset']}|{item.get('brandId', '')}"), ROOT)
                if logo: item['logo'] = logo
    meta = {**shards[0]['meta'], 'asOf': payload['meta']['asOf']}
    out = [{'meta': meta, 'venues': {}} for _ in range(builder.SHARDS)]
    for vid, items in sorted(result.items()):
        out[builder.shard_of(vid)]['venues'][vid] = {
            'observations': len(items), 'sourceObservationCount': sum(x.get('sourceObservationCount', 1) for x in items), 'items': items}
    report = json.loads((folder / 'build-report.json').read_text())
    items = [x for _, xs in sorted(result.items()) for x in xs]
    report.update({'asOf': meta['asOf'], 'publishedVenueHosts': len(result),
                   'publishedObservations': len(items), 'publishedItems': len(items),
                   'publishedSourceObservations': sum(x.get('sourceObservationCount', 1) for x in items),
                   'datasets': dict(sorted(collections.Counter(x['dataset'] for x in items).items())),
                   'statuses': dict(sorted(collections.Counter(x.get('status', 'unknown') for x in items).items())),
                   'sourceRoles': dict(sorted(collections.Counter(x.get('sourceRole', 'unspecified') for x in items).items())),
                   'withLogo': sum(bool(x.get('logo')) for x in items),
                   'summaryDifferences': [{'venueId': vid, 'summaryObservations': venues[vid].get('storeCount') or 0,
                                           'rosterObservations': len(xs)} for vid, xs in sorted(result.items())
                                          if (venues[vid].get('storeCount') or 0) != len(xs)]})
    receipt.update({'kind': 'reviewed_official_consumer_directory', 'exportedOn': meta['asOf'],
                    'inputSha256': sha256(raw), 'sourceHashScope': 'Per-record sourceHashScope and sourceEvidence distinguish HTTP bytes, rendered DOM, normalized collector fields and native-row integrity.',
                    'heldInputObservations': len(payload.get('held', [])),
                    'inputAccounting': payload['meta'].get('inputAccounting', {}),
                    'unit': 'One source-listed consumer branch/card; native Misc component views of one canonical branch stay one item.',
                    'pointGate': 'Own selected point within 300 m, or contained in the exact retained host footprint; no nearest venue or point substitution.',
                    'limits': 'Source listings, no field operation/point/legal operator, industry POS or primary graph upgrade. '
                              'Existing facts preserved; exact/unique same-floor corroborations do not add another shop.'})
    report['venueNetwork'] = receipt
    public = [*out, report]
    if PRIVATE.search(json.dumps(public, ensure_ascii=False)):
        raise ValueError('private URL, file identifier key or local path reached public output')
    assert core_path.read_bytes() == core_before
    for n, shard in enumerate(out):
        (folder / f'{n:02}.json').write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':')) + '\n')
    (folder / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(receipt, ensure_ascii=False))

if __name__ == '__main__':
    main()

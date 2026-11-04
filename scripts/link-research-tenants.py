#!/usr/bin/env python3
"""Add the listings of CityMETER research datasets whose own sheets name the host venue (named-host links).

  python3 -I scripts/link-research-tenants.py --exports <dir> --exported-on YYYY-MM-DD

<dir>/<folder>/02_STORES.csv is the 02_STORES tab of each research master below, exported as UTF-8 CSV with its
header row; <dir>/apparel/17_CROSS_DATASET_LINKS.csv lets Apparel rows that cite a Sport or Luxury outlet stay out,
so one shop is never listed twice. The exports stay outside this repository (they are internal working files);
only their SHA-256, the export date and the derived public facts are published.

Unit: one outlet row of the dataset (02_STORES outlet_id) whose official source — the brand's own store locator,
branch list or the host's own directory — names the host, and that the dataset's sheet matched to exactly one
registry venue by exact or reviewed unique alias. This is the standard of the canonical roster's
official_chain_exact_named_host_listing (scripts/build-tenant-data.py): an official directory labels the branch's
venue, the alias is unique and the point does not conflict. Every row must also be current in its own sheet
(source-listed, in owner-approved scope, the brand's own shop or counter — never a stockist, a pick-up point, a
campaign counter, a candidate, a held, historical or announced row). The gate is
build-tenant-data.py#named_gate; dataset vocabularies are in ADAPTERS below. A row whose own point lies more than
FAR_M from the venue point is held.

Datasets whose sheets record host links only as candidates (Beauty Clinic “source_supported_candidate”,
Playground “exact_name_candidate”, Car Service “candidate_not_selected”, Beauty “candidate_requires_confirmation”)
are not linked: candidates never enter the roster (D19).

Display rule: one brand once per venue. A new row whose brand (normalised name, tenants.js#brandKey) already has a
listing at that venue — from the canonical roster, Fitness or an earlier dataset in ORDER — is kept out and counted
under omitted.same_brand_already_listed_at_venue; rows of one dataset and brand at one venue become one item with
every outlet id kept (sourceObservationIds). Run after scripts/build-tenant-data.py and
scripts/link-dataset-tenants.py, then scripts/build-tenant-index.py. Venue cores and primary counts never change.
"""
import argparse
import collections
import csv
import hashlib
import importlib.util
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('tenant_builder', Path(__file__).with_name('build-tenant-data.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

FAR_M = 300
PHONE = re.compile(r'(?:\+66|0)\s?\d[\d\s-]{6,}')
GOOGLE_PLACE = re.compile(r'google\.[a-z.]+/maps|maps\.app\.goo\.gl|goo\.gl/maps', re.I)


def any_of(*values):
    return frozenset(values)


# Processing order: the narrower, more specific dataset first (Sport before Apparel keeps sports brands in Sport).
ADAPTERS = {
    'research.TH.sport': {
        'folder': 'sport', 'title': 'CityMETER Sport Stores Thailand — Research Master 2026-11-03',
        'venue': 'common_retail_venue_ids',
        'require': {
            'common_retail_venue_link_status': any_of('named_host_evidence_not_field_verified'),
            'host_join_method': any_of('source_named_host_unique_registry_match', 'reviewed_named_host_and_full_address'),
            'scope_group': any_of('core_extended'),
            'record_count_status': any_of('active_source_candidate'),
            'record_role': any_of('retail_banner', 'retail_listing', 'host_counter_banner', 'brand_store_or_counter',
                                  'named_brand_department_counter', 'named_own_brand_store', 'counter_listing',
                                  'retail_stockist', 'corner_stockist'),
            'operating_status': any_of('source_listed_current_operation_not_field_verified',
                                       'source_listed_current_operation_unconfirmed', 'source_listed_not_field_verified'),
            'evidence_status': any_of('primary_listed'),
            'source_type': any_of('official_publisher_locator', 'official_locator_web_readback'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        'reject': {'map_audit_status': any_of('primary_named_host_point_conflict', 'needs_primary_host_position_reconciliation',
                                              'publisher_card_target_mismatch')},
        'counter': lambda r: bool(re.search(r'counter|corner|concession', f"{r.get('record_role', '')} {r.get('store_format', '')}")),
    },
    'research.TH.apparel': {
        'folder': 'apparel', 'title': 'CityMETER Apparel Stores Thailand — Research Master 2026-11-03',
        'venue': 'common_retail_venue_ids',
        'require': {
            'common_retail_venue_link_status': any_of('source_named_host_not_field_verified'),
            'host_join_method': any_of('source_exact_named_host_registry_alias', 'source_exact_named_existing_registry_host_context'),
            'scope_group': any_of('core_extended'),
            'record_role': any_of('retail_banner', 'host_counter_banner', 'brand_shop_or_counter_unresolved'),
            'operating_status': any_of('source_listed', 'source_listed_current_operation_unconfirmed', 'source_listed_not_field_verified',
                                       'source_listed_current_operation_unverified', 'source_listed_current_operation_not_field_verified',
                                       'publisher_OPEN_current_operation_unverified'),
            'evidence_status': any_of('official_publisher_listed', 'official_brand_locator', 'official_published_locator_observation',
                                      'primary_listed', 'official_publisher_listing_observation',
                                      'official_mall_directory_and_embedded_map_observation', 'official_mall_directory',
                                      'official_venue_directory'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        'reject': {'store_format': any_of('publisher_pomelo_store_pickup_listing')},
        'counter': lambda r: r.get('record_role') == 'host_counter_banner' or 'counter' in r.get('store_format', ''),
    },
    'research.TH.furniture': {
        'folder': 'furniture', 'title': 'CityMETER Furniture, DIY & Kitchenware Thailand — Research Master 2026-11-03',
        'venue': 'common_retail_venue_ids',
        'require': {
            'common_retail_venue_link_status': any_of('named_host_exact_or_curated_alias'),
            'host_join_method': any_of('source_named_host_exact_or_curated_alias'),
            'counting_status': any_of('source_listed_outlet', 'brand_counter'),
            'operating_status': any_of('source_listed', 'source_listed_operation_unverified'),
            'evidence_status': any_of('primary_listed'),
            'source_type': any_of('official_retailer_locator', 'official_mall_directory'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        'reject': {'store_format': any_of('pop_up')},
        'counter': lambda r: r.get('counting_status') == 'brand_counter' or 'counter' in r.get('store_format', ''),
    },
    'research.TH.pet': {
        'folder': 'pet', 'title': 'CityMETER Pet Thailand — Research Master 2026-11-04',
        'venue': 'common_retail_venue_ids',
        'require': {
            'common_retail_venue_link_status': any_of('source_explicit_named_host'),
            'host_join_method': any_of('source_explicit_host_label_normalized_exact_unique', 'source_explicit_host_alias_reviewed_against_registry',
                                       'source_explicit_nested_host_alias_reviewed_parent_venue_only',
                                       'source_explicit_host_normalized_exact_existing_context'),
            'count_role': any_of('source_listed_outlet_candidate', 'source_listed_facility'),
            'operating_status': any_of('source_listed_not_field_verified', 'publisher_listed_not_field_verified',
                                       'source_listed_operation_not_field_verified'),
            'source_type': any_of('official_brand', 'official_host', 'official_web', 'official_venue', 'official_brand_account'),
            'scope_status': any_of('owner_approved_original', 'owner_approved_addition', 'authorized_research_followup',
                                   'authorized_portfolio_extension'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        # A centre's own pet park is an amenity of the venue, not a shop inside it.
        'reject': {'store_format': any_of('shopping_centre_pet_amenity', 'host_dog_park')},
        'counter': lambda r: 'counter' in r.get('store_format', ''),
    },
    'research.TH.massage_spa': {
        'folder': 'massage_spa', 'title': 'CityMETER Massage, Spa & Onsen Thailand — Research Master 2026-11-03',
        'venue': 'common_retail_venue_ids',
        'require': {
            'common_retail_venue_link_status': any_of('source_qualified_named_host_identity'),
            'host_join_method': any_of('explicit_primary_host_label_plus_unique_registry_name_province_and_postcode_agreement'),
            'listing_status': any_of('source_listed'),
            'operating_status': any_of('source_listed'),
            'evidence_status': any_of('primary_listed'),
            'scope_group': any_of('core_extended', 'extension'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        'reject': {},
        'counter': lambda r: False,
    },
    'research.TH.salon_barber': {
        'folder': 'salon_barber', 'title': 'CityMETER Salon & Barber Thailand — Research Master 2026-11-03',
        'venue': 'host_venue_id',
        'require': {
            'host_join_status': any_of('unique_registry_name_with_source_host_context', 'matched_exact_host_context'),
            'operating_status': any_of('source_listed'),
            'evidence_status': any_of('source_listed_not_field_verified'),
            'scope_status': any_of('approved'),
            'location_context': any_of('inside_shopping_center'),
            'source_type': any_of('brand_locator', 'official_brand_public_branch_content', 'official_brand_or_linked_provider',
                                  'official_brand', 'official_mall_article', 'official_mall', 'official_mall_directory',
                                  'official_mall_listing', 'official_brand_line', 'official_brand_link_hub'),
        },
        'reject_nonblank': ('duplicate_review',),
        'reject': {},
        'counter': lambda r: False,
    },
    'research.TH.nail': {
        'folder': 'nail', 'title': 'CityMETER Nail, Manicure & Pedicure Thailand — Research Master 2026-11-03',
        'venue': 'host_venue_id',
        'require': {
            'host_join_status': any_of('source_named_host_unique_canonical_alias'),
            'operating_status': any_of('source_listed'),
            'scope_status': any_of('approved'),
            'source_observation_role': any_of('eligible_source_listing'),
            'evidence_status': any_of('official_mall_directory', 'official_mall_programme', 'official_brand_locator',
                                      'official_brand_contact', 'official_brand', 'official_brand_branch'),
        },
        'reject_nonblank': (),
        'reject': {},
        'counter': lambda r: False,
    },
}
ORDER = list(ADAPTERS)
EXCLUDED = {
    'research.TH.beauty': 'host links recorded as candidate_requires_confirmation; located-in rows are Luxury and Pharmacy outlets already listed',
    'research.TH.beauty_clinic': 'host links recorded as source_supported_candidate (registry identity candidate)',
    'research.TH.playground': 'host links recorded as exact_name_candidate only',
    'research.TH.car_service': 'host links recorded as candidate_not_selected',
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def brand_key(value):
    """Same as js/model.js#normalizeText (search key): NFKC, lower case, no spaces or the punctuation it drops.
    For display, search and the one-brand-once rule only — never a join for counting."""
    text = unicodedata.normalize('NFKC', str(value or '')).lower()
    return re.sub(r"[\s​'’\"`.,·\-–—/()]+", '', text)


def distance_m(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def number(value):
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def iso(value):
    m = re.match(r'(\d{4}-\d{2}-\d{2})', str(value or ''))
    return m.group(1) if m else ''


def branch_label(brand, name):
    """The branch without a leading brand name, '' when nothing is left (as link-dataset-tenants.py)."""
    brand, name = ' '.join(str(brand or '').split()), ' '.join(str(name or '').split())
    if not name or name.lower() == brand.lower():
        return ''
    out = name
    if brand and name.lower().startswith(brand.lower()):
        out = re.sub(r'^[\s\-–—:·|@]+', '', name[len(brand):])
    return ' '.join(out.split())


ROAD = re.compile(r'\b(?:road|rd\.?|street|st\.|soi|moo)\b|ถนน|ซอย|หมู่', re.I)
FLOOR = re.compile(r'\d|ชั้น|ห้อง|โซน|floor|level|ground|room|unit|zone|basement|^(?:G|M|LG|UG|B)$', re.I)


def clean_unit(value):
    """A short floor or unit label from the official source; never a phone number, an address or a note."""
    text = ' '.join(re.sub(r'\([^)]*\)', ' ', str(value or '')).split()).strip(' ,;')
    if (not text or len(text) > 32 or PHONE.search(text) or re.search(r'https?://', text)
            or ROAD.search(text) or not FLOOR.search(text)):
        return ''
    return text


def official_url(value):
    url = builder.public_url(value)
    return url if url and not GOOGLE_PLACE.search(url) else None


def read_rows(path):
    raw = path.read_bytes()
    text = raw.decode('utf-8-sig')
    return list(csv.DictReader(text.splitlines())), sha256(raw)


def eligibility(row, adapter):
    """The dataset's own vocabulary: '' when the row is a current, official, named-host listing, else the reason."""
    for field, allowed in adapter['require'].items():
        if (row.get(field) or '').strip() not in allowed:
            return f'not_{field}'
    for field in adapter['reject_nonblank']:
        if (row.get(field) or '').strip():
            return f'{field}_recorded'
    for field, blocked in adapter['reject'].items():
        if (row.get(field) or '').strip() in blocked:
            return f'{field}_out_of_scope'
    return ''


def observations(dataset, adapter, rows, csv_sha, exported_on, venues, crossed):
    out, skipped = [], collections.Counter()
    for row in rows:
        venue_ids = [v for v in re.split(r'[;,|\s]+', row.get(adapter['venue']) or '') if v]
        if not venue_ids:
            continue
        reason = eligibility(row, adapter)
        if reason:
            skipped[reason] += 1
            continue
        outlet = (row.get('outlet_id') or row.get('source_observation_id') or '').strip()
        if not outlet:
            skipped['no_outlet_id'] += 1
            continue
        if (dataset, outlet) in crossed:
            skipped['cross_dataset_outlet_reference'] += 1
            continue
        if len(venue_ids) != 1:
            skipped['not_single_registry_venue'] += 1
            continue
        url = official_url(row.get('source_url'))
        if not url:
            skipped['no_official_public_source_url'] += 1
            continue
        vid = venue_ids[0]
        venue = venues.get(vid)
        own = (number(row.get('latitude')), number(row.get('longitude')))
        far = bool(venue and None not in own and venue.get('lat') is not None
                   and distance_m(own, (venue['lat'], venue['lon'])) > FAR_M)
        brand = ' '.join((row.get('brand_name') or '').split())
        store = ' '.join((row.get('store_name') or '').split())
        branch = branch_label(brand, store)
        status_url = official_url(row.get('status_source_url'))
        observation = {
            'id': f'{dataset}:02_STORES:{outlet}', 'name': f'{brand} · {branch}' if branch else brand,
            'brand': brand, 'brandId': (row.get('brand_id') or '').strip(), 'dataset': dataset, 'branch': branch,
            'sourceStoreName': store, 'checkedOn': iso(row.get('checked_on')), 'status': row['operating_status'].strip(),
            'category': (row.get('segment') or '').strip(), 'storeFormat': (row.get('store_format') or '').strip(),
            'unitFloor': clean_unit(row.get('unit_floor')), 'evidenceStatus': (row.get('evidence_status') or '').strip(),
            'sourceUrl': url, 'sourceUrls': [url],
            **({'statusSourceUrl': status_url, 'statusCheckedOn': iso(row.get('status_checked_on')) or iso(row.get('checked_on'))}
               if status_url and status_url != url else {}),
            'sourceRole': builder.NAMED_ROLE, 'relationshipBasis': builder.NAMED_BASIS,
            'hostIdentityStatus': (row.get('common_retail_venue_link_status') or row.get('host_join_status') or '').strip(),
            'sourceGate': (row.get('host_join_method') or row.get('host_join_status') or '').strip(),
            'sourceArtifactKey': f'{adapter["title"]} · 02_STORES export {exported_on}', 'sourceSha256': csv_sha,
            'sourceRowKey': outlet, 'accepted': True, 'primary': False, 'venueIds': [vid], 'farPointConflict': far,
            **({'displayQualifier': 'เคาน์เตอร์'} if adapter['counter'](row) else {}),
        }
        out.append(observation)
    return out, skipped


def cross_references(exports):
    """Apparel outlet ids that cite a Sport or Luxury outlet (17_CROSS_DATASET_LINKS): the same shop, listed once."""
    path = exports / 'apparel' / '17_CROSS_DATASET_LINKS.csv'
    if not path.is_file():
        raise SystemExit(f'{path}: missing (Apparel cross-dataset links are required to avoid double listings)')
    rows, digest = read_rows(path)
    crossed = {('research.TH.apparel', r['apparel_entity_id'].strip()) for r in rows
               if r.get('entity_type') == 'outlet_candidate' and r.get('source_dataset_id') in ('research.TH.sport', 'research.TH.luxury')
               and r.get('apparel_entity_id', '').strip()}
    return crossed, digest


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--exports', required=True, help='directory with <folder>/02_STORES.csv per dataset')
    ap.add_argument('--exported-on', required=True, help='ISO date of the exports')
    ap.add_argument('--tenants', default=str(ROOT / 'data/tenants'))
    ap.add_argument('--venues', default=str(ROOT / 'data/venues.json'))
    a = ap.parse_args()
    if not builder.iso_date(a.exported_on):
        raise SystemExit('--exported-on must be an ISO date')
    exports = Path(a.exports)
    crossed, cross_sha = cross_references(exports)

    venue_doc = json.loads(Path(a.venues).read_text())
    fields = venue_doc['meta']['coreFields']
    venues = {r['id'] if isinstance(r, dict) else r[0]: (r if isinstance(r, dict) else dict(zip(fields, r))) for r in venue_doc['rows']}
    tenants = Path(a.tenants)
    report = json.loads((tenants / 'build-report.json').read_text())
    shards = [json.loads((tenants / f'{n:02d}.json').read_text()) for n in range(builder.SHARDS)]
    rosters = {}
    for shard in shards:
        for vid, roster in shard['venues'].items():
            items = [x for x in roster['items'] if x['dataset'] not in ADAPTERS]
            if items:
                rosters[vid] = items
    listed = collections.defaultdict(set)
    for vid, items in rosters.items():
        for item in items:
            listed[vid].add(brand_key(item.get('displayBrand') or item.get('brand') or item.get('name')))

    receipts = report.setdefault('linkedDatasets', {})
    for dataset in ORDER:
        adapter = ADAPTERS[dataset]
        path = exports / adapter['folder'] / '02_STORES.csv'
        if not path.is_file():
            raise SystemExit(f'{path}: missing export')
        rows, csv_sha = read_rows(path)
        found, skipped = observations(dataset, adapter, rows, csv_sha, a.exported_on, venues, crossed)
        omitted = collections.Counter(skipped)
        grouped = collections.OrderedDict()
        for observation in sorted(found, key=lambda o: o['id']):
            error = builder.current_listing_exclusion(observation) or builder.named_gate(observation, a.exported_on)
            if error:
                omitted[error] += 1
                continue
            vid = observation['venueIds'][0]
            if vid not in venues:
                omitted['host_outside_public_qualified_population'] += 1
                continue
            grouped.setdefault((vid, observation['brandId'] or brand_key(observation['brand'])), []).append(observation)
        added, hosts = [], set()
        for (vid, _), group in grouped.items():
            key = brand_key(group[0]['brand'])
            if key in listed[vid]:
                omitted['same_brand_already_listed_at_venue'] += len(group)
                continue
            first = dict(group[0])
            if len(group) > 1:
                first['sourceObservationCount'] = len(group)
                first['sourceObservationIds'] = [o['sourceRowKey'] for o in group]
                urls = []
                for o in group:
                    for url in o['sourceUrls']:
                        if url not in urls:
                            urls.append(url)
                first['sourceUrls'] = urls
                units = [o['unitFloor'] for o in group if o.get('unitFloor')]
                first['unitFloor'] = ' · '.join(dict.fromkeys(units)) if units else ''
            item = builder.clean_item(first)
            rosters.setdefault(vid, []).append(item)
            listed[vid].add(key)
            added.append(item)
            hosts.add(vid)
        receipts[dataset] = {
            'kind': 'named_host_listing', 'source': f'{adapter["title"]} · 02_STORES (internal research master; exported CSV)',
            'exportedOn': a.exported_on, 'files': {'02_STORES.csv': csv_sha, **({'17_CROSS_DATASET_LINKS.csv': cross_sha} if dataset == 'research.TH.apparel' else {})},
            'unit': 'one outlet row (02_STORES outlet_id) whose official source names the host and that the sheet matched to one registry venue',
            'gate': f'{builder.NAMED_ROLE}: own sheet named-host link by exact or reviewed unique alias · current source listing in approved scope · '
                    f"official public source URL · the brand's own shop or counter · one registry venue in data/venues.json · own point within {FAR_M} m · "
                    'one brand once per venue',
            'linkedRows': sum(1 for r in rows if (r.get(adapter['venue']) or '').strip()),
            'publishedItems': len(added), 'publishedVenueHosts': len(hosts),
            'publishedSourceObservations': sum(x.get('sourceObservationCount', 1) for x in added),
            'omitted': dict(sorted(omitted.items())),
        }
    report['excludedDatasets'] = dict(sorted(EXCLUDED.items()))

    meta = shards[0]['meta']
    out = [{'meta': meta, 'venues': {}} for _ in range(builder.SHARDS)]
    for vid, items in sorted(rosters.items()):
        items.sort(key=lambda row: row['id'])
        out[builder.shard_of(vid)]['venues'][vid] = {'observations': len(items),
                                                     'sourceObservationCount': sum(x.get('sourceObservationCount', 1) for x in items),
                                                     'items': items}
    for n, shard in enumerate(out):
        (tenants / f'{n:02d}.json').write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':')) + '\n')

    items = [x for vid, xs in sorted(rosters.items()) for x in xs]
    report.update({
        'publishedVenueHosts': len(rosters), 'publishedObservations': len(items), 'publishedItems': len(items),
        'publishedSourceObservations': sum(x.get('sourceObservationCount', 1) for x in items),
        'datasets': dict(sorted(collections.Counter(x['dataset'] for x in items).items())),
        'statuses': dict(sorted(collections.Counter(x.get('status', 'unknown') for x in items).items())),
        'sourceRoles': dict(sorted(collections.Counter(x.get('sourceRole', 'unspecified') for x in items).items())),
        'withLogo': sum(bool(x.get('logo')) for x in items),
        'summaryDifferences': [{'venueId': vid, 'summaryObservations': venues[vid].get('storeCount') or 0, 'rosterObservations': len(xs)}
                               for vid, xs in sorted(rosters.items()) if (venues[vid].get('storeCount') or 0) != len(xs)],
    })
    limit = ('Named-host research datasets (linkedDatasets kind named_host_listing) add rows whose official source names the host and '
             'whose own sheet matched it to one registry venue; they are source listings, not field checks, one brand once per venue, '
             'and never change venue cores or primary counts.')
    if limit not in report['limits']:
        report['limits'].insert(len(report['limits']) - 1, limit)
    (tenants / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({d: {k: receipts[d][k] for k in ('publishedItems', 'publishedVenueHosts', 'omitted')} for d in ORDER}, ensure_ascii=False, indent=1))
    print(json.dumps({k: report[k] for k in ('publishedVenueHosts', 'publishedItems', 'datasets')}, ensure_ascii=False))


if __name__ == '__main__':
    main()

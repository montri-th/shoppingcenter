#!/usr/bin/env python3
"""Add the listings of CityMETER research datasets whose official sources name the host venue (named-host links).

  python3 -I scripts/link-research-tenants.py --exports <dir> --exported-on YYYY-MM-DD \
      [--crosswalk <R04_VENUE_CROSSWALK.csv>] [--review-log <csv>]

<dir>/<folder>/02_STORES.csv is the 02_STORES tab of each research master below, exported as UTF-8 CSV with its
header row (plus 01_BRANDS.csv for the reviewed datasets, beauty/14_DATASET_MEMBERSHIP.csv and
apparel/17_CROSS_DATASET_LINKS.csv). The exports stay outside this repository (internal working files); only their
SHA-256, the export date and the derived public facts are published.

Unit (D23, owner 4 Nov 2026 21:24: “มีบางร้าน อาจจะมีหลายสาขาในศูนย์การค้าเดียว เช่น เมกาบางนา มี Starbucks 3 สาขา”):
one BRANCH — a shop or counter the official source lists as its own entry. A brand with two entries at one venue
(adidas Store and adidas Originals, a Men and a Women counter, a shop and a counter) is two branches; two sources
describing the same branch (same entry text, or the same floor from another publisher) are one branch with every
outlet id kept (sourceObservationIds). Across datasets, a later dataset's branch on a floor where the brand is already
listed (or with no floor to tell) is the same branch and stays out (omitted.same_branch_already_listed_at_venue).

Gate, sheet-named datasets (D20): the dataset's own sheet matched the official host label to exactly one registry
venue by exact or reviewed unique alias (the standard of the canonical official_chain_exact_named_host_listing).
Gate, reviewed datasets (owner 4 Nov 2026 21:23: “ช่วย research ให้ดี ผูกกับศูนย์การค้าให้ถูกต้อง อย่าเดา”): Beauty,
Beauty Clinic, Playground and Car Service recorded their host only as a candidate; scripts/review-candidate-hosts.py
accepts a candidate only when the source is official, the published branch label names the candidate venue and no
unrelated venue, the province agrees and the row's own point is near the venue or inside its footprint
(REVIEWED_HOST_STATUS). Every row must also be current in its own sheet (source-listed, in owner-approved scope,
counting, the brand's own shop or counter — never a stockist, a pick-up point, a campaign counter, a held, historical
or announced row). The gate is build-tenant-data.py#named_gate; dataset vocabularies are in ADAPTERS. A row whose own
point lies more than FAR_M from the venue point, outside the venue's host footprint, is held.

Centre facilities (D22): the Pet rows that name a centre's own pet park are written to data/venue-amenities.json
(AMENITY_RULES), never to the roster.

Run after scripts/build-tenant-data.py and scripts/link-dataset-tenants.py, then scripts/build-tenant-index.py.
Venue cores never change.
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
rspec = importlib.util.spec_from_file_location('host_review', Path(__file__).with_name('review-candidate-hosts.py'))
hosts = importlib.util.module_from_spec(rspec)
rspec.loader.exec_module(hosts)

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
# Candidate host links reviewed by scripts/review-candidate-hosts.py (owner, 4 Nov 2026 21:23). `venue` is the
# candidate the sheet recorded; `brands` gives the brand's own domains; `candidate` is the sheet's own candidate status.
ADAPTERS.update({
    'research.TH.beauty': {
        'folder': 'beauty', 'title': 'CityMETER Beauty Stores Thailand — Research Master 2026-11-03',
        'venue': 'common_retail_venue_candidate_ids', 'review': True, 'brands': '01_BRANDS.csv',
        'official_by_type': True,   # the sheet's own source_type classifies the source (require below keeps official types)
        'require': {
            'common_retail_venue_link_status': any_of('candidate_requires_confirmation'),
            'count_role': any_of('count_source_pos_candidate'),
            'evidence_status': any_of('source_pos_candidate'),
            'operating_status': any_of('source_listed'),
            'scope_group': any_of('approved_core', 'approved_channel'),
            'source_type': any_of('official_brand_locator', 'brand_locator', 'official_branch_contact_roster',
                                  'official_brand_locator_consumer_api', 'official_brand_locator_webcache',
                                  'official_Thai_brand_operator_location_list', 'official_host_directory', 'official_venue_directory',
                                  'mall_visible_tenant_roster_joined_poi', 'brand_beauty_boutique_directory'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        # pharmacy-registry premises and pop-ups are the Pharmacy dataset's or temporary: never a beauty branch here
        'reject': {'store_format': any_of('registry_pharmacy_premises', 'pharmacy_source_listing', 'pop_up', 'service_only', 'appointment'),
                   'dedup_review_status': any_of('explicit_source_unit_conflict', 'current_publisher_closure_or_conflict_retained',
                                                 'primary_unit_conflict_retained', 'retail_gate_resolved_legacy_map_still_held')},
        'counter': lambda r: 'counter' in r.get('store_format', '').lower() or r.get('store_format') == 'Concession',
    },
    'research.TH.beauty_clinic': {
        'folder': 'beauty_clinic', 'title': 'CityMETER Beauty Clinic Thailand — Research Master 2026-11-04',
        'venue': 'citymeter_shopping_center_id', 'review': True, 'brands': '01_BRANDS.csv',
        'require': {
            'common_retail_venue_link_status': any_of('source_supported_candidate'),
            'host_join_method': any_of('explicit_host_identity_source_supported'),
            'clinic_count_role': any_of('include_source_listed_clinic_candidate'),
            'entity_class': any_of('medical_skin_clinic_candidate'),
            'operating_status': any_of('source_listed'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        'reject': {},
        'counter': lambda r: False,
    },
    'research.TH.playground': {
        'folder': 'playground', 'title': 'CityMETER Playground & Family Entertainment Thailand — Research Master 2026-11-04',
        'venue': 'common_retail_venue_candidate_ids', 'review': True, 'brands': '01_BRANDS.csv',
        'require': {
            'common_retail_venue_link_status': any_of('exact_name_candidate'),
            'count_role': any_of('source_qualified_outlet_candidate'),
            'operating_status': any_of('source_listed'),
            'evidence_status': any_of('source_listed_not_field_verified'),
            'scope_group': any_of('owner_approved', 'authorized_portfolio_extension'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        'reject': {},
        'counter': lambda r: False,
    },
    'research.TH.car_service': {
        'folder': 'car_service', 'title': 'CityMETER Car Service Thailand — Research Master 2026-11-04',
        'venue': 'common_retail_venue_candidate_ids', 'review': True, 'brands': '01_BRANDS.csv',
        'require': {
            'common_retail_venue_link_status': any_of('candidate_not_selected'),
            'operating_status': any_of('source_listed_not_field_verified'),
            'evidence_status': any_of('source_listed'),
            'scope_group': any_of('owner_approved'),
            'source_listing_role': any_of('service_branch'),
        },
        'reject_nonblank': ('closure_source_conflict',),
        'reject': {},
        'counter': lambda r: False,
    },
})
ORDER = list(ADAPTERS)
EXCLUDED = {}


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


def observations(dataset, adapter, rows, csv_sha, exported_on, venues, crossed, index, brand_dom, log):
    """Eligible, gate-ready observations of one dataset; skipped rows counted by reason; review decisions logged."""
    out, skipped = [], collections.Counter()
    reviewed = bool(adapter.get('review'))
    for row in rows:
        venue_ids = [v.replace('BCLHOST-', '') for v in re.split(r'[;,|\s]+', row.get(adapter['venue']) or '') if v]
        if not venue_ids:
            continue
        outlet = (row.get('outlet_id') or row.get('source_observation_id') or '').strip()
        reason = eligibility(row, adapter)
        if reason:
            skipped[reason] += 1
            if reviewed and row.get('common_retail_venue_link_status') in adapter['require']['common_retail_venue_link_status']:
                log.append((dataset, outlet, row, venue_ids[0], 'kept_candidate', reason, ''))
            continue
        if not outlet:
            skipped['no_outlet_id'] += 1
            continue
        if (dataset, outlet) in crossed:
            skipped['cross_dataset_outlet_reference'] += 1
            continue
        if len(venue_ids) != 1:
            skipped['not_single_registry_venue'] += 1
            continue
        vid = venue_ids[0]
        evidence = ''
        if reviewed:
            decision, why, evidence = hosts.review(row, vid, index, brand_dom, ROOT / 'js' / 'model.js',
                                                   official_by_type=adapter.get('official_by_type', False))
            log.append((dataset, outlet, row, vid, decision, why, evidence))
            if decision != 'accepted':
                skipped[why] += 1
                continue
        url = official_url(row.get('source_url'))
        if not url:
            skipped['no_official_public_source_url'] += 1
            continue
        own = (number(row.get('latitude')), number(row.get('longitude')))
        near, _ = index.point_check(own, vid) if vid in venues else (True, None)
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
            'hostIdentityStatus': builder.REVIEWED_HOST_STATUS if reviewed else
            (row.get('common_retail_venue_link_status') or row.get('host_join_status') or '').strip(),
            'sourceGate': builder.REVIEWED_JOIN_METHOD if reviewed else (row.get('host_join_method') or row.get('host_join_status') or '').strip(),
            **({'identityNote': evidence} if reviewed else {}),
            'sourceArtifactKey': f'{adapter["title"]} · 02_STORES export {exported_on}', 'sourceSha256': csv_sha,
            'sourceRowKey': outlet, 'accepted': True, 'primary': False, 'venueIds': [vid], 'farPointConflict': not near,
            **({'displayQualifier': 'เคาน์เตอร์'} if adapter['counter'](row) else {}),
            '_canonical': (row.get('canonical_outlet_id') or '').strip(),
        }
        out.append(observation)
    return out, skipped


FLOOR_RE = (re.compile(r'(?:ชั้น|floor|fl\.?|level)\s*([0-9]{1,2}|g|m|lg|ug|b[0-9]?)\b', re.I),
            re.compile(r'\b([0-9]{1,2})(?:st|nd|rd|th)?\s*(?:/f|floor|fl\b)', re.I),
            re.compile(r'\b(?:l)([0-9]{1,2})\b', re.I),
            re.compile(r'^\s*([0-9]{1,2}|g|m|lg|ug|b[0-9]?)\s*(?:$|[^0-9a-z])', re.I))
QUALIFIERS = ('men', 'women', 'woman', 'kids', 'originals', 'counter', 'shop', 'outlet', 'atrium', 'multilabel', 'boutique',
              'ผู้ชาย', 'ผู้หญิง', 'เด็ก', 'เคาน์เตอร์')


def floor_key(observation):
    """The floor the source gives for a branch ('2', 'g', 'm', 'b1' …), '' when it gives none."""
    for text in (observation.get('unitFloor'), observation.get('sourceStoreName')):
        for pattern in FLOOR_RE:
            m = pattern.search(str(text or ''))
            if m:
                return m.group(1).lower()
    return ''


def qualifiers(observation):
    text = str(observation.get('sourceStoreName') or '').lower()
    return frozenset(q for q in QUALIFIERS if re.search(rf'(?<![a-z]){re.escape(q)}(?![a-z])', text))


def same_branch(a, b):
    """True when two observations of one brand at one venue describe the same shop (D23)."""
    if a['sourceRowKey'] == b['sourceRowKey']:
        return True
    fa, fb = floor_key(a), floor_key(b)
    floors_agree = not fa or not fb or fa == fb
    if hosts.domain(a['sourceUrl']) == hosts.domain(b['sourceUrl']):
        # one publisher lists distinct entries for distinct branches; the same entry twice is one branch
        return hosts.norm(a['sourceStoreName']) == hosts.norm(b['sourceStoreName']) and floors_agree
    return floors_agree and qualifiers(a) == qualifiers(b)


def branches(group):
    """Cluster one dataset's observations of one brand at one venue into branches."""
    clusters = []
    for o in sorted(group, key=lambda o: o['id']):
        for c in clusters:
            if any(same_branch(o, p) for p in c):
                c.append(o)
                break
        else:
            clusters.append([o])
    return clusters


def merged(cluster):
    first = {k: v for k, v in cluster[0].items() if not k.startswith('_')}
    if len(cluster) > 1:
        first['sourceObservationCount'] = len(cluster)
        first['sourceObservationIds'] = [o['sourceRowKey'] for o in cluster]
        urls = []
        for o in cluster:
            for url in o['sourceUrls']:
                if url not in urls:
                    urls.append(url)
        first['sourceUrls'] = urls
        units = [o['unitFloor'] for o in cluster if o.get('unitFloor')]
        first['unitFloor'] = ' · '.join(dict.fromkeys(units)) if units else ''
    return first


# Centre facilities (D22, owner 4 Nov 2026: a pet-friendly filter from the Pet dataset). A centre's own pet park is not a
# shop inside it, so the Pet adapter rejects those rows from the roster; they become a fact of the venue instead, with
# the dataset's own named-host link, the official host source (or the owner's report, labelled as such) and its date.
AMENITY_RULES = {
    'research.TH.pet': {
        'kind': 'pet-area',
        'store_format': any_of('shopping_centre_pet_amenity', 'host_dog_park'),
        'common_retail_venue_link_status': any_of('source_explicit_named_host'),
        'basis': {'publisher_listed_not_field_verified': 'official_host', 'owner_reported_service': 'owner_reported'},
    },
}


def amenities(exported, venues, exported_on):
    """venue id → facilities, from the rows each AMENITY_RULES dataset names as a centre facility of one venue."""
    out, counts = collections.defaultdict(list), collections.Counter()
    for dataset, rule in AMENITY_RULES.items():
        rows, digest = exported[dataset]
        for row in rows:
            if (row.get('store_format') or '').strip() not in rule['store_format']:
                continue
            ids = split_ids(row.get('common_retail_venue_ids'))
            basis = rule['basis'].get((row.get('operating_status') or '').strip())
            url = official_url(row.get('source_url'))
            checked = iso(row.get('checked_on'))
            if ((row.get('common_retail_venue_link_status') or '').strip() not in rule['common_retail_venue_link_status']
                    or len(ids) != 1 or ids[0] not in venues or not basis or not url or not checked or checked > exported_on):
                counts['held'] += 1
                continue
            name = ' '.join((row.get('brand_name') or '').split()).split(' — ')[0]
            out[ids[0]].append({'kind': rule['kind'], 'name': name, 'sourceUrl': url, 'checkedOn': checked, 'basis': basis,
                                'dataset': dataset, 'sourceRowKey': (row.get('outlet_id') or '').strip(), 'sourceSha256': digest})
            counts['published'] += 1
    return {vid: sorted(xs, key=lambda x: (x['kind'], x['name'])) for vid, xs in sorted(out.items())}, dict(counts)


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


def load_details(details_dir):
    """Venue websites from the detail shards (the host's own domain counts as an official source)."""
    sites = {}
    for path in sorted(Path(details_dir).glob('*.json')):
        for vid, rec in json.loads(path.read_text()).get('venues', {}).items():
            if rec.get('website'):
                sites[vid] = rec['website']
    return sites


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--exports', required=True, help='directory with <folder>/02_STORES.csv per dataset')
    ap.add_argument('--exported-on', required=True, help='ISO date of the exports')
    ap.add_argument('--crosswalk', help='R04_VENUE_CROSSWALK.csv of the CityMETER Dataset Registry (identity-resolved host names)')
    ap.add_argument('--review-log', help='write every reviewed candidate row with its decision (internal CSV)')
    ap.add_argument('--tenants', default=str(ROOT / 'data/tenants'))
    ap.add_argument('--venues', default=str(ROOT / 'data/venues.json'))
    ap.add_argument('--details', default=str(ROOT / 'data/details'))
    ap.add_argument('--buildings', default=str(ROOT / 'data/venue-buildings.geojson'))
    a = ap.parse_args()
    if not builder.iso_date(a.exported_on):
        raise SystemExit('--exported-on must be an ISO date')
    exports = Path(a.exports)
    crossed, cross_sha = cross_references(exports)

    venue_doc = json.loads(Path(a.venues).read_text())
    fields = venue_doc['meta']['coreFields']
    venues = {r['id'] if isinstance(r, dict) else r[0]: (dict(r) if isinstance(r, dict) else dict(zip(fields, r))) for r in venue_doc['rows']}
    if Path(a.details).is_dir():
        for vid, site in load_details(a.details).items():
            if vid in venues:
                venues[vid]['website'] = site
    buildings = json.loads(Path(a.buildings).read_text()) if Path(a.buildings).is_file() else None
    index = hosts.HostIndex(venues, buildings)
    inputs = {}
    if a.crosswalk:
        index.add_crosswalk(hosts.read_csv(a.crosswalk))
        inputs['R04_VENUE_CROSSWALK.csv'] = sha256(Path(a.crosswalk).read_bytes())
    exported = {}
    for dataset in ORDER:
        adapter = ADAPTERS[dataset]
        path = exports / adapter['folder'] / '02_STORES.csv'
        if not path.is_file():
            raise SystemExit(f'{path}: missing export')
        exported[dataset] = read_rows(path)
        if not adapter.get('review'):
            status_field = 'common_retail_venue_link_status' if 'common_retail_venue_link_status' in adapter['require'] else 'host_join_status'
            allowed = adapter['require'][status_field]
            index.add_sheet_labels(exported[dataset][0], adapter['venue'], lambda r, f=status_field, ok=allowed: (r.get(f) or '').strip() in ok)

    tenants = Path(a.tenants)
    report = json.loads((tenants / 'build-report.json').read_text())
    shards = [json.loads((tenants / f'{n:02d}.json').read_text()) for n in range(builder.SHARDS)]
    rosters = {}
    for shard in shards:
        for vid, roster in shard['venues'].items():
            items = [x for x in roster['items'] if x['dataset'] not in ADAPTERS]
            if items:
                rosters[vid] = items
    listed = collections.defaultdict(lambda: collections.defaultdict(list))   # venue → brand key → floor keys of listed branches
    listed_ids = collections.defaultdict(set)                                  # venue → outlet ids already listed
    for vid, items in rosters.items():
        for item in items:
            key = brand_key(item.get('displayBrand') or item.get('brand') or item.get('name'))
            listed[vid][key].append(floor_key(item))
            listed_ids[vid].add(item['id'].rsplit(':', 1)[-1])

    # Beauty outlets that are Luxury or Pharmacy outlets (14_DATASET_MEMBERSHIP, shared canonical ids, never additive)
    shared = collections.defaultdict(set)
    membership = exports / 'beauty' / '14_DATASET_MEMBERSHIP.csv'
    if membership.is_file():
        for r in hosts.read_csv(membership):
            if r.get('dataset_id') in ('research.TH.luxury', 'research.TH.pharmacy'):
                for ext in split_ids(r.get('external_outlet_ids')) or [r.get('canonical_outlet_id', '')]:
                    shared[(r.get('canonical_outlet_id') or '').strip()].add(ext)
        inputs['beauty/14_DATASET_MEMBERSHIP.csv'] = sha256(membership.read_bytes())

    receipts = report.setdefault('linkedDatasets', {})
    log = []
    for dataset in ORDER:
        adapter = ADAPTERS[dataset]
        rows, csv_sha = exported[dataset]
        brand_dom = {}
        files = {'02_STORES.csv': csv_sha}
        if adapter.get('review'):
            brands_path = exports / adapter['folder'] / adapter['brands']
            brand_dom = hosts.brand_domains(hosts.read_csv(brands_path)) if brands_path.is_file() else {}
            if brands_path.is_file():
                files[adapter['brands']] = sha256(brands_path.read_bytes())
        if dataset == 'research.TH.apparel':
            files['17_CROSS_DATASET_LINKS.csv'] = cross_sha
        if dataset == 'research.TH.beauty' and 'beauty/14_DATASET_MEMBERSHIP.csv' in inputs:
            files['14_DATASET_MEMBERSHIP.csv'] = inputs['beauty/14_DATASET_MEMBERSHIP.csv']
        found, skipped = observations(dataset, adapter, rows, csv_sha, a.exported_on, venues, crossed, index, brand_dom, log)
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
            if shared.get(observation['_canonical'], set()) & listed_ids[vid]:
                omitted['same_outlet_listed_by_luxury_or_pharmacy'] += 1
                continue
            grouped.setdefault((vid, brand_key(observation['brand'])), []).append(observation)
        added, hosts_added = [], set()
        for (vid, key), group in grouped.items():
            for cluster in branches(group):
                floor = next((floor_key(o) for o in cluster if floor_key(o)), '')
                floors = listed[vid][key]
                match = next((i for i, f in enumerate(floors) if f is not None and (not f or not floor or f == floor)), None)
                if match is not None:
                    floors[match] = None   # that listed branch is taken; a second branch of the brand needs another floor
                    omitted['same_branch_already_listed_at_venue'] += len(cluster)
                    continue
                item = builder.clean_item(merged(cluster))
                rosters.setdefault(vid, []).append(item)
                added.append(item)
                hosts_added.add(vid)
        # matched placeholders back to their floors for the next dataset
        for vid in listed:
            for key, floors in listed[vid].items():
                listed[vid][key] = [f if f is not None else '' for f in floors]
        for item in added:
            vid = next(v for v, xs in rosters.items() if item in xs)
            listed[vid][brand_key(item['brand'])].append(floor_key(item))
            listed_ids[vid].add(item['id'].rsplit(':', 1)[-1])
        receipt = {
            'kind': 'reviewed_candidate_host' if adapter.get('review') else 'named_host_listing',
            'source': f'{adapter["title"]} · 02_STORES (internal research master; exported CSV)',
            'exportedOn': a.exported_on, 'files': files,
            'unit': 'one branch: a shop or counter the official source lists as its own entry (D23); several outlet rows of the '
                    'same branch are one item with every outlet id',
            'gate': (f'{builder.NAMED_ROLE} · candidate host confirmed by scripts/review-candidate-hosts.py: official source, '
                     'the published branch label names the candidate venue and no unrelated venue, province agrees, own point '
                     f'within {FAR_M} m or inside the host footprint · current source listing in approved scope that counts')
            if adapter.get('review') else
            (f'{builder.NAMED_ROLE}: own sheet named-host link by exact or reviewed unique alias · current source listing in '
             f"approved scope · official public source URL · the brand's own shop or counter · one registry venue in "
             f'data/venues.json · own point within {FAR_M} m or inside the host footprint'),
            'linkedRows': sum(1 for r in rows if (r.get(adapter['venue']) or '').strip()),
            'publishedItems': len(added), 'publishedVenueHosts': len(hosts_added),
            'publishedSourceObservations': sum(x.get('sourceObservationCount', 1) for x in added),
            'omitted': dict(sorted(omitted.items())),
        }
        if adapter.get('review'):
            decisions = collections.Counter(d[4] for d in log if d[0] == dataset)
            receipt['candidateRows'] = sum(decisions.values())
            receipt['reviewAccepted'] = decisions.get('accepted', 0)
        receipts[dataset] = receipt
    report['excludedDatasets'] = {}
    if inputs.get('R04_VENUE_CROSSWALK.csv'):
        report.setdefault('reviewInputs', {})['R04_VENUE_CROSSWALK.csv'] = inputs['R04_VENUE_CROSSWALK.csv']

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
    old_limit = ('Named-host research datasets (linkedDatasets kind named_host_listing) add rows whose official source names the host and '
                 'whose own sheet matched it to one registry venue; they are source listings, not field checks, one brand once per venue, '
                 'and never change venue cores or primary counts.')
    limit = ('Named-host research datasets (linkedDatasets kind named_host_listing, reviewed_candidate_host) add branches whose '
             'official source names the host — matched by the dataset\'s own sheet, or a candidate confirmed by '
             'scripts/review-candidate-hosts.py; they are source listings, not field checks, one item per branch (D23), and never '
             'change venue cores.')
    report['limits'] = [x for x in report['limits'] if x != old_limit]
    if limit not in report['limits']:
        report['limits'].insert(len(report['limits']) - 1, limit)
    (tenants / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    facility, facility_counts = amenities(exported, venues, a.exported_on)
    facility_doc = {
        'meta': {'schemaVersion': '1', 'exportedOn': a.exported_on, 'kinds': {'pet-area': 'พื้นที่สำหรับสัตว์เลี้ยง'},
                 'datasets': {d: {'source': f'{ADAPTERS[d]["title"]} · 02_STORES (internal research master; exported CSV)',
                                  'sha256': exported[d][1]} for d in AMENITY_RULES},
                 'gate': 'the dataset names the facility as the centre\'s own (store_format), links it to one registry venue '
                         '(source_explicit_named_host) and gives a public source; basis official_host = the centre\'s own page, '
                         'owner_reported = the owner\'s report (shown as such)',
                 'counts': facility_counts,
                 'limits': 'A facility the source names; not a policy that pets are allowed everywhere in the centre, not a field check.'},
        'venues': facility,
    }
    (Path(a.venues).parent / 'venue-amenities.json').write_text(json.dumps(facility_doc, ensure_ascii=False, indent=1) + '\n')

    if a.review_log:
        with open(a.review_log, 'w', encoding='utf-8', newline='') as f:
            w = csv.writer(f)
            w.writerow(['dataset_id', 'outlet_id', 'brand_name', 'store_name', 'venue_label', 'province', 'candidate_venue_id',
                        'candidate_venue_name', 'decision', 'reason', 'evidence_or_detail', 'source_url', 'checked_on'])
            for dataset, outlet, row, vid, decision, reason, detail in log:
                w.writerow([dataset, outlet, row.get('brand_name', ''), row.get('store_name', ''), row.get('venue', ''), row.get('province', ''),
                            vid, (venues.get(vid) or {}).get('name', ''), decision, reason, detail, row.get('source_url', ''),
                            iso(row.get('checked_on'))])
    print(json.dumps({d: {k: receipts[d].get(k) for k in ('candidateRows', 'reviewAccepted', 'publishedItems', 'publishedVenueHosts', 'omitted')}
                      for d in ORDER}, ensure_ascii=False, indent=1))
    print(json.dumps({k: report[k] for k in ('publishedVenueHosts', 'publishedItems', 'datasets')}, ensure_ascii=False))


def split_ids(value):
    return [x.strip() for x in re.split(r'[|;,\s]+', str(value or '')) if x.strip()]


if __name__ == '__main__':
    main()

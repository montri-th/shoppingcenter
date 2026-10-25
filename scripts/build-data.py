#!/usr/bin/env python3
"""Build the public data files of CityMETER · Shopping Centers & Retail Venues.

  python3 scripts/build-data.py \
      --master     <dir with the Research Master CSV exports: 01_VENUES, 09_RELATIONSHIPS, 10_VENUE_LOGOS>
      --geometry   <dir with the unzipped CityMETER-retail-venue-host-geometry bundle>
      --boundaries <dir with OpenGISData-Thailand districts.geojson>
      --production <dir with base-info-lv0.json and prod-districts.json (CityMETER production API)>
      [--mapshaper <mapshaper executable>]

Writes data/venues.json, data/pending.json, data/districts.geojson, data/provinces.geojson and
data/venue-buildings.geojson. Re-run after a new export of the sheet; no code change is needed:
every count, the first finding and the class thresholds' inputs are recomputed and recorded in
meta, and every input file is hashed into meta.inputs.

Rules (Product Statement §4, owner retail-venue definition 2026-10-23):
- qualified = venue_qualification_status in the definition-supported family, or a category rule the owner
  accepted (owner_*_definition_accepted_*, Owner-stated); pending_* and reviewed-unconfirmed records are not
  eligible and are published only as quiet, uncounted context (owner decision D4).
- countable = qualified and count_role is a counted role (not a child zone / component / duplicate or count hold);
  unknown count roles are never counted and fail the tests until classified; a component without a
  qualified parent counts as its own venue when it is a shopping centre or mall (owner decision D6, 2026-10-25).
- supply = countable minus future projects and closed-by-evidence (operation_group).
- located = a selected reference point (coordinate_status/role); area membership is point-in-polygon
  of located points against the full-resolution boundaries; nothing is assigned by name.
- legacy size estimates are carried for the venue detail only (decision D3), never aggregated.
- public files carry no docs.google.com / drive.google.com links and no internal sheet ids.
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
SCHEMA_VERSION = '1.0.0'

# ---------------------------------------------------------------- definitions

# Owner decision D6 (Owner-stated, 25 Oct 2026): a qualified retail component whose parent is not in the qualified
# set is counted as a venue of its own when it is a shopping centre or mall: its display group (from evidence) is
# mall or community, or the owner named it a shopping centre (shown in the mall group, basis "owner"). Markets,
# terminal / hospital / other zones and possible duplicates stay uncounted until the registry links or re-roles them.
ORPHAN_COUNTED_GROUPS = {'mall', 'community'}
OWNER_SHOPPING_CENTRES = {
    'SC-C0015': 'One Bangkok Retail', 'SC-001304': 'Samyan Mitrtown', 'SC-001069': 'Silom Complex',
}

# count_role vocabulary of qualified rows. Counted roles are an allowlist: a role missing from all three sets is not
# counted and is listed in meta.checks.countRoleFallback (the tests fail until it is classified here).
# Component roles may still be counted by D6 when no qualified parent holds them; held roles never are.
COUNTED_ROLES = {
    'venue_site', 'venue_site_candidate', 'parent_complex', 'managed_site_parent',
    'pending_scope_boundary_review', 'retail_scope_pending_terminal_boundary',
}
COMPONENT_ROLES = {
    'child_zone', 'child_venue', 'retail_component_within_managed_site',
    'retail_subarea_do_not_count_as_separate_parent_mall', 'component_within_managed_site',
    'child_component_not_independent_center_count',
}
HELD_ROLES = {
    'duplicate_candidate_hold', 'aggregate_context_not_independent_venue',
    'individual_store_context_not_counted_as_venue', 'retail_component_scope_count_review',
}
COUNT_EXCLUDED_ROLES = COMPONENT_ROLES | HELD_ROLES
# Why a qualified row is not counted (row field countHold): component | duplicate | count-review | context | unclassified.
HOLD_KIND = {
    'duplicate_candidate_hold': 'duplicate', 'retail_component_scope_count_review': 'count-review',
    'aggregate_context_not_independent_venue': 'context', 'individual_store_context_not_counted_as_venue': 'context',
}
# A qualification status that itself holds the count wins over a counted role (e.g. …_duplicate_count_held).
STATUS_COUNT_HOLD = re.compile(r'duplicate_(count_held|review)')


def count_role_rule(role):
    """(countable, kind) for a count_role value; kind 'fallback' marks unreviewed vocabulary."""
    role = role or ''
    if role in COUNTED_ROLES:
        return True, 'counted'
    if role in COMPONENT_ROLES:
        return False, 'component'
    if role in HELD_ROLES:
        return False, 'held'
    return False, 'fallback'

# Display groups (Inference, for navigation only). Evidence `venue_type` first; `legacy_venue_type`
# only while the evidence type is `unclassified`. Ids must match js/model.js GROUPS.
GROUP_IDS = ['mall', 'community', 'market', 'hoststore', 'component', 'outlet', 'fuel', 'other']
TYPE_GROUP = {
    'mall': {
        'shopping_center', 'shopping_center_building', 'shopping_center_under_construction',
        'mixed_use_retail_venue', 'mixed_use_retail_host', 'mixed_use_parent_with_retail_component',
        'retail_complex', 'entertainment_anchored_mall', 'managed_retail_center', 'specialty_shopping_center',
        'specialty_retail_center', 'department_store_or_retail_complex', 'power_center', 'lifestyle_center',
        'fashion_retail_and_wholesale_center', 'former_fashion_retail_and_wholesale_center',
        'shopping_office_retail_building', 'specialty_retail_and_consumer_services_center',
    },
    'community': {
        'community_shopping_center', 'community_shopping_center_opening_unconfirmed',
        'community_shopping_center_candidate', 'community_mall', 'community_retail_center',
        'convenience_retail_center', 'retail_and_service_complex', 'community_food_and_retail_mall',
        'retail_service_plaza', 'retail_and_dining_complex', 'community_retail_and_sports_complex',
        'specialty_retail_and_cultural_center',
    },
    'outlet': {'outlet_shopping_center', 'outlet_center'},
    'hoststore': {
        'supermarket_store_or_host_component', 'hypermarket_store_or_host_component', 'wholesale_store',
        'wholesale_store_or_host_component', 'specialty_retail_store_or_host_component',
        'factory_outlet_retail_store', 'retail_store',
    },
    'market': {
        'retail_market', 'fresh_market', 'market_unspecified', 'periodic_market', 'licensed_type_1_market', 'floating_market',
        'street_market', 'wholesale_produce_market', 'night_market', 'community_market', 'mixed_wholesale_retail_market',
        'periodic_walking_street_market', 'roadside_fresh_market', 'creative_market_and_retail_space',
        'fresh_market_and_community_retail_center', 'community_mall_and_managed_market_complex', 'community_market_and_retail_complex',
        'retail_bazaar_candidate',
    },
    'other': {
        'managed_retail_entertainment_precinct', 'retail_precinct', 'heritage_retail_destination_under_redevelopment',
        'retail_food_and_wholesale_mixed_destination',
    },
    'fuel': {'fuel_station_retail_scope_unconfirmed', 'multi_tenant_travel_retail_stop', 'highway_retail_rest_stop'},
    'component': {
        'managed_retail_component', 'managed_retail_component_candidate', 'retail_zone', 'duty_free_retail_component',
        'mixed_use_retail_component', 'office_retail_podium', 'residential_retail_podium', 'resort_retail_component',
        'hospital_retail_component', 'transport_terminal_retail_component', 'transport_terminal_retail_scope',
    },
}
LEGACY_GROUP = {
    'mega_mall': 'mall', 'traditional_regional_mall': 'mall', 'entertainment_anchored_mall': 'mall',
    'mixed_use_super_regional': 'mall',
    'avenue': 'community', 'boutique_retail': 'community', 'convenience_strip': 'community',
    'home_improvement_center': 'community',
    'premium_outlet_village': 'outlet', 'standard_outlet': 'outlet',
    'supermarket_anchored': 'hoststore', 'hypermarket_anchored': 'hoststore', 'wholesale_club': 'hoststore',
    'wet_market_covered': 'market', 'night_market': 'market', 'wholesale_agricultural_market': 'market',
    'walking_street': 'market',
    'gas_station_retail': 'fuel', 'terminal_duty_free': 'component',
}
# Evidence types added at the 25 Oct 2026 refresh, after reviewing the keyword placement of each (the owner's
# category rules brought markets, fuel stations and grocery anchors into the qualified set).
TYPE_GROUP_ADDED_2026_10_25 = {
    'community': {
        'community_retail_property_historical_source'
    },
    'hoststore': {
        'grocery_anchor_with_food_retail_counter_component', 'grocery_anchor_with_restaurant_component',
        'grocery_anchor_with_restaurant_retail_component', 'grocery_anchor_with_staffed_retail_service_component',
        'grocery_store_with_source_listed_restaurant_component', 'hypermarket_with_managed_foodcourt_component',
        'hypermarket_with_managed_retail_component', 'hypermarket_with_retail_component',
        'hypermarket_with_staffed_pharmacy_component', 'supermarket_with_ancillary_retail_component',
        'supermarket_with_managed_foodcourt_component', 'supermarket_with_managed_retail_component_owner_reported',
        'supermarket_with_owner_confirmed_restaurant_component',
        'supermarket_with_source_listed_consumer_unit_component', 'supermarket_with_staffed_pharmacy_component',
        'wholesale_store_with_derived_retail_component_scope'
    },
    'market': {
        'agricultural_wholesale_market', 'community_walking_street_market', 'covered_market_source_reported',
        'craft_retail_market_cluster', 'farmers_market', 'floating_market_multizone',
        'food_market_common_management_unconfirmed', 'fresh_evening_market', 'fruit_market', 'historic_food_market',
        'historic_market_district_retail_scope_pending', 'historic_riverside_market', 'market', 'market_district',
        'market_precinct', 'marketplace', 'morning_fresh_food_street_market', 'morning_fresh_market',
        'municipal_market', 'night_market_and_retail_complex', 'periodic_heritage_market', 'railway_market_subarea',
        'reported_market_source_vintage_disclosed', 'riverside_market', 'riverside_periodic_walking_street_market',
        'roadside_morning_market', 'roadside_retail_market', 'street_market_identity_scope_pending',
        'street_market_multiple_plot_management_scope_pending', 'sunday_periodic_market_identity_perimeter_pending',
        'temple_retail_market', 'walking_street_market', 'walking_street_market_scope_pending',
        'weekend_community_market'
    },
    'other': {
        'historic_retail_district', 'historic_retail_district_walking_street', 'retail_food_district'
    },
    'fuel': {
        'fuel_station_with_historical_retail_component', 'fuel_station_with_retail_component',
        'fuel_station_with_source_listed_retail_component'
    },
    'component': {
        'community_market_otop_component', 'seafood_market_component', 'shopping_center_retail_component'
    },
}
for _group, _types in TYPE_GROUP_ADDED_2026_10_25.items():
    TYPE_GROUP[_group] |= _types
TYPE_TO_GROUP = {t: g for g, ts in TYPE_GROUP.items() for t in ts}

# Operator groups (Inference): a curated name table; the first company named in the source text wins.
# Rows that match no pattern keep their own cleaned name under group `other`; blank stays null.
OPERATOR_GROUPS = [
    ('cp-axtra', 'CP Axtra (Lotus’s)', ['CP Axtra', 'ซีพี แอ็กซ์ตร้า', 'Lotus’s', "Lotus's"]),
    ('central-pattana', 'Central Pattana', ['Central Pattana', 'เซ็นทรัลพัฒนา', 'Siam Future Development', 'SF Development']),
    ('central-retail', 'Central Retail', ['Central Retail', '(CRP)', 'สรรพสินค้าเซ็นทรัล']),
    ('the-mall-group', 'The Mall Group', ['The Mall Group', 'เดอะมอลล์']),
    ('siam-piwat', 'Siam Piwat', ['Siam Piwat', 'สยามพิวรรธน์']),
    ('ptt-retail', 'ปตท. บริหารธุรกิจค้าปลีก', ['ปตท.บริหารธุรกิจค้าปลีก', 'ปตท. บริหารธุรกิจค้าปลีก', 'PTT Retail']),
    ('home-product-center', 'Home Product Center', ['Home Product Center', 'โฮม โปรดักส์ เซ็นเตอร์']),
    ('asset-world', 'Asset World (AWC)', ['Asset World', 'AWC']),
    ('index-living-mall', 'Index Living Mall', ['Index Living Mall', 'อินเด็กซ์ ลิฟวิ่งมอลล์', 'The Walk Company']),
    ('big-c', 'Big C', ['Big C', 'บิ๊กซี']),
    ('olm-pena-house', 'OLM / Pena House', ['OLM PROPERTY', 'Outlet Mall Company', 'Pena House']),
    ('ally', 'ALLY', ['ALLY CPM', 'ALLY REIT']),
    ('major-cineplex', 'Major Cineplex', ['เมเจอร์ ซีนีเพล็กซ์', 'Major Cineplex']),
    ('chic-republic', 'Chic Republic', ['Chic Republic', 'ชิค รีพับบลิค']),
    ('jas-asset', 'JAS Asset', ['JAS Asset', 'เจเอเอส แอสเซ็ท']),
    ('mbk', 'MBK', ['MBK', 'เอ็ม บี เค']),
    ('minor', 'Minor', ['Minor']),
    ('local-government', 'เทศบาลและ อปท.', ['เทศบาล', 'องค์การบริหารส่วนตำบล', 'อบต.']),
]

PRIVATE_HOST = re.compile(r'(^|\.)(docs\.google\.com|drive\.google\.com|drive\.usercontent\.google\.com|googleusercontent\.com|sheets\.googleapis\.com|localhost)$', re.I)
URL_RE = re.compile(r'https?://[^\s<>"\]]+')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def text(value):
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def public_urls(value):
    out = []
    for u in URL_RE.findall(str(value or '')):
        u = u.rstrip('.,;)')
        host = re.sub(r'^https?://', '', u).split('/')[0].split(':')[0].lower()
        if '.' not in host or PRIVATE_HOST.search(host):
            continue
        if u not in out:
            out.append(u)
    return out


def public_url(value):
    urls = public_urls(value)
    return urls[0] if urls else None


def iso_date(value):
    s = text(value)
    if not s:
        return None
    for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(s.split(' ')[0], fmt).date().isoformat()
        except ValueError:
            pass
    return s


def coord(value):
    s = text(value)
    if s is None:
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def number(value):
    s = text(value)
    if s is None:
        return None
    try:
        v = float(s.replace(',', ''))
    except ValueError:
        return None
    if not math.isfinite(v):
        return None
    return int(v) if v.is_integer() else round(v, 2)


# A negative determination (the record is not a retail venue on its own) is neither counted nor shown as
# "pending": the owner definition only keeps pending_* as quiet context. New vocabulary from a refreshed
# master that matches none of these rules is treated as pending (never counted) and listed in
# meta.checks.qualificationFallback so the next build reviews it.
NEGATIVE_PREFIXES = ('excluded', 'rejected', 'disqualified', 'not_', 'non_', 'out_of_scope', 'definition_not_',
                     'definition_failed', 'fails_', 'does_not_')
NEGATIVE_PARTS = ('not_independent_venue', 'not_retail_venue', 'not_a_retail', 'not_qualified', 'not_qualifying',
                  'not_eligible')

# Category rules the owner accepted as meeting the retail-venue definition (Owner-stated, recorded per row in the
# registry, e.g. owner_market_definition_accepted_identity_current_and_count_separate): the rule id is the text
# between "owner_" and "_definition_accepted"; owner_confirmed_* records a site-level owner confirmation.
OWNER_ACCEPTED = re.compile(r'^owner_([a-z0-9_]+?)_definition_accepted(?:_|$)')


def owner_rule(s):
    s = s or ''
    m = OWNER_ACCEPTED.match(s)
    if m:
        return m.group(1)
    if s.startswith('owner_confirmed_'):
        return re.sub(r'_current(_.*)?$', '', s[len('owner_'):])
    return None


def qualification_rule(s):
    """(tier, rule) for a venue_qualification_status value; rule 'fallback' marks unreviewed vocabulary."""
    s = s or ''
    if s.startswith('planned_'):
        return 'planned', 'planned_*'
    if s.startswith('historical_') or s == 'definition_supported_historically_current_operation_separate':
        return 'historical', 'historical_*'
    if s.startswith('definition_supported') or s.startswith('qualified_') or s == 'parent_context_retail_child_qualified_separately':
        return 'supported', 'definition_supported_* / qualified_*'
    if s.startswith(('pending_', 'definition_pending')):
        return 'pending', 'pending_*'
    if s.startswith(NEGATIVE_PREFIXES) or any(part in s for part in NEGATIVE_PARTS):
        return 'excluded', 'negative determination'
    if owner_rule(s):
        return 'owner', 'owner_*_definition_accepted / owner_confirmed_*'
    if s.startswith('reviewed_') and 'unconfirmed' in s:
        return 'unconfirmed', 'reviewed_*_unconfirmed'
    if s.endswith('_pending'):
        return 'pending', '*_pending'
    return 'pending', 'fallback'


def qualification_tier(s):
    return qualification_rule(s)[0]


QUALIFIED_TIERS = ('supported', 'owner', 'historical', 'planned')
CONTEXT_TIERS = ('pending', 'unconfirmed')   # quiet grey context (D4), never counted


# Keyword rule for evidence types not in the table yet (new research vocabulary): ordered, first match wins.
TYPE_KEYWORDS = [
    ('fuel', ('fuel', 'rest_stop', 'travel_retail')),
    ('hoststore', ('store_or_host_component', 'retailer_multibusiness', 'store_multibusiness', 'factory_outlet',
                   'single_retail', 'showroom', 'retail_store', 'supermarket', 'hypermarket', 'grocery', 'wholesale_store')),
    ('component', ('component', 'podium')),
    ('market', ('market', 'bazaar')),
    ('outlet', ('outlet_center', 'outlet_shopping', 'outlet_village')),
    ('community', ('community', 'retail_and_dining', 'retail_and_service')),
    ('mall', ('shopping_center', 'shopping_mall', 'department_store', 'plaza', 'mall')),
]


def display_group(venue_type, legacy):
    t = venue_type or ''
    if t and t != 'unclassified':
        g = TYPE_TO_GROUP.get(t)
        if g:
            return g, 'evidence'
        for gid, words in TYPE_KEYWORDS:
            if any(w in t for w in words):
                return gid, 'evidence-keyword'
        return 'other', 'evidence-keyword'
    g = LEGACY_GROUP.get(legacy or '')
    if g:
        return g, 'legacy'
    return 'other', 'legacy' if legacy else 'none'


def status_of(op_group):
    if op_group == 'future_project':
        return 'planned'
    if op_group == 'closed_source_evidence':
        return 'closed'
    return 'supply'


def is_located(row):
    status = row['coordinate_status'] or ''
    role = row['coordinate_role'] or ''
    lat, lon = coord(row['latitude']), coord(row['longitude'])
    if lat is None or lon is None or not (5 <= lat <= 21 and 97 <= lon <= 106):
        return False
    if not status or not role:
        return False
    if status.startswith(('held_', 'withheld_', 'not_collected', 'not_selected')) or 'not_revalidated' in status:
        return False
    if role.startswith(('held_', 'not_selected', 'no_')):
        return False
    return True


def operator_group(raw):
    s = text(raw)
    if not s:
        return None, None
    best = None
    for gid, label, patterns in OPERATOR_GROUPS:
        for p in patterns:
            i = s.find(p)
            if i >= 0 and (best is None or i < best[0]):
                best = (i, gid, label)
    if best:
        return best[1], best[2]
    name = re.split(r'\s+\(|\s+—\s+|;\s', s)[0].strip()
    return 'other', name or s


def clean_operator(raw):
    s = text(raw)
    if not s:
        return None
    return re.split(r'\s+\(|\s+—\s+|;\s', s)[0].strip() or s


def split_list(value):
    return [x.strip() for x in re.split(r'[;|\n]', str(value or '')) if x.strip()]


def find_export(folder, tab):
    hits = sorted(Path(folder).glob(f'*{tab}.csv'))
    if not hits:
        sys.exit(f'missing export for tab {tab} in {folder}')
    return hits[-1]


# ---------------------------------------------------------------- output helpers

MIN_SHARDS, VENUES_PER_SHARD = 32, 40   # shards grow (powers of two) with the registry; the client reads meta.detail.shards
CORE_KEYS = ['id', 'name', 'nameEn', 'aliases', 'scId', 'group', 'groupBasis', 'tier', 'ownerRule', 'countable', 'countRole', 'countHold',
             'parentId', 'children', 'status', 'operationGroup', 'operatorGroup', 'operatorLabel', 'lat', 'lon', 'located',
             'provinceCode', 'districtCode', 'addrProvince', 'addrDistrict', 'logoKey', 'yearOpened', 'countBasis']
CORE_ONLY = {'storeCount', 'hasBuilding'}


def shard_count(n_venues):
    """At least 32 shards, doubling while a shard would hold more than 40 venues on average (≈ 4 KB each)."""
    shards = MIN_SHARDS
    while n_venues / shards > VENUES_PER_SHARD:
        shards *= 2
    return shards


def shard_of(venue_id, shards):
    h = 0x811C9DC5
    for b in venue_id.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h % shards


def compact(value):
    """Drop None, empty strings, empty lists and empty dicts (missing stays missing, never 0)."""
    if isinstance(value, dict):
        out = {k: compact(v) for k, v in value.items()}
        return {k: v for k, v in out.items() if v is not None and v != '' and v != [] and v != {}}
    if isinstance(value, list):
        return [compact(v) for v in value]
    return value


def write_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')))


# ---------------------------------------------------------------- boundaries

def load_boundaries(boundaries_dir, production_dir):
    districts = json.loads((Path(boundaries_dir) / 'districts.geojson').read_text())
    lv0 = json.loads((Path(production_dir) / 'base-info-lv0.json').read_text())['value']
    prod_d = json.loads((Path(production_dir) / 'prod-districts.json').read_text())
    provinces = {p['code']: p for p in lv0['provinceInfos']}           # DOPA numeric code -> production record
    prod_by_code = {d['code']: (abbr, d) for abbr, ds in prod_d['provinces'].items() for d in ds}
    prod_by_name = defaultdict(list)
    for abbr, ds in prod_d['provinces'].items():
        for d in ds:
            prod_by_name[(abbr, d['th'])].append((abbr, d))
    feats, geoms, problems, remapped = [], [], [], []
    for f in districts['features']:
        p = f['properties']
        prov = provinces.get(p['pro_code'])
        if not prov:
            problems.append(f"province {p['pro_code']} not in production lv0")
            continue
        prod = prod_by_code.get(p['amp_code'])
        code = p['amp_code']
        if not prod:
            same = [(a, d) for a, d in prod_by_name.get((prov['abbrEn'], p['amp_th']), [])]
            if len(same) == 1:
                prod, code = same[0], same[0][1]['code']
                remapped.append({'boundaryCode': p['amp_code'], 'productionCode': code, 'name': p['amp_th']})
            else:
                problems.append(f"district {p['amp_code']} not in production lv1")
        elif prod[0] != prov['abbrEn']:
            problems.append(f"district {p['amp_code']} province mismatch {prod[0]} vs {prov['abbrEn']}")
        g = shape(f['geometry'])
        if not g.is_valid:
            g = g.buffer(0)
        rp = g.representative_point()
        feats.append({
            'labelLon': round(rp.x, 5), 'labelLat': round(rp.y, 5),
            'code': code, 'boundaryCode': p['amp_code'], 'province': prov['abbrEn'], 'dopa': p['pro_code'],
            'th': p['amp_th'], 'en': p['amp_en'], 'areaKm2': round(float(p['area_sqkm']), 3),
            'prodId': prod[1]['id'] if prod else None, 'prodTh': prod[1]['th'] if prod else None,
        })
        geoms.append(g)
    if len({d['code'] for d in feats}) != len(feats):
        problems.append('duplicate district codes')
    return districts, feats, geoms, lv0['provinceInfos'], problems, remapped


class Locator:
    def __init__(self, feats, geoms):
        self.feats, self.geoms, self.tree = feats, geoms, STRtree(geoms)

    def locate(self, lon, lat):
        pt = Point(lon, lat)
        hits = [i for i in self.tree.query(pt) if self.geoms[i].covers(pt)]
        if not hits:
            return None
        return min((self.feats[i] for i in hits), key=lambda d: d['code'])


def simplify(districts_geojson, district_meta, mapshaper, percent):
    """Topology-preserving simplification of districts; provinces are dissolved from the simplified districts."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / 'src.geojson'
        src.write_text(json.dumps(districts_geojson))
        d_out, p_out = Path(tmp) / 'districts.geojson', Path(tmp) / 'provinces.geojson'
        subprocess.run([mapshaper, '-i', str(src), '-filter-fields', 'amp_code,pro_code', '-simplify', f'{percent}%',
                        'keep-shapes', 'planar', '-o', str(d_out), 'precision=0.0001', 'format=geojson'],
                       check=True, capture_output=True)
        subprocess.run([mapshaper, '-i', str(d_out), '-dissolve', 'pro_code', '-o', str(p_out), 'precision=0.0001',
                        'format=geojson'], check=True, capture_output=True)
        d_geo, p_geo = json.loads(d_out.read_text()), json.loads(p_out.read_text())
    by_code = {d['boundaryCode']: d for d in district_meta}
    for f in d_geo['features']:
        m = by_code[f['properties']['amp_code']]
        f['properties'] = {k: m[k] for k in ('code', 'province', 'th', 'en', 'areaKm2', 'prodId', 'labelLon', 'labelLat')}
    return d_geo, p_geo


# ---------------------------------------------------------------- main build

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--master', required=True)
    ap.add_argument('--geometry', required=True)
    ap.add_argument('--boundaries', required=True)
    ap.add_argument('--production', required=True)
    ap.add_argument('--mapshaper', default='mapshaper')
    ap.add_argument('--luxury', help='published Luxury Brands data/luxury.json, to link venues the Luxury page can open (?place=)')
    ap.add_argument('--simplify', type=float, default=14)
    ap.add_argument('--as-of', default=None, help='snapshot date (default: newest checked_on in 01_VENUES)')
    args = ap.parse_args()

    venues_csv = find_export(args.master, '01_VENUES')
    relations_csv = find_export(args.master, '09_RELATIONSHIPS')
    logos_csv = find_export(args.master, '10_VENUE_LOGOS')
    geo_dir = Path(args.geometry)
    inputs = {
        '01_VENUES': {'file': venues_csv.name.split(' - ')[-1], 'sha256': sha256(venues_csv), 'bytes': venues_csv.stat().st_size},
        '09_RELATIONSHIPS': {'file': relations_csv.name.split(' - ')[-1], 'sha256': sha256(relations_csv)},
        '10_VENUE_LOGOS': {'file': logos_csv.name.split(' - ')[-1], 'sha256': sha256(logos_csv)},
        'host_geometry': {'file': 'selected-host-geometry.geojson', 'sha256': sha256(geo_dir / 'selected-host-geometry.geojson')},
        'districts': {'file': 'OpenGISData-Thailand districts.geojson', 'sha256': sha256(Path(args.boundaries) / 'districts.geojson')},
        'production_provinces': {'file': 'base-info-lv0.json', 'sha256': sha256(Path(args.production) / 'base-info-lv0.json')},
        'production_districts': {'file': 'prod-districts.json', 'sha256': sha256(Path(args.production) / 'prod-districts.json')},
    }

    df = pd.read_csv(venues_csv, dtype=str, keep_default_na=False)
    rel = pd.read_csv(relations_csv, dtype=str, keep_default_na=False)
    logos = pd.read_csv(logos_csv, dtype=str, keep_default_na=False)
    if df.venue_id.duplicated().any():
        sys.exit('duplicate venue_id in 01_VENUES')

    districts_geojson, district_meta, district_geoms, prod_provinces, problems, remapped = load_boundaries(args.boundaries, args.production)
    locator = Locator(district_meta, district_geoms)
    prov_area = defaultdict(float)
    for d in district_meta:
        prov_area[d['province']] += d['areaKm2']
    prov_meta = {p['abbrEn']: p for p in prod_provinces}

    # aliases and relationship notes from 09_RELATIONSHIPS
    aliases = defaultdict(list)
    for _, r in rel.iterrows():
        if text(r.get('alias_label')):
            aliases[r['from_venue_id']].append(r['alias_label'].strip())

    logo_by_key = {r['logo_key']: r for _, r in logos.iterrows() if text(r.get('logo_key'))}

    rows, pending = [], []
    unmapped_types, vocab, coord_vocab, role_vocab = Counter(), Counter(), Counter(), Counter()
    outside = Counter()
    as_of = args.as_of
    for _, r in df.iterrows():
        tier, rule = qualification_rule(r['venue_qualification_status'])
        vocab[(r['venue_qualification_status'] or '', tier, rule)] += 1
        group, basis = display_group(r['venue_type'], r['legacy_venue_type'])
        if basis == 'evidence-keyword':
            unmapped_types[(tier in QUALIFIED_TIERS, r['venue_type'], group)] += 1
        located = is_located(r)
        lat, lon = coord(r['latitude']), coord(r['longitude'])
        area = locator.locate(lon, lat) if located else None
        if located and not area:
            outside[tier] += 1
        name_th, name_en = text(r['name_th']), text(r['name_en'])
        name = name_th or name_en or text(r['venue_name'])

        if tier == 'excluded':
            continue
        if tier in CONTEXT_TIERS:
            if located:
                rec = [r['venue_id'], name, round(lon, 5), round(lat, 5),
                       area['province'] if area else None, area['code'] if area else None, group]
                if tier == 'unconfirmed':
                    rec.append('reviewed')
                pending.append(rec)
            continue

        coord_vocab[(r['coordinate_status'] or '', r['coordinate_role'] or '', located)] += 1
        countable, role_kind = count_role_rule(r['count_role'])
        role_vocab[(r['count_role'] or '', role_kind)] += 1
        hold = None if countable else HOLD_KIND.get(r['count_role'] or '', 'component' if role_kind == 'component' else 'unclassified')
        if countable and STATUS_COUNT_HOLD.search(r['venue_qualification_status'] or ''):
            # the status itself holds the count (possible duplicate) even where count_role says candidate
            countable, hold = False, 'duplicate'
        op_gid, op_label = operator_group(r['operator_name'])
        logo = logo_by_key.get(r['venue_logo_key'] or '')
        size = {}
        for key, col in (('glaReported', 'gla_sqm_reported'), ('gfaReported', 'gfa_sqm_reported'),
                         ('siteAreaReported', 'site_area_sqm_reported'), ('floorsReported', 'floors_reported'),
                         ('tenantsReported', 'tenant_count_reported')):
            v = number(r[col])
            if v is not None:
                size[key] = v
        if 'gfaReported' in size and text(r['gfa_sqm_reported_scope']):
            size['gfaReportedScope'] = r['gfa_sqm_reported_scope'].strip()
        if 'tenantsReported' in size:
            size['tenantsDefinition'] = text(r['tenant_count_definition'])
            size['tenantsDate'] = iso_date(r['tenant_count_date'])
        legacy = {}
        if number(r['gla_sqm_legacy']) is not None:
            legacy['gla'] = number(r['gla_sqm_legacy'])
        if number(r['gfa_sqm_legacy']) is not None:
            legacy['gfa'] = number(r['gfa_sqm_legacy'])
        if legacy:
            legacy['basis'] = text(r['gla_legacy_basis'])
            size['legacy'] = legacy

        row = {
            'id': r['venue_id'],
            'name': name,
            'nameTh': name_th,
            'nameEn': name_en,
            'aliases': aliases.get(r['venue_id']) or None,
            'scId': text(r['mall_external_id']),
            'citymeterId': text(r['citymeter_venue_id']),
            'citymeterStatus': text(r['citymeter_identity_status']),
            'group': group,
            'groupBasis': basis,
            'venueType': text(r['venue_type']),
            'legacyType': text(r['legacy_venue_type']),
            'subtype': text(r['venue_subtype']),
            'tier': tier,
            'ownerRule': owner_rule(r['venue_qualification_status']) if tier == 'owner' else None,
            'qualification': text(r['venue_qualification_status']),
            'countable': countable,
            'countRole': text(r['count_role']),
            'countHold': hold,
            'parentId': text(r['parent_venue_id']),
            'hierarchyRole': text(r['hierarchy_role']),
            'status': status_of(r['operation_group']),
            'operationGroup': text(r['operation_group']),
            'operation': text(r['operation_status']),
            'operator': clean_operator(r['operator_name']),
            'operatorRaw': text(r['operator_name']),
            'operatorGroup': op_gid,
            'operatorLabel': op_label,
            'website': public_url(r['official_website']),
            'directory': public_url(r['tenant_directory_url']),
            'phone': text(r['phone']),
            'hours': text(r['opening_hours']),
            'hoursScope': text(r['opening_hours_scope']),
            'yearOpened': number(r['year_opened_reported']),
            'openedDate': iso_date(r['opened_date']),
            'phasedOpeningDate': iso_date(r['phased_opening_date']),
            'size': size or None,
            'address': text(r['address']),
            'addrProvince': text(r['province']),
            'addrDistrict': text(r['district']),
            'addrSubdistrict': text(r['subdistrict']),
            'postcode': text(r['postcode']),
            'lat': round(lat, 6) if located else None,
            'lon': round(lon, 6) if located else None,
            'located': located,
            'coordinateStatus': text(r['coordinate_status']),
            'coordinateRole': text(r['coordinate_role']),
            'provinceCode': area['province'] if area else None,
            'districtCode': area['code'] if area else None,
            'stores': {
                'confirmed': int(number(r['linked_primary_store_observations']) or 0),
                'datasets': sorted({d for s in split_list(r['linked_source_datasets']) for d in [s]}),
            },
            'logoKey': text(r['venue_logo_key']) if logo is not None else None,
            'building': text(r['selected_building_representation']),
            'checkedOn': iso_date(r['checked_on']),
            'ev': {
                'nameTh': {'basis': text(r['name_th_basis']), 'url': public_url(r['name_th_source_url'])},
                'nameEn': {'basis': text(r['name_en_basis']), 'url': public_url(r['name_en_source_url'])},
                'type': {'status': text(r['classification_status']), 'url': public_url(r['classification_source_url']),
                         'checkedOn': iso_date(r['classification_checked_on'])},
                'qualification': {'url': public_url(r['qualification_evidence_url']),
                                  'consumer': text(r['retail_consumer_facing_status']),
                                  'governance': text(r['shared_area_governance_status']),
                                  'multitenancy': text(r['multitenancy_status'])},
                'operation': {'status': text(r['operation_evidence_status']), 'url': public_url(r['operation_source_url'])},
                'coordinate': {'url': public_url(r['coordinate_source_url'])},
                'identity': {'url': public_url(r['identity_source_url']), 'production': public_url(r['citymeter_detail_url'])},
                'building': {'status': text(r['building_decision_status']), 'url': public_url(r['building_evidence_url'])},
                'research': {'status': text(r['official_research_status']), 'checkedOn': iso_date(r['official_research_checked_on']),
                             'urls': public_urls(r['official_research_source_urls']) or None},
                'record': {'origin': text(r['record_origin']), 'period': text(r['source_period']),
                           'fields': text(r['field_evidence_status']), 'review': text(r['review_status']),
                           'release': text(r['release_status'])},
            },
        }
        rows.append(row)
        if row['checkedOn'] and (as_of is None or row['checkedOn'] > as_of):
            as_of = row['checkedOn']

    by_id = {r['id']: r for r in rows}
    if args.luxury:
        lux = json.loads(Path(args.luxury).read_text())
        lux_ids = {c['id'] for c in lux.get('centers', []) if c.get('id')}
        inputs['luxury_centers'] = {'file': 'luxurybrands data/luxury.json', 'sha256': sha256(args.luxury), 'centers': len(lux_ids)}
        for r in rows:
            if r['citymeterId'] in lux_ids:
                r['luxuryPlace'] = r['citymeterId']
    orphans = []
    for r in rows:
        if r['parentId'] and r['parentId'] in by_id:
            by_id[r['parentId']].setdefault('children', []).append(r['id'])
        elif not r['countable']:
            hold = r['countHold']
            counted = hold == 'component' and (r['id'] in OWNER_SHOPPING_CENTRES or r['group'] in ORPHAN_COUNTED_GROUPS)
            if counted:
                r['countable'] = True
                r['countBasis'] = 'component-without-qualified-parent'
                r['countHold'] = None
                if r['group'] not in ORPHAN_COUNTED_GROUPS:
                    r['group'], r['groupBasis'] = 'mall', 'owner'
            orphans.append({'id': r['id'], 'name': r['name'], 'countRole': r['countRole'], 'hold': hold,
                            'parentId': r['parentId'], 'counted': counted, 'group': r['group']})

    # ------------------------------------------------------------ buildings
    links = pd.read_csv(find_export(args.master, '13_BUILDING_LINKS'), dtype=str, keep_default_na=False) \
        if list(Path(args.master).glob('*13_BUILDING_LINKS.csv')) else None
    venue_geoms = defaultdict(set)
    if links is not None:
        inputs['13_BUILDING_LINKS'] = {'file': '13_BUILDING_LINKS.csv', 'sha256': sha256(find_export(args.master, '13_BUILDING_LINKS'))}
        for _, l in links.iterrows():
            if l['venue_id'] not in by_id:
                continue
            for col in ('qualified_host_observation_ids', 'preferred_part_observation_ids'):
                for gid in split_list(l[col]):
                    venue_geoms[gid].add(l['venue_id'])
    host = json.loads((geo_dir / 'selected-host-geometry.geojson').read_text())
    parts_by_host = Counter(f['properties']['host_osm_id'] for f in host['features']
                            if f['properties']['geometry_role'] == 'host_building_part_not_shop_unit')
    buildings, missing_geom = [], set()
    for f in host['features']:
        p = f['properties']
        ids = sorted(venue_geoms.get(p['observation_id'], set()))
        if not ids:
            continue
        part = p['geometry_role'] == 'host_building_part_not_shop_unit'
        status = p['source_height_status']
        if part:
            base, top = p.get('selected_base_m'), p.get('selected_top_m')
            known = base is not None and top is not None and top > base
            render = 'extrusion' if known else 'outline'
            props = {'height_m': top if known else None, 'base_m': base if known else None,
                     'display_height_m': top if known else 0, 'display_base_m': base if known else 0,
                     'height_note': 'baseM/topM ตาม CityMETER production; ไม่ใช่ผลรังวัดอาคาร' if known else 'ไม่มีข้อมูลความสูงของส่วนอาคาร'}
        elif p['selected_render_role'] == 'parent_outline_with_detailed_parts':
            render = 'outline'
            props = {'height_m': None, 'base_m': 0, 'display_height_m': 0, 'display_base_m': 0,
                     'height_note': 'อาคารหลักแสดงเป็นเส้นขอบ ส่วนอาคารแสดงความสูงตามแหล่งข้อมูล'}
            status = 'unknown_display_fallback'
        else:
            h = p.get('selected_height_m')
            if h is not None and status in ('citymeter_model_estimate', 'osm_published_height_not_survey_verified'):
                render, props = 'extrusion', {'height_m': h, 'base_m': 0, 'display_height_m': h, 'display_base_m': 0,
                                              'height_note': 'ความสูงจากแหล่งข้อมูลหรือแบบจำลอง ไม่ใช่ผลรังวัด'}
            else:
                render, props = 'extrusion', {'height_m': h if status == 'model_height_review' else None, 'base_m': 0,
                                              'display_height_m': 3, 'display_base_m': 0,
                                              'height_note': 'ไม่มีความสูงที่ยืนยัน ใช้ 3 ม. เพื่อแสดงรูปทรงเท่านั้น'}
                if status != 'model_height_review':
                    status = 'unknown_display_fallback'
        buildings.append({'type': 'Feature', 'geometry': f['geometry'], 'properties': {
            'host_id': p['observation_id'], 'osm_id': p.get('host_osm_id'), 'source_url': public_url(p.get('source_url')),
            'geometry_role': p['geometry_role'], 'render_role': p['selected_render_role'], 'license': p.get('license'),
            'retrieved_on': p.get('source_retrieved_on'), 'source_geometry_date': p.get('source_geometry_date'),
            'citymeter_building_id': p.get('native_building_id'), 'height_status': status, 'render_as': render,
            'venue_ids': ids, 'venue_names': [by_id[i]['name'] for i in ids], **props}})
        for i in ids:
            by_id[i].setdefault('buildingIds', []).append(p['observation_id'])
    for gid in venue_geoms:
        if gid not in {b['properties']['host_id'] for b in buildings}:
            missing_geom.add(gid)

    # ------------------------------------------------------------ checks (first finding, counts)
    countable = [r for r in rows if r['countable']]
    supply = [r for r in countable if r['status'] == 'supply']
    located_supply = [r for r in supply if r['located'] and r['districtCode']]
    dist_by_code = {d['code']: d for d in district_meta}
    per_district = Counter(r['districtCode'] for r in located_supply)
    per_province = Counter(r['provinceCode'] for r in located_supply)
    dens = {c: n / dist_by_code[c]['areaKm2'] for c, n in per_district.items()}
    top = max(dens, key=lambda c: (dens[c], per_district[c], -int(c)))
    prov = dist_by_code[top]['province']
    ranked = sorted((c for c in dens if dist_by_code[c]['province'] == prov),
                    key=lambda c: (-dens[c], -per_district[c], c))[:3]
    aha = {
        'province': prov, 'districts': ranked, 'count': sum(per_district[c] for c in ranked), 'total': per_province[prov],
        'areaKm2': round(sum(dist_by_code[c]['areaKm2'] for c in ranked), 3), 'provinceAreaKm2': round(prov_area[prov], 3),
        'densities': {c: round(dens[c], 4) for c in ranked},
    }
    counts = {
        'registry': len(df), 'qualified': len(rows), 'tiers': dict(Counter(r['tier'] for r in rows)),
        'countable': len(countable), 'supply': len(supply), 'planned': sum(r['status'] == 'planned' for r in countable),
        'closed': sum(r['status'] == 'closed' for r in countable), 'locatedSupply': len(located_supply),
        'unlocatedSupply': sum(not r['located'] for r in supply), 'provinces': len(per_province), 'districts': len(per_district),
        'components': len(rows) - len(countable), 'componentsWithoutParent': sum(not o['counted'] for o in orphans),
        'componentsCountedAsVenue': sum(o['counted'] for o in orphans),
        'holds': dict(Counter(r['countHold'] for r in rows if not r['countable'])),
        'ownerRules': dict(Counter(r['ownerRule'] for r in rows if r['ownerRule'])),
        'ownerRulesSupply': dict(Counter(r['ownerRule'] for r in supply if r['ownerRule'])),
        'pendingRegistry': int((df.venue_qualification_status.map(qualification_tier) == 'pending').sum()),
        'unconfirmedRegistry': int((df.venue_qualification_status.map(qualification_tier) == 'unconfirmed').sum()),
        'excludedRegistry': int((df.venue_qualification_status.map(qualification_tier) == 'excluded').sum()),
        'pendingMapped': len(pending), 'unconfirmedMapped': sum(len(p) > 7 for p in pending),
        'buildingsFeatures': len(buildings),
        'buildingVenues': len({i for b in buildings for i in b['properties']['venue_ids']}),
        'storesConfirmed': sum(r['stores']['confirmed'] for r in countable),
        'storeVenues': sum(r['stores']['confirmed'] > 0 for r in countable),
        'luxuryLinked': sum(bool(r.get('luxuryPlace')) for r in rows),
        'operatorKnown': sum(bool(r['operator']) for r in countable), 'websiteKnown': sum(bool(r['website']) for r in countable),
        'hoursKnown': sum(bool(r['hours']) for r in countable), 'locatedOutsideBoundaries': dict(outside),
        'groups': dict(Counter(r['group'] for r in located_supply)),
    }

    # ------------------------------------------------------------ write
    DATA.mkdir(exist_ok=True)
    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    meta = {
        'schemaVersion': SCHEMA_VERSION, 'asOf': as_of, 'generatedAt': generated,
        'dataset': 'CityMETER Shopping Centers & Retail Venues Thailand — Research Master',
        'registryId': 'research.TH.shopping', 'productId': 'shoppingCenter',
        'grain': 'one retail venue / site; parent complexes and retail components are separate rows',
        'boundary': {'source': 'OpenGISData-Thailand (DOPA-credited), CC BY 4.0', 'commit': 'fafcea1',
                     'url': 'https://github.com/chingchai/OpenGISData-Thailand',
                     'codes': 'CityMETER production base/info lv0 (abbrEn) and lv1 (district code)'},
        'definitions': {
            'qualified': 'venue_qualification_status in the definition-supported family (current, historical, planned) '
                         'or a category rule the owner accepted (owner_*_definition_accepted_*, owner_confirmed_*; '
                         'tier "owner", Owner-stated)',
            'owner': 'qualified by a category rule the owner accepted and recorded in the registry (ownerRule = rule id); '
                     'the rule replaces source evidence of a single common manager for that category, it does not add it',
            'countable': 'qualified and count_role in ' + ', '.join(sorted(COUNTED_ROLES)) +
                         ' (unknown roles are not counted and listed in checks.countRoleFallback); '
                         'a component role (' + ', '.join(sorted(COMPONENT_ROLES)) + ') without a qualified parent counts as '
                         'its own venue when it is a shopping centre or mall (display group mall/community, or named by the '
                         'owner) — owner decision D6, 2026-10-25; held roles (' + ', '.join(sorted(HELD_ROLES)) +
                         ') are never counted',
            'supply': 'countable minus operation_group future_project and closed_source_evidence',
            'located': 'a selected reference point (coordinate_status/role); area = point-in-polygon on full-resolution boundaries',
            'pending': 'pending_* qualification: not eligible by default, quiet context only, never counted',
            'unconfirmed': 'reviewed_*_unconfirmed: the definition review closed without confirming the record; quiet '
                           'context only (pending.json field state = "reviewed"), never counted',
            'excluded': 'a negative determination (e.g. individual_tenant_component_not_independent_venue): not shown, never counted',
        },
        'groupMapping': {'evidence': {g: sorted(ts) for g, ts in TYPE_GROUP.items()}, 'legacy': LEGACY_GROUP,
                         'keywords': [{'group': g, 'contains': list(w)} for g, w in TYPE_KEYWORDS],
                         'rule': 'evidence venue_type from the table first; an evidence type missing from the table takes the '
                                 'first keyword group whose word it contains (basis evidence-keyword), else other; '
                                 'legacy_venue_type only while venue_type is unclassified (basis legacy)'},
        'operatorGroups': [{'id': g, 'label': l, 'patterns': p} for g, l, p in OPERATOR_GROUPS],
        'counts': counts,
        'checks': {'aha': aha, 'problems': problems, 'districtCodeRemaps': remapped,
                   'keywordMappedTypes': [{'qualified': q, 'venueType': t, 'group': g, 'rows': n}
                                          for (q, t, g), n in sorted(unmapped_types.items(), key=lambda x: (not x[0][0], x[0][1]))],
                   'componentsWithoutParent': orphans, 'geometryLinksWithoutFeature': sorted(missing_geom),
                   'qualificationFallback': [{'status': st, 'rows': n} for (st, tier, rule), n in sorted(vocab.items()) if rule == 'fallback'],
                   'countRoleFallback': [{'role': role, 'rows': n} for (role, kind), n in sorted(role_vocab.items()) if kind == 'fallback']},
        'release': 'research snapshot published as a demo by the owner; registry release_status remains on hold per row '
                   '(identity, geometry, rights, remaining fields) — not a CityMETER production release',
        'inputs': inputs,
        'limitations': [
            'Not a census of shopping centers or retail venues in Thailand.',
            'Qualified by definition does not confirm the venue is open today; operation status is sourced, not field verified.',
            'Reference points are not entrances; area membership is point-in-polygon of the reference point.',
            'Legacy GLA/GFA values are estimates with a stated basis; they are not official GLA and are never aggregated.',
            'Store links are confirmed observations of other CityMETER research datasets; candidates are not counted.',
            'Counts are not market share, footfall, sales, rent, vacancy or occupancy.',
        ],
    }
    # core rows (map, filters, counts, lists, search) + detail shards loaded when a venue opens
    core_rows, shards, n_shards = [], defaultdict(dict), shard_count(len(rows))
    for r in sorted(rows, key=lambda r: r['id']):
        core = {k: r.get(k) for k in CORE_KEYS}
        core['storeCount'] = r['stores']['confirmed']
        core['hasBuilding'] = bool(r.get('buildingIds'))
        core_rows.append(compact(core))
        shards[shard_of(r['id'], n_shards)][r['id']] = compact({k: v for k, v in r.items() if k not in CORE_ONLY})
    meta['detail'] = {'shards': n_shards, 'path': 'data/details/{nn}.json',
                      'hash': 'FNV-1a 32-bit of the UTF-8 venue id, modulo shards, decimal padded to two digits',
                      'sizing': f'at least {MIN_SHARDS} shards, doubled while the average exceeds {VENUES_PER_SHARD} venues per shard'}
    meta['coreFields'] = CORE_KEYS + ['storeCount', 'hasBuilding']
    write_json(DATA / 'venues.json', {'meta': meta, 'rows': core_rows})
    details = DATA / 'details'
    details.mkdir(exist_ok=True)
    for old in details.glob('*.json'):
        old.unlink()
    for n in range(n_shards):
        write_json(details / f'{n:02d}.json', {'asOf': as_of, 'shard': n, 'venues': shards.get(n, {})})
    (DATA / 'pending.json').write_text(json.dumps({
        'meta': {'asOf': as_of, 'grain': meta['grain'], 'definition': meta['definitions']['pending'],
                 'definitionReviewed': meta['definitions']['unconfirmed'],
                 'count': len(pending), 'reviewed': counts['unconfirmedMapped'],
                 'registryPending': counts['pendingRegistry'], 'registryUnconfirmed': counts['unconfirmedRegistry'],
                 'registryExcluded': counts['excludedRegistry'],
                 'note': 'Context only: not eligible under the owner retail-venue definition; never counted. '
                         'A row with an 8th field "reviewed" closed its definition review unconfirmed.'},
        'fields': ['id', 'name', 'lon', 'lat', 'provinceCode', 'districtCode', 'group', 'state'],
        'rows': sorted(pending, key=lambda r: r[0]),
    }, ensure_ascii=False, separators=(',', ':')))
    d_geo, p_geo = simplify(districts_geojson, district_meta, args.mapshaper, args.simplify)
    d_geo['metadata'] = {'source': meta['boundary'], 'simplified': f'mapshaper {args.simplify}% keep-shapes (display only; membership uses full resolution)',
                         'features': len(d_geo['features'])}
    from shapely.ops import unary_union
    prov_geoms = defaultdict(list)
    for d, g in zip(district_meta, district_geoms):
        prov_geoms[d['province']].append(g)
    for f in p_geo['features']:
        code = f['properties']['pro_code']
        pm = next(p for p in prod_provinces if p['code'] == code)
        rp = unary_union(prov_geoms[pm['abbrEn']]).representative_point()
        f['properties'] = {'code': pm['abbrEn'], 'dopa': code, 'th': pm['nameTh'], 'en': pm['nameEn'],
                           'areaKm2': round(prov_area[pm['abbrEn']], 3), 'prodId': pm['id'],
                           'labelLon': round(rp.x, 5), 'labelLat': round(rp.y, 5)}
    p_geo['metadata'] = {'source': meta['boundary'], 'dissolvedFrom': 'data/districts.geojson', 'features': len(p_geo['features'])}
    (DATA / 'districts.geojson').write_text(json.dumps(d_geo, ensure_ascii=False, separators=(',', ':')))
    (DATA / 'provinces.geojson').write_text(json.dumps(p_geo, ensure_ascii=False, separators=(',', ':')))
    (DATA / 'venue-buildings.geojson').write_text(json.dumps({
        'type': 'FeatureCollection',
        'metadata': {'as_of': (host.get('metadata') or {}).get('checked_on'), 'scope': 'Qualified retained host context, not national building coverage',
                     'geometry_license': 'ODbL-1.0 (OpenStreetMap-derived) unless a feature states otherwise',
                     'attribution': '© OpenStreetMap contributors', 'attribution_url': 'https://www.openstreetmap.org/copyright',
                     'height_rendering': 'Parts use selected_base_m/selected_top_m; a parent with parts is an outline; '
                                         'unknown or disputed height keeps height_m null and uses a 3 m display fallback.',
                     'fallback_height_m': 3, 'features': len(buildings), 'venues': counts['buildingVenues'],
                     'rights_note': 'Bundle README: CityMETER production availability does not by itself establish an open '
                                    'redistribution licence; feature licence fields are retained.'},
        'features': buildings,
    }, ensure_ascii=False, separators=(',', ':')))

    # Review file for the next refresh (not loaded by the page): every status value and the rule that read it,
    # the coordinate vocabulary of qualified rows, and the evidence types that only a keyword rule placed.
    report = {
        'asOf': as_of, 'generatedAt': generated, 'inputs': inputs,
        'qualificationVocabulary': [{'status': st, 'tier': tier, 'rule': rule, 'rows': n}
                                    for (st, tier, rule), n in sorted(vocab.items(), key=lambda x: (x[0][1], -x[1], x[0][0]))],
        'coordinateVocabulary': [{'status': st, 'role': role, 'located': loc, 'rows': n}
                                 for (st, role, loc), n in sorted(coord_vocab.items(), key=lambda x: -x[1])],
        'countRoleVocabulary': [{'role': role, 'kind': kind, 'rows': n}
                                for (role, kind), n in sorted(role_vocab.items(), key=lambda x: (x[0][1], -x[1]))],
        'keywordMappedTypes': meta['checks']['keywordMappedTypes'],
        'componentsWithoutParent': orphans,
        'geometryLinksWithoutFeature': sorted(missing_geom),
        'review': [
            'qualificationVocabulary rule "fallback": new status values; add them to qualification_rule() before publishing.',
            'countRoleVocabulary kind "fallback": new count_role values of qualified rows (not counted); classify them in '
            'COUNTED_ROLES, COMPONENT_ROLES or HELD_ROLES before publishing.',
            'keywordMappedTypes with qualified=true: add the venue_type to TYPE_TO_GROUP so the group basis is "evidence".',
            'coordinateVocabulary: confirm every status/role read as located is a selected reference point.',
            'componentsWithoutParent: retail components whose parent is not qualified are counted nowhere.',
        ],
    }
    write_json(DATA / 'build-report.json', report)
    print(json.dumps({'counts': counts, 'aha': aha, 'problems': problems[:10], 'remapped': remapped,
                      'keywordQualified': {t: g for (q, t, g), n in unmapped_types.items() if q},
                      'qualificationFallback': meta['checks']['qualificationFallback'],
                      'countRoleFallback': meta['checks']['countRoleFallback'],
                      'orphans': len(orphans), 'missingGeom': sorted(missing_geom),
                      'detailShards': n_shards}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()

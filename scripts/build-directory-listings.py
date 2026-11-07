#!/usr/bin/env python3
"""Shops as each centre's own official directory lists them (D38, owner 7 Nov 2026 23:49: “รับครับ”).

  python3 -I scripts/build-directory-listings.py --directory <18_OFFICIAL_TENANTS.csv> --exported-on YYYY-MM-DD \
      [--receipt <private per-row receipt.csv>]

Input: the tab 18_OFFICIAL_TENANTS of the Research Master exported as UTF-8 CSV (an internal working file; only its
SHA-256, size, row count and export date are published). Output, beside the brand roster and never inside it
(data/tenants/ and its receipts stay byte-identical):
  data/directory/NN.json        32 shards, FNV-1a of the venue id mod 32 (the same function as data/tenants/)
  data/directory/counts.json    per venue: directory-only items and their roles (shop counts on the map, table, areas)
  data/directory/build-report.json  input receipt, every row's disposition by reason, coverage per venue

Rule (the owner accepted Claude's proposal, 7 Nov 2026 23:49): a shop the centre's own official directory lists is
shown at once, under the name the centre gives it, with floor, unit, category, check date and source link — no brand
match needed. Not shown: department-store brand counters, held rows (counters or unresolved counter formats, repeated
source views, events, public spaces, amenities, shared or department formats, unnamed operators, consumer-visibility
holds), coming-soon rows, facilities (toilets, ATMs, parking, information, lifts, prayer and baby rooms, lockers) and
repeats of the same name, floor and unit. One hold is not a reason to hide: a row held only until the sheet splits a
venue's components (relationship_status parent_component_scope_held) is shown at that venue when the registry counts
the whole complex as one venue with no registered components (Central Phuket: Festival and Floresta).
A directory entry that the brand roster already shows at the venue is not shown twice: matched by the directory
observation id or the linked outlet id first, then by the same name on the same floor (a brand on more floors than
the roster lists adds the other floors — owner D23, 4 Nov 2026 21:24). A row whose host is a retail component of a
counted parent (One Bangkok's Parade, The Storeys) is shown at the parent and keeps registeredChildVenueId.
A brand match that the sheet confirmed (brand_match_status registry_brand_membership_linked, one matched brand) adds
the brand id and its verified logo; candidates never do. Directory entries are what the centre lists on the check
date: not field-verified operation, not a legal tenant, not a physical-shop census.
The optional --receipt writes one line per directory row (observation id → shown item, already shown, or held and
why) for the research sheet's public_projection_status; it stays outside this repository.
"""
import argparse
import collections
import csv
import hashlib
import json
import re
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
SHARDS = 32
DATASET = 'research.TH.shopping_directory'
SOURCE_ROLE = 'official_venue_directory_listing'
PRIVATE_HOSTS = re.compile(r'(^|\.)(docs|drive|sheets)\.google\.com$|googleusercontent\.com$|^localhost$|\.local$|\.internal$', re.I)
COUNTER = 'product_counter_identity_not_independent_outlet'
HELD_OBSERVATION = 'held_source_observation_not_additive_outlet'
LINKED_BRAND = 'registry_brand_membership_linked'
NOT_A_SHOP = 'not_a_brand_service_or_facility'
# A hold that only waits for the sheet to split a venue's own components (Central Phuket: Festival and Floresta). Where
# the registry has one counted venue for the whole complex and no registered components, the entry is shown there.
COMPONENT_SCOPE_HOLD = ('held_counter_or_component', 'parent_component_scope_held')
# Facilities of the centre itself. English words count only at the start of the listed name (so “Foot Locker” stays a
# shop) or as a whole phrase; Thai words anywhere; an ATM never is a shop (a bank branch is).
FACILITY_START = re.compile(r'^\W*(atm|cdm|adm|toilets?|restrooms?|wc|parking|car ?park|information|lifts?|elevators?|escalators?|'
                            r'lockers?|nursery|baby|prayer|musall?a|first aid|smoking|drop[ -]?off|taxi|bus stop|charging)\b', re.I)
FACILITY_ANY = re.compile(r'\b(atm|cdm|adm)\b|customer (service|relations?)|information (counter|desk|center|centre)|'
                          r'mother ?(&|and) ?baby|baby (care|room|changing)|prayer room|charging station|'
                          r'ตู้เอทีเอ็ม|ตู้ฝาก|ห้องน้ำ|สุขา|ที่จอดรถ|ลานจอดรถ|ประชาสัมพันธ์|ลิฟต์|บันไดเลื่อน|ห้องละหมาด|ห้องให้นม|'
                          r'ห้องแม่และเด็ก|ล็อกเกอร์|ห้องปฐมพยาบาล|จุดจอดแท็กซี่|ป้ายรถเมล์|ห้องสูบบุหรี่', re.I)


def is_facility(label):
    return bool(FACILITY_START.search(label or '') or FACILITY_ANY.search(label or ''))


# Directory category → the shop roles of js/tenants.js (TENANT_ROLE_LABELS). First match wins; unknown reads “shop”.
ROLE_RULES = (
    ('department', r'department store|ห้างสรรพสินค้า'),
    ('grocery', r'super ?market|grocery|hypermarket|ซูเปอร์มาร์เก็ต'),
    ('destination', r'\bluxury\b|แบรนด์หรู'),
    ('food', r'food ?(&|and) ?beverage|\bf ?& ?b\b|food ?court|อาหารและเครื่องดื่ม'),
    ('cafe', r'cafe|café|coffee|dessert|bakery|\btea\b|bubble|กาแฟ|ขนม|เบเกอรี่'),
    ('dining', r'food|dining|restaurant|gourmet|market hall|eatery|อาหาร'),
    ('clinic', r'clinic|คลินิก'),
    ('beauty', r'beauty|cosmetic|skin ?care|fragrance|ความงาม|เครื่องสำอาง'),
    ('gold', r'gold|jewel|ทอง|อัญมณี'),
    ('optical', r'optic|eyewear|แว่น'),
    ('pharmacy', r'pharmac|drug ?store|ร้านขายยา'),
    ('sport', r'sport|outdoor|กีฬา'),
    ('fitness', r'fitness|\bgym\b|ฟิตเนส'),
    ('apparel', r'fashion|apparel|cloth|accessor|shoes?|bags?|lingerie|underwear|kids? ?wear|เสื้อผ้า|แฟชั่น|รองเท้า|กระเป๋า'),
    ('camera', r'camera|กล้อง'),
    ('technology', r'technolog|\bit\b|electronic|mobile|gadget|computer|telecom|ไอที|มือถือ|อิเล็กทรอนิกส์'),
    ('home', r'\bhome\b|d[ée]cor|furniture|bedding|kitchen|houseware|ของแต่งบ้าน|เฟอร์นิเจอร์'),
    ('bank', r'bank|financ|insurance|exchange|ธนาคาร|การเงิน'),
    ('entertainment', r'entertainment|cinema|karaoke|bowling|\bgames?\b|ความบันเทิง|โรงภาพยนตร์'),
    ('family', r'edutainment|\bkids?\b|children|\btoys?\b|playground|education|learning|tutor|ของเล่น|การศึกษา'),
    ('spa', r'\bspas?\b|massage|นวด'),
    ('hair', r'salon|\bhair|barber|ทำผม'),
    ('nail', r'\bnails?\b'),
    ('convenience', r'convenience|mini ?mart|ร้านสะดวกซื้อ'),
    ('pet', r'\bpets?\b|สัตว์เลี้ยง'),
    ('car', r'automotive|car care|car service|ยานยนต์'),
)
ROLES = [(role, re.compile(rx, re.I)) for role, rx in ROLE_RULES]
# Where the centre gives no usable category ('shop'), or files a shop under its broad 'Entertainment' heading, the role of
# the industry dataset whose brand list has exactly this name (the sheet's candidate_dataset_ids), when every such dataset
# reads the same role. A display grouping only: the entry gets no brand id, logo or brand search from it.
DATASET_ROLE = {
    'research.TH.fitness': 'fitness', 'research.TH.apparel': 'apparel', 'research.TH.sport': 'sport', 'research.TH.furniture': 'home',
    'research.TH.pet': 'pet', 'research.TH.massage_spa': 'spa', 'research.TH.salon_barber': 'hair', 'research.TH.nail': 'nail',
    'research.TH.beauty': 'beauty', 'research.TH.beauty_clinic': 'clinic', 'research.TH.playground': 'family',
    'research.TH.car_service': 'car', 'research.TH.restaurants': 'dining', 'research.TH.bank': 'bank', 'research.TH.gold': 'gold',
    'research.TH.optical': 'optical', 'research.TH.pharmacy': 'pharmacy', 'research.TH.camera': 'camera',
    'research.TH.grocery': 'grocery', 'research.TH.luxury': 'destination',
}
UUIDISH = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-f]{20,}$', re.I)


def shard_of(value):
    h = 0x811c9dc5
    for b in str(value).encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xffffffff
    return h % SHARDS


def norm(value):
    """Name key for “the same entry”: NFKC, lower case, no spaces or punctuation (display and dedupe only)."""
    text = unicodedata.normalize('NFKC', str(value or '')).lower()
    # drop separators, punctuation and symbols; keep letters, digits and Thai vowel/tone marks (category M)
    return ''.join(ch for ch in text if unicodedata.category(ch)[0] in 'LMN')


def floor_key(value):
    text = norm(value)
    text = re.sub(r'^(floor|fl|ชั้น)', '', text)
    text = re.sub(r'(floor|fl|ชั้น)$', '', text)
    text = re.sub(r'^(\d+)(st|nd|rd|th)$', r'\1', text)
    return {'g': 'g', 'gf': 'g', 'ground': 'g'}.get(text, re.sub(r'^(\d+)f$', r'l\1', re.sub(r'^(\d+)$', r'l\1', text)))


FLOOR_PATTERNS = tuple(re.compile(rx, re.I) for rx in (
    r'(?:ชั้น|floor|level|\bfl\.?)\s*(B\d|LG|UG|GF|G|M|L?\d{1,2}F?)(?!\d)',
    r'(\d{1,2})(?:st|nd|rd|th)\s*floor',
    r'\b(B\d|LG|UG|GF|G|M|L\d{1,2}|\d{1,2}F?)\s*FL\b',
    r'^\s*(B\d|LG|UG|GF|G|M|L\d{1,2}|\d{1,2}F|\d{1,2})(?![\d/\-])\b',
    r'/\s*(B\d|LG|UG|GF|G|M|L\d{1,2})\s*$',
))


def roster_floor(text):
    """The floor a roster item names in its unit/floor text ('' when it names none; a bare unit code names none)."""
    t = unicodedata.normalize('NFKC', str(text or ''))
    for rx in FLOOR_PATTERNS:
        m = rx.search(t)
        if m:
            return floor_key(m.group(1))
    return ''


GENERIC = re.compile(r'\b(the|restaurants?|coffee|caf[eé]|shop|store|official|thailand|by)\b', re.I)


def loose(value):
    key = norm(GENERIC.sub(' ', unicodedata.normalize('NFKC', str(value or '')).lower()))
    key = key[:-1] if key.endswith('s') and len(key) > 4 else key
    return key if len(key) >= 2 else ''


def iso_date(value):
    text = str(value or '').strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
        return text
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', text)  # the sheet's US-style display date
    return date(int(m[3]), int(m[1]), int(m[2])).isoformat() if m else ''


CREDENTIAL = re.compile(r'api[_-]?key|access[_-]?token|token=|password|passwd|(?<![a-z])secret=|signature=|x-amz-', re.I)


def public_url(value):
    text = str(value or '').strip()
    if not text or len(text.split()) != 1:
        return ''
    p = urlparse(text)
    if p.scheme != 'https' or not p.netloc or PRIVATE_HOSTS.search(p.hostname or '') or CREDENTIAL.search(text):
        return ''
    return text


def role_of(category, label):
    text = f'{category} {label}'
    for role, rx in ROLES:
        if rx.search(category or ''):
            return role
    for role, rx in ROLES:  # a category the directory leaves blank: the listed name, conservatively
        if role in ('grocery', 'cafe', 'pharmacy', 'optical', 'bank', 'gold') and rx.search(label or ''):
            return role
    return 'shop'


# The directories' broad 'Entertainment' heading also holds toy, music, sport and gym shops; the role (and so the list
# order, where entertainment sits next to the department stores) follows the name: places people go to be entertained,
# kids' play and game centres, gyms; anything else is read as a shop below.
ENTERTAINMENT_VENUE = re.compile(r'\bcine|cinema|imax|\bsfx?\b|\begv\b|major|entertainment|karaoke|bowl|\bvr\b|escape|board ?game|'
                                 r'theat(er|re)|concert|โรงภาพยนตร์|คาราโอเกะ|โบว์ลิ่ง', re.I)
KIDS_PLAY = re.compile(r'harbou?r ?land|kidzoo+na|joyliday|wonderland|playmondo|play ?square|play ?land|buddy ?land|panda ?land|'
                       r'yoyo ?land|fun ?(station|city|zone)|bounce|trampoline|eat ?& ?play|game ?zone|arcade|candy ?land|\b5d\b|skate|'
                       r'เครื่องเล่น|สวนสนุก', re.I)
GYM = re.compile(r'fitness|\bgym\b|jetts|virgin active|health clubs?|pilates|yoga|ฟิตเนส', re.I)


def entry_role(category, label, rows):
    role = role_of(category, label)
    if role == 'entertainment':
        if ENTERTAINMENT_VENUE.search(label or ''):
            return 'entertainment'
        if KIDS_PLAY.search(label or ''):
            return 'family'
        if GYM.search(label or ''):
            return 'fitness'
        role = 'shop'
    if role != 'shop':
        return role
    datasets = {x.strip() for r in rows for x in (r.get('candidate_dataset_ids') or '').split('|') if x.strip()}
    roles = {DATASET_ROLE.get(d) for d in datasets}
    return roles.pop() if len(roles) == 1 and None not in roles else role


def floor_code(raw):
    """The floor as a short code for display: 'G FL. Unit 1G04' → 'G', '3rd Floor' → '3', 'Level 2' → '2', 'L 1' → 'L1'."""
    text = unicodedata.normalize('NFKC', str(raw or '')).strip()
    t = re.sub(r'^[^\w]+', '', text)                       # a stray mark before the code (e.g. U+0E3A)
    t = re.sub(r'\s*\bunit\b.*$', '', t, flags=re.I)        # a unit the floor cell also carries
    t = re.sub(r'^(?:ชั้น|floor|level|fl\.?)\s*', '', t, flags=re.I)
    t = re.sub(r'\s*(?:fl\.?|floor)\s*$', '', t, flags=re.I)
    t = re.sub(r'^(\d+)(?:st|nd|rd|th)$', r'\1', t, flags=re.I)
    t = re.sub(r'^L\s+(\d+)$', r'L\1', t, flags=re.I)
    if re.fullmatch(r'[0-9A-Za-z\-]+', t):
        t = t.upper()
    return t if t and len(t) <= 10 else text


def floor_order(code):
    k = floor_key(code)
    m = re.fullmatch(r'b(\d*)f?', k)
    if m:
        return (-100 - int(m[1] or 1), k)
    if k in ('lg', 'gl'):
        return (-2, k)
    if k in ('g', 'gm', 'm', 'mf', 'ug'):
        return ({'g': 0, 'gm': 0.3, 'm': 0.5, 'mf': 0.5, 'ug': 0.7}[k], k)
    m = re.fullmatch(r'l?(\d+)(.*)', k)
    return (int(m[1]) + (0.5 if m[2] else 0), k) if m else (1000, k)


def floors_text(values):
    """One entry on several floors (a department store): 'ชั้น G, L1, L2' — each floor once, lowest first."""
    codes = {}
    for value in values:
        for part in re.split(r'\s*\|\s*', str(value or '')):
            code = floor_code(part)
            if code:
                codes.setdefault(floor_key(code), code)
    return 'ชั้น ' + ', '.join(codes[k] for k in sorted(codes, key=lambda k: floor_order(codes[k]))) if codes else ''


def floor_text(floor, unit):
    floor, unit = str(floor or '').strip(), str(unit or '').strip()
    if unit and (UUIDISH.search(unit) or len(unit) > 18):
        unit = ''  # a publisher's internal element id is not a unit number
    parts = []
    if '|' in floor:
        parts.append(floors_text([floor]))
    elif floor_code(floor):
        parts.append(f'ชั้น {floor_code(floor)}')
    if unit:
        parts.append(unit if re.search(r'ยูนิต|unit|ห้อง|room', unit, re.I) else f'ยูนิต {unit}')
    return ' · '.join(p for p in parts if p)


RECEIPT_OUTCOME = {'shown': 'shown_as_directory_item', 'represented': 'already_shown_by_brand_roster', 'held': 'held'}
RECEIPT_HELD = {
    'department_store_counter': 'held_department_store_counter_not_outlet',
    'held_source_observation': 'held_source_observation_not_additive_outlet',
    'coming_soon_not_confirmed_open': 'held_planned_coming_soon_not_confirmed_open',
    'centre_facility_not_a_shop': 'held_centre_facility_not_a_shop',
    'no_listed_name': 'held_no_listed_name',
    'no_public_source_link': 'held_no_public_source_link',
    'host_not_in_public_venue_set': 'held_host_not_in_public_venue_set',
    'host_held_without_counted_parent': 'held_host_without_counted_parent',
}


def receipt_status(outcome, reason, before):
    """The public_projection_status the research sheet records for a row after this build."""
    if outcome == 'shown':
        return 'published_as_venue_directory_listing'
    if outcome == 'represented':
        return 'published_via_existing_brand_roster_listing'
    if before.startswith('held_'):
        return before  # the sheet's own hold stays as the sheet wrote it
    return RECEIPT_HELD.get(reason, 'held_' + reason)


def roster_keys(item):
    keys = {item.get('id'), item.get('sourceRowKey')}
    keys.update(item.get('sourceObservationIds') or [])
    keys.update(item.get('matchedSourceStoreIds') or [])
    for proof in item.get('sourceEvidence') or []:
        keys.update({proof.get('sourceObservationId'), proof.get('sourceRowKey')})
    for nested in item.get('corroboratingMembershipEvidence') or []:
        keys |= roster_keys(nested)
    if item.get('id') and ':' in item['id']:
        keys.add(item['id'].rsplit(':', 1)[-1])
    return {k for k in keys if k}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--directory', required=True, help='18_OFFICIAL_TENANTS exported as UTF-8 CSV')
    ap.add_argument('--exported-on', required=True)
    ap.add_argument('--data', default=str(ROOT / 'data'))
    ap.add_argument('--logos', default=str(ROOT / 'assets' / 'tenant-logos-manifest.json'))
    ap.add_argument('--receipt', help='private CSV: one line per directory row with its disposition')
    ap.add_argument('--release', default='', help='the page release this receipt belongs to (receipt only)')
    a = ap.parse_args()
    data = Path(a.data)
    raw = Path(a.directory).read_bytes()
    csv.field_size_limit(10 ** 9)
    rows = list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
    venues = {r['id']: r for r in json.loads((data / 'venues.json').read_text())['rows']}
    logos = json.loads(Path(a.logos).read_text()) if Path(a.logos).exists() else {}

    roster = {}
    for n in range(SHARDS):
        for vid, v in json.loads((data / 'tenants' / f'{n:02d}.json').read_text())['venues'].items():
            roster[vid] = v['items']

    def component_scope_only(r):
        host = venues.get(r['venue_id'].strip())
        return ((r['public_projection_status'], r['relationship_status']) == COMPONENT_SCOPE_HOLD
                and bool(host and host.get('countable')) and not host.get('children') and not r['parent_venue_id'].strip())

    def host_of(r):
        vid = r['venue_id'].strip()
        row = venues.get(vid)
        if not row:
            return None, None, 'host_not_in_public_venue_set'
        if row.get('countable'):
            return vid, None, ''
        parent = venues.get(row.get('parentId') or r.get('parent_venue_id', '').strip())
        if parent and parent.get('countable'):
            return parent['id'], vid, ''
        return None, None, 'host_held_without_counted_parent'

    disposition, groups = {}, collections.OrderedDict()
    for r in rows:
        oid = r['observation_id'].strip()
        label = r['tenant_label'].strip()
        reason = ''
        if r['outlet_match_status'] == COUNTER:
            reason = 'department_store_counter'
        elif r['public_projection_status'].startswith('held_') and not component_scope_only(r):
            reason = r['public_projection_status']
        elif r['count_role'] == HELD_OBSERVATION:
            reason = 'held_source_observation'
        elif 'coming_soon' in r['operation_status']:
            reason = 'coming_soon_not_confirmed_open'
        elif r['brand_match_status'] == NOT_A_SHOP or is_facility(label):
            reason = 'centre_facility_not_a_shop'
        elif not label:
            reason = 'no_listed_name'
        elif not (public_url(r['detail_url']) or public_url(r['source_url'])):
            reason = 'no_public_source_link'
        if not reason:
            host, child, reason = host_of(r)
        if reason:
            disposition[oid] = ('held', reason, '')
            continue
        if role_of(r['category_raw'], label) == 'department' or re.search(r'department store|ห้างสรรพสินค้า', label, re.I):
            key = (host, norm(label), '', '')  # one department store across its floors
        else:
            key = (host, norm(label), floor_key(floor_code(r['floor_raw'])), norm(r['unit_raw']))
        groups.setdefault(key, {'host': host, 'child': child, 'rows': []})['rows'].append(r)

    by_host = collections.defaultdict(list)
    for key, g in groups.items():
        by_host[g['host']].append((key, g))

    shards = [dict() for _ in range(SHARDS)]
    counts, coverage = {}, []
    totals = collections.Counter()
    for host, entries in by_host.items():
        items = roster.get(host, [])
        item_keys = [roster_keys(i) for i in items]
        # Each roster item answers at most one directory entry: by identity first, then by the same name on the same
        # floor, else by the same name where the roster gives no floor. Names: exact key, then the loose key.
        slots = collections.defaultdict(list)
        for idx, i in enumerate(items):
            floor = roster_floor(i.get('unitFloor') or i.get('branch') or '')
            texts = (i.get('brand'), i.get('displayName'), (i.get('name') or '').split(' · ')[0])
            names = {norm(t) for t in texts} | {'~' + loose(t) for t in texts if loose(t)}
            if i.get('brandId') and i.get('dataset'):
                names.add(f"B:{i['dataset']}:{i['brandId']}")
            for name in names:
                if name and name != '~':
                    slots[name].append((floor, idx))
        used = set()

        def identity_of(g):
            wanted = {r['observation_id'].strip() for r in g['rows']}
            wanted |= {x.strip().split(':', 1)[-1] for r in g['rows'] for x in (r['matched_outlet_ids'] or '').split('|') if x.strip()}
            return [idx for idx, k in enumerate(item_keys) if k & wanted]

        def take(label, floor, brands=()):
            for key in (norm(label), '~' + loose(label) if loose(label) else '', *(f'B:{b}' for b in sorted(brands))):
                free = [(f, idx) for f, idx in slots.get(key, []) if idx not in used]
                for want in (floor, ''):
                    for f, idx in free:
                        if f == want:
                            used.add(idx)
                            return idx
            return None

        added, represented = [], 0
        matched = {key: identity_of(g) for key, g in entries}
        ordered = sorted(entries, key=lambda e: not matched[e[0]])
        for key, g in ordered:
            floor = key[2]
            ids = [r['observation_id'].strip() for r in g['rows']]
            label_text = g['rows'][0]['tenant_label'].strip()
            shown_by = None
            if matched[key]:
                used.update(matched[key])
                verdict, shown_by = 'shown_by_roster_identity', matched[key][0]
            else:
                # the same name — or a brand the sheet links or proposes for this row — on the same floor (or the
                # roster gives none): a display rule against listing one shop twice, never an identity merge
                shown_by = take(label_text, floor, {x.strip() for r in g['rows'] for x in (r['matched_brand_ids'] or '').split('|') if x.strip()})
                verdict = 'shown_as_directory_item' if shown_by is None else 'shown_by_roster_name_floor'
            if verdict != 'shown_as_directory_item':
                represented += 1
                for oid in ids:
                    disposition[oid] = ('represented', verdict, items[shown_by].get('id', ''))
                continue
            first = g['rows'][0]
            label = label_text
            categories = collections.Counter(r['category_raw'].strip() for r in g['rows'] if r['category_raw'].strip())
            category = categories.most_common(1)[0][0] if categories else ''
            checked = max((iso_date(r['checked_on']) for r in g['rows']), default='')
            url = next((public_url(r['detail_url']) or public_url(r['source_url']) for r in g['rows']
                        if public_url(r['detail_url']) or public_url(r['source_url'])), '')
            linked = [r['matched_brand_ids'].strip() for r in g['rows']
                      if r['brand_match_status'] == LINKED_BRAND and r['matched_brand_ids'].strip() and '|' not in r['matched_brand_ids']]
            brand_id = linked[0] if linked and len(set(linked)) == 1 else ''
            item = {
                'id': f'{DATASET}:18_OFFICIAL_TENANTS:{ids[0]}',
                'name': label,
                'brand': label,
                'category': category,
                'directoryRole': entry_role(category, label, g['rows']),
                # one floor however each publisher spells it ('G Floor', 'GF'), else every floor once (a department store)
                'unitFloor': (floor_text(first['floor_raw'], first['unit_raw'])
                              if len({floor_key(floor_code(r['floor_raw'])) for r in g['rows']}) == 1
                              else floors_text(r['floor_raw'] for r in g['rows'])),
                'dataset': DATASET,
                'sourceRole': SOURCE_ROLE,
                'sourceUrl': url,
                'checkedOn': checked,
                'status': first['operation_status'].strip(),
                'sourceObservationIds': ids,
                'sourceObservationCount': len(ids),
            }
            if g['child']:
                item['registeredChildVenueId'] = g['child']
                item['displayQualifier'] = f"ใน {venues[g['child']]['name']}"
            if brand_id:
                dataset_id, _, brand = brand_id.partition(':')
                item['brandId'] = brand_id
                item['brandLinked'] = True
                logo = logos.get(f'{dataset_id}|{brand}')
                if logo and logo.get('file') and logo.get('sha256'):
                    item['logo'] = {k: logo[k] for k in ('file', 'sha256', 'mime', 'width', 'height', 'background') if k in logo}
            added.append(item)
            for oid in ids:
                disposition[oid] = ('shown', 'directory_item', item['id'])
        if added:
            added.sort(key=lambda i: (i['name'].lower(), i['unitFloor'], i['id']))
            shards[shard_of(host)][host] = {'items': added, 'entries': len(added)}
            roles = collections.Counter(i['directoryRole'] for i in added)
            counts[host] = {'items': len(added), 'roles': dict(sorted(roles.items()))}
        totals['groups'] += len(entries)
        totals['represented'] += represented
        totals['added'] += len(added)
        coverage.append({'venueId': host, 'name': venues[host]['name'], 'directoryEntries': len(entries),
                         'shownByRoster': represented, 'directoryItems': len(added), 'rosterItems': len(items),
                         'shownTotal': len(items) + len(added)})

    data_dir = data / 'directory'
    data_dir.mkdir(exist_ok=True)
    checked = sorted(i['checkedOn'] for v in shards for e in v.values() for i in e['items'] if i['checkedOn'])
    meta = {'schemaVersion': '1', 'asOf': a.exported_on, 'dataset': DATASET, 'shards': SHARDS, 'rule': 'D38',
            'items': totals['added'], 'venues': len(counts),
            'checkedFrom': checked[0] if checked else '', 'checkedTo': checked[-1] if checked else '',
            'source': 'official centre directories collected in the Research Master (18_OFFICIAL_TENANTS)',
            'scope': 'directory entries not already shown by the brand roster; listed names, not field-verified shops'}
    for n, venues_in in enumerate(shards):
        body = {'meta': meta, 'venues': dict(sorted(venues_in.items()))}
        (data_dir / f'{n:02d}.json').write_text(json.dumps(body, ensure_ascii=False, separators=(',', ':')) + '\n')
    (data_dir / 'counts.json').write_text(json.dumps({'meta': meta, 'venues': dict(sorted(counts.items()))},
                                                     ensure_ascii=False, separators=(',', ':')) + '\n')
    reasons = collections.Counter(v[1] for v in disposition.values())
    report = {
        'asOf': a.exported_on, 'rule': 'D38', 'dataset': DATASET,
        'input': {'tab': '18_OFFICIAL_TENANTS', 'exportedOn': a.exported_on, 'bytes': len(raw),
                  'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(rows),
                  'hosts': len({r['venue_id'] for r in rows})},
        'rosterSha256': hashlib.sha256(b''.join((data / 'tenants' / f'{n:02d}.json').read_bytes() for n in range(SHARDS))).hexdigest(),
        'venueCoreSha256': hashlib.sha256((data / 'venues.json').read_bytes()).hexdigest(),
        'rows': {'shownAsDirectoryItems': sum(1 for v in disposition.values() if v[0] == 'shown'),
                 'alreadyShownByRoster': sum(1 for v in disposition.values() if v[0] == 'represented'),
                 'held': sum(1 for v in disposition.values() if v[0] == 'held'),
                 'byReason': dict(sorted(reasons.items(), key=lambda x: -x[1]))},
        'entries': {'directoryEntries': totals['groups'], 'shownByRoster': totals['represented'], 'directoryItems': totals['added']},
        'venues': len(counts),
        'coverage': sorted(coverage, key=lambda c: (-c['directoryEntries'], c['venueId'])),
        'unit': 'one entry = one listed name on one floor and unit of one centre; repeats of the same name, floor and unit are one entry',
        'limits': [
            'Names as the centre lists them on the check date; not field-verified operation, a legal tenant or a sales figure.',
            'A directory omission is not a closure; a centre without a collected directory has no directory items.',
            'Same-name matching against the brand roster is a display rule, not an identity merge; the research sheet keeps both records.',
            'Brand ids and logos only for brand matches the sheet confirmed; candidates stay unlinked.',
        ],
    }
    (data_dir / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if a.receipt:
        # One line per exported row, for the research sheet's public_projection_status (the sheet copies the value of
        # public_projection_status only while the row still holds exported_public_projection_status).
        with open(a.receipt, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['observation_id', 'venue_id', 'exported_public_projection_status', 'public_projection_status',
                        'web_outcome', 'reason', 'web_item_id', 'web_release', 'exported_on'])
            for r in rows:
                oid = r['observation_id'].strip()
                outcome, reason, item = disposition.get(oid, ('held', 'not_read', ''))
                before = r['public_projection_status'].strip()
                w.writerow([oid, r['venue_id'].strip(), before, receipt_status(outcome, reason, before),
                            RECEIPT_OUTCOME[outcome], reason, item, a.release, a.exported_on])
    print(json.dumps({'rows': report['rows'], 'entries': report['entries'], 'venues': report['venues']}, ensure_ascii=False))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Review the host links that research datasets recorded only as candidates — accept a row only on evidence.

Owner, 4 Nov 2026 21:23: “ช่วย research ให้ดี ผูกกับศูนย์การค้าให้ถูกต้อง อย่าเดา” (research carefully, link to the
right shopping centre, do not guess). Used by scripts/link-research-tenants.py for Beauty, Beauty Clinic, Playground and
Car Service, whose sheets name a candidate registry venue (common_retail_venue_candidate_ids) but never confirmed it.

A candidate row is accepted only when every check below holds; otherwise it stays a candidate and the review log says why.
  1. The dataset's own vocabulary says the row is a current listing in approved scope that counts (adapter `require`).
  2. Official source: the row's source URL is on the brand's own domain (its brands-tab URLs or a brand-name token in
     the host name) or on a registry venue's own website (the host's directory); campaign pages, directories and
     aggregators are not official.
  3. Host label: the branch label the source publishes (store_name and venue — never the street address) contains a
     name of the candidate venue — its registry Thai or English name or alias, a name the registry crosswalk (R04)
     resolved to it by identity, or a label another research dataset's sheet matched to it — and every other venue
     named in that label is the candidate itself, its parent, its child or a sibling component. Chain words alone
     (Central, Lotus's, Big C …) are never a host name. A label that places the shop before, near, opposite or outside
     the host (“ก่อนถึงเซ็นทรัลบางนา”) names a landmark, not the place, and stays a candidate.
  4. Province: when the row states a province it is the candidate's province.
  5. Point: when the row has its own point it lies within FAR_M of the venue point or inside the venue's host building
     footprint (+ FOOTPRINT_BUFFER_M).
Nothing is fuzzy-matched. Names are compared after one fixed normalisation (case, spaces, punctuation, the operators'
documented renamings in FOLD, Thai silent letters); CURATED_ALIASES adds official names with their public source. A
misspelt or differently named host stays a candidate (listed for the research team).
"""
import csv
import collections
import json
import math
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

FAR_M = 300
FOOTPRINT_BUFFER_M = 50
MIN_ALIAS = 6

# Folding applied to labels and names alike; only words that never identify a place, and the operators' own renamings:
# Central Pattana dropped “Plaza” and “Festival” from its mall names (Central Pattaya was CentralFestival Pattaya Beach,
# Central Chiang Mai Airport was CentralPlaza Chiang Mai Airport — en.wikipedia.org/wiki/Central_Pattaya,
# /wiki/Central_Chiangmai_Airport); The Mall Group renamed The Mall to The Mall Life Store (IADS member news, May 2023).
FOLD = (('เมกะ', 'เมกา'), ('centralplaza', 'central'), ('centralfestival', 'central'), ('เซ็นทรัลพลาซ่า', 'เซ็นทรัล'),
        ('เซ็นทรัลพลาซา', 'เซ็นทรัล'), ('เซ็นทรัลเฟสติวัล', 'เซ็นทรัล'), ('ไลฟ์สไตล์', ''), ('lifestyle', ''), ('ไลฟ์สโตร์', ''),
        ('lifestore', ''), ('ศูนย์การค้า', ''), ('ห้างสรรพสินค้า', ''), ('shoppingcenter', ''), ('shoppingcentre', ''),
        ('shoppingmall', ''), ('สาขา', ''), ('branch', ''), ('จังหวัด', ''), ('อำเภอ', ''))
# A consonant under the Thai silent mark (การันต์) is written or left out freely in transliterated names
# (เวสต์เกต · เวสท์เกต · เวสเกต); it is dropped from labels and names alike.
SILENT = re.compile('[ก-ฮ]์')


def norm(value):
    text = unicodedata.normalize('NFKC', str(value or '')).lower()
    text = re.sub(r"[\s​'’\"`.,·\-–—/()&@:;|!+#_*\[\]{}<>]+", '', text)
    for a, b in FOLD:
        text = text.replace(a, b)
    return SILENT.sub('', text)


# A label that places the shop before, near, opposite, beside, behind or outside the host uses the host as a landmark.
NEAR_HOST = tuple(sorted({norm(x) for x in (
    'ก่อนถึง', 'ใกล้', 'ใกล้กับ', 'ตรงข้าม', 'ฝั่งตรงข้าม', 'ข้าง', 'ข้างๆ', 'เยื้อง', 'หลัง', 'ถัดจาก', 'ติดกับ', 'หน้า', 'นอก',
    'near', 'nearby', 'opposite', 'oppositeto', 'nextto', 'behind', 'infrontof', 'across', 'acrossfrom', 'beside',
    'adjacentto', 'outside', 'closeto')}, key=len, reverse=True))

# Official names of a registry venue that its registry record does not carry, each with its public source (checked
# 4 Nov 2026). Location-qualified names only; a bare chain or area name never becomes an alias.
CURATED_ALIASES = (
    ('ฟิวเจอร์พาร์ค รังสิต', 'SC-007290', 'Future Park Rangsit (ฟิวเจอร์พาร์ค รังสิต), Thanyaburi, Pathum Thani — en.wikipedia.org/wiki/Future_Park_Rangsit; the registry venue is “Future Park & Zpell”, Pathum Thani'),
    ('Future Park Rangsit', 'SC-007290', 'same source'),
)


# A chain or generic word names many places; it is never a host name on its own.
GENERIC = {norm(x) for x in (
    'central', 'เซ็นทรัล', 'robinson', 'โรบินสัน', 'bigc', 'บิ๊กซี', 'bigcextra', 'lotuss', 'lotus', 'โลตัส', 'tops', 'ท็อปส์',
    'themall', 'เดอะมอลล์', 'makro', 'แม็คโคร', 'homepro', 'โฮมโปร', 'ptt', 'shell', 'esso', 'bangchak', 'บางจาก', 'ตลาด', 'market',
    'mall', 'plaza', 'พลาซ่า', 'departmentstore', 'outlet', 'premiumoutlet', 'mega', 'เมกา', 'icon', 'siam', 'สยาม',
    'centralfestival', 'gateway', 'communitymall', 'shoppingcenter', 'ศูนย์การค้า')}

# Hosts of campaign pages, business directories, social profiles and maps: not an official source of a branch.
# Shopping-centre operators' own directories (the host's official source for its tenants).
HOST_OPERATOR_DOMAINS = {'mcardmall.com', 'centralpattana.co.th', 'dg-directory-physical.cpn.co.th', 'cpn.co.th', 'onesiam.com', 'siampiwat.com'}
AGGREGATORS = {'wontech-asia.com', 'dataforthai.com', 'choose-zero.com', 'facebook.com', 'm.facebook.com', 'instagram.com', 'line.me',
               'lin.ee', 'google.com', 'goo.gl', 'maps.app.goo.gl', 'wongnai.com', 'tripadvisor.com', 'tiktok.com', 'youtube.com',
               'shopee.co.th', 'lazada.co.th', 'pantip.com', 'thaipr.net', 'setlink.set.or.th', 'lssmedia.setlink.set.or.th'}


def domain(url):
    host = (urlparse(str(url or '')).netloc or '').lower().split(':')[0]
    return host[4:] if host.startswith('www.') else host


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


def split_ids(value):
    return [x.strip() for x in re.split(r'[|;,\s]+', str(value or '')) if x.strip()]


class HostIndex:
    """Names of registry venues: registry names and aliases, identity-resolved crosswalk names, sheet-matched labels."""

    def __init__(self, venues, buildings=None):
        self.venues = venues
        self.alias = collections.defaultdict(set)
        self.sources = collections.defaultdict(set)
        self.footprints = collections.defaultdict(list)
        for f in (buildings or {}).get('features', []):
            for vid in f.get('properties', {}).get('venue_ids') or []:
                self.footprints[vid].append(f['geometry'])
        self.automaton = None
        for vid, r in venues.items():
            for name in [r.get('name'), r.get('nameEn'), *(r.get('aliases') or [])]:
                self.add(name, vid, 'registry')
        for name, vid, _source in CURATED_ALIASES:
            self.add(name, vid, 'curated')
        self.host_domains = {domain(r.get('website')) for r in venues.values() if r.get('website')} - {''}

    def add(self, name, vid, source):
        if vid not in self.venues:
            return
        # A fuel station's Thai name is “สาขา<road>”: a road, not a place name.
        if self.venues[vid].get('group') == 'fuel' and re.match(r'^\s*สาขา', str(name or '')):
            return
        key = norm(name)
        if len(key) < MIN_ALIAS or key in GENERIC:
            return
        self.alias[key].add(vid)
        self.sources[(key, vid)].add(source)
        self.automaton = None

    def add_crosswalk(self, rows):
        """R04 rows whose link status says the identity was resolved (by native or external id) to one venue."""
        for r in rows:
            ids = split_ids(r.get('common_retail_venue_ids'))
            if len(ids) == 1 and (r.get('common_retail_venue_link_status') or '').startswith('identity_resolved'):
                for name in (r.get('source_venue_name'), r.get('source_name_th')):
                    self.add(name, ids[0], 'crosswalk')

    def add_sheet_labels(self, rows, venue_field, accepted):
        """Host labels that a research dataset's own sheet matched to one registry venue (`accepted(row)`)."""
        for r in rows:
            ids = split_ids(r.get(venue_field))
            if len(ids) == 1 and r.get('venue') and accepted(r):
                self.add(r['venue'], ids[0], 'sheet')

    def _build(self):
        import ahocorasick
        a = ahocorasick.Automaton()
        for key, vids in self.alias.items():
            a.add_word(key, (key, frozenset(vids)))
        a.make_automaton()
        self.automaton = a

    def kin(self, a, b):
        if a == b:
            return True
        pa, pb = self.venues.get(a, {}).get('parentId'), self.venues.get(b, {}).get('parentId')
        return pa == b or pb == a or bool(pa and pa == pb)

    def resolve(self, label, candidate):
        """('named', alias) when the label names the candidate and no unrelated venue; else (reason, detail)."""
        if self.automaton is None:
            self._build()
        text = norm(label)
        hits = [(end - len(key) + 1, end, key, vids) for end, (key, vids) in self.automaton.iter(text)] if text else []
        if not hits:
            return 'no_registry_host_name_in_label', ''
        maximal = [h for h in hits if not any(o[0] <= h[0] and o[1] >= h[1] and (o[1] - o[0]) > (h[1] - h[0]) for o in hits)]
        if candidate not in set().union(*(h[3] for h in hits)):
            others = sorted(set().union(*(h[3] for h in maximal)))
            return 'label_names_another_venue', ' '.join(others[:3])
        unrelated = sorted({v for h in maximal for v in h[3] if not self.kin(v, candidate)})
        if unrelated:
            return 'label_also_names_another_venue', ' '.join(unrelated[:3])
        best = max((h for h in hits if candidate in h[3]), key=lambda h: h[1] - h[0])
        before = text[:best[0]]
        near = next((m for m in NEAR_HOST if before.endswith(m)), None)
        if near:
            return 'label_places_shop_beside_host', near
        return 'named', best[2]

    def point_check(self, own, vid):
        """(ok, metres to the venue point); inside the host footprint counts as ok whatever the distance."""
        v = self.venues.get(vid) or {}
        if None in own or v.get('lat') is None:
            return True, None
        d = distance_m(own, (v['lat'], v['lon']))
        if d <= FAR_M:
            return True, round(d)
        from shapely.geometry import Point, shape
        pt = Point(own[1], own[0])
        buffer_deg = FOOTPRINT_BUFFER_M / 111_320
        for g in self.footprints.get(vid, []):
            if shape(g).buffer(buffer_deg).covers(pt):
                return True, round(d)
        return False, round(d)


def official_source(url, brand_domains, host_domains, brand):
    """'brand' | 'host' when the URL is the brand's own or a registry venue's own website, else ''."""
    d = domain(url)
    if not d or d in AGGREGATORS or any(d.endswith('.' + a) for a in AGGREGATORS):
        return ''
    if d in brand_domains:
        return 'brand'
    if d in host_domains or d in HOST_OPERATOR_DOMAINS or any(d.endswith('.' + h) for h in HOST_OPERATOR_DOMAINS):
        return 'host'
    plain = unicodedata.normalize('NFKC', str(brand or '')).lower().split('/')[0]
    tokens = [t for t in re.split(r'[^a-z0-9]+', plain) if len(t) >= 4]
    whole = re.sub(r'[^a-z0-9]', '', plain)
    squashed = re.sub(r'[^a-z0-9]', '', d)
    if any(t in squashed for t in tokens if t not in ('clinic', 'beauty', 'thailand', 'store', 'shop', 'club', 'the', 'park', 'land', 'zone', 'service')):
        return 'brand'
    if len(whole) >= 4 and whole in squashed:
        return 'brand'
    return ''


def brand_domains(rows):
    """brand id → domains of the brand's own URLs in the brands tab (aggregators removed)."""
    out = collections.defaultdict(set)
    for r in rows:
        bid = (r.get('brand_id') or '').strip()
        for col in ('official_website', 'source_url', 'source_urls'):
            for url in re.findall(r'https?://[^\s|;,]+', r.get(col) or ''):
                d = domain(url)
                if d and d not in AGGREGATORS:
                    out[bid].add(d)
    return out


PROVINCE_TH = None


def province_code(thai_name, model_js):
    global PROVINCE_TH
    if PROVINCE_TH is None:
        PROVINCE_TH = {}
        for line in Path(model_js).read_text(encoding='utf-8').splitlines():
            m = re.search(r"code: '([A-Z]+)', dopa: '\d+', th: '([^']+)'", line)
            if m:
                PROVINCE_TH[m.group(2)] = m.group(1)
    name = re.sub(r'^(จังหวัด|จ\.)', '', str(thai_name or '').strip())
    return PROVINCE_TH.get(name) or PROVINCE_TH.get('กรุงเทพมหานคร' if name in ('กรุงเทพ', 'กรุงเทพฯ', 'Bangkok') else '')


def review(row, candidate, index, brand_dom, model_js, official_by_type=False):
    """(decision, reason, evidence) for one candidate row that already passed the dataset's own vocabulary.

    official_by_type: the dataset's own source_type already says the source is official (Beauty); otherwise the
    source URL must be the brand's or a host's own domain. The label is the published branch name (store_name); the
    sheet's `venue` column counts only when it is not a copy of the candidate's registry name (no circular match)."""
    if candidate not in index.venues:
        return 'kept_candidate', 'candidate_outside_public_registry', ''
    authority = 'brand' if official_by_type else official_source(
        row.get('source_url'), brand_dom.get((row.get('brand_id') or '').strip(), set()), index.host_domains, row.get('brand_name'))
    if not authority:
        return 'kept_candidate', 'source_not_official', domain(row.get('source_url'))
    result, detail = index.resolve(row.get('store_name') or '', candidate)
    v = index.venues[candidate]
    venue_label = row.get('venue') or ''
    if result == 'no_registry_host_name_in_label' and norm(venue_label) not in {norm(v.get('name')), norm(v.get('nameEn'))}:
        result, detail = index.resolve(venue_label, candidate)
    if result != 'named':
        return 'kept_candidate', result, detail
    prov = province_code(row.get('province'), model_js)
    if prov and index.venues[candidate].get('provinceCode') and prov != index.venues[candidate]['provinceCode']:
        return 'kept_candidate', 'province_differs', row.get('province') or ''
    ok, metres = index.point_check((number(row.get('latitude')), number(row.get('longitude'))), candidate)
    if not ok:
        return 'kept_candidate', 'own_point_far_from_venue', f'{metres} m'
    evidence = f'{authority} source · label “{detail}”' + (f' · point {metres} m' if metres is not None else ' · no own point')
    return 'accepted', 'official_label_unique_registry_name', evidence


def read_csv(path):
    csv.field_size_limit(10 ** 9)
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

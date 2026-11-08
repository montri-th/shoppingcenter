#!/usr/bin/env python3
"""Write data/venue-sites.json: the buildings of each checked multi-building site (campus style) as interior points.

  python3 scripts/build-venue-sites.py [--sites <CSV of the research site tab>] [--exported-on YYYY-MM-DD] [--staged]

Input: a CSV export of the research site tab SITE_BOUNDARY_CHECK (the columns of CityMETER · Hotel's
49_SITE_BOUNDARY_CHECK), filled with the campus-site-join workflow and scripts/site-candidates.mjs (by hand, or from a
reviewed draft of the OpenStreetMap outline: `draft`, boundary_source osm_outline; owner 2026-11-05 20:38): venue_id,
boundary_status, buildings_in_boundary ("lon,lat;lon,lat", one interior point per building), boundary_source,
boundary_evidence_url, checked_on. Only rows with boundary_status = checked are read.

Published per venue: the interior points, their count, the source in words, a public https layout link and the check
date. The boundary, deed numbers, parcel data, notes and reviewers stay in the sheet. A building more than 600 m from
the venue's own point, or a point outside Thailand, stops the build (a sheet error, not a site); so does a site point
in another venue's validated host footprint, or a building in the sites of two venues of different families (D42,
owner 2026-11-08 08:22: “เลือก Emporium แล้วมันขึ้น 2 อาคาร รวม EmQuatier ด้วย ต้องแยกกัน”).

Without --sites the file lists no site and the page draws none. The site tab opened on 5 Nov 2026 with no checked
row. --staged: the CSV is sites/site_rows.csv (rows that `site-candidates.mjs row` staged for the tab), not an export
of the tab — the meta says so (input.kind, status) until the tab holds the same rows and the file is rebuilt from its
export (owner 2026-11-05 23:57 “พี่ทำให้จบเลยได้มั้ย”: Claude reviewed the drafts; writing the team's tab waits for the
owner's explicit OK).
"""
import argparse
import csv
import datetime
import hashlib
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'venue-sites.json'
SITE_STATUS = ('checked',)
SITE_MAX_M = 600  # same limit as the page (js/app.js SITE_MAX_M) and CityMETER · Hotel
SITE_SOURCES = {  # boundary_source codes → the words of the evidence line
    'dol_parcels+site_layout': 'รูปแปลงกรมที่ดิน + ผังโครงการ',
    'site_layout': 'ผังโครงการ',
    'dol_parcels': 'รูปแปลงกรมที่ดิน',
    'osm_outline': 'ขอบเขตพื้นที่จาก OpenStreetMap',
    'osm_outline+site_layout': 'ขอบเขตพื้นที่จาก OpenStreetMap + ผังโครงการ',
    # a draft that Claude's automated checks passed (owner 2026-11-05 23:57 “พี่ทำให้จบเลยได้มั้ย”); a person's later
    # check turns it into osm_outline
    'osm_outline_auto': 'ขอบเขตพื้นที่จาก OpenStreetMap · ตรวจด้วยกฎอัตโนมัติ',
    # every building of a block the data owner drew by its roads (D44, owner 2026-11-08 11:40, Siam Square: Rama I –
    # Chula Soi 64, Phaya Thai – Henri Dunant, given 2026-11-07 20:58); no evidence link of its own
    'owner_block': 'บล็อกตามที่เจ้าของข้อมูลกำหนด',
}


def site_points(text, vid):
    pts = []
    for part in re.split(r'[;\s]+', (text or '').strip()):
        if not part:
            continue
        m = re.fullmatch(r'(\d{2,3}\.\d+),(\d{1,2}\.\d+)', part)
        if not m:
            sys.exit(f'{vid}: buildings_in_boundary entry {part!r} is not "lon,lat"')
        lon, lat = float(m[1]), float(m[2])
        if not (97 <= lon <= 106 and 5 <= lat <= 21):
            sys.exit(f'{vid}: buildings_in_boundary entry {part!r} lies outside Thailand')
        pts.append([round(lon, 6), round(lat, 6)])
    return pts


def public_url(u):
    u = (u or '').strip()
    if not u.startswith('https://'):
        return ''
    if re.search(r'docs\.google\.com|drive\.google\.com|google\.[a-z.]+/maps|maps\.app\.goo\.gl|landometer\.com/api/|/papi/api/|localhost|\.local/', u):
        return ''
    return u


def metres(a, b):
    kx = 111320 * math.cos(math.radians(a[1]))
    return math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110574)


def point_in_ring(p, ring):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        (xi, yi), (xj, yj) = ring[i][:2], ring[j][:2]
        if (yi > p[1]) != (yj > p[1]) and p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def family(v, venues):
    """The venue, its parent, the parent's components and its own components (js/site-guard.js familyOf)."""
    fam = {v['id']}
    if v.get('parentId'):
        fam.add(v['parentId'])
        fam |= set((venues.get(v['parentId']) or {}).get('children') or [])
    fam |= set(v.get('children') or [])
    fam |= {r['id'] for r in venues.values() if r.get('parentId') == v['id']}
    return fam


def other_venue_stops(sites, venues):
    """D42 (owner 2026-11-08 08:22, Emporium shown with EmQuartier's building): a site point standing in another
    venue's validated host footprint (data/venue-buildings.geojson), or a building in the sites of two venues of
    different families, is a sheet error — the site took another venue's building. scripts/separate-sites.py finds the
    rest (another venue's point in a site building) with the building outlines."""
    stops = []
    hosts = []
    for f in json.loads((ROOT / 'data' / 'venue-buildings.geojson').read_text())['features']:
        if f['properties'].get('geometry_role') != 'host_building_footprint_not_shop_unit':
            continue
        g = f['geometry']
        for poly in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
            hosts.append((set(f['properties'].get('venue_ids') or []), poly))
    seen = {}
    for vid, site in sites.items():
        fam = family(venues[vid], venues)
        for p in site['points']:
            for ids, poly in hosts:
                if ids & fam or not point_in_ring(p, poly[0]) or any(point_in_ring(p, h) for h in poly[1:]):
                    continue
                stops.append(f'{vid}: site point {p[0]},{p[1]} stands in the validated footprint of {", ".join(sorted(ids))}')
            key = (p[0], p[1])
            if key in seen and seen[key] not in fam:
                stops.append(f'{vid}: site point {p[0]},{p[1]} is also in the site of {seen[key]} (another family)')
            seen.setdefault(key, vid)
    return stops


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sites', default='', help='CSV of the research site tab (its SHA-256 is recorded)')
    ap.add_argument('--exported-on', default='', help='date of the export, or of the staged rows (YYYY-MM-DD)')
    ap.add_argument('--staged', action='store_true', help='the CSV holds rows staged for the site tab, not its export')
    a = ap.parse_args()

    venues = {r['id']: r for r in json.loads((ROOT / 'data' / 'venues.json').read_text())['rows']}
    sites, counts, source_file = {}, {'rowsRead': 0, 'notChecked': 0, 'unmatched': 0, 'noPoint': 0, 'noBuildings': 0}, None
    if a.sites:
        raw = Path(a.sites).read_bytes()
        source_file = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'exportedOn': a.exported_on,
                       'kind': 'staged_rows' if a.staged else 'site_tab_export'}
        for r in csv.DictReader(raw.decode('utf-8-sig').splitlines()):
            counts['rowsRead'] += 1
            if (r.get('boundary_status') or '').strip() not in SITE_STATUS:
                counts['notChecked'] += 1
                continue
            vid = (r.get('venue_id') or '').strip()
            v = venues.get(vid)
            if not v:
                counts['unmatched'] += 1
                continue
            if v.get('lat') is None or v.get('lon') is None:
                counts['noPoint'] += 1
                continue
            pts = site_points(r.get('buildings_in_boundary'), vid)
            if not pts:
                counts['noBuildings'] += 1
                continue
            far = max(metres((v['lon'], v['lat']), p) for p in pts)
            if far > SITE_MAX_M:
                sys.exit(f'{vid}: a site building lies {far:.0f} m from the venue point (more than {SITE_MAX_M} m)')
            on = (r.get('checked_on') or '').strip().lstrip("'")[:10]
            code = (r.get('boundary_source') or '').strip()
            sites[vid] = {'points': pts, 'n': len(pts), 'source': SITE_SOURCES.get(code, 'งานวิจัยไซต์'),
                          'url': public_url(r.get('boundary_evidence_url')),
                          'checkedOn': on if re.fullmatch(r'\d{4}-\d{2}-\d{2}', on) else ''}
        stops = other_venue_stops(sites, venues)
        if stops:
            sys.exit('a site holds another venue\'s building (D42; run scripts/separate-sites.py and correct the tab):\n  '
                     + '\n  '.join(stops))
    doc = {
        'meta': {
            'dataset': 'CityMETER Shopping centers — multi-building sites',
            'rule': 'one interior point per building of a checked research site (campus-site-join: public site layout and, '
                    'where read, land-office parcels); a site is a group of buildings for the map, not a title deed, '
                    'the deed area or ownership',
            'published': 'interior points, building count, source, public layout link, check date; the boundary, deed '
                         'numbers, parcel data and notes stay in the research sheet',
            'maxDistanceM': SITE_MAX_M,
            'input': source_file,
            'counts': {**counts, 'sites': len(sites), 'buildings': sum(s['n'] for s in sites.values())},
            'builtOn': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date().isoformat(),  # ICT
            'status': ('sites from rows staged for the research site tab (sites/site_rows.csv), not yet written to the '
                       'tab' if a.staged else 'sites from the research site tab') if a.sites else
                      'no site tab given: no site is drawn',
        },
        'sites': dict(sorted(sites.items())),
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"{OUT.relative_to(ROOT)}: {len(sites)} sites, {doc['meta']['counts']['buildings']} buildings")


if __name__ == '__main__':
    main()

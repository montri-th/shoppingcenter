#!/usr/bin/env python3
"""Write data/venue-sites.json: the buildings of each checked multi-building site (campus style) as interior points.

  python3 scripts/build-venue-sites.py [--sites <CSV of the research site tab>] [--exported-on YYYY-MM-DD]

Input: a CSV with the columns of the site tab of CityMETER · Hotel (49_SITE_BOUNDARY_CHECK), filled with the
campus-site-join workflow: venue_id, boundary_status, buildings_in_boundary ("lon,lat;lon,lat", one interior point
per building), boundary_source, boundary_evidence_url, checked_on. Only rows with boundary_status = checked are read.

Published per venue: the interior points, their count, the source in words, a public https layout link and the check
date. The boundary, deed numbers, parcel data, notes and reviewers stay in the sheet. A building more than 600 m from
the venue's own point, or a point outside Thailand, stops the build (a sheet error, not a site).

Without --sites the file lists no site: the research has no shopping-centre site tab yet (5 Nov 2026), so the page reads
an existing file and draws no site.
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sites', default='', help='CSV of the research site tab (its SHA-256 is recorded)')
    ap.add_argument('--exported-on', default='', help='date of the export (YYYY-MM-DD)')
    a = ap.parse_args()

    venues = {r['id']: r for r in json.loads((ROOT / 'data' / 'venues.json').read_text())['rows']}
    sites, counts, source_file = {}, {'rowsRead': 0, 'notChecked': 0, 'unmatched': 0, 'noPoint': 0, 'noBuildings': 0}, None
    if a.sites:
        raw = Path(a.sites).read_bytes()
        source_file = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'exportedOn': a.exported_on}
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
            'builtOn': datetime.date.today().isoformat(),
            'status': 'sites from the research site tab' if a.sites else 'no shopping-centre site research yet: no site is drawn',
        },
        'sites': dict(sorted(sites.items())),
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"{OUT.relative_to(ROOT)}: {len(sites)} sites, {doc['meta']['counts']['buildings']} buildings")


if __name__ == '__main__':
    main()

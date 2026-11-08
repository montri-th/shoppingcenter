#!/usr/bin/env python3
"""Separate venues: take another venue's buildings out of a research site (D42, owner 2026-11-08 08:22).

  python3 -I scripts/separate-sites.py --sites <CSV of the site tab> --out <dir> [--sites-dir sites]

Owner 2026-11-08 08:22, with a phone screenshot of Emporium: “เลือก Emporium แล้วมันขึ้น 2 อาคาร รวม EmQuatier ด้วย
ต้องแยกกัน / เช็คว่าเคสนี้เกิดกับ venue อื่นอันไหนอีกบ้าง / วิเคราะห์ว่าเกิดจากสาเหตุอะไร / แก้ไขเคสนี้ทุก venue ทั่วประเทศ”.

Cause: an OpenStreetMap outline can hold more than one venue (Emporium's crosses Sukhumvit Road to EmQuartier). The
D28 draft check looked only for another venue's pin inside the outline, and EmQuartier's pin stands 19 m outside its own
building (and outside the outline), so the outline passed as `clean` and the site took EmQuartier's building.

Rule (research tool; the page has the same guard for what it draws, js/site-guard.js):
  A. Another venue's building — never in a site, however the outline was drawn:
     the building holds another venue's pin (inside, or within 3 m of its edge: the page's own pin rule), or covers
     30% of another venue's validated host footprint (data/venue-buildings.geojson) or 30% of itself lies in one, or
     holds a point of another venue's site. Another venue = a counted venue, or a component of another venue; never
     the venue's own family (parent, components, sister components) nor a held duplicate of the same place.
     The venue's own buildings (its pin building, its validated footprint, its family's) stay even when another
     venue's pin also stands in them (one building, two venues inside).
  B. The rest of an outline that held another venue: every remaining site building goes to the nearer side — the
     venue's own buildings or the other venue's — measured along the gaps between buildings (a building next to the
     other venue's building is the other venue's); a tie stays with the venue.
  A site left with fewer than two buildings is not a multi-building site any more (`single_building`).
Input buildings: sites/<venue_id>/candidates.json of the site helper (CityMETER Building V4, read with the map's code).

Writes <out>/rows.csv (the corrected tab cells of the changed rows), <out>/report.json (every building taken out and
why) and <out>/review.csv (another counted venue's pin 3–25 m from a site building: no evidence it is that venue's;
for the research team, never applied).
"""
import argparse
import csv
import heapq
import json
import math
from pathlib import Path

from shapely.geometry import Point, Polygon, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
PIN_TOLERANCE_M = 3        # js/pin-buildings.js PIN_TOLERANCE_M
FOOTPRINT_SHARE = 0.3      # share of either shape that makes a building another venue's validated host building
REVIEW_M = 25              # another counted pin this close to a site building is listed for review (never applied)
REACH_M = 800              # other venues considered round the venue's pin (sites reach 600 m)


def metres(lat0):
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    return lambda lon, lat: (lon * kx, lat * ky)


def polygon(outer, holes, f):
    return Polygon([f(*p) for p in outer], [[f(*p) for p in h] for h in holes]).buffer(0)


def family(v, rows):
    fam = {v['id']}
    if v.get('parentId'):
        fam.add(v['parentId'])
        parent = rows.get(v['parentId'])
        if parent:
            fam |= set(parent.get('children') or [])
    fam |= set(v.get('children') or [])
    fam |= {r['id'] for r in rows.values() if r.get('parentId') == v['id']}
    return fam


def is_other(v, w, fam):
    """Another venue: counted, or a component of another family; never the family or a held duplicate of the place."""
    if w['id'] in fam or w.get('lon') is None or w.get('lat') is None:
        return False
    if w.get('countHold') == 'duplicate' or (w.get('name') and w.get('name') == v.get('name')):
        return False
    return bool(w.get('countable')) or (w.get('countHold') == 'component' and w.get('parentId') not in fam)


def separate(v, site_points, candidates, rows, footprints, sites):
    f = metres(v['lat'])
    fam = family(v, rows)
    polys = {c['cid']: polygon(c['outer'], c.get('holes') or [], f) for c in candidates}
    def building_of(p):
        c = next((c for c in candidates if abs(c['point'][0] - p[0]) < 1e-6 and abs(c['point'][1] - p[1]) < 1e-6), None)
        if c is None:
            P = Point(f(*p))
            c = next((c for c in candidates if polys[c['cid']].contains(P)), None)
        return c
    site = []  # (point, cid or None, shape)
    for p in site_points:
        c = building_of(p)
        site.append((p, c['cid'] if c else None, polys[c['cid']] if c else Point(f(*p)).buffer(1)))
    pin = Point(f(v['lon'], v['lat']))
    others = [w for w in rows.values() if is_other(v, w, fam) and pin.distance(Point(f(w['lon'], w['lat']))) <= REACH_M]
    fp = {vid: [Polygon([f(*q) for q in ring[0]], [[f(*q) for q in h] for h in ring[1:]]).buffer(0) for ring in rings]
          for vid, rings in footprints.items()}

    def footprint_hit(shape_, vid):
        for g in fp.get(vid, []):
            inter = shape_.intersection(g).area
            if inter >= FOOTPRINT_SHARE * shape_.area or inter >= FOOTPRINT_SHARE * g.area:
                return True
        return False

    own = {i for i, (p, cid, s) in enumerate(site)
           if s.distance(pin) <= PIN_TOLERANCE_M or any(footprint_hit(s, m) for m in fam)
           or any(s.distance(Point(f(rows[m]['lon'], rows[m]['lat']))) <= PIN_TOLERANCE_M for m in fam
                  if m != v['id'] and m in rows and rows[m].get('lon') is not None)}
    theirs, why, review = {}, {}, []
    for i, (p, cid, s) in enumerate(site):
        for w in others:
            wp = Point(f(w['lon'], w['lat']))
            reasons = []
            if s.distance(wp) <= PIN_TOLERANCE_M:
                reasons.append('pin_building')
            if footprint_hit(s, w['id']):
                reasons.append('host_footprint')
            ws = sites.get(w['id'])
            if ws and any(s.contains(Point(f(*q))) for q in ws):
                reasons.append('other_site')
            if reasons and i not in own:
                theirs.setdefault(i, set()).add(w['id'])
                why.setdefault(i, []).extend(f'{r}:{w["id"]}' for r in reasons)
            elif not reasons and w.get('countable') and PIN_TOLERANCE_M < s.distance(wp) <= REVIEW_M and i not in own:
                review.append({'venue_id': v['id'], 'venue': v['name'], 'point': f'{p[0]},{p[1]}', 'other_id': w['id'],
                               'other': w['name'], 'other_group': w.get('group'), 'gap_m': round(s.distance(wp), 1)})
    if not theirs:
        return None, review
    # B: nearer side along the gaps between buildings (shortest path over the gaps; a tie stays with the venue).
    n = len(site)
    def reach(seeds):
        dist = [math.inf] * n
        heap = [(d, i) for i, d in seeds.items()]
        for d, i in heap:
            dist[i] = min(dist[i], d)
        heapq.heapify(heap)
        while heap:
            d, i = heapq.heappop(heap)
            if d > dist[i]:
                continue
            for j in range(n):
                nd = d + site[i][2].distance(site[j][2])
                if nd < dist[j]:
                    dist[j] = nd
                    heapq.heappush(heap, (nd, j))
        return dist
    # the venue's own buildings, else (no own building in the site) the pin itself
    own_seeds = {i: 0.0 for i in own} or {i: s.distance(pin) for i, (_, _, s) in enumerate(site)}
    d_own, d_other = reach(own_seeds), reach({i: 0.0 for i in theirs})
    side = ['own' if (i not in theirs and d_own[i] <= d_other[i]) else 'other' for i in range(n)]
    best = d_other
    kept = [site[i][0] for i in range(n) if side[i] == 'own']
    dropped = []
    for i in range(n):
        if side[i] == 'own':
            continue
        dropped.append({'point': f'{site[i][0][0]},{site[i][0][1]}', 'cid': site[i][1], 'area_m2': round(site[i][2].area),
                        'rule': 'A' if i in theirs else 'B',
                        'why': sorted(set(why.get(i, []))) or [f'nearer_to_other:{round(best[i], 1)}m']})
    return {'kept': kept, 'dropped': dropped, 'others': sorted({w for s in theirs.values() for w in s})}, review


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sites', required=True, help='CSV of the research site tab (read-back or export)')
    ap.add_argument('--out', required=True, help='folder for rows.csv, report.json and review.csv')
    ap.add_argument('--sites-dir', default=str(ROOT / 'sites'), help='the site helper folder (candidates.json per venue)')
    a = ap.parse_args()
    rows = {r['id']: r for r in json.loads((ROOT / 'data' / 'venues.json').read_text())['rows']}
    footprints = {}
    for feat in json.loads((ROOT / 'data' / 'venue-buildings.geojson').read_text())['features']:
        if feat['properties'].get('geometry_role') != 'host_building_footprint_not_shop_unit':
            continue
        g = feat['geometry']
        rings = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for vid in feat['properties'].get('venue_ids') or []:
            footprints.setdefault(vid, []).extend(rings)
    tab = list(csv.DictReader(Path(a.sites).read_text(encoding='utf-8-sig').splitlines()))
    checked = {r['venue_id'].strip(): [[float(x) for x in p.split(',')] for p in r['buildings_in_boundary'].split(';') if p.strip()]
               for r in tab if r.get('boundary_status', '').strip() == 'checked' and r.get('buildings_in_boundary', '').strip()}
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    changed, report, review = [], [], []
    for vid, points in sorted(checked.items()):
        v = rows.get(vid)
        cand_file = Path(a.sites_dir) / vid / 'candidates.json'
        if not v or v.get('lat') is None or not cand_file.exists():
            continue
        candidates = json.loads(cand_file.read_text())['candidates']
        res, rev = separate(v, points, candidates, rows, footprints, checked)
        review += rev
        if not res:
            continue
        kept = res['kept']
        status = 'checked' if len(kept) >= 2 else 'single_building'
        others = ', '.join(f'{w} {rows[w]["name"]}' for w in res['others'])
        note = (f'D42 (8 Nov 2026): took out {len(res["dropped"])} of {len(points)} buildings — another venue\'s '
                f'building and the buildings on its side ({others}); the OpenStreetMap outline holds more than this venue')
        changed.append({'venue_id': vid, 'boundary_status': status, 'buildings_in_boundary': ';'.join(f'{p[0]},{p[1]}' for p in kept) if status == 'checked' else '',
                        'building_count': len(kept) if status == 'checked' else '', 'note': note})
        report.append({'venue_id': vid, 'name': v['name'], 'before': len(points), 'after': len(kept), 'status': status,
                       'others': [{'id': w, 'name': rows[w]['name'], 'group': rows[w].get('group')} for w in res['others']],
                       'dropped': res['dropped']})
    with open(out / 'rows.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=['venue_id', 'boundary_status', 'buildings_in_boundary', 'building_count', 'note'])
        w.writeheader()
        w.writerows(changed)
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
    with open(out / 'review.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=['venue_id', 'venue', 'point', 'other_id', 'other', 'other_group', 'gap_m'])
        w.writeheader()
        w.writerows(review)
    print(f'{len(checked)} checked sites read; {len(changed)} changed; {sum(len(r["dropped"]) for r in report)} buildings taken out; '
          f'{len({(r["venue_id"], r["other_id"]) for r in review})} venue pairs for review')
    for r in report:
        print(f"  {r['venue_id']} {r['name']}: {r['before']} → {r['after']} ({r['status']}) · "
              + '; '.join(f"{d['cid']} [{d['rule']}] {','.join(d['why'])}" for d in r['dropped']))


if __name__ == '__main__':
    main()

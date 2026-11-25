#!/usr/bin/env python3
"""Write data/visitors-map/: the places visitors use around each located center — where people come to stay, eat,
shop and use services — counted from the research-registry datasets of the locale release, for the 5 km map of
"สถานที่ที่ผู้มาเยือนใช้รอบศูนย์", its figure and its rank. With --map workstudy, data/work-study-map/ the same way: the
places people come to work and study (0.9.5).

  python3 -I scripts/build-visitors-map.py --points <locale build>/w1/points
  python3 -I scripts/build-visitors-map.py --points <locale build>/w1/points --map workstudy \
      --office-data <montri-th/office checkout>/data/offices.json --office-commit <its commit>

Owner 2026-11-20 (VERBATIM): 19:35 “และขอ heatmap แบบนี้สำหรับ visitor ด้วย”; asked which data to draw it from (no
count of visitors per 250 m cell exists), the answer: “infer/imply จากจุดกิจกรรมต่างๆได้มั้ย เช่น POI จาก datasets ต่างๆที่
เชื่อมโยงกับ registry sheet สามารถในหน่วยอะไรก็ได้ที่สามารถบอกเชิงปริมาณได้”.

What is counted: the located records of the datasets the locale release groups as "visit" (stays) and "retail" (retail
and services around) — data/locale/meta.json ringGroups — one record = one place, whatever the dataset: a place is the
unit they all share (rooms, beds or seats are not added up across datasets). It is where visitors are likely to go
(an inference), not a count of people or of visits. The center itself is not counted, as in the rings of the release.

--map workstudy (owner 2026-11-20 20:33 “นอกจากสถานที่พัก ก็ยังมีสถานศึกษา ที่ทำงาน โรงงาน ร้านค้า ร้านอาหาร กิจกรรมต่างๆที่คน
ต้องเดินทางออกจากบ้านมาใช้บริการด้วย จากจุดที่เรามีมากพอสมควร น่าจะใช้ infer/imply ได้ดีพอสมควรมั้ย”; answers “แยกเป็นแผนที่
ที่สอง”, “นับแห่ง + บอกจำนวนคนประกอบ”): the groups "work" and "live" — offices, government offices, factories, industrial
estates, universities, health facilities and schools — without the rail stations (a place people pass through; the map
draws them, they are not counted). The people the sources record (students, workers, staff) and beds stay in the rings of
the release (data/locale facts `m`); this file counts places only.
Office workers (modelled; 0.9.6, owner 2026-11-20 23:27: “นำผลลัพท์ใหม่ไปปรับทั้ง shopping center และ office demo web”, after
the leasable-area check of CityMETER · Office): per center and radius, the area of the office records within it × an
occupancy rate ÷ 10–12 m² per person, as a range (w). The area is the leasable area the Office demo publishes, else the
record's source area unless its status is a source conflict; the occupancy is the building's own when its owner reports
it, else the Bangkok market's (OFFICE_MODEL). Joined by Office ID to montri-th/office data/offices.json (commit and
SHA-256 in meta.officeWorkers); every record counts once, records in one building are not merged; never added to the
people the sources record, and never a count of employees.
Distances are great-circle straight lines from the center's point (R = 6,371,008.8 m, the rings' own formula, so every
count equals the release); the cells are those of data/residents (azimuthal equidistant around the center, 250 m;
a place on the 5 km edge whose cell falls one step outside is kept in the edge cell).

Inputs
  --points   the point sets the locale release was built from, one JSON per dataset ({meta, pts: [[lon, lat, sub,
             measure, key], …]}); kept outside the repository (some come from research sheets): only their SHA-256 and
             counts are published
  data/locale/meta.json, data/locale/facts/*.json  the release: its groups, and the counts each center must equal,
             dataset by dataset and radius by radius
  data/residents/meta.json  the rank reference (the 488 centers) and the type universes
  data/venues.json  the located centers of the set (as scripts/build-residents.py)

Published per center (shardOf(id, SHARDS), FNV-1a as js/details.js):
  n  places within 1 · 3 · 5 km
  p  mid-rank percentile among the 488 reference centers [all], and among those of the same type [type], per radius
  g  places per 250 m cell within 5 km, 40 × 40, rows north to south, columns west to east; null = no place listed in
     the cell (not "no visitors")
  w  (work-study map) per radius [low, high, records with a leasable area, records with a source area, office records]:
     modelled office workers; low and high are null when no office record within the radius has an area

Stops (a source error, not a value): a dataset of the groups without its point set; a point set whose count for a
center differs from data/locale facts at any radius; cells that do not add up to the 5 km count; the reference or the
universes differing from data/residents. Writing the same inputs again gives the same bytes.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARDS = 128
RADII = (1000, 3000, 5000)
GROUPS = ('mall', 'community', 'outlet')
CELL_M, HALF = 250, 20  # cells -20..19 on both axes: 40 × 40 around the center, as data/residents
R_EARTH = 6371008.8     # the rings of the locale release (great-circle, mean radius)
# Modelled office workers (--map workstudy): the assumptions, with where each comes from.
OFFICE_MODEL = {
    'sqmPerPerson': [10, 12],
    'density': {'th': 'เกณฑ์เดิมในการคิดพื้นที่สำนักงานต่อคน 10–12 ตร.ม. ซึ่งแหล่งเดียวกันระบุว่าปัจจุบันเปลี่ยนไปคิดตามจำนวนที่นั่ง',
                'en': 'the traditional rule of thumb of 10–12 m² of office space per person, which the same source says has given way to planning by seats',
                'byTh': 'Knight Frank Thailand และ Peoplespace ใน Bangkok Post', 'byEn': 'Knight Frank Thailand and Peoplespace, in the Bangkok Post',
                'url': 'https://www.bangkokpost.com/property/2008523/knight-frank-thailand-and-peoplespace-showcase-workplace-strategy-concept-for-the-digital-era'},
    'occupancy': {'rate': 0.764, 'asOf': '2026-Q3', 'th': 'อัตราการเช่าของตลาดสำนักงานกรุงเทพฯ ไตรมาส 3/2569', 'en': 'the Bangkok office market occupancy of Q3 2026',
                  'byTh': 'Knight Frank Thailand ตามข่าว Pattaya Mail 24 ต.ค. 2569', 'byEn': 'Knight Frank Thailand, as Pattaya Mail reported on 24 Oct 2026',
                  'url': 'https://www.pattayamail.com/thailandnews/bangkok-office-vacancy-reaches-1-6-million-sqm-as-occupancy-stays-below-10-year-average-569566'},
    'conflict': 'แหล่งข้อมูลขัดกัน',  # the Office demo's area status of source_scope_or_value_conflict: such an area is not used
}
COMMIT40 = __import__('re').compile(r'^[0-9a-f]{40}$')


def rounded(x, up):
    """Round a modelled count outward to 10s (100s from 1,000; units below 10): low down, high up."""
    step = 100 if x >= 1000 else 10 if x >= 10 else 1
    return int(math.ceil(x / step) * step) if up else int(math.floor(x / step) * step)


def office_inputs(path, commit):
    """Office ID → (area m², 'l' leasable | 'a' source area, occupancy share or None) from montri-th/office data/offices.json."""
    if not path or not commit or not COMMIT40.match(commit):
        fail('--map workstudy needs --office-data <montri-th/office data/offices.json> and --office-commit <its 40-hex commit>')
    d = json.loads(Path(path).read_text(encoding='utf-8'))
    c, statuses = d['cols'], d['vocab']['status']
    if OFFICE_MODEL['conflict'] not in statuses:
        fail(f'{path}: no area status “{OFFICE_MODEL["conflict"]}” in vocab.status')
    conflict = statuses.index(OFFICE_MODEL['conflict'])
    lease = {int(k): v for k, v in d.get('lease', {}).items()}
    occ = {int(k): v for k, v in d.get('occupancy', {}).items()}
    out = {}
    for i, key in enumerate(c['key']):
        area, kind = None, None
        if i in lease and lease[i][0] > 0:
            area, kind = float(lease[i][0]), 'l'
        elif c['area'][i] and c['area'][i] > 0 and c['ast'][i] != conflict:
            area, kind = float(c['area'][i]), 'a'
        rate = None
        if i in occ:
            txt = str(occ[i][0]).strip().rstrip('%')
            try:
                rate = float(txt) / 100
            except ValueError:
                fail(f'{key}: occupancy “{occ[i][0]}” is not a percentage')
            if not 0 < rate <= 1:
                fail(f'{key}: occupancy {rate}')
        out[key] = (area, kind, rate)
    return out, {'repo': 'montri-th/office', 'file': 'data/offices.json', 'commit': commit, 'sha256': sha256(path),
                 'productVersion': office_version(path), 'readOn': d['meta'].get('readOn'), 'checkedOn': d['meta'].get('checkedOn')}


def office_version(path):
    """The Office demo's release (package.json beside data/), '' when the file is not in a checkout."""
    pkg = Path(path).resolve().parent.parent / 'package.json'
    return json.loads(pkg.read_text(encoding='utf-8')).get('version', '') if pkg.is_file() else ''


MAPS = {
    'visitors': {
        'out': 'visitors-map', 'uses': ('visit', 'retail'), 'skip': (),
        'release': 'venue-locale-visitors-519-20261126-v2', 'schema': 'shoppingcenter-visitors-map/1',
        'owner': '2026-11-20, answer to the data question: infer/imply จากจุดกิจกรรมต่างๆได้มั้ย เช่น POI จาก datasets ต่างๆที่เชื่อมโยงกับ registry sheet สามารถในหน่วยอะไรก็ได้ที่สามารถบอกเชิงปริมาณได้',
        'what': 'places visitors use (stays, retail and services) per 250 m cell within 5 km of each located center: listed places, not people or visits',
        'dataMethod': 'DATA_METHOD.md#visitor-places',
    },
    'workstudy': {
        'out': 'work-study-map', 'uses': ('work', 'live'), 'skip': ('transit',),
        'release': 'venue-locale-work-study-519-20261126-v3', 'schema': 'shoppingcenter-work-study-map/1', 'officeWorkers': True,
        'owner': '2026-11-20 20:33: นอกจากสถานที่พัก ก็ยังมีสถานศึกษา ที่ทำงาน โรงงาน ร้านค้า ร้านอาหาร กิจกรรมต่างๆที่คนต้องเดินทางออกจากบ้านมาใช้บริการด้วย จากจุดที่เรามีมากพอสมควร น่าจะใช้ infer/imply ได้ดีพอสมควรมั้ย; answers: แยกเป็นแผนที่ที่สอง · นับแห่ง + บอกจำนวนคนประกอบ',
        'what': 'places people come to work and study (offices, government offices, factories, industrial estates, universities, health facilities, schools) per 250 m cell within 5 km of each located center: listed places, not people or trips; rail stations are drawn on the map, not counted',
        'dataMethod': 'DATA_METHOD.md#work-study-places',
    },
}


def fail(msg):
    sys.exit(f'build-visitors-map: {msg}')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def shard_of(vid, shards=SHARDS):
    """FNV-1a of the UTF-8 bytes, as js/details.js shardOf."""
    h = 0x811C9DC5
    for b in str(vid).encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h % shards


def mid_pct(x, values):
    below = sum(1 for v in values if v < x)
    equal = sum(1 for v in values if v == x)
    return 100 * (below + 0.5 * equal) / len(values)


def located_set():
    rows = json.loads((ROOT / 'data' / 'venues.json').read_text(encoding='utf-8'))['rows']
    return {r['id']: r for r in rows if r.get('countable') and r.get('status') == 'supply' and r.get('group') in GROUPS and r.get('located')}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--points', required=True, type=Path)
    ap.add_argument('--map', choices=sorted(MAPS), default='visitors')
    ap.add_argument('--office-data', type=Path, help='workstudy: montri-th/office data/offices.json (modelled office workers)')
    ap.add_argument('--office-commit', help='workstudy: the montri-th/office commit that file comes from (40 hex)')
    args = ap.parse_args()
    cfg = MAPS[args.map]
    offices, office_src = office_inputs(args.office_data, args.office_commit) if cfg.get('officeWorkers') else (None, None)
    out_dir = ROOT / 'data' / cfg['out']
    import numpy as np
    from pyproj import Transformer
    from scipy.spatial import cKDTree

    meta = json.loads((ROOT / 'data' / 'locale' / 'meta.json').read_text(encoding='utf-8'))
    rmeta = json.loads((ROOT / 'data' / 'residents' / 'meta.json').read_text(encoding='utf-8'))
    groups = {g['id']: g for g in meta['ringGroups']}
    datasets = [ds for use in cfg['uses'] for ds in groups[use]['datasets'] if ds not in cfg['skip']]
    if len(set(datasets)) != len(datasets) or not datasets or any(not any(ds in groups[u]['datasets'] for u in cfg['uses']) for ds in cfg['skip']):
        fail(f'datasets of the groups {cfg["uses"]} without {cfg["skip"]}: {datasets}')
    facts = {}
    for f in sorted((ROOT / 'data' / 'locale' / 'facts').glob('*.json')):
        facts.update(json.loads(f.read_text(encoding='utf-8'))['venues'])

    located = located_set()
    added = set(rmeta['reference']['added'])
    reference = sorted(set(located) - added)
    counts = {'all': len(reference), **{g: sum(1 for i in reference if located[i]['group'] == g) for g in GROUPS}}
    if len(located) != rmeta['venues'] or len(reference) != rmeta['reference']['n'] or counts != rmeta['universes']:
        fail(f'centers {len(located)} / reference {len(reference)} / universes {counts} differ from data/residents')
    missing = [v for v in located if v not in facts or facts[v].get('located') is False]
    if missing:
        fail(f'centers without facts in the release: {missing[:5]}')

    def xyz(lon, lat):
        lon, lat = np.radians(lon), np.radians(lat)
        return np.column_stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])

    def arc(c):
        return 2 * R_EARTH * math.asin(min(1.0, c / 2))

    ids = sorted(located)
    V = xyz(np.array([located[i]['lon'] for i in ids]), np.array([located[i]['lat'] for i in ids]))
    chord5 = 2 * math.sin(RADII[-1] / (2 * R_EARTH))
    inputs, per_ds = {}, {}
    found = {vid: [] for vid in ids}  # (lon, lat, distance) of every place within 5 km
    near_offices = {vid: [] for vid in ids}  # (Office ID, distance) within 5 km, for the modelled office workers
    for ds in datasets:
        path = args.points / f'{ds}.json'
        if not path.exists():
            fail(f'{ds}: no point set at {path}')
        d = json.loads(path.read_text(encoding='utf-8'))
        if d['meta'].get('id') != ds:
            fail(f'{path}: meta.id {d["meta"].get("id")}')
        pts = d['pts']
        inputs[ds] = {'sha256': sha256(path), 'points': len(pts)}
        m = meta['ring'][ds]
        per_ds[ds] = {'th': m['th'], 'en': m['en'], 'short': m.get('short'), 'unit': m.get('unit'), 'date': m.get('date'),
                      'eligible': m.get('eligible'), 'located': m.get('located')}
        if m.get('located') is not None and m['located'] != len(pts):
            fail(f'{ds}: {len(pts)} points, the release says {m["located"]} located')
        if not pts:
            continue
        P = xyz(np.array([p[0] for p in pts]), np.array([p[1] for p in pts]))
        tree = cKDTree(P)
        for k, vid in enumerate(ids):
            idx = tree.query_ball_point(V[k], chord5)
            dist = {j: arc(float(np.linalg.norm(P[j] - V[k]))) for j in idx}
            if ds == 'shopping':
                dist = {j: dd for j, dd in dist.items() if pts[j][4] != vid}
            got = [sum(1 for dd in dist.values() if dd <= r) for r in RADII]
            want = facts[vid]['ring'].get(ds, {}).get('n', [0, 0, 0])
            if got != list(want):
                fail(f'{vid} {ds}: {got} within 1 · 3 · 5 km, the release says {want}')
            found[vid].extend((pts[j][0], pts[j][1]) for j, dd in dist.items() if dd <= RADII[-1])
            if ds == 'office' and offices is not None:
                for j, dd in dist.items():
                    if dd <= RADII[-1]:
                        if pts[j][4] not in offices:
                            fail(f'office point {pts[j][4]} is not a row of {office_src["file"]} @{office_src["commit"][:12]}')
                        near_offices[vid].append((pts[j][4], dd))

    recs = {}
    for k, vid in enumerate(ids):
        v = located[vid]
        n = [sum(facts[vid]['ring'].get(ds, {}).get('n', [0, 0, 0])[i] for ds in datasets) for i in range(3)]
        if len(found[vid]) != n[2]:
            fail(f'{vid}: {len(found[vid])} places found within 5 km, the release adds up to {n[2]}')
        tf = Transformer.from_crs('EPSG:4326', f'+proj=aeqd +lat_0={v["lat"]} +lon_0={v["lon"]} +datum=WGS84 +units=m', always_xy=True)
        grid = [0] * (2 * HALF * 2 * HALF)
        if found[vid]:
            xs, ys = tf.transform(np.array([q[0] for q in found[vid]]), np.array([q[1] for q in found[vid]]))
            for x, y in zip(xs, ys):
                i = min(HALF - 1, max(-HALF, math.floor(x / CELL_M)))
                j = min(HALF - 1, max(-HALF, math.floor(y / CELL_M)))
                grid[(HALF - 1 - j) * 2 * HALF + (i + HALF)] += 1
        if sum(grid) != n[2]:
            fail(f'{vid}: cells add up to {sum(grid)}, 5 km {n[2]}')
        recs[vid] = {'n': n, 'g': [c or None for c in grid]}
        if offices is not None:
            w = []
            for i, r in enumerate(RADII):
                within = [offices[key] for key, dd in near_offices[vid] if dd <= r]
                if len(within) != facts[vid]['ring'].get('office', {}).get('n', [0, 0, 0])[i]:
                    fail(f'{vid}: {len(within)} office records within {r} m, the release says otherwise')
                share = sum(a * (rate if rate is not None else OFFICE_MODEL['occupancy']['rate']) for a, _, rate in within if a)
                nl = sum(1 for a, kind, _ in within if a and kind == 'l')
                na = sum(1 for a, kind, _ in within if a and kind == 'a')
                lo_sqm, hi_sqm = OFFICE_MODEL['sqmPerPerson'][1], OFFICE_MODEL['sqmPerPerson'][0]
                w.append([rounded(share / lo_sqm, False) if nl + na else None, rounded(share / hi_sqm, True) if nl + na else None, nl, na, len(within)])
            if any(x[4] for x in w):
                recs[vid]['w'] = w

    for i, r in enumerate(RADII):
        allv = [recs[x]['n'][i] for x in reference]
        by_type = {g: [recs[x]['n'][i] for x in reference if located[x]['group'] == g] for g in GROUPS}
        for vid in ids:
            x = recs[vid]['n'][i]
            recs[vid].setdefault('p', [[], []])
            recs[vid]['p'][0].append(round(mid_pct(x, allv), 4))
            recs[vid]['p'][1].append(round(mid_pct(x, by_type[located[vid]['group']]), 4))

    shards = {}
    for vid in ids:
        shards.setdefault(shard_of(vid), {})[vid] = recs[vid]
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('*.json'):
        old.unlink()

    def dump(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'

    sizes = []
    for k in range(SHARDS):
        body = dump({'venues': shards.get(k, {})})
        (out_dir / f'{k:03d}.json').write_text(body, encoding='utf-8')
        sizes.append(len(body.encode('utf-8')))
    totals = [sum(recs[v]['n'][i] for v in ids) for i in range(3)]
    out_meta = {
        'schema': cfg['schema'],
        'release': cfg['release'],
        'owner': cfg['owner'],
        'what': cfg['what'],
        'unit': ['สถานที่', 'places'],
        'uses': list(cfg['uses']),
        'datasets': [{'id': ds, **per_ds[ds]} for ds in datasets],
        'localeRelease': meta.get('release', {}).get('id') if isinstance(meta.get('release'), dict) else meta.get('release'),
        'input': {'points': inputs},
        'radii': list(RADII),
        'cell': {'m': CELL_M, 'n': 2 * HALF, 'first': [-HALF, HALF - 1],
                 'order': 'rows north to south, columns west to east; value = places in the cell; null = no place listed in the cell',
                 'projection': 'azimuthal equidistant centred on the center point (WGS84); cell = floor(x / 250 m), floor(y / 250 m), the 5 km edge kept in the edge cell'},
        'distance': 'great-circle straight line from the center point, R = 6,371,008.8 m (as the rings of the locale release); the center itself is not counted',
        'reference': rmeta['reference'],
        'universes': rmeta['universes'],
        'venues': len(ids),
        'shards': SHARDS,
        'totals': {'places1': totals[0], 'places3': totals[1], 'places5': totals[2]},
        'dataMethod': cfg['dataMethod'],
    }
    if cfg['skip']:
        out_meta['skipped'] = {ds: 'drawn on the map, not counted' for ds in cfg['skip']}
    if offices is not None:
        used = sum(1 for v in offices.values() if v[0])
        out_meta['officeWorkers'] = {
            'owner': '2026-11-20 23:27: นำผลลัพท์ใหม่ไปปรับทั้ง shopping center และ office demo web (after the leasable-area check of CityMETER · Office)',
            'what': 'modelled office workers per center and radius: area × occupancy ÷ 10–12 m² per person, as a range; a model, never a count of employees, never added to the people the sources record',
            'record': 'w: per radius [low, high, records with a leasable area, records with a source area, office records]; low and high null when no record within the radius has an area',
            'area': 'the leasable area the Office demo publishes (owner, broker or press release), else the record’s source area unless its status is a source conflict; one record counts once, records in one building are not merged',
            'sqmPerPerson': OFFICE_MODEL['sqmPerPerson'], 'density': OFFICE_MODEL['density'], 'occupancy': OFFICE_MODEL['occupancy'],
            'buildingOccupancy': 'the building’s own occupancy when its owner reports it (the Office demo’s occupancy), else occupancy.rate',
            'rounding': 'low rounded down and high rounded up, to 10 (100 from 1,000; units below 10)',
            'source': office_src,
            'records': {'all': len(offices), 'withArea': used, 'leasable': sum(1 for v in offices.values() if v[1] == 'l'),
                        'sourceArea': sum(1 for v in offices.values() if v[1] == 'a'), 'ownOccupancy': sum(1 for v in offices.values() if v[2] is not None)},
        }
    (out_dir / 'meta.json').write_text(dump(out_meta), encoding='utf-8')
    print(f'data/{cfg["out"]}: {len(ids)} centers in {SHARDS} shards, {sum(sizes):,} bytes (largest {max(sizes):,}); '
          f'{len(datasets)} datasets; places within 1 · 3 · 5 km summed over centers {totals}')


if __name__ == '__main__':
    main()

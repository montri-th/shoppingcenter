#!/usr/bin/env python3
"""Write data/crossing/: the figures of “รอบศูนย์นี้” with the far bank of a river reached through the nearest crossing.

  python3 -I scripts/build-crossing.py --bundle <dir>

Owner 2026-11-26 14:12 (VERBATIM): “รัศมี 1,3,5km ถ้ากรณีคร่อมไปคนละฝั่งแม่น้ำ หรือมี physical barrier ขวางแบบนี้เราควรนับคน/จุด/
context ฝั่งตรงข้ามยังไงครับ ช่วยแนะนำหน่อยแล้วปรับให้ได้ค่าที่มีคุณภาพสูงขึ้น”; his answers the same afternoon: the method
“อ้อมผ่านทางข้าม (Recommended)” and the road data “ดาวน์โหลดผ่าน Chrome (Recommended)” (Geofabrik's Thailand extract).

Rule (release 0.12.0): a place or building on the center's bank of a river keeps the straight-line distance of the
release it comes from (so the figures of a center no river comes near do not move); one across a barrier river counts
by its distance through the nearest crossing — center → crossing → place, each leg a straight line, chained through
more than one crossing where the river forks. Barrier rivers: the waterways OpenStreetMap names แม่น้ำ… Crossings:
road bridges and tunnels of every class, footbridges, metro lines and cross-river ferries (bundle results/osm_summary.json
says how each is chosen). Not walking or driving time: a distance that goes round the river, nothing more.

Inputs (outside this repository):
  --bundle  02-CityMETER__venue-locale-crossing-bundle__v1__2026-11-26 (checked against its SHA256SUMS):
            results/places_via.json     per center a river comes within 5 km of: every ring of the locale release
                                        (n, sub, m, near) counted straight (must equal data/locale) and through the
                                        crossings; the places of the two maps (sums of their datasets); the modelled
                                        office workers both ways; the 250 m cells across the river with their
                                        distance through a crossing; the crossings within 5 km (nearest first)
            results/residents_via.json  per such center, from the production inputs re-read on 2026-11-26 (tiles equal
                                        to the bundle's reads): the straight totals (must equal data/residents) and
                                        what the rule takes out at each radius (residents, buildings, ages,
                                        subdistricts left without a counted building), the rings through the crossings,
                                        the residents across the river, and the crossing most of them come through
            results/osm_summary.json    the OpenStreetMap file (Geofabrik, MD5 and SHA-256), the barrier and crossing
                                        rules, the counts
            results/inputs.json         the point sets (SHA-256, where each came from), the production re-read and the
                                        Office file the counts used
  Read from this repository: data/venues.json (located centers), data/residents, data/visitors-map,
  data/work-study-map, data/locale (facts, meta) and data/compare — the straight-line figures every check compares with.

Published:
  meta.json   the rule, sources, checks and counts
  NNN.json    per located center (shardOf(id, 128), FNV-1a as js/details.js):
    p      the ranks under the rule — res, vis, work: mid-rank percentiles (4 decimals) [all, type] × 1 · 3 · 5 km;
           ring: {dataset: [[all], [type]]} whole percentiles as data/locale. Every center has them: when a river center
           loses residents or places, the others' ranks among the 488 move a little.
    res    {n, ring, age, b, sd} under the rule (as data/residents), only where a figure differs from the straight one
    vis    {n} · work {n, w} (as the maps' files), only where they differ
    ring   {dataset: {n, sub, m, near}} (as data/locale facts), only the datasets that differ
    x      only for a center a barrier river comes within 5 km of:
           a  residents across the river within 1 · 3 · 5 km, % of the straight-line residents (1 decimal)
           r  [[name th, name en], …] the barrier rivers within 5 km
           c  [[x, y, kind, name th, name en, metres], …] crossings reached within 5 km, nearest first (≤ 12): x, y in
              25 m units around the center, y down (as data/residents-map); kind bridge · road · foot · ford · tunnel ·
              metro · ferry; metres = the distance from the center through the crossings
           u  per radius [index in c or -1, %]: the crossing most of the counted cross-river residents come through,
              and their share
           k  [[cell, tens of metres], …] the 250 m cells (data/residents order) across the river within 5 km, with
              the distance of the cell's centre through the crossings (-1: no crossing within 10 km)
  compare.json  data/compare/residents-workers.json with x (the residents rank) under the rule; y unchanged

Stops (a source error, not a value): a SHA-256 that differs from SHA256SUMS; a straight figure of the bundle that
differs from the published one; a published rank that does not recount from the published figures; rings that do
not add up to the 5 km residents. Writing the same inputs again gives the same bytes.
"""
import argparse
import bisect
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'crossing'
SHARDS = 128
RADII = (1000, 3000, 5000)
RINGS = ((0, 1000), (1000, 3000), (3000, 5000))
GROUPS = ('mall', 'community', 'outlet')
RELEASE = 'venue-locale-crossing-519-20261126-v1'
BUNDLE = '02-CityMETER__venue-locale-crossing-bundle__v1__2026-11-26'
OWNER = ('2026-11-26 14:12 (VERBATIM): “รัศมี 1,3,5km ถ้ากรณีคร่อมไปคนละฝั่งแม่น้ำ หรือมี physical barrier ขวางแบบนี้เราควรนับคน/จุด/context '
         'ฝั่งตรงข้ามยังไงครับ ช่วยแนะนำหน่อยแล้วปรับให้ได้ค่าที่มีคุณภาพสูงขึ้น”; answers: “อ้อมผ่านทางข้าม (Recommended)” · '
         '“ดาวน์โหลดผ่าน Chrome (Recommended)”')
RULE = {
    'th': 'ฝั่งเดียวกับศูนย์วัดเส้นตรงเหมือนเดิม ฝั่งตรงข้ามแม่น้ำวัดระยะผ่านทางข้ามที่ใกล้ที่สุด (ศูนย์ → ทางข้าม → จุด แต่ละช่วงเป็นเส้นตรง) '
          'ทางข้ามคือสะพานและอุโมงค์ถนนทุกระดับ สะพานคนเดิน รถไฟฟ้า และเรือข้ามฟาก ไม่ใช่เวลาเดินหรือขับรถ',
    'en': 'on the center’s bank the straight line as before; across a river the distance through the nearest crossing '
          '(center → crossing → place, each leg a straight line); crossings are road bridges and tunnels of every class, '
          'footbridges, metro lines and cross-river ferries; not walking or driving time',
}


def fail(msg):
    sys.exit(f'build-crossing: {msg}')


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
    """Mid-rank percentile, ties counted half (data/residents, the maps)."""
    below = sum(1 for v in values if v < x)
    equal = sum(1 for v in values if v == x)
    return 100 * (below + 0.5 * equal) / len(values)


def ring_pct(sorted_values, x):
    """The locale release's percentile (rings.py: one decimal) as its serving bundle stores it (a whole number)."""
    lo = bisect.bisect_left(sorted_values, x)
    hi = bisect.bisect_right(sorted_values, x)
    return int(round(round(100 * (lo + (hi - lo) / 2) / len(sorted_values), 1)))


def shards_of(name):
    out = {}
    for f in sorted((ROOT / 'data' / name).glob('[0-9]*.json')):
        out.update(json.loads(f.read_text(encoding='utf-8'))['venues'])
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--bundle', required=True, type=Path)
    args = ap.parse_args()
    b = args.bundle

    # ---- the bundle, byte for byte
    sums = {}
    for line in (b / 'SHA256SUMS').read_text(encoding='utf-8').splitlines():
        if line.strip():
            h, name = line.split(None, 1)
            sums[name.strip().lstrip('*')] = h
    for name in ('results/places_via.json', 'results/residents_via.json', 'results/osm_summary.json', 'results/inputs.json'):
        if name not in sums:
            fail(f'{name} is not in SHA256SUMS')
        if sha256(b / name) != sums[name]:
            fail(f'{name}: SHA-256 differs from SHA256SUMS')
    places = json.loads((b / 'results/places_via.json').read_text(encoding='utf-8'))
    resid = json.loads((b / 'results/residents_via.json').read_text(encoding='utf-8'))
    osm = json.loads((b / 'results/osm_summary.json').read_text(encoding='utf-8'))
    inputs = json.loads((b / 'results/inputs.json').read_text(encoding='utf-8'))
    P, PM = places['venues'], places['meta']

    # ---- the published straight-line figures
    rows = json.loads((ROOT / 'data' / 'venues.json').read_text(encoding='utf-8'))['rows']
    located = {r['id']: r for r in rows if r.get('countable') and r.get('status') == 'supply' and r.get('group') in GROUPS and r.get('located')}
    rmeta = json.loads((ROOT / 'data' / 'residents' / 'meta.json').read_text(encoding='utf-8'))
    lmeta = json.loads((ROOT / 'data' / 'locale' / 'meta.json').read_text(encoding='utf-8'))
    added = set(rmeta['reference']['added'])
    ref = sorted(set(located) - added)
    counts = {'all': len(ref), **{g: sum(1 for i in ref if located[i]['group'] == g) for g in GROUPS}}
    if counts != rmeta['universes']:
        fail(f'reference {counts} differs from data/residents {rmeta["universes"]}')
    res, vis, work = shards_of('residents'), shards_of('visitors-map'), shards_of('work-study-map')
    facts = {}
    for f in sorted((ROOT / 'data' / 'locale' / 'facts').glob('*.json')):
        facts.update(json.loads(f.read_text(encoding='utf-8'))['venues'])
    compare = json.loads((ROOT / 'data' / 'compare' / 'residents-workers.json').read_text(encoding='utf-8'))
    ids = sorted(located)
    for vid in ids:
        if vid not in res or vid not in vis or vid not in work or not facts.get(vid, {}).get('ring'):
            fail(f'{vid}: a located center without a record in data/residents, the maps or data/locale')
    ring_ids = sorted({ds for vid in ids for ds in facts[vid]['ring']})
    group = {vid: located[vid]['group'] for vid in ids}

    def straight_values(kind, ds=None):
        if kind == 'res':
            return {vid: res[vid]['n'] for vid in ids}
        if kind == 'vis':
            return {vid: vis[vid]['n'] for vid in ids}
        if kind == 'work':
            return {vid: work[vid]['n'] for vid in ids}
        return {vid: facts[vid]['ring'].get(ds, {}).get('n') for vid in ids}

    def ranks4(values):
        out = {}
        for i in range(3):
            allv = [values[x][i] for x in ref]
            by_type = {g: [values[x][i] for x in ref if group[x] == g] for g in GROUPS}
            for vid in ids:
                out.setdefault(vid, [[], []])
                out[vid][0].append(round(mid_pct(values[vid][i], allv), 4))
                out[vid][1].append(round(mid_pct(values[vid][i], by_type[group[vid]]), 4))
        return out

    def ranks_ring(values):
        out = {}
        for i in range(3):
            allv = sorted(values[x][i] for x in ref if values[x] is not None)
            by_type = {g: sorted(values[x][i] for x in ref if values[x] is not None and group[x] == g) for g in GROUPS}
            for vid in ids:
                if values[vid] is None:
                    continue
                out.setdefault(vid, [[], []])
                out[vid][0].append(ring_pct(allv, values[vid][i]))
                out[vid][1].append(ring_pct(by_type[group[vid]], values[vid][i]))
        return out

    # ---- check: the published ranks recount from the published figures (the rank formula this build uses)
    for kind, recs in (('res', res), ('vis', vis), ('work', work)):
        got = ranks4(straight_values(kind))
        bad = [vid for vid in ids if got[vid] != recs[vid]['p']]
        if bad:
            fail(f'{kind}: published ranks of {len(bad)} centers do not recount, e.g. {bad[0]} {got[bad[0]]} vs {recs[bad[0]]["p"]}')
    for ds in ring_ids:
        got = ranks_ring(straight_values('ring', ds))
        bad = [vid for vid in ids if ds in facts[vid]['ring'] and got.get(vid) != facts[vid]['ring'][ds].get('p')]
        if bad:
            fail(f'ring {ds}: published ranks of {len(bad)} centers do not recount, e.g. {bad[0]}')

    # ---- check: the bundle's straight figures equal the published ones
    river = sorted(P)
    if sorted(resid) != river:
        fail('the residents and places results cover different centers')
    for vid in river:
        if vid not in located:
            fail(f'{vid}: in the bundle, not a located center')
        o = P[vid]
        for ds, r in o['ring'].items():
            pub = facts[vid]['ring'].get(ds)
            if pub is None or r['s']['n'] != pub['n'] or r['s'].get('near') != pub.get('near') \
                    or ('sub' in pub and r['s']['sub'] != pub['sub']) or ('m' in pub and r['s']['m'] != pub['m']):
                fail(f'{vid} {ds}: the bundle counts {r["s"]}, data/locale says {pub}')
        if o['vis']['s'] != vis[vid]['n'] or o['work']['s'] != work[vid]['n']:
            fail(f'{vid}: the maps\' places differ from the bundle')
        if work[vid].get('w') is not None and o.get('w', {}).get('s') != work[vid]['w']:
            fail(f'{vid}: the modelled office workers differ from the bundle')
        for i, r in enumerate(RADII):
            ck = resid[vid]['check'][str(r)]
            mine, pub_exact = ck['residents']
            if abs(mine - pub_exact) > 1e-6 or ck['buildings'][0] != ck['buildings'][1] or ck['subdistricts'][0] != ck['subdistricts'][1]:
                fail(f'{vid} {r} m: residents re-read {ck}, not equal to the residents bundle')
            if round(pub_exact, 3) != res[vid]['n'][i] or ck['buildings'][1] != res[vid]['b'][i] or ck['subdistricts'][1] != res[vid]['sd'][i]:
                fail(f'{vid} {r} m: the residents bundle {ck} is not what data/residents publishes')

    # ---- figures under the rule
    via = {vid: {} for vid in ids}
    n_res = {vid: list(res[vid]['n']) for vid in ids}
    n_vis = {vid: list(vis[vid]['n']) for vid in ids}
    n_work = {vid: list(work[vid]['n']) for vid in ids}
    n_ring = {ds: {vid: (list(facts[vid]['ring'][ds]['n']) if ds in facts[vid]['ring'] else None) for vid in ids} for ds in ring_ids}
    changed = {'res': 0, 'vis': 0, 'work': 0, 'ring': {}}
    # a river within 5 km that divides nothing in reach (no 250 m cell, building or place across it) leaves the center as it is
    def across_any(vid):
        o, rv = P[vid], resid[vid]
        return bool(o['cells']) or any(rv['across'][str(r)] > 0 for r in RADII) or any(any(a > 0 for a in q['across']) for q in o['ring'].values())
    divided = [vid for vid in river if across_any(vid)]
    for vid in divided:
        o, rv, pub = P[vid], resid[vid], res[vid]
        exact = [rv['check'][str(r)]['residents'][1] for r in RADII]
        drop = [rv['drop'][str(r)] for r in RADII]
        nv = [exact[i] - drop[i]['residents'] for i in range(3)]
        if abs(sum(rv['rings']) - nv[2]) > 1e-3:
            fail(f'{vid}: rings through the crossings add up to {sum(rv["rings"])}, the 5 km figure is {nv[2]}')
        rec = {}
        if any(d['buildings'] for d in drop):
            age = []
            for i in range(3):
                a = [pub['age'][i][k] * exact[i] - drop[i]['age'][k] for k in range(3)]
                s = sum(a)
                age.append([round(x / s, 6) for x in a] if s > 0 else None)
            rec['res'] = {'n': [round(x, 3) for x in nv], 'b': [pub['b'][i] - drop[i]['buildings'] for i in range(3)],
                          'sd': [pub['sd'][i] - drop[i]['subdistrictsLost'] for i in range(3)], 'age': age,
                          'ring': [[round(p, 3), round(p / (math.pi * (hi ** 2 - lo ** 2) / 1e6), 3)] for p, (lo, hi) in zip(rv['rings'], RINGS)]}
            n_res[vid] = rec['res']['n']
            changed['res'] += 1
        if o['vis']['v'] != o['vis']['s']:
            rec['vis'] = {'n': o['vis']['v']}; n_vis[vid] = o['vis']['v']; changed['vis'] += 1
        w = o.get('w', {})
        if o['work']['v'] != o['work']['s'] or (w and w.get('v') != w.get('s')):
            rec['work'] = {'n': o['work']['v']}
            if work[vid].get('w') is not None:
                rec['work']['w'] = w['v']
            n_work[vid] = o['work']['v']; changed['work'] += 1
        for ds, r in sorted(o['ring'].items()):
            if r['v'] != r['s']:
                pubr = facts[vid]['ring'][ds]
                rr = {'n': r['v']['n']}
                if 'sub' in pubr:
                    rr['sub'] = r['v']['sub']
                if 'm' in pubr:
                    rr['m'] = r['v']['m']
                if 'near' in pubr:
                    rr['near'] = r['v']['near']
                rec.setdefault('ring', {})[ds] = rr
                n_ring[ds][vid] = r['v']['n']
                changed['ring'][ds] = changed['ring'].get(ds, 0) + 1
        # what the page says about the river
        cross = []
        for x, y, kind, th, en, dist, fid, rname in o['cross']:
            cross.append([round(x / 25), round(-y / 25), kind, th, en, dist])
        ids_c = [c[6] for c in o['cross']]
        u = []
        for r in RADII:
            v = rv['via'].get(str(r))
            if not v:
                u.append([-1, 0]); continue
            fid, kind, th, en, dist = v['portal']
            k = ids_c.index(fid) if fid in ids_c else -1
            if k < 0:  # a crossing beyond the twelve listed: add it, the note names it
                cross.append([None, None, kind, th, en, dist]); k = len(cross) - 1
            u.append([k, round(100 * v['share'], 1)])
        names = {nm['th']: nm['en'] for nm in osm['riversNearCentres']}
        rec['x'] = {'a': [round(100 * rv['across'][str(r)] / exact[i], 1) if exact[i] > 0 else 0.0 for i, r in enumerate(RADII)],
                    'r': [[nm, names.get(nm, '')] for nm in o['rivers']], 'c': cross, 'u': u,
                    'k': [[k, (-1 if d < 0 else round(d / 10))] for k, d in o['cells']]}
        via[vid] = rec

    # ---- ranks under the rule, every center
    p_res, p_vis, p_work = ranks4(n_res), ranks4(n_vis), ranks4(n_work)
    p_ring = {ds: ranks_ring(n_ring[ds]) for ds in ring_ids}
    moved = {'res': sum(1 for v in ids if p_res[v] != res[v]['p']), 'vis': sum(1 for v in ids if p_vis[v] != vis[v]['p']),
             'work': sum(1 for v in ids if p_work[v] != work[v]['p'])}
    for vid in ids:
        via[vid]['p'] = {'res': p_res[vid], 'vis': p_vis[vid], 'work': p_work[vid],
                         'ring': {ds: p_ring[ds][vid] for ds in ring_ids if vid in p_ring[ds]}}

    # ---- the comparison chart: x under the rule
    cmp = json.loads(json.dumps(compare))
    for vid, rec in cmp['venues'].items():
        rec[1] = [round(x, 1) for x in p_res[vid][0]]
        rec[2] = [round(x, 1) for x in p_res[vid][1]]
    cmp['what'] = compare['what'] + ' — residents counted across a river through the nearest crossing (data/crossing)'
    cmp['crossing'] = {'release': RELEASE, 'x': 'the residents rank under the crossing rule (data/crossing p.res)'}

    # ---- write
    def dump(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    shards = {}
    for vid in ids:
        shards.setdefault(shard_of(vid), {})[vid] = via[vid]
    sizes = []
    for k in range(SHARDS):
        body = dump({'venues': shards.get(k, {})})
        (OUT / f'{k:03d}.json').write_text(body, encoding='utf-8')
        sizes.append(len(body.encode('utf-8')))
    (OUT / 'compare.json').write_text(dump(cmp), encoding='utf-8')
    tot = lambda vals: [round(sum(vals[v][i] for v in ids), 3) for i in range(3)]
    meta = {
        'schema': 'shoppingcenter-crossing/1', 'release': RELEASE, 'owner': OWNER, 'rule': RULE,
        'bundle': {'name': BUNDLE, 'sha256': {k: sums[k] for k in sorted(sums) if k.startswith('results/')}},
        'osm': osm['source'], 'barriers': osm['barriers'], 'crossings': osm['crossings'],
        'pointSets': inputs['pointSets'], 'residentsReRead': inputs['residents'], 'office': inputs['office'],
        'radii': list(RADII), 'shards': SHARDS, 'venues': len(ids), 'riverCenters': len(divided), 'riverNoAcross': sorted(set(river) - set(divided)),
        'changed': {'residents': changed['res'], 'visitors': changed['vis'], 'work': changed['work'], 'rings': dict(sorted(changed['ring'].items()))},
        'ranksMoved': moved,
        'totals': {'residents': {'straight': tot({v: res[v]['n'] for v in ids}), 'crossing': tot(n_res)},
                   'visitors': {'straight': tot({v: vis[v]['n'] for v in ids}), 'crossing': tot(n_vis)},
                   'work': {'straight': tot({v: work[v]['n'] for v in ids}), 'crossing': tot(n_work)}},
        'totalsNote': 'sums over centers whose circles overlap, so people and places count more than once: a build check, not a figure to show',
        'reference': {'n': len(ref), 'added': sorted(added)}, 'universes': counts,
        'cell': {'m': 250, 'n': 40, 'order': 'as data/residents: rows north to south, columns west to east (k = row × 40 + column)'},
        'coordinates': '25 m units around the center, y down (as data/residents-map)',
        'releases': {'locale': lmeta.get('release', {}).get('id') if isinstance(lmeta.get('release'), dict) else lmeta.get('release'),
                     'residents': rmeta.get('release'),
                     'visitors': json.loads((ROOT / 'data/visitors-map/meta.json').read_text(encoding='utf-8')).get('release'),
                     'work': json.loads((ROOT / 'data/work-study-map/meta.json').read_text(encoding='utf-8')).get('release')},
        'dataMethod': 'DATA_METHOD.md#river-crossings',
        'shardBytes': {'max': max(sizes), 'total': sum(sizes)},
    }
    (OUT / 'meta.json').write_text(dump(meta), encoding='utf-8')
    print(f'data/crossing: {len(ids)} centers, {len(divided)} with land across a river within 5 km ({len(river) - len(divided)} more with a river that divides nothing in reach) · changed residents {changed["res"]}, '
          f'visitors {changed["vis"]}, work {changed["work"]} · ranks moved {moved} · shards {sum(sizes):,} bytes (max {max(sizes):,})')


if __name__ == '__main__':
    main()

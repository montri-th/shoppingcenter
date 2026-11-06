#!/usr/bin/env python3
"""LOD1 building masses from a SketchUp 2021+ file (.skp): model metres in, <venue_id>.masses.json out.

usage: python3 -I scripts/skp-masses.py <file.skp> <venue_id> <out dir> --bounds x0 y0 x1 y1 [--skip-groups 12,22]
       [--groups 0,1,2] [--res 0.5] [--list]

A .skp file of SketchUp 2021 and later is a header followed by a ZIP; its model.dat is a tree of records (2-byte tag,
4-byte little-endian length). This reader knows only what the masses need, read from the files themselves (SketchUp
25.0): component definitions (01f9/1770/1771/157c: 157e name, 1388 entities), root entities (01f6/1388), tags
(01f8: 3c8c records, 3c8d name, 3c8e = 1 when hidden), vertices (1389/09c4/09c5: 3 doubles, inches), edges
(138a/0bb8: 0bb9, 0bba vertex ids), faces (138b/0dac: loops 0dae/1194/1195/0fa0 = edge 0fa1 + reversed 0fa2),
instances and groups (138c/1964, 138d/1d4c/1964: 1966 transform of 13 doubles, 1967 definition id) and the entity
header 07d0 (05dc/05de id, 07d2 tag, 07d3 flags: bit 0 hidden). It is not a general SketchUp reader.

Masses: a 0.5 m height field of the chosen top-level groups (roof-like faces: |nz| ≥ 0.15; walls give their lowest
point), people, plants, cars, furniture and signs left out by definition name, hidden tags and entities left out;
the ground is the height holding most low roof-like area; cells ≥ 2.5 m above it, in 1.5 m height bands, become
regions (opened by one cell, ≥ 12 m², simplified 0.6 m); a region is a floating slab (canopy, bridge) when its lowest
surface stands more than 2.5 m up and walls reach the ground along under 15 % of its edge — its base is then that
surface. Heights are the design's, never a survey.
"""
import argparse, io, json, math, os, re, struct, sys, zipfile

import numpy as np
from scipy import ndimage
from shapely.geometry import MultiPolygon, Polygon
from skimage import measure
from skimage.draw import line as skline
from skimage.draw import polygon as skpoly

IN = 0.0254
ENTOURAGE = re.compile(r'thomthom|people|person|human|\bman\b|woman|child|tree|palm|plant|grass|bush|shrub|flower|calamagrostis|'
                       r'creeper|leaf|leaves|fur_instance|\bcar\b|car \d|vehicle|\bbus\b|truck|motor|bike|bicycle|scooter|lamp|light|'
                       r'fountain|chair|table|bench|umbrella|stone|rock|\bpot\b|planter|furniture|sofa|stool|parasol|sign|billboard|'
                       r'spider|cloud', re.I)


def kids(m, a, b):
    p = a
    while p + 6 <= b:
        t, n = struct.unpack_from('<HI', m, p)
        yield t, p + 6, p + 6 + n
        p += 6 + n


def first(m, a, b, tag):
    return next(((x, y) for t, x, y in kids(m, a, b) if t == tag), None)


def uid(m, a, b):
    return int.from_bytes(m[a:b], 'little')


def base(m, a, b):
    out = {}
    for t, x, y in kids(m, a, b):
        if t == 0x05dc:
            r = first(m, x, y, 0x05de)
            if r: out['id'] = uid(m, *r)
        elif t == 0x07d2: out['tag'] = uid(m, x, y)
        elif t == 0x07d3: out['flags'] = uid(m, x, y)
    return out


def entities(m, a, b):
    d = {'verts': {}, 'edges': {}, 'faces': [], 'instances': []}
    for t, x, y in kids(m, a, b):
        if t == 0x07d0: d['base'] = base(m, x, y)
        elif t == 0x1389:
            for t2, x2, y2 in kids(m, x, y):
                if t2 != 0x09c4: continue
                vid = pos = None
                for t3, x3, y3 in kids(m, x2, y2):
                    if t3 == 0x05dc:
                        r = first(m, x3, y3, 0x05de); vid = uid(m, *r) if r else None
                    elif t3 == 0x09c5 and y3 - x3 == 24: pos = struct.unpack_from('<3d', m, x3)
                if vid is not None and pos is not None: d['verts'][vid] = pos
        elif t == 0x138a:
            for t2, x2, y2 in kids(m, x, y):
                if t2 != 0x0bb8: continue
                e = {}
                for t3, x3, y3 in kids(m, x2, y2):
                    if t3 == 0x07d0: e.update(base(m, x3, y3))
                    elif t3 == 0x0bb9: e['v1'] = uid(m, x3, y3)
                    elif t3 == 0x0bba: e['v2'] = uid(m, x3, y3)
                if 'id' in e: d['edges'][e['id']] = e
        elif t == 0x138b:
            for t2, x2, y2 in kids(m, x, y):
                if t2 != 0x0dac: continue
                fc = {'loops': []}
                for t3, x3, y3 in kids(m, x2, y2):
                    if t3 == 0x07d0: fc.update(base(m, x3, y3))
                    elif t3 == 0x0dae:
                        for t4, x4, y4 in kids(m, x3, y3):
                            if t4 != 0x1194: continue
                            r = first(m, x4, y4, 0x1195)
                            if not r: continue
                            loop = []
                            for t5, x5, y5 in kids(m, *r):
                                if t5 != 0x0fa0: continue
                                eid = rev = None
                                for t6, x6, y6 in kids(m, x5, y5):
                                    if t6 == 0x0fa1: eid = uid(m, x6, y6)
                                    elif t6 == 0x0fa2: rev = m[x6]
                                loop.append((eid, rev))
                            fc['loops'].append(loop)
                d['faces'].append(fc)
        elif t in (0x138c, 0x138d):
            for t2, x2, y2 in kids(m, x, y):
                rec = (x2, y2) if t2 == 0x1964 else first(m, x2, y2, 0x1964) if t2 == 0x1d4c else None
                if not rec: continue
                inst = {}
                for t4, x4, y4 in kids(m, *rec):
                    if t4 == 0x07d0: inst.update(base(m, x4, y4))
                    elif t4 == 0x1966: inst['xf'] = struct.unpack_from(f'<{(y4 - x4) // 8}d', m, x4)
                    elif t4 == 0x1967: inst['def'] = uid(m, x4, y4)
                d['instances'].append(inst)
    return d


def read(path):
    raw = open(path, 'rb').read()
    m = zipfile.ZipFile(io.BytesIO(raw)).read('model.dat')
    top = {t: (a, b) for t, a, b in kids(m, 6, len(m))}
    defs = {}
    r = first(m, *first(m, *top[0x01f9], 0x1770), 0x1771)
    for t, x, y in kids(m, *r):
        if t != 0x157c: continue
        name, ents = '', None
        for t2, x2, y2 in kids(m, x, y):
            if t2 == 0x1388: ents = entities(m, x2, y2)
            elif t2 == 0x157e: name = bytes(m[x2:y2]).decode('utf-8', 'replace')
        if ents:
            ents['name'] = name
            defs[ents.get('base', {}).get('id')] = ents
    root = entities(m, *first(m, *top[0x01f6], 0x1388))
    hidden = set()
    def tags(a, b):
        for t, x, y in kids(m, a, b):
            if t in (0x3a98, 0x3a99): tags(x, y)
            elif t == 0x3c8c:
                lid = flag = None
                for t2, x2, y2 in kids(m, x, y):
                    if t2 == 0x05dc:
                        q = first(m, x2, y2, 0x05de); lid = uid(m, *q)
                    elif t2 == 0x3c8e: flag = m[x2]
                if flag: hidden.add(lid)
    tags(*top[0x01f8])
    return defs, root, hidden


def polys(d):
    if '_polys' in d: return d['_polys']
    V, E, out = d['verts'], d['edges'], []
    for fc in d['faces']:
        if not fc['loops']: continue
        pts = []
        for eid, rev in fc['loops'][0]:
            e = E.get(eid)
            if not e or e.get('v1') not in V or e.get('v2') not in V: pts = []; break
            pts.append(V[e['v2'] if rev else e['v1']])
        if len(pts) >= 3: out.append((np.array(pts) * IN, fc))
    d['_polys'] = out
    return out


def xform(xf):
    if not xf or len(xf) < 12: return np.eye(3), np.zeros(3)
    M = np.array([[xf[0], xf[3], xf[6]], [xf[1], xf[4], xf[7]], [xf[2], xf[5], xf[8]]])
    w = xf[12] if len(xf) > 12 and xf[12] else 1.0
    return M / w, np.array(xf[9:12]) * IN / w


def rasters(defs, root, hidden, groups, bounds, res):
    x0, y0, x1, y1 = bounds
    nx, ny = int((x1 - x0) / res) + 1, int((y1 - y0) / res) + 1
    zmax = np.full((ny, nx), -np.inf, np.float32); zlow = np.full((ny, nx), np.inf, np.float32); wlow = np.full((ny, nx), np.inf, np.float32)
    roofs = []
    def walk(ents, M, t, depth=0):
        for loc, fc in polys(ents):
            if fc.get('flags', 6) & 1 or fc.get('tag') in hidden: continue
            p = loc @ M.T + t
            if p[:, 0].max() < x0 or p[:, 0].min() > x1 or p[:, 1].max() < y0 or p[:, 1].min() > y1: continue
            nv = np.cross(p[1:-1] - p[0], p[2:] - p[0]).sum(0); nn = np.linalg.norm(nv)
            if nn < 1e-9: continue
            r, c = (p[:, 1] - y0) / res, (p[:, 0] - x0) / res
            zt, zb = float(p[:, 2].max()), float(p[:, 2].min())
            if abs(nv[2]) / nn >= 0.15:
                rr, cc = skpoly(r, c, shape=zmax.shape)
                if not len(rr):
                    rr = np.clip(np.round(np.append(r, r.mean())).astype(int), 0, ny - 1); cc = np.clip(np.round(np.append(c, c.mean())).astype(int), 0, nx - 1)
                np.maximum.at(zmax, (rr, cc), zt); np.minimum.at(zlow, (rr, cc), zb)
                roofs.append((zt, 0.5 * nn))
            else:
                ri, ci = np.clip(np.round(r).astype(int), 0, ny - 1), np.clip(np.round(c).astype(int), 0, nx - 1)
                for k in range(len(p)):
                    lr, lc = skline(ri[k], ci[k], ri[(k + 1) % len(p)], ci[(k + 1) % len(p)])
                    np.minimum.at(wlow, (lr, lc), zb)
        if depth > 30: return
        for inst in ents['instances']:
            if inst.get('flags', 6) & 1 or inst.get('tag') in hidden: continue
            d = defs.get(inst.get('def'))
            if d is None or ENTOURAGE.search(d.get('name', '') or ''): continue
            Mi, ti = xform(inst.get('xf'))
            walk(d, M @ Mi, M @ ti + t, depth + 1)
    for gi, inst in enumerate(root['instances']):
        if gi not in groups or inst.get('flags', 6) & 1 or inst.get('tag') in hidden: continue
        d = defs.get(inst.get('def'))
        if d is None: continue
        Mi, ti = xform(inst.get('xf'))
        walk(d, Mi, ti)
    return zmax, zlow, wlow, roofs


def ground(roofs):
    z = np.array([r[0] for r in roofs]); a = np.array([r[1] for r in roofs])
    lo = np.percentile(z, 2); sel = z <= lo + 6
    h, e = np.histogram(z[sel], bins=np.arange(lo - 0.25, lo + 6.25, 0.25), weights=a[sel])
    k = int(np.argmax(h))
    return float((e[k] + e[k + 1]) / 2)


def masses(zmax, zlow, wlow, z0, bounds, res, min_h=2.5, band=1.5, min_area=12.0, tol=0.6):
    x0, y0 = bounds[0], bounds[1]
    h = np.where(np.isfinite(zmax), zmax - z0, 0.0)
    built = ndimage.binary_opening(h >= min_h, iterations=1)
    q = np.where(built, np.round(h / band) * band, 0.0)
    regions = []
    for level in sorted(set(np.unique(q)) - {0.0}):
        comp, n = ndimage.label(q == level)
        for k in range(1, n + 1):
            m = comp == k
            if m.sum() * res * res < min_area: continue
            top = float(np.percentile(h[m], 90))
            low = zlow[m] - z0; low = low[np.isfinite(low)]
            edge = ndimage.binary_dilation(m, iterations=2) & ~ndimage.binary_erosion(m, iterations=1)
            wl = wlow[edge]; wl = wl[np.isfinite(wl)] - z0
            lowmed = float(np.median(low)) if len(low) else 0.0
            grounded = float((wl <= 1.2).mean()) if len(wl) else 0.0
            b = round(min(lowmed, top - 0.5), 1) if lowmed > 2.5 and grounded < 0.15 else 0.0
            shape = None
            for c in measure.find_contours(np.pad(m, 1).astype(float), 0.5):
                g = Polygon(np.c_[x0 + (c[:, 1] - 1) * res, y0 + (c[:, 0] - 1) * res]).buffer(0)
                if g.is_empty: continue
                shape = g if shape is None else shape.symmetric_difference(g)
            if shape is None: continue
            shape = shape.simplify(tol, preserve_topology=True).buffer(0)
            for p in (shape.geoms if isinstance(shape, MultiPolygon) else [shape]):
                if p.geom_type == 'Polygon' and p.area >= min_area:
                    regions.append({'outer': [[round(x, 2), round(y, 2)] for x, y in p.exterior.coords],
                                    'holes': [[[round(x, 2), round(y, 2)] for x, y in r.coords] for r in p.interiors],
                                    'base': b, 'top': round(top, 1)})
    return regions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('skp'); ap.add_argument('venue_id'); ap.add_argument('out')
    ap.add_argument('--bounds', nargs=4, type=float)
    ap.add_argument('--groups', default=''); ap.add_argument('--skip-groups', default='')
    ap.add_argument('--res', type=float, default=0.5); ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    defs, root, hidden = read(a.skp)
    if a.list:
        for gi, inst in enumerate(root['instances']):
            print(gi, (defs.get(inst.get('def'), {}).get('name') or '')[:40], 'hidden' if inst.get('flags', 6) & 1 or inst.get('tag') in hidden else '')
        return
    if not a.bounds: sys.exit('--bounds x0 y0 x1 y1 (model metres) is required')
    all_groups = set(range(len(root['instances'])))
    groups = {int(g) for g in a.groups.split(',') if g} or all_groups
    groups -= {int(g) for g in a.skip_groups.split(',') if g}
    zmax, zlow, wlow, roofs = rasters(defs, root, hidden, groups, a.bounds, a.res)
    z0 = ground(roofs)
    regions = masses(zmax, zlow, wlow, z0, a.bounds, a.res)
    os.makedirs(a.out, exist_ok=True)
    json.dump({'ground_m': round(z0, 2), 'groups': sorted(groups), 'bounds': a.bounds, 'masses': regions},
              open(os.path.join(a.out, f'{a.venue_id}.masses.json'), 'w'))
    print(f'{a.venue_id}: ground {z0:.2f} m, {len(regions)} masses, {sum(Polygon(r["outer"]).area for r in regions):,.0f} m²')


if __name__ == '__main__':
    main()

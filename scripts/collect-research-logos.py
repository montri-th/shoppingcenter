#!/usr/bin/env python3
"""Brand logos of the research datasets in the shop lists, byte for byte from the files their sheets recorded.

  python3 -I scripts/collect-research-logos.py --brands <dir> --exported-on YYYY-MM-DD --files <dir|zip> [--files …]

Owner 2026-11-05 00:34: “เช็ค Logo จากแบรนด์ต่างๆใน dataset อื่นๆใน dataset registry ที่มีการ update เมื่อสักครู่นี้ แล้วเพิ่ม
logo ให้ครบถ้วน”. <dir>/<folder>/01_BRANDS.csv is the 01_BRANDS tab of each research master of
scripts/link-research-tenants.py#ADAPTERS (UTF-8 CSV with its header). `--files` are folders or ZIP packs holding the
logo files the research team collected; a file is used only when its bytes have the SHA-256 the sheet records for the
brand (`logo_sha256`), never by name. Only the brand's own primary mark: shared chain banners, parent-complex or
venue marks, context or fallback logos and logos still under decision stay out (as for MLA and Fitness). The sheets,
packs and Drive files stay outside this repository; only the logo bytes, their public source page and asset URL, the
check date and the export's SHA-256 are published.

Writes assets/tenant-logos/<sha first 20>.<ext> and the "<dataset>|<brandId>" entries of
assets/tenant-logos-manifest.json (other datasets' entries untouched), with the backing the panel draws under the
logo: the sheet's stated surface when it gives one, else read from the image (white or dark canvas kept; light marks
on a transparent canvas get the dark plate; an SVG is read from its Chromium render, scripts/render-svg-logos.cjs, when
given). Run after scripts/link-dataset-tenants.py and before
scripts/link-research-tenants.py, which attaches the verified logos to the items.
"""
import argparse, collections, csv, glob, hashlib, importlib.util, io, json, re, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('research_link', Path(__file__).with_name('link-research-tenants.py'))
link = importlib.util.module_from_spec(spec)
spec.loader.exec_module(link)
builder = link.builder

LIGHT, PLATE, DARK = '#E5E9E6', '#FFFFFF', '#182327'   # surface-soft (the panel default), white, the dark plate
EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg'}
HELD_STATUS = {'collected_context', 'collected_parent_fallback', 'needs_decision', 'ต้องยืนยันตัวตนก่อนจับคู่', 'not_found', 'not_collected', 'ยังไม่ได้เก็บ',
               'ยังหาไฟล์ที่เหมาะสมไม่พบ'}


def logo_role(notes):
    """The role a sheet records for a logo file, across the masters' wordings ('' when it states none)."""
    n = notes or ''
    m = re.search(r'(?:logo_role|role|บทบาทโลโก้|บทบาท)\s*[=:]\s*([A-Za-z_]+)', n)
    if m:
        return m.group(1).lower()
    m = re.search(r'บทบาท\s*:\s*([^|·;\n]+)', n)
    if m:
        t = m.group(1).strip()
        return 'brand_primary' if t.startswith('โลโก้ตรงแบรนด์') else 'shared_mark' if t.startswith('เครื่องหมายที่ใช้ร่วมกัน') else 'th:' + t
    if n.strip().startswith('โลโก้ตรงแบรนด์'):
        return 'brand_primary'
    if n.strip().startswith('ตราร่วม'):
        return 'shared_mark'
    return ''


def stated_surface(notes):
    """'light' / 'dark' when the sheet states the one surface a mark is drawn for; '' when it states either surface
    (light_or_dark, light_and_dark, any, "checked on light and dark backgrounds") or nothing — then the image decides."""
    n = notes or ''
    m = re.search(r'surface\s*=\s*([A-Za-z_]+)', n)
    if m:
        v = m.group(1).lower()
        if v in ('dark', 'dark_neutral', 'dark_or_mid_neutral'):
            return 'dark'
        if v in ('light', 'neutral_or_light', 'light_or_neutral'):
            return 'light'
        return ''
    m = re.search(r'พื้นหลัง\s*:\s*([^;|·\n]+)', n)
    if m:
        v = m.group(1).strip()
        return 'dark' if v.startswith(('พื้นมืด', 'พื้นเข้ม')) else 'light' if v.startswith('พื้นสว่าง') else ''
    if re.search(r'light and dark|light or dark|light/dark', n, re.I):
        return ''
    if re.search(r'(?:use|recommended|visible|inspected)\s+on\s+(?:a\s+)?dark|dark background for|use dark background|พื้นแนะนำ\s*:\s*dark', n, re.I):
        return 'dark'
    return ''


def sniff(data):
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    head = data[:2048].decode('utf-8', 'ignore').lower()
    if '<svg' in head or ('<?xml' in head and '<svg' in data[:65536].decode('utf-8', 'ignore').lower()):
        return 'image/svg+xml'
    return ''


SVG_SIZE = re.compile(r'<svg\b[^>]*>', re.I | re.S)


def svg_size(text):
    tag = SVG_SIZE.search(text)
    tag = tag.group(0) if tag else ''
    num = lambda name: (m := re.search(rf'\b{name}\s*=\s*["\']\s*([0-9.]+)\s*(px)?\s*["\']', tag)) and float(m.group(1))
    w, h = num('width'), num('height')
    vb = re.search(r'viewBox\s*=\s*["\']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)', tag)
    if (not w or not h) and vb:
        w, h = float(vb.group(1)), float(vb.group(2))
    return (round(w, 2), round(h, 2)) if w and h else (None, None)


def contrast(a, b):
    """WCAG contrast ratio of two relative luminances."""
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def lost_shares(lums):
    """(on the soft surface, on the dark plate): the share of the mark's outline pixels (or colours) that would nearly
    vanish — contrast under 2:1."""
    if not lums:
        return 0.0, 0.0
    return (sum(1 for v in lums if contrast(v, L_LIGHT) < 2) / len(lums), sum(1 for v in lums if contrast(v, L_DARK) < 2) / len(lums))


def plate_for(lost):
    """The plate a mark reads on. The dark plate when at least a fifth of the mark's outline would nearly vanish on the
    soft surface (white, light grey, pastel, gold) and almost none of it (5 % or less) on the dark plate (black text, navy
    outlines); otherwise the soft surface."""
    lost_light, lost_dark = lost
    return DARK if lost_light >= 0.2 and lost_dark <= 0.05 else LIGHT


def luminance(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


L_LIGHT, L_DARK = (luminance(tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))) for c in (LIGHT, DARK))


def svg_colours(text):
    out = []
    for m in re.finditer(r'(?:fill|stroke|stop-color|color)\s*[:=]\s*["\']?\s*(#[0-9a-f]{3,8}\b|rgb\([^)]*\)|white|black)', text, re.I):
        v = m.group(1).lower()
        if v == 'white':
            out.append((255, 255, 255))
        elif v == 'black':
            out.append((0, 0, 0))
        elif v.startswith('#'):
            h = v[1:]
            if len(h) in (3, 4):
                h = ''.join(c * 2 for c in h[:3])
            if len(h) >= 6:
                out.append(tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)))
        else:
            nums = [float(x) for x in re.findall(r'[0-9.]+', v)[:3]]
            if len(nums) == 3:
                out.append(tuple(int(x) for x in nums))
    return out


def raster_backing(data):
    """(width, height, backing) of a raster logo: an opaque canvas keeps its tone; on a transparent canvas plate_for
    decides from the mark's own pixels."""
    from PIL import Image
    im = Image.open(io.BytesIO(data))
    w, h = im.size
    if getattr(im, 'n_frames', 1) > 1:
        im.seek(0)
    im = im.convert('RGBA')
    im.thumbnail((256, 256))
    px = im.load()
    W, H = im.size
    ring = [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
    border = [px[x, y] for x, y in ring]
    opaque = [p for p in border if p[3] >= 250]
    if len(opaque) >= 0.9 * len(border):
        lum = sum(luminance(p) for p in opaque) / len(opaque)
        return w, h, PLATE if lum >= 0.85 else DARK if lum <= 0.2 else LIGHT, None
    # Only the mark's outline meets the plate: a pixel of the mark next to a transparent one (or the canvas edge).
    # Black text inside a white badge never touches the plate, so it does not vote.
    edge = []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] >= 128 and (x in (0, W - 1) or y in (0, H - 1) or min(px[x - 1, y][3], px[x + 1, y][3], px[x, y - 1][3], px[x, y + 1][3]) < 128):
                edge.append(luminance(px[x, y]))
    lost = lost_shares(edge)
    return w, h, plate_for(lost), lost


NOT_DRAWN = re.compile(r'<(clipPath|mask|defs|title|desc|metadata)\b.*?</\1>', re.I | re.S)
SHAPE = re.compile(r'<(path|rect|circle|ellipse|polygon|polyline|text|use)\b([^>]*)>', re.I | re.S)


def svg_backing(text):
    """(width, height, backing) of an SVG logo from the colours it paints (plate_for, one vote per colour). What is not
    drawn (clip paths, masks, definitions) is left out; `currentColor` and shapes with no fill paint black in an image."""
    w, h = svg_size(text)
    drawn = NOT_DRAWN.sub('', text)
    drawn = re.sub(r'(fill|stroke)\s*[:=]\s*["\']?\s*none\b', '', drawn, flags=re.I)
    colours = svg_colours(drawn)
    colours += [(0, 0, 0)] * len(re.findall(r'(?:fill|stroke)\s*[:=]\s*["\']?\s*currentColor', drawn, re.I))
    styled = bool(re.search(r'<style\b[^>]*>[^<]*fill\s*:', drawn, re.I))
    if not styled:
        colours += [(0, 0, 0) for _, attrs in SHAPE.findall(drawn) if not re.search(r'\bfill\s*=|fill\s*:', attrs, re.I)]
    lost = lost_shares([luminance(c) for c in colours])
    return w, h, plate_for(lost), lost


def index_files(paths):
    """SHA-256 → bytes of every file in the given folders and ZIP packs."""
    found = {}
    for path in paths:
        p = Path(path)
        items = []
        if p.is_dir():
            items = [(f.name, f.read_bytes()) for f in sorted(p.rglob('*')) if f.is_file()]
            for f in sorted(p.rglob('*.zip')):
                with zipfile.ZipFile(f) as z:
                    items += [(i.filename, z.read(i)) for i in z.infolist() if not i.is_dir()]
        elif p.suffix.lower() == '.zip':
            with zipfile.ZipFile(p) as z:
                items = [(i.filename, z.read(i)) for i in z.infolist() if not i.is_dir()]
        for _, data in items:
            found.setdefault(hashlib.sha256(data).hexdigest(), data)
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--brands', required=True, help='directory with <folder>/01_BRANDS.csv per research dataset')
    ap.add_argument('--exported-on', required=True)
    ap.add_argument('--files', action='append', required=True, help='folder or ZIP pack of logo files (repeatable)')
    ap.add_argument('--svg-renders', help='PNG renders of the SVG logos (scripts/render-svg-logos.cjs): the backing is read from what they paint')
    ap.add_argument('--tenants', default=str(ROOT / 'data/tenants'))
    ap.add_argument('--manifest', default=str(ROOT / 'assets/tenant-logos-manifest.json'))
    a = ap.parse_args()
    if not builder.iso_date(a.exported_on):
        raise SystemExit('--exported-on must be an ISO date')

    used = collections.defaultdict(collections.Counter)
    for path in sorted(Path(a.tenants).glob('[0-9][0-9].json')):
        for roster in json.loads(path.read_text())['venues'].values():
            for item in roster['items']:
                if item['dataset'] in link.ADAPTERS:
                    used[item['dataset']][item.get('brandId', '')] += 1
    files = index_files(a.files)
    manifest = json.loads(Path(a.manifest).read_text())
    manifest = {k: v for k, v in manifest.items() if k.split('|')[0] not in link.ADAPTERS}
    report, receipts = {}, {}
    for dataset, adapter in link.ADAPTERS.items():
        path = Path(a.brands) / adapter['folder'] / '01_BRANDS.csv'
        counts = collections.Counter()
        if not path.is_file():
            report[dataset] = {'brands': len(used[dataset]), 'noExport': True}
            continue
        raw = path.read_bytes()
        rows = {r.get('brand_id', '').strip(): r for r in csv.DictReader(raw.decode('utf-8-sig').splitlines())}
        receipts[dataset] = {'file': '01_BRANDS.csv', 'sha256': hashlib.sha256(raw).hexdigest(), 'exportedOn': a.exported_on}
        for brand_id in sorted(used[dataset]):
            r = rows.get(brand_id)
            sha = (r.get('logo_sha256') or '').strip().lower() if r else ''
            if not r or not re.fullmatch(r'[0-9a-f]{64}', sha):
                counts['noLogo'] += 1
                continue
            role, status = logo_role(r.get('logo_notes')), (r.get('logo_status') or '').strip()
            if role != 'brand_primary' or status in HELD_STATUS:
                counts['heldNotBrandPrimary'] += 1
                continue
            data = files.get(sha)
            if data is None:
                counts['fileNotSupplied'] += 1
                continue
            mime = sniff(data)
            if mime not in EXT:
                counts['unknownFormat'] += 1
                continue
            if mime == 'image/svg+xml':
                text = data.decode('utf-8', 'ignore')
                if re.search(r'<script|\bon[a-z]+\s*=|javascript:', text, re.I):
                    counts['svgWithScript'] += 1
                    continue
                width, height, backing, lost = svg_backing(text)
                render = Path(a.svg_renders) / f'{sha[:20]}.png' if a.svg_renders else None
                if render and render.is_file():
                    _, _, backing, lost = raster_backing(render.read_bytes())
            else:
                width, height, backing, lost = raster_backing(data)
            # The sheet's stated surface decides, unless the image shows the mark would nearly vanish on it (a fifth of
            # its outline under 2:1): then the image decides and the conflict is counted for the research team.
            surface = stated_surface(r.get('logo_notes'))
            if surface == 'dark':
                if lost and lost[1] >= 0.2:
                    counts['surfaceConflict'] += 1
                else:
                    backing = DARK
            elif surface == 'light' and backing == DARK:
                if lost and lost[0] >= 0.2:
                    counts['surfaceConflict'] += 1
                else:
                    backing = LIGHT
            file = f'assets/tenant-logos/{sha[:20]}.{EXT[mime]}'
            (ROOT / file).write_bytes(data)
            entry = {'file': file, 'sha256': sha, 'mime': mime, 'width': width, 'height': height, 'background': backing,
                     'sourceUrl': builder.public_url(r.get('logo_source_url')), 'assetUrl': builder.public_url(r.get('logo_asset_url')),
                     'checkedOn': link.iso(r.get('logo_checked_on')) or None,
                     'origin': f'{adapter["title"]} · 01_BRANDS export {a.exported_on}'}
            manifest[f'{dataset}|{brand_id}'] = {k: v for k, v in entry.items() if v is not None}
            counts['files'] += 1
        report[dataset] = {'brands': len(used[dataset]), **dict(counts)}
    Path(a.manifest).write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n')
    # Receipt in the roster's build report (scripts/link-research-tenants.py keeps it and counts the items with a logo).
    report_path = Path(a.tenants) / 'build-report.json'
    build_report = json.loads(report_path.read_text())
    build_report['researchLogos'] = {'exportedOn': a.exported_on, 'rule': 'logo bytes equal the sheet SHA-256 (logo_sha256); brand_primary role only',
                                     'manifestSha256': hashlib.sha256(Path(a.manifest).read_bytes()).hexdigest(), 'datasets': report, 'exports': receipts}
    report_path.write_text(json.dumps(build_report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()

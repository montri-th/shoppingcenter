#!/usr/bin/env python3
"""Brand logos from the research masters' logo libraries, byte for byte as the sheets recorded them (D66, owner 2026-11-24).

  python3 -I scripts/add-library-logos.py --master optical=<xlsx> [--master …] --files <dir> --exported-on YYYY-MM-DD \
      [--svg-renders <dir of scripts/render-svg-logos.cjs output>]

Owner 2026-11-24 07:53, VERBATIM: “ทำไมหลายร้านในศูนย์การค้าเราควรจะมี logo แล้ว แต่เวบเดโมไม่แสดงโลโก้ แก้ให้ครบทุก venue
และตรวจใน dataset อื่นๆด้วยในเคสนี้หาวิธีแก้ที่แก้ได้ทุกที่เหมือนกัน”; 11:11 “เริ่มเลย” (bring in the research masters'
logo libraries). After D64 the shops left without a logo were mostly brands no demo shipped a file for: Miscellaneous,
Optical, Beauty Clinic and Hobby. Their research masters record a logo per brand with its SHA-256; the files sit in the
masters' logo folders on Drive.

--master <dataset folder>=<xlsx export of the research master> (kept outside the repository): the tab that holds
brand_id and logo_sha256 (01_BRANDS, or 17_BRAND_LOGOS for Beauty Clinic). --files: a folder of downloaded logo files (the
files the logo manifest already ships count too); a file is used only when its SHA-256 equals the sheet's logo_sha256
for that brand — never by name. Only collected files
of the brand's own primary mark (logo_role, or the first token of logo_notes, = brand_primary); shared chain banners,
shared wordmarks, parent and context marks stay out. The backing is chosen as scripts/collect-research-logos.py chooses it
(the sheet's stated surface — recommended_surface on 17_BRAND_LOGOS, else logo_notes — unless the image shows the mark
would nearly vanish on it, counted as surfaceConflict; SVGs read from their render). Only brands that the shop lists name (data/tenants/,
data/directory/). An entry the logo manifest already has is never replaced, so the collectors' entries and their
receipts stay as they are (run this after scripts/collect-research-logos.py).

Writes assets/tenant-logos/<sha first 20>.<ext>, adds "<dataset>|<brandId>" entries to assets/tenant-logos-manifest.json,
and writes data/logo-links/library-receipt.json (masters, tabs, export SHA-256, counts, the manifest's SHA-256). Then run
scripts/attach-family-logos.py: the kit links these brands' shops by their own id (basis own). Collecting a file is not a
trademark licence.
"""
import argparse
import collections
import hashlib
import importlib.util
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts' / 'logo-kit'))
import citymeter_logos as kit  # noqa: E402

# The backing under a logo follows scripts/collect-research-logos.py (0.1.9) to the letter: the sheet's stated surface
# decides unless the image shows the mark would nearly vanish on it; an SVG is read from its Chromium render.
_spec = importlib.util.spec_from_file_location('collect_research_logos', ROOT / 'scripts' / 'collect-research-logos.py')
collect = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(collect)

TITLES = {
    'optical': 'CityMETER Optical Shops Thailand — Research Master 2026-10-23',
    'miscellaneous': 'CityMETER Miscellaneous Thailand — Research Master',
    'hobby': 'CityMETER Hobby Stores Thailand — Research Master 2026-11-05',
    'beauty_clinic': 'CityMETER Beauty Clinic Thailand — Research Master 2026-11-03',
}
OK_STATUS = {'collected', 'ได้ไฟล์โลโก้'}
ROLES = ('brand_primary', 'shared_chain_banner', 'shared_brand_wordmark', 'shared_mark', 'parent_complex', 'context')
EXT = {'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'}
PRIVATE = re.compile(r'(^|\.)(drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com|googleusercontent\.com|localhost)$')


def public_url(value):
    if not isinstance(value, str) or not value.startswith('https://'):
        return None
    host = (urlparse(value).hostname or '').lower()
    return value if '.' in host and not PRIVATE.search(host) else None


def role_of(row):
    explicit = (row.get('logo_role') or '').strip().lower()
    if explicit:
        return explicit
    for token in (row.get('logo_notes') or '').split('·')[:3]:
        t = token.strip().lower()
        if t in ROLES:
            return t
    return ''


def stated(row):
    """'light' / 'dark' when the sheet states the one surface a mark is drawn for, else '' (the image decides)."""
    rec = str(row.get('recommended_surface') or '').strip().lower()
    if rec:
        first = rec.split(';')[0].strip()
        return first if first in ('light', 'dark') else ''
    return collect.stated_surface(str(row.get('logo_notes') or ''))


def backing_of(raw, mime, sha, renders, surface, counts):
    """(width, height, backing) by the rule of scripts/collect-research-logos.py."""
    if mime == 'image/svg+xml':
        width, height, backing, lost = collect.svg_backing(raw.decode('utf-8', 'ignore'))
        render = Path(renders) / f'{sha[:20]}.png' if renders else None
        if render and render.is_file():
            _, _, backing, lost = collect.raster_backing(render.read_bytes())
        else:
            counts['svgWithoutRender'] += 1
    else:
        width, height, backing, lost = collect.raster_backing(raw)
    if surface == 'dark':
        if lost and lost[1] >= 0.2:
            counts['surfaceConflict'] += 1
        else:
            backing = collect.DARK
    elif surface == 'light' and backing == collect.DARK:
        if lost and lost[0] >= 0.2:
            counts['surfaceConflict'] += 1
        else:
            backing = collect.LIGHT
    return width, height, backing


def master_rows(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for ws in wb.worksheets:
        it = ws.iter_rows(values_only=True)
        head = [str(c).strip() if c is not None else '' for c in next(it, ())]
        if 'brand_id' in head and 'logo_sha256' in head:
            rows = [{h: v for h, v in zip(head, r) if h} for r in it if r and any(v not in (None, '') for v in r)]
            return ws.title, rows
    sys.exit(f'{path}: no tab with brand_id and logo_sha256')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--master', action='append', required=True, help='<dataset folder>=<xlsx export>')
    ap.add_argument('--files', required=True)
    ap.add_argument('--exported-on', required=True)
    ap.add_argument('--svg-renders', help='PNG renders of the SVG files (scripts/render-svg-logos.cjs): the backing is read from what they paint')
    a = ap.parse_args()
    # Files this repository already ships count too (the same bytes, e.g. a brand another dataset's logo already
    # brought in); then the downloaded folder. Found by SHA-256 only.
    manifest_path = ROOT / 'assets' / 'tenant-logos-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    shipped = {v['sha256'] for v in manifest.values() if (ROOT / v['file']).is_file() and kit.sha256_file(ROOT / v['file']) == v['sha256']}
    files = {}
    for v in manifest.values():
        if v['sha256'] in shipped:
            files.setdefault(v['sha256'], ROOT / v['file'])
    for p in sorted(Path(a.files).iterdir()):
        if p.is_file():
            files.setdefault(kit.sha256_file(p), p)
    named = collections.defaultdict(set)
    for folder in ('tenants', 'directory'):
        for n in range(32):
            for venue in json.loads((ROOT / 'data' / folder / f'{n:02d}.json').read_text(encoding='utf-8')).get('venues', {}).values():
                for item in venue.get('items', []):
                    if item.get('brandId') and item.get('dataset'):
                        named[item['dataset']].add(item['brandId'])
    receipt = {}
    for spec in a.master:
        folder, _, path = spec.partition('=')
        if folder not in TITLES:
            sys.exit(f'unknown master {folder}')
        dataset = f'research.TH.{folder}'
        tab, rows = master_rows(path)
        counts = collections.Counter()
        for r in rows:
            brand, sha = str(r.get('brand_id') or '').strip(), str(r.get('logo_sha256') or '').strip().lower()
            if not re.fullmatch(r'[0-9a-f]{64}', sha):
                continue
            counts['records'] += 1
            if brand not in named[dataset]:
                counts['notInShopLists'] += 1
                continue
            if str(r.get('logo_status') or '').strip() not in OK_STATUS:
                counts['heldStatus'] += 1
                continue
            if role_of(r) != 'brand_primary':
                counts['heldRole'] += 1
                continue
            key = f'{dataset}|{brand}'
            if key in manifest:
                counts['alreadyInManifest'] += 1
                continue
            src = files.get(sha)
            if src is None:
                counts['fileNotSupplied'] += 1
                continue
            raw = src.read_bytes()
            mime = collect.sniff(raw)
            if mime not in EXT:
                counts['unknownFormat'] += 1
                continue
            if mime == 'image/svg+xml' and re.search(r'<script|\bon[a-z]+\s*=|javascript:', raw.decode('utf-8', 'ignore'), re.I):
                counts['svgWithScript'] += 1
                continue
            width, height, background = backing_of(raw, mime, sha, a.svg_renders, stated(r), counts)
            file = f'assets/tenant-logos/{sha[:20]}.{EXT[mime]}'
            target = ROOT / file
            if target.exists() and kit.sha256_file(target) != sha:
                sys.exit(f'{file} exists with other bytes')
            target.write_bytes(raw)
            checked = str(r.get('logo_checked_on') or '')[:10]
            entry = {'file': file, 'sha256': sha, 'mime': mime, 'width': width, 'height': height, 'background': background,
                     'sourceUrl': public_url(r.get('logo_source_url')), 'assetUrl': public_url(r.get('logo_asset_url')),
                     'checkedOn': checked if re.fullmatch(r'\d{4}-\d{2}-\d{2}', checked) else None,
                     'origin': f'{TITLES[folder]} · {tab} export {a.exported_on} · logo library file, SHA-256 equal to the sheet'}
            manifest[key] = {k: v for k, v in entry.items() if v is not None}
            counts['added'] += 1
            if sha in shipped:
                counts['addedFromShippedFile'] += 1
        receipt[dataset] = {'title': TITLES[folder], 'tab': tab, 'exportSha256': kit.sha256_file(path), 'exportedOn': a.exported_on,
                            **dict(sorted(counts.items()))}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    body = {'meta': {'kit': f'{kit.KIT} {kit.VERSION}', 'exportedOn': a.exported_on,
                     'rule': 'a research master logo file is added only when its bytes equal the sheet logo_sha256 of a brand the shop lists name, '
                             'status collected, role brand_primary; an existing manifest entry is never replaced; backing as scripts/collect-research-logos.py',
                     'manifestSha256': kit.sha256_file(manifest_path)},
            'masters': receipt}
    (ROOT / 'data' / 'logo-links' / 'library-receipt.json').write_text(json.dumps(body, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()

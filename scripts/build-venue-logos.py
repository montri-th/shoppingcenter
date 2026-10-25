#!/usr/bin/env python3
"""Build the venue-logo registry (data/venue-logos.json, assets/venue-logos/, assets/venue-logos-manifest.json).

  python3 scripts/build-venue-logos.py <10_VENUE_LOGOS.csv> <dir with logo files> [<dir> ...] [--sources <json>] ...

The registry is the research sheet tab 10_VENUE_LOGOS (logo_key, venue_id, logo_filename, logo_role, logo_sha256 ...).
A file is used only when its bytes match the sheet's sha256 exactly; it is copied unchanged under the sheet's file
name. Rows whose verified file has not reached the build yet are listed in meta.pending: the venue keeps its name and
shows no logo. Lookup in the app goes by venue_id only — nothing is fuzzy-matched.

The UI backplate per mark is derived from the artwork (PIL for PNG/JPEG, a headless Chromium render for SVG):
transparent marks get the LDS surface-soft stone #E5E9E6, light transparent marks the dark #182327, opaque files keep
#FFFFFF. Collecting the files is not a trademark licence. No Drive or Docs links are written to public files.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'assets' / 'venue-logos'
STONE, DARK, WHITE = '#E5E9E6', '#182327', '#FFFFFF'
MIME = {'png': 'image/png', 'jpeg': 'image/jpeg', 'jpg': 'image/jpeg', 'svg': 'image/svg+xml', 'webp': 'image/webp'}
PRIVATE_HOSTS = re.compile(r'(^|\.)(drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com|googleusercontent\.com|localhost)$')
ROLES = {'venue_specific': 'โลโก้ของสถานที่โดยตรง', 'parent_complex': 'โลโก้โครงการแม่',
         'shared_department_store_banner': 'โลโก้ห้างสรรพสินค้าในเครือ', 'shared_chain_banner': 'โลโก้เครือ'}


def public_url(value):
    if not isinstance(value, str) or not value.startswith('http'):
        return None
    host = (urlparse(value).hostname or '').lower()
    return None if '.' not in host or PRIVATE_HOSTS.search(host) else value


def iso(value):
    from datetime import datetime
    for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(str(value).strip().split(' ')[0], fmt).date().isoformat()
        except ValueError:
            pass
    return str(value).strip() or None


def analyse_raster(path):
    from PIL import Image
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    opaque = [(r, g, b) for r, g, b, a in im.getdata() if a > 127]
    has_alpha = len(opaque) < w * h * 0.98
    if not opaque:
        return w, h, False, 1.0
    lum = sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in opaque) / (255 * len(opaque))
    return w, h, has_alpha, lum


def analyse_svgs(paths):
    from playwright.sync_api import sync_playwright
    from PIL import Image
    import base64
    import io
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 320, 'height': 160})
        for path in paths:
            data = base64.b64encode(path.read_bytes()).decode()
            page.set_content(f'<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,{data}" '
                             'style="width:320px;height:160px;object-fit:contain"></body></html>')
            page.wait_for_timeout(150)
            size = page.evaluate("(() => { const i = document.querySelector('img'); return [i.naturalWidth, i.naturalHeight]; })()")
            im = Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA')
            opaque = [(r, g, b) for r, g, b, a in im.getdata() if a > 127]
            lum = (sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in opaque) / (255 * len(opaque))) if opaque else 1.0
            results[path] = (size[0] or 0, size[1] or 0, True, lum)
        browser.close()
    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('registry_csv')
    ap.add_argument('dirs', nargs='+')
    ap.add_argument('--sources', action='append', default=[],
                    help='earlier registry (data/venue-logos.json) or logo manifest with source_page/asset_url per logo_key; repeatable')
    args = ap.parse_args()

    sheet = pd.read_csv(args.registry_csv, dtype=str, keep_default_na=False)
    by_sha = {}
    for d in args.dirs:
        for f in sorted(Path(d).rglob('*')):
            if f.is_file() and f.suffix.lower().lstrip('.') in MIME:
                by_sha.setdefault(hashlib.sha256(f.read_bytes()).hexdigest(), f)
    sources = {}
    for source_file in args.sources:
        m = json.loads(Path(source_file).read_text())
        for a in m.get('assets', []):           # this repository's own registry (data/venue-logos.json)
            if a.get('key') and (a.get('sourcePage') or a.get('assetURL')) and a['key'] not in sources:
                sources[a['key']] = {'sourcePage': public_url(a.get('sourcePage')), 'assetURL': public_url(a.get('assetURL'))}
        for v in m.get('venues', []):           # a research logo manifest (logo_key, source_page, asset_url)
            if v.get('logo_key') and (v.get('source_page') or v.get('asset_url')) and v['logo_key'] not in sources:
                sources[v['logo_key']] = {'sourcePage': public_url(v.get('source_page')), 'assetURL': public_url(v.get('asset_url'))}

    files = sheet.drop_duplicates('logo_key')
    found = {r.logo_key: by_sha.get(r.logo_sha256.strip().lower()) for r in files.itertuples()}
    svgs = [p for p in found.values() if p is not None and p.suffix.lower() == '.svg']
    svg_info = analyse_svgs(svgs) if svgs else {}
    raster_info = {p: analyse_raster(p) for p in found.values() if p is not None and p.suffix.lower() != '.svg'}
    # Read every verified file before the output folder is replaced: the current assets/venue-logos/ may be
    # one of the input folders (a refresh keeps the files it already has).
    blobs = {key: path.read_bytes() for key, path in found.items() if path is not None}

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)
    assets, manifest_files, pending = [], [], []
    for r in files.itertuples():
        src = found[r.logo_key]
        venues = sorted(sheet.loc[sheet.logo_key == r.logo_key, 'venue_id'].tolist())
        name = re.sub(r'[^A-Za-z0-9._-]', '-', Path(r.logo_filename.strip()).name)
        if src is None:
            pending.append({'file': name, 'logoKey': r.logo_key, 'reason': 'transfer_pending',
                            'sheetSha256': r.logo_sha256.strip().lower(), 'venues': venues})
            continue
        raw = blobs[r.logo_key]
        ext = name.rsplit('.', 1)[1].lower()
        w, h, has_alpha, lum = svg_info.get(src, (0, 0, True, 0.5)) if src.suffix.lower() == '.svg' else raster_info[src]
        background = (DARK if lum > 0.8 else STONE) if has_alpha else WHITE
        (OUT_DIR / name).write_bytes(raw)
        src_meta = sources.get(r.logo_key, {})
        assets.append({'key': r.logo_key, 'file': f'assets/venue-logos/{name}', 'mime': MIME[ext], 'bytes': len(raw),
                       'sha256': hashlib.sha256(raw).hexdigest(), 'width': round(w, 2), 'height': round(h, 2),
                       'background': background, 'sourcePage': src_meta.get('sourcePage'), 'assetURL': src_meta.get('assetURL'),
                       'checkedOn': iso(r.logo_checked_on)})
        manifest_files.append({'path': f'assets/venue-logos/{name}', 'sha256': assets[-1]['sha256'], 'bytes': len(raw),
                               'logoKey': r.logo_key, 'status': r.logo_status})
    keys = {a['key'] for a in assets}
    venues = [{'id': r.venue_id, 'key': r.logo_key, 'role': r.logo_role or 'venue_specific'}
              for r in sheet.itertuples() if r.logo_key in keys]
    checked = max((iso(d) for d in sheet.logo_checked_on if d), default='')
    status = 'complete' if not pending else (f'partial: {len(assets)} of {len(files)} files verified; '
                                             f'{len(pending)} pending transfer (venues keep their name, no logo shown)')
    registry = {
        'meta': {'asOf': checked, 'count': len(assets), 'expected': len(files), 'folder': 'assets/venue-logos/',
                 'registry': 'CityMETER Shopping Centers & Retail Venues — Research Master, tab 10_VENUE_LOGOS',
                 'status': status, 'pending': pending, 'roles': ROLES,
                 'identityRole': 'Identify the venue in the panel, lists and map pins; the venue name stays the record of identity',
                 'backgroundRule': f'transparent marks on {STONE}, light transparent marks on {DARK}, opaque files on {WHITE}; artwork bytes unchanged',
                 'licenseNote': 'การรวบรวมไฟล์ไม่ใช่ใบอนุญาตเครื่องหมายการค้า สิทธิ์ยังเป็นของเจ้าของ'},
        'assets': assets, 'venues': venues,
    }
    (ROOT / 'data' / 'venue-logos.json').write_text(json.dumps(registry, ensure_ascii=False, indent=1) + '\n')
    (ROOT / 'assets' / 'venue-logos-manifest.json').write_text(json.dumps(
        {'checkedOn': checked, 'source': registry['meta']['registry'], 'status': status, 'files': manifest_files,
         'pending': pending}, ensure_ascii=False, indent=1) + '\n')
    print(f'assets {len(assets)} of {len(files)}; venues with a logo {len(venues)}; pending {len(pending)}')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Build the shared control-glyph subset of the CityMETER demos (citymeter-shell, assets/icons/material-controls-300.woff2).

A pure subset of this repository's pictogram font (assets/icons/material-pictogram-300.woff2, itself a static instance
of Material Symbols Rounded at the LDS axes FILL 0 / wght 300 / GRAD 0 / opsz 24; Apache 2.0): no outline is redrawn,
re-instanced or taken from another source. The three glyphs are UI roles the owner approved for this demo on
2026-10-25 (back, expand, help); every demo carries them for its phone controls since the owner's instruction of
2026-11-12 00:36 (VERBATIM: “on mobile เราย่อ ข้อความยาวๆให้สั้น หรือ แทนที่ ด้วย icon / symbol แทนได้มั้ยครับ เช็ค LDS นะ”).
LDS 0.9.7 ICON-01: icon-only where the symbol is conventional and the control has an accessible name; an ambiguous
action keeps its words. Requires fonttools + brotli.

  python3 scripts/build-controls-font.py [out-dir]     (default: assets/icons)

The same two files (WOFF2 + JSON record) are then copied to every demo; js/shell/manifest.json lists their hashes.
"""
import hashlib, json, sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

GLYPHS = {
    'back': ('arrow_back', 0xE5C4),      # the phone sheet's way back to the level above
    'more': ('expand_more', 0xE5CF),     # a disclosure: the dataset picker, the rest of the map toolbar
    'help': ('help', 0xE8FD),            # how to use this page
}
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets' / 'icons' / 'material-pictogram-300.woff2'
SOURCE_RECORD = ROOT / 'assets' / 'icons' / 'material-pictogram-300.json'

def main(out_dir):
    record = json.loads(SOURCE_RECORD.read_text(encoding='utf-8'))
    source_bytes = SOURCE.read_bytes()
    if hashlib.sha256(source_bytes).hexdigest() != record['sha256']:
        raise SystemExit('the pictogram font does not match its record')
    font = TTFont(SOURCE, recalcTimestamp=False)  # the same bytes on every run: the source's own timestamp stays
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = []
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.drop_tables += ['GSUB', 'GPOS']
    options.recalc_timestamp = False
    sub = subset.Subsetter(options)
    sub.populate(unicodes=[cp for _, cp in GLYPHS.values()])
    sub.subset(font)
    font.flavor = 'woff2'
    out = Path(out_dir) / 'material-controls-300.woff2'
    out.parent.mkdir(parents=True, exist_ok=True)
    font.save(out)
    data = out.read_bytes()
    cmap = TTFont(out).getBestCmap()
    missing = [role for role, (_, cp) in GLYPHS.items() if cp not in cmap]
    if missing or len(cmap) != len(GLYPHS):
        raise SystemExit(f'glyph set differs: missing {missing}, cmap {sorted(hex(c) for c in cmap)}')
    manifest = {
        'family': 'LDS Material Symbols Rounded Controls',
        'file': out.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
        'source': 'subset of CityMETER Shopping Center assets/icons/material-pictogram-300.woff2 (scripts/build-controls-font.py); no outline redrawn or re-instanced',
        'sourceSha256': record['sha256'],
        'upstream': record['source'], 'upstreamSha256': record['sourceSha256'],
        'license': record['license'],
        'axes': record['axes'],
        'glyphs': {role: {'name': name, 'codepoint': f'U+{cp:04X}'} for role, (name, cp) in GLYPHS.items()},
        'status': 'test exception to LDS nav-7, extended to every demo for phone controls (owner 2026-11-12 00:36; the three glyphs are UI roles approved for Shopping Center on 2026-10-25); nav-7 subset unchanged; not an LDS-registered asset, no approval receipt',
        'fallback': 'The control keeps its words when the font cannot load (js/shell/navigation.js: controls-unavailable).',
    }
    (out.parent / 'material-controls-300.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {out} ({len(data)} bytes, sha256 {manifest["sha256"]})')
    print('unicode-range:', ', '.join(f'U+{cp:04X}' for _, cp in GLYPHS.values()))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'assets' / 'icons')

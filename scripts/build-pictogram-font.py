#!/usr/bin/env python3
"""Build the LDS pictogram / UI icon subset of Material Symbols Rounded (Apache 2.0).

Static instance at the LDS axes for this family (FILL 0, wght 300, GRAD 0, opsz 24),
subset to the glyphs below, written as WOFF2 next to the approved nav-7 subset (which
stays byte-identical). The source variable font is not committed; pass its path.
Requires fonttools + brotli. Also rewrites the glyph block of styles.css (between the
`pictogram-glyphs` markers): the @font-face unicode-range and one `.pic-<role>` rule per glyph.

  python3 scripts/build-pictogram-font.py "MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf"

Status: test exception to LDS nav-7. Metric-tile roles approved by the owner 2026-10-22;
UI roles added on the owner's instruction 2026-10-25 ("ใช้ icon styling ตาม LDS เพื่อช่วยลด
ความยาวข้อความ เพื่อช่วย user navigation"). Every icon sits next to a text label (or an
accessible name for a conventional icon-only control); none stands in for evidence or a category.
Codepoints are those of the variable font's own .codepoints file.
"""
import hashlib, json, sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

GLYPHS = {
    # metric tiles (owner 2026-10-22)
    'brand': ('diamond', 0xEAD5),
    'store': ('storefront', 0xEA12),
    'venue': ('local_mall', 0xE54C),
    'area': ('map', 0xE55B),
    'province': ('location_city', 0xE7F1),
    'exclusive': ('star', 0xF09A),
    'gla': ('square_foot', 0xEA49),
    'segment': ('category', 0xE72C),
    # navigation and section labels (owner 2026-10-25)
    'country': ('public', 0xE80B),
    'view3d': ('view_in_ar', 0xEFC9),
    'architect': ('architecture', 0xEA3B),
    'help': ('help', 0xE8FD),
    'info': ('info', 0xE88E),
    'chart': ('bar_chart', 0xE26B),
    'rank': ('leaderboard', 0xF20C),
    'mix': ('stacked_bar_chart', 0xE9E6),
    'operator': ('domain', 0xE7EE),
    'table': ('table_rows', 0xF101),
    'search': ('search', 0xEF7A),
    'filter': ('tune', 0xE429),
    'back': ('arrow_back', 0xE5C4),
    'expand': ('expand_more', 0xE5CF),
    'collapse': ('expand_less', 0xE5CE),
    'contact': ('call', 0xF0D4),
    'hours': ('schedule', 0xEFD6),
    'opened': ('calendar_month', 0xEBCC),
    'address': ('location_on', 0xF1DB),
    'coordinate': ('my_location', 0xE55C),
    'checked': ('event_available', 0xE614),
    'building': ('apartment', 0xEA40),
    'evidence': ('fact_check', 0xF0C5),
    'upcoming': ('event_upcoming', 0xF238),
    'closed': ('do_not_disturb_on', 0xF08F),
    'idea': ('lightbulb', 0xE90F),
    'layers': ('layers', 0xE53B),
    'prev': ('chevron_left', 0xE5CB),
    'next': ('chevron_right', 0xE5CC),
    'palette': ('palette', 0xE40A),
    'route': ('route', 0xEACD),
    'touch': ('touch_app', 0xE913),
}
AXES = {'FILL': 0, 'wght': 300, 'GRAD': 0, 'opsz': 24}
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'icons' / 'material-pictogram-300.woff2'
MANIFEST = ROOT / 'assets' / 'icons' / 'material-pictogram-300.json'

def main(src):
    font = TTFont(src)
    static = instancer.instantiateVariableFont(font, AXES, inplace=False, updateFontNames=False)
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = []  # codepoint access only (CSS content), no ligatures needed
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.drop_tables += ['GSUB', 'GPOS']
    sub = subset.Subsetter(options)
    sub.populate(unicodes=[cp for _, cp in GLYPHS.values()])
    sub.subset(static)
    static.flavor = 'woff2'
    OUT.parent.mkdir(parents=True, exist_ok=True)
    static.save(OUT)
    data = OUT.read_bytes()
    check = TTFont(OUT)
    cmap = check.getBestCmap()
    missing = [n for n, (_, cp) in GLYPHS.items() if cp not in cmap]
    if missing:
        raise SystemExit(f'missing glyphs: {missing}')
    manifest = {
        'family': 'LDS Material Symbols Rounded Pictogram',
        'file': OUT.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
        'source': 'google/material-design-icons variablefont/MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf',
        'sourceSha256': hashlib.sha256(Path(src).read_bytes()).hexdigest(),
        'license': 'Apache-2.0 (assets/icons/material-symbols-Apache-2.0.txt)',
        'axes': AXES,
        'glyphs': {role: {'name': name, 'codepoint': f'U+{cp:04X}'} for role, (name, cp) in GLYPHS.items()},
        'status': 'test exception to LDS nav-7: metric tiles owner 2026-10-22, UI roles owner 2026-10-25; nav-7 subset unchanged',
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    write_css()
    print(f'wrote {OUT} ({len(data)} bytes, sha256 {manifest["sha256"]}) and {MANIFEST.name}')
    print('unicode-range:', ', '.join(f'U+{cp:04X}' for _, cp in GLYPHS.values()))

STYLES = ROOT / 'styles.css'
START, END = '/* pictogram-glyphs:start (scripts/build-pictogram-font.py) */', '/* pictogram-glyphs:end */'


def write_css():
    """Rewrite the generated glyph block of styles.css: unicode-range and one rule per role."""
    css = STYLES.read_text(encoding='utf-8')
    if START not in css or END not in css:
        raise SystemExit('styles.css has no pictogram-glyphs markers')
    rng = ', '.join(f'U+{cp:04X}' for _, cp in GLYPHS.values())
    rules = '\n'.join(f'.pic-{role}::before {{ content: "\\{cp:04X}"; }}' for role, (_, cp) in GLYPHS.items())
    block = (f'{START}\n@font-face {{\n  font-family: "LDS Material Symbols Rounded Pictogram";\n'
             f'  src: url("assets/icons/material-pictogram-300.woff2?v={hashlib.sha256(OUT.read_bytes()).hexdigest()[:12]}") format("woff2");\n'
             f'  font-style: normal; font-weight: 300; font-display: block;\n  unicode-range: {rng};\n}}\n{rules}\n{END}')
    head, rest = css.split(START, 1)
    tail = rest.split(END, 1)[1]
    STYLES.write_text(head + block + tail, encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])

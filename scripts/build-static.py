#!/usr/bin/env python3
"""Write the no-JavaScript summary and the JSON-LD Dataset block into index.html.

  python3 scripts/build-static.py

Reads data/venues.json (the same rows the app counts) and replaces the content between the
<!-- static-summary:start/end --> and <!-- json-ld:start/end --> markers. Numbers are counted
here with the app's rules (countable, supply, located, point-in-polygon province) so search
engines and readers without JavaScript see the same figures as the map.
"""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://montri-th.github.io/shoppingcenter/'
THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']


def thai_date(iso):
    y, m, d = (int(x) for x in iso.split('-'))
    return f'{d} {THAI_MONTHS[m - 1]} {y + 543}'


def main():
    venues = json.loads((ROOT / 'data' / 'venues.json').read_text())
    provinces = {f['properties']['code']: f['properties']['th'] for f in json.loads((ROOT / 'data' / 'provinces.geojson').read_text())['features']}
    meta, rows = venues['meta'], venues['rows']
    supply = [r for r in rows if r.get('countable') and r['status'] == 'supply']
    located = [r for r in supply if r.get('located') and r.get('provinceCode')]
    per = Counter(r['provinceCode'] for r in located)
    aha = meta['checks']['aha']
    as_of = meta['asOf']
    lines = [
        '<div class="static-summary">',
        f'<p>ศูนย์การค้าและสถานที่ค้าปลีกที่ผ่านนิยามและเปิดอยู่หรือรอยืนยันสถานะ {len(supply):,} แห่ง '
        f'(ระบุตำแหน่งได้ {len(located):,} แห่งใน {len(per)} จังหวัด) · ข้อมูลตรวจถึง {thai_date(as_of)} · '
        f'ขอบเขตจังหวัดจาก OpenGISData-Thailand (กรมการปกครอง)</p>',
        f'<p>ข้อค้นพบแรก: {aha["count"]} จาก {aha["total"]} แห่งของ{provinces.get(aha["province"], aha["province"])} '
        f'({aha["count"] / aha["total"] * 100:.0f}%) อยู่ใน 3 เขตที่หนาแน่นที่สุด</p>',
        '<table><caption>จำนวนสถานที่ต่อจังหวัด</caption><thead><tr><th scope="col">จังหวัด</th><th scope="col">แห่ง</th></tr></thead><tbody>',
        *[f'<tr><td>{provinces.get(code, code)}</td><td>{n:,}</td></tr>' for code, n in per.most_common()],
        '</tbody></table>',
        '</div>',
    ]
    ld = {
        '@context': 'https://schema.org', '@type': 'Dataset',
        'name': 'ศูนย์การค้าและสถานที่ค้าปลีก: จำนวน ประเภท และผู้บริหาร (CityMETER)',
        'alternateName': 'CityMETER Shopping Centers & Retail Venues Thailand',
        'description': 'สถานที่ค้าปลีกของไทยที่ผ่านนิยามด้วยหลักฐาน (หลายกิจการขายผู้บริโภค มีผู้บริหารพื้นที่ร่วมรายเดียว) '
                       'แยกประเภทและผู้บริหาร พร้อมหลักฐานรายช่อง ไม่ใช่สำมะโน ไม่ใช่ footfall ยอดขาย ค่าเช่า หรืออัตราว่าง',
        'url': SITE, 'inLanguage': 'th', 'dateModified': as_of,
        'creator': {'@type': 'Organization', 'name': 'Landometer · CityMETER'},
        'spatialCoverage': {'@type': 'Place', 'name': 'Thailand'},
        'variableMeasured': ['จำนวนสถานที่', 'สถานที่ต่อตารางกิโลเมตร', 'กลุ่มประเภท', 'กลุ่มผู้บริหาร'],
        'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'application/json', 'contentUrl': SITE + 'data/venues.json'}],
        'isBasedOn': 'https://github.com/chingchai/OpenGISData-Thailand',
    }
    html = (ROOT / 'index.html').read_text()
    html = re.sub(r'(<!-- static-summary:start -->).*?(<!-- static-summary:end -->)',
                  lambda m: m.group(1) + '\n      ' + '\n      '.join(lines) + '\n      ' + m.group(2), html, flags=re.S)
    html = re.sub(r'(<!-- json-ld:start -->).*?(<!-- json-ld:end -->)',
                  lambda m: m.group(1) + '\n  <script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>\n  ' + m.group(2), html, flags=re.S)
    (ROOT / 'index.html').write_text(html)
    print(f'static summary: {len(per)} provinces, {len(located)} located venues; JSON-LD dateModified {as_of}')


if __name__ == '__main__':
    main()

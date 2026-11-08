#!/usr/bin/env python3
"""D38 directory layer: the rule of scripts/build-directory-listings.py on a small export (run from directory-listings.test.js)."""
import csv
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'scripts' / 'build-directory-listings.py'
spec = importlib.util.spec_from_file_location('directory_builder', SCRIPT)
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

# floors read as short codes, several floors once each, lowest first
assert b.floor_text('G FL. Unit 1G04', '') == 'ชั้น G'
assert b.floor_text('3rd Floor', '305') == 'ชั้น 3 · ยูนิต 305'
assert b.floor_text('Level 2', '') == 'ชั้น 2'
assert b.floor_text('L 1', 'unit 12') == 'ชั้น L1 · unit 12'
assert b.floor_text('2 FL. Unit 2232', '2232, 2233') == 'ชั้น 2 · ยูนิต 2232, 2233'
assert b.floor_text('L1', '6a70bd429ebacb0001e1bb1a') == 'ชั้น L1', 'an element id is not a unit number'
assert b.floor_text('', '') == ''
assert b.floors_text(['G', 'G | L1 | L2 | L3 | L4', 'L1', 'L2', 'L4']) == 'ชั้น G, L1, L2, L3, L4'
assert b.floors_text(['L1 | L2 | LG', 'B1']) == 'ชั้น B1, LG, L1, L2'
assert b.floor_key(b.floor_code('3rd Floor')) == b.floor_key('3F') == b.floor_key('L3') == 'l3'
# names keep Thai marks; facilities are not shops, a shop whose name starts like one stays
assert b.norm('ร้านกาแฟ') != b.norm('รานกาแฟ')
for label in ('ATM Bangkok Bank', 'Toilet', 'ห้องน้ำชั้น 2', 'Customer Service', 'Parking B1', 'ตู้เอทีเอ็ม กสิกร', 'Prayer Room'):
    assert b.is_facility(label), label
for label in ('Foot Locker', 'Babylon Kids', 'Infinity Gold', 'Kasikornbank', 'BABY LOVETT', 'Baby Face Clinic', 'Huawei Customer Service Center'):
    assert not b.is_facility(label), label
# roles from the centre's own category, conservatively from the name when the category is blank
assert b.role_of('Food & Beverage', 'Anything') == 'food'
assert b.role_of('Fashion & Accessories', 'X') == 'apparel'
assert b.role_of('Health & Beauty', 'X') == 'beauty'
assert b.role_of('', 'Café Amazon') == 'cafe'
assert b.role_of('', 'Some Shop') == 'shop'
assert b.role_of('General Service', 'Spa Space') == 'shop', 'space is not a spa'
assert b.role_of('Super Market', 'TOPS SUPERMARKET') == 'grocery'
assert b.role_of('', 'Tops Supermarket') == 'grocery'
assert b.role_of('LUXURY BRAND', 'LOUIS VUITTON') == 'destination'
# no usable category, or a shop under the broad 'Entertainment' heading: the role of the one industry dataset with this exact name
assert b.entry_role('Entertainment', 'FITNESS FIRST', [{'candidate_dataset_ids': 'research.TH.fitness'}]) == 'fitness'
assert b.entry_role('', 'MK', [{'candidate_dataset_ids': 'research.TH.restaurants'}]) == 'dining'
assert b.entry_role('', 'MIZUNO', [{'candidate_dataset_ids': 'research.TH.apparel | research.TH.sport'}]) == 'shop', 'datasets disagree'
assert b.entry_role('', 'POP MART', [{'candidate_dataset_ids': 'research.TH.hobby'}]) == 'shop', 'a dataset of no single role'
assert b.entry_role('Entertainment', 'SF CINEMA', [{'candidate_dataset_ids': ''}]) == 'entertainment'
assert b.entry_role('Entertainment', 'SOUND CHECK KARAOKE', [{}]) == 'entertainment'
assert b.entry_role('Entertainment', 'KIDZOOONA', [{}]) == 'family'
assert b.entry_role('Entertainment', 'JETTS 24 HOUR FITNESS', [{}]) == 'fitness'
assert b.entry_role('Entertainment', 'POP MART', [{'candidate_dataset_ids': 'research.TH.hobby'}]) == 'shop', 'a toy shop under the broad heading'
assert b.entry_role('Entertainment', 'MLB', [{'candidate_dataset_ids': 'research.TH.apparel'}]) == 'apparel'
assert b.entry_role('Health & Beauty', 'X', [{'candidate_dataset_ids': 'research.TH.restaurants'}]) == 'beauty', 'the centre category wins'
# no private or credential links (the private host is assembled so that no Docs link sits in a public file)
PRIVATE = 'https://' + '.'.join(['docs', 'google', 'com']) + '/spreadsheets/d/x'
assert b.public_url(PRIVATE) == ''
assert b.public_url('http://example.com/a') == ''
assert b.public_url('https://example.com/a?api_key=1') == ''
assert b.public_url('https://example.com/shop/1') == 'https://example.com/shop/1'

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    data = tmp / 'data'
    (data / 'tenants').mkdir(parents=True)
    venues = [
        {'id': 'V1', 'name': 'Centre One', 'countable': True, 'children': ['V2', 'V6'], 'lat': 13.7262, 'lon': 100.5476},
        {'id': 'V2', 'name': 'Parade', 'countable': False, 'parentId': 'V1', 'lat': None, 'lon': None},
        # a zone with a point of its own (the map shows it): its name stays on the row (D43)
        {'id': 'V6', 'name': 'Wing Six', 'countable': False, 'parentId': 'V1', 'lat': 13.7270, 'lon': 100.5462},
        {'id': 'V4', 'name': 'Held Wing', 'countable': False},
        {'id': 'V5', 'name': 'Two-building Centre', 'countable': True},
    ]
    (data / 'venues.json').write_text(json.dumps({'rows': venues}))
    roster = {
        'V1': {'items': [
            {'id': 'research.TH.apparel:02_STORES:U1', 'brand': 'UNIQLO', 'unitFloor': 'ชั้น 2', 'dataset': 'research.TH.apparel'},
            {'id': 'research.TH.misc:x:ID1', 'brand': 'Roster Identity', 'sourceObservationIds': ['o14'], 'dataset': 'research.TH.misc'},
        ]},
    }
    for n in range(b.SHARDS):
        venues_in = {vid: v for vid, v in roster.items() if b.shard_of(vid) == n}
        (data / 'tenants' / f'{n:02d}.json').write_text(json.dumps({'meta': {}, 'venues': venues_in}))
    logos = tmp / 'logos.json'
    logos.write_text(json.dumps({'research.TH.restaurants|R1': {'file': 'assets/tenant-logos/r1.png', 'sha256': 'a' * 64, 'mime': 'image/png', 'width': 10, 'height': 10, 'background': '#FFFFFF'}}))
    cols = ['observation_id', 'venue_id', 'parent_venue_id', 'tenant_label', 'category_raw', 'floor_raw', 'unit_raw', 'detail_url',
            'source_url', 'checked_on', 'operation_status', 'outlet_match_status', 'public_projection_status', 'count_role',
            'brand_match_status', 'matched_brand_ids', 'matched_outlet_ids', 'relationship_status']
    ok = dict(operation_status='publisher_listed_not_field_verified', outlet_match_status='not_yet_reconciled',
              public_projection_status='research_source_not_exported', count_role='source_observation',
              brand_match_status='label_unresolved', checked_on='11/7/2026', source_url='https://example.com/directory')
    rows = [
        dict(ok, observation_id='o1', venue_id='V1', tenant_label='Uniqlo', floor_raw='L2', unit_raw='201', category_raw='Fashion'),
        dict(ok, observation_id='o2', venue_id='V1', tenant_label='Uniqlo', floor_raw='L3', unit_raw='301', category_raw='Fashion'),
        dict(ok, observation_id='o3', venue_id='V1', tenant_label='Toilet', floor_raw='L1'),
        dict(ok, observation_id='o4', venue_id='V1', tenant_label='YSL | Central Department Store', category_raw='Central Department Store', floor_raw='L1', outlet_match_status=b.COUNTER),
        dict(ok, observation_id='o4b', venue_id='V1', tenant_label='YSL | Central Department Store', category_raw='Central Department Store', floor_raw='L2', outlet_match_status=b.COUNTER),
        dict(ok, observation_id='o4c', venue_id='V1', tenant_label='Clinique | Central Department Store', category_raw='Central Department Store', floor_raw='L1', outlet_match_status=b.COUNTER),
        dict(ok, observation_id='o4d', venue_id='V1', tenant_label='CENTRAL DEPARTMENT STORE', category_raw='Central Department Store', floor_raw='L1 | L2', outlet_match_status=b.COUNTER),
        dict(ok, observation_id='o4e', venue_id='V1', tenant_label='Customer Service | Central Department Store', category_raw='Central Department Store', floor_raw='L1', outlet_match_status=b.COUNTER),
        dict(ok, observation_id='o5', venue_id='V1', tenant_label='Wing Y', public_projection_status='held_counter_or_component'),
        dict(ok, observation_id='o6', venue_id='V1', tenant_label='Soon Z', operation_status='coming_soon_listing'),
        dict(ok, observation_id='o7', venue_id='V1', tenant_label='Café Amazon', floor_raw='G Floor', unit_raw='G01', category_raw='Food & Beverage', detail_url='https://example.com/amazon'),
        dict(ok, observation_id='o8', venue_id='V1', tenant_label='CAFÉ AMAZON', floor_raw='GF', unit_raw='G01', category_raw='Food & Beverage'),
        dict(ok, observation_id='o9', venue_id='V2', parent_venue_id='V1', tenant_label='Parade Shop', floor_raw='B1'),
        dict(ok, observation_id='o10', venue_id='V1', tenant_label='Central Department Store', floor_raw='L1 | L2', category_raw='Department Store'),
        dict(ok, observation_id='o11', venue_id='V1', tenant_label='Central Department Store', floor_raw='G', category_raw='Department Store'),
        dict(ok, observation_id='o12', venue_id='V1', tenant_label='No Link', source_url=PRIVATE),
        dict(ok, observation_id='o13', venue_id='V3', tenant_label='Elsewhere'),
        dict(ok, observation_id='o14', venue_id='V1', tenant_label='Listed Elsewhere', floor_raw='L4'),
        dict(ok, observation_id='o15', venue_id='V1', tenant_label='Linked Noodle', brand_match_status=b.LINKED_BRAND, matched_brand_ids='research.TH.restaurants:R1', category_raw='Restaurant'),
        dict(ok, observation_id='o16', venue_id='V4', tenant_label='Held Host Shop'),
        dict(ok, observation_id='o17', venue_id='V1', tenant_label='Spa Space', brand_match_status=b.NOT_A_SHOP),
        # held only until the sheet splits the venue's components: shown at V5 (one counted venue, no registered components)
        dict(ok, observation_id='o18', venue_id='V5', tenant_label='Festival Shop', public_projection_status='held_counter_or_component', relationship_status='parent_component_scope_held'),
        # the same hold where the registry has components (V1 holds V2): stays held
        dict(ok, observation_id='o19', venue_id='V1', tenant_label='Wing Shop', public_projection_status='held_counter_or_component', relationship_status='parent_component_scope_held'),
        # a counter format the sheet could not resolve: stays held
        dict(ok, observation_id='o20', venue_id='V5', tenant_label='Counter Brand', public_projection_status='held_counter_or_component', relationship_status='exact_publisher_host_or_component_join'),
        dict(ok, observation_id='o21', venue_id='V6', parent_venue_id='V1', tenant_label='Zone Shop', floor_raw='L5'),
    ]
    export = tmp / 'export.csv'
    with export.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, '') for c in cols})
    receipt = tmp / 'receipt.csv'
    roster_before = b''.join((data / 'tenants' / f'{n:02d}.json').read_bytes() for n in range(b.SHARDS))
    subprocess.run([sys.executable, '-I', str(SCRIPT), '--directory', str(export), '--exported-on', '2026-11-07', '--data', str(data),
                    '--logos', str(logos), '--receipt', str(receipt), '--release', '0.1.27'], check=True, capture_output=True)
    assert b''.join((data / 'tenants' / f'{n:02d}.json').read_bytes() for n in range(b.SHARDS)) == roster_before, 'the roster stays byte-identical'
    shard = json.loads((data / 'directory' / f'{b.shard_of("V1"):02d}.json').read_text())
    items = shard['venues']['V1']['items']
    by_name = {}
    for i in items:
        by_name.setdefault(i['name'], []).append(i)
    assert sorted(by_name) == ['Café Amazon', 'Central Department Store', 'Linked Noodle', 'Parade Shop', 'Uniqlo', 'Zone Shop'], sorted(by_name)
    assert len(by_name['Uniqlo']) == 1 and by_name['Uniqlo'][0]['unitFloor'] == 'ชั้น L3 · ยูนิต 301', 'the floor the roster lists is shown once; another floor adds a branch'
    amazon = by_name['Café Amazon'][0]
    assert amazon['sourceObservationIds'] == ['o7', 'o8'] and amazon['sourceObservationCount'] == 2, 'the same name, floor and unit is one entry'
    assert amazon['unitFloor'] == 'ชั้น G · ยูนิต G01' and amazon['directoryRole'] == 'food' and amazon['checkedOn'] == '2026-11-07'
    assert amazon['sourceUrl'] == 'https://example.com/amazon' and amazon['dataset'] == b.DATASET and amazon['sourceRole'] == b.SOURCE_ROLE
    assert by_name['Central Department Store'][0]['unitFloor'] == 'ชั้น G, L1, L2' and by_name['Central Department Store'][0]['directoryRole'] == 'department'
    parade = by_name['Parade Shop'][0]
    assert parade['registeredChildVenueId'] == 'V2', 'a component row shows at its counted parent'
    assert 'displayQualifier' not in parade, 'D43 (owner 8 Nov 2026 09:17): a zone without a point of its own is not named on the row'
    zone = by_name['Zone Shop'][0]
    assert zone['registeredChildVenueId'] == 'V6' and zone['displayQualifier'] == 'ใน Wing Six', 'a zone the map shows keeps its name'
    linked = by_name['Linked Noodle'][0]
    assert linked['brandId'] == 'research.TH.restaurants:R1' and linked['brandLinked'] is True and linked['logo']['file'] == 'assets/tenant-logos/r1.png'
    assert not any(i.get('brandId') for i in items if i is not linked), 'only a confirmed brand match carries a brand id'
    counts = json.loads((data / 'directory' / 'counts.json').read_text())
    assert counts['venues'] == {'V1': {'items': 6, 'roles': {'apparel': 1, 'department': 1, 'dining': 1, 'food': 1, 'shop': 2}, 'counterBrands': 2},
                                'V5': {'items': 1, 'roles': {'shop': 1}}}, counts['venues']
    assert counts['meta']['counterBrands'] == 2 and counts['meta']['counterVenues'] == 1
    assert counts['meta']['dataset'] == b.DATASET and counts['meta']['items'] == 7 and counts['meta']['venues'] == 2
    report = json.loads((data / 'directory' / 'build-report.json').read_text())
    assert report['input']['rows'] == len(rows)
    r = report['rows']
    assert r['shownAsDirectoryItems'] + r['shownAsDepartmentStoreBrands'] + r['alreadyShownByRoster'] + r['held'] == len(rows)
    assert r['shownAsDepartmentStoreBrands'] == 3
    with receipt.open(encoding='utf-8') as f:
        lines = list(csv.DictReader(f))
    status = {x['observation_id']: x['public_projection_status'] for x in lines}
    out = {x['observation_id']: ({'shown_as_directory_item': 'shown', 'already_shown_by_brand_roster': 'represented', 'shown_as_department_store_brand': 'counter'}.get(x['web_outcome'], x['web_outcome']),
                                 x['reason'], x['web_item_id']) for x in lines}
    assert out['o1'] == ('represented', 'shown_by_roster_name_floor', 'research.TH.apparel:02_STORES:U1'), out['o1']
    assert out['o14'] == ('represented', 'shown_by_roster_identity', 'research.TH.misc:x:ID1')
    assert status['o1'] == 'published_via_existing_brand_roster_listing' and status['o7'] == 'published_as_venue_directory_listing'
    assert status['o3'] == 'held_centre_facility_not_a_shop'
    assert status['o5'] == 'held_counter_or_component', 'the sheet keeps its own hold as written'
    assert status['o18'] == 'published_as_venue_directory_listing', 'a component-scope hold shown at the single venue'
    assert all(x['web_release'] == '0.1.27' and x['exported_on'] == '2026-11-07' for x in lines)
    assert out['o3'][1] == out['o17'][1] == 'centre_facility_not_a_shop'
    assert out['o4'][:2] == out['o4c'][:2] == ('counter', 'department_store_brand')
    assert out['o4d'][1] == 'department_store_name_row' and out['o4e'][1] == 'centre_facility_not_a_shop'
    assert status['o4'] == 'published_as_department_store_brand_presence'
    stores = shard['venues']['V1']['counters']
    assert [st['store'] for st in stores] == ['Central Department Store'] and stores[0]['brands'] == 2
    assert stores[0]['floors'] == [{'floor': 'ชั้น L1', 'brands': ['Clinique', 'YSL']}, {'floor': 'ชั้น L2', 'brands': ['YSL']}]
    assert stores[0]['sourceUrl'] == 'https://example.com/directory' and stores[0]['sourceObservationCount'] == 3
    assert out['o5'][1] == 'held_counter_or_component'
    assert out['o6'][1] == 'coming_soon_not_confirmed_open'
    assert out['o12'][1] == 'no_public_source_link'
    assert out['o13'][1] == 'host_not_in_public_venue_set'
    assert out['o16'][1] == 'host_held_without_counted_parent'
    assert out['o7'] == ('shown', 'directory_item', amazon['id']) and out['o8'][2] == amazon['id']
    assert out['o18'][0] == 'shown' and out['o19'][1] == out['o20'][1] == 'held_counter_or_component'
    v5 = json.loads((data / 'directory' / f'{b.shard_of("V5"):02d}.json').read_text())['venues']['V5']['items']
    assert [i['name'] for i in v5] == ['Festival Shop']
    assert set(out) == {r['observation_id'] for r in rows}
print('directory listings: ok')

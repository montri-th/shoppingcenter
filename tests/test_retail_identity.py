"""D36: a component-typed registry row with no qualified parent reads as the place it is (scripts/build-data.py)."""
import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.argv = [sys.argv[0]]
spec = importlib.util.spec_from_file_location('build_data', ROOT / 'scripts/build-data.py')
bd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bd)


def row(**changes):
    r = {'venue_type': 'mixed_use_retail_component', 'name_th': '', 'name_en': '', 'venue_name': '',
         'count_role': 'venue_site_candidate', 'venue_subtype': '', 'operator_name': ''}
    r.update(changes)
    return r


class RetailIdentity(unittest.TestCase):
    def test_named_centre_run_by_a_university_is_a_shopping_centre(self):
        # Chamchuri Square: the operator is Chulalongkorn's property office; the name, not the operator, decides.
        r = row(name_th='จามจุรีสแควร์', name_en='Chamchuri Square', venue_name='Chamchuri Square',
                operator_name='สำนักงานจัดการทรัพย์สิน จุฬาลงกรณ์มหาวิทยาลัย (PMCU)')
        self.assertEqual(bd.retail_identity(r), ('mall', 'shopping-centre-retail'))

    def test_mall_in_a_hotel_precinct_keeps_its_own_name(self):
        r = row(name_th='มณเฑียรมอลล์', venue_type='hotel_precinct_retail_component',
                operator_name='Conduit House (management of acquired hotel and associated property)')
        self.assertEqual(bd.retail_identity(r), ('mall', 'shopping-centre-retail'))

    def test_hotel_or_hospital_in_the_name_stays_a_component(self):
        self.assertEqual(bd.retail_identity(row(name_th='ร้านค้าในโรงแรมตัวอย่าง')), ('component', 'non-retail-host'))
        self.assertEqual(bd.retail_identity(row(venue_subtype='hotel_retail_component', name_th='อาเขต')),
                         ('component', 'non-retail-host'))

    def test_retail_area_without_a_name_of_its_own_stays_a_component(self):
        r = row(name_th='พื้นที่ค้าปลีก บล็อก 28 จุฬาฯ', operator_name='สำนักงานจัดการทรัพย์สิน จุฬาลงกรณ์มหาวิทยาลัย (PMCU)')
        self.assertEqual(bd.retail_identity(r), ('component', 'no-retail-name'))

    def test_zone_types_and_child_roles_stay_components(self):
        self.assertEqual(bd.retail_identity(row(name_th='เวฟ เพลส (พื้นที่ค้าปลีก)', venue_type='retail_zone')),
                         ('component', 'zone-type'))
        self.assertEqual(bd.retail_identity(row(name_th='โซนอาหาร', count_role='child_zone')), ('component', 'child-role'))

    def test_anchor_store_gallery_and_podium_retail(self):
        r = row(name_th='โฮมโปร มหาชัย (พื้นที่ร้านค้าและบริการ)', venue_type='retail_and_service_component')
        self.assertEqual(bd.retail_identity(r), ('hoststore', 'anchor-store-gallery'))
        r = row(name_th='ไลฟ์ เซ็นเตอร์ คิวเฮ้าส์ ลุมพินี', name_en='Life Center at Q House Lumpini',
                venue_type='office_retail_component')
        self.assertEqual(bd.retail_identity(r), ('community', 'podium-or-service-retail'))

    def test_market_and_community_names(self):
        self.assertEqual(bd.retail_identity(row(name_th='ตลาดตัวอย่าง', venue_type='community_market_otop_component')),
                         ('market', 'market-type'))
        self.assertEqual(bd.retail_identity(row(name_th='On Nut Plaza Community Mall', venue_type='managed_retail_component')),
                         ('community', 'own-name-community'))


def venue(vid, group, countable=True, children=None):
    return {'id': vid, 'name': vid, 'group': group, 'groupBasis': 'evidence', 'countable': countable,
            **({'children': children} if children else {})}


class SubAreaGroups(unittest.TestCase):
    """D41 (owner 8 Nov 2026 01:18): a counted precinct shows with the shopping centres that are its sub-areas."""

    def run_rule(self, rows):
        return bd.groups_from_subareas(rows, {r['id']: r for r in rows})

    def test_precinct_takes_the_group_most_of_its_sub_areas_read_as(self):
        rows = [venue('SQ', 'other', children=['A', 'B', 'C']), venue('A', 'mall', False), venue('B', 'component', False),
                venue('C', 'mall', False)]
        out = self.run_rule(rows)
        self.assertEqual(rows[0]['group'], 'mall')
        self.assertEqual(rows[0]['groupBasis'], 'sub-areas')
        self.assertEqual([(x['id'], x['groupBefore'], x['group']) for x in out], [('SQ', 'other', 'mall')])
        self.assertEqual([s['id'] for s in out[0]['subAreas']], ['A', 'B', 'C'])

    def test_tie_reads_mall_then_community_then_outlet(self):
        rows = [venue('P', 'other', children=['A', 'B']), venue('A', 'community', False), venue('B', 'outlet', False)]
        self.run_rule(rows)
        self.assertEqual(rows[0]['group'], 'community')

    def test_left_alone(self):
        cases = [
            [venue('P', 'other', children=['A']), venue('A', 'other', False)],              # sub-areas hold no centre
            [venue('P', 'other', children=['A']), venue('A', 'mall', True)],                # the child counts on its own
            [venue('P', 'other', False, children=['A']), venue('A', 'mall', False)],        # the parent does not count
            [venue('P', 'market', children=['A']), venue('A', 'mall', False)],              # a market keeps its group
            [venue('P', 'other', children=['GONE'])],                                       # unknown child id
        ]
        for rows in cases:
            before = rows[0]['group']
            self.assertEqual(self.run_rule(rows), [])
            self.assertEqual(rows[0]['group'], before)
            self.assertEqual(rows[0]['groupBasis'], 'evidence')


if __name__ == '__main__':
    unittest.main()

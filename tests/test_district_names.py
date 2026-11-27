"""Owner 2026-11-27: a pin inside no district polygon takes the district the registry names (scripts/build-data.py)."""
import importlib.util
import pathlib
import sys
import unittest

from shapely.geometry import box

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.argv = [sys.argv[0]]
spec = importlib.util.spec_from_file_location('build_data', ROOT / 'scripts/build-data.py')
bd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bd)

# Two districts of one province side by side on the coast (x = longitude, y = latitude), a third of the same name as
# the first in another province, and a province name production lists with its abbreviation.
FEATS = [
    {'code': '2001', 'province': 'CBI', 'th': 'เมืองชลบุรี'},
    {'code': '2009', 'province': 'CBI', 'th': 'สัตหีบ'},
    {'code': '9901', 'province': 'XXX', 'th': 'สัตหีบ'},
]
GEOMS = [box(100.90, 13.30, 101.00, 13.40), box(100.90, 12.60, 101.00, 12.70), box(105.0, 15.0, 105.1, 15.1)]
PROVINCES = [{'nameTh': 'ชลบุรี', 'abbrEn': 'CBI'}, {'nameTh': 'จังหวัดตัวอย่าง', 'abbrEn': 'XXX'}]


class DistrictFromRegistryNames(unittest.TestCase):
    def setUp(self):
        self.loc = bd.Locator(FEATS, GEOMS, PROVINCES)

    def test_a_pin_inside_a_polygon_never_reads_the_names(self):
        self.assertEqual(self.loc.locate(100.95, 13.35)['code'], '2001')

    def test_a_pin_just_off_the_coast_takes_the_named_district(self):
        lon, lat = 101.0013, 12.65  # about 140 m east of the polygon of Sattahip
        self.assertIsNone(self.loc.locate(lon, lat))
        feat, rec = self.loc.locate_by_name('ชลบุรี', 'สัตหีบ', lon, lat)
        self.assertEqual(feat['code'], '2009')
        self.assertEqual((rec['provinceCode'], rec['districtCode']), ('CBI', '2009'))
        self.assertTrue(100 < rec['metresOutside'] < 200, rec)
        self.assertNotIn('refused', rec)

    def test_prefixes_of_the_names_do_not_matter(self):
        feat, _ = self.loc.locate_by_name('จังหวัดชลบุรี', 'อำเภอเมืองชลบุรี', 101.0005, 13.35)
        self.assertEqual(feat['code'], '2001')

    def test_a_named_district_far_from_the_pin_is_refused(self):
        lon, lat = 101.2, 12.65  # about 22 km east of Sattahip
        feat, rec = self.loc.locate_by_name('ชลบุรี', 'สัตหีบ', lon, lat)
        self.assertIsNone(feat)
        self.assertGreater(rec['metresOutside'], bd.NAME_FALLBACK_MAX_M)
        self.assertIn('refused', rec)

    def test_unknown_or_empty_names_are_refused(self):
        self.assertIsNone(self.loc.locate_by_name('', '', 101.0013, 12.65)[0])
        self.assertIsNone(self.loc.locate_by_name('ชลบุรี', 'ไม่มีอำเภอนี้', 101.0013, 12.65)[0])

    def test_the_province_decides_between_districts_of_the_same_name(self):
        feat, _ = self.loc.locate_by_name('จังหวัดตัวอย่าง', 'สัตหีบ', 105.1005, 15.05)
        self.assertEqual(feat['code'], '9901')


if __name__ == '__main__':
    unittest.main()

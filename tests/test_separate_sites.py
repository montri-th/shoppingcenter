"""D42 (owner 2026-11-08 08:22): scripts/separate-sites.py takes another venue's buildings out of a research site."""
import importlib.util
import math
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
try:
    import shapely  # noqa: F401
    spec = importlib.util.spec_from_file_location('separate_sites', ROOT / 'scripts/separate-sites.py')
    sep = importlib.util.module_from_spec(spec)
    sys.argv = [sys.argv[0]]
    spec.loader.exec_module(sep)
except ImportError:  # the research tool needs shapely; the page and the build do not
    sep = None

LAT, LON = 13.73, 100.57
KX, KY = 111320 * math.cos(math.radians(LAT)), 110574


def at(x, y):
    return [LON + x / KX, LAT + y / KY]


def box(cid, x0, y0, x1, y1):
    ring = [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]
    return {'cid': cid, 'outer': ring, 'holes': [], 'point': at((x0 + x1) / 2, (y0 + y1) / 2)}


def venue(vid, x, y, **more):
    lon, lat = at(x, y)
    return {'id': vid, 'name': vid, 'lon': lon, 'lat': lat, 'countable': True, **more}


@unittest.skipIf(sep is None, 'shapely is not installed')
class SeparateSites(unittest.TestCase):
    def run_case(self, v, cands, others=(), footprints=None, sites=None):
        rows = {r['id']: r for r in [v, *others]}
        return sep.separate(v, [c['point'] for c in cands], cands, rows, footprints or {}, sites or {})

    def test_emporium_and_emquartier(self):
        # The outline crosses the road: Emporium's building, EmQuartier's (a validated footprint, its pin 19 m outside it)
        # and two small buildings next to EmQuartier's.
        emp, emq = venue('EMP', 0, 0), venue('EMQ', 130, 359)
        cands = [box(1, -60, -60, 60, 60), box(23, 60, 200, 200, 340), box(13, 40, 180, 50, 190), box(36, 205, 210, 212, 220)]
        res, review = self.run_case(emp, cands, [emq], footprints={'EMQ': [[cands[1]['outer']]]})
        self.assertEqual(res['others'], ['EMQ'])
        self.assertEqual(res['kept'], [cands[0]['point']])
        self.assertEqual({d['cid']: d['rule'] for d in res['dropped']}, {23: 'A', 13: 'B', 36: 'B'})

    def test_a_pin_in_a_site_building_and_the_buildings_on_its_side(self):
        cev, lotus = venue('CEV', 0, 0), venue('LOT', 0, -300, group='hoststore')
        cands = [box(1, -40, -40, 40, 40), box(2, 50, -20, 90, 20), box(58, -80, -380, 80, -220), box(63, -20, -200, 10, -190),
                 box(70, -60, -420, -40, -400)]
        res, _ = self.run_case(cev, cands, [lotus])
        self.assertEqual(res['others'], ['LOT'])
        self.assertEqual(sorted(res['kept']), sorted([cands[0]['point'], cands[1]['point']]))
        self.assertEqual({d['cid']: d['rule'] for d in res['dropped']}, {58: 'A', 63: 'B', 70: 'B'})

    def test_own_building_stays_with_another_venue_inside_and_the_family_is_never_other(self):
        v = venue('V', 0, 0, children=['K'])
        shop = venue('SHOP', 10, 10)                      # counted on its own, inside V's building
        kid = venue('K', 100, 0, countable=False, countHold='component', parentId='V')
        cands = [box(1, -40, -40, 40, 40), box(2, 80, -20, 120, 20)]
        res, review = self.run_case(v, cands, [shop, kid])
        self.assertIsNone(res, 'nothing to take out')
        self.assertEqual(review, [])

    def test_a_pin_near_a_site_building_is_listed_for_review_never_applied(self):
        # Another market's pin 15 m from a site building (not the venue's own): no evidence whose building it is.
        v, m = venue('V', 0, 0), venue('M', 200, 55)
        cands = [box(1, -40, -40, 40, 40), box(2, 160, -40, 240, 40)]
        res, review = self.run_case(v, cands, [m])
        self.assertIsNone(res)
        self.assertEqual([(r['other_id'], r['gap_m']) for r in review], [('M', 15.0)])


if __name__ == '__main__':
    unittest.main()

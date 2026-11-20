"""0.9.2 (owner 2026-11-20 16:35): scripts/build-residents-map.py — the published lines and names follow its own rules.

The build needs the OpenStreetMap extract (kept outside the repository); these checks read only what it published.
"""
import importlib.util
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('build_residents_map', ROOT / 'scripts/build-residents-map.py')
brm = importlib.util.module_from_spec(spec)
sys.argv = [sys.argv[0]]
spec.loader.exec_module(brm)
OUT = ROOT / 'data' / 'residents-map'
META = json.loads((OUT / 'meta.json').read_text(encoding='utf-8'))


def records():
    for k in range(META['shards']):
        for vid, rec in json.loads((OUT / f'{k:03d}.json').read_text(encoding='utf-8'))['venues'].items():
            yield k, vid, rec


class Published(unittest.TestCase):
    def test_shards_and_points(self):
        n = 0
        for k, vid, _rec in records():
            self.assertEqual(brm.shard_of(vid), k, vid)
            n += 1
        self.assertEqual(n, META['venues'])
        self.assertEqual(brm.points_sha(brm.located_set()), META['points']['sha256'], 'the centers of data/venues.json')
        self.assertEqual(META['unit_m'], brm.UNIT_M)
        self.assertEqual(META['radius_m'], brm.RADIUS_M)

    def test_names_never_overlap_and_stay_inside(self):
        """Every placed name, boxed as the build boxes it on a 360 px map: inside the circle, clear of the center point,
        the ring labels and each other."""
        r_units = (brm.RADIUS_M - 150) / brm.UNIT_M
        checked = 0
        for _k, vid, rec in records():
            bx = brm.fixed_obstacles()
            for kind, x, y, align, th, en in rec['L']:
                w, h = brm.label_size(th, en)
                b = brm.Boxes.make(x, y, w, h, align)
                self.assertTrue(brm.inside(b, r_units), f'{vid} {th}')
                self.assertTrue(bx.free(b), f'{vid} {th} overlaps')
                bx.add(b)
                self.assertTrue(th.strip(), f'{vid}: an empty {kind} name')
                checked += 1
        self.assertEqual(checked, sum(META['counts']['labels'].values()))

    def test_names(self):
        self.assertEqual(brm.short_th('ถนนสุขุมวิท'), 'ถ.สุขุมวิท')
        self.assertEqual(brm.short_th('ทางหลวงแผ่นดินหมายเลข 7'), 'ทล.7')
        self.assertEqual(brm.short_th('ซอยทองหล่อ'), 'ซอยทองหล่อ')
        self.assertEqual(brm.short_en('Sukhumvit Road'), 'Sukhumvit Rd')
        self.assertEqual(brm.short_en('Chalong Rat Expressway'), 'Chalong Rat Expwy')
        self.assertEqual(brm.names_of({'name': 'ถนนพระราม 4', 'name:en': 'Rama IV Road'}), ('ถนนพระราม 4', 'Rama IV Road'))
        self.assertEqual(brm.names_of({'name': 'Outer Ring Road'}), ('Outer Ring Road', 'Outer Ring Road'), 'a Latin-only name serves both')
        self.assertEqual(brm.names_of({'name:en': 'Khlong Nakhon Noi'}), ('', 'Khlong Nakhon Noi'), 'no Thai name: a road is not named')
        self.assertEqual(brm.base_chars('ที่'), 1, 'marks above and below take no width')


if __name__ == '__main__':
    unittest.main(verbosity=0)

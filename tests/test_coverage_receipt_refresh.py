"""scripts/refresh-coverage-receipt.py: a points-only core change, or an owner-decided hierarchy change of named venues."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'scripts' / 'refresh-coverage-receipt.py'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


class CoverageReceiptRefresh(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = pathlib.Path(self.tmp.name) / 'data'
        (self.data / 'tenants').mkdir(parents=True)
        shard = json.dumps({'venues': {'P': {'items': [{'id': 'x'}]}}}).encode()
        (self.data / 'tenants' / '00.json').write_bytes(shard)
        self.rows = [
            {'id': 'P', 'name': 'Block', 'group': 'other', 'groupBasis': 'evidence', 'countable': True, 'lat': 13.7, 'lon': 100.5},
            {'id': 'A', 'name': 'Zone', 'group': 'mall', 'countable': True, 'countRole': 'venue_site', 'lat': 13.7, 'lon': 100.5},
            {'id': 'B', 'name': 'Other', 'group': 'mall', 'countable': True, 'lat': 13.8, 'lon': 100.6},
        ]
        self.previous = pathlib.Path(self.tmp.name) / 'previous.json'
        raw = json.dumps({'rows': self.rows}).encode()
        self.previous.write_bytes(raw)
        self.receipt = {'publicRosterShardCount': 1, 'publicRosterSha256': sha(shard), 'venueCoreSha256': sha(raw)}
        (self.data / 'tenant-coverage-audit.json').write_text(json.dumps(self.receipt))

    def tearDown(self):
        self.tmp.cleanup()

    def core(self, change):
        rows = json.loads(json.dumps(self.rows))
        change({r['id']: r for r in rows})
        (self.data / 'venues.json').write_text(json.dumps({'rows': rows}))

    def run_script(self, *args):
        return subprocess.run([sys.executable, '-I', str(SCRIPT), '--previous', str(self.previous), '--data', str(self.data), *args],
                              capture_output=True, text=True)

    def hierarchy(self, by):
        by['A'].update(parentId='P', countRole='child_zone', countable=False, countHold='component')
        by['P'].update(children=['A'], group='mall', groupBasis='sub-areas')

    def test_points_only_still_passes(self):
        self.core(lambda by: by['B'].update(lat=13.81))
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads((self.data / 'tenant-coverage-audit.json').read_text())
        self.assertEqual(receipt['venueCoreRefresh']['fieldsChanged'], ['lat'])
        self.assertNotIn('hierarchyChange', receipt['venueCoreRefresh'])

    def test_hierarchy_needs_the_named_venues_and_the_decision(self):
        self.core(self.hierarchy)
        self.assertNotEqual(self.run_script().returncode, 0, 'a hierarchy change is not a points-only change')
        self.assertIn('--decision', self.run_script('--hierarchy', 'A,P').stderr)
        partly = self.run_script('--hierarchy', 'A', '--decision', 'owner decision')
        self.assertNotEqual(partly.returncode, 0)
        self.assertIn('P:', partly.stderr, 'the parent changed too and was not named')
        self.assertNotEqual(self.run_script('--hierarchy', 'A,P,B', '--decision', 'owner decision').returncode, 0,
                            'a named venue that did not change')
        self.assertNotEqual(self.run_script('--hierarchy', 'A,P,ZZ', '--decision', 'owner decision').returncode, 0)
        before = (self.data / 'tenant-coverage-audit.json').read_text()
        self.assertEqual(before, json.dumps(self.receipt), 'nothing is written when it stops')

    def test_hierarchy_change_is_receipted(self):
        self.core(self.hierarchy)
        result = self.run_script('--hierarchy', 'A,P', '--decision', 'D41 owner decision', '--reason', 'hierarchy')
        self.assertEqual(result.returncode, 0, result.stderr)
        refresh = json.loads((self.data / 'tenant-coverage-audit.json').read_text())['venueCoreRefresh']
        self.assertEqual(refresh['hierarchyChange']['decision'], 'D41 owner decision')
        self.assertEqual([v['venueId'] for v in refresh['hierarchyChange']['venues']], ['A', 'P'])
        self.assertEqual(refresh['hierarchyChange']['venues'][0]['parentId'], 'P')
        self.assertTrue(refresh['rosterUnchanged'])

    def test_a_name_change_of_a_named_venue_still_stops(self):
        def change(by):
            self.hierarchy(by)
            by['A']['name'] = 'Renamed'
        self.core(change)
        result = self.run_script('--hierarchy', 'A,P', '--decision', 'owner decision')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("A: ['name']", result.stderr)

    def test_a_roster_change_stops(self):
        self.core(self.hierarchy)
        (self.data / 'tenants' / '00.json').write_text('{"venues": {}}')
        self.assertNotEqual(self.run_script('--hierarchy', 'A,P', '--decision', 'owner decision').returncode, 0)


    def owner_rows(self, by):
        by['B']['operationGroup'] = 'operating_source_evidence'

    def test_added_rows_and_operation_groups_need_the_owner_decision(self):
        def change(by):
            self.owner_rows(by)
        self.core(change)
        rows = json.loads((self.data / 'venues.json').read_text())['rows'] + [{'id': 'N', 'name': 'New market', 'group': 'market', 'countable': True, 'lat': 13.9, 'lon': 100.5}]
        (self.data / 'venues.json').write_text(json.dumps({'rows': rows, 'meta': {'counts': {'registry': 12}}}))
        self.assertNotEqual(self.run_script().returncode, 0, 'a new venue is not a points-only change')
        self.assertIn('--decision', self.run_script('--added', 'N', '--changed', 'B').stderr)
        self.assertNotEqual(self.run_script('--changed', 'B', '--decision', 'owner').returncode, 0, 'the new venue must be named')
        self.assertNotEqual(self.run_script('--added', 'N', '--decision', 'owner').returncode, 0, 'the operation group must be named')
        self.assertNotEqual(self.run_script('--added', 'N,ZZ', '--changed', 'B', '--decision', 'owner').returncode, 0)
        before = (self.data / 'tenant-coverage-audit.json').read_text()
        self.assertEqual(before, json.dumps(self.receipt), 'nothing is written when it stops')
        result = self.run_script('--added', 'N', '--changed', 'B', '--decision', 'owner 0.9.1')
        self.assertEqual(result.returncode, 0, result.stderr)
        refresh = json.loads((self.data / 'tenant-coverage-audit.json').read_text())['venueCoreRefresh']
        self.assertEqual(refresh['ownerRefresh']['decision'], 'owner 0.9.1')
        self.assertEqual([v['venueId'] for v in refresh['ownerRefresh']['added']], ['N'])
        self.assertEqual(refresh['ownerRefresh']['changed'], [{'venueId': 'B', 'fieldsChanged': ['operationGroup'], 'operationGroup': 'operating_source_evidence'}])
        self.assertEqual(refresh['rowsAdded'], 1)
        self.assertTrue(refresh['rosterUnchanged'])

    def test_a_status_change_still_needs_the_audit(self):
        self.core(lambda by: by['B'].update(status='closed', operationGroup='closed'))
        result = self.run_script('--changed', 'B', '--decision', 'owner')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("B: ['status']", result.stderr)


if __name__ == '__main__':
    unittest.main()

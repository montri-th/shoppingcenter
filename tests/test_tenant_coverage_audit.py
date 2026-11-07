import copy
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('coverage_audit', ROOT / 'scripts/audit-tenant-coverage.py')
audit_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit_module)


def example():
    return {'meta': {'asOf': '2026-11-07',
                     'expectedCounts': {'venues': 3, 'directoryObservations': 0, 'nativeLinks': 0}},
            'venues': [{'venueId': 'PARENT', 'name': 'Retail parent', 'directoryRecorded': True},
                       {'venueId': 'CHILD', 'name': 'Retail child', 'parentVenueId': 'PARENT'},
                       {'venueId': 'OTHER', 'websiteRecorded': True}],
            'directoryObservations': [], 'nativeLinks': [],
            'reviewedMemberships': [], 'admissionOutcomes': []}


def recount(data):
    data['meta']['expectedCounts'].update({key: len(data[key]) for key in
                                          ('venues', 'directoryObservations', 'nativeLinks')})
    return data


def membership(**changes):
    row = {'dataset': 'research.TH.example', 'sourceRowKey': 'publisher:card:1',
           'canonicalOutletIds': ['OUT-1'], 'venueIds': ['PARENT'], 'projectionRound': 4,
           'sourceSha256': 'a'*64, 'sourceHashScope': 'selected_public_fields',
           'checkedOn': '2026-11-07', 'sourceUrl': 'https://example.com/directory/card-1'}
    row.update(changes)
    return row


def outcome(**changes):
    row = {'dataset': 'research.TH.example', 'sourceRowKey': 'publisher:card:1',
           'gateAdmitted': True, 'disposition': 'published'}
    row.update(changes)
    return row


def public_item(**changes):
    row = {'id': 'research.TH.example:02_STORES:OUT-1', 'dataset': 'research.TH.example',
           'brand': 'Same name', 'matchedSourceStoreIds': ['OUT-1'],
           'sourceEvidence': [{'sourceObservationId': 'publisher:card:1',
              'sourceSha256': 'a'*64, 'sourceHashScope': 'selected_public_fields',
              'checkedOn': '2026-11-07', 'sourceUrl': 'https://example.com/directory/card-1'}]}
    row.update(changes)
    return row


class CoverageAudit(unittest.TestCase):
    def test_collector_host_id_parser_handles_pipe_spacing_json_and_native_arrays(self):
        parse = audit_module.parse_native_host_ids
        for value in ['SC-A|SC-B', 'SC-A | SC-B', ' SC-A  |SC-B ',
                      '["SC-A", "SC-B"]', ['SC-A', ' SC-B ']]:
            with self.subTest(value=value):
                self.assertEqual(parse(value), ['SC-A', 'SC-B'])
        self.assertEqual(parse('SC-A|SC-A'), ['SC-A', 'SC-A'])
        for value in [None, '', '  ', ' | ']:
            self.assertEqual(parse(value), [])
        for value in [False, 123, '["SC-A", null]']:
            with self.assertRaises(audit_module.ContractError):
                parse(value)

    def test_collector_parser_preserves_unknown_literals_without_relaxing_the_audit_array_contract(self):
        parse = audit_module.parse_native_host_ids
        literal = 'unknown venue / not-a-canonical-ID'
        self.assertEqual(parse(literal), [literal])
        self.assertEqual(parse('sc-a'), ['sc-a'])
        self.assertEqual(parse('[unrecognized literal]'), ['[unrecognized literal]'])
        self.assertEqual(parse('["unknown|literal"]'), ['unknown|literal'])
        data = example()
        data['nativeLinks'] = [{'sourceRecordKey': 'research.TH.example:02_STORES:OUT-1',
                               'acceptedVenueIds': 'SC-A|SC-B', 'candidateVenueIds': []}]
        with self.assertRaisesRegex(audit_module.ContractError, 'acceptedVenueIds must be an array'):
            audit_module.audit(recount(data), {})

    def test_complete_inventory_and_expected_counts_prevent_a_partial_download_looking_complete(self):
        data = example()
        report, receipt = audit_module.audit(data, {})
        self.assertEqual(len(report['venues']), 3)
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(report['venues'][0]['sourceAvailability'], 'availability_not_checked')
        data['venues'].pop()
        with self.assertRaisesRegex(audit_module.ContractError, 'population count'):
            audit_module.audit(data, {})
        data = example()
        del data['meta']['expectedCounts']['nativeLinks']
        with self.assertRaisesRegex(audit_module.ContractError, 'nativeLinks is required'):
            audit_module.audit(data, {})
        for bad in [[], {'meta': []}, {'meta': {'asOf': '20261107'}}]:
            with self.assertRaises(audit_module.ContractError):
                audit_module.audit(bad, {})

    def test_accepted_native_links_need_review_and_candidates_do_not_become_missing_eligible_shops(self):
        data = example()
        data['nativeLinks'] = [
            {'sourceRecordKey': 'research.TH.example:02_STORES:OUT-1', 'acceptedVenueIds': ['PARENT'],
             'candidateVenueIds': [], 'linkStatus': 'accepted_identity_and_located_in'},
            {'sourceRecordKey': 'research.TH.example:02_STORES:CANDIDATE', 'acceptedVenueIds': [],
             'candidateVenueIds': ['PARENT'], 'linkStatus': 'candidate_host_identity_located_in_unconfirmed'}]
        report, receipt = audit_module.audit(recount(data),
            {'PARENT': [public_item(id='research.TH.example:02_STORES:DIFFERENT',
                                    matchedSourceStoreIds=['DIFFERENT'], sourceEvidence=[])]})
        parent = next(row for row in report['venues'] if row['venueId'] == 'PARENT')
        self.assertEqual(parent['nativeAcceptedHostMemberships'], 1)
        self.assertEqual(parent['nativeCandidateOnlySourceRecords'], 1)
        self.assertEqual(parent['acceptedSourceLinksNeedingPublicationGateReview'], 1)
        self.assertEqual(parent['nativeAcceptedSourceRecordsWithExactPublicTrace'], 0)
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(receipt['coverage']['releaseBlockingMemberships'], 0)

    def test_native_rows_without_any_host_reference_are_accounted_for_without_inventing_membership(self):
        data = example()
        data['nativeLinks'] = [{'sourceRecordKey': 'research.TH.example:02_STORES:OUTSIDE',
                               'acceptedVenueIds': [], 'candidateVenueIds': [], 'linkStatus': 'unresolved'}]
        report, receipt = audit_module.audit(recount(data), {})
        self.assertEqual(receipt['coverage']['nativeSourceLinkRowsWithoutHostReference'], 1)
        self.assertEqual(receipt['coverage']['nativeAcceptedHostMemberships'], 0)
        self.assertEqual(receipt['coverage']['acceptedSourceLinksNeedingPublicationGateReview'], 0)
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(report['queues']['native_source_rows_without_host_reference'][0]['sourceDataset'],
                         'research.TH.example')

    def test_new_source_needs_exact_public_evidence_even_when_the_old_canonical_branch_is_visible(self):
        data = example()
        data['reviewedMemberships'] = [membership()]
        data['admissionOutcomes'] = [outcome()]
        report, receipt = audit_module.audit(data, {'PARENT': [public_item(sourceEvidence=[])]})
        self.assertEqual(receipt['status'], 'blocked')
        blocker = report['queues']['release_blockers'][0]
        self.assertEqual(blocker['canonicalTraceItems'], 1)
        self.assertEqual(blocker['accountingReason'], 'canonical_branch_visible_but_reviewed_source_evidence_missing')
        report, receipt = audit_module.audit(data, {'PARENT': [public_item()]})
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(receipt['coverage']['releaseBlockingMemberships'], 0)

    def test_nested_cross_dataset_corroboration_is_traced_by_typed_stable_ids_not_brand_names(self):
        data = example()
        data['reviewedMemberships'] = [membership()]
        data['admissionOutcomes'] = [outcome(disposition='corroborated')]
        original = {'id': 'upstream:OTHER', 'dataset': 'research.TH.another', 'brand': 'Same name',
                    'corroboratingMembershipEvidence': [public_item()]}
        frozen = copy.deepcopy(original)
        _, receipt = audit_module.audit(data, {'PARENT': [original]})
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(original, frozen)
        original['corroboratingMembershipEvidence'][0]['dataset'] = 'research.TH.wrong'
        _, receipt = audit_module.audit(data, {'PARENT': [original]})
        self.assertEqual(receipt['status'], 'blocked')

    def test_same_publisher_id_with_stale_hash_or_check_date_does_not_account_for_a_new_capture(self):
        data = example()
        data['reviewedMemberships'] = [membership(sourceSha256='a'*64,
            sourceHashScope='whole HTTP response', checkedOn='2026-11-07')]
        data['admissionOutcomes'] = [outcome()]
        evidence = {'sourceObservationId': 'publisher:card:1', 'sourceSha256': 'b'*64,
                    'sourceHashScope': 'whole HTTP response', 'checkedOn': '2026-11-06',
                    'sourceUrl': 'https://example.com/directory/card-1'}
        report, receipt = audit_module.audit(data, {'PARENT': [public_item(sourceEvidence=[evidence])]})
        self.assertEqual(receipt['status'], 'blocked')
        self.assertEqual(report['queues']['release_blockers'][0]['accountingReason'],
                         'reviewed_source_evidence_resource_hash_scope_or_date_mismatch')
        evidence.update(sourceSha256='a'*64, checkedOn='2026-11-07')
        _, receipt = audit_module.audit(data, {'PARENT': [public_item(sourceEvidence=[evidence])]})
        self.assertEqual(receipt['status'], 'passed')

    def test_exact_fresh_source_proof_on_the_wrong_canonical_branch_fails_closed(self):
        data = example()
        data['reviewedMemberships'] = [membership()]
        data['admissionOutcomes'] = [outcome()]
        wrong = public_item(id='research.TH.example:02_STORES:WRONG', matchedSourceStoreIds=['WRONG'])
        report, receipt = audit_module.audit(data, {'PARENT': [wrong]})
        self.assertEqual(receipt['status'], 'blocked')
        self.assertEqual(report['queues']['release_blockers'][0]['accountingReason'],
                         'reviewed_source_canonical_foreign_key_mismatch')
        wrong['sourceEvidence'][0]['sourceUrl'] = 'https://example.com/other-resource'
        report, receipt = audit_module.audit(data, {'PARENT': [wrong]})
        self.assertEqual(receipt['status'], 'blocked')
        self.assertEqual(report['queues']['release_blockers'][0]['accountingReason'],
                         'reviewed_source_evidence_resource_hash_scope_or_date_mismatch')

    def test_new_admitted_rows_cannot_silently_omit_capture_binding_fields(self):
        for field in ['sourceSha256', 'sourceHashScope', 'checkedOn', 'sourceUrl']:
            data = example()
            row = membership()
            del row[field]
            data['reviewedMemberships'] = [row]
            data['admissionOutcomes'] = [outcome()]
            with self.subTest(field=field), self.assertRaisesRegex(audit_module.ContractError, 'new admitted source requires'):
                audit_module.audit(data, {'PARENT': [public_item()]})

    def test_a_real_post_gate_hold_is_accounted_but_a_generic_excuse_or_missing_outcome_blocks(self):
        data = example()
        data['reviewedMemberships'] = [membership()]
        data['admissionOutcomes'] = [outcome(disposition='held', reason='raw_branch_marker_host_conflict',
                                             reasonSource='adapter_omission')]
        report, receipt = audit_module.audit(data, {})
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(receipt['coverage']['requiredNewSourceMemberships'], 1)
        self.assertEqual(receipt['coverage']['requiredAdmittedSourceMemberships'], 1)
        self.assertEqual(report['queues']['reviewed_documented_holds'][0]['outcome']['reason'],
                         'raw_branch_marker_host_conflict')
        for reason, source in [('not_published', 'adapter_omission'), ('pending', 'native_review'),
                               ('raw_branch_marker_host_conflict', None),
                               ('raw_branch_marker_host_conflict', 'adapter_gate')]:
            with self.subTest(reason=reason, source=source):
                data['admissionOutcomes'][0].update(reason=reason, reasonSource=source)
                _, receipt = audit_module.audit(data, {})
                self.assertEqual(receipt['status'], 'blocked')
        data['admissionOutcomes'] = []
        report, receipt = audit_module.audit(data, {})
        self.assertEqual(receipt['status'], 'blocked')
        self.assertEqual(report['queues']['release_blockers'][0]['accountingReason'], 'admission_outcome_missing')

    def test_nonadmitted_or_held_new_source_cannot_remain_public(self):
        data = example()
        data['reviewedMemberships'] = [membership()]
        for admitted, disposition, reason_source in [(False, 'not_admitted', 'adapter_gate'),
                                                    (True, 'held', 'adapter_omission')]:
            data['admissionOutcomes'] = [outcome(gateAdmitted=admitted, disposition=disposition,
                reason='source_unit_conflict', reasonSource=reason_source)]
            _, receipt = audit_module.audit(data, {'PARENT': [public_item()]})
            self.assertEqual(receipt['status'], 'blocked')

    def test_legacy_documented_holds_are_separate_and_do_not_excuse_a_required_new_membership(self):
        data = example()
        data['reviewedMemberships'] = [membership(projectionRound=3)]
        data['meta']['legacyDocumentedHolds'] = [dict(dataset='research.TH.example',
            sourceRowKey='publisher:card:1', reason='retained_source_unit_conflict')]
        report, receipt = audit_module.audit(data, {})
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(len(report['queues']['legacy_documented_holds']), 1)
        data['reviewedMemberships'][0]['projectionRound'] = 4
        _, receipt = audit_module.audit(data, {})
        self.assertEqual(receipt['status'], 'blocked')

    def test_component_rollup_preserves_native_hosts_and_deduplicates_only_exact_record_keys(self):
        data = example()
        data['meta']['componentPublicationHosts'] = {'CHILD': 'PARENT'}
        data['nativeLinks'] = [
            {'sourceRecordKey': 'research.TH.example:02_STORES:OUT-1', 'acceptedVenueIds': ['CHILD'], 'candidateVenueIds': []},
            {'sourceRecordKey': 'research.TH.example:02_STORES:OUT-1', 'acceptedVenueIds': ['PARENT'], 'candidateVenueIds': []}]
        data['directoryObservations'] = [{'observationId': 'directory:child', 'venueId': 'CHILD',
            'matchedOutletIds': [], 'resolutionState': 'unreconciled'}]
        frozen = copy.deepcopy(data)
        report, receipt = audit_module.audit(recount(data), {'PARENT': [public_item()]})
        parent = next(r for r in report['venues'] if r['venueId'] == 'PARENT')
        child = next(r for r in report['venues'] if r['venueId'] == 'CHILD')
        self.assertEqual(parent['nativeAcceptedHostMemberships'], 1)
        self.assertEqual(child['nativeAcceptedHostMemberships'], 1)
        self.assertEqual(parent['nativeAcceptedSourceRecordsInPublicationGroup'], 1)
        self.assertEqual(parent['exactStableIdTracedPublicItemsInPublicationGroup'], 1)
        self.assertEqual(parent['publicationGroupDirectoryObservations'], 1)
        self.assertEqual(child['directoryObservations'], 1)
        self.assertEqual(child['publicationVenueId'], 'PARENT')
        self.assertEqual(data['nativeLinks'], frozen['nativeLinks'])
        data['venues'][1]['parentVenueId'] = 'OTHER'
        with self.assertRaisesRegex(audit_module.ContractError, 'registered parent'):
            audit_module.audit(data, {})

    def test_duplicate_public_source_identity_is_a_blocker_even_across_a_component_presentation(self):
        data = example()
        data['reviewedMemberships'] = [membership()]
        data['admissionOutcomes'] = [outcome()]
        two = public_item(id='research.TH.example:02_STORES:OUT-2')
        report, receipt = audit_module.audit(data, {'PARENT': [public_item(), two]})
        self.assertEqual(receipt['status'], 'blocked')
        self.assertEqual(report['queues']['release_blockers'][0]['accountingReason'],
                         'source_identity_has_multiple_public_items')

    def test_directory_unknown_status_is_unreconciled_and_holds_keep_their_actual_reason_and_grain(self):
        data = example()
        data['directoryObservations'] = [
            {'observationId': 'source:unknown', 'venueId': 'PARENT', 'matchedOutletIds': ['OUT-1'],
             'outletMatchStatus': 'new_unknown_enum', 'holdReason': 'This note alone is not a hold'},
            {'observationId': 'source:held', 'venueId': 'PARENT', 'matchedOutletIds': [],
             'publicProjectionStatus': 'held_scope_review', 'holdReason': 'scope_review_pending'},
            {'observationId': 'source:empty-match', 'venueId': 'PARENT', 'matchedOutletIds': [],
             'resolutionState': 'matched'}]
        report, _ = audit_module.audit(recount(data), {})
        parent = next(r for r in report['venues'] if r['venueId'] == 'PARENT')
        self.assertEqual(parent['directory_unreconciled'], 2)
        self.assertEqual(parent['directory_held'], 1)
        self.assertEqual(parent['directoryHoldReasonCounts'], {'scope_review_pending': 1})
        self.assertEqual(parent['reviewedMembershipHoldReasonCounts'], {})

    def test_public_receipt_never_leaks_private_identifiers_urls_paths_or_free_text_statuses(self):
        data = example()
        secret = 'PRIVATE_NATIVE_SHEET_ID_ABC123'
        private_url = 'https://docs.google.com/spreadsheets/d/'+secret+'/edit'
        data['venues'][0].update(name=secret, sourceAvailability=private_url,
                                 coverageStage='/private/work/task/secret.json')
        data['directoryObservations'] = [{'observationId': secret, 'venueId': 'PARENT',
            'matchedOutletIds': [], 'resolutionState': 'held', 'holdReason': private_url}]
        report, receipt = audit_module.audit(recount(data), {})
        public = json.dumps(receipt)
        for value in [secret, private_url, '/private/work', 'PARENT', 'CHILD']:
            self.assertNotIn(value, public)
        self.assertEqual(receipt['coverage']['sourceAvailabilityCounts']['other_recorded_status'], 1)
        self.assertIn(private_url, json.dumps(report))
        data['venues'][0].update(venueGroup='mixed_use', qualificationStatus='candidate_only',
                                  countRole='not_a_qualified_site', nativeMasterRow=987)
        report, _ = audit_module.audit(recount(data), {})
        parent = next(row for row in report['venues'] if row['venueId'] == 'PARENT')
        self.assertEqual(parent['qualificationStatus'], 'candidate_only')
        self.assertEqual(parent['nativeMasterRow'], 987)

    def test_release_digest_uses_the_exact_parsed_shard_bytes_in_numeric_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            raw0 = b'{"venues":{}}\n'
            raw1 = b'{"venues": {"PARENT": {"items": []}}}\n'
            (tmp/'01.json').write_bytes(raw1)
            (tmp/'00.json').write_bytes(raw0)
            (tmp/'build-report.json').write_text('{"not":"a shard"}')
            rosters, binding = audit_module.load_rosters(tmp, with_binding=True)
            self.assertEqual(binding['publicRosterSha256'], hashlib.sha256(raw0+raw1).hexdigest())
            self.assertEqual(binding['publicRosterShardCount'], 2)
            self.assertEqual(rosters, {'PARENT': []})

    def test_csv_escapes_formulas_and_private_repository_boundary_is_enforced(self):
        for value in ['=HYPERLINK("https://example.invalid")', '+1', '-1', '@SUM(A1)', '\tformula']:
            self.assertTrue(audit_module.csv_value(value).startswith("'"))
        self.assertEqual(audit_module.csv_value(123), 123)
        with self.assertRaisesRegex(audit_module.ContractError, 'outside the public repository'):
            audit_module.outside_repository(ROOT / 'data/private-input.json')
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(audit_module.outside_repository(tmp), Path(tmp).resolve())

    def test_cli_writes_every_venue_and_full_private_queues_but_blocks_missing_new_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            data = example()
            data['reviewedMemberships'] = [membership()]
            data['admissionOutcomes'] = [outcome()]
            source, roster, destination = tmp/'input.json', tmp/'rosters', tmp/'audit'
            source.write_text(json.dumps(data))
            roster.mkdir()
            (roster/'00.json').write_text(json.dumps({'venues': {}}))
            with patch('builtins.print'):
                code = audit_module.main(['--input', str(source), '--rosters', str(roster),
                                          '--private-outdir', str(destination)])
            self.assertEqual(code, 1)
            report = json.loads((destination/'audit.json').read_text())
            self.assertEqual(len(report['venues']), 3)
            self.assertEqual(len((destination/'venues.csv').read_text().splitlines()), 4)
            self.assertEqual(len(json.loads((destination/'release_blockers.json').read_text())), 1)


if __name__ == '__main__':
    unittest.main()

import copy
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('network', ROOT / 'scripts/link-venue-network-tenants.py')
network = importlib.util.module_from_spec(spec)
spec.loader.exec_module(network)

def record(**changes):
    row = {'dataset': network.FOOD, 'sourceRowKey': 'directory:store:1', 'sourceBranchId': 'store:1',
           'sourceStoreName': 'Coffee One', 'brand': 'Coffee One', 'brandId': 'BR-COFFEE',
           'canonicalOutletIds': ['OUT-1'], 'existingSourceIds': ['OUT-1'], 'venueIds': ['HOST-1'],
           'unitFloor': '1F', 'sourceUrl': 'https://truedigitalpark.com/en/shop/coffee/1',
           'checkedOn': '2026-11-07', 'sourceSha256': 'a' * 64,
           'sourceAuthority': 'official_venue_consumer_directory', 'sourceHashScope': 'selected_publisher_fields_not_full_http_body', 'scopeApproved': True,
           'canonicalIdentityAccepted': True, 'sourceListingRole': 'official_consumer_food_location',
           'hostIdentityStatus': 'source_qualified_named_host_identity', 'accepted': True, 'primary': False,
           'selectedCoordinates': [None, None], 'category': 'restaurant_or_cafe',
           'storeFormat': 'source_listed_restaurant_or_cafe', 'status': 'publisher_listed_not_field_verified',
           'evidenceStatus': 'official_named_host_listing_current_operation_separate',
           'sourceArtifactKey': network.MARKER + 'food'}
    row.update(changes)
    return row

def payload(rows):
    return {'meta': {'asOf': '2026-11-07', 'nativeFoodAllWritesVerified': True, 'nativeMiscAllWritesVerified': True,
                     'selectedHostNativeReadbackVerified': True, 'original31NativeReadbackVerified': True},
            'observations': rows}

VENUES = {'HOST-1': {'id': 'HOST-1', 'name': 'Host One', 'lat': 13, 'lon': 100}}

class Gates(unittest.TestCase):
    def test_evidence_authority_does_not_follow_native_acceptance(self):
        for role in ['payment_partner_list', 'employer_branch_list', 'secondary_directory']:
            self.assertEqual(network.gate(record(sourceAuthority=role), '2026-11-07'),
                             'nonconsumer_or_partner_employer_source')
        self.assertIsNone(network.gate(record(), '2026-11-07'))

    def test_hold_and_future_date_fail_closed(self):
        for changes in [{'visibilityHold': True}, {'hostIdentityStatus': 'candidate_host_identity'},
                        {'canonicalIdentityAccepted': False}, {'checkedOn': '2026-11-08'}]:
            self.assertIsNotNone(network.gate(record(**changes), '2026-11-07'))

    def test_misc_preserves_unresolved_format_and_rejects_products_and_provisional_names(self):
        row = record(dataset=network.MISC, sourceListingRole='consumer_visible_store_or_service',
                     scopeStatus='existing_brand_new_scope_membership', brandIdentityRole='retail_banner_or_service_provider',
                     storeFormat='source_listed_consumer_location_format_unresolved')
        self.assertIsNone(network.gate(row, '2026-11-07'))
        for changes in [{'sourceListingRole': 'department_product_presence'}, {'scopeStatus': 'scope_review'},
                        {'brandIdentityRole': 'provisional_trade_name'}, {'storeFormat': 'camera_pos_qualified'}]:
            self.assertIsNotNone(network.gate({**row, **changes}, '2026-11-07'))

    def test_public_domain_is_specific_to_consumer_authority(self):
        self.assertIsNotNone(network.gate(record(sourceUrl='https://www.ktc.co.th/participating-branches'), '2026-11-07'))
        self.assertIsNotNone(network.gate(record(sourceUrl='https://docs.google.com/spreadsheets/d/private'), '2026-11-07'))
        self.assertIsNone(network.gate(record(sourceAuthority='official_brand_consumer_locator',
                                             sourceUrl='https://getfresh.co.th/locations/'), '2026-11-07'))

    def test_invalid_dates_credentials_and_absent_hash_scope_are_rejected(self):
        for changes in [{'checkedOn': '2026-02-30'}, {'sourceHashScope': ''},
                        {'sourceUrl': 'https://user:secret@truedigitalpark.com/shop/1'},
                        {'sourceUrl': 'http://truedigitalpark.com/shop/1'}]:
            self.assertIsNotNone(network.gate(record(**changes), '2026-11-07'))
        self.assertIsNotNone(network.gate(record(), 'invalid'))

    def test_industry_directory_gate_is_separate_from_native_pos_acceptance(self):
        r = record(dataset='research.TH.optical', projectionKind='selected_host_directory',
                   staticScreenVerified=True, nativeIdentityHold=False,
                   sourceListingRole='reviewed_current_directory_registry_membership')
        self.assertIsNone(network.gate(r, '2026-11-07'))
        self.assertIsNotNone(network.gate({**r, 'nativeIdentityHold': True}, '2026-11-07'))
        self.assertIsNotNone(network.gate({**r, 'staticScreenVerified': False}, '2026-11-07'))
        self.assertIsNotNone(network.gate({**r, 'projectionKind': 'base'}, '2026-11-07'))

    def test_bounded_service_concept_does_not_require_or_fabricate_a_licensed_school_brand(self):
        r = record(dataset='research.TH.school', brandId=None,
                   sourceConceptId='publisher-concept:smile', projectionKind='bounded_service_directory',
                   nativeServiceReadbackVerified=True, nativeIdentityHold=False,
                   sourceRecordTab='31_LEARNING_BRANCH_EVIDENCE',
                   sourceListingRole='bounded_consumer_service_observation')
        self.assertIsNone(network.gate(r,'2026-11-07'))
        item=network.food_item([r],VENUES['HOST-1'])
        self.assertEqual(item['brandId'],None)
        self.assertIn(':31_LEARNING_BRANCH_EVIDENCE:',item['id'])
        self.assertEqual(item['brandIdentityRole'],'publisher_named_service_concept_not_canonical_brand_master')
        for changes in [{'selectedCoordinates':[13,100]}, {'nativeIdentityHold':True},
                        {'nativeServiceReadbackVerified':False}, {'sourceRecordTab':'02_LICENSED_SCHOOLS'}]:
            self.assertIsNotNone(network.gate({**r,**changes},'2026-11-07'))

class Reconciliation(unittest.TestCase):
    def merge(self, rows, original=None, check=lambda own, vid: (True, None)):
        return network.merge(payload(rows), original or {}, VENUES, check)

    def test_distinct_publisher_entries_on_same_floor_remain_distinct(self):
        two = record(sourceRowKey='directory:store:2', sourceBranchId='store:2',
                     canonicalOutletIds=['OUT-2'], existingSourceIds=['OUT-2'])
        result, receipt = self.merge([record(), two])
        self.assertEqual(len(result['HOST-1']), 2)
        self.assertEqual(receipt['newItems'], 2)

    def test_shared_canonical_outlet_across_new_industries_is_one_branch_with_both_sources(self):
        first = record(dataset=network.MISC, sourceListingRole='format_unresolved',
                       scopeStatus='miscellaneous_current_registry_gap', brandIdentityRole='retail_banner_or_service_provider',
                       storeFormat='source_listed_consumer_location_format_unresolved')
        second = record(sourceRowKey='directory:store:other-view')
        result, receipt = self.merge([first, second])
        self.assertEqual(len(result['HOST-1']), 1)
        self.assertEqual(receipt['corroboratingNewItems'], 1)
        self.assertEqual(len(result['HOST-1'][0]['corroboratingMembershipEvidence']), 1)

    def test_hash_scope_is_preserved_for_each_source_view(self):
        a = record(sourceHashScope='complete_original_public_HTTP_response_body')
        b = record(sourceRowKey='other', sourceSha256='b'*64, sourceHashScope='native_row_integrity_only')
        item = network.food_item([a,b], VENUES['HOST-1'])
        self.assertIn(a['sourceHashScope'], item['identityNote'])
        self.assertEqual([v['sourceHashScope'] for v in item['sourceEvidence']], [a['sourceHashScope'],b['sourceHashScope']])

    def test_second_native_identity_for_one_current_card_corroborates_original_branch(self):
        first = record(dataset='research.TH.beauty', projectionKind='selected_host_directory',
                       staticScreenVerified=True, nativeIdentityHold=False,
                       sourceListingRole='reviewed_current_directory_registry_membership')
        second = {**first, 'sourceRowKey': 'other-native-row', 'canonicalOutletIds': ['OUT-2'], 'existingSourceIds': ['OUT-2']}
        old = {'id':'old:OUT-1','name':'Coffee One','brand':'Coffee One','dataset':'research.TH.beauty'}
        result, receipt = self.merge([first,second], {'HOST-1':[old]})
        self.assertEqual(len(result['HOST-1']),1)
        self.assertEqual(receipt['newItems'],0)
        self.assertEqual(receipt['corroboratingExistingItems'],1)
        self.assertEqual(receipt['corroboratingExistingEvidenceGroups'],2)

    def test_exact_existing_identity_is_corroborated_without_status_logo_or_count_change(self):
        original = {'id': 'old:OUT-1', 'name': 'Original branch', 'brand': 'Coffee One', 'dataset': network.FOOD,
                    'status': 'original_operation_unknown', 'sourceObservationCount': 1,
                    'logo': {'file': 'retained.svg'}, 'sourceUrl': 'https://example.org/original'}
        frozen = copy.deepcopy(original)
        result, receipt = self.merge([record()], {'HOST-1': [original]})
        got = result['HOST-1'][0]
        for key, value in frozen.items(): self.assertEqual(got[key], value)
        self.assertEqual(receipt['newItems'], 0)
        self.assertEqual(receipt['corroboratingExistingItems'], 1)
        self.assertEqual(original, frozen)

    def test_ambiguous_existing_outlets_and_far_points_stay_out(self):
        item = {'id': 'old:OUT-1', 'name': 'Coffee One', 'brand': 'Coffee One', 'sourceObservationIds': ['OUT-1']}
        other = {**item, 'id': 'old:OUT-2'}
        result, receipt = self.merge([record()], {'HOST-1': [item, other]})
        self.assertEqual(receipt['omitted']['multiple_existing_outlet_identities'], 1)
        self.assertEqual(len(result['HOST-1']), 2)
        result, receipt = self.merge([record()], check=lambda own, vid: (False, 901))
        self.assertEqual(receipt['omitted']['far_point_conflict'], 1)
        self.assertEqual(result, {})

    def test_misc_repeated_native_branch_views_stay_one_and_rebuild_is_idempotent(self):
        first = record(dataset=network.MISC, sourceListingRole='format_unresolved',
                       scopeStatus='miscellaneous_current_registry_gap', brandIdentityRole='retail_banner_or_service_provider',
                       storeFormat='source_listed_consumer_location_format_unresolved', sourceArtifactKey=network.MARKER + 'miscellaneous')
        second = {**first, 'sourceRowKey': 'directory:store:2', 'sourceBranchId': 'store:2'}
        result, receipt = self.merge([first, second])
        self.assertEqual(receipt['newItems'], 1)
        self.assertEqual(result['HOST-1'][0]['sourceObservationCount'], 2)
        rerun, rerun_receipt = self.merge([first, second], result)
        self.assertEqual(result, rerun)
        self.assertEqual(receipt, rerun_receipt)

    def test_native_readback_and_source_uniqueness_are_required(self):
        with self.assertRaises(ValueError): self.merge([record(), record()])
        p = payload([record()]); p['meta']['nativeFoodAllWritesVerified'] = False
        with self.assertRaises(ValueError): network.merge(p, {}, VENUES, lambda own, vid: (True, None))

    def test_polygon_holes_and_distant_containment_do_not_become_nearest_host_joins(self):
        square = {'type': 'Polygon', 'coordinates': [[[99, 12], [101, 12], [101, 14], [99, 14], [99, 12]],
                                                    [[99.9, 12.9], [100.1, 12.9], [100.1, 13.1], [99.9, 13.1], [99.9, 12.9]]]}
        self.assertTrue(network.contains((100.5, 13.5), square))
        self.assertFalse(network.contains((100, 13), square))
        check = network.point_checker(VENUES, {'features': []})
        self.assertEqual(check([None, None], 'HOST-1'), (True, None))
        self.assertFalse(check([14, 101], 'HOST-1')[0])

if __name__ == '__main__':
    unittest.main()

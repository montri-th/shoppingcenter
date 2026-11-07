import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

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
                     'selectedHostNativeReadbackVerified': True, 'original31NativeReadbackVerified': True,
                     'round2FoodNativeReadbackVerified': True, 'nativeOwnerAssertionReadbackVerified': True,
                     'round2MiscNativeReadbackVerified': True},
            'observations': rows}

VENUES = {'HOST-1': {'id': 'HOST-1', 'name': 'Host One', 'lat': 13, 'lon': 100}}

def owner_record():
    p = network.OWNER_CHAGEE
    return record(projectionKind='round2_chagee_owner_assertion', projectionRound=2,
                  sourceArtifactKey=network.ROUND2_MARKER+'restaurants', dataset=network.FOOD,
                  sourceRowKey=p['assertionId'], sourceBranchId=p['googleFeatureId'],
                  brand='CHAGEE', brandId=p['brandId'], canonicalOutletIds=[p['outletId']],
                  venueIds=[p['venueId']], selectedCoordinates=p['selectedCoordinates'],
                  sourceUrl=p['identitySourceUrl'], sourceAuthority='owner_direct_assertion',
                  sourceListingRole='owner_confirmed_current_open_existing_branch', status='owner_reported_open',
                  officialBrandNativeBranchId=None, nativeOwnerReadbackVerified=True,
                  identitySourceObservationId='R2CHOBS-668e715e1135e2aaaf2312ca',
                  ownerEvidence={**{k:v for k,v in p.items() if k!='identitySourceUrl'},
                                 'sourceKind':'explicit_authorized_owner_conversation', 'nativeReadbackVerified':True,
                                 'status':'open','fieldVerified':False,'publicChatUrl':None})

def round3_food_record(**changes):
    row = record(projectionKind='round3_known_food_directory', projectionRound=3,
                 sourceArtifactKey=network.ROUND3_MARKER+'restaurants',
                 sourceRowKey='R3KFOBS-'+'a'*24, sourceBranchId='cpn-mappedin:KBI:el_a123',
                 sourceUrl='https://map.centralpattana.co.th/mall/KBI?location=published-location',
                 nativeFoodReadbackVerified=True, staticScreenVerified=True, nativeIdentityHold=False,
                 identityResolutionVerified=True, sourceUnitConflict=False, sourceFloorConflict=False,
                 rawPointConflict=False, directoryRoutingPointSelected=False,
                 nativeSelectedPointRole='store_source_point',
                 identityResolutionMethods=['exact_selected_authoritative_host_UUID_crosswalk'])
    row['identityResolutionEvidence'] = {
        'sourceObservationId':row['sourceRowKey'], 'publisherObservationId':row['sourceBranchId'],
        'canonicalOutletIds':row['canonicalOutletIds'][:], 'venueIds':row['venueIds'][:],
        'methods':row['identityResolutionMethods'][:], 'nativeReadbackVerified':True,
        'masterFloorUnitPreserved':True,
        'selectedHostIdentityStatus':'current_source_uuid_and_external_id_verified',
        'selectedHostUuid':'01234567-89ab-cdef-0123-456789abcdef'}
    row.update(changes)
    return row

def lush_record(**changes):
    branch='one-bangkok';outlet,host,unit=network.REVIEWED_LUSH[branch]
    row=record(dataset='research.TH.beauty', projectionKind='round3_beauty_official_locator',
               projectionRound=3, sourceArtifactKey=network.ROUND3_MARKER+'beauty',
               sourceRowKey='BESRCP-R3-'+'a'*18,nativeCaptureReceiptId='BESRCP-R3-'+'a'*18,
               sourceRecordRole='fresh_primary_HTTP_capture_receipt_with_reviewed_existing_canonical_branch',
               originalNativeObservationId='BEO-'+ 'b'*18,existingSourceIds=['BEO-'+'b'*18,outlet],
               sourceBranchId=branch,sourceNativeBranchId=branch,
               brand='LUSH',brandId='BEB-03e78e0ed96758f598',canonicalOutletIds=[outlet],venueIds=[host],
               sourceUrl='https://th.lush.com/en/stores/'+branch,
               sourceAuthority='official_brand_consumer_locator',
               sourceListingRole='official_consumer_beauty_location',unitFloor=unit,
               storeFormat='mall_shop',nativeStoreFormat='mall_shop',nativeScopeStatus='approved_core',
               nativeBeautyReadbackVerified=True,nativeUnitEvidenceVerified=True,nativeScopeApproved=True,
               nativeIdentityHold=False,sourceUnitConflict=False,rawPointConflict=False,
               physicalShopfrontVerified=False)
    row.update(changes)
    return row

def degree_record(ordinal=1, **changes):
    index=ordinal if ordinal<=12 else ordinal-12
    outlet,host,url,sha=network.REVIEWED_425[index]
    row=record(dataset=network.MISC,projectionKind='round3_misc_425_consumer_locator',projectionRound=3,
               sourceArtifactKey=network.ROUND3_MARKER+'miscellaneous',
               sourceRowKey='round3-425-view-'+str(ordinal),
               sourceBranchId='425:th-our-stores:5ebcc4d3958803d0:'+str(ordinal),
               sourceNativeBranchId='DOM-card-'+str(ordinal),brand='425 Degree',
               brandId='BR-MISC-67ac042caff040f11d0f',canonicalOutletIds=[outlet],venueIds=[host],
               sourceAuthority='official_brand_consumer_locator',sourceUrl='https://www.425degree.com/our-stores',
               sourceSha256='5ebcc4d3958803d054cee6c729a1fae878bf4b84359623c6b11cfdb970115af6',
               sourceListingRole='consumer_visible_store_or_service',nativeMiscReadbackVerified=True,
               category='electronics_mobile_accessories',
               nativePublicQualificationReadbackVerified=True,nativeIdentityHold=False,sourceUnitConflict=False,
               rawPointConflict=False,sourceCountry='TH',scopeStatus='miscellaneous_current_registry_gap',
               brandIdentityRole='retail_banner_or_service_provider',nativeFormatScopeApproval=False,
               nativeScopeApprovalChanged=False,physicalShopfrontVerified=False,physicalUnitMerge=False,
               unitContinuityAsserted=False,currentPOSDelta=0,
               storeFormat='425_Degree_official_individually_named_consumer_store_with_owner_floorplan',
               nativeStoreFormat='official_named_consumer_store_floorplan_identity_unit_continuity_not_verified',
               linkedFloorplanEvidence={'sourceObservationId':'425:th-floorplan:'+sha[:16]+':'+str(index),
                   'sourceUrl':url,'sourceSha256':sha,'sourceHashScope':'exact owner-linked floorplan image bytes',
                   'checkedOn':'2026-11-07','nativeReadbackVerified':True,
                   'sourceRole':'named_consumer_shop_floorplan_identity_not_georeferenced_point'})
    row.update(changes)
    return row

def national_record(**changes):
    row=degree_record()
    row.update(projectionKind='round3_misc_national_consumer_locator',sourceRowKey='round3-national:No-34',
               sourceBranchId='true:shoplocations:version-14092026:No-34',sourceNativeBranchId='No-34',
               brand='True Shop',brandId='BR-MISC-af7ce357d04848826916',
               canonicalOutletIds=['OUT-1'],existingSourceIds=['OUT-1'],venueIds=['HOST-1'],
               sourceUrl=network.TRUE_CONSUMER_PUBLICATION[2][0],
               sourceSha256=network.TRUE_CONSUMER_PUBLICATION[2][1],
               sourcePeriod='locator_file_version14092026_not_operating_date',
               category='mobile_telecom_consumer_store_or_service',
               storeFormat=network.NATIONAL_CONSUMER_FORMATS['BR-MISC-af7ce357d04848826916'],
               nativeStoreFormat=network.NATIONAL_CONSUMER_FORMATS['BR-MISC-af7ce357d04848826916'],
               rawPublisherMarker=[13,100],rawMarkerBinding='publisher_branch_bound_locator_or_directions_marker',
               sourceRawMarkerReadbackVerified=True,
               consumerPublicationBinding={
                   'kind':'live_consumer_HTML_to_pinned_HTML_to_pinned_JSON','nativeReadbackVerified':True,
                   'parentConsumerUrl':network.TRUE_CONSUMER_PUBLICATION[0][0],
                   'parentConsumerSha256':network.TRUE_CONSUMER_PUBLICATION[0][1],
                   'intermediateUrl':network.TRUE_CONSUMER_PUBLICATION[1][0],
                   'intermediateSha256':network.TRUE_CONSUMER_PUBLICATION[1][1],
                   'exactSourceUrl':network.TRUE_CONSUMER_PUBLICATION[2][0],
                   'exactSourceSha256':network.TRUE_CONSUMER_PUBLICATION[2][1]})
    row.pop('linkedFloorplanEvidence')
    row.update(changes)
    return row

def round4_record(**changes):
    row = record(dataset='research.TH.beauty', projectionKind=network.ROUND4_KIND,
                 projectionRound=4, sourceArtifactKey=network.ROUND4_MARKER+'beauty',
                 sourceRowKey='round4:consumer:sephora:central-park',
                 sourceBranchId='cpn-mappedin:RM4:reviewed-sephora',
                 brand='SEPHORA', brandId='BEB-REVIEWED',
                 canonicalOutletIds=['EXISTING-SEPHORA'], existingSourceIds=['EXISTING-SEPHORA'],
                 nativeVenueId='SC-001066', venueIds=['SC-001066'], unitFloor='L2 | 205-206',
                 sourceUrl='https://map.centralpattana.co.th/mall/RM4?location=reviewed-sephora',
                 sourceListingRole='reviewed_current_consumer_directory_membership',
                 nativeCanonicalReadbackVerified=True, nativeSourceReadbackVerified=True,
                 nativeShoppingLinkReadbackVerified=True, nativeIdentityHold=False,
                 sourceUnitConflict=False, rawPointConflict=False, currentPOSDelta=0,
                 physicalShopfrontVerified=False, nativeScopeApproved=True,
                 rawPublisherMarker=[None, None])
    row.update(changes)
    return row

class Round4Review(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.review_file = pathlib.Path(self.directory.name) / 'reviewed-memberships.json'
        self.review_patch = patch.object(network, 'ROUND4_REVIEW_FILE', self.review_file)
        self.review_patch.start()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.review_patch.stop)
        self.venues = {
            'SC-001052': {'id': 'SC-001052', 'name': 'Park Silom', 'lat': 13.728, 'lon': 100.534},
            'SC-001066': {'id': 'SC-001066', 'name': 'Central Park', 'lat': 13.728, 'lon': 100.538},
            'SC-C0015': {'id': 'SC-C0015', 'name': 'One Bangkok', 'lat': 13.726, 'lon': 100.547},
            'VN-88dbfd6362e923': {'id': 'VN-88dbfd6362e923', 'name': 'Parade',
                                  'parentId': 'SC-C0015', 'lat': 13.726, 'lon': 100.547},
            'VN-4d6c8a6f3db541': {'id': 'VN-4d6c8a6f3db541', 'name': 'The Storeys',
                                  'parentId': 'SC-C0015', 'lat': 13.726, 'lon': 100.547}}

    def admit(self, rows):
        self.review_file.write_text(json.dumps({'memberships': copy.deepcopy(rows)}))

    def packet(self, rows, components=False):
        result = payload(rows)
        result['meta']['round4AllNativeReadbacksVerified'] = True
        if components:
            result['meta']['componentPublicationHosts'] = copy.deepcopy(network.COMPONENT_PUBLICATION_HOSTS)
        return result

    def test_round4_requires_one_exact_reviewed_identity_source_unit_host_and_marker_tuple(self):
        row = round4_record()
        self.admit([row])
        self.assertIsNone(network.gate(row, '2026-11-07'))
        for change in [
                {'sourceRowKey': 'unreviewed-row'}, {'sourceBranchId': 'unreviewed-publisher-card'},
                {'canonicalOutletIds': ['ANOTHER-OUTLET']}, {'brandId': 'ANOTHER-BANNER'},
                {'existingSourceIds': ['UNRELATED-EXISTING-OUTLET']},
                {'brand': 'Unreviewed banner'}, {'sourceStoreName': 'Unreviewed raw store card'},
                {'nativeVenueId': 'SC-001052'}, {'venueIds': ['SC-001052']},
                {'unitFloor': 'L2 | 208'},
                {'sourceUrl': 'https://map.centralpattana.co.th/mall/RM4?location=other'},
                {'sourceSha256': 'b'*64}, {'sourceHashScope': 'native_integrity_only'},
                {'checkedOn': '2026-11-06'},
                {'selectedCoordinates': [13.728, 100.538]},
                {'rawPublisherMarker': [13.728, 100.538]},
                {'sourceAuthority': 'official_brand_consumer_branch_locator'}]:
            with self.subTest(change=change):
                self.assertIsNotNone(network.gate({**row, **change}, '2026-11-07'))
        self.admit([row, row])
        self.assertEqual(network.gate(row, '2026-11-07'), 'round4_reviewed_membership_tuple_mismatch')
        self.review_file.unlink()
        self.assertEqual(network.gate(row, '2026-11-07'), 'round4_review_receipt_missing')

    def test_round4_native_qualification_cannot_be_promoted_by_an_exact_host_or_manifest(self):
        row = round4_record()
        self.admit([row])
        for change in [{'nativeCanonicalReadbackVerified': False}, {'nativeSourceReadbackVerified': False},
                       {'nativeShoppingLinkReadbackVerified': False}, {'nativeIdentityHold': True},
                       {'sourceUnitConflict': True}, {'rawPointConflict': True},
                       {'currentPOSDelta': 1}, {'currentPOSDelta': False},
                       {'physicalShopfrontVerified': True}, {'nativeScopeApproved': False}]:
            with self.subTest(change=change):
                self.assertIsNotNone(network.gate({**row, **change}, '2026-11-07'))
        misc = round4_record(dataset=network.MISC, nativeScopeApprovalChanged=False,
                            brandIdentityRole='retail_banner_or_service_provider',
                            storeFormat='source_listed_consumer_location_format_unresolved')
        self.admit([misc])
        self.assertIsNone(network.gate(misc, '2026-11-07'))
        for change in [{'brandIdentityRole': 'provisional_trade_name'},
                       {'storeFormat': 'confirmed_independent_shop'},
                       {'nativeScopeApprovalChanged': True}]:
            self.assertIsNotNone(network.gate({**misc, **change}, '2026-11-07'))
        misroute = round4_record(dataset='research.TH.generic_medical_clinic')
        self.admit([misroute])
        self.assertEqual(network.gate(misroute, '2026-11-07'), 'dataset_out_of_scope')
        packet = self.packet([row])
        packet['meta']['round4AllNativeReadbacksVerified'] = False
        with self.assertRaisesRegex(ValueError, 'specific source master readback'):
            network.merge(packet, {}, self.venues, lambda own, vid: (True, None))

    def test_round4_far_raw_marker_cannot_be_bypassed_by_a_null_chosen_point(self):
        row = round4_record(selectedCoordinates=[None, None], rawPublisherMarker=[14.5, 101.5])
        self.admit([row])
        check = network.point_checker(self.venues, {'features': []})
        result, receipt = network.merge(self.packet([row]), {}, self.venues, check)
        self.assertEqual(result, {})
        self.assertEqual(receipt['omitted'], {'raw_branch_marker_host_conflict': 1})
        self.assertEqual(row['selectedCoordinates'], [None, None])
        self.assertEqual(row['rawPublisherMarker'], [14.5, 101.5])

    def test_round4_same_brand_and_floor_do_not_corroborate_a_different_original_unit(self):
        row = round4_record(sourceRowKey='round4:sephora:unit-208',
                            sourceBranchId='cpn-mappedin:RM4:unit-208',
                            sourceStoreName='SEPHORA Central Park Unit 208',
                            canonicalOutletIds=['OUT-SEPHORA-208'],
                            existingSourceIds=['OUT-SEPHORA-208'], unitFloor='L2 | 208')
        original = {'id': 'upstream:OUT-SEPHORA-205', 'name': 'SEPHORA Unit 205',
                    'brand': 'SEPHORA', 'unitFloor': 'L2 | 205',
                    'status': 'retained_upstream_source_status',
                    'sourceObservationIds': ['UPSTREAM-SEPHORA-205']}
        roster = {'SC-001066': [original]}
        frozen = copy.deepcopy(roster)
        self.admit([row])

        result, receipt = network.merge(self.packet([row]), roster, self.venues,
                                        lambda own, vid: (True, None))

        self.assertEqual(result, frozen)
        self.assertEqual(roster, frozen)
        self.assertNotIn('corroboratingMembershipEvidence', result['SC-001066'][0])
        self.assertEqual(receipt['newItems'], 0)
        self.assertEqual(receipt['corroboratingExistingItems'], 0)
        self.assertEqual(receipt['omitted'],
                         {'round4_same_brand_host_without_verified_outlet_crosswalk': 1})

    def test_round4_distinct_new_unit_ids_need_a_bridge_even_on_the_same_brand_floor(self):
        first = round4_record(sourceRowKey='round4:sephora:a-unit-205',
                              sourceBranchId='cpn-mappedin:RM4:unit-205',
                              sourceStoreName='SEPHORA Central Park Unit 205',
                              canonicalOutletIds=['OUT-SEPHORA-205'],
                              existingSourceIds=['OUT-SEPHORA-205'], unitFloor='L2 | 205')
        # A second publisher must not make a same-floor identity guess safer.
        for second_url in [
                'https://map.centralpattana.co.th/mall/RM4?location=unit-208',
                'https://www.centralpattana.co.th/en/shopping/central-park/unit-208']:
            with self.subTest(source_url=second_url):
                second = round4_record(sourceRowKey='round4:sephora:b-unit-208',
                                       sourceBranchId='cpn-storepage:RM4:unit-208',
                                       sourceStoreName='SEPHORA Central Park Unit 208',
                                       canonicalOutletIds=['OUT-SEPHORA-208'],
                                       existingSourceIds=['OUT-SEPHORA-208'],
                                       unitFloor='L2 | 208', sourceUrl=second_url)
                self.admit([first, second])
                packet = self.packet([first, second])
                frozen = copy.deepcopy(packet)

                result, receipt = network.merge(packet, {}, self.venues,
                                                lambda own, vid: (True, None))

                self.assertEqual(len(result['SC-001066']), 1)
                retained = result['SC-001066'][0]
                self.assertEqual(retained['matchedSourceStoreIds'], ['OUT-SEPHORA-205'])
                self.assertEqual(retained['unitFloor'], 'L2 | 205')
                self.assertEqual(retained['sourceObservationCount'], 1)
                self.assertNotIn('corroboratingMembershipEvidence', retained)
                self.assertEqual(receipt['newItems'], 1)
                self.assertEqual(receipt['corroboratingNewItems'], 0)
                self.assertEqual(receipt['omitted'],
                                 {'round4_same_brand_host_without_verified_outlet_crosswalk': 1})
                self.assertEqual(packet, frozen)

    def test_round4_brand_branch_locator_keeps_its_authority_and_exact_reviewed_branch(self):
        row = round4_record(dataset='research.TH.sport', brand='On', brandId='BR-SP-022',
                            sourceRowKey='on:store:bangkok-one-bangkok',
                            sourceBranchId='on:store:bangkok-one-bangkok',
                            canonicalOutletIds=['OUT-SP-7355ee244e437a09e3'],
                            existingSourceIds=['OUT-SP-7355ee244e437a09e3'],
                            nativeVenueId='VN-4d6c8a6f3db541', venueIds=['SC-C0015'],
                            unitFloor='The Storeys; 1st Floor',
                            sourceAuthority='official_brand_consumer_branch_locator',
                            sourceUrl='https://www.on.com/en-th/explore/stores/bangkok-one-bangkok')
        self.admit([row])
        self.assertIsNone(network.gate(row, '2026-11-07'))
        for change in [
                {'sourceAuthority': 'official_venue_consumer_directory'},
                {'sourceAuthority': 'official_brand_consumer_locator'},
                {'sourceUrl': 'https://www.owndays.com/th/en/shops/272'},
                {'sourceUrl': 'https://www.on.com/en-th/explore/stores/bangkok-iconsiam'},
                {'sourceRowKey': 'on:store:unreviewed', 'sourceBranchId': 'on:store:unreviewed'},
                {'sourceSha256': 'c'*64}, {'unitFloor': 'Parade; 1st Floor'}]:
            with self.subTest(change=change):
                self.assertIsNotNone(network.gate({**row, **change}, '2026-11-07'))

    def test_round4_parent_presentation_keeps_native_component_and_is_not_a_second_shop(self):
        child = 'VN-4d6c8a6f3db541'
        prior = record(sourceRowKey='prior:storeys:branch', venueIds=[child],
                       canonicalOutletIds=['SHARED-OUTLET'], existingSourceIds=['SHARED-OUTLET'])
        current = round4_record(dataset=network.FOOD, nativeVenueId=child, venueIds=['SC-C0015'],
                                sourceRowKey='round4:storeys:branch', canonicalOutletIds=['SHARED-OUTLET'],
                                existingSourceIds=['SHARED-OUTLET'], unitFloor='The Storeys | 1F',
                                brand='Coffee One', brandId='BR-COFFEE')
        self.admit([current])
        packet = self.packet([prior, current], components=True)
        frozen = copy.deepcopy(packet)
        result, receipt = network.merge(packet, {}, self.venues, lambda own, vid: (True, None))
        self.assertEqual(result.get(child, []), [])
        self.assertEqual(len(result['SC-C0015']), 1)
        item = result['SC-C0015'][0]
        self.assertEqual(item['matchedSourceStoreIds'], ['SHARED-OUTLET'])
        self.assertEqual(item['registeredChildVenueId'], child)
        self.assertEqual(item['publicationVenueId'], 'SC-C0015')
        self.assertEqual(item['corroboratingMembershipEvidence'][0]['registeredChildVenueId'], child)
        self.assertEqual(len(receipt['componentPublicationRollup']), 1)
        self.assertEqual(receipt['componentPublicationRollup'][0]['disposition'], 'existing_parent_corroboration')
        self.assertEqual(packet, frozen)
        again, _ = network.merge(packet, result, self.venues, lambda own, vid: (True, None))
        self.assertEqual(again, result)

    def test_prior_component_listing_moves_once_and_retains_canonical_identity_on_rerun(self):
        child = 'VN-88dbfd6362e923'
        row = record(sourceRowKey='prior:parade:one-shop', venueIds=[child], unitFloor='B1 | 1B115')
        packet = self.packet([row], components=True)
        protected = {'id': 'upstream:PROTECTED', 'name': 'Protected upstream branch',
                     'brand': 'Different retailer', 'status': 'unreviewed_upstream_status'}
        result, receipt = network.merge(packet, {child: [protected]}, self.venues,
                                        lambda own, vid: (True, None))
        self.assertEqual(result[child], [protected])
        self.assertEqual(len(result['SC-C0015']), 1)
        item = result['SC-C0015'][0]
        self.assertEqual(item['id'], network.FOOD+':02_STORES:OUT-1')
        self.assertEqual(item['matchedSourceStoreIds'], ['OUT-1'])
        self.assertEqual(item['registeredChildVenueId'], child)
        self.assertEqual(item['publicationVenueId'], 'SC-C0015')
        self.assertEqual(item['unitFloor'], 'Parade | B1 | 1B115')
        self.assertEqual(len(receipt['componentPublicationRollup']), 1)
        again, receipt_again = network.merge(packet, result, self.venues, lambda own, vid: (True, None))
        self.assertEqual(again, result)
        self.assertEqual(receipt_again['componentPublicationRollup'], receipt['componentPublicationRollup'])

    def test_component_presentation_needs_the_exact_mapping_and_registered_hierarchy(self):
        child = 'VN-4d6c8a6f3db541'
        row = round4_record(nativeVenueId=child, venueIds=['SC-C0015'])
        self.admit([row])
        with self.assertRaisesRegex(ValueError, 'component publication receipt'):
            network.merge(self.packet([row]), {}, self.venues, lambda own, vid: (True, None))
        packet = self.packet([row], components=True)
        packet['meta']['componentPublicationHosts'] = {child: 'SC-C0015'}
        with self.assertRaisesRegex(ValueError, 'unreviewed component publication mapping'):
            network.merge(packet, {}, self.venues, lambda own, vid: (True, None))
        venues = copy.deepcopy(self.venues)
        venues[child]['parentId'] = 'SC-001052'
        with self.assertRaisesRegex(ValueError, 'registered retail component hierarchy changed'):
            network.merge(self.packet([row], components=True), {}, venues, lambda own, vid: (True, None))

class Gates(unittest.TestCase):
    def test_national_cards_need_the_exact_live_consumer_publication_chain_and_specific_format(self):
        row=national_record()
        self.assertIsNone(network.gate(row,'2026-11-07'))
        for change in [{'consumerPublicationBinding':{}},{'sourceUrl':'https://assets.contentstack.io/unreviewed.json'},
                       {'sourceNativeBranchId':'No-35'},{'storeFormat':'TrueSphere lounge'},
                       {'sourcePeriod':'confirmed_open_2026-09-14'},{'sourceRawMarkerReadbackVerified':False},
                       {'rawPointConflict':True},{'rawMarkerBinding':'viewport_context_unproven'},
                       {'rawPublisherMarker':[None,None]}]:
            self.assertIsNotNone(network.gate({**row,**change},'2026-11-07'),change)
        q=copy.deepcopy(row);q['consumerPublicationBinding']['parentConsumerSha256']='f'*64
        self.assertIsNotNone(network.gate(q,'2026-11-07'))
        q={**row,'sourceBranchId':'true:shoplocations:version-14092026:No-611','sourceNativeBranchId':'No-611'}
        self.assertIsNotNone(network.gate(q,'2026-11-07'))

    def test_ais_consumer_linked_api_is_not_a_general_staging_or_partner_permission(self):
        url,sha=next(iter(network.AIS_CONSUMER_REQUESTS.items()))
        row=national_record(brand='AIS',brandId='HOB-BR-P-92b2dcf82cbe',sourceNativeBranchId='45',
            sourceBranchId='ais-main-consumer:TH:LocationInfoProfile:location-45',sourceUrl=url,sourceSha256=sha,
            storeFormat=network.NATIONAL_CONSUMER_FORMATS['HOB-BR-P-92b2dcf82cbe'],
            nativeStoreFormat=network.NATIONAL_CONSUMER_FORMATS['HOB-BR-P-92b2dcf82cbe'],
            consumerPublicationBinding={'kind':'live_official_consumer_HTML_to_regional_API',
                'nativeReadbackVerified':True,'bindingId':network.AIS_CONSUMER_PUBLICATION[0],
                'parentConsumerUrl':network.AIS_CONSUMER_PUBLICATION[1],
                'parentConsumerSha256':network.AIS_CONSUMER_PUBLICATION[2],
                'exactSourceUrl':url,'exactSourceSha256':sha})
        self.assertIsNone(network.gate(row,'2026-11-07'))
        for change in [{'sourceUrl':'https://stg-connex.ais.co.th/phxPartner/v1/partner/private'},
                       {'sourceUrl':'https://retail.ais.th/'},{'sourceAuthority':'payment_partner_list'},
                       {'nativeStoreFormat':'DIRECT_SALES_PERSONAL_CONTACT'},
                       {'consumerPublicationBinding':{}},{'brandId':'OTHER-DEALER'}]:
            self.assertIsNotNone(network.gate({**row,**change},'2026-11-07'),change)

    def test_425_host_only_record_without_view_to_native_branch_floorplan_proof_stays_out(self):
        r=degree_record()
        self.assertIsNone(network.gate(r,'2026-11-07'))
        for change in [{'linkedFloorplanEvidence':None},{'sourceNativeBranchId':'DOM-card-2'},
                       {'brandId':'UNREVIEWED-BANNER'},{'venueIds':['OTHER-HOST']},
                       {'nativeIdentityHold':True},{'nativePublicQualificationReadbackVerified':False},
                       {'nativeFormatScopeApproval':True},{'physicalUnitMerge':True},
                       {'unitContinuityAsserted':True},{'sourceUnitConflict':True},
                       {'rawPointConflict':True},{'selectedCoordinates':[13,100]},
                       {'storeFormat':'product_counter'},{'sourceUrl':'https://www.425degree.com/partner-list'}]:
            self.assertIsNotNone(network.gate({**r,**change},'2026-11-07'),change)
        q=copy.deepcopy(r);q['linkedFloorplanEvidence']['sourceSha256']='f'*64
        self.assertIsNotNone(network.gate(q,'2026-11-07'))

    def test_round3_food_needs_resolved_source_identity_not_only_an_accepted_host(self):
        r=round3_food_record()
        self.assertIsNone(network.gate(r,'2026-11-07'))
        for key,value in [('identityResolutionVerified',False),('staticScreenVerified',False),
                          ('nativeFoodReadbackVerified',False),('nativeIdentityHold',True),
                          ('sourceUnitConflict',True),('sourceFloorConflict',True),('rawPointConflict',True),
                          ('directoryRoutingPointSelected',True),('storeFormat','department_product_presence')]:
            self.assertIsNotNone(network.gate({**r,key:value},'2026-11-07'),key)
        for key,value in [('publisherObservationId','unrelated-card'),('venueIds',['OTHER-HOST']),
                          ('canonicalOutletIds',['OTHER-OUTLET']),('masterFloorUnitPreserved',False),
                          ('selectedHostIdentityStatus','historical_candidate_only'),('selectedHostUuid',None)]:
            q=copy.deepcopy(r);q['identityResolutionEvidence'][key]=value
            self.assertIsNotNone(network.gate(q,'2026-11-07'),key)
        for proof in [None,True,{}]:
            self.assertIsNotNone(network.gate({**r,'identityResolutionEvidence':proof},'2026-11-07'))

    def test_round3_floor_alias_does_not_need_or_invent_a_host_uuid(self):
        r=round3_food_record(identityResolutionMethods=['exact_ordinal_or_spacing_alias'])
        r['identityResolutionEvidence'].update(methods=r['identityResolutionMethods'],
                                               selectedHostUuid=None,selectedHostIdentityStatus=None)
        self.assertIsNone(network.gate(r,'2026-11-07'))
        r['identityResolutionMethods']=['nearest_host_or_similar_floor']
        r['identityResolutionEvidence']['methods']=r['identityResolutionMethods']
        self.assertIsNotNone(network.gate(r,'2026-11-07'))

    def test_round3_publisher_keys_cannot_be_rehomed_or_gain_a_generic_directory_permission(self):
        r=round3_food_record()
        for change in [{'sourceUrl':'https://map.centralpattana.co.th/mall/OTHER'},
                       {'sourceUrl':'https://unreviewed.centralpattana.co.th/mall/KBI'},
                       {'sourceUrl':'https://map.centralpattana.co.th/mall/KBI?access_token=private'},
                       {'sourceAuthority':'retained_primary_brand_or_host_master'},
                       {'projectionKind':'base'},{'projectionRound':2},
                       {'sourceArtifactKey':network.ROUND2_MARKER+'restaurants'}]:
            self.assertIsNotNone(network.gate({**r,**change},'2026-11-07'),change)

    def test_round3_source_point_conflict_is_held_even_when_selected_coordinates_are_null(self):
        self.assertIsNotNone(network.gate(round3_food_record(rawPointConflict=True),'2026-11-07'))
        for point in [[True,100],[float('nan'),100],[13,None],[13,100,1]]:
            self.assertIsNotNone(network.gate(round3_food_record(selectedCoordinates=point),'2026-11-07'))
        self.assertIsNotNone(network.gate(round3_food_record(selectedCoordinates=[13,100],
                                                              nativeSelectedPointRole='host_centroid'),'2026-11-07'))

    def test_lush_gate_is_limited_to_the_reviewed_brand_store_child_host_and_unit(self):
        r=lush_record()
        self.assertIsNone(network.gate(r,'2026-11-07'))
        for change in [{'brandId':'OTHER-BEAUTY-BRAND'},{'sourceBranchId':'unreviewed-store'},
                       {'venueIds':['PARENT-COMPLEX']},{'unitFloor':'Parade | 2F | guessed-unit'},
                       {'nativeScopeStatus':'scope_review'},{'nativeUnitEvidenceVerified':False},
                       {'storeFormat':'department_counter'},{'rawPointConflict':True},
                       {'selectedCoordinates':[13,100]},{'physicalShopfrontVerified':True},
                       {'sourceUrl':'https://other.th.lush.com/en/stores/one-bangkok'}]:
            self.assertIsNotNone(network.gate({**r,**change},'2026-11-07'),change)
        self.assertIsNone(network.gate(lush_record(sourceBranchId='westville',sourceNativeBranchId='westville',
                                                  canonicalOutletIds=[network.REVIEWED_LUSH['westville'][0]],
                                                  venueIds=[network.REVIEWED_LUSH['westville'][1]],
                                                  unitFloor='GF | unit not stated',
                                                  sourceUrl='https://th.lush.com/en/stores/westville'),'2026-11-07'))

    def test_lush_source_role_and_basis_describe_its_brand_locator_without_a_counter_claim(self):
        row=lush_record();host=row['venueIds'][0]
        item=network.food_item([row],{'id':host,'name':'The Parade'})
        self.assertEqual(item['sourceRole'],'official_brand_exact_named_host_listing')
        self.assertEqual(item['sourceAuthority'],'official_brand_consumer_locator')
        self.assertIn('brand_locator',item['relationshipBasis'])
        self.assertEqual(item['storeFormat'],'mall_shop')
        self.assertNotIn('format unresolved',item['identityNote'])
        self.assertNotIn('venue_directory',item['relationshipBasis'])

    def test_lush_fresh_hash_and_date_must_reference_the_actual_new_capture_receipt(self):
        row=lush_record()
        for change in [{'sourceRowKey':row['originalNativeObservationId']},
                       {'nativeCaptureReceiptId':'missing-capture'},
                       {'sourceRecordRole':'older_native_branch_observation'},
                       {'originalNativeObservationId':None},{'existingSourceIds':row['canonicalOutletIds']}]:
            self.assertIsNotNone(network.gate({**row,**change},'2026-11-07'),change)

    def test_chagee_owner_open_requires_exact_dated_native_assertion_and_branch_host_point(self):
        r=owner_record()
        self.assertIsNone(network.gate(r,'2026-11-07'))
        for change in [{'ownerEvidence':{}},{'nativeOwnerReadbackVerified':False},
                       {'venueIds':['OTHER-HOST']},{'canonicalOutletIds':['OTHER-OUTLET']},
                       {'selectedCoordinates':[13.7,100.5]},{'officialBrandNativeBranchId':'made-up-uuid'},
                       {'sourceAuthority':'official_brand_consumer_locator'},{'status':'publisher_listed_not_field_verified'}]:
            self.assertIsNotNone(network.gate({**r,**change},'2026-11-07'),change)
        for key,value in [('assertionId','missing-proof'),('assertedOn','2026-11-06'),('venueId','OTHER-HOST'),
                          ('selectedCoordinates',[None,None]),('fieldVerified',True)]:
            q=copy.deepcopy(r);q['ownerEvidence'][key]=value
            self.assertIsNotNone(network.gate(q,'2026-11-07'),key)

    def test_owner_open_and_google_identity_keep_different_source_roles_and_no_fake_owner_http_hash(self):
        r=owner_record();item=network.food_item([r],{'id':network.OWNER_CHAGEE['venueId'],'name':'Samyan Mitrtown'})
        self.assertEqual(item['sourceRole'],network.builder.OWNER_ROLE)
        self.assertEqual(item['status'],'owner_reported_open')
        self.assertIsNone(item['officialBrandNativeBranchId'])
        self.assertEqual(item['sourceEvidence'][0]['sourceSha256'],r['sourceSha256'])
        self.assertEqual(item['sourceEvidence'][1]['sourceRole'],'owner_direct_assertion')
        self.assertNotIn('sourceUrl',item['sourceEvidence'][1])
        self.assertNotIn('sourceSha256',item['sourceEvidence'][1])
        self.assertEqual(item['sourceObservationCount'],2)

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

    def test_round2_service_scope_and_unit_conflicts_cannot_be_promoted_by_host_identity(self):
        r=record(dataset='research.TH.salon_barber',projectionKind='bounded_service_directory',projectionRound=2,
                 sourceArtifactKey=network.ROUND2_MARKER+'salon_barber',nativeServiceReadbackVerified=True,
                 nativeIdentityHold=False,nativeScopeApproved=True,sourceRecordTab='02_STORES',
                 sourceListingRole='bounded_consumer_service_observation')
        self.assertIsNone(network.gate(r,'2026-11-07'))
        for change in [{'nativeScopeApproved':False},{'sourceUnitConflict':'411 versus211'},
                       {'nativeIdentityHold':True},{'selectedCoordinates':[13,100]}]:
            self.assertEqual(network.gate({**r,**change},'2026-11-07'),'service_scope_or_identity_hold')

class Reconciliation(unittest.TestCase):
    def test_national_raw_branch_marker_runs_the_current_host_point_gate_even_when_chosen_point_is_null(self):
        row=national_record(rawPublisherMarker=[13.02,100],rawPointConflict=False)
        self.assertIsNone(network.gate(row,'2026-11-07'))
        p=payload([row]);p['meta']['round3MiscNativeReadbackVerified']=True
        check=network.point_checker(VENUES,{'features':[]})
        result,receipt=network.merge(p,{},VENUES,check)
        self.assertEqual(result,{})
        self.assertEqual(receipt['omitted']['raw_branch_marker_host_conflict'],1)
        row=national_record();p['observations']=[row]
        result,receipt=network.merge(p,{},VENUES,check)
        self.assertEqual(receipt['newItems'],1)
        item=result['HOST-1'][0]
        self.assertEqual(item['sourceRole'],network.BRAND_ROLE)
        self.assertNotIn('format unresolved',item['identityNote'])
        self.assertNotIn('rawPublisherMarker',item)
        self.assertNotIn('companyOperator',item)

    def test_425_repeated_views_are_one_branch_with_one_floorplan_and_no_format_or_operator_upgrade(self):
        rows=[degree_record(1),degree_record(13)];vid=rows[0]['venueIds'][0]
        venues={vid:{'id':vid,'name':'CentralWorld','lat':13,'lon':100}}
        p=payload(rows);p['meta']['round3MiscNativeReadbackVerified']=True
        result,receipt=network.merge(p,{},venues,lambda point,host:(True,None))
        self.assertEqual(receipt['newItems'],1)
        item=result[vid][0]
        self.assertEqual(item['sourceRole'],network.BRAND_ROLE)
        self.assertEqual(item['sourceAuthority'],'official_brand_consumer_locator')
        self.assertEqual(item['sourceObservationCount'],2)
        self.assertEqual(len(item['supportingSourceEvidence']),1)
        self.assertNotIn('format unresolved',item['identityNote'])
        self.assertNotIn('companyOperator',item)
        self.assertEqual({x['sourceAuthority'] for x in item['sourceEvidence']},{'official_brand_consumer_locator'})
        again,_=network.merge(p,result,venues,lambda point,host:(True,None))
        self.assertEqual(result,again)

    def test_round3_meta_proof_and_far_point_checks_are_still_required(self):
        r=round3_food_record()
        with self.assertRaises(ValueError):self.merge([r])
        p=payload([r]);p['meta']['round3FoodNativeReadbackVerified']=True
        result,receipt=network.merge(p,{},VENUES,lambda own,vid:(False,901))
        self.assertEqual(result,{})
        self.assertEqual(receipt['omitted']['far_point_conflict'],1)

    def test_round3_corroboration_preserves_round2_facts_and_reruns_without_duplication(self):
        first=record(projectionRound=2,projectionKind='round2_known_food_directory',
                     sourceArtifactKey=network.ROUND2_MARKER+'restaurants',
                     nativeFoodReadbackVerified=True,staticScreenVerified=True,nativeIdentityHold=False)
        initial,_=self.merge([first]);frozen=copy.deepcopy(initial['HOST-1'][0])
        p=payload([first,round3_food_record()]);p['meta']['round3FoodNativeReadbackVerified']=True
        result,_=network.merge(p,initial,VENUES,lambda own,vid:(True,None))
        item=copy.deepcopy(result['HOST-1'][0]);evidence=item.pop('corroboratingMembershipEvidence')
        self.assertEqual(item,frozen)
        self.assertEqual(evidence[0]['projectionRound'],3)
        again,_=network.merge(p,result,VENUES,lambda own,vid:(True,None))
        self.assertEqual(result,again)

    def test_round3_keeps_dated_chagee_owner_operation_separate_and_unchanged(self):
        owner=owner_record();vid=network.OWNER_CHAGEE['venueId']
        venues={**VENUES,vid:{'id':vid,'name':'Samyan Mitrtown','lat':13.7347,'lon':100.5284}}
        first,_=network.merge(payload([owner]),{},venues,lambda own,host:(True,None))
        frozen=copy.deepcopy(first[vid])
        p=payload([owner,round3_food_record()]);p['meta']['round3FoodNativeReadbackVerified']=True
        result,_=network.merge(p,first,venues,lambda own,host:(True,None))
        self.assertEqual(result[vid],frozen)
        self.assertEqual(result[vid][0]['operationEvidence']['sourceRole'],'owner_direct_assertion')
        self.assertNotIn('sourceSha256',result[vid][0]['sourceEvidence'][1])

    def test_round2_exact_source_corroborates_without_changing_round1_item_facts(self):
        first=record()
        initial,_=self.merge([first])
        second=record(projectionRound=2,projectionKind='round2_known_food_directory',
                      sourceArtifactKey=network.ROUND2_MARKER+'restaurants', sourceRowKey='round2-observation',
                      nativeFoodReadbackVerified=True,staticScreenVerified=True,nativeIdentityHold=False)
        result,_=self.merge([second,first],initial)
        frozen=copy.deepcopy(initial['HOST-1'][0]);got=copy.deepcopy(result['HOST-1'][0])
        evidence=got.pop('corroboratingMembershipEvidence')
        self.assertEqual(got,frozen)
        self.assertEqual(len(evidence),1)
        self.assertEqual(evidence[0]['projectionRound'],2)
        again,_=self.merge([second,first],result)
        self.assertEqual(result,again)

    def test_round2_owner_meta_receipt_is_required(self):
        p=payload([owner_record()]);p['meta']['nativeOwnerAssertionReadbackVerified']=False
        with self.assertRaises(ValueError):network.merge(p,{},VENUES,lambda own,vid:(True,None))

    def test_round2_service_needs_its_current_readback_receipt(self):
        r=record(dataset='research.TH.salon_barber',projectionKind='bounded_service_directory',projectionRound=2,
                 sourceArtifactKey=network.ROUND2_MARKER+'salon_barber',nativeServiceReadbackVerified=True,
                 nativeIdentityHold=False,nativeScopeApproved=True,sourceRecordTab='02_STORES',
                 sourceListingRole='bounded_consumer_service_observation')
        with self.assertRaises(ValueError):self.merge([r])

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

#!/usr/bin/env python3
"""Append reviewed official-directory listings to the existing tenant roster.

Input stays outside this repository. It is a field-limited interchange built only
after native research-master writes and their readbacks. This adapter does not
interpret a host-only sidecar as permission to publish every linked source row.
Food retains the existing official-chain role. Miscellaneous admits recognized
retail/service banners with an exact official consumer-directory host, while
retaining unresolved format and industry scope. Partner/employer lists, product
presences, provisional trade names, component holds and operation claims stay out.

Run after the other tenant linkers and before build-tenant-index.py. Re-running
removes only this adapter's previous additions and corroborations. Venue cores,
primary records, original statuses, logos and geometry remain unchanged.
"""
import argparse
import collections
import copy
import hashlib
import importlib.util
import json
import math
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

ROOT = Path(__file__).resolve().parent.parent
MARKER = 'official-venue-network-2026-11-07:'
FOOD = 'research.TH.restaurants'
MISC = 'research.TH.miscellaneous'
FOOD_ROLE = 'official_chain_exact_named_host_listing'
MISC_ROLE = 'official_venue_directory_reconciled_consumer_listing'
DIRECTORY_ROLE = 'official_venue_directory_reconciled_registry_listing'
BRAND_ROLE = 'official_brand_exact_named_host_listing'
HOBBY_ROLE = BRAND_ROLE
SERVICE_ROLE = 'official_venue_directory_reconciled_service_observation'
ROUND2_MARKER = MARKER + 'round2:'
ROUND3_MARKER = MARKER + 'round3:'
NATIONAL_DIRECTORY_CORROBORATIONS = {'huawei:th-storelist:STHABK5942': ('venuein_seacon:project-7:occupant-15057:unit-8203',
                                    'https://seaconsquare-directory.venue.in.th/',
                                    '4197e947bb7724077d94bbee7577ca96d7aeb6066d9da8e066a9494adb736e59'),
 'true:shoplocations:version-14092026:No-132': ('venuein_terminal21:project-20:occupant-29755:unit-33486',
                                                'https://directory-rama3.terminal21.co.th/',
                                                'd1c214a6dcce5b549d219ad64441c490796c2fe611ad4564702ec492f8784a95'),
 'true:shoplocations:version-14092026:No-529': ('venuein_terminal21:project-21:occupant-30263:unit-33962',
                                                'https://directory-pattaya.terminal21.co.th/',
                                                '41b4c1ac81ced1a4369ec7759247b321a6c006c1b69baecb194f87ad764f09ca'),
 'true:shoplocations:version-14092026:No-558': ('venuein_terminal21:project-24:occupant-33170:unit-36216',
                                                'https://directory-korat.terminal21.co.th/',
                                                'c6bf40b1d713597b7d6f515df2874ef70054f52337e0e13255a32f80abfff9d9')}
NATIONAL_CONSUMER_FORMATS = {'BR-MISC-af7ce357d04848826916': 'official_True_Shop_named_consumer_retail_service_premise_not_field_verified',
 'BR-MISC-c4bb2514874b3979fffd': 'official_AIS_TELEWIZ_STANDARD_SHOP_TELEWIZ_dealer_service_premise_not_field_verified',
 'BR-MISC-e57ccf886b08ab2b7b87': 'official_dtac_Hall_named_consumer_service_premise_not_field_verified',
 'HOB-BR-P-92b2dcf82cbe': 'official_AIS_RETAIL_AISSHOP_consumer_service_premise_not_field_verified',
 'HOB-BR-P-f41b42c13069': 'official_Huawei_Store_consumer_retail_named_premise_not_field_verified'}
ROUND3_KINDS = {'round3_known_food_directory', 'round3_beauty_official_locator',
                'round3_misc_425_consumer_locator', 'round3_misc_national_consumer_locator'}
AIS_CONSUMER_PUBLICATION = ('ais-main-consumer-regional-publication-binding-20261107',
 'https://www.ais.th/consumers/service-center',
 '904fcae5cc9119f0113e757a6b12ffc5f048aa899617c10cf3617f02818d6a34')
AIS_CONSUMER_REQUESTS = {'https://stg-connex.ais.co.th/phxPartner/v1/partner/LocationInfoProfile/BKK': '9d3de608b3327d7d98977190eea983c385122f21d0144d1293cf937ad6812982',
 'https://stg-connex.ais.co.th/phxPartner/v1/partner/LocationInfoProfile/ROC': '83505d6aed6335c785f8572552046914843381daaf1c668f859fc20a79b95112',
 'https://stg-connex.ais.co.th/phxPartner/v1/partner/LocationInfoProfile/ROE': '8d27243719a150498ca985b2fe37d367b4469a81d93cc42d599d58dbde42510e',
 'https://stg-connex.ais.co.th/phxPartner/v1/partner/LocationInfoProfile/RON': '3d051ce4ca30a9dbd8fe740d47110fc0e3c4b7e80a9aeadb87f2780e1be9f8f1',
 'https://stg-connex.ais.co.th/phxPartner/v1/partner/LocationInfoProfile/RONE': '92cd7a7534029a55270933c56a35a66cddf2efe37c4d492487d0ced471c22dc9',
 'https://stg-connex.ais.co.th/phxPartner/v1/partner/LocationInfoProfile/ROS': '2658cc15dcef3076d9223a2c2357e8183cda59a39d072a5b12eeaf8d00f2358f'}
TRUE_CONSUMER_PUBLICATION = (('https://www.true.th/services/shop-locations',
  'c47e01d4113c0c2b297b66fa5ce512c1650ba2e59937db182057ac1b033d3950'),
 ('https://assets.contentstack.io/v3/assets/blt8ba403bee4433fd8/blta40e87539a61b959/6aa8aab02a8ab605cb42727f/shop-location-th-14092026.html',
  '9235b6c2b1e5628801d8e93b9aabdefb974395b8348ee04f2024e3975224b3e5'),
 ('https://assets.contentstack.io/v3/assets/blt8ba403bee4433fd8/blt66576ec6be5c1858/6aa7bb5dd1556f8bcc727085/shop-14092026.json',
  '3f4b2939c24d213eed19c8ec2a4343bb0226a16c4becc68819ae7a17ef19b311'))
NATIONAL_INTAKE_HELD_SOURCES = {'ais-main-consumer:TH:LocationInfoProfile:location-128',
 'ais-main-consumer:TH:LocationInfoProfile:location-139003',
 'ais-main-consumer:TH:LocationInfoProfile:location-141260',
 'huawei:th-storelist:STHABK4399',
 'true:shoplocations:version-14092026:No-369',
 'true:shoplocations:version-14092026:No-524',
 'true:shoplocations:version-14092026:No-611'}
REVIEWED_425 = {1: ('OUT-MISC-de3abba8de639563afd8',
     'SC-001245',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/Map_CTW.jpg',
     'd64c509aba607c23c0e716625e62203fc07b88abdd238e1f285ae234dddecf83'),
 2: ('OUT-MISC-8e5eb4e4ccfae63f7d5d',
     'SC-001244',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/map-paragon.jpg',
     'fd2dc6814844a155db35f8d3b83b1d07d3672e961f9908290b1d5fb64f320f29'),
 3: ('OUT-MISC-75fa6d82f1837ffe4bfd',
     'SC-001066',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/250908_425_Dusit-Central-Park_Map-info.jpg',
     'fac97bbbfb920ca9d365fd121e74ca384d107ef255aed11cc0e2a7c32831811d'),
 4: ('OUT-MISC-34dee8ef90d9eb246d83',
     'SC-000289',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/425_Store_info_map_Emsphere.jpg',
     '877395c6532328671cd1742611b1978fd4a54774c36bcd45726ed41ea6711ec2'),
 5: ('OUT-MISC-30b8dd24d7b0364b90f4',
     'SC-012204',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/map-info-mega-bangna.jpg',
     'f070d3f077ba3d48941983c55eb2ced5c1e81860841002cfbc6e599c78dd638a'),
 6: ('OUT-MISC-cfec325709f811b6c0a4',
     'SC-000337',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/240627_map_fashionisland.jpg',
     '5765c35b7a4344419652eabf8f480b0e8aa8083d8c31285a830f11be59619a77'),
 7: ('OUT-MISC-32fc2233f990013734ee',
     'SC-007290',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/Future-Park-_-Zpell.jpg',
     'c953db3289993ba1cc265d2e3d45e358af950c0c118394de6097a6f082effa48'),
 8: ('OUT-MISC-6b5bbf42c79b4fcb5625',
     'SC-006353',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/425_Store_info_map_Central_Westville.jpg',
     'af8cad032569f90569909ee21c1a6c2f044ea95824167905fde1e84c99e73820'),
 9: ('OUT-MISC-96b936586d8388c7fd6d',
     'SC-006590',
     'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/The-Mall-Lifestore-Ngamwongwan.jpg',
     '7dcfccc295911b531e31cd17df7afcab8826242985f2bd90411e42caa18ed2a7'),
 10: ('OUT-MISC-cb590a3ec04133430a00',
      'SC-003895',
      'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/250702_map-info-central-chonburi.jpg',
      '34030e570db7c6acbc24d3313216b5350671be590a484409a192ba400ec339b2'),
 11: ('OUT-MISC-4d17aea23b6974db88e6',
      'SC-C0262',
      'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/map_central-pattaya.jpg',
      '8548f141d1f425e796f44f8a668312820e4923e428f23fb77fec20f503dc17f9'),
 12: ('OUT-MISC-e8cdda55a15e2120d7c2',
      'SC-010265',
      'https://cdn4.425degree.com/media/catalog/category/425_etc/425_store/425shop/425_Store_Map_info_Central_Rayong.jpg',
      '07c6d6111862d314162e5dc4c9698cfbc22f025a678638e7163064ebab031330')}
REVIEWED_LUSH = {
    'chiang-mai': ('BEOU-affe7d4f1cb953c4a9', 'SC-015800', '2F | Room 233/1'),
    'westville': ('BEOU-4ce727c63ee65224b6', 'SC-006353', 'GF | unit not stated'),
    'pattaya': ('BEOU-68158f8ddadd56d59f', 'SC-C0355', 'GF | G035'),
    'phuket': ('BEOU-5d35f54621505faba7', 'SC-009298', 'Floresta | 2F | 204/1'),
    'megabangna': ('BEOU-be7b48d3fede53f7b3', 'SC-012204', '1F | 1505'),
    'iconsiam': ('BEOU-31d0760e73215132bf', 'SC-000229', '2F | 220'),
    'one-bangkok': ('BEOU-b697dace44a15e91a3', 'VN-88dbfd6362e923', 'Parade | 1F | 1127-1128'),
    'siam-center': ('BEOU-2542141d0b545495ad', 'SC-001242', 'GF | Shop G18'),
    'asok': ('BEOU-6964bb501f8c5c4ca3', 'SC-001783', '3F | 3421'),
    'rama3': ('BEOU-1498108a1b8a52f2b4', 'SC-C0450', 'GF | KIG019-22'),
}
ROUND3_FOOD_RESOLUTIONS = {
    'exact_selected_authoritative_host_UUID_crosswalk',
    'exact_ordinal_or_spacing_alias',
    'explicit_Thai_direction_text_floor_matches_directory_level',
}
ROUND3_FOOD_POINT_ROLES = {
    'store_source_point',
    'publisher_branch_bound_marker_accuracy_unverified_inside_building_not_inferred',
    'official_branch_locator_point_client_explicit_axis_mapping_unsurveyed',
    'first_party_linked_named_branch_map_pin_accuracy_not_surveyed',
    'operator_locator_point_accuracy_unverified',
    'source_published_locator_lat_lng_accuracy_unknown',
    'official_KFC_native_UUID_bound_branch_marker_TH_context_only_accuracy_unverified',
}
OWNER_CHAGEE = {
    'assertionId': 'R2CHOWN-4d0805b573f54a670a8f58c1',
    'assertedOn': '2026-11-07', 'brandId': 'R5BR-th-chagee',
    'outletId': 'OWN30OUT-6a8edb5de93f1ea1001e88a5', 'venueId': 'SC-001304',
    'selectedCoordinates': [13.7347454, 100.5283859],
    'googleFeatureId': '0x30e2990077016199:0xea045b1f731da8ff',
    'identitySourceUrl': 'https://maps.app.goo.gl/72DCxHYuHfWGeVHj8',
}
REVIEWED_DATASETS = {'research.TH.' + key for key in (
    'apparel', 'bank', 'beauty', 'beauty_clinic', 'camera', 'fitness', 'furniture',
    'gold', 'grocery', 'hobby', 'luxury', 'massage_spa', 'optical', 'pet',
    'pharmacy', 'playground', 'sport')}
BOUNDED_SERVICE_DATASETS = {'research.TH.nail', 'research.TH.salon_barber', 'research.TH.hospital', 'research.TH.school'}
FOOD_BASIS = 'official_brand_or_host_directory_explicit_branch_venue_label_unique_canonical_alias_no_far_point_conflict'
MISC_BASIS = 'official_consumer_directory_recognized_banner_exact_reviewed_host_format_unresolved_no_industry_pos_upgrade'
DIRECTORY_DOMAINS = {
    'truedigitalpark.com', 'iconsiam.com', 'themalllifestore.com',
    'onebangkok.com', 'mega-bangna.com', 'futurepark.co.th',
    'centralpattana.co.th',
    'siamcenter.co.th', 'emporium.co.th', 'emquartier.co.th', 'emsphere.co.th',
}
BRAND_LOCATORS = {'getfresh.co.th'}
RETAINED_PRIMARY_DOMAINS = {'starbucks.com', 'snpfood.com', 'cafe-amazon.com',
    'blackcanyon.co.th', 'samitivejhospitals.com', 'siphhospital.com',
    'bangkokhospital.com', 'fuji.co.th', 'bumrungrad.com', 'greyhoundcafe.co.th',
    'cocothailand.com', 'nadimos.com', 'mudandhound.co.th', 'yayoirestaurants.com', 'ootoya.com'}
PRIVATE = re.compile(r'(?:docs|drive)\.google\.com|googleusercontent\.com|/Users/|/private/|(?:target_)?spreadsheet_id', re.I)

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

builder = module('venue_network_builder', 'build-tenant-data.py')
linker = module('venue_network_research', 'link-research-tenants.py')

def sha256(raw):
    return hashlib.sha256(raw).hexdigest()

def public_source(url, domains):
    if not builder.public_url(url):
        return False
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password:
        return False
    domain = (parsed.hostname or '').lower().removeprefix('www.')
    return any(domain == d or domain.endswith('.' + d) for d in domains)

def round3_food_source(row):
    """Bind the reviewed publisher key to its actual consumer-directory surface.

    These are source-specific controls for the reviewed identity-resolution
    intake, not additional permissions for the general directory allowlist.
    """
    parsed = urlparse(row.get('sourceUrl') or '')
    host, path = (parsed.hostname or '').lower(), parsed.path.rstrip('/')
    source = str(row.get('sourceBranchId') or '')
    venue = row.get('venueIds', [None])[0]
    match = re.fullmatch(r'cpn-mappedin:([A-Z0-9]+):el_[a-f0-9]+', source)
    if match:
        return host == 'map.centralpattana.co.th' and path == '/mall/' + match[1]
    match = re.fullmatch(r'megabangna:store:(\d+)', source)
    if match:
        return (host == 'www.mega-bangna.com' and venue == 'SC-012204'
                and re.fullmatch(r'/en/store/[^/]+/' + match[1], path) is not None)
    if re.fullmatch(r'em-directory:SC-000289:[a-f0-9]+:floor-[a-z0-9-]+:\d+', source):
        return (host == 'emsphere.co.th' and venue == 'SC-000289'
                and re.fullmatch(r'/dining/[^/]+/\d+', path) is not None)
    if re.fullmatch(r'siampiwat:consumer-directory:venue-3:occupant-\d+:unit-\d+', source):
        return host == 'www.siamcenter.co.th' and venue == 'SC-001242' and path == '/en/directory'
    return False

def round3_food_gate(row):
    if (row['dataset'] != FOOD or row.get('sourceAuthority') != 'official_venue_consumer_directory'
            or row.get('nativeFoodReadbackVerified') is not True
            or row.get('staticScreenVerified') is not True
            or row.get('identityResolutionVerified') is not True
            or row.get('nativeIdentityHold') is not False
            or row.get('sourceUnitConflict') is not False
            or row.get('sourceFloorConflict') is not False
            or row.get('rawPointConflict') is not False
            or row.get('directoryRoutingPointSelected') is not False
            or row.get('sourceListingRole') != 'official_consumer_food_location'
            or row.get('storeFormat') != 'source_listed_restaurant_or_cafe'):
        return 'round3_food_scope_identity_unit_or_point_hold'
    methods = row.get('identityResolutionMethods')
    proof = row.get('identityResolutionEvidence') or {}
    canonical = row.get('canonicalOutletIds')
    if (not isinstance(methods, list) or not methods
            or any(not isinstance(m, str) or m not in ROUND3_FOOD_RESOLUTIONS for m in methods)
            or not isinstance(proof, dict)
            or not isinstance(canonical, list) or len(canonical) != 1
            or not isinstance(canonical[0], str) or not canonical[0]
            or not re.fullmatch(r'R3KFOBS-[a-f0-9]{24}', str(row['sourceRowKey']))
            or proof.get('sourceObservationId') != row['sourceRowKey']
            or proof.get('publisherObservationId') != row['sourceBranchId']
            or proof.get('canonicalOutletIds') != row['canonicalOutletIds']
            or proof.get('venueIds') != row['venueIds']
            or proof.get('methods') != methods
            or proof.get('nativeReadbackVerified') is not True
            or proof.get('masterFloorUnitPreserved') is not True):
        return 'round3_food_resolution_proof_mismatch'
    if ('exact_selected_authoritative_host_UUID_crosswalk' in methods
            and (proof.get('selectedHostIdentityStatus') != 'current_source_uuid_and_external_id_verified'
                 or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',
                                     str(proof.get('selectedHostUuid') or '')))):
        return 'round3_food_selected_host_crosswalk_required'
    if not round3_food_source(row):
        return 'round3_food_publisher_surface_mismatch'
    point = row.get('selectedCoordinates')
    if (not isinstance(point, list) or len(point) != 2
            or (point != [None, None] and
                (any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point)
                 or row.get('nativeSelectedPointRole') not in ROUND3_FOOD_POINT_ROLES))):
        return 'round3_food_selected_point_role_hold'
    return None

def round3_beauty_gate(row):
    """The reviewed LUSH intake; host FKs alone never approve another brand."""
    branch = row.get('sourceBranchId')
    if not isinstance(branch, str):
        return 'round3_beauty_reviewed_branch_host_or_unit_mismatch'
    approved = REVIEWED_LUSH.get(branch)
    if (row['dataset'] != 'research.TH.beauty' or row.get('brandId') != 'BEB-03e78e0ed96758f598'
            or row.get('sourceAuthority') != 'official_brand_consumer_locator'
            or row.get('sourceListingRole') != 'official_consumer_beauty_location'
            or row.get('nativeBeautyReadbackVerified') is not True
            or row.get('nativeUnitEvidenceVerified') is not True
            or row.get('nativeScopeApproved') is not True
            or row.get('nativeIdentityHold') is not False
            or row.get('sourceUnitConflict') is not False
            or row.get('rawPointConflict') is not False
            or row.get('nativeScopeStatus') != 'approved_core'
            or row.get('nativeStoreFormat') != 'mall_shop' or row.get('storeFormat') != 'mall_shop'
            or row.get('physicalShopfrontVerified') is not False
            or row.get('selectedCoordinates') != [None, None]):
        return 'round3_beauty_scope_unit_format_or_point_hold'
    if (not approved or row.get('sourceNativeBranchId') != branch
            or row.get('nativeCaptureReceiptId') != row['sourceRowKey']
            or not re.fullmatch(r'BESRCP-R3-[a-f0-9]{18}', str(row['sourceRowKey']))
            or row.get('sourceRecordRole') != 'fresh_primary_HTTP_capture_receipt_with_reviewed_existing_canonical_branch'
            or not re.fullmatch(r'BEO-[a-f0-9]+', str(row.get('originalNativeObservationId') or ''))
            or row.get('originalNativeObservationId') not in (row.get('existingSourceIds') or [])
            or row['canonicalOutletIds'] != [approved[0]] or row['venueIds'] != [approved[1]]
            or row.get('unitFloor') != approved[2]
            or row.get('sourceUrl') != 'https://th.lush.com/en/stores/' + branch):
        return 'round3_beauty_reviewed_branch_host_or_unit_mismatch'
    return None

def round3_misc_gate(row):
    """Consumer membership qualification is separate from native scope/POS approval."""
    if (row['dataset'] != MISC or row.get('nativeMiscReadbackVerified') is not True
            or row.get('nativePublicQualificationReadbackVerified') is not True
            or row.get('nativeIdentityHold') is not False or row.get('sourceUnitConflict') is not False
            or row.get('rawPointConflict') is not False or row.get('selectedCoordinates') != [None, None]
            or row.get('sourceListingRole') != 'consumer_visible_store_or_service'
            or row.get('sourceCountry') != 'TH'
            or row.get('scopeStatus') not in {'existing_brand_new_scope_membership', 'miscellaneous_current_registry_gap'}
            or row.get('brandIdentityRole') != 'retail_banner_or_service_provider'
            or row.get('nativeFormatScopeApproval') is not False
            or row.get('nativeScopeApprovalChanged') is not False
            or row.get('physicalShopfrontVerified') is not False
            or row.get('physicalUnitMerge') is not False or row.get('unitContinuityAsserted') is not False
            or row.get('currentPOSDelta') != 0):
        return 'round3_misc_scope_identity_format_unit_or_point_hold'
    return None

def round3_425_gate(row):
    reason = round3_misc_gate(row)
    if reason:
        return reason
    source = re.fullmatch(r'DOM-card-(\d+)', str(row.get('sourceNativeBranchId') or ''))
    ordinal = int(source[1]) if source else 0
    index = ordinal if ordinal <= 12 else ordinal - 12
    approved = REVIEWED_425.get(index)
    floorplan = row.get('linkedFloorplanEvidence') or {}
    if (row.get('brandId') != 'BR-MISC-67ac042caff040f11d0f'
            or row.get('sourceAuthority') != 'official_brand_consumer_locator'
            or row.get('sourceUrl') != 'https://www.425degree.com/our-stores'
            or row.get('sourceSha256') != '5ebcc4d3958803d054cee6c729a1fae878bf4b84359623c6b11cfdb970115af6'
            or ordinal not in range(1, 25) or not approved
            or row['sourceBranchId'] != '425:th-our-stores:5ebcc4d3958803d0:' + str(ordinal)
            or row['canonicalOutletIds'] != [approved[0]] or row['venueIds'] != [approved[1]]
            or row.get('storeFormat') != '425_Degree_official_individually_named_consumer_store_with_owner_floorplan'
            or row.get('category') != 'electronics_mobile_accessories'
            or row.get('nativeStoreFormat') != 'official_named_consumer_store_floorplan_identity_unit_continuity_not_verified'
            or not isinstance(floorplan, dict)
            or floorplan.get('sourceUrl') != approved[2] or floorplan.get('sourceSha256') != approved[3]
            or floorplan.get('sourceObservationId') != '425:th-floorplan:' + approved[3][:16] + ':' + str(index)
            or floorplan.get('sourceRole') != 'named_consumer_shop_floorplan_identity_not_georeferenced_point'
            or not floorplan.get('sourceHashScope') or not builder.iso_date(floorplan.get('checkedOn'))
            or floorplan.get('nativeReadbackVerified') is not True):
        return 'round3_425_reviewed_view_branch_host_or_floorplan_mismatch'
    return None

def round3_national_source(row):
    """Only the reviewed consumer publication and typed retailer cards qualify."""
    url, key, bid = row.get('sourceUrl'), str(row.get('sourceNativeBranchId') or ''), row.get('brandId')
    proof = row.get('consumerPublicationBinding') or {}
    if not isinstance(proof, dict) or proof.get('nativeReadbackVerified') is not True:
        return False
    if bid == 'HOB-BR-P-f41b42c13069':
        return (url == 'https://consumer.huawei.com/th/offer/o2o/storelist/'
                and row.get('sourceSha256') == 'dc59b3d193d8de3c267d88c89358b12787bc9121a003acfefb1d730a93dc428f'
                and re.fullmatch(r'[A-Z0-9]+', key) is not None
                and row['sourceBranchId'] == 'huawei:th-storelist:' + key
                and proof.get('kind') == 'direct_first_party_consumer_HTML'
                and proof.get('parentConsumerUrl') == url)
    if bid in {'BR-MISC-af7ce357d04848826916', 'BR-MISC-e57ccf886b08ab2b7b87'}:
        return (re.fullmatch(r'No-\d+', key) is not None
                and row['sourceBranchId'] == 'true:shoplocations:version-14092026:' + key
                and url == TRUE_CONSUMER_PUBLICATION[2][0] and row['sourceSha256'] == TRUE_CONSUMER_PUBLICATION[2][1]
                and proof.get('kind') == 'live_consumer_HTML_to_pinned_HTML_to_pinned_JSON'
                and proof.get('parentConsumerUrl') == TRUE_CONSUMER_PUBLICATION[0][0]
                and proof.get('parentConsumerSha256') == TRUE_CONSUMER_PUBLICATION[0][1]
                and proof.get('intermediateUrl') == TRUE_CONSUMER_PUBLICATION[1][0]
                and proof.get('intermediateSha256') == TRUE_CONSUMER_PUBLICATION[1][1]
                and proof.get('exactSourceUrl') == url and proof.get('exactSourceSha256') == row['sourceSha256']
                and row.get('sourcePeriod') == 'locator_file_version14092026_not_operating_date')
    if bid in {'HOB-BR-P-92b2dcf82cbe', 'BR-MISC-c4bb2514874b3979fffd'}:
        return (key.isdigit() and row['sourceBranchId'] == 'ais-main-consumer:TH:LocationInfoProfile:location-' + key
                and url in AIS_CONSUMER_REQUESTS and row['sourceSha256'] == AIS_CONSUMER_REQUESTS[url]
                and proof.get('kind') == 'live_official_consumer_HTML_to_regional_API'
                and proof.get('bindingId') == AIS_CONSUMER_PUBLICATION[0]
                and proof.get('parentConsumerUrl') == AIS_CONSUMER_PUBLICATION[1]
                and proof.get('parentConsumerSha256') == AIS_CONSUMER_PUBLICATION[2]
                and proof.get('exactSourceUrl') == url and proof.get('exactSourceSha256') == row['sourceSha256'])
    return False

def round3_national_gate(row):
    reason = round3_misc_gate(row)
    if reason:
        return reason
    if (row['sourceBranchId'] in NATIONAL_INTAKE_HELD_SOURCES
            or row.get('sourceAuthority') != 'official_brand_consumer_locator'
            or row.get('storeFormat') != NATIONAL_CONSUMER_FORMATS.get(row.get('brandId'))
            or row.get('category') != 'mobile_telecom_consumer_store_or_service'
            or row.get('nativeStoreFormat') != row.get('storeFormat')
            or row.get('sourceRawMarkerReadbackVerified') is not True
            or not round3_national_source(row)):
        return 'round3_national_consumer_source_format_or_review_hold'
    additional = row.get('reviewedSupportingDirectoryEvidence') or []
    expected = NATIONAL_DIRECTORY_CORROBORATIONS.get(row['sourceBranchId'])
    if expected:
        if (not isinstance(additional, list) or len(additional) != 1 or not isinstance(additional[0], dict)
                or tuple(additional[0].get(k) for k in ['sourceObservationId', 'sourceUrl', 'sourceSha256']) != expected
                or not additional[0].get('sourceHashScope')
                or additional[0].get('sourceRole') != 'current_venue_directory_exact_existing_branch_corroboration'
                or not builder.iso_date(additional[0].get('checkedOn'))):
            return 'round3_national_supporting_directory_identity_mismatch'
    elif additional:
        return 'round3_national_unreviewed_supporting_directory'
    marker = row.get('rawPublisherMarker')
    if marker == [None, None]:
        if row.get('rawMarkerBinding') != 'publisher_marker_not_supplied':
            return 'round3_national_raw_marker_role_hold'
    elif (not isinstance(marker, list) or len(marker) != 2
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in marker)
            or not (-90 <= marker[0] <= 90 and -180 <= marker[1] <= 180)
            or row.get('rawMarkerBinding') != 'publisher_branch_bound_locator_or_directions_marker'):
        return 'round3_national_raw_marker_role_hold'
    return None

def gate(row, as_of):
    """Fail closed on the evidence role; native acceptance alone is insufficient."""
    if (row.get('accepted') is not True or row.get('primary') is not False
            or row.get('scopeApproved') is not True or row.get('canonicalIdentityAccepted') is not True):
        return 'not_reviewed_accepted_source_identity'
    kind = row.get('projectionKind', 'base')
    if kind not in {'base', 'original31_food', 'original31_hobby', 'selected_host_directory', 'bounded_service_directory',
                    'round2_known_food_directory', 'round2_chagee_official_locator', 'round2_chagee_owner_assertion',
                    'round2_misc_directory'} | ROUND3_KINDS:
        return 'unsupported_projection_kind'
    if row.get('projectionRound', 1) not in {1, 2, 3}:
        return 'unsupported_projection_round'
    if row.get('projectionRound') == 2 and (kind == 'base' or not str(row.get('sourceArtifactKey', '')).startswith(ROUND2_MARKER)):
        return 'round2_specific_source_gate_required'
    if ((row.get('projectionRound') == 3 or kind in ROUND3_KINDS)
            and (row.get('projectionRound') != 3 or kind not in ROUND3_KINDS
                 or not str(row.get('sourceArtifactKey', '')).startswith(ROUND3_MARKER))):
        return 'round3_specific_source_gate_required'
    if row.get('projectionRound') == 3 and any(
            re.search(r'api[_-]?key|(?:access|refresh|id)?[_-]?token|authorization|password|secret', key, re.I)
            for key, _ in parse_qsl(urlparse(row.get('sourceUrl') or '').query)):
        return 'round3_private_source_parameters'
    if row.get('dataset') not in {FOOD, MISC} | REVIEWED_DATASETS | BOUNDED_SERVICE_DATASETS:
        return 'dataset_out_of_scope'
    if kind == 'base' and row.get('dataset') not in {FOOD, MISC}:
        return 'dataset_requires_specific_projection_gate'
    if row.get('hostIdentityStatus') not in {'source_qualified_named_host_identity',
                                            'source_qualified_official_directory_host_identity'}:
        return 'host_identity_not_selected'
    ids = row.get('venueIds')
    if not isinstance(ids, list) or len(ids) != 1 or not ids[0]:
        return 'single_exact_host_required'
    is_owner = kind == 'round2_chagee_owner_assertion'
    if row.get('status') != ('owner_reported_open' if is_owner else 'publisher_listed_not_field_verified') or row.get('visibilityHold') or row.get('eventType'):
        return 'not_current_consumer_listing'
    checked = builder.iso_date(row.get('checkedOn'))
    if not checked or not builder.iso_date(as_of) or checked > builder.iso_date(as_of):
        return 'invalid_source_check_date'
    if ((not row.get('brandId') and not (kind == 'bounded_service_directory' and row.get('sourceConceptId')))
            or not row.get('brand') or not row.get('sourceRowKey')
            or not row.get('sourceBranchId') or not row.get('canonicalOutletIds')
            or not row.get('sourceHashScope')
            or not re.fullmatch('[a-f0-9]{64}', str(row.get('sourceSha256') or ''))):
        return 'missing_source_or_canonical_identity'
    authority, url = row.get('sourceAuthority'), row.get('sourceUrl')
    if is_owner:
        proof = row.get('ownerEvidence') or {}
        if (authority != 'owner_direct_assertion' or row['dataset'] != FOOD
                or row.get('projectionRound') != 2 or row.get('nativeOwnerReadbackVerified') is not True
                or row.get('sourceListingRole') != 'owner_confirmed_current_open_existing_branch'
                or proof.get('sourceKind') != 'explicit_authorized_owner_conversation'
                or proof.get('nativeReadbackVerified') is not True
                or proof.get('status') != 'open' or proof.get('fieldVerified') is not False
                or proof.get('publicChatUrl') is not None
                or row.get('officialBrandNativeBranchId') is not None):
            return 'owner_current_open_proof_required'
        for key in ['assertionId', 'assertedOn', 'brandId', 'outletId', 'venueId', 'selectedCoordinates', 'googleFeatureId']:
            if proof.get(key) != OWNER_CHAGEE[key]:
                return 'owner_assertion_identity_host_or_point_mismatch'
        if (row['sourceRowKey'] != proof['assertionId'] or row['checkedOn'] != proof['assertedOn']
                or row['brandId'] != proof['brandId'] or row['canonicalOutletIds'] != [proof['outletId']]
                or ids != [proof['venueId']] or row.get('selectedCoordinates') != proof['selectedCoordinates']
                or row['sourceBranchId'] != proof['googleFeatureId']
                or row['sourceUrl'] != OWNER_CHAGEE['identitySourceUrl']
                or row.get('identitySourceObservationId') != 'R2CHOBS-668e715e1135e2aaaf2312ca'):
            return 'owner_assertion_identity_host_or_point_mismatch'
        return None
    if authority == 'official_venue_consumer_directory':
        if not public_source(url, DIRECTORY_DOMAINS):
            return 'not_allowed_official_directory_url'
    elif authority == 'official_brand_consumer_locator' and kind == 'round3_misc_national_consumer_locator':
        if not builder.public_url(url) or not round3_national_source(row):
            return 'not_allowed_bound_consumer_publication'
    elif authority == 'official_brand_consumer_locator' and kind in {'round3_beauty_official_locator', 'round3_misc_425_consumer_locator'}:
        domains = {'th.lush.com'} if kind == 'round3_beauty_official_locator' else {'425degree.com'}
        if not public_source(url, domains):
            return 'not_allowed_reviewed_brand_locator'
    elif authority == 'official_brand_consumer_locator' and row.get('dataset') in {FOOD, 'research.TH.hobby'}:
        domains = {'elephantparade.com'} if kind == 'original31_hobby' else {'global.chagee.com'} if kind == 'round2_chagee_official_locator' else BRAND_LOCATORS
        if not public_source(url, domains):
            return 'not_allowed_brand_consumer_locator'
    elif authority == 'retained_primary_brand_or_host_master' and kind == 'original31_food':
        if not public_source(url, RETAINED_PRIMARY_DOMAINS):
            return 'not_allowed_retained_primary_source'
    else:
        return 'nonconsumer_or_partner_employer_source'
    if kind == 'round3_known_food_directory':
        return round3_food_gate(row)
    if kind == 'round3_beauty_official_locator':
        return round3_beauty_gate(row)
    if kind == 'round3_misc_425_consumer_locator':
        return round3_425_gate(row)
    if kind == 'round3_misc_national_consumer_locator':
        return round3_national_gate(row)
    if kind == 'round2_known_food_directory':
        if (row['dataset'] != FOOD or authority != 'official_venue_consumer_directory'
                or row.get('projectionRound') != 2 or row.get('nativeFoodReadbackVerified') is not True
                or row.get('staticScreenVerified') is not True or row.get('nativeIdentityHold') is not False
                or row.get('sourceUnitConflict')
                or row.get('sourceListingRole') != 'official_consumer_food_location'):
            return 'round2_food_native_identity_or_unit_hold'
    elif kind == 'round2_chagee_official_locator':
        if (row['dataset'] != FOOD or row.get('nativeFoodReadbackVerified') is not True
                or authority != 'official_brand_consumer_locator'
                or row.get('sourceListingRole') != 'official_consumer_food_location'
                or row['brandId'] != 'R5BR-th-chagee'
                or row['canonicalOutletIds'] != ['PL26OBS-0d571c37329d3062e0522b2b']
                or ids != ['SC-001237']
                or row.get('officialBrandNativeBranchId') != '9a0e22fd-7596-40f5-8a92-bd5899ab910e'
                or row['sourceBranchId'] != row.get('officialBrandNativeBranchId')
                or row.get('selectedCoordinates') != [13.732716, 100.530465]
                or row['sourceUrl'] != 'https://global.chagee.com/th/en/stores'):
            return 'chagee_official_branch_identity_or_point_mismatch'
    elif kind == 'round2_misc_directory':
        if (row['dataset'] != MISC or authority != 'official_venue_consumer_directory'
                or row.get('nativeMiscReadbackVerified') is not True or row.get('nativeIdentityHold') is not False
                or row.get('brandIdentityRole') != 'retail_banner_or_service_provider'
                or row.get('scopeStatus') not in {'existing_brand_new_scope_membership', 'miscellaneous_current_registry_gap'}
                or row.get('sourceListingRole') not in {'format_unresolved', 'official_consumer_shop_directory_membership', 'consumer_visible_store_or_service'}
                or row.get('storeFormat') != 'source_listed_consumer_location_format_unresolved'
                or row.get('selectedCoordinates') != [None, None]):
            return 'round2_misc_native_scope_identity_or_point_hold'
    elif kind == 'bounded_service_directory':
        if (row['dataset'] not in BOUNDED_SERVICE_DATASETS or authority != 'official_venue_consumer_directory'
                or not public_source(url, DIRECTORY_DOMAINS)
                or row.get('nativeServiceReadbackVerified') is not True
                or row.get('nativeIdentityHold') is not False
                or (row.get('projectionRound') == 2 and row.get('nativeScopeApproved') is not True)
                or row.get('sourceUnitConflict')
                or row.get('sourceListingRole') != 'bounded_consumer_service_observation'
                or row.get('selectedCoordinates') != [None, None]
                or row.get('sourceRecordTab') not in {'02_STORES', '16_DENTAL_VENUES', '31_LEARNING_BRANCH_EVIDENCE'}):
            return 'service_scope_or_identity_hold'
    elif kind == 'selected_host_directory':
        if (row['dataset'] not in REVIEWED_DATASETS or authority != 'official_venue_consumer_directory'
                or row.get('staticScreenVerified') is not True or row.get('nativeIdentityHold') is not False
                or row.get('sourceListingRole') != 'reviewed_current_directory_registry_membership'):
            return 'industry_directory_static_or_identity_hold'
    elif kind == 'original31_hobby':
        if (row['dataset'] != 'research.TH.hobby' or row.get('nativeIdentityHold') is not False
                or row.get('sourceListingRole') != 'reviewed_named_hotel_retail_branch'
                or row.get('selectedCoordinates') != [None, None]):
            return 'hobby_identity_or_rejected_point'
    elif row['dataset'] == FOOD:
        if row.get('sourceListingRole') != 'official_consumer_food_location':
            return 'food_listing_role_not_qualified'
    elif row['dataset'] == MISC:
        if (row.get('brandIdentityRole') != 'retail_banner_or_service_provider'
                or row.get('scopeStatus') not in {'existing_brand_new_scope_membership', 'miscellaneous_current_registry_gap'}):
            return 'misc_brand_scope_review'
        if row.get('sourceListingRole') not in {'format_unresolved', 'official_consumer_shop_directory_membership',
                                                'consumer_visible_store_or_service'}:
            return 'misc_non_branch_or_counter_product_presence'
        if row.get('storeFormat') != 'source_listed_consumer_location_format_unresolved':
            return 'misc_format_or_industry_pos_upgrade'
    else:
        return 'unsupported_projection_kind'
    return None

def food_item(rows, venue):
    row = rows[0]
    canonical = sorted({oid for r in rows for oid in r['canonicalOutletIds']})
    native = sorted({r['sourceRowKey'] for r in rows})
    rowkey = canonical[0] if len(canonical) == 1 else 'directory-' + sha256('|'.join(native).encode())[:20]
    branch = venue.get('name') or venue['id']
    item = {
        'id': f'{row["dataset"]}:{row.get("sourceRecordTab", "02_STORES")}:{rowkey}',
        'name': f'{row["brand"]} · {branch}', 'brand': row['brand'], 'brandId': row['brandId'],
        'dataset': row['dataset'], 'branch': branch, 'sourceStoreName': row['sourceStoreName'],
        'checkedOn': row['checkedOn'], 'status': row['status'], 'category': row['category'],
        'storeFormat': row['storeFormat'], 'unitFloor': row.get('unitFloor') or '',
        'evidenceStatus': row['evidenceStatus'],
        'sourceRole': SERVICE_ROLE if row.get('projectionKind') == 'bounded_service_directory' else
                      DIRECTORY_ROLE if row.get('projectionKind') == 'selected_host_directory' else
                      BRAND_ROLE if row.get('projectionKind') in {'round3_beauty_official_locator', 'round3_misc_425_consumer_locator', 'round3_misc_national_consumer_locator'} else
                      HOBBY_ROLE if row.get('projectionKind') == 'original31_hobby' else
                      FOOD_ROLE if row['dataset'] == FOOD else MISC_ROLE,
        'relationshipBasis': 'official_consumer_brand_locator_reviewed_branch_host_and_unit_no_field_operation_upgrade'
                             if row.get('projectionKind') == 'round3_beauty_official_locator' else
                             'official_consumer_brand_locator_reviewed_branch_host_and_format_no_POS_or_field_operation_upgrade'
                             if row.get('projectionKind') in {'round3_misc_425_consumer_locator', 'round3_misc_national_consumer_locator'} else
                             FOOD_BASIS if row['dataset'] == FOOD else MISC_BASIS if row['dataset'] == MISC else
                             'reviewed_exact_named_host_current_publisher_listing_original_registry_qualifications_retained',
        'sourceUrl': row['sourceUrl'], 'sourceUrls': sorted({r['sourceUrl'] for r in rows}),
        'sourceSha256': row['sourceSha256'], 'sourceArtifactKey': row['sourceArtifactKey'],
        'sourceHashScope': row['sourceHashScope'],
        'sourceRowKey': rowkey, 'sourceBranchId': row['sourceBranchId'],
        'sourceGate': 'reviewed_official_consumer_source_exact_host_and_retained_canonical_identity',
        'hostIdentityStatus': row['hostIdentityStatus'], 'sourceAuthority': row['sourceAuthority'],
        'sourceObservationIds': native, 'sourceObservationCount': len(native),
        'matchedSourceStoreIds': canonical,
        'physicalDistinctness': 'source_listing_observation_not_independently_verified_storefront',
        'reconciledOn': row.get('reconciledOn', row['checkedOn']),
        'identityNote': 'Exact official named host; source listing, operation not field verified. '
                        'Supporting research identities retained; no outlet merge or selected-point inference. '
                        'Source hash scope: ' + row['sourceHashScope'] + '.'
    }
    item['sourceEvidence'] = [{'sourceObservationId': r['sourceRowKey'], 'sourceUrl': r['sourceUrl'],
                              'checkedOn': r['checkedOn'], 'sourceSha256': r['sourceSha256'],
                              'sourceHashScope': r['sourceHashScope']} for r in rows]
    if row.get('projectionRound') == 3:
        for evidence, source in zip(item['sourceEvidence'], rows):
            evidence['sourceAuthority'] = source['sourceAuthority']
        support = [r['linkedFloorplanEvidence'] for r in rows if r.get('linkedFloorplanEvidence')]
        support.extend(e for r in rows for e in r.get('reviewedSupportingDirectoryEvidence') or [])
        if support:
            item['supportingSourceEvidence'] = list({e['sourceObservationId']: {
                k: e[k] for k in ['sourceObservationId', 'sourceUrl', 'sourceSha256', 'sourceHashScope', 'sourceRole', 'checkedOn']
            } for e in support}.values())
    if row.get('nativeQualificationNote'):
        item['identityNote'] += ' Original research qualification: ' + row['nativeQualificationNote']
    if row.get('projectionKind') == 'bounded_service_directory':
        item['sourceRecordTab'] = row['sourceRecordTab']
        item['brandIdentityRole'] = 'native_brand' if row.get('brandId') else 'publisher_named_service_concept_not_canonical_brand_master'
        if row.get('sourceConceptId'):
            item['sourceConceptId'] = row['sourceConceptId']
    if row.get('projectionKind') == 'round3_misc_425_consumer_locator':
        item['identityNote'] += ' Publisher names an individual consumer store with a linked publisher floorplan. '
        item['identityNote'] += 'No physical-unit continuity, shopfront, operator, native scope-approval or Camera/Hobby POS upgrade.'
    elif row.get('projectionKind') == 'round3_misc_national_consumer_locator':
        item['identityNote'] += ' Consumer publisher format: ' + row['storeFormat'] + '. '
        item['identityNote'] += 'Brand/dealer publisher roles remain separate from legal operator; no native scope-approval or industry POS upgrade.'
    elif row['dataset'] == MISC:
        item['identityNote'] += ' Recognized consumer banner; shop/counter format unresolved; no Camera/Hobby POS upgrade.'
    if row.get('projectionRound') in {2, 3}:
        item['projectionRound'] = row['projectionRound']
    if 'officialBrandNativeBranchId' in row:
        item['officialBrandNativeBranchId'] = row['officialBrandNativeBranchId']
    if row.get('projectionKind') == 'round2_chagee_owner_assertion':
        proof = row['ownerEvidence']
        item.update(sourceRole=builder.OWNER_ROLE, sourceAuthority='owner_direct_assertion',
                    relationshipBasis='owner_confirmed_scoped_identity_membership_or_state',
                    sourceGate='direct_owner_approved_fact_no_web_verification',
                    ownerAssertionId=proof['assertionId'], ownerAssertionDate=proof['assertedOn'],
                    officialBrandNativeBranchId=None,
                    sourceHashRole='retained_Google_identity_and_marker_snapshot_only_not_owner_status_assertion',
                    identityNote='Owner explicitly reported this branch open on ' + proof['assertedOn'] +
                    '. Retained Google feature supports named branch/host/marker identity. '
                    'No independent field verification or official locator UUID, floor/unit, legal-operator or point-accuracy claim.',
                    operationEvidence={'sourceRole': 'owner_direct_assertion', 'assertionId': proof['assertionId'],
                                       'assertedOn': proof['assertedOn'], 'status': 'owner_reported_open',
                                       'fieldVerified': False})
        item['sourceObservationIds'] = [row['identitySourceObservationId'], proof['assertionId']]
        item['sourceObservationCount'] = 2
        item['sourceEvidence'] = [
            {'sourceObservationId': row['identitySourceObservationId'], 'sourceRole': 'owner_supplied_named_Google_identity_marker',
             'sourceUrl': row['sourceUrl'], 'checkedOn': row['checkedOn'],
             'sourceSha256': row['sourceSha256'], 'sourceHashScope': row['sourceHashScope']},
            {'sourceObservationId': proof['assertionId'], 'sourceRole': 'owner_direct_assertion',
             'checkedOn': proof['assertedOn'], 'sourceHashScope': 'dated_owner_assertion_no_upstream_HTTP_body_or_public_chat_URL'}]
    return item

def own_record(item):
    return str(item.get('sourceArtifactKey') or '').startswith(MARKER)

def remove_own(items):
    result = []
    for value in items:
        if own_record(value):
            continue
        item = copy.deepcopy(value)
        if 'corroboratingMembershipEvidence' in item:
            evidence = [x for x in item['corroboratingMembershipEvidence'] if not own_record(x)]
            if evidence: item['corroboratingMembershipEvidence'] = evidence
            else: item.pop('corroboratingMembershipEvidence')
        result.append(item)
    return result

def current_ids(item):
    ids = {item['id'].rsplit(':', 1)[-1], *item.get('sourceObservationIds', []),
           *item.get('matchedSourceStoreIds', [])}
    if (own_record(item) and item.get('sourceAuthority') == 'official_venue_consumer_directory') or str(item.get('sourceBranchId') or '').startswith(('truedigitalpark:', 'iconsiam-', 'themall-', 'onebangkok:', 'mega-', 'futurepark:', 'centralpattana:')):
        ids.add(item['sourceBranchId'])
    for evidence in item.get('corroboratingMembershipEvidence', []):
        ids.update(current_ids(evidence))
    return ids

def ring_contains(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        ax, ay = a[:2]; bx, by = b[:2]
        cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
        if abs(cross) <= 1e-12 and min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by):
            return True
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside

def contains(point, geometry):
    polygons = [geometry['coordinates']] if geometry.get('type') == 'Polygon' else geometry.get('coordinates', []) if geometry.get('type') == 'MultiPolygon' else []
    return any(rings and ring_contains(point, rings[0]) and not any(ring_contains(point, r) for r in rings[1:]) for rings in polygons)

def point_checker(venues, buildings):
    footprints = collections.defaultdict(list)
    for feature in buildings.get('features', []):
        for vid in feature.get('properties', {}).get('venue_ids') or []:
            footprints[vid].append(feature['geometry'])
    def check(own, vid):
        venue = venues[vid]
        if None in own or venue.get('lat') is None:
            return True, None
        lat, lon = own
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return False, None
        distance = linker.hosts.distance_m(own, (venue['lat'], venue['lon']))
        # Exact footprint containment is deliberately stricter than a buffered-near test.
        return distance <= 300 or any(contains((lon, lat), g) for g in footprints[vid]), round(distance)
    return check

def merge(payload, rosters, venues, point_check, audit=None):
    as_of = payload.get('meta', {}).get('asOf')
    if not builder.iso_date(as_of):
        raise ValueError('meta.asOf must be a full ISO date')
    if (payload['meta'].get('nativeFoodAllWritesVerified') is not True
            or payload['meta'].get('nativeMiscAllWritesVerified') is not True):
        raise ValueError('native data readback receipts are required')
    if (any(r.get('projectionRound') == 2 and r.get('projectionKind') == 'bounded_service_directory'
            for r in payload['observations']) and payload['meta'].get('round2ServiceNativeReadbackVerified') is not True):
        raise ValueError('round2 service native readback receipt is required')
    for kind, flag in [('selected_host_directory', 'selectedHostNativeReadbackVerified'),
                       ('bounded_service_directory', 'boundedServiceNativeReadbackVerified'),
                       ('round2_known_food_directory', 'round2FoodNativeReadbackVerified'),
                       ('round2_chagee_official_locator', 'round2FoodNativeReadbackVerified'),
                       ('round2_chagee_owner_assertion', 'nativeOwnerAssertionReadbackVerified'),
                       ('round2_misc_directory', 'round2MiscNativeReadbackVerified'),
                       ('round3_known_food_directory', 'round3FoodNativeReadbackVerified'),
                       ('round3_beauty_official_locator', 'round3BeautyNativeReadbackVerified'),
                       ('round3_misc_425_consumer_locator', 'round3MiscNativeReadbackVerified'),
                       ('round3_misc_national_consumer_locator', 'round3MiscNativeReadbackVerified'),
                       ('original31_food', 'original31NativeReadbackVerified'),
                       ('original31_hobby', 'original31NativeReadbackVerified')]:
        if any(r.get('projectionKind') == kind for r in payload['observations']) and payload['meta'].get(flag) is not True:
            raise ValueError('specific source master readback receipt is required')
    original = {vid: remove_own(items) for vid, items in rosters.items()}
    result = copy.deepcopy(original)
    omitted, additions, corroborations = collections.Counter(), [], []
    omission_rows = []
    def omit(rows, reason):
        omitted[reason] += len(rows)
        omission_rows.extend({'sourceId': r['sourceRowKey'], 'kind': r.get('projectionKind', 'base'),
                              'projectionRound': r.get('projectionRound', 1),
                              'brand': r['brand'], 'venueId': r['venueIds'][0], 'reason': reason} for r in rows)
    new_corroborations = []
    corroborated_existing_keys, corroborated_new_keys = set(), set()
    grouped = collections.OrderedDict()
    seen = set()
    for row in sorted(payload['observations'], key=lambda r: (r.get('projectionRound', 1), r['dataset'], r['sourceRowKey'])):
        key = (row['dataset'], row['sourceRowKey'])
        if key in seen: raise ValueError('duplicate publisher source observation')
        seen.add(key)
        reason = gate(row, as_of)
        if reason:
            omit([row], reason); continue
        vid = row['venueIds'][0]
        if vid not in venues:
            omit([row], 'host_outside_public_qualified_population'); continue
        if row.get('projectionKind') == 'round3_misc_national_consumer_locator' and row['rawPublisherMarker'] != [None, None]:
            raw_ok, _ = point_check(row['rawPublisherMarker'], vid)
            if not raw_ok:
                omit([row], 'raw_branch_marker_host_conflict'); continue
        ok, _ = point_check(row.get('selectedCoordinates') or [None, None], vid)
        if not ok:
            omit([row], 'far_point_conflict'); continue
        # Several component observations accepted as one native Misc branch stay one branch.
        group = (row.get('projectionRound', 1), row['dataset'], vid, tuple(row['canonicalOutletIds'])) if row['dataset'] == MISC or row.get('projectionKind') else (row.get('projectionRound', 1), row['dataset'], vid, row['sourceRowKey'])
        grouped.setdefault(group, []).append(row)
    taken = set()
    for group, rows in grouped.items():
        vid = rows[0]['venueIds'][0]
        item = food_item(rows, venues[vid])
        ids = {oid for r in rows for oid in [*r.get('existingSourceIds', []), *r['canonicalOutletIds']]}
        ids.update(r['sourceBranchId'] for r in rows if r.get('projectionKind') in {'selected_host_directory', 'bounded_service_directory'})
        # Include this run's already-attached evidence on original branches: a
        # second native row can refer to the same current directory card.
        exact = [x for x in result.get(vid, []) if not own_record(x) and current_ids(x) & ids]
        if len(exact) > 1:
            omit(rows, 'multiple_existing_outlet_identities'); continue
        matches = exact
        if not matches:
            brand = linker.brand_key(item['brand'])
            floor = linker.floor_key(item)
            matches = [x for x in original.get(vid, []) if (vid, x['id']) not in taken
                       and linker.brand_key(x.get('displayBrand') or x.get('brand') or x['name']) == brand
                       and ((not rows[0].get('projectionKind') and (not floor or not linker.floor_key(x)))
                            or (floor and floor == linker.floor_key(x)))]
        if len(matches) > 1:
            omit(rows, 'ambiguous_existing_same_brand_branch'); continue
        if matches:
            target = next(x for x in result[vid] if x['id'] == matches[0]['id'])
            # Preserve original identity, status, logo and original observation counts.
            target.setdefault('corroboratingMembershipEvidence', []).append(item)
            taken.add((vid, target['id']))
            corroborated_existing_keys.add((vid, target['id']))
            corroborations.append((vid, item)); continue
        # Reconcile with additions from this run too, including shared canonical
        # outlets in two industries. Different publisher entries with distinct
        # native outlet IDs remain distinct unless unit evidence proves otherwise.
        new_matches = [x for x in result.get(vid, []) if own_record(x) and current_ids(x) & ids]
        if not new_matches:
            floor = linker.floor_key(item)
            new_matches = [x for x in result.get(vid, []) if own_record(x)
                           and linker.brand_key(x['brand']) == linker.brand_key(item['brand'])
                           and floor and floor == linker.floor_key(x)
                           and urlparse(x['sourceUrl']).hostname != urlparse(item['sourceUrl']).hostname]
        if len(new_matches) > 1:
            omit(rows, 'multiple_new_outlet_identities'); continue
        if new_matches:
            target = new_matches[0]
            target.setdefault('corroboratingMembershipEvidence', []).append(item)
            corroborated_new_keys.add((vid, target['id']))
            new_corroborations.append((vid, item)); continue
        # An unresolved generic same-brand host match does not create a new unit.
        if rows[0].get('projectionKind') and any(
                linker.brand_key(x.get('displayBrand') or x.get('brand') or x['name']) == linker.brand_key(item['brand'])
                and (not linker.floor_key(item) or not linker.floor_key(x)) for x in result.get(vid, [])):
            omit(rows, 'same_brand_host_unit_unresolved'); continue
        result.setdefault(vid, []).append(item)
        additions.append((vid, item))
    for items in result.values(): items.sort(key=lambda x: x['id'])
    # No mutation of an original fact, even when a fresh directory corroborates it.
    for vid, items in original.items():
        assert remove_own(result[vid]) == sorted(items, key=lambda x: x['id'])
    if audit is not None:
        audit['omittedObservations'] = omission_rows
    rounds = {}
    for round_id in sorted({r.get('projectionRound', 1) for r in payload['observations']}):
        select = lambda values: [x for _, x in values if x.get('projectionRound', 1) == round_id]
        new, existing, corroborated_new = select(additions), select(corroborations), select(new_corroborations)
        rounds[str(round_id)] = {
            'inputObservations': sum(r.get('projectionRound', 1) == round_id for r in payload['observations']),
            'newItems': len(new), 'newSourceObservations': sum(x['sourceObservationCount'] for x in new),
            'corroboratingExistingEvidenceGroups': len(existing),
            'corroboratingNewEvidenceGroups': len(corroborated_new),
            'omittedObservations': sum(r['projectionRound'] == round_id for r in omission_rows)}
    return result, {'inputObservations': len(payload['observations']), 'projectionRounds': rounds,
                    'newItems': len(additions), 'newHosts': len({v for v, _ in additions}),
                    'newSourceObservations': sum(x['sourceObservationCount'] for _, x in additions),
                    'corroboratingExistingItems': len(corroborated_existing_keys),
                    'corroboratingExistingEvidenceGroups': len(corroborations),
                    'corroboratingSourceObservations': sum(x['sourceObservationCount'] for _, x in corroborations),
                    'corroboratingNewItems': len(corroborated_new_keys),
                    'corroboratingNewEvidenceGroups': len(new_corroborations),
                    'corroboratingNewSourceObservations': sum(x['sourceObservationCount'] for _, x in new_corroborations),
                    'newItemsByDataset': dict(sorted(collections.Counter(x['dataset'] for _, x in additions).items())),
                    'omitted': dict(sorted(omitted.items()))}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--observations', required=True)
    args = parser.parse_args()
    path = Path(args.observations).resolve()
    if ROOT == path or ROOT in path.parents:
        raise SystemExit('Research interchange must stay outside the public repository')
    raw = path.read_bytes(); payload = json.loads(raw)
    core_path = ROOT / 'data/venues.json'; core_before = core_path.read_bytes()
    venue_doc = json.loads(core_before)
    venues = {r['id']: r for r in venue_doc['rows']}
    buildings = json.loads((ROOT / 'data/venue-buildings.geojson').read_text())
    folder = ROOT / 'data/tenants'
    shards = [json.loads((folder / f'{n:02}.json').read_text()) for n in range(builder.SHARDS)]
    rosters = {vid: r['items'] for s in shards for vid, r in s['venues'].items()}
    result, receipt = merge(payload, rosters, venues, point_checker(venues, buildings))
    manifest = json.loads((ROOT / 'assets/tenant-logos-manifest.json').read_text())
    for vid, items in result.items():
        for item in items:
            if own_record(item):
                logo = builder.verified_logo(manifest.get(f"{item['dataset']}|{item.get('brandId', '')}"), ROOT)
                if logo: item['logo'] = logo
    meta = {**shards[0]['meta'], 'asOf': payload['meta']['asOf']}
    out = [{'meta': meta, 'venues': {}} for _ in range(builder.SHARDS)]
    for vid, items in sorted(result.items()):
        out[builder.shard_of(vid)]['venues'][vid] = {
            'observations': len(items), 'sourceObservationCount': sum(x.get('sourceObservationCount', 1) for x in items), 'items': items}
    report = json.loads((folder / 'build-report.json').read_text())
    items = [x for _, xs in sorted(result.items()) for x in xs]
    report.update({'asOf': meta['asOf'], 'publishedVenueHosts': len(result),
                   'publishedObservations': len(items), 'publishedItems': len(items),
                   'publishedSourceObservations': sum(x.get('sourceObservationCount', 1) for x in items),
                   'datasets': dict(sorted(collections.Counter(x['dataset'] for x in items).items())),
                   'statuses': dict(sorted(collections.Counter(x.get('status', 'unknown') for x in items).items())),
                   'sourceRoles': dict(sorted(collections.Counter(x.get('sourceRole', 'unspecified') for x in items).items())),
                   'withLogo': sum(bool(x.get('logo')) for x in items),
                   'summaryDifferences': [{'venueId': vid, 'summaryObservations': venues[vid].get('storeCount') or 0,
                                           'rosterObservations': len(xs)} for vid, xs in sorted(result.items())
                                          if (venues[vid].get('storeCount') or 0) != len(xs)]})
    receipt.update({'kind': 'reviewed_consumer_directory_and_dated_owner_assertion' if any(r.get('projectionKind') == 'round2_chagee_owner_assertion' for r in payload['observations']) else 'reviewed_official_consumer_directory', 'exportedOn': meta['asOf'],
                    'inputSha256': sha256(raw), 'sourceHashScope': 'Per-record sourceHashScope and sourceEvidence distinguish HTTP bytes, rendered DOM, normalized collector fields and native-row integrity.',
                    'heldInputObservations': len(payload.get('held', [])),
                    'inputAccounting': payload['meta'].get('inputAccounting', {}),
                    'unit': 'One source-listed consumer branch/card; native Misc component views of one canonical branch stay one item.',
                    'pointGate': 'Own selected point within 300 m, or contained in the exact retained host footprint; no nearest venue or point substitution.',
                    'limits': 'Source listings, no field operation/point/legal operator, industry POS or primary graph upgrade. '
                              'Existing facts preserved; exact/unique same-floor corroborations do not add another shop.'})
    report['venueNetwork'] = receipt
    public = [*out, report]
    if PRIVATE.search(json.dumps(public, ensure_ascii=False)):
        raise ValueError('private URL, file identifier key or local path reached public output')
    assert core_path.read_bytes() == core_before
    for n, shard in enumerate(out):
        (folder / f'{n:02}.json').write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':')) + '\n')
    (folder / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(receipt, ensure_ascii=False))

if __name__ == '__main__':
    main()

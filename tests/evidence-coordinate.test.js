// The coordinate line of the evidence panel says where a point comes from and never drops “not field verified”.
import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinateReading} from '../js/evidence.js';

test('an OpenStreetMap-named host building point reads as such', () => {
  assert.equal(coordinateReading('host_building_interior_point_not_entrance', 'osm_named_host_building_point_not_field_verified'),
    'จุดในอาคารที่ OpenStreetMap ตั้งชื่อตามสถานที่ ไม่ใช่ประตูทางเข้า · ยังไม่ตรวจภาคสนาม');
  assert.equal(coordinateReading('host_building_interior_point_not_entrance', 'owner_identified_host_building_point_not_field_verified'),
    'จุดในอาคารของสถานที่ ไม่ใช่ประตูทางเข้า · ยังไม่ตรวจภาคสนาม');
});

test('registry pins and branch points keep their readings', () => {
  assert.equal(coordinateReading('host_registry_reference_point_not_entrance', 'current_citymeter_registry_pin_not_field_verified'),
    'จุดอ้างอิงจากทะเบียน CityMETER ไม่ใช่ประตูทางเข้า · ยังไม่ตรวจภาคสนาม');
  assert.equal(coordinateReading('retailer_branch_reference_point_not_host_entrance_or_footprint', 'official_linked_public_map_point_not_field_verified'),
    'จุดสาขาของร้านหลัก ไม่ใช่ประตูทางเข้า · ยังไม่ตรวจภาคสนาม');
  assert.equal(coordinateReading('', 'x'), '');
});

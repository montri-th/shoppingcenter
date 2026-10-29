/**
 * Short Thai readings of the research codes that qualify each field (name basis, type,
 * operation, coordinate role, opening-hours scope, legacy size method, store datasets).
 *
 * The research vocabulary is long-tailed and grows with every pass, so readings are
 * pattern-based with a neutral fallback; the raw code always stays in data/details/*.json
 * for analysts and agents. A reading never upgrades a value: “not field verified” stays
 * visible, a provider or nonofficial name says so, an estimate is called an estimate.
 */
const has = (code, ...words) => words.some(w => String(code || '').toLowerCase().includes(w));

export function nameBasis(code) {
  if (!code) return '';
  if (has(code, 'owner_authorized', 'transliterat', 'rtgs')) return 'ชื่อถอดเสียงหรือกำหนดโดยทีมข้อมูล ไม่ใช่ชื่อทางการ';
  if (has(code, 'nonofficial', 'descriptive', 'assembled')) return 'ชื่อบรรยาย ไม่ใช่ชื่อทางการ';
  if (has(code, 'provider_reported', 'profile_reported', 'secondary_reported')) return 'ชื่อตามผู้ให้บริการแผนที่หรือแหล่งรอง';
  if (has(code, 'retailer', 'tenant', 'brand plus')) return 'ชื่อตามที่ร้านหลักใช้';
  if (has(code, 'government', 'municipal', 'transport_operator', 'issuer')) return 'ชื่อตามหน่วยงานหรือผู้ออกเอกสาร';
  if (has(code, 'retained_existing')) return 'ชื่อเดิมในทะเบียน';
  if (has(code, 'official', 'primary', 'published')) return 'ชื่อตามแหล่งทางการ';
  return 'ตามแหล่งที่บันทึก';
}

export function typeEvidence(code) {
  if (!code) return 'ยังไม่มีหลักฐานประเภท';
  if (has(code, 'needs_evidence', 'pending')) return 'ประเภทรอหลักฐานเพิ่ม';
  if (has(code, 'historical')) return 'ประเภทจากหลักฐานย้อนหลัง';
  if (has(code, 'dated')) return 'ประเภทจากหลักฐานที่ระบุวันที่';
  return 'ประเภทจากหลักฐานปฐมภูมิ';
}

/** operation_group → reading of the current operation evidence. */
export function operationReading(group) {
  switch (group) {
    case 'operating_source_evidence': return 'มีหลักฐานว่าเปิดดำเนินการ ยังไม่ตรวจภาคสนาม';
    case 'official_listing_not_field_verified': return 'อยู่ในรายชื่อทางการ ยังไม่ตรวจภาคสนาม';
    case 'needs_review': return 'สถานะปัจจุบันรอยืนยัน';
    case 'current_operation_unconfirmed': return 'สถานะปัจจุบันยังยืนยันไม่ได้';
    case 'recent_source_evidence_current_operation_separate': return 'มีหลักฐานล่าสุด สถานะวันนี้ตรวจแยก';
    case 'operation_conflict': return 'หลักฐานสถานะขัดกัน รอตรวจ';
    case 'partially_operating': return 'ทยอยเปิด';
    case 'historical_primary_current_reverification_pending': return 'หลักฐานย้อนหลัง รอตรวจสถานะปัจจุบัน';
    case 'future_project': return 'โครงการที่ยังไม่เปิด';
    case 'closed_source_evidence': return 'ปิดตามหลักฐาน';
    default: return 'ยังไม่ระบุสถานะ';
  }
}

export function statusTone(row) {
  if (row.status === 'closed') return 'closed';
  if (row.status === 'planned') return 'pending';
  if (['operating_source_evidence', 'official_listing_not_field_verified', 'partially_operating'].includes(row.operationGroup)) return 'listed';
  return 'neutral';
}

export function coordinateReading(role, status) {
  if (!role) return '';
  let text = 'จุดอ้างอิง';
  if (has(role, 'host_registry')) text = 'จุดอ้างอิงจากทะเบียน CityMETER';
  else if (has(role, 'retailer_branch')) text = 'จุดสาขาของร้านหลัก';
  else if (has(role, 'provider')) text = 'จุดจากผู้ให้บริการแผนที่';
  else if (has(role, 'complex', 'site')) text = 'จุดอ้างอิงของโครงการ';
  const notEntrance = has(role, 'not_entrance', 'not_host_entrance') ? ' ไม่ใช่ประตูทางเข้า' : '';
  const verify = has(status, 'not_field_verified', 'not_spatially_validated') ? ' · ยังไม่ตรวจภาคสนาม' : '';
  return `${text}${notEntrance}${verify}`;
}

export function hoursScope(scope) {
  if (!scope) return '';
  if (has(scope, 'whole_mall', 'whole_shopping', 'whole_named', 'whole_project')) return 'เวลาของทั้งศูนย์';
  if (has(scope, 'retailer', 'anchor', 'store component', 'tenant contacts')) return 'เวลาของร้านหลัก ไม่ใช่ทั้งสถานที่';
  if (has(scope, 'not_verified', 'not separately', 'otherwise_unknown')) return 'ยังไม่ยืนยันว่าเป็นเวลาของทั้งสถานที่';
  if (has(scope, 'historical')) return 'เวลาจากข้อมูลย้อนหลัง';
  if (has(scope, 'individual tenant')) return 'ร้านแต่ละร้านอาจต่างกัน';
  return '';
}

/** Legacy size estimate method (decision D3): what the number was computed from. */
export function legacyBasis(basis) {
  const b = String(basis || '');
  if (!b) return 'ไม่ระบุวิธี';
  if (/56-1/.test(b)) return 'รายงาน 56-1 ของบริษัท';
  if (/gfa\s*[×x*]\s*0\.\d|GFA\s*[×x*]/i.test(b)) return 'คำนวณจากพื้นที่อาคารรวม × สัดส่วน';
  if (/site_area|floors/i.test(b)) return 'คำนวณจากพื้นที่ที่ดินหรือจำนวนชั้น × สัดส่วน';
  if (/osm|overpass|footprint|b3d/i.test(b)) return 'คำนวณจากรอยอาคารบนแผนที่ × สัดส่วน';
  if (/curate|tavily|web_direct|wiki/i.test(b)) return 'รวบรวมจากแหล่งรองบนเว็บ';
  if (/input/i.test(b)) return 'ค่าในทะเบียนเดิม';
  return 'ค่าประมาณจากทะเบียนเดิม';
}

export const STORE_DATASETS = Object.freeze({
  'research.TH.luxury': 'Luxury Brands',
  'research.TH.restaurants': 'ร้านอาหาร',
  'research.TH.grocery': 'ซูเปอร์มาร์เก็ตและร้านของชำ',
  'research.TH.pharmacy': 'ร้านขายยา',
  'research.TH.bank': 'ธนาคาร',
  'research.TH.gold': 'ร้านทอง',
  'research.TH.optical': 'ร้านแว่นตา',
  'research.TH.camera': 'ร้านกล้อง',
  'research.MLA.PARC': 'ข้อมูลร้านจาก MLA',
  'research.TH.fitness': 'ฟิตเนสและสตูดิโอ',
});
export const storeDataset = id => STORE_DATASETS[id] || id;

/** Why a qualified row is not counted (row.countHold from the pipeline; countRole for older data) — a short pill. */
const HOLD_READINGS = Object.freeze({
  duplicate: 'อาจซ้ำ · ไม่นับแยก',
  'count-review': 'รอตรวจการนับ · ยังไม่นับ',
  context: 'บริบทของหลายสถานที่ · ไม่นับ',
  unclassified: 'ยังไม่นับ',
});

/** Pill for rows that are not counted on their own; counted rows get none (no caveat on screen). */
export function hierarchyReading(row) {
  if (!row) return '';
  if (!row.countable && HOLD_READINGS[row.countHold]) return HOLD_READINGS[row.countHold];
  if (row.countRole === 'duplicate_candidate_hold') return HOLD_READINGS.duplicate;
  if (!row.countable) return 'พื้นที่ย่อย · ไม่นับแยก';
  return '';
}

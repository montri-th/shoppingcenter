// D39 (owner 8 Nov 2026 01:18, choice ก): the first view keeps its type set and says what the other types hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import {otherTypesLine} from '../js/panel.js';

const visible = html => html.replace(/<[^>]+>/g, ' ');
const CAVEAT = /caveat|ข้อจำกัด|ไม่ใช่|ไม่นับในจำนวน|ช่องว่างตลาด|ทำเลทอง/;

test('the other-types line names the area, the count and the largest groups, with the button that shows every type', () => {
  const html = otherTypesLine({count: 668, where: 'ในกรุงเทพฯ', groups: [{id: 'market', count: 470}, {id: 'hoststore', count: 120}, {id: 'fuel', count: 60}, {id: 'other', count: 18}]});
  assert.match(html, /ในกรุงเทพฯ ยังมีสถานที่ค้าปลีกประเภทอื่นอีก <strong class="data-number">668<\/strong> แห่ง เช่น ตลาด ไฮเปอร์\/ซูเปอร์มาร์เก็ต และสถานีบริการ/);
  assert.match(html, /data-action="clear-filter" data-id="group">ดูทุกประเภท</);
  assert.doesNotMatch(html, /อื่น ๆ/, 'the catch-all group is not named as an example');
  assert.ok(!CAVEAT.test(visible(html)));
  assert.equal(otherTypesLine(null), '');
  assert.equal(otherTypesLine({count: 0, where: 'ทั่วประเทศ', groups: []}), '');
  assert.match(otherTypesLine({count: 3, where: 'ทั่วประเทศ', groups: [{id: 'market', count: 3}]}), /ทั่วประเทศ ยังมีสถานที่ค้าปลีกประเภทอื่นอีก <strong class="data-number">3<\/strong> แห่ง เช่น ตลาด ·/);
});

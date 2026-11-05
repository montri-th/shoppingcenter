import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {encodePng, sitePng, siteSvg, frame, FONT, PICTURE_COLOURS} from '../scripts/site-picture.mjs';

// An independent bitwise CRC-32, so the check does not reuse the encoder's table.
function crc(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }

function decode(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG signature');
  let off = 8, w = 0, h = 0;
  const idat = [], types = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off), type = png.toString('latin1', off + 4, off + 8), data = png.subarray(off + 8, off + 8 + len);
    assert.equal(png.readUInt32BE(off + 8 + len), crc(png.subarray(off + 4, off + 8 + len)), `${type} CRC`);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 2); }
    if (type === 'IDAT') idat.push(data);
    types.push(type);
    off += 12 + len;
  }
  assert.deepEqual([types[0], types.at(-1)], ['IHDR', 'IEND']);
  const raw = inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, (w * 3 + 1) * h);
  for (let y = 0; y < h; y++) assert.equal(raw[y * (w * 3 + 1)], 0, `row ${y} filter`);
  const px = (x, y) => { const k = y * (w * 3 + 1) + 1 + x * 3; return '#' + [...raw.subarray(k, k + 3)].map(v => v.toString(16).padStart(2, '0')).join(''); };
  return {w, h, px};
}

test('encodePng writes a valid 8-bit RGB PNG with the given pixels', () => {
  const pixels = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 17, 34, 51, 255, 255, 255, 0, 0, 0]);
  const {w, h, px} = decode(encodePng(3, 2, pixels));
  assert.deepEqual([w, h], [3, 2]);
  assert.deepEqual([px(0, 0), px(1, 0), px(2, 0), px(0, 1), px(1, 1), px(2, 1)], ['#ff0000', '#00ff00', '#0000ff', '#112233', '#ffffff', '#000000']);
});

test('the site PNG draws the SVG frame: picked blue, others grey, holes open, pin red, footer below', () => {
  const row = {id: 'SC-000001', name: 'ทดสอบ', lon: 100.5, lat: 13.7};
  const kx = 111320 * Math.cos((row.lat * Math.PI) / 180), ky = 110574;
  const at = (x, y) => [row.lon + x / kx, row.lat + y / ky];
  const square = (x0, y0, x1, y1) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)];
  const candidates = [
    {cid: 1, outer: square(30, -20, 70, 20), holes: [], point: at(50, 0), area_m2: 1600},
    {cid: 2, outer: square(-70, -20, -30, 20), holes: [square(-60, -10, -40, 10)], point: at(-65, 0), area_m2: 1200},
  ];
  const site = [square(20, -30, 80, 30)];
  const {W, H, P} = frame(row, candidates);
  const {w, h, px} = decode(sitePng(row, candidates, new Set([1]), site));
  assert.deepEqual([w, h], [W, H + 60]);
  const pixel = (x, y) => px(...P(at(x, y)).map(Math.floor));
  assert.equal(pixel(35, 15), PICTURE_COLOURS.picked, 'picked building');
  assert.equal(pixel(-65, 15), PICTURE_COLOURS.building, 'other building');
  assert.equal(pixel(-50, 0), PICTURE_COLOURS.paper, 'hole stays open');
  assert.equal(pixel(0, 0), PICTURE_COLOURS.pin, 'pin');
  assert.equal(pixel(0, 40), PICTURE_COLOURS.paper, 'empty ground');
  const [sx, sy] = P(at(20, 0)).map(Math.round);
  assert.ok([-1, 0, 1].some(d => px(sx + d, sy) === PICTURE_COLOURS.site), 'site boundary');
  const [lx, ly] = P(at(50, 0)).map(Math.round);
  let ink = 0;
  for (let dx = -6; dx <= 6; dx++) for (let dy = -8; dy <= 8; dy++) if (px(lx + dx, ly + dy) === PICTURE_COLOURS.ink) ink++;
  assert.ok(ink > 10, 'building number drawn');
  const svg = siteSvg(row, candidates, new Set([1]), site);
  assert.match(svg, new RegExp(`width="${W}" height="${H + 60}"`));
  assert.match(svg, />1<\/text>/);
  // A building CityMETER does not have: an orange diamond labelled OSM, and the footer says what it is.
  const marked = decode(sitePng(row, candidates, new Set([1]), site, [at(0, 30)]));
  assert.equal(marked.px(...P(at(0, 30)).map(Math.floor)), PICTURE_COLOURS.site, 'OSM mark');
  assert.match(siteSvg(row, candidates, new Set([1]), site, [at(0, 30)]), /OpenStreetMap building/);
});

test('the pixel font has every character of the venue ids and the PNG footer', () => {
  const ids = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url), 'utf8')).rows.map(r => r.id);
  const text = [...ids, 'north up · red dot = pin · numbered by distance from the pin · CityMETER Building V4', '100 m'].join(' ').toUpperCase();
  const missing = [...new Set(text)].filter(ch => !(ch in FONT));
  assert.deepEqual(missing, []);
  for (const [ch, bits] of Object.entries(FONT)) assert.ok(/^[01]+$/.test(bits) && bits.length % 5 === 0, `glyph ${ch}`);
});

// Pictures for the site research helper (scripts/site-candidates.mjs). Both show the same frame: north up, the
// candidates' extent plus 30 m, 1200 px wide with a 60 px footer. Buildings grey, picked buildings blue, the site
// boundary orange, the venue's pin red, every building numbered (1 = nearest the pin).
// The PNG needs no packages (node:zlib) and opens in any image viewer; the SVG is the same picture for a browser.
// Research tool only: these pictures never enter the page.
import {deflateSync} from 'node:zlib';

export const PICTURE_COLOURS = {paper: '#ffffff', building: '#d7dbd8', picked: '#5aa9d6', edge: '#4a5550', site: '#e46a1f', pin: '#d62828', ink: '#111111'};
const WIDTH = 1200, FOOTER = 60, PAD_M = 30;

/** The frame both pictures share: local metres round the venue's point, north up. */
export function frame(row, candidates) {
  const kx = 111320 * Math.cos((row.lat * Math.PI) / 180), ky = 110574;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const c of candidates) for (const [lon, lat] of c.outer) {
    const x = (lon - row.lon) * kx, y = (lat - row.lat) * ky;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  minX -= PAD_M; maxX += PAD_M; minY -= PAD_M; maxY += PAD_M;
  const scale = WIDTH / (maxX - minX), H = Math.round((maxY - minY) * scale);
  const P = ([lon, lat]) => [((lon - row.lon) * kx - minX) * scale, (maxY - (lat - row.lat) * ky) * scale];
  return {W: WIDTH, H, scale, P};
}

// `marks`: [lon, lat] points of buildings CityMETER does not have (the map draws the OpenStreetMap outline there),
// drawn as an orange diamond labelled OSM.
const MARK_NOTE = 'orange diamond = OpenStreetMap building';

/** SVG: for a browser. */
export function siteSvg(row, candidates, picked = new Set(), site = null, marks = []) {
  const {W, H, scale, P} = frame(row, candidates), C = PICTURE_COLOURS;
  const path = ring => ring.map((p, i) => `${i ? 'L' : 'M'}${P(p).map(v => v.toFixed(1)).join(',')}`).join('') + 'Z';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const shapes = candidates.map(c => `<path d="${[c.outer, ...c.holes].map(path).join('')}" fill="${picked.has(c.cid) ? C.picked : C.building}" fill-rule="evenodd" stroke="${C.edge}" stroke-width="1"/>`).join('');
  const labels = candidates.map(c => { const [x, y] = P(c.point); const fs = c.area_m2 >= 1500 ? 16 : 11; return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" fill="${C.ink}" stroke="#fff" stroke-width="3" paint-order="stroke">${c.cid}</text>`; }).join('');
  const siteRings = site ? site.map(r => `<path d="${path(r)}" fill="none" stroke="${C.site}" stroke-width="3"/>`).join('') : '';
  const [px, py] = P([row.lon, row.lat]);
  const bar = 100 * scale;
  const markSvg = marks.map(m => { const [x, y] = P(m).map(v => +v.toFixed(1)); return `<path d="M${x},${y - 9}L${x + 9},${y}L${x},${y + 9}L${x - 9},${y}Z" fill="${C.site}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y - 16}" font-size="12" text-anchor="middle" font-family="sans-serif" fill="${C.ink}" stroke="#fff" stroke-width="3" paint-order="stroke">OSM</text>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + FOOTER}" viewBox="0 0 ${W} ${H + FOOTER}"><rect width="100%" height="100%" fill="#fff"/>${shapes}${siteRings}${labels}${markSvg}` +
    `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="8" fill="${C.pin}" stroke="#fff" stroke-width="2"/>` +
    `<text x="16" y="${H + 26}" font-size="16" font-family="sans-serif">${esc(row.name)} · ${esc(row.id)} · north up · numbered by distance from the pin (red) · CityMETER Building V4${marks.length ? ` · ${MARK_NOTE}` : ''}</text>` +
    `<line x1="16" y1="${H + 44}" x2="${(16 + bar).toFixed(1)}" y2="${H + 44}" stroke="${C.ink}" stroke-width="3"/><text x="${(22 + bar).toFixed(1)}" y="${H + 49}" font-size="13" font-family="sans-serif">100 m</text></svg>`;
}

// A 5-row pixel font: digits, A–Z and a few signs (rows top to bottom, 1 = ink). Width = bits ÷ 5.
export const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '1000111011101011000110001', N: '1000111001101011001110001',
  O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110',
  T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '1000110001101011101110001', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '-': '000000111000000', '=': '000111000111000', '.': '00001',
  '·': '00100', ':': '01010', '/': '001001010100100', '(': '0110101001', ')': '1001010110', ' ': '0000000000',
  '?': '111001010000010',
};
const glyph = ch => { const bits = FONT[ch] ?? FONT['?']; return {bits, w: bits.length / 5}; };
export const textWidth = (str, sc) => [...String(str).toUpperCase()].reduce((a, ch) => a + (glyph(ch).w + 1) * sc, 0) - sc;

/** PNG: for any image viewer. Same frame, colours and numbers as the SVG; the footer carries the id, not the name. */
export function sitePng(row, candidates, picked = new Set(), site = null, marks = []) {
  const {W, H, scale, P} = frame(row, candidates), h = H + FOOTER;
  const C = Object.fromEntries(Object.entries(PICTURE_COLOURS).map(([k, v]) => [k, [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16))]));
  const img = new Uint8Array(W * h * 3).fill(255);
  const set = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= h) return;
    const k = (y * W + x) * 3;
    img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2];
  };
  const fill = (rings, c) => {   // even-odd scanlines at pixel centres, so holes stay open
    const rs = rings.map(r => r.map(P));
    let y0 = Infinity, y1 = -Infinity;
    for (const r of rs) for (const p of r) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5, xs = [];
      for (const r of rs) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        if ((a[1] <= yc) !== (b[1] <= yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) set(x, y, c);
    }
  };
  const line = (a, b, c, w) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1, o = (w - 1) / 2;
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n - o, y = a[1] + ((b[1] - a[1]) * i) / n - o;
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < w; dy++) set(x + dx, y + dy, c);
    }
  };
  const outline = (ring, c, w) => { const q = ring.map(P); for (let i = 0; i < q.length; i++) line(q[i], q[(i + 1) % q.length], c, w); };
  const disc = ([cx, cy], r, c) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) set(cx + dx, cy + dy, c); };
  const text = (str, x, y, sc, {start = false, plate = true} = {}) => {
    const chars = [...String(str).toUpperCase()], tw = textWidth(str, sc);
    let ox = Math.round(start ? x : x - tw / 2);
    const oy = Math.round(y - (5 * sc) / 2);
    if (plate) for (let i = -2; i < tw + 2; i++) for (let j = -2; j < 5 * sc + 2; j++) set(ox + i, oy + j, C.paper);
    for (const ch of chars) {
      const g = glyph(ch);
      for (let r = 0; r < 5; r++) for (let col = 0; col < g.w; col++) if (g.bits[r * g.w + col] === '1')
        for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) set(ox + col * sc + a, oy + r * sc + b, C.ink);
      ox += (g.w + 1) * sc;
    }
  };
  for (const c of candidates) {
    fill([c.outer, ...c.holes], picked.has(c.cid) ? C.picked : C.building);
    for (const r of [c.outer, ...c.holes]) outline(r, C.edge, 1);
  }
  if (site) for (const r of site) outline(r, C.site, 3);
  // Small buildings first, so a large building's number is never covered by a neighbour's.
  for (const c of [...candidates].sort((a, b) => a.area_m2 - b.area_m2 || b.cid - a.cid)) text(c.cid, ...P(c.point), c.area_m2 >= 1500 ? 3 : 2);
  const diamond = ([cx, cy], r, c) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r) set(cx + dx, cy + dy, c); };
  for (const m of marks) {
    const q = P(m);
    diamond(q, 11, C.paper);
    diamond(q, 9, C.site);
    text('OSM', q[0], q[1] - 18, 2);
  }
  const pin = P([row.lon, row.lat]);
  disc(pin, 10, C.paper);
  disc(pin, 8, C.pin);
  text(`${row.id} · north up · red dot = pin · numbered by distance from the pin · CityMETER Building V4${marks.length ? ` · ${MARK_NOTE}` : ''}`, 16, H + 22, 2, {start: true, plate: false});
  line([16, H + 44], [16 + 100 * scale, H + 44], C.ink, 3);
  text('100 m', 24 + 100 * scale, H + 44, 2, {start: true, plate: false});
  return encodePng(W, h, img);
}

const CRC_TABLE = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const v of buf) c = CRC_TABLE[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** 8-bit RGB PNG from w × h × 3 bytes (rows top to bottom). */
export function encodePng(w, h, pixels) {
  const raw = Buffer.alloc((w * 3 + 1) * h);   // filter byte 0 (None) before every row
  for (let y = 0; y < h; y++) raw.set(pixels.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

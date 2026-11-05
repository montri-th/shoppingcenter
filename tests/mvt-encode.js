/**
 * A minimal Mapbox Vector Tile writer for the tests: polygon features with string, unsigned-integer and boolean
 * properties, optional ids. Rings are closed [[x, y]…] arrays in tile units (any sign); outer rings clockwise on screen
 * (y down), holes counter-clockwise — as js/mvt.js and js/geometry.js read them.
 */
const varint = n => { const out = []; let v = BigInt(n); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return out; };
const zigzag = n => (n << 1) ^ (n >> 31);
const field = (num, wire, payload) => [...varint((num << 3) | wire), ...payload];
const len = payload => [...varint(payload.length), ...payload];
const str = s => len([...new TextEncoder().encode(s)]);

function geometry(rings) {
  const out = [];
  let cx = 0, cy = 0;
  const cmd = (id, count) => out.push(...varint((id & 7) | (count << 3)));
  for (const ring of rings) {
    const pts = ring.slice(0, -1); // the closing point is implied by ClosePath
    cmd(1, 1);
    out.push(...varint(zigzag(pts[0][0] - cx)), ...varint(zigzag(pts[0][1] - cy)));
    [cx, cy] = pts[0];
    cmd(2, pts.length - 1);
    for (const [x, y] of pts.slice(1)) { out.push(...varint(zigzag(x - cx)), ...varint(zigzag(y - cy))); cx = x; cy = y; }
    cmd(7, 1);
  }
  return out;
}

const valueMessage = v => (typeof v === 'string' ? field(1, 2, str(v)) : typeof v === 'boolean' ? field(7, 0, varint(v ? 1 : 0)) : field(5, 0, varint(v)));

/** layers: [{name, extent?, features: [{id?, properties, rings}]}] → ArrayBuffer of one tile. */
export function encodeTile(layers) {
  const tile = [];
  for (const L of layers) {
    const keys = [], values = [], keyIndex = new Map(), valueIndex = new Map(), features = [];
    for (const f of L.features) {
      const tags = [];
      for (const [k, v] of Object.entries(f.properties || {})) {
        if (!keyIndex.has(k)) { keyIndex.set(k, keys.length); keys.push(k); }
        const vk = `${typeof v}:${v}`;
        if (!valueIndex.has(vk)) { valueIndex.set(vk, values.length); values.push(v); }
        tags.push(keyIndex.get(k), valueIndex.get(vk));
      }
      const body = [...(f.id != null ? field(1, 0, varint(f.id)) : []), ...field(2, 2, len(tags.flatMap(varint))), ...field(3, 0, varint(3)), ...field(4, 2, len(geometry(f.rings)))];
      features.push(...field(2, 2, len(body)));
    }
    const layer = [...field(15, 0, varint(2)), ...field(1, 2, str(L.name)), ...features, ...keys.flatMap(k => field(3, 2, str(k))),
      ...values.flatMap(v => field(4, 2, len(valueMessage(v)))), ...field(5, 0, varint(L.extent || 4096))];
    tile.push(...field(3, 2, len(layer)));
  }
  return new Uint8Array(tile).buffer;
}

/** A clockwise (on screen, y down) square ring from (x, y) with side s. */
export const square = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

/**
 * Map credits sit beside the map, never on it (owner 2026-11-07 14:02, with a phone screenshot of the open credit box:
 * “โดน ป้าย ที่มาข้อมูล บังมากเกินไป แย่มาก ตัดออกให้หมด เอาไปซ่อนไว้ที่อื่น ให้เห็นแผนที่ใหญ่ๆ”). It replaces the five-second fold
 * of 0.1.19 (owner 11:15).
 *
 * - On the map: nothing. MapLibre's attribution control still collects the credit of every source in use (OpenFreeMap ·
 *   OpenMapTiles · OpenStreetMap, the RTSD boundaries, CityMETER Building V4 while one of its buildings is drawn, the
 *   terrain while it is shown), but it is not drawn (styles.css “Map credit”).
 * - Under the map: one quiet line at the foot of the bottom bar, “© OpenStreetMap · © OpenMapTiles · OpenFreeMap · ที่มา”
 *   (index.html #map-credit), readable without touching the map. The OSMF attribution guidelines accept a credit placed
 *   “adjacent to the map” and ask that it “not require individuals to interact with the map … to see the attribution”
 *   (https://osmfoundation.org/wiki/Licence/Attribution_Guidelines); OpenStreetMap links to its copyright page and
 *   OpenMapTiles to openmaptiles.org, as their licences ask.
 * - In the help dialog: “ที่มาของแผนที่” (#map-credits) lists what the map uses at the moment. This module copies MapLibre's
 *   live list there, as text and http(s) links only (the basemap credit arrives from a remote TileJSON).
 */
const CONTROL = '.maplibregl-ctrl-attrib';
const INNER = '.maplibregl-ctrl-attrib-inner';
const EMPTY = 'maplibregl-attrib-empty';
const TEXT = 3, ELEMENT = 1;

/** An absolute http(s) link, or null: no scripts, no relative or protocol-relative targets. */
export function safeHref(href) {
  const value = String(href ?? '').trim();
  if (!/^https?:\/\/[^\s/]/i.test(value)) return null;
  try { return new URL(value).href; } catch { return null; }
}

const tidy = text => String(text).replace(/\s+/g, ' ');

/**
 * The credits held by a MapLibre attribution container, one item per source credit (MapLibre joins them with “ | ”).
 * Each item is a list of parts, {text} or {text, href}; any other markup keeps only its text. Works on DOM nodes or on
 * any object with nodeType, nodeName, childNodes, textContent and getAttribute.
 */
export function creditItems(root) {
  const items = [[]];
  const addText = text => {
    tidy(text).split('|').forEach((piece, i) => {
      if (i > 0) items.push([]);
      if (piece) items[items.length - 1].push({text: piece});
    });
  };
  const walk = node => {
    for (const child of node?.childNodes || []) {
      if (child.nodeType === TEXT) addText(child.nodeValue ?? child.textContent ?? '');
      else if (child.nodeType === ELEMENT) {
        const href = String(child.nodeName || '').toLowerCase() === 'a' ? safeHref(child.getAttribute?.('href')) : null;
        if (href) items[items.length - 1].push({text: tidy(child.textContent || ''), href});
        else walk(child);
      }
    }
  };
  walk(root);
  return items
    .map(parts => {
      const out = parts.filter(p => p.text !== '' || p.href);
      if (out.length) {
        out[0] = {...out[0], text: out[0].text.replace(/^\s+/, '')};
        const end = out.length - 1;
        out[end] = {...out[end], text: out[end].text.replace(/\s+$/, '')};
      }
      return out.filter(p => p.text !== '');
    })
    .filter(parts => parts.some(p => p.text.trim()));
}

/** Fills `list` (a <ul>) with one <li> per credit; links open in a new tab. Returns the number of items. */
export function renderCreditList(list, items, doc = list.ownerDocument) {
  const rows = items.map(parts => {
    const li = doc.createElement('li');
    for (const part of parts) {
      if (part.href) {
        const a = doc.createElement('a');
        a.href = part.href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = part.text;
        li.append(a);
      } else li.append(doc.createTextNode(part.text));
    }
    return li;
  });
  list.replaceChildren(...rows);
  return rows.length;
}

function watchCredit(el, onChange) {
  if (typeof MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(el, {attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true});
  return () => observer.disconnect();
}

/**
 * Keeps `list` in step with the map's live credits. Until MapLibre has a credit (or while it has none) the list keeps
 * what index.html wrote. `watch` is injectable for tests. Returns {sync, dispose}, or null without a control or a list.
 */
export function mirrorMapCredits(map, {list, watch = watchCredit} = {}) {
  const el = map.getContainer().querySelector(CONTROL);
  const inner = el?.querySelector(INNER);
  if (!el || !inner || !list) return null;
  let last = '';
  const sync = () => {
    if (el.classList.contains(EMPTY)) return;   // MapLibre keeps its old text when no source carries a credit
    const items = creditItems(inner);
    if (!items.length) return;
    const key = JSON.stringify(items);
    if (key === last) return;
    last = key;
    renderCreditList(list, items);
  };
  const unwatch = watch(el, sync);
  sync();
  return {sync, dispose: unwatch};
}

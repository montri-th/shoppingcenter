/**
 * Venue pins: one accessible HTML marker per focused venue, never aggregated.
 *
 * Only the focus is drawn here (the venues that carry detail); everything else is a quiet
 * GPU dot (venue-points.js). When the focus is larger than MAX_DOM_PINS the GPU layer draws
 * it instead (group colour + shape), so the page stays fast with the full registry.
 *
 * Source coordinates are projected every frame; co-located points receive a bounded
 * screen-space slot near their own anchor (separatePins) and a leader line joins the
 * hovered/selected pin back to its source. Each pin carries its group colour AND shape
 * (LDS series cue). Venue logos are an optional label layer capped at MAX_LOGOS, from zoom
 * LOGO_MIN_ZOOM, placed only where they clear every other pin, label and UI obstacle.
 * A hidden logo never hides a pin.
 */
import {hasPoint, groupById, STATUSES} from './model.js';
import {venueLogoMarkup, getVenueLogo} from './venue-logos.js';
import {cueSVG} from './cues.js';

export const MAX_LOGOS = 250;
export const MAX_DOM_PINS = 600;
/** Logos (and full-size pins) only from this zoom: the 3D overview stays calm. */
export const LOGO_MIN_ZOOM = 14;
const intersects = (a, b, gap = 0) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
const inside = (p, b) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
const pointBox = (x, y, size) => ({left: x - size / 2, right: x + size / 2, top: y - size / 2, bottom: y + size / 2});

export const isSourceVisible = (point, bounds) => inside(point, bounds) && !(bounds.exclusions || []).some(b => inside(point, b));

/**
 * Compact display-only slots. A strict source-distance cap replaces any
 * viewport-wide fan. The caller supplies only unobscured source anchors.
 */
export function separatePins(points, bounds, spacing = 8, {minSpacing = 0.5, maxOffset = 36} = {}) {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.id.localeCompare(b.id));
  for (let pitch = spacing; pitch >= minSpacing; pitch = pitch > 2 ? pitch - 1 : pitch / 2) {
    const offsets = [], used = new Map(), placed = [];
    const ring = Math.ceil(maxOffset / pitch);
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      const x = dx * pitch, y = dy * pitch, d = x * x + y * y;
      if (d <= maxOffset * maxOffset + 0.001) offsets.push({x, y, d});
    }
    offsets.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    const collision = (x, y) => {
      const cx = Math.floor(x / pitch), cy = Math.floor(y / pitch);
      for (let a = cx - 1; a <= cx + 1; a++) for (let b = cy - 1; b <= cy + 1; b++) {
        for (const q of used.get(`${a},${b}`) || []) if (Math.abs(x - q.x) < pitch - 0.001 && Math.abs(y - q.y) < pitch - 0.001) return true;
      }
      return false;
    };
    for (const p of sorted) {
      let found = null;
      for (const o of offsets) {
        const x = p.x + o.x, y = p.y + o.y, box = pointBox(x, y, pitch);
        if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom ||
            (bounds.exclusions || []).some(b => intersects(box, b)) || collision(x, y)) continue;
        found = {...p, x, y, anchorX: p.x, anchorY: p.y, spacing: pitch};
        break;
      }
      if (!found) break;
      placed.push(found);
      const key = `${Math.floor(found.x / pitch)},${Math.floor(found.y / pitch)}`;
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(found);
    }
    if (placed.length === sorted.length) return placed;
  }
  throw new Error('Local viewport is too small for individual pins');
}

/**
 * Optional logo labels. Each distinct logo gets a turn before repeated
 * marks (shared chain banners); a label is accepted only when it clears every other mark, UI
 * obstacle and accepted label. Returns Map<id, {x, y, width, height, box}>.
 */
export function placeLogos(points, bounds, {limit = MAX_LOGOS, width = 60, height = 30, maxOffset = 64, selectedId = '', areaFraction = 0.12} = {}) {
  const result = new Map(), labels = [];
  const cx = (bounds.left + bounds.right) / 2, cy = (bounds.top + bounds.bottom) / 2;
  const budget = Math.min(MAX_LOGOS, Math.max(0, limit), Math.floor(((bounds.right - bounds.left) * (bounds.bottom - bounds.top) * areaFraction) / (width * height)));
  const candidates = points.filter(p => p.logoKey && p.hasLogo !== false).sort((a, b) =>
    Number(b.id === selectedId) - Number(a.id === selectedId) ||
    ((a.anchorX - cx) ** 2 + (a.anchorY - cy) ** 2) - ((b.anchorX - cx) ** 2 + (b.anchorY - cy) ** 2) ||
    a.id.localeCompare(b.id));
  const offsets = [[0, -height / 2 - 8], [0, height / 2 + 8], [width / 2 + 8, 0], [-width / 2 - 8, 0], [width / 2 + 8, -height / 2 - 8], [-width / 2 - 8, -height / 2 - 8], [width / 2 + 8, height / 2 + 8], [-width / 2 - 8, height / 2 + 8], [0, -height - 14], [0, height + 14]];
  const tryPlace = p => {
    if (result.size >= budget) return false;
    const labelHeight = p.logoRatio ? Math.min(height, Math.max(18, width / p.logoRatio)) : height;
    for (const [dx, dy] of offsets) {
      if (Math.hypot(dx, dy) > maxOffset) continue;
      const x = p.anchorX + dx, y = p.anchorY + dy;
      const box = {left: x - width / 2, right: x + width / 2, top: y - labelHeight / 2, bottom: y + labelHeight / 2};
      if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom ||
          (bounds.exclusions || []).some(b => intersects(box, b, 5)) || labels.some(b => intersects(box, b, 9)) ||
          points.some(q => q.id !== p.id && intersects(box, pointBox(q.x, q.y, Math.max(3, q.spacing)), 3))) continue;
      labels.push(box);
      result.set(p.id, {x, y, width, height: labelHeight, box});
      return true;
    }
    return false;
  };
  const seen = new Set();
  for (const p of candidates) { if (seen.has(p.logoKey)) continue; if (tryPlace(p)) seen.add(p.logoKey); }
  for (const p of candidates) if (!result.has(p.id)) tryPlace(p);
  return result;
}

/**
 * Mount the pin overlay on a MapLibre map container.
 * options.reservedBottom(): px at the bottom of the map that overlays cover.
 * options.onSelect(row): called when a pin is activated.
 * options.onLayout(stats): visible pin/logo counts after each layout.
 */
export function installVenuePins(map, container, {onSelect, onLayout, reservedBottom = () => 90} = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'store-pin-overlay';
  overlay.setAttribute('aria-label', 'หมุดสถานที่ ใช้ลูกศรเลือกหมุดถัดไป');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('pin-leaders');
  svg.setAttribute('aria-hidden', 'true');
  const leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  anchor.setAttribute('r', '3');
  svg.append(leader, anchor);
  overlay.append(svg);
  container.append(overlay);

  let entries = [], frame = 0, activeId = '', selectedId = '', hoveredId = '';
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };

  function layout() {
    const width = container.clientWidth, height = container.clientHeight;
    const panel = container.closest('.map-panel'), rect = container.getBoundingClientRect();
    panel.classList.toggle('is-tight', height < 480);
    const obstacle = e => { const b = e.getBoundingClientRect(); return {left: b.left - rect.left - 3, right: b.right - rect.left + 3, top: b.top - rect.top - 3, bottom: b.bottom - rect.top + 3}; };
    const blockers = [...panel.querySelectorAll('.map-toolbar button, .district-label, .map-legend, .map-status, .map-aha, .maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left')]
      .filter(e => e.offsetWidth && e.offsetHeight).map(obstacle);
    const bounds = {left: 5, right: width - 5, top: 5, bottom: Math.max(6, height - reservedBottom()), exclusions: blockers};
    const zoom = map.getZoom();
    // Quiet overview: tiny marks below z12, small marks to z14, full detail (size + logos) beyond.
    overlay.classList.toggle('is-overview', zoom < 10);
    overlay.classList.toggle('is-midzoom', zoom >= 10 && zoom < 14);
    const projected = [];
    for (const e of entries) {
      const p = map.project([e.row.lon, e.row.lat]);
      const visible = isSourceVisible(p, bounds);
      e.button.hidden = !visible;
      e.label.hidden = true;
      if (visible) projected.push({id: e.row.id, x: p.x, y: p.y, entry: e, logoKey: e.logoKey, hasLogo: e.hasLogo, logoRatio: e.logoRatio});
    }
    // Venue shapes need room to read: 13 px slots in the city, 10 px in the region, 7 px for the country.
    const pitch = zoom >= 13 ? 13 : zoom >= 11 ? 10 : zoom >= 8 ? 7 : 5;
    const maxOffset = zoom >= 13 ? 44 : zoom >= 11 ? 30 : zoom >= 8 ? 18 : 10;
    let placed;
    try { placed = separatePins(projected, bounds, pitch, {minSpacing: 0.125, maxOffset}); }
    catch { placed = projected.map(p => ({...p, anchorX: p.x, anchorY: p.y, spacing: 1})); }
    const labelBounds = {...bounds, exclusions: [...blockers, ...[...panel.querySelectorAll('.district-label:not([hidden])')].map(obstacle)]};
    const labels = zoom >= LOGO_MIN_ZOOM ? placeLogos(placed, labelBounds, {selectedId, width: zoom >= 15 ? 68 : 60, height: zoom >= 15 ? 34 : 30}) : new Map();
    const ids = placed.map(p => p.id);
    if (!ids.includes(activeId)) activeId = ids[0] || '';
    for (const p of placed) {
      const {button, label} = p.entry;
      button.style.left = `${p.x}px`;
      button.style.top = `${p.y}px`;
      button.style.setProperty('--pin-size', `${Math.max(3, Math.min(12, p.spacing - 1))}px`);
      button.tabIndex = p.id === activeId ? 0 : -1;
      button.dataset.displaced = String(Math.hypot(p.x - p.anchorX, p.y - p.anchorY) > 2);
      const l = labels.get(p.id);
      button.classList.toggle('has-logo', !!l);
      if (l) {
        label.hidden = false;
        label.style.left = `${l.x - p.x}px`;
        label.style.top = `${l.y - p.y}px`;
        label.style.width = `${l.width}px`;
        label.style.height = `${l.height}px`;
      }
    }
    const focus = placed.find(p => p.id === (hoveredId || selectedId));
    svg.style.display = focus ? '' : 'none';
    if (focus) {
      for (const [k, v] of Object.entries({x1: focus.anchorX, y1: focus.anchorY, x2: focus.x, y2: focus.y})) leader.setAttribute(k, v);
      anchor.setAttribute('cx', focus.anchorX);
      anchor.setAttribute('cy', focus.anchorY);
    }
    overlay.dataset.visiblePins = String(placed.length);
    overlay.dataset.visibleLogos = String(labels.size);
    overlay.dataset.logoLimit = String(MAX_LOGOS);
    onLayout?.({visiblePins: placed.length, visibleLogos: labels.size, logoLimit: MAX_LOGOS, zoom});
  }

  /**
   * rows = the focused venues (full detail: group colour + shape, logo, keyboard).
   * Venues outside the focus are drawn by the GPU context layer, not here.
   */
  function update(rows) {
    for (const e of entries) e.button.remove();
    entries = [];
    for (const row of rows.filter(hasPoint)) {
      const group = groupById(row.group);
      const logo = getVenueLogo(row.id, row.name);
      const button = document.createElement('button'), label = document.createElement('span'), dot = document.createElement('span');
      button.type = 'button';
      button.className = `store-pin venue-pin${row.status === 'planned' ? ' is-planned' : ''}${row.status === 'closed' ? ' is-closed' : ''}`;
      button.dataset.venueId = row.id;
      button.dataset.category = String(group.series);
      button.dataset.cue = group.cue;
      const status = row.status !== 'supply' ? ` · ${STATUSES[row.status]}` : '';
      const text = `${row.name} · ${group.th}${status}`;
      button.setAttribute('aria-label', text);
      button.title = text;
      dot.className = 'pin-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.innerHTML = cueSVG(group.cue, {className: 'pin-shape'});
      label.className = 'pin-brand-label';
      label.hidden = true;
      label.setAttribute('aria-hidden', 'true');
      label.innerHTML = logo ? venueLogoMarkup(row.id, {name: row.name, size: 'pin'}) : '';
      button.append(dot, label);
      overlay.append(button);
      button.classList.toggle('is-selected', selectedId === row.id);
      button.onclick = () => { select(row.id); onSelect?.(row); };
      button.onmouseenter = () => { hoveredId = row.id; schedule(); };
      button.onmouseleave = () => { hoveredId = ''; schedule(); };
      button.onfocus = () => { activeId = row.id; hoveredId = row.id; for (const e of entries) e.button.tabIndex = e.row.id === activeId ? 0 : -1; schedule(); };
      button.onblur = () => { hoveredId = ''; schedule(); };
      button.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const visible = entries.filter(e => !e.button.hidden), i = visible.findIndex(e => e.row.id === row.id);
        const j = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : (i + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + visible.length) % visible.length;
        visible[j]?.button.focus();
      };
      entries.push({row, button, label, logoKey: logo?.key || '', hasLogo: Boolean(logo), logoRatio: logo ? logo.width / logo.height : 2});
    }
    schedule();
  }

  function select(id) {
    selectedId = id;
    for (const e of entries) e.button.classList.toggle('is-selected', e.row.id === id);
    schedule();
  }

  map.on('move', schedule);
  map.on('resize', schedule);
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  resize?.observe(container);
  return {
    update, select, layout: schedule,
    dispose() { cancelAnimationFrame(frame); map.off('move', schedule); map.off('resize', schedule); resize?.disconnect(); overlay.remove(); },
  };
}

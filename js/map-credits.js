/**
 * The map credit stays small and out of the way (owner 2026-11-07 11:15: “source ที่เพิ่มมา บังจอ บังแผนที่เกะกะมาก
 * ให้ใส่แบบเล็กที่สุดหรือไปอยู่ส่วนที่ซ่อนไว้ … ป้ายไม่ควรเป็นสีที่เด่นเกินไป”).
 *
 * MapLibre's compact credit opens by itself when its first source credit arrives and folds to its (i) button only on a
 * drag, so a venue opened from a link kept four lines of credits over the map. Here it also folds five seconds after it
 * first opens by itself, and at the first press, touch, wheel or key on the map. The OSMF attribution guidelines let a
 * credit collapse “automatically after five seconds” or “on map interaction” while the licence stays findable from an
 * (i) button in the corner of the map (https://osmfoundation.org/wiki/Licence/Attribution_Guidelines). A credit the
 * reader opens with the (i) stays open until the map is touched again. Styling: styles.css “Map credit”.
 */
export const CREDIT_FOLD_MS = 5000;
const OPEN = 'maplibregl-compact-show';
const COMPACT = 'maplibregl-compact';
/** Map events that mean the reader is using the map (MapLibre itself folds the credit on `drag`). */
export const CREDIT_FOLD_EVENTS = ['mousedown', 'touchstart', 'wheel', 'dragstart'];

// Called as plain functions: window.setTimeout throws “Illegal invocation” when called as a method of another object.
const BROWSER_TIMERS = {set: (f, ms) => setTimeout(f, ms), clear: id => clearTimeout(id)};

function watchClass(el, onChange) {
  if (typeof MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(el, {attributes: true, attributeFilter: ['class']});
  return () => observer.disconnect();
}

/**
 * Folds the map credit as described above. `timers` and `watch` are injectable for tests. Returns {fold, dispose},
 * or null when the map has no attribution control.
 */
export function foldMapCredits(map, {delayMs = CREDIT_FOLD_MS, timers = BROWSER_TIMERS, watch = watchClass} = {}) {
  const el = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (!el) return null;
  const button = el.querySelector('.maplibregl-ctrl-attrib-button');
  const isOpen = () => el.classList.contains(COMPACT) && el.classList.contains(OPEN);
  let timer = null, autoOpenSeen = false, disposed = false;
  const stopTimer = () => { if (timer !== null) { timers.clear(timer); timer = null; } };
  // The same step as MapLibre's own fold on drag (AttributionControl#_updateCompactMinimize): drop the open class.
  const fold = () => { stopTimer(); if (isOpen()) el.classList.remove(OPEN); };
  const onClass = () => {
    if (disposed || autoOpenSeen || !isOpen()) return;
    autoOpenSeen = true;            // only the credit's own first opening is timed; later openings are the reader's
    timer = timers.set(fold, delayMs);
  };
  const onButton = () => { autoOpenSeen = true; stopTimer(); };
  const unwatch = watch(el, onClass);
  button?.addEventListener('click', onButton);
  for (const type of CREDIT_FOLD_EVENTS) map.on(type, fold);
  const canvas = map.getCanvas?.();
  canvas?.addEventListener('keydown', fold);
  onClass();
  return {
    fold,
    dispose() {
      disposed = true; stopTimer(); unwatch();
      button?.removeEventListener('click', onButton);
      for (const type of CREDIT_FOLD_EVENTS) map.off(type, fold);
      canvas?.removeEventListener('keydown', fold);
    },
  };
}

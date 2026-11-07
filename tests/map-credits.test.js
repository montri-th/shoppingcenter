// The map credit folds to its (i) button five seconds after it first opens by itself, or at the first touch of the map
// (owner 2026-11-07 11:15; OSMF attribution guidelines). A credit the reader opens stays open until the map is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {foldMapCredits, CREDIT_FOLD_MS, CREDIT_FOLD_EVENTS} from '../js/map-credits.js';

function classList(initial = []) {
  const set = new Set(initial);
  return {contains: c => set.has(c), add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), set};
}
function element(classes) {
  const listeners = {};
  return {classList: classList(classes), listeners,
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter(g => g !== f); },
    fire: t => (listeners[t] || []).forEach(f => f())};
}
/** A map with one attribution control; `changed()` stands in for the MutationObserver callback. */
function fakeMap(classes) {
  const credit = element(classes), button = element([]), canvas = element([]);
  credit.querySelector = sel => (sel === '.maplibregl-ctrl-attrib-button' ? button : null);
  const handlers = {};
  let changed = () => {};
  const map = {
    getContainer: () => ({querySelector: sel => (sel === '.maplibregl-ctrl-attrib' ? credit : null)}),
    getCanvas: () => canvas,
    on: (t, f) => { (handlers[t] ||= []).push(f); },
    off: (t, f) => { handlers[t] = (handlers[t] || []).filter(g => g !== f); },
    fire: t => (handlers[t] || []).forEach(f => f()),
  };
  const timers = {queue: [], set(f, ms) { this.queue.push({f, ms}); return this.queue.length; }, clear(id) { this.queue[id - 1] = null; },
    run() { const q = this.queue.splice(0); q.forEach(t => t && t.f()); }};
  const watch = (el, cb) => { changed = cb; return () => { changed = () => {}; }; };
  return {map, credit, button, canvas, handlers, timers, watch, changed: () => changed()};
}
const OPEN = ['maplibregl-ctrl-attrib', 'maplibregl-compact', 'maplibregl-compact-show'];

test('a credit that opened by itself folds after five seconds', () => {
  const f = fakeMap(OPEN);
  foldMapCredits(f.map, {timers: f.timers, watch: f.watch});
  assert.equal(CREDIT_FOLD_MS, 5000);
  assert.equal(f.timers.queue.length, 1);
  assert.equal(f.timers.queue[0].ms, 5000);
  f.timers.run();
  assert.equal(f.credit.classList.contains('maplibregl-compact-show'), false);
  assert.equal(f.credit.classList.contains('maplibregl-compact'), true, 'stays compact: the (i) button remains');
});

test('the credit opens later (sources arrive after load): the five seconds start then, once', () => {
  const f = fakeMap(['maplibregl-ctrl-attrib', 'maplibregl-attrib-empty']);
  foldMapCredits(f.map, {timers: f.timers, watch: f.watch});
  assert.equal(f.timers.queue.length, 0);
  f.credit.classList.add('maplibregl-compact', 'maplibregl-compact-show');
  f.changed();
  f.changed();
  assert.equal(f.timers.queue.filter(Boolean).length, 1);
  f.timers.run();
  assert.equal(f.credit.classList.contains('maplibregl-compact-show'), false);
});

test('any touch of the map folds it at once; so does a key on the map', () => {
  for (const type of CREDIT_FOLD_EVENTS) {
    const f = fakeMap(OPEN);
    foldMapCredits(f.map, {timers: f.timers, watch: f.watch});
    f.map.fire(type);
    assert.equal(f.credit.classList.contains('maplibregl-compact-show'), false, type);
    assert.equal(f.timers.queue.filter(Boolean).length, 0, `${type}: the pending fold is cleared`);
  }
  const f = fakeMap(OPEN);
  foldMapCredits(f.map, {timers: f.timers, watch: f.watch});
  f.canvas.fire('keydown');
  assert.equal(f.credit.classList.contains('maplibregl-compact-show'), false);
});

test('a credit the reader opens with (i) is not folded by the timer, only by the next touch of the map', () => {
  const f = fakeMap(['maplibregl-ctrl-attrib', 'maplibregl-compact']);
  foldMapCredits(f.map, {timers: f.timers, watch: f.watch});
  f.button.fire('click');                       // MapLibre's own handler adds the class on the same click
  f.credit.classList.add('maplibregl-compact-show');
  f.changed();
  assert.equal(f.timers.queue.filter(Boolean).length, 0);
  f.map.fire('touchstart');
  assert.equal(f.credit.classList.contains('maplibregl-compact-show'), false);
});

test('no attribution control: nothing to do; dispose removes every listener', () => {
  const none = {getContainer: () => ({querySelector: () => null})};
  assert.equal(foldMapCredits(none), null);
  const f = fakeMap(OPEN);
  const ctl = foldMapCredits(f.map, {timers: f.timers, watch: f.watch});
  ctl.dispose();
  assert.ok(CREDIT_FOLD_EVENTS.every(t => (f.handlers[t] || []).length === 0));
  assert.equal((f.button.listeners.click || []).length, 0);
  assert.equal((f.canvas.listeners.keydown || []).length, 0);
  assert.equal(f.timers.queue.filter(Boolean).length, 0);
});

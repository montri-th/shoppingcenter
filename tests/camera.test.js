// Venue camera (owner instruction 2026-10-25 18:49): two-point perspective of the venue's building,
// zoomed to fit the free part of the map. The fit is tested against a pinhole camera with MapLibre's
// conventions (512-px tiles, principal point at the canvas centre with zero padding, pitch from the
// nadir, bearing clockwise from north), so the algorithm is checked without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {wallAzimuth, twoPointBearing, occlusionScore, fitBuilding, screenBounds, CAMERA} from '../js/camera.js';

const RAD = Math.PI / 180;
const LON = 100.544, LAT = 13.744;
const KX = 111320 * Math.cos(LAT * RAD), KY = 110574;
/** Ring of a w × d metre rectangle centred at (LON, LAT), its long side at compass azimuth `az`. */
function rect(w, d, az, [cx, cy] = [0, 0]) {
  const a = az * RAD, ux = [Math.sin(a), Math.cos(a)], vx = [Math.cos(a), -Math.sin(a)];
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]];
  return pts.map(([s, t]) => [LON + (cx + s * ux[0] + t * vx[0]) / KX, LAT + (cy + s * ux[1] + t * vx[1]) / KY]);
}

/** Pinhole map: what fitBuilding reads and writes, nothing else. */
function fakeMap({width = 390, height = 640} = {}) {
  const cam = {center: {lng: LON + 0.01, lat: LAT - 0.01}, zoom: 13, pitch: 56, bearing: 28, fov: 36.87, padding: {top: 0, bottom: 0, left: 0, right: 0}};
  const moves = [];
  const geometry = () => {
    const f = (height / 2) / Math.tan((cam.fov / 2) * RAD);
    const ppm = (512 * 2 ** cam.zoom) / (40075016.686 * Math.cos(cam.center.lat * RAD));
    return {f, D: f / ppm, p: cam.pitch * RAD, b: cam.bearing * RAD, kx: 111320 * Math.cos(cam.center.lat * RAD)};
  };
  const project3 = ([lng, lat, alt = 0]) => {
    const {f, D, p, b, kx} = geometry();
    const e = (lng - cam.center.lng) * kx, n = (lat - cam.center.lat) * KY;
    const x = e * Math.cos(b) - n * Math.sin(b), y = e * Math.sin(b) + n * Math.cos(b);
    const z = y * Math.sin(p) - alt * Math.cos(p) + D, v = y * Math.cos(p) + alt * Math.sin(p);
    if (!(z > 1)) return {x: NaN, y: NaN};
    return {x: width / 2 + (f * x) / z, y: height / 2 - (f * v) / z};
  };
  const map = {
    width, height, moves,
    getCenter: () => ({...cam.center}), getZoom: () => cam.zoom, getPitch: () => cam.pitch, getBearing: () => cam.bearing, getPadding: () => ({...cam.padding}),
    getVerticalFieldOfView: () => cam.fov, setVerticalFieldOfView: v => { cam.fov = v; },
    jumpTo(o) {
      if (o.center) cam.center = Array.isArray(o.center) ? {lng: o.center[0], lat: o.center[1]} : {lng: o.center.lng, lat: o.center.lat};
      for (const k of ['zoom', 'pitch', 'bearing']) if (o[k] != null) cam[k] = o[k];
      if (o.padding) cam.padding = {...o.padding};
    },
    easeTo(o) { moves.push(['ease', o]); map.jumpTo(o); },
    flyTo(o) { moves.push(['fly', o]); map.jumpTo(o); },
    project: ([lng, lat]) => project3([lng, lat, 0]),
    unproject([sx, sy]) {
      const {f, D, p, b, kx} = geometry();
      const X = (sx - width / 2) / f, Yv = (height / 2 - sy) / f;
      const y = (Yv * D) / (Math.cos(p) - Yv * Math.sin(p));
      const x = X * (y * Math.sin(p) + D);
      const e = x * Math.cos(b) + y * Math.sin(b), n = -x * Math.sin(b) + y * Math.cos(b);
      return {lng: cam.center.lng + e / kx, lat: cam.center.lat + n / KY};
    },
  };
  return {map, project: (_, q) => project3(q)};
}

test('wall direction: a rectangle reads its long side, walls 90° apart count as one direction', () => {
  assert.ok(Math.abs(wallAzimuth([rect(120, 40, 20)]) - 20) < 0.01);
  assert.ok(Math.abs(wallAzimuth([rect(40, 120, 20)]) - 20) < 0.01, 'the short side gives the same family');
  assert.ok(Math.abs(wallAzimuth([rect(80, 60, 75)]) - 75) < 0.01);
  assert.equal(wallAzimuth([]), null);
});

test('two-point bearing: corner-on (wall + 45°), the diagonal nearest the current bearing', () => {
  const ring = [rect(120, 40, 20)];
  assert.equal(twoPointBearing(ring, 0), -25);
  assert.equal(twoPointBearing(ring, 50), 65);
  assert.equal(twoPointBearing(ring, 170), 155);
  const b = twoPointBearing(ring, 28);
  const fromWall = ((b - 20) % 90 + 90) % 90;
  assert.equal(fromWall, 45, 'always 45° off the walls: two faces, two vanishing points');
  assert.equal(twoPointBearing([], 33), 33, 'no wall → keep the bearing');
});

test('fit: the building fills the free box — centred, one side touching, the other inside — under the eye camera', () => {
  const {map, project} = fakeMap();
  const podium = rect(110, 70, 20), tower = rect(36, 30, 20, [20, 5]);
  const points = [...podium.flatMap(([a, b]) => [[a, b, 0], [a, b, 22]]), ...tower.flatMap(([a, b]) => [[a, b, 0], [a, b, 85]])];
  const box = {left: 12, top: 70, right: 330, bottom: 470};
  const bearing = twoPointBearing([podium, tower], map.getBearing());
  const target = fitBuilding(map, points, {box, bearing, project, animate: false});
  assert.equal(target.pitch, CAMERA.eye.pitch);
  assert.equal(target.bearing, bearing);
  assert.deepEqual(target.padding, {top: 0, bottom: 0, left: 0, right: 0}, 'principal point at the canvas centre: the horizon stays out of the frame');
  assert.ok(CAMERA.eye.pitch + CAMERA.eye.fov / 2 < 90);
  const b = screenBounds(map, points, project);
  const tw = (box.right - box.left) * 0.94, th = (box.bottom - box.top) * 0.94;
  assert.ok(Math.abs((b.minX + b.maxX) / 2 - (box.left + box.right) / 2) < 1.5, 'centred across');
  assert.ok(Math.abs((b.minY + b.maxY) / 2 - (box.top + box.bottom) / 2) < 1.5, 'centred down');
  const fillW = (b.maxX - b.minX) / tw, fillH = (b.maxY - b.minY) / th;
  assert.ok(Math.abs(Math.max(fillW, fillH) - 1) < 0.01, `fills one side (${fillW.toFixed(3)} × ${fillH.toFixed(3)})`);
  assert.ok(Math.min(fillW, fillH) <= 1.001, 'the other side fits');
});

test('fit: a tiny building stops at the zoom limit and stays centred; the start camera animates to the target', () => {
  const {map, project} = fakeMap({width: 1200, height: 800});
  const kiosk = rect(4, 4, 0);
  const points = kiosk.flatMap(([a, b]) => [[a, b, 0], [a, b, 3]]);
  const box = {left: 24, top: 80, right: 1120, bottom: 700};
  const before = map.getZoom();
  const target = fitBuilding(map, points, {box, bearing: 45, project, maxZoom: 19.5});
  assert.equal(target.zoom, 19.5);
  assert.equal(map.moves.length, 1, 'one animation');
  assert.equal(map.moves[0][0], 'fly', 'a big zoom change flies');
  assert.notEqual(before, target.zoom);
  const b = screenBounds(map, points, project);
  assert.ok(Math.abs((b.minX + b.maxX) / 2 - (box.left + box.right) / 2) < 1.5);
});

test('two-point bearing avoids a drawn building standing between the camera and the venue', () => {
  const venue = [rect(60, 60, 0)];
  // A 40 m component just south-west of the venue: looking from the south-west (bearing 45) it hides the venue.
  const block = {ring: rect(50, 50, 0, [-55, -55]), height: 40};
  assert.ok(occlusionScore(venue, [block], 45) > 0, 'in front when the camera looks north-east');
  assert.equal(occlusionScore(venue, [block], -135), 0, 'behind when the camera looks south-west');
  assert.equal(twoPointBearing(venue, 45), 45, 'no obstacle: nearest diagonal');
  const b = twoPointBearing(venue, 45, [block]);
  assert.notEqual(b, 45, 'with the obstacle the camera moves to another corner');
  assert.equal(occlusionScore(venue, [block], b), 0);
  // A low building far in front stays under the sight line and does not count.
  assert.equal(occlusionScore(venue, [{ring: rect(30, 30, 0, [-160, -160]), height: 6}], 45), 0);
});

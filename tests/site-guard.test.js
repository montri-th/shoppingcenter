// D42 (owner 2026-11-08 08:22): a venue's research site never draws another venue's building (js/site-guard.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siteExclusions, otherVenueOf, familyOf, isOtherVenue, GUARD_REACH_M} from '../js/site-guard.js';

const LAT = 13.73, LON = 100.57;
const kx = 111320 * Math.cos((LAT * Math.PI) / 180), ky = 110574;
const at = (x, y) => [LON + x / kx, LAT + y / ky];
const rect = (x0, y0, x1, y1) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)];
const part = (x0, y0, x1, y1) => ({outer: rect(x0, y0, x1, y1), holes: []});
const venue = (id, x, y, more = {}) => ({id, name: id, lon: at(x, y)[0], lat: at(x, y)[1], countable: true, group: 'mall', ...more});
const footprint = (ids, x0, y0, x1, y1) => ({type: 'Feature', properties: {geometry_role: 'host_building_footprint_not_shop_unit', venue_ids: ids},
  geometry: {type: 'Polygon', coordinates: [rect(x0, y0, x1, y1)]}});

test('Emporium and EmQuartier: the building of another venue\'s validated footprint is not a site building, even with its pin outside', () => {
  const emporium = venue('EMP', 0, 0);
  const emq = venue('EMQ', 160, 330);                  // its pin 19 m outside its own building
  const hosts = [footprint(['EMP'], -60, -60, 60, 60), footprint(['EMQ'], 60, 200, 200, 330 - 19)];
  const ex = siteExclusions(emporium, [emporium, emq], hosts);
  assert.deepEqual(ex.pins.map(p => p.id), ['EMQ']);
  assert.deepEqual(ex.hosts.map(h => h.ids), [['EMQ']], 'never the venue\'s own footprint');
  assert.deepEqual(otherVenueOf(part(60, 200, 200, 311), ex), {id: 'EMQ', why: 'host'});
  assert.deepEqual(otherVenueOf(part(70, 210, 190, 300), ex), {id: 'EMQ', why: 'host'}, 'a smaller outline of the same building');
  assert.equal(otherVenueOf(part(-30, 80, 0, 120), ex), null, 'a small building between them holds neither');
});

test('a site building that holds another venue\'s pin, or has it within 3 m of its edge, is that venue\'s', () => {
  const central = venue('CEV', 0, 0);
  const lotus = venue('LOT', 0, -300, {group: 'hoststore'});
  const ex = siteExclusions(central, [central, lotus]);
  assert.deepEqual(otherVenueOf(part(-80, -380, 80, -220), ex), {id: 'LOT', why: 'pin'});
  assert.deepEqual(otherVenueOf(part(2.5, -320, 40, -280), ex), {id: 'LOT', why: 'pin'}, 'within 3 m of the edge: the page\'s own pin rule');
  assert.equal(otherVenueOf(part(5, -320, 40, -280), ex), null, '5 m away: not its building');
  assert.equal(otherVenueOf(part(-50, -50, 50, 50), null), null, 'nothing to exclude');
});

test('family, duplicates, same names and uncounted records are not other venues; far venues are not considered', () => {
  const v = venue('V', 0, 0, {parentId: 'P', children: ['K']});
  const rows = [v, venue('P', 10, 0, {children: ['V', 'S']}), venue('K', 20, 0, {countable: false, countHold: 'component', parentId: 'V'}),
    venue('S', 30, 0, {parentId: 'P'}), venue('C', 40, 0, {parentId: 'V', countable: false, countHold: 'component'}),
    venue('D', 50, 0, {countHold: 'duplicate'}), venue('N', 60, 0, {name: 'V'}), venue('U', 70, 0, {countable: false}),
    venue('Z', 80, 0, {countable: false, countHold: 'component', parentId: 'OTHER'}), venue('FAR', GUARD_REACH_M + 50, 0)];
  assert.deepEqual([...familyOf(v, rows)].sort(), ['C', 'K', 'P', 'S', 'V']);
  const fam = familyOf(v, rows);
  assert.deepEqual(rows.filter(w => isOtherVenue(v, w, fam)).map(w => w.id), ['Z', 'FAR']);
  assert.deepEqual(siteExclusions(v, rows).pins.map(p => p.id), ['Z'], 'a component of another family; FAR is beyond the reach');
  assert.equal(siteExclusions(venue('LONE', 0, 0), [venue('LONE', 0, 0)]), null);
});

test('the corrected sites of 8 Nov 2026: no site point of data/venue-sites.json stands in another venue\'s validated footprint', () => {
  const rows = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url), 'utf8')).rows;
  const byId = new Map(rows.map(r => [r.id, r]));
  const hosts = JSON.parse(readFileSync(new URL('../data/venue-buildings.geojson', import.meta.url), 'utf8')).features;
  const sites = JSON.parse(readFileSync(new URL('../data/venue-sites.json', import.meta.url), 'utf8')).sites;
  const hits = [];
  for (const [id, site] of Object.entries(sites)) {
    const ex = siteExclusions(byId.get(id), rows, hosts);
    if (!ex?.hosts?.length) continue;
    // A one-metre box round each interior point stands for its building here; the page checks the real outlines.
    for (const [lon, lat] of site.points) {
      const box = {outer: [[lon - 1 / kx, lat - 1 / ky], [lon + 1 / kx, lat - 1 / ky], [lon + 1 / kx, lat + 1 / ky], [lon - 1 / kx, lat + 1 / ky], [lon - 1 / kx, lat - 1 / ky]], holes: []};
      const why = otherVenueOf(box, {pins: [], hosts: ex.hosts});
      if (why) hits.push(`${id} ${lon},${lat} → ${why.id}`);
    }
  }
  assert.deepEqual(hits, [], 'Emporium held a point in EmQuartier\'s footprint before 8 Nov 2026');
  assert.equal(sites['SC-000288'], undefined, 'Emporium is one building again (single_building)');
});

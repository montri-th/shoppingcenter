// Every dataset of the published shop list has a Thai name on screen (js/evidence.js STORE_DATASETS):
// the provenance line under the list and the item rows never show a raw registry id such as research.TH.beauty.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STORE_DATASETS, storeDataset} from '../js/evidence.js';

const report = JSON.parse(readFileSync(new URL('../data/tenants/build-report.json', import.meta.url), 'utf8'));

test('every published shop-list dataset has an on-screen name', () => {
  const datasets = Object.keys(report.datasets);
  assert.ok(datasets.length >= 21);
  const missing = datasets.filter(id => !STORE_DATASETS[id]);
  assert.deepEqual(missing, []);
  for (const id of datasets) assert.doesNotMatch(storeDataset(id), /research\.|^[a-z_.]+$/i, id);
});

/**
 * Chart models — pure, no DOM. Areas are the districts of the province being read, or the
 * provinces when the country is read; both carry {id, name, label, count, density?, groups}.
 * Ranking order: density (districts) or count (provinces), then count, then id — the same
 * order as the first Aha, so the chart and the panel never disagree.
 */
import {GROUPS} from './model.js';

const byDensity = (a, b) => b.density - a.density || b.count - a.count || String(a.id).localeCompare(String(b.id));
const byCount = (a, b) => b.count - a.count || String(a.id).localeCompare(String(b.id));

/** Ranking of the scoped areas; measured zeros stay in the list (after every nonzero area). */
export function rankAreas(areas, {kind = 'district'} = {}) {
  return [...(areas || [])].sort(kind === 'district' ? byDensity : byCount);
}

/** Province summaries with group counts, from rows (located, assigned). */
export function provinceAreas(rows, provinceModel) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.provinceCode || !r.located) continue;
    const g = groups.get(r.provinceCode) || {};
    g[r.group] = (g[r.group] || 0) + 1;
    groups.set(r.provinceCode, g);
  }
  return (provinceModel?.provinces || []).map(p => ({id: p.code, name: p.name, label: p.label, count: p.count, fill: p.fill, state: p.state, groups: groups.get(p.code) || {}}));
}

/**
 * Area × group matrix of venue counts. Shows the top `areaLimit` areas of the ranking and the
 * groups present among them (legend order). Every cell carries its count, zeros included.
 */
export function groupMatrix(ranked, {areaLimit = 12} = {}) {
  const areas = ranked.filter(a => a.count > 0).slice(0, areaLimit);
  const present = GROUPS.filter(g => areas.some(a => (a.groups?.[g.id] || 0) > 0));
  const cells = areas.flatMap(a => present.map(g => ({areaId: a.id, groupId: g.id, count: a.groups?.[g.id] || 0})));
  return {areas, groups: present, cells, totalAreas: ranked.filter(a => a.count > 0).length, max: Math.max(0, ...cells.map(c => c.count))};
}

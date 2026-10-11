#!/usr/bin/env node
/**
 * 管轄比對：山屋座標落在哪座國家公園範圍內，與 Notion 登錄的管理單位對照。
 * 只列清單、不改資料；歸屬確認後由人回 Notion 修正（單一真相來源）。
 * 有 data/huts.internal.json 時優先用內部精確座標，否則用公開降階座標（0.01° 網格可能在邊界附近誤判）。
 * 範圍圖：data/parks.geojson（來源與版次見各 feature 的 plan、announced）。
 */
import { readFile, access } from 'node:fs/promises';
const J = async (f) => JSON.parse(await readFile(`data/${f}`, 'utf8'));
const internal = await access('data/huts.internal.json').then(() => true, () => false);
const huts = await J(internal ? 'huts.internal.json' : 'huts.json');
const parks = await J('parks.geojson');

const inRing = (x, y, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x1, y1] = r[i], [x2, y2] = r[j];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
};
const inGeom = (x, y, g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
  .some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));
const parkOf = (h) => parks.features.find((f) => inGeom(h.lon, h.lat, f.geometry))?.properties ?? null;

const rows = { mismatch: [], unknown: [], outside: [], nocoord: [] };
let ok = 0;
for (const h of huts) {
  const names = h.agencies.map((a) => a.name);
  if (h.lon == null) { rows.nocoord.push(`${h.id} ${h.name}`); continue; }
  const p = parkOf(h);
  const npAgency = names.find((n) => n.includes('國家公園管理處'));
  const tag = `${h.id} ${h.name}（${h.type}${h.coord_rule !== '完整公開' ? '・降階座標' : ''}）`;
  if (names.includes('管轄不明')) rows.unknown.push(`${tag} → ${p ? `落在${p.name}` : '不在三座國家公園內'}`);
  else if (p && !names.includes(p.agency)) rows.mismatch.push(`${tag} 登錄：${names.join('、')}；座標落在${p.name}`);
  else if (!p && npAgency) rows.outside.push(`${tag} 登錄：${npAgency}；座標不在範圍內`);
  else ok++;
}

console.log(`座標來源：${internal ? '內部精確' : '公開降階'}｜範圍圖：${parks.features.map((f) => `${f.properties.name}（${f.properties.plan}）`).join('、')}\n`);
const section = (title, list) => list.length && console.log(`## ${title}（${list.length}）\n${list.map((s) => `- ${s}`).join('\n')}\n`);
section('管轄不明', rows.unknown);
section('登錄與範圍不符', rows.mismatch);
section('登錄國家公園但座標在範圍外', rows.outside);
section('無座標，無法比對', rows.nocoord);
console.log(`一致 ${ok} 筆`);

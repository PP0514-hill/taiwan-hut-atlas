#!/usr/bin/env node
/** 資料完整性檢查：build 前執行，任何一項失敗即中止。 */
import { readFile } from 'node:fs/promises';
const J = async (f) => JSON.parse(await readFile(`data/${f}`, 'utf8'));
const huts = await J('huts.json'), events = await J('events.json'), sources = await J('sources.json');
const errs = [];
const dup = (arr, k) => arr.map((x) => x[k]).filter((v, i, a) => v && a.indexOf(v) !== i);
if (dup(huts, 'id').length) errs.push(`TWH ID 重複：${dup(huts, 'id')}`);
if (dup(huts, 'slug').length) errs.push(`slug 重複：${dup(huts, 'slug')}`);
for (const h of huts) {
  if (!/^TWH-\d{4}$/.test(h.id)) errs.push(`${h.id} ID 格式錯誤`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(h.slug ?? '')) errs.push(`${h.id} slug 格式錯誤：${h.slug}`);
  if (!h.agencies.length) errs.push(`${h.id} 無管理單位`);
  if (!h.sources.length) errs.push(`${h.id} 無來源`);
  if (h.lon != null && (h.lon < 119 || h.lon > 123 || h.lat < 21 || h.lat > 26)) errs.push(`${h.id} 座標超出台灣範圍`);
  if (h.coord_rule !== '完整公開' && h.lon != null && (String(h.lon).split('.')[1] ?? '').length > 2) errs.push(`${h.id} 降階座標未取整`);
}
const ids = new Set(huts.map((h) => h.id));
for (const e of events) if (!ids.has(e.hut)) errs.push(`事件孤兒：${e.title}`);
for (const s of sources) for (const id of s.huts) if (!ids.has(id)) errs.push(`來源孤兒：${s.id}`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(`OK huts ${huts.length} events ${events.length} sources ${sources.length}`);

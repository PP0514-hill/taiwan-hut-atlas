#!/usr/bin/env node
/**
 * 將運補難度指數回填 Notion 山屋庫欄位「運補難度指數 Logistics Index」
 * 讀 data/huts.internal.json（fetch-notion.mjs 產出），只更新值有變動者。
 * 用法：NOTION_TOKEN=... node scripts/backfill-logistics.mjs [--dry]
 */
import { readFile } from 'node:fs/promises';
import { logisticsIndex } from './lib/logistics-index.mjs';

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) { console.error('缺 NOTION_TOKEN'); process.exit(1); }
const dry = process.argv.includes('--dry');
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' };
const huts = JSON.parse(await readFile('data/huts.internal.json', 'utf8'));
let n = 0;
for (const h of huts) {
  const { index } = logisticsIndex(h.elev_m, h.logistics);
  const body = { properties: { '運補難度指數 Logistics Index': { number: index } } };
  console.log(`${h.id} ${h.name} → ${index ?? '不評分'}${dry ? '（dry）' : ''}`);
  if (dry) continue;
  const res = await fetch(`https://api.notion.com/v1/pages/${h.notion_id}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) console.error(`  失敗 ${res.status} ${await res.text()}`); else n++;
  await new Promise((r) => setTimeout(r, 350)); // Notion 限速約 3 req/s
}
console.log(`完成 ${n}/${huts.length}`);

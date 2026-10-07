#!/usr/bin/env node
/**
 * 從 Notion 六庫拉資料 → data/*.json、data/*.geojson
 *
 * 用法：NOTION_TOKEN=... node scripts/fetch-notion.mjs
 * 依賴：Node 20+（內建 fetch）。不需第三方套件。
 * Notion API 版本 2025-09-03（data_sources 端點）。
 *
 * 輸出（公開可提交）：
 *   data/huts.json            公開版（座標已依降階規則處理）
 *   data/huts.public.geojson  公開版 GeoJSON
 *   data/events.json / sources.json / agencies.json / trails.json / meta.json
 * 輸出（內部，.gitignore）：
 *   data/huts.internal.json / data/huts.internal.geojson  完整座標
 *
 * 覆核狀態不在此過濾——所有筆都抓，由網站 build 依 PUBLISH_MODE 決定輸出哪些。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { logisticsIndex, publicCoord, LOGISTICS_INDEX_VERSION } from './lib/logistics-index.mjs';

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) { console.error('缺 NOTION_TOKEN'); process.exit(1); }
const DS = {
  huts: process.env.NOTION_DS_HUTS ?? '3922580d-8bb6-4a2e-b42c-1e0cc0010b07',
  events: process.env.NOTION_DS_EVENTS ?? 'ae37d509-a3d8-4488-bec6-a707a1f57ab5',
  sources: process.env.NOTION_DS_SOURCES ?? 'a384b25f-9a95-4e16-9f3d-d52a5dbba902',
  agencies: process.env.NOTION_DS_AGENCIES ?? '88131947-e1ee-4b24-bc75-1b81f8dbe6bf',
  trails: process.env.NOTION_DS_TRAILS ?? 'c68bfe5f-ea67-4da7-b968-9162cb35faa7',
};
const API = 'https://api.notion.com/v1';
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' };

async function queryAll(dsId) {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(`${API}/data_sources/${dsId}/query`, {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    if (!res.ok) throw new Error(`${dsId} ${res.status} ${await res.text()}`);
    const j = await res.json();
    rows.push(...j.results);
    cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// ---- 屬性讀取 ----
const txt = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join('') || null;
const num = (p) => (p?.number ?? null);
const sel = (p) => p?.select?.name ?? null;
const msel = (p) => (p?.multi_select ?? []).map((o) => o.name);
const rel = (p) => (p?.relation ?? []).map((r) => r.id);
const date = (p) => p?.date?.start ?? null;
const url = (p) => p?.url ?? null;
const P = (page, name) => page.properties[name];

function mapAgency(pg) {
  return { id: pg.id, name: txt(P(pg, '名稱 Name')), en: txt(P(pg, '英文名 EN Name')), type: sel(P(pg, '類型 Type')),
    parent: txt(P(pg, '上級機關 Parent Org')), website: url(P(pg, '官網 Website')), notes: txt(P(pg, '備註 Notes')) };
}
function mapTrail(pg) {
  return { id: pg.id, name: txt(P(pg, '名稱 Name')), en: txt(P(pg, '英文名 EN Name')), system: sel(P(pg, '系統 System')),
    code: txt(P(pg, '林保署步道代碼 Trail Code')), gis: txt(P(pg, 'GIS 來源 GIS Source')), notes: txt(P(pg, '備註 Notes')) };
}
function mapHut(pg, AG, TR) {
  const elev = num(P(pg, '海拔 Elev m'));
  const modes = msel(P(pg, '運補方式 Logistics'));
  const li = logisticsIndex(elev, modes);
  return {
    id: txt(P(pg, 'TWH ID')), notion_id: pg.id, cand_id: txt(P(pg, '候選編號 Cand ID')), slug: txt(P(pg, 'Slug')),
    name: txt(P(pg, '名稱 Name')), name_en: txt(P(pg, '英文名 EN Name')),
    type: sel(P(pg, '類型 Type')), status: sel(P(pg, '現況 Status')), region: sel(P(pg, '區域 Region')),
    agencies: rel(P(pg, '管理單位 Agency')).map((id) => AG[id]).filter(Boolean).map((a) => ({ id: a.id, name: a.name, en: a.en })),
    trails: rel(P(pg, '步道 Trails')).map((id) => TR[id]).filter(Boolean).map((t) => ({ id: t.id, name: t.name, en: t.en })),
    beds: num(P(pg, '核定床位 Beds')), elev_m: elev,
    lon: num(P(pg, '經度 Lon WGS84')), lat: num(P(pg, '緯度 Lat WGS84')),
    coord_precision: sel(P(pg, '座標精度 Coord Precision')), coord_rule: sel(P(pg, '公開座標降階 Public Coord Rule')),
    structure_system: sel(P(pg, '結構系統 Structure System')), materials: msel(P(pg, '主要材料 Materials')),
    structure_notes: txt(P(pg, '構造描述 Structure Notes')),
    logistics: modes, logistics_index: li.index, logistics_index_estimated: li.estimated,
    size_class: sel(P(pg, '量體分級 Size Class')), floor_area_m2: num(P(pg, '樓地板面積 Floor Area m2')),
    permit_check: sel(P(pg, '建照查證狀態 Permit Check')), building_permit: txt(P(pg, '建照號碼 Building Permit')),
    grade: sel(P(pg, '查證等級 Grade')), review: sel(P(pg, '覆核狀態 Review')),
    notes: txt(P(pg, '備註與矛盾 Notes')), aliases: txt(P(pg, '別名 Aliases')), jp_name: txt(P(pg, '日文原名 JP Name')),
    events: [], sources: [],
  };
}

const geo = (huts, lonKey, latKey) => ({
  type: 'FeatureCollection',
  features: huts.filter((h) => h[lonKey] != null).map((h) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [h[lonKey], h[latKey]] },
    properties: Object.fromEntries(['id', 'slug', 'name', 'name_en', 'type', 'status', 'region', 'beds', 'elev_m', 'logistics_index', 'grade', 'first_built_year', 'coord_precision', 'coord_rule', 'review'].map((k) => [k, h[k]])),
  })),
});

async function main() {
  const [agP, trP, huP, evP, srP] = await Promise.all([queryAll(DS.agencies), queryAll(DS.trails), queryAll(DS.huts), queryAll(DS.events), queryAll(DS.sources)]);
  const agencies = agP.map(mapAgency), trails = trP.map(mapTrail);
  const AG = Object.fromEntries(agencies.map((a) => [a.id, a])), TR = Object.fromEntries(trails.map((t) => [t.id, t]));
  const huts = huP.map((pg) => mapHut(pg, AG, TR)).sort((a, b) => a.id.localeCompare(b.id));
  const byNotion = Object.fromEntries(huts.map((h) => [h.notion_id, h]));

  const events = evP.map((pg) => {
    const hutId = rel(P(pg, '山屋 Hut'))[0];
    return { hut: byNotion[hutId]?.id ?? null, title: txt(P(pg, '事件 Event')), type: sel(P(pg, '事件類型 Type')), date: date(P(pg, '日期 Date')),
      precision: sel(P(pg, '日期精度 Date Precision')), year_text: txt(P(pg, '年份文字 Year Text')), grade: sel(P(pg, '來源等級 Source Grade')),
      description: txt(P(pg, '說明 Description')), cost_twd: num(P(pg, '經費 Cost TWD')), review: sel(P(pg, '覆核狀態 Review')) };
  }).filter((e) => e.hut).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const sources = srP.map((pg, i) => ({
    id: `SRC-${String(i + 1).padStart(3, '0')}`, notion_id: pg.id, title: txt(P(pg, '標題 Title')), url: url(P(pg, '網址 URL')), type: sel(P(pg, '來源類型 Type')),
    reliability: sel(P(pg, '可信度 Reliability')), publisher: txt(P(pg, '發布機關或作者 Publisher')), license: txt(P(pg, '授權 License')),
    retrieved: date(P(pg, '擷取日 Retrieved')), huts: rel(P(pg, '山屋 Huts')).map((id) => byNotion[id]?.id).filter(Boolean), notes: txt(P(pg, '備註 Notes')) }));

  for (const e of events) byNotion[huts.find((h) => h.id === e.hut).notion_id].events.push(e);
  for (const s of sources) for (const id of s.huts) huts.find((h) => h.id === id).sources.push(s.id);
  for (const h of huts) {
    const built = h.events.filter((e) => e.date && ['興建', '重建'].includes(e.type)).map((e) => e.date.slice(0, 4));
    h.first_built_year = built.length ? built.sort()[0] : null;
    const pre = h.events.filter((e) => e.date && e.type === '前身').map((e) => e.date.slice(0, 4));
    h.predecessor_year = pre.length ? pre.sort()[0] : null;
  }

  // 內部版（完整座標）與公開版（降階）
  const internal = huts;
  const pub = huts.map((h) => { const [lon, lat] = publicCoord(h.lon, h.lat, h.coord_rule); return { ...h, lon, lat }; });

  await mkdir('data', { recursive: true });
  const w = (f, o) => writeFile(`data/${f}`, JSON.stringify(o, null, 1));
  await Promise.all([
    w('huts.internal.json', internal), w('huts.internal.geojson', geo(internal, 'lon', 'lat')),
    w('huts.json', pub), w('huts.public.geojson', geo(pub, 'lon', 'lat')),
    w('events.json', events), w('sources.json', sources), w('agencies.json', agencies), w('trails.json', trails),
    w('meta.json', { generated: new Date().toISOString(), source: 'notion-api', logistics_index_version: LOGISTICS_INDEX_VERSION,
      counts: { huts: huts.length, events: events.length, sources: sources.length, agencies: agencies.length, trails: trails.length },
      review: Object.fromEntries(['已覆核', 'AI 初稿待覆核', '退回修正'].map((k) => [k, huts.filter((h) => h.review === k).length])) }),
  ]);
  console.log(`huts ${huts.length} events ${events.length} sources ${sources.length} agencies ${agencies.length} trails ${trails.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

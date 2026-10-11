#!/usr/bin/env node
/**
 * 登山路線與接駁道路：產生 data/routes.official.geojson 與 data/routes.osm.geojson。
 * 手動執行（npm run build:routes），不進 build；結果是快照，路線現況以各管理單位公告為準。
 *
 * 來源優先順序：官方開放資料 → OSM 既有路線關聯 → 沿 OSM 步道路網串接山屋。
 * - 官方（政府資料開放授權第 1 版）：雪霸國家公園登山步道路線圖 SHP、林保署自然步道軌跡圖 KML
 * - OSM（ODbL 1.0）：路線關聯、串接路線、登山口、接駁道路。ODbL 要求衍生資料庫同樣以 ODbL 釋出，
 *   所以 OSM 衍生的一切放在 routes.osm.geojson，不與官方資料混檔。
 * 只畫步道庫裡的具名公開路線；只通往獵寮、工寮的小徑不畫（座標降階規則）。
 * OSM 資料讀本機的 Geofabrik 台灣全島檔（.cache/osm/taiwan-latest.osm.pbf，需 osmium-tool）：
 *   curl -L -o .cache/osm/taiwan-latest.osm.pbf https://download.geofabrik.de/asia/taiwan-latest.osm.pbf
 *   brew install osmium-tool
 * 公開 Overpass 常過載，2026-10 改為本機處理；官方圖資下載快取在 .cache/routes/。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { unzipSync } from 'fflate';
import mapshaper from 'mapshaper';

const CACHE = '.cache/routes';
const UA = 'taiwan-hut-atlas/0.1 (+https://github.com/PP0514-hill/taiwan-hut-atlas)';
const OGDL = '政府資料開放授權條款第 1 版';
const ODBL = 'ODbL 1.0 © OpenStreetMap contributors';

const SHEIPA_URL = 'https://www.tgos.tw/MDE/VirtualDir_TC/Product/28d9d837-10b5-45b6-8ce0-106633ccee10/mapdata201808290931.zip';
const FANC = (id, rid) => `https://data.moa.gov.tw/OpenData/GetOpenDataFile.aspx?id=${id}&FileType=DataMore&RID=${rid}`;

// 步道庫名稱 → 來源。via：串接路線的途經點（山屋 TWH ID 或 OSM 登山口／地名的經緯度，依行進順序）
const P = {
  思源登山口: [121.35254, 24.39139], // OSM node 3507258198
  東埔溫泉: [120.93144, 23.56318], // OSM node 5436561722
  向陽管制站: [120.98576, 23.24377], // OSM node 2659895199
  山風: [121.2305, 23.32736], // OSM node 1710904624
  關山登山口: [120.9188, 23.2579], // OSM node 6011714285
  屏風山登山口: [121.31781, 24.17968], // OSM node 2297213055
};
const PLAN = {
  聖稜線: { shp: '聖陵線' },
  '雪劍線／大小劍': { shp: '雪劍線' },
  志佳陽線: { shp: '志佳陽線' },
  '雪山西稜／翠池線': { shp: '雪山西稜' },
  雪山主東線: { shp: '雪東線' },
  武陵四秀: { shp: '武陵四秀' },
  大霸尖山國家步道: { shp: '大霸線' },
  能高越嶺國家步道西段: { kml: FANC(826, 83419), note: '林保署 065（2026-06-18 版）' },
  能高越嶺國家步道東段: { kml: FANC(827, 2139), note: '林保署 066' },
  北大武山國家步道: { kml: FANC(490, 2089), note: '林保署 119' },
  嘉明湖國家步道: { kml: FANC(503, 2102), note: '林保署 139' },
  玉山群峰線: { rel: [13678202, 18229953] }, // 玉山步道、玉山北峰步道
  八通關越嶺道西段: { rel: [13678191], maxLon: 121.057 }, // 關聯含整條古道，切到大水窟以西，東段另由串接路線處理
  鹿林山步道: { rel: [13678204] },
  奇萊主北線: { rel: [18232290] },
  奇萊東稜: { rel: [18232299] },
  畢羊縱走: { rel: [7424724] },
  馬博拉斯橫斷: { rel: [18300500] },
  '南湖大山線／北一段': { via: [P.思源登山口, 'TWH-0039', 'TWH-0040', 'TWH-0041'], note: '只畫主線至南湖山屋；北一段經降階點位，不畫' },
  南二段: { via: [P.東埔溫泉, 'TWH-0004', 'TWH-0006', 'TWH-0007', 'TWH-0008', 'TWH-0009', 'TWH-0010', P.向陽管制站] },
  八通關越嶺道東段: { via: ['TWH-0007', 'TWH-0016', 'TWH-0015', 'TWH-0014', P.山風] },
  '南橫三山／關山線': { via: [P.關山登山口, 'TWH-0017'] },
  屏風山線: { via: [P.屏風山登山口, 'TWH-0043'] },
  '南橫公路（台 20 線）': { skip: '公路本身，底圖已有' },
};

const MOTOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
// 主要道路＝省道或縣道。OSM 台灣的省道編號有「台20」也有只寫「20」的，縣道為三碼數字
const MAIN = (t) => (t.ref ?? '').split(';').some((r) => /^(台)?\d{1,3}[甲乙丙]?(線)?$/.test(r.trim())) || ['motorway', 'trunk', 'primary', 'secondary'].includes(t.highway);

// ---------- 工具 ----------
const R = 6371008.8, rad = Math.PI / 180;
const dist = (a, b) => {
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const bboxOf = (pts, pad) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...ys) - pad, Math.min(...xs) - pad, Math.max(...ys) + pad, Math.max(...xs) + pad].map((v) => +v.toFixed(3));
};

async function cached(key, fetcher) {
  await mkdir(CACHE, { recursive: true });
  const f = `${CACHE}/${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
  if (existsSync(f)) return readFile(f);
  const buf = await fetcher();
  await writeFile(f, buf);
  return buf;
}
const download = (url) => cached(url, async () => {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
});
// ---------- 本機 OSM ----------
// 全島檔 → 裁山區範圍 → 只留道路、步道、登山路線關聯、登山口 → 帶座標的 OPL 純文字
const PBF = '.cache/osm/taiwan-latest.osm.pbf', OPL = '.cache/osm/routes.opl';
const HW = ['path', 'track', 'footway', 'bridleway', 'steps', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'];
function prepareOSM() {
  if (existsSync(OPL)) return;
  if (!existsSync(PBF)) throw new Error(`找不到 ${PBF}，請先依檔頭說明下載`);
  const run = (...a) => execFileSync('osmium', a, { stdio: 'inherit' });
  run('extract', '-b', '120.6,22.3,121.8,24.75', PBF, '-o', '.cache/osm/mtn.pbf', '--overwrite');
  run('tags-filter', '.cache/osm/mtn.pbf', `w/highway=${HW.join(',')}`, 'r/route=hiking,foot', 'n/highway=trailhead', '-o', '.cache/osm/filtered.pbf', '--overwrite');
  run('add-locations-to-ways', '.cache/osm/filtered.pbf', '-f', 'opl', '-o', OPL, '--overwrite');
}
const unesc = (v) => v.replace(/%([0-9a-fA-F]+)%/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const tagsOf = (t) => Object.fromEntries(t ? t.split(',').map((kv) => { const i = kv.indexOf('='); return [unesc(kv.slice(0, i)), unesc(kv.slice(i + 1))]; }) : []);
async function loadOSM() {
  prepareOSM();
  const ways = new Map(), rels = new Map(), trailheads = [];
  for await (const line of createInterface({ input: createReadStream(OPL) })) {
    const f = Object.fromEntries(line.split(' ').map((x) => [x[0], x.slice(1)]));
    const id = +line.slice(1, line.indexOf(' '));
    if (line[0] === 'w') {
      const nodes = [], geometry = [];
      for (const n of (f.N ?? '').split(',')) { const m = n.match(/^n(\d+)x([\d.-]+)y([\d.-]+)$/); if (m) { nodes.push(+m[1]); geometry.push({ lon: +m[2], lat: +m[3] }); } }
      if (nodes.length < 2) continue;
      const xs = geometry.map((g) => g.lon), ys = geometry.map((g) => g.lat);
      ways.set(id, { type: 'way', id, tags: tagsOf(f.T), nodes, geometry, bb: [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)] });
    } else if (line[0] === 'r') {
      rels.set(id, { tags: tagsOf(f.T), members: (f.M ?? '').split(',').filter((m) => m[0] === 'w').map((m) => +m.slice(1, m.indexOf('@'))) });
    } else if (line[0] === 'n') {
      const t = tagsOf(f.T); if (t.highway === 'trailhead' && t.name) trailheads.push({ name: t.name, xy: [+f.x, +f.y] });
    }
  }
  console.log(`OSM 本機資料：道路與步道 ${ways.size}、路線關聯 ${rels.size}、登山口 ${trailheads.length}`);
  return { ways, rels, trailheads };
}
const osm = await loadOSM();
const waysIn = (bbox, classes) => [...osm.ways.values()].filter((w) => (!classes || classes.includes(w.tags.highway)) && w.bb[0] <= bbox[2] && w.bb[2] >= bbox[0] && w.bb[1] <= bbox[3] && w.bb[3] >= bbox[1]);

// mapshaper 讀進記憶體裡的檔案，輸出 WGS84 GeoJSON 的線段陣列（MultiLineString 攤平）
async function toLines(files, input) {
  const out = await mapshaper.applyCommands(`-i ${input} encoding=utf8 -proj wgs84 -o out.json format=geojson`, files);
  const fc = JSON.parse(out['out.json']);
  return fc.features.flatMap((f) => !f.geometry ? [] : f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates);
}
// Douglas–Peucker 簡化（容許誤差約 12 m，網頁顯示足夠），再取 5 位小數（約 1 m）
const TOL = 12;
function simplify(l) {
  if (l.length < 3) return l;
  const keep = new Uint8Array(l.length); keep[0] = keep[l.length - 1] = 1;
  const k = Math.cos(l[0][1] * Math.PI / 180) * 111320, m = 110540;
  const seg = (p, a, b) => { const [px, py, ax, ay, bx, by] = [p[0] * k, p[1] * m, a[0] * k, a[1] * m, b[0] * k, b[1] * m]; const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const stack = [[0, l.length - 1]];
  while (stack.length) { const [i, j] = stack.pop(); let md = 0, mi = -1; for (let n = i + 1; n < j; n++) { const d = seg(l[n], l[i], l[j]); if (d > md) { md = d; mi = n; } } if (md > TOL) { keep[mi] = 1; stack.push([i, mi], [mi, j]); } }
  return l.filter((_, i) => keep[i]);
}
const round = (lines) => lines.map((l) => simplify(l).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]));

// ---------- 路網 ----------
// motorOnly：接駁道路只走車行道路與林道；巷弄、服務道路可走但加權，避免繞進聚落（部落聯外道路常被標成 residential）
const ACCESS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'track', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'];
function network(bbox, motorOnly = false) {
  const d = { elements: waysIn(bbox, motorOnly ? ACCESS : null) };
  const nodes = new Map(), adj = new Map();
  const add = (a, b, w, way) => { (adj.get(a) ?? adj.set(a, []).get(a)).push([b, w, way]); };
  for (const w of d.elements) {
    if (w.type !== 'way' || !w.geometry) continue;
    const t = w.tags ?? {};
    w.motor = MOTOR.has(t.highway); w.track = t.highway === 'track'; w.main = MAIN(t);
    w.nodes.forEach((id, i) => nodes.set(id, [w.geometry[i].lon, w.geometry[i].lat]));
    for (let i = 1; i < w.nodes.length; i++) {
      const a = w.nodes[i - 1], b = w.nodes[i], l = dist(nodes.get(a), nodes.get(b));
      add(a, b, l, w); add(b, a, l, w);
    }
  }
  return { nodes, adj };
}
const nearest = (net, pt, ok = () => true) => {
  let best = null, bd = Infinity;
  for (const [id, c] of net.nodes) { if (!ok(id)) continue; const d = dist(pt, c); if (d < bd) { bd = d; best = id; } }
  return [best, bd];
};
// Dijkstra；cost(way) 回傳 Infinity 表示不可走；done(node) 為終點判斷
function dijkstra(net, src, done, cost) {
  const D = new Map([[src, 0]]), prev = new Map(), seen = new Set();
  const heap = [[0, src]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (seen.has(u)) continue; seen.add(u);
    if (done(u, prev.get(u)?.[1])) {
      const path = [u], ways = [];
      for (let v = u; prev.has(v); v = prev.get(v)[0]) { path.push(prev.get(v)[0]); ways.push(prev.get(v)[1]); }
      return { path: path.reverse(), ways: ways.reverse(), length: d };
    }
    for (const [v, l, w] of net.adj.get(u) ?? []) {
      const c = cost(w); if (c === Infinity) continue;
      const nd = d + l * c;
      if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); prev.set(v, [u, w]); push([nd, v]); }
    }
  }
  return null;
}
const wayLabel = (ways) => {
  const seq = [];
  for (const w of ways) { const t = w.tags ?? {}; const n = t.ref ? `${t.ref}${t.name ? ` ${t.name}` : ''}` : t.name; if (n && seq.at(-1) !== n) seq.push(n); }
  return seq;
};

// ---------- 主流程 ----------
const trails = JSON.parse(await readFile('data/trails.json', 'utf8'));
const huts = JSON.parse(await readFile('data/huts.json', 'utf8'));
const hutXY = Object.fromEntries(huts.filter((h) => h.lon != null).map((h) => [h.id, [h.lon, h.lat]]));
const official = [], osmOut = [];
const report = [];

// 官方來源
const sheipaZip = unzipSync(new Uint8Array(await download(SHEIPA_URL)));
const big5 = new TextDecoder('big5');
const sheipa = {};
for (const [raw, data] of Object.entries(sheipaZip)) {
  const name = big5.decode(Uint8Array.from(raw, (c) => c.charCodeAt(0) & 0xff)); // fflate 以 latin1 讀檔名
  const m = name.match(/^(.+)\.(shp|shx|dbf|prj|cpg)$/i); if (!m) continue;
  (sheipa[m[1]] ??= {})[`layer.${m[2].toLowerCase()}`] = Buffer.from(data);
}

for (const t of trails) {
  const plan = PLAN[t.name];
  if (!plan) { report.push(`未設定來源：${t.name}`); continue; }
  if (plan.skip) { report.push(`略過：${t.name}（${plan.skip}）`); continue; }
  const props = { trail: t.name, trail_en: t.en, trail_id: t.id, system: t.system };
  let lines, src;
  if (plan.shp) {
    lines = await toLines(sheipa[plan.shp], 'layer.shp');
    src = { source: '雪霸國家公園登山步道路線圖（國家公園署 TGOS）', source_layer: plan.shp, license: OGDL };
    official.push({ type: 'Feature', properties: { ...props, kind: 'route', ...src }, geometry: { type: 'MultiLineString', coordinates: round(lines) } });
  } else if (plan.kml) {
    const z = unzipSync(new Uint8Array(await download(plan.kml)));
    const kml = Object.entries(z).find(([n]) => n.toLowerCase().endsWith('.kml'))[1];
    lines = await toLines({ 'doc.kml': Buffer.from(kml) }, 'doc.kml');
    src = { source: `林業及自然保育署自然步道軌跡圖（${plan.note}）`, license: OGDL };
    official.push({ type: 'Feature', properties: { ...props, kind: 'route', ...src }, geometry: { type: 'MultiLineString', coordinates: round(lines) } });
  } else if (plan.rel) {
    const missing = plan.rel.filter((r) => !osm.rels.has(r));
    if (missing.length) { report.push(`OSM 找不到路線關聯：${t.name} r${missing.join('、r')}`); continue; }
    lines = plan.rel.flatMap((r) => osm.rels.get(r).members).map((id) => osm.ways.get(id)).filter(Boolean).map((w) => w.geometry.map((g) => [g.lon, g.lat]));
    if (plan.maxLon) lines = lines.flatMap((l) => { const out = [[]]; for (const p of l) p[0] <= plan.maxLon ? out.at(-1).push(p) : out.at(-1).length && out.push([]); return out.filter((x) => x.length > 1); });
    src = { source: `OpenStreetMap 路線關聯 ${plan.rel.map((r) => `r${r}`).join('、')}`, license: ODBL };
    osmOut.push({ type: 'Feature', properties: { ...props, kind: 'route', ...src }, geometry: { type: 'MultiLineString', coordinates: round(lines) } });
  } else if (plan.via) {
    const pts = plan.via.map((v) => (typeof v === 'string' ? hutXY[v] : v));
    if (pts.some((p) => !p)) { report.push(`缺座標：${t.name}`); continue; }
    const net = network(bboxOf(pts, 0.03));
    const line = [];
    let ok = true;
    for (let i = 1; i < pts.length; i++) {
      const [a, da] = nearest(net, pts[i - 1]), [b, db] = nearest(net, pts[i]);
      if (da > 600 || db > 600) report.push(`  ${t.name}：途經點離 OSM 路網 ${Math.round(Math.max(da, db))} m，該段可信度低`);
      const r = dijkstra(net, a, (u) => u === b, () => 1);
      if (!r) { report.push(`串接失敗：${t.name} 第 ${i} 段`); ok = false; break; }
      line.push(...r.path.map((id) => net.nodes.get(id)).slice(line.length ? 1 : 0));
    }
    if (!ok) continue;
    lines = [line];
    src = { source: 'OpenStreetMap 步道路網串接（本專案依山屋順序計算）', license: ODBL, note: plan.note ?? null };
    osmOut.push({ type: 'Feature', properties: { ...props, kind: 'route', ...src }, geometry: { type: 'LineString', coordinates: round(lines)[0] } });
  }

  // 登山口與接駁道路：路線真正的端點（不與其他段相接者）中，離車行道路最近的一或兩個
  const ends = [];
  for (const [i, l] of lines.entries()) for (const p of [l[0], l.at(-1)]) {
    const joined = lines.some((m, j) => j !== i && m.some((q) => dist(p, q) < 60)) || ends.some((e) => dist(e, p) < 60);
    if (!joined) ends.push(p);
  }
  const all = lines.flat();
  // 端點周邊約 5 km 找最近的車行道路節點，當作登山口
  const cands = [];
  for (const p of ends.length ? ends : [all[0], all.at(-1)]) {
    const near = network(bboxOf([p], 0.05), true);
    const [id, d] = nearest(near, p, (n) => near.adj.get(n)?.some(([, , w]) => w.motor));
    if (id != null) cands.push({ p, xy: near.nodes.get(id), d });
  }
  cands.sort((a, b) => a.d - b.d);
  // 端點離車行道路超過 2.5 km 就不標登山口（多為縱走中段或另一條路線的延伸），寧缺勿錯
  const picks = cands.filter((c, i) => c.d < 2500 && cands.slice(0, i).every((o) => dist(o.p, c.p) > 3000)).slice(0, 2);
  if (!picks.length) report.push(`  ${t.name}：端點 2.5 km 內沒有車行道路，未標登山口`);
  for (const c of picks) {
    const xy = c.xy;
    // 接駁道路查登山口周邊約 30 km
    const net = network(bboxOf([xy], 0.28), true);
    const [startId] = nearest(net, xy, (n) => net.adj.get(n)?.some(([, , w]) => w.motor));
    const name = trailheadName(xy, t.name) ?? `${t.name}登山口`;
    osmOut.push({ type: 'Feature', properties: { ...props, kind: 'trailhead', name, license: ODBL }, geometry: { type: 'Point', coordinates: xy.map((v) => +v.toFixed(5)) } });
    const r = dijkstra(net, startId, (u, w) => w?.main || net.adj.get(u)?.some(([, , x]) => x.main), (w) => (!w.motor ? (w.track ? 1.3 : Infinity) : ['residential', 'service'].includes(w.tags.highway) ? 1.5 : 1));
    if (!r) { report.push(`  ${t.name}：${name} 在範圍內找不到通往省道或主要道路的車行路`); continue; }
    if (r.length < 300) continue; // 登山口就在主要道路旁，不必畫
    osmOut.push({ type: 'Feature', properties: { ...props, kind: 'access', name, via: wayLabel(r.ways).join(' → '), length_km: +(r.length / 1000).toFixed(1), source: 'OpenStreetMap 道路路網（本專案計算最短車行路徑）', license: ODBL },
      geometry: { type: 'LineString', coordinates: r.path.map((id) => net.nodes.get(id).map((v) => +v.toFixed(5))) } });
  }
  console.log(`✓ ${t.name}（${src.license === OGDL ? '官方' : 'OSM'}）登山口 ${picks.length}`);
}

// 先找 2.5 km 內名稱與路線相關的登山口（取路線名前兩字比對），否則取 600 m 內最近者
function trailheadName(xy, trail) {
  const near = osm.trailheads.map((n) => ({ ...n, d: dist(xy, n.xy) })).sort((a, b) => a.d - b.d);
  const keys = trail.split(/[／、（）\s]/).filter(Boolean).map((w) => w.slice(0, 2));
  return near.find((n) => n.d < 2500 && keys.some((k) => n.name.includes(k)))?.name ?? near.find((n) => n.d < 600)?.name ?? null;
}

const meta = (license, note) => ({ generated: new Date().toISOString().slice(0, 10), license, note });
await writeFile('data/routes.official.geojson', JSON.stringify({ type: 'FeatureCollection', metadata: meta(OGDL, '雪霸國家公園管理處、林業及自然保育署開放資料'), features: official }));
await writeFile('data/routes.osm.geojson', JSON.stringify({ type: 'FeatureCollection', metadata: meta(ODBL, '衍生自 OpenStreetMap，依 ODbL 1.0 釋出；路線為示意，不得作為導航依據'), features: osmOut }));
console.log(`\n官方 ${official.length} 條；OSM 路線 ${osmOut.filter((f) => f.properties.kind === 'route').length} 條、登山口 ${osmOut.filter((f) => f.properties.kind === 'trailhead').length}、接駁道路 ${osmOut.filter((f) => f.properties.kind === 'access').length}`);
if (report.length) console.log('\n' + report.join('\n'));

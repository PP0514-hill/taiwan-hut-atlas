#!/usr/bin/env node
/**
 * 主要山峰：產生 data/peaks.geojson（ODbL 1.0，衍生自 OpenStreetMap）。
 * 手動執行（npm run build:peaks），需要 .cache/osm/taiwan-latest.osm.pbf 與 osmium-tool（見 build-routes.mjs 檔頭）。
 * 位置與標高取自 OSM natural=peak 的 ele（多為三角點測量值），與常見刊載數字可能差 1～2 m。
 * views：地圖快速視角要顯示的範圍；island＝全島只列五嶽與大霸；留空者只用於經典路線介紹卡。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const PBF = '.cache/osm/taiwan-latest.osm.pbf', OUT = '.cache/osm/peaks.opl';
// [OSM node id, 顯示名稱, 視角]
const PEAKS = [
  [3428095932, '玉山主峰', ['island', 'yushan']],
  [625239452, '玉山北峰', ['yushan']],
  [625245738, '玉山東峰', ['yushan']],
  [625242828, '玉山南峰', ['yushan']],
  [2482536203, '秀姑巒山', ['island', 'yushan']],
  [5582288246, '馬博拉斯山', ['yushan']],
  [4315785196, '大水窟山', ['yushan']],
  [2482563411, '八通關山', ['yushan']],
  [4380698728, '達芬尖山', ['yushan']],
  [2268441054, '關山', ['yushan']],
  [2268473278, '向陽山', ['yushan']],
  [660060600, '三叉山', ['yushan']],
  [2268473295, '新康山', ['yushan']],
  [2101224904, '雪山主峰', ['island', 'sheipa']],
  [1520408114, '北稜角', ['sheipa']],
  [4705115484, '大霸尖山', ['island', 'sheipa']],
  [2101226634, '品田山', ['sheipa']],
  [2268473297, '桃山', ['sheipa']],
  [12031256402, '志佳陽大山', ['sheipa']],
  [1529078482, '大劍山', ['sheipa']],
  [2268441044, '南湖大山', ['island', 'taroko']],
  [2268441042, '中央尖山', ['taroko']],
  [2268441051, '無明山', ['taroko']],
  [2268473300, '畢祿山', ['taroko']],
  [2268473306, '羊頭山', ['taroko']],
  [2268441047, '奇萊北峰', ['taroko']],
  [2268473288, '奇萊主山', ['taroko']],
  [1660542386, '合歡山', ['taroko']],
  [2297213046, '屏風山', ['taroko']],
  [2299246284, '北大武山', ['island']],
  // 以下只供經典路線介紹卡列「主要山峰」，不在視角山峰圖層顯示（views 留空）
  [2268473289, '奇萊南峰', []],
  [2268473272, '南華山', []],
  [2268473312, '能高山', []],
  [2268473315, '能高山南峰', []],
  [4380698727, '光頭山', []],
  [2482547866, '白石山', []],
  [2482523770, '安東軍山', []],
  [2482563185, '丹大山', []],
  [4380572864, '內嶺爾山', []],
  [4542480088, '馬路巴拉讓山', []],
  [660060601, '東郡大山', []],
  [2482534740, '卓社大山', []],
  [2482548487, '牧山', []],
  [2482548350, '火山', []],
  [2482534753, '干卓萬山', []],
  [2482557258, '東小南山', []],
  [2482557259, '鹿山', []],
  [2482536166, '南玉山', []],
  [5582288243, '雲峰', []],
  [5591528506, '轆轆山', []],
  [1529104910, '池有山', []],
];

if (!existsSync(PBF)) throw new Error(`找不到 ${PBF}，請先依 build-routes.mjs 檔頭說明下載`);
execFileSync('osmium', ['getid', PBF, ...PEAKS.map(([id]) => `n${id}`), '-f', 'opl', '-o', OUT, '--overwrite'], { stdio: 'inherit' });

const unesc = (v) => v.replace(/%([0-9a-fA-F]+)%/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const nodes = new Map(readFileSync(OUT, 'utf8').trim().split('\n').map((line) => {
  const f = Object.fromEntries(line.split(' ').map((x) => [x[0], x.slice(1)]));
  const tags = Object.fromEntries((f.T ?? '').split(',').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return [unesc(kv.slice(0, i)), unesc(kv.slice(i + 1))]; }));
  return [+line.slice(1, line.indexOf(' ')), { x: +f.x, y: +f.y, tags }];
}));

const features = [];
for (const [id, name, views] of PEAKS) {
  const n = nodes.get(id);
  if (!n) { console.warn(`OSM 找不到 n${id} ${name}`); continue; }
  const ele = Math.round(parseFloat(n.tags.ele));
  if (!Number.isFinite(ele)) console.warn(`${name} 無標高`);
  // MapLibre 會把陣列屬性轉成字串，所以 views 直接存成 ,a,b, 方便 in 比對
  features.push({ type: 'Feature', properties: { name, name_osm: n.tags.name, ele, views: `,${views.join(',')},`, osm: `n${id}` }, geometry: { type: 'Point', coordinates: [+n.x.toFixed(5), +n.y.toFixed(5)] } });
}
await writeFile('data/peaks.geojson', JSON.stringify({ type: 'FeatureCollection', metadata: { generated: new Date().toISOString().slice(0, 10), license: 'ODbL 1.0 © OpenStreetMap contributors', note: '標高取自 OSM ele，四捨五入至公尺' }, features }));
console.log(`peaks ${features.length} 座`);

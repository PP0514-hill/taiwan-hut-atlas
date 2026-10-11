/** 把對外降階版資料複製到 public/data/ 供下載（內部版 *.internal.* 絕不複製） */
import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('public/data', { recursive: true });
for (const f of ['huts.json', 'huts.public.geojson', 'events.json', 'sources.json', 'agencies.json', 'trails.json', 'meta.json', 'parks.geojson', 'routes.official.geojson', 'routes.osm.geojson', 'park-hq.geojson'])
  await copyFile(`data/${f}`, `public/data/${f}`);
console.log('public/data 更新');

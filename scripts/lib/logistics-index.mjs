/**
 * 運補難度指數 Logistics Index（1–5）｜本所詮釋，公式公開
 * v0.1 2026-10-06
 *
 * base = 依「運補方式」取最困難者：車行 1／單軌車・索道 2／直升機吊掛 3／人力背負 4
 * 無運補資料 → 以海拔推估（<2000:2，2000–2999:3，≥3000:4）並標 estimated
 * 無運補資料且無海拔 → 不評分（null）
 * 海拔 ≥ 3400 m → +1（直升機載重與天候窗口受限）
 * 夾在 1–5
 *
 * 待補輸入（Phase 2）：步道里程 km、累積爬升、最近車行點距離。
 */
export const LOGISTICS_INDEX_VERSION = 'v0.1';
const BASE = { '車行': 1, '單軌車': 2, '索道': 2, '直升機吊掛': 3, '人力背負': 4 };

export function logisticsIndex(elev, modes = []) {
  const known = (modes || []).filter((m) => m in BASE);
  let base, estimated = false;
  if (known.length) {
    base = Math.max(...known.map((m) => BASE[m]));
  } else {
    estimated = true;
    if (elev == null) return { index: null, estimated: true };
    base = elev < 2000 ? 2 : elev < 3000 ? 3 : 4;
  }
  const bonus = elev != null && elev >= 3400 ? 1 : 0;
  return { index: Math.max(1, Math.min(5, base + bonus)), estimated };
}

/** 對外座標降階：完整公開／1 km 網格（0.01°）／僅步道段（不輸出） */
export function publicCoord(lon, lat, rule) {
  if (lon == null || lat == null) return [null, null];
  if (rule === '完整公開') return [lon, lat];
  if (rule === '1 km 網格') return [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100];
  return [null, null];
}

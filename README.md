# 台灣山屋誌 Taiwan Hut Atlas

全台山屋盤點與地形互動網站。資料單一真相來源在 Notion 六庫，每日同步進版控，Astro 靜態建置，GitHub Pages 發布。

專案代號：2026-0XX-山屋誌（案號待補）。決策紀錄見 Notion「山屋誌｜專案決策紀錄與待辦」。

## 技術

| 層 | 選擇 | 版本（2026-10-06 查證） |
|---|---|---|
| 靜態框架 | Astro | 7.3.5 |
| 地圖 | MapLibre GL JS | 6.12.0 |
| 圖表 | Observable Plot | 0.6.17 |
| 地形 | 內政部 20 m DEM，原型期經 OsmHackTW terrain-rgb 圖磚（z≤13） | — |
| 底圖 | 國土測繪中心 EMAP5_OPENDATA WMTS | — |
| 資料 | Notion API 2025-09-03（data_sources 端點） | — |

## 目錄

```
data/                 Notion 快照（公開降階版可提交；*.internal.* 已 gitignore）
scripts/
  fetch-notion.mjs    Notion → data/*.json、*.geojson
  check-data.mjs      建置前完整性檢查（ID／slug 重複、孤兒關聯、座標範圍、降階取整）
  publish-data.mjs    複製公開版到 public/data/ 供下載
  backfill-logistics.mjs  運補難度指數回填 Notion
  lib/logistics-index.mjs 指數公式（單一實作，fetch 與回填共用）
src/
  lib/data.ts         載入與 PUBLISH_MODE 過濾
  components/HutMap.astro  3D 地形圖
  components/Charts.astro  儀表板圖表
  pages/              index（總覽）／huts（清單、[slug] 詳頁）／map／about
  styles/pp-tokens.css     初樸視覺規範變數（勿改）
.github/workflows/
  sync-notion.yml     每日 05:17（台北）拉 Notion，有變更才 commit
  deploy.yml          push main → build → Pages
```

## 本機開發

```bash
npm install
cp .env.example .env            # 填 NOTION_TOKEN
npm run fetch                   # 從 Notion 更新 data/
npm run dev                     # 預設 PUBLISH_MODE=draft，含 AI 初稿
PUBLISH_MODE=published npm run build   # 正式輸出，只含「已覆核」
```

沒有 token 也能跑：`data/` 已有 2026-10-06 快照。

## 發布前要做的事

1. 在 repo Settings → Secrets 加 `NOTION_TOKEN`（Notion 內部整合，六庫皆需分享給它）。
2. Settings → Pages → Source 選 **GitHub Actions**。
3. 若為專案站（`<org>.github.io/<repo>`），Settings → Variables 設 `BASE_PATH=/<repo>/`、`SITE_URL=https://<org>.github.io`。
4. `PUBLISH_MODE` 變數不設即 `published`；Phase 1 覆核完成前正式站會是空的，這是刻意的。要先看預覽，在 Variables 設 `PUBLISH_MODE=draft`，頁首會掛紅字提示。
5. slug 已於 2026-10-06 鎖定，上線後不改；改名只加別名欄。

## 資料規則摘要

- 覆核狀態：`AI 初稿待覆核` → 同仁覆核 → `已覆核`；`退回修正` 兩種模式都不輸出。
- 查證等級 A／B／C／D；二手來源上限 C。
- 座標降階：服務型、避難型、民營完整公開；遺構、工寮、獵寮、已拆除對外取至 0.01°（約 1 km）。`huts.internal.json` 含完整座標，不進版控。
- 運補難度指數 v0.1：見 `scripts/lib/logistics-index.mjs` 檔頭與網站方法頁。
- 關聯設施（保線所、公路旁山莊）列入清單，不計入統計。

## 授權

程式 MIT；`data/` 文字與座標 CC BY 4.0；引用之第三方來源依原授權，逐筆列於 `data/sources.json`。

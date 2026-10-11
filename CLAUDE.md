# CLAUDE.md — 台灣山屋誌 Taiwan Hut Atlas

本檔供 Claude Code 接手時讀取。一律以繁體中文（台灣用語）回應；對外文字避免第一、第二人稱。
視覺規範見 `src/styles/pp-tokens.css`（初樸「清水模極簡」，單一強調色 #9C3D2C，不得新增色彩）。

## 專案狀態（2026-10-07）

| 項目 | 狀態 |
|---|---|
| Repo | `PP0514-hill/taiwan-hut-atlas`，main，v0.1.0 初版＋workflow 修正已推 |
| GitHub Pages | Source 已切 GitHub Actions；正式網址 `https://pp0514-hill.github.io/taiwan-hut-atlas/` |
| Actions Variables | `BASE_PATH=/taiwan-hut-atlas/`、`SITE_URL=https://pp0514-hill.github.io`、`PUBLISH_MODE=draft` |
| Secret `NOTION_TOKEN` | **尚未設定**，由使用者自行貼入；沒有它 `sync-notion` 會失敗，deploy 仍可用 `data/` 快照 |
| deploy run #2 | build 成功（600 KB artifact），deploy 當時 Pages 未啟用而失敗 → 需 `gh run rerun <id> --failed` 或推一個 commit |
| 本機副本 | `~/Downloads/taiwan-hut-atlas`（建議搬到 `~/Developer/`） |
| gh CLI | 已安裝並登入 PP0514-hill，含 `workflow` scope |

## 待辦（依優先順序）

1. 確認 deploy 綠燈、網站可開；首頁應掛紅字「draft」提示。
2. 使用者在 Settings → Secrets 貼入 `NOTION_TOKEN`，之後手動跑一次 `sync-notion`（workflow_dispatch）驗證。
3. `npm run backfill:logistics`（需 `.env` 的 NOTION_TOKEN）補齊運補難度指數；TWH-0001～0011 已由 MCP 回填。
4. 在 Notion 決策頁（id `3f0bf2d8-5a3b-81c1-90a5-d360863f1643`）記錄 repo、Pages 網址、本次 workflow 修正。
5. 清單頁分頁或虛擬捲動；詳頁空欄位隱藏（使用者尚未裁示）。
6. 16 筆無座標、10 筆無年份事件待補；巴奈伊克來源待具體頁面。
7. 專案案號待補（README 的 `2026-0XX`）。
8. Phase 2 第一順位：古地圖數位化。資訊公開申請暫緩。

## 資料與規則（不可擅改）

- 單一真相來源在 Notion 六庫；`data/*.json` 為快照。data source id：
  管理單位 `88131947-e1ee-4b24-bc75-1b81f8dbe6bf`、步道 `c68bfe5f-ea67-4da7-b968-9162cb35faa7`、
  山屋 `3922580d-8bb6-4a2e-b42c-1e0cc0010b07`、事件 `ae37d509-a3d8-4488-bec6-a707a1f57ab5`、
  來源 `a384b25f-9a95-4e16-9f3d-d52a5dbba902`、照片 `9ca5a932-5092-45eb-a048-506e748a3ee0`。
- slug 已於 2026-10-06 鎖定，上線後不改；改名只加別名欄。
- `PUBLISH_MODE=published` 只輸出「已覆核」（目前 0 筆，正式站為空是刻意的）；`draft` 含 AI 初稿；`退回修正` 兩模式皆不輸出。
- 座標降階：服務型／避難型／民營完整公開；遺構、工寮、獵寮、已拆除取至 0.01°。`data/*.internal.*` 已 gitignore，不得提交。
- 運補難度指數 v0.1 公式唯一實作在 `scripts/lib/logistics-index.mjs`，fetch 與 backfill 共用。
- 關聯設施列入清單、不計入統計。
- 機敏資訊（業主、地號、金額、個資、token）不得進版控或對外頁面。

## 常用指令

```bash
npm install
npm run dev                          # PUBLISH_MODE=draft
PUBLISH_MODE=published npm run build
npm run fetch                        # Notion → data/（需 .env）
npm run check                        # 建置前完整性檢查
gh run list -R PP0514-hill/taiwan-hut-atlas
gh workflow run deploy.yml --ref main
```

## 已知坑

- GitHub Actions YAML：`${{ }}` 不可放在單行 `{ }` flow mapping 內（deploy.yml 第一次就死在這）。
- `GITHUB_TOKEN` 推的 commit 不會觸發其他 workflow，`sync-notion` 已改為 push 後 `gh workflow run deploy.yml`。
- MapLibre 6 在 Vite 下 worker 路徑失效，`HutMap.astro` 以 `?worker&url` 匯入並 `setWorkerUrl`。
- `.geojson` 不能直接 import，`src/lib/data.ts` 由 huts.json 組 GeoJSON。
- 地形圖磚 z>13 與海域會 404，無害。

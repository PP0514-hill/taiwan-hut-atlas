import { defineConfig } from 'astro/config';

// site／base 由 GitHub Pages 設定決定：
//   使用者或組織站（<org>.github.io）→ base '/'
//   專案站（<org>.github.io/<repo>）→ base '/<repo>/'
// 以環境變數覆寫，避免寫死 repo 名稱（repo 名稱待使用者確認）。
const site = process.env.SITE_URL ?? 'https://example.github.io';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { ssr: { noExternal: ['@observablehq/plot'] }, worker: { format: 'es' } },
});

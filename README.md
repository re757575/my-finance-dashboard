# My Finance Dashboard

個人資產負債儀表板——一款去中心化、無伺服器、高度重視隱私的個人財務宏觀健康管理網頁。所有資料 100% 儲存在瀏覽器本地（LocalStorage），不會向任何伺服器傳送使用者的財務數據。

## 專案狀態

目前版本 [v0.3.2](./CHANGELOG.md)。核心功能（多來源現金/股票/負債/收入管理、歷史趨勢、備份還原、財務健康指標、AI 分析提示詞多模式、PWA 離線安裝）皆已完成，並具備 pre-commit 品質檢查（Husky + lint-staged + Prettier）。完整版本異動請見 [CHANGELOG.md](./CHANGELOG.md)。

## 專案架構

- **資料流：** 所有資料集中在單一 LocalStorage 快照陣列（`src/hooks/useLocalSnapshots.ts`），每筆快照以「日」為顆粒度，使用者按下「更新儀表板」才會真正寫入，重新整理頁面會遺失未存檔的編輯內容（刻意設計）。
- **財務計算：** 所有公式集中在 `src/lib/calculations.ts`，包含總資產/負債、負債比、緊急預備金月數、儲蓄率、資產配置比例、FIRE／淨資產目標進度等健康指標，公式定義見 [docs/PRD.md](./docs/PRD.md) 第 5 節。
- **圖表：** `src/components/charts/` 為手刻 SVG（未引入圖表庫），理由見 [docs/TECH_STACK.md](./docs/TECH_STACK.md)。
- **AI 分析：** `src/lib/promptBuilder.ts` 產生五種模式的分析提示詞，使用者一鍵複製後自行貼到外部 AI 工具，App 本身不對外發送任何請求。
- **PWA：** 透過 `vite-plugin-pwa` 只快取同源靜態檔案，可安裝到主畫面並離線開啟，不違反零網路請求原則。

## 文件

- **[docs/PRD.md](./docs/PRD.md)** — 產品需求文件，定義功能需求、財務計算公式、資料結構、UI/UX 規範、非功能性需求與驗收標準。
- **[docs/TECH_STACK.md](./docs/TECH_STACK.md)** — 前端技術建議，說明建置工具、框架、狀態管理、圖表、UI 元件庫等技術選型與理由。
- **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** — 常見問題排解，目前收錄 GitHub Pages 部署失敗的原因與修正流程。
- **[CHANGELOG.md](./CHANGELOG.md)** — 版本異動紀錄，由 `npm run release` 依 Conventional Commits 自動產生，不手動編輯。

## 快速開始

```bash
npm install              # 安裝相依套件
npm run dev               # 啟動本地開發伺服器
npm run build              # 建置正式版靜態檔案
npm run typecheck          # TypeScript 型別檢查
npm run test               # 執行單元/元件測試（Vitest）
npx playwright install --with-deps chromium   # 首次執行 e2e 測試前，安裝瀏覽器
npm run test:e2e           # 執行 e2e 測試（Playwright，會自動啟動 dev server）
```

Commit 時會自動觸發 `.husky/pre-commit`：依序執行 `lint-staged`（Prettier 格式化）、`typecheck`、`test`（單元/元件測試）。e2e 測試因啟動較慢，不包含在 pre-commit 內，push 到 `main` 時會由 CI（`.github/workflows/deploy.yml`）自動執行。

## 版本發布

版本號與 [CHANGELOG.md](./CHANGELOG.md) 皆由 [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) 依 commit 訊息（[Conventional Commits](https://www.conventionalcommits.org/) 規範）自動產生，不手動修改 `package.json` 的版本號或編輯 CHANGELOG。

```bash
npm run release          # 依 commit 型別自動判斷版號（fix → patch／feat → minor）
npm run release:patch    # 強制升 patch 版號
npm run release:minor    # 強制升 minor 版號
npm run release:major    # 強制升 major 版號
```

執行後會自動更新 `package.json` 版本號、重新產生 CHANGELOG.md、建立一個 `chore(release): x.y.z` commit 並打上對應的 `vX.Y.Z` git tag。完成後需手動推送 commit 與 tag，才會觸發下方的自動部署：

```bash
git push --follow-tags origin main
```

> 目前仍在 0.x 開發階段，commit 訊息帶 `!`（如 `feat!:`）或含 `BREAKING CHANGE` 只會自動跳 **minor** 版號，不會跳到 1.0.0；要正式發布 1.0.0 需明確執行 `npm run release:major`。

## 部署到 GitHub Pages

專案已內建 `.github/workflows/deploy.yml`，push 到 `main` 分支時會自動：typecheck → 跑單元測試 → 跑 e2e 測試 → 建置 → 部署到 GitHub Pages。首次啟用需要在 GitHub 網站上手動設定一次：

1. 到 repository 的 **Settings → Pages**
2. **Source** 選擇 **GitHub Actions**（不要選 "Deploy from a branch"）
3. 儲存後，下次 push 到 `main` 就會自動觸發部署；也可以到 **Actions** 分頁手動點 "Run workflow" 立即部署

部署完成後，網址會顯示在該次 workflow run 的 `deploy` job 裡（格式通常是 `https://<你的帳號>.github.io/<repo 名稱>/`）。

> **Private repo 提醒：** 免費版 GitHub 帳號用 Private repo 部署 Pages，建置出來的網站本身仍是「知道網址就能公開瀏覽」，只有 GitHub Pro/Team 以上才能讓 Pages 網站也要求登入才能看。這對本專案沒有影響——所有財務資料只存在使用者瀏覽器的 LocalStorage，靜態網頁本身不含任何人的資料，公開網址看到的就只是空白表單。

`vite.config.ts` 已設定 `base: "./"`（相對路徑），因此不需要因為 repo 名稱不同而修改設定。

## 核心原則

- **隱私優先：** 不引入任何外部 Analytics 或第三方日誌收集工具，資料絕不離開使用者的瀏覽器。
- **無伺服器：** 純前端運算與儲存，最終產物為純靜態檔案，可部署於任何靜態託管服務。
- **定期健康檢查：** 不記日常消費流水帳，只做定期的資產負債總覽，歷史趨勢快照則以日為單位保留。

# My Finance Dashboard

個人資產負債儀表板——一款去中心化、無伺服器、高度重視隱私的個人財務宏觀健康管理網頁。所有資料 100% 儲存在瀏覽器本地（LocalStorage），不會向任何伺服器傳送使用者的財務數據。

## 專案狀態

已完成 Vite + React 19 + TypeScript 專案骨架與核心功能實作，並具備 pre-commit 品質檢查（Husky + lint-staged + Prettier）。

## 文件

- **[PRD.md](./PRD.md)** — 產品需求文件，定義功能需求、財務計算公式、資料結構、UI/UX 規範、非功能性需求與驗收標準。
- **[TECH_STACK.md](./TECH_STACK.md)** — 前端技術建議，說明建置工具、框架、狀態管理、圖表、UI 元件庫等技術選型與理由。

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

Commit 時會自動觸發 `.husky/pre-commit`：依序執行 `lint-staged`（Prettier 格式化）、`typecheck`、`test`（單元/元件測試）。e2e 測試因啟動較慢，不包含在 pre-commit 內，建議在推送前或 CI 中執行。

## 部署到 GitHub Pages

專案已內建 `.github/workflows/deploy.yml`，push 到 `main` 分支時會自動：typecheck → 跑單元測試 → 建置 → 部署到 GitHub Pages。首次啟用需要在 GitHub 網站上手動設定一次：

1. 到 repository 的 **Settings → Pages**
2. **Source** 選擇 **GitHub Actions**（不要選 "Deploy from a branch"）
3. 儲存後，下次 push 到 `main` 就會自動觸發部署；也可以到 **Actions** 分頁手動點 "Run workflow" 立即部署

部署完成後，網址會顯示在該次 workflow run 的 `deploy` job 裡（格式通常是 `https://<你的帳號>.github.io/<repo 名稱>/`）。

> **Private repo 提醒：** 免費版 GitHub 帳號用 Private repo 部署 Pages，建置出來的網站本身仍是「知道網址就能公開瀏覽」，只有 GitHub Pro/Team 以上才能讓 Pages 網站也要求登入才能看。這對本專案沒有影響——所有財務資料只存在使用者瀏覽器的 LocalStorage，靜態網頁本身不含任何人的資料，公開網址看到的就只是空白表單。

`vite.config.ts` 已設定 `base: "./"`（相對路徑），因此不需要因為 repo 名稱不同而修改設定。

## 核心原則

- **隱私優先：** 不引入任何外部 Analytics 或第三方日誌收集工具，資料絕不離開使用者的瀏覽器。
- **無伺服器：** 純前端運算與儲存，最終產物為純靜態檔案，可部署於任何靜態託管服務。
- **月度健康檢查：** 不記日常消費流水帳，只做定期（以月為單位）的資產負債總覽與趨勢追蹤。

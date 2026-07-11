# 🛠️ 前端技術建議 (Frontend Tech Stack Recommendation)

本文件針對 [PRD.md](./PRD.md) 定義的「個人資產負債儀表板」提供技術棧建議，供實作者（或 AI 開發助手）參考。

---

## 1. 選型前提

技術選擇需同時滿足 PRD 中已定案的以下限制：

- **無伺服器 (Serverless)**：100% 純前端，資料只存 LocalStorage，不得有任何網路請求（第 8 節）。
- **效能需求**：首次載入 LCP < 1 秒；互動延遲（表單即時預覽）不得超過 100 毫秒（第 8 節）。
- **圖表輕量化**：歷史趨勢圖須用輕量方案，明確排除重量級圖表庫（第 8 節）。
- **可交由 AI 開發助手實作**：PRD 開頭明確說明本文件可直接提供給 Cursor、Claude 等 AI 工具實作。

---

## 2. 建議技術棧總覽

| 項目      | 選擇                                                                                                 | 理由                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 建置工具  | **Vite**                                                                                             | 開發體驗快，正式建置產出極小，原生支援打包成純靜態檔案，符合「無伺服器」定位，可直接部署到 GitHub Pages / Netlify / Cloudflare Pages 等純靜態託管，不需要 Node 後端。                                                                                                                                                                                                                                   |
| 框架      | **React 19 + TypeScript**                                                                            | React 生態是目前 AI 生成程式碼品質最穩定、範例最多的選擇；TypeScript 能在編譯期抓到資料結構（快照 schema）誤用的問題，對計算公式必須正確的財務工具尤其重要。React 19 的 `useActionState` 對「更新儀表板」這種表單提交場景很合適，React Compiler 也能自動做部分 memoization，對效能需求有幫助。                                                                                                          |
| 樣式      | **Tailwind CSS**                                                                                     | PRD 第 7 節 UI 規範已直接採用 `text-2xl`、`shadow-sm` 等 Tailwind class 命名，等於已半指定，直接沿用即可。                                                                                                                                                                                                                                                                                              |
| 狀態管理  | **不需額外套件**：React 內建 `useState` / `useReducer` ＋ 自訂 `useLocalSnapshots` hook 包裝讀寫邏輯 | 整個應用只有一個頁面、一份資料，Redux / Zustand 這類全域狀態庫是過度設計，會增加不必要的 bundle size，違背 LCP 需求。                                                                                                                                                                                                                                                                                   |
| 圖表      | **手刻 SVG**（不引入圖表庫）                                                                         | 只需要「折線圖」與「分組長條圖」兩種最基本圖表，且資料點最多 12～24 個，手刻 SVG（`<path>` 畫線、`<rect>` 畫長條）即可，bundle size 幾乎為 0，對齊「排除重量級圖表庫」的要求。若之後需要更豐富互動（hover tooltip、縮放），可評估 `uPlot`（bundle 僅約 45KB，目前最輕量的成熟圖表庫）。                                                                                                                 |
| UI 元件庫 | **shadcn/ui**（只挑 `Button`、`Dialog`、`Input`）                                                    | 不是傳統 npm 執行時依賴，而是把元件原始碼複製進專案，用多少裝多少，不會有 bundle 浪費；底層基於 Radix UI Primitives，無障礙（focus trap、鍵盤操作、ESC 關閉）都處理好，對「清空資料」「匯入還原覆蓋」這兩個需要二次確認的 Dialog 流程特別有用；原生即 Tailwind CSS，跟樣式方案一致；AI 對它的訓練資料也很充足。卡片、進度條等純版面元件則直接用 Tailwind 手刻，不需要額外引入元件庫的 Card / Progress。 |
| 測試      | **Vitest**（建議）                                                                                   | 主要用來驗證 PRD 第 5 節財務公式（總資產、總負債、淨資產、負債比）的計算正確性，這是全站邏輯正確性的核心。                                                                                                                                                                                                                                                                                              |
| 部署      | **靜態託管**（GitHub Pages / Netlify / Cloudflare Pages 皆可）                                       | 純前端打包產物即可運行，無需自建伺服器，與隱私優先定位一致。                                                                                                                                                                                                                                                                                                                                            |

---

## 3. 為什麼不選其他方案

- **Vue 3**：效能與開發體驗跟 React 相近，理論上完全可行，但 React 在「AI 生成程式碼」情境下生態更成熟、範例更多，選 React 是為了配合 PRD 開頭「交給 AI 助手實作」的定位。
- **純 Vanilla JS**：理論上 bundle 最小、LCP 表現最好，但本專案有表單雙向綁定、即時預覽計算、多張圖表卡片等互動狀態，用框架管理可維護性高很多。Vite + React 打包後的 bundle 本來就很小（gzip 後通常 < 50KB），LCP < 1 秒仍守得住，不需要犧牲到手刻 Vanilla JS 這麼極端。
- **重量級圖表庫（Chart.js 全 plugin、D3 全家桶、Recharts 等）**：功能豐富但 bundle 動輒數百 KB，且本專案只需要兩種最基本的圖表類型，用不到這些庫的進階能力，直接違反 PRD 第 8 節的效能限制。
- **全域狀態管理庫（Redux、Zustand、Jotai 等）**：單頁、單份資料的應用場景用不到，屬於過度設計。
- **完整 UI 元件庫（MUI、Ant Design、Chakra UI 等）**：自帶一整套設計系統（間距、色彩、字重規則），會跟 PRD 第 7 節已定義的客製化極簡風格（`#F9FAFB` 背景、特定 `shadow-sm` 層次感）互相打架，且 bundle size 動輒 100KB 以上，跟「只拿你用到的」的 shadcn/ui 相比是不必要的效能負擔。

---

## 4. 建議專案結構（概略）

```text
src/
  components/
    CashSourceList.tsx      # 多來源現金清單
    StockInputs.tsx         # 台股/美股/匯率輸入
    DebtInputs.tsx          # 貸款/短期負債輸入
    SummaryCards.tsx        # 三大指標卡
    DebtRatioBar.tsx        # 負債比進度條與燈號
    TrendChart/
      NetWorthChart.tsx     # 淨資產折線圖
      DebtRatioChart.tsx    # 負債比折線圖
      AssetsVsLiabilitiesChart.tsx  # 資產負債對比長條圖
    DataManagement.tsx      # 匯出/匯入/清空
  hooks/
    useLocalSnapshots.ts    # LocalStorage 讀寫、月份快照邏輯
  lib/
    calculations.ts         # 第 5 節財務公式（可獨立測試）
  types/
    schema.ts               # 快照 / schemaVersion 型別定義
```

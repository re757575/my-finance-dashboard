# 元件分層

`src/components/` 的分層、手刻圖表的規則、預設收合的區塊與趨勢圖分頁。

- `src/components/*.tsx`：業務元件（輸入表單、看板卡片、趨勢區塊），大多為純展示元件，透過 `onChange`/`value` 與 `App.tsx` 溝通。
- `src/components/charts/`：手刻 SVG 圖表元件（刻意不引入 Recharts/D3 等圖表庫，見 [docs/TECH_STACK.md](../TECH_STACK.md) 第 3 節），`EmptyTrendCard` 處理快照筆數 < 2 時的空狀態。**圖表內的文字一律 `text-xs`（12px），不可更小**（PRD 第 7 節）：全螢幕檢視的 SVG 以實際像素繪製，`<text>` 的字級就是畫面上的字級；compact 圖是 `viewBox` 等比縮放（桌面三欄時只有約 0.6 倍），畫在 SVG 裡的文字會跟著縮小，所以 compact 也要顯示的文字（目前只有目標參考線的 `chart-target-label`）必須是疊在 SVG 上的 HTML，比照 `ChartTooltip` 以百分比定位。
- **快照比較與歷史快照預設收合**（PRD 4.2 同名項目）：`SnapshotComparison` 與 `SnapshotHistory` 的標題是共用的 `SectionToggleHeading`（`<h2>` 內含 `aria-expanded` 按鈕；輸入區的分段也用它，見 [layout.md](layout.md)「輸入區分段收合與總覽卡增減」），展開狀態只存在各自的元件 state、預設 `false`，不寫入 LocalStorage。收合時不渲染內容、也不做計算（`compareSnapshots`、各列的 `calculateMetrics`）；日期選擇與「顯示全部」的 state 留在元件上，所以收合再展開不會重置。**測試要操作這兩區的內容前必須先展開**：e2e 呼叫 `e2e/helpers.ts` 的 `expandSnapshotSections(page)`（`page.reload()` 之後要再呼叫一次），Vitest 用 `fireEvent.click(screen.getByRole("button", { name: "歷史快照" }))`。檢查內容「不存在」的斷言（`toHaveCount(0)`）在收合狀態下必定通過，所以更要先展開。
- **歷史趨勢圖分組分頁**：`TrendSection` 以 `ui/tabs.tsx` 把八張趨勢圖分成「資產／負債／配置與儲蓄」三個分頁（預設「資產」），一次只渲染選取中分頁的圖表，其餘不在 DOM 中；選取的分頁只存在元件 state，不寫入 LocalStorage（PRD 4.2「趨勢圖分組分頁」）。`ui/tabs.tsx` 是依 shadcn 風格手寫的 Radix Tabs 封裝（非 `shadcn add` 生成），選取狀態以底線＋粗體標示；它用的是寫死的 slate 色階加 `dark:` 變體，且不在 `darkModeCoverage` 的掃描範圍內，調整配色時要自行對照 [dark-mode.md](dark-mode.md) 的對應表。測試要操作非預設分頁的圖表時必須先切換分頁：e2e 用 `getByRole("tab", { name })` 點擊，Vitest 用 `fireEvent.mouseDown`（Radix 在 mousedown 而非 click 時切換）。
- `src/components/ui/`：shadcn 生成的基礎元件（Radix 封裝），走 `components.json` 的 `radix-nova` 風格設定，一般不手動修改內部實作，需要客製時優先加 wrapper 而非改動生成檔案。這些元件用語意 token（`bg-popover`、`border-input` 等），本身已支援深色。
- 路徑別名 `@/*` 對應 `src/*`（`vite.config.ts` 與 `tsconfig` 皆已設定）。

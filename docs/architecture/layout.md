# 版面、輸入區與看板

`App.tsx` 的版面規則：單欄／雙欄順序、固定儲存列、金額千分位、輸入區分段收合、總覽卡增減、手機看板格線、觸控目標與操作圖示。

## 單欄版面順序、固定儲存列與金額千分位

規格見 [docs/PRD.md](../PRD.md) 4.2「金額千分位顯示」「固定儲存列」、第 7 節「版面佈局」。

- **雙欄切換點是 `lg`（1024px）**。`App.tsx` 的格線有三個區塊：輸入區（`data-testid="input-form"`，雙欄時在左欄並跨兩列）、當下看板（`dashboard-now`，右欄上半）、其餘（右欄下半）。`useMediaQuery(SINGLE_COLUMN_QUERY)`（`src/hooks/useMediaQuery.ts`，與 `lg:` 互補；環境沒有 `matchMedia` 時為 false，所以 jsdom 一律是雙欄）判斷是否單欄。
- **單欄且已有快照時，看板的 DOM 順序排在輸入區之前**（沒有快照時輸入區在前）。刻意調整 DOM 順序而不是用 CSS `order`，鍵盤與螢幕閱讀器的順序才會與畫面一致；雙欄的 DOM 順序永遠是輸入區在前。對調時（`hasLoaded` 之後才算）回到頁面頂端；看板上方的「↓ 前往輸入區」只在看板在前時出現。
- **進入修正模式的捲動**：`handleEdit` 用 `flushSync` 先讓表單換成該日快照再捲動（否則版面高度還在變，平滑捲動會被瀏覽器中斷）；雙欄捲到頁面頂端、單欄捲到輸入區。
- **`StickySaveBar`** 單欄與雙欄都渲染（桌面左欄的表單同樣有好幾個螢幕高），顯示條件是 `isDirty && hasUnsavedEdits`（使用者動過而且存得下去）或有 `saveMessage`。它的按鈕與訊息用獨立的 `data-testid`（`sticky-save-button`／`sticky-save-message`），既有測試用的 `save-button`／`save-message` 仍指表單底部那一組。顯示時 `PwaUpdatePrompt` 以 `aboveStickyBar` 往上移。
- **金額千分位**在 `useNumberInputText`：未聚焦時 `text` 是千分位（`formatGroupedNumberText`），聚焦時還原成純數字並全選。所有數字輸入框都走這個 hook，測試斷言輸入框的值時要用千分位後的字串（如 `"5,000,000"`）；用 `fill()`／`fireEvent.change` 輸入純數字不受影響。選填的 `max` 會在輸入超過上限時把文字與數值一起改成上限（目前只有壓力測試的自訂跌幅使用）。

## 輸入區分段收合與總覽卡增減

規格見 [docs/PRD.md](../PRD.md) 4.2「輸入區分段收合」「總覽卡增減比對」、第 7 節同名項目。

- **輸入區分成四個可收合的區塊**：`App.tsx` 以 `InputSection` 包住「資產」（現金清單、股票、不動產）、「負債」（負債清單）、「收入與支出」（收入清單、本月支出、定期定額）、「目標」（目標淨資產、目標現金比例）；修正橫幅、「更新儀表板」按鈕與資料管理區在區塊之外。標題沿用 `SectionToggleHeading`（`size="sm"`），**收合時不渲染欄位**，改顯示 `buildInputSectionSummaries`（`src/lib/inputSections.ts`，純函式）組出的一行摘要；負債有系統估算值時摘要另加「含系統估算」。資料都在 `draft`，收合不影響計算、存檔與 `isDirty`／`hasUnsavedEdits`。
- **展開狀態在 `useInputSections`**（只存在 state，不寫入 LocalStorage）：預設值在 `hasLoaded` 變為 true 的那次 render 決定一次——沒有快照全部展開；有快照只展開「資產」，表單含質押負債時「負債」也展開。之後只有使用者切換、或「清空到沒有任何快照」（全部展開）會改變它；存下第一筆快照、匯入、載入範例資料、進出修正模式都不改（表單不該在按下存檔的當下突然變短）。新增輸入欄位時要放進對應的 `InputSection`，並視需要補進摘要。
- **測試要操作收合區塊內的欄位前必須先展開**：e2e 呼叫 `e2e/helpers.ts` 的 `expandInputSections(page)`（`page.reload()` 之後要再呼叫一次）。它會先等輸入區的 `aria-busy` 變為 `false`——`App.tsx` 在 `hasLoaded` 之前把輸入區標成 `aria-busy`，預設值是讀取完成才決定的，太早判斷會讀到「全部展開」。已有快照的頁面（含 `page.reload()` 之後、匯入之後重新整理）「收入與支出」「目標」預設收合、沒有質押負債時「負債」也收合；[fixtures/finance-data.json](../../fixtures/finance-data.json) 含質押負債，所以載入它之後「負債」是展開的。檢查欄位「不存在」的斷言在收合狀態下必定通過，同樣要先展開。
- **總覽卡增減**：`App.tsx` 以 `getSnapshotBefore(snapshots, draft.date)`（`storage.ts`）取「日期早於表單日期的最近一筆已存檔快照」，經 `calculateMetrics()` 後以 `previous` 傳給 `SummaryCards`；今天已存檔時比的是更早的那一筆，修正模式比的是被修正日期的前一筆，沒有更早的快照時為 `null`、不顯示增減行。增減沿用 `charts/DeltaText`，金額以四捨五入後的顯示值相減（比照快照比較），基準值 ≤ 0 時不顯示百分比。純即時計算，不改 schema。

## 手機看板兩欄、觸控目標與操作圖示

規格見 [docs/PRD.md](../PRD.md) 第 7 節「手機看板兩欄並排」「觸控目標」「操作圖示」。

- **`xs` 斷點（360px）**定義在 `src/index.css` 的 `@theme`（`--breakpoint-xs`），只用來決定看板卡片何時由單欄改兩欄。`App.tsx` 的狀態卡格線以 `xs:max-sm:[&>*:first-child]:col-span-2`（第一張「負債比」獨佔一列）與 `xs:max-sm:[&>*:last-child:nth-child(even)]:col-span-2`（落單的最後一張補滿）處理；桌面（`lg`）三欄另有 `lg:[&>*:first-child]:col-span-2`（「負債比」跨兩欄，八張卡剛好排滿三列）與 `lg:[&>*:last-child:nth-child(3n+1)]:col-span-2`（沒有質押卡、只有七張時最後一張補滿）——**這四條規則依賴卡片的順序與張數**，調整狀態卡順序、在最前面插入新卡或新增／移除卡片時要一起檢查。`DebtRatioBar` 自己是 `@container`：內容寬度 ≥ `@sm`（384px，桌面跨兩欄即符合）時「金融負債比」由進度條下方改排到右側，卡片才不會比同列的卡高；`@sm`～`@md` 之間說明折成兩行，把寬度讓給左側的狀態徽章。`SummaryCards` 的淨資產卡同樣在 `xs:max-sm` 跨兩欄。
- **半寬卡片放得下內容的做法**：金額用容器查詢字級（卡片加 `@container`、數字用 `text-[clamp(…cqw…)]`），徽章與狀態文字靠 `flex-wrap` 整個換行。新增看板卡片時要在 360px 與 390px 檢查。
- **觸控目標用 `pointer-coarse:` 變體放大**（不是用視窗寬度），集中在三個共用元件：`RowIconButton`（清單列的圖示鈕，滑鼠 32px／觸控 40px）、`AddRowButton`（「+ 新增…」）、`SegmentedToggle`（幣別／攤還方式／壓力測試情境含「自訂」的膠囊切換鈕，`role="group"`＋`aria-pressed`）。新增同類控制項請直接用這三個元件。e2e 要驗證觸控尺寸時用 `test.use({ hasTouch: true })`。
- **操作圖示一律用 `lucide-react` 的 SVG**（`Lock`／`LockOpen`／`Copy`／`Trash2`），不要用 emoji——emoji 不吃文字顏色。圖示加 `aria-hidden`，名稱由 `RowIconButton` 的 `label`（`aria-label`）提供。

# 資料流與快照狀態

`src/hooks/useLocalSnapshots.ts` 的狀態模型：schema 與遷移、草稿與存檔、修正模式、快照備註、趨勢圖範圍、讀取狀態機。備份、範例資料與 PWA 見 [backup-and-demo.md](backup-and-demo.md)。

## 單一 LocalStorage 快照陣列

所有財務資料狀態的根源是 `src/hooks/useLocalSnapshots.ts`（介面主題另由 `useTheme` 管理，見 [dark-mode.md](dark-mode.md)），`App.tsx` 是唯一消費此 hook 的元件，其餘元件皆為受控的展示元件（透過 props 收發資料，不直接碰觸 storage）。

- **Schema**（`src/types/schema.ts`）：`FinanceData = { schemaVersion, snapshots: Snapshot[] }`，每個 `Snapshot` 以 `date`（"YYYY-MM-DD"）為顆粒度，同日覆蓋、跨日新增（見 `upsertSnapshot`）。修改 schema 時務必同步遞增 `CURRENT_SCHEMA_VERSION`（現為 9）並在 `src/lib/storage.ts` 補上 `migrateVxToVy` 遷移函式，同時串進 `migrateFinanceData` 的完整遷移鏈（現有範例：`migrateV1ToV2` ... `migrateV8ToV9`）。
- **draft vs. 已存檔資料**：`useLocalSnapshots` 內部維護 `draft`（當日編輯中的快照，未存檔前只存在於 React state）與 `financeData`（已持久化到 LocalStorage 的全部快照）。`isDirty` 用兩者的 JSON 字串比較判斷。使用者按下「更新儀表板」才會呼叫 `save()` 真正寫入 `persistFinanceData`；重新整理頁面會遺失未存檔的 draft（這是刻意行為，e2e 有覆蓋此案例）。
  - **未存檔離開提醒**：`hasUnsavedEdits` 與 `isDirty` 不同——它拿 `draft` 去比對 `baseline`（草稿最近一次由程式載入時的內容），所以「系統帶入、使用者沒動過」的今日草稿雖然 `isDirty`，卻不算未存檔編輯。只有 `hasUnsavedEdits` 為 true 時才註冊 `beforeunload`。凡是以程式取代草稿的地方都要走 `loadDraft()`（同時重設 `baseline`），不可直接 `setDraft`。
  - **寫入失敗**：`persistFinanceData` 回傳 `boolean`、不拋例外；`save`／`deleteSnapshot`／`importBackup` 寫入失敗時回 `{ ok: false, reason }` 且不更新任何 state（草稿維持未存檔，可重試）。`loadFinanceData`／`loadLastBackupAt`／`recordBackupNow` 同樣吞掉 LocalStorage 例外。
  - **多分頁同步**：監聽 `storage` 事件，其他分頁寫入後由 `syncFromStorage` 重新讀取 `financeData`；草稿沒有未存檔編輯才跟著更新，被修正的快照若已被刪除則自動離開修正模式。
  - **跨日換日**：`currentDate` 是 state 不是常數，`syncCurrentDate` 在 `visibilitychange`／`focus` 與每次 `save()` 時重新判斷今天；存檔日期一律取當下的今天。
  - **修正／刪除歷史快照**：一般狀態下表單永遠是今天；要修正過去某天，須由「歷史快照」清單進入**修正模式**（`startEditing(date)`）——此時 `draft` 載入該日快照（`editingDate` 不為 null、`draft.date` 為被修正的日期），今日草稿暫存在 hook 內的 `stashedDraftRef`（只存記憶體），`save()` 只覆蓋該日並自動 `leaveEditing()` 還原今日草稿；`isDirty` 因此是拿 `draft.date` 去比對已存檔快照，不可寫死 `currentDate`。`deleteSnapshot(date)` 只移除該日、不更新上次備份時間；兩者在 `version-mismatch` 下都會拒絕。`importBackup`／`clearAllData` 會一併重置修正模式。
- **當日表單自動帶入最近一筆資料**：`buildInitialDraft` 在當天尚無快照時，複製最近一筆快照的數值作為初始 draft（日期/時間戳改為今天）。負債清單會額外呼叫 `advanceDebtsByMonths` 依曆月差自動攤還本息、遞減剩餘期數（本息平均攤還會重算剩餘本金，只計息只減期數），並回傳 `estimatedFields` 標記哪些欄位是系統估算；使用者手動修改該筆負債的本金或期數後，`updateDebts` 會清除該筆的估算標記。
- **快照備註**（`Snapshot.note`，PRD 4.2「快照備註」）：每筆快照一行文字（空字串＝沒有備註），只供顯示、**不參與任何計算**，也刻意不寫入快照比較與 AI 提示詞（可能含個人資訊）。輸入元件為 `SnapshotNoteInput`，放在四個可收合區塊之外、「更新儀表板」按鈕之上。
  - **備註屬於那一天，不沿用**：`buildInitialDraft` 帶入最近一筆資料時一律把 `note` 設為 `""`；跨日換日保留有編輯的草稿時走 `moveDraftToDate`——使用者沒改過的備註（與 `baseline` 相同）不帶到新的一天。`save()` 剛好在存檔當下才換日時也套用同一條規則（此時 hook 內的 `draft` 還是換日前的內容）。
  - **正規化集中在 `src/lib/snapshotNote.ts` 的 `normalizeSnapshotNote`**（去前後空白、連續空白併成一個空格、截到 `SNAPSHOT_NOTE_MAX_LENGTH` 50 字、非字串視為空）：`save()` 寫入前與所有顯示處（`TrendSection`、`SnapshotHistory`）共用，輸入過程不做正規化。
  - **顯示**：`TrendSection` 把 `note` 放進每張圖的 `points`，三種圖表以共用的 `charts/ChartNote.tsx` 呈現——`ChartNoteMarker`（圓環，`data-testid="chart-note-marker-{i}"`，索引與 `chart-node-{i}` 對應；折線圖套在節點外，長條圖與堆疊面積圖畫在繪圖區上緣之上並帶圓心）與 `ChartTooltipNote`（Tooltip 最後一行「備註：…」，`chart-tooltip-note`）。歷史快照清單在日期下方顯示（`snapshot-note-{date}`）。
- **趨勢圖範圍**：`TrendRange = 7 | 30 | 90 | 365 | "ytd" | "all"`（選單依序為 7 天／30 天／90 天／1 年／今年以來／全部，預設 90，只存在 React state）。數字走 `getSnapshotsInRange`（最近 N 天含今天）、`"ytd"` 走 `getSnapshotsYearToDate`（今天所屬年份的 1 月 1 日起），兩者的「今天」都傳入 hook 的 `currentDate`，跨日／跨年換日後範圍跟著移動。篩選結果 `visibleSnapshots` 由趨勢圖與「複製 AI 分析提示詞」共用；歷史快照清單、快照比較、目標達成時間預估用的是全部快照（`snapshots`），不受範圍影響。趨勢圖區分頁上方的「淨資產成長率與最大回撤」摘要同樣以 `visibleSnapshots` 計算，跟著範圍連動（見 [calculations.md](calculations.md) 同名小節）。新增選項時要同步改 `TrendSection.tsx` 的 `RANGE_OPTIONS`。
- **讀取狀態機**：`parseFinanceData`（`src/lib/storage.ts`）回傳 `LoadResult`（`empty` / `ok` / `corrupted` / `version-mismatch`），從不拋出例外（瀏覽器拒絕存取 LocalStorage 時 `loadFinanceData` 回 `empty`）。`version-mismatch` 時 UI 會暫停顯示與存檔功能，避免覆蓋使用者既有但版本不相容的資料——修改此邏輯要格外小心，因為它是防止資料遺失的最後防線。

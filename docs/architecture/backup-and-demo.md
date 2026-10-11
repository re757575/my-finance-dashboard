# 備份／還原、範例資料與 PWA

已存檔資料整批進出的路徑：匯出與匯入（含加密、拖曳）、範例資料、PWA 快取。狀態模型見 [data-flow.md](data-flow.md)。

- **備份／還原**（`src/lib/backup.ts`）：匯出用 Blob + `<a download>` 純前端觸發下載；匯入透過 `parseBackupFile` 走與 LocalStorage 讀取相同的 `parseFinanceData` 驗證規則。清空全部資料前，UI 層必須強制先呼叫 `exportBackup()`，`clearAllData()` 本身不做備份。
  - **加密匯出**（`src/lib/backupCrypto.ts`）：WebCrypto PBKDF2-SHA256（600,000 次）＋AES-GCM，輸出 JSON 信封（`.enc.json`，格式見 PRD 6.2 節）；`parseBackupFile(file, password?)` 偵測到信封時，未給密碼回 `encrypted`、密碼錯誤或被竄改回 `wrong-password`，解密後仍走同一個 `parseFinanceData`。密碼只經參數傳遞，絕不寫入任何儲存位置；清空前的強制備份維持明文匯出。
  - **拖曳檔案匯入**（`src/hooks/useFileDrop.ts`，PRD 4.2「匯入還原」）：`DataManagement` 以 `useFileDrop` 監聽整個視窗的檔案拖放，放開單一檔案只是開啟與按鈕選檔相同的二次確認對話框（顯示檔名），之後仍走 `onImport`；多個檔案不猜測、改在資料管理區顯示錯誤。只處理 `dataTransfer.types` 含 `"Files"` 的拖曳，且**一律 `preventDefault`**（否則瀏覽器會直接開啟檔案、離開頁面而遺失未存檔草稿）；已有對話框開啟時（以 `[data-slot="dialog-content"][data-state="open"]` 判斷）不顯示遮罩也不接受。遮罩以 portal 掛在 `document.body`。`parseBackupFile` 讀不出檔案（例如拖進來的是資料夾）回 `corrupted`、不拋例外。
  - **上次備份時間**存在獨立的 LocalStorage 鍵 `my_finance_dashboard_last_backup`（`storage.ts` 的 `recordBackupNow`／`loadLastBackupAt`），不屬於快照 schema、不隨備份匯出；匯入還原不更新它，清空資料時一併清除。
  - **備份提醒與資料新鮮度**的純函式在 `src/lib/dataFreshness.ts`（`getBackupReminder` 超過 30 天提醒、`getDataFreshness` 超過 14 天標示過期，門檻為固定常數），只看已存檔快照，不看今日草稿。
- **範例資料**（`src/lib/demoData.ts`，PRD 4.2「範例資料」）：沒有任何已存檔快照時（hook 的 `canLoadDemo`；`version-mismatch` 與初次讀取完成前為 false），`DemoDataOffer` 邀請卡讓使用者一鍵載入範例資料。
  - **來源就是 [fixtures/finance-data.json](../../fixtures/finance-data.json)**：`loadDemoFinanceData` 以動態 `import("…?raw")` 切成獨立的同源 chunk（按下按鈕才載入、PWA 會預先快取，不發出對外請求），走同一個 `parseFinanceData`，再由 `shiftSnapshotsToDate` 把所有快照日期整體平移到最新一筆落在今天（間隔與數值不變）。
  - **範例模式標記**存在獨立的 LocalStorage 鍵 `my_finance_dashboard_demo`（`storage.ts` 的 `loadDemoMode`／`persistDemoMode`／`clearDemoMode`，皆吞掉例外），不屬於快照 schema、不隨備份匯出。hook 回傳的 `isDemo`＝有標記**且**有快照；為 true 時 `App.tsx` 顯示 `DemoDataBanner`、不顯示備份提醒橫幅，其餘功能照常。
  - **`loadDemoData()` 絕不覆蓋既有快照**：寫入前重新讀取 LocalStorage，已有快照或版本不相容一律拒絕；先寫標記再寫資料，失敗時收回標記並回 `{ ok: false, reason }`、不更新任何 state。成功後與 `importBackup` 共用 `applyReplacedData()` 重置修正模式與草稿，並把趨勢圖範圍切到 1 年（只存在 state）。
  - **結束範例模式**：橫幅的「清除範例資料」二次確認後直接呼叫 `clearAllData()`——這是「清空前必須先強制匯出」的唯一例外（虛構資料可重新載入）。`clearAllData`、`importBackup` 成功、以及 `save()` 從零筆快照開始存檔時都會清除標記；`storage` 事件會同步其他分頁的標記變化。
- **PWA**（`vite-plugin-pwa`）：`registerType: "prompt"` 只快取建置產出的同源靜態檔案，不新增任何對外網路請求，符合零伺服器傳輸原則；更新提示 UI 見 `src/components/PwaUpdatePrompt.tsx`。

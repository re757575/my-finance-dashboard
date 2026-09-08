# 變更紀錄

本檔案由 [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) 依照 [Conventional Commits](https://www.conventionalcommits.org/) 規範的 commit 訊息自動產生，請勿手動編輯內容，執行 `npm run release` 即可更新。

## 0.1.0 (2026-09-08)

### ⚠ BREAKING CHANGES

- **儀表板:** schemaVersion 升級為 4，Snapshot.month（YYYY-MM）
  改為 Snapshot.date（YYYY-MM-DD）。新增 migrateV3ToV4，日期取自舊
  快照 updatedAt 的實際日期，使用者既有資料會在讀取時自動遷移，
  無需手動處理。

### Features

- **儀表板:** 新增一鍵複製 AI 分析提示詞功能 ([9f9575f](https://github.com/re757575/my-finance-dashboard/commit/9f9575fde56fd55a1735dc0188e52eeb099a2021))
- **儀表板:** 新增現金比例卡片 ([4b0f67c](https://github.com/re757575/my-finance-dashboard/commit/4b0f67cb6d07925ca855515ca29440ea6d824abc))
- **儀表板:** 新增畫面 footer 顯示版本號 ([f023a8e](https://github.com/re757575/my-finance-dashboard/commit/f023a8ee9c321b827605141c03b922c15730c7d9))
- **儀表板:** 新增緊急預備金月數、儲蓄率與資產配置比例三項財務健康指標 ([216af05](https://github.com/re757575/my-finance-dashboard/commit/216af05ee67df50ca19ce5976fdb548d1dfa2e98))
- **儀表板:** 歷史趨勢圖新增節點 tooltip 與全螢幕檢視 ([d7293c8](https://github.com/re757575/my-finance-dashboard/commit/d7293c8d76a53caa4c097e57e218ca318221cb33))
- **儀表板:** 歷史趨勢快照顆粒度由月改為日 ([1b83dcc](https://github.com/re757575/my-finance-dashboard/commit/1b83dccaf113006bfdd9c5e6f416435361e14628))
- **儀表板:** 負債剩餘本金與期數改為自動估算 ([a305157](https://github.com/re757575/my-finance-dashboard/commit/a305157faf6a99117226a235f9ae04129a32482e))
- **儀表板:** 負債改為類別化清單並自動計算月付、新增多筆收入欄位 ([da17a86](https://github.com/re757575/my-finance-dashboard/commit/da17a863ab737bf912cc55a6649ab3ad464a78e9))
- 建立 Vite + React 前端專案骨架並加入 pre-commit 品質檢查 ([eda0eda](https://github.com/re757575/my-finance-dashboard/commit/eda0eda7901a309c4b35db800cf1c344910d1963))
- 美股市值支援 USD/TWD 計價幣別切換 ([2427101](https://github.com/re757575/my-finance-dashboard/commit/242710129d5ee64c6714a7c8f56fea06af1f964a))

### Bug Fixes

- 修正數字輸入框殘留 0 及可繞過負數/非數字防呆的問題 ([6e66775](https://github.com/re757575/my-finance-dashboard/commit/6e66775d0e4eca016af3af4e22eae8368d214048))

### Build System

- 新增 commit-and-tag-version 產生 CHANGELOG 與指定升版範圍的 npm script ([4b3f3e0](https://github.com/re757575/my-finance-dashboard/commit/4b3f3e09273f0f445ef78abc3ee1c623cb992159))

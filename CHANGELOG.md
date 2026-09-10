# 變更紀錄

本檔案由 [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) 依照 [Conventional Commits](https://www.conventionalcommits.org/) 規範的 commit 訊息自動產生，請勿手動編輯內容，執行 `npm run release` 即可更新。

## [0.3.6](https://github.com/re757575/my-finance-dashboard/compare/v0.3.5...v0.3.6) (2026-09-10)

## [0.3.5](https://github.com/re757575/my-finance-dashboard/compare/v0.3.4...v0.3.5) (2026-09-10)

### Features

- **儀表板:** 歷史趨勢圖新增現金趨勢與股票趨勢卡片 ([8e5d1d7](https://github.com/re757575/my-finance-dashboard/commit/8e5d1d7486f3177cb12ca5b07bbb6da1fbdf7226))

## [0.3.4](https://github.com/re757575/my-finance-dashboard/compare/v0.3.3...v0.3.4) (2026-09-09)

### Features

- **儀表板:** 淨資產趨勢圖新增目標淨資產參考線 ([f8af138](https://github.com/re757575/my-finance-dashboard/commit/f8af13838c0ed9e5122fbf22283d812e9c684e41))
- **儀表板:** 趨勢圖全螢幕檢視新增 Y 軸金額刻度 ([64f8eab](https://github.com/re757575/my-finance-dashboard/commit/64f8eab00bbc043a9cd33e8dddf7156893ff7966))

## [0.3.3](https://github.com/re757575/my-finance-dashboard/compare/v0.3.2...v0.3.3) (2026-09-09)

### Features

- **儀表板:** 淨資產趨勢圖新增與上一筆比對增減 ([3b1108d](https://github.com/re757575/my-finance-dashboard/commit/3b1108d44ab2bd7efbf4f6392931d8b99f890050))
- **儀表板:** 淨資產趨勢圖節點新增與最新一筆比對的增減 ([3151a74](https://github.com/re757575/my-finance-dashboard/commit/3151a74274ed66f8e9a612c2bd413a343ff074bd))

### Bug Fixes

- **儀表板:** 修正全螢幕趨勢圖節點 tooltip 被裁切的問題 ([51ac524](https://github.com/re757575/my-finance-dashboard/commit/51ac524784f2cd39db972a30c1aa2ab94f0d423c))

## [0.3.2](https://github.com/re757575/my-finance-dashboard/compare/v0.3.1...v0.3.2) (2026-09-08)

### Features

- **儀表板:** 趨勢圖全螢幕展開時嘗試自動鎖定橫向 ([257dcae](https://github.com/re757575/my-finance-dashboard/commit/257dcaeeb202a07cf42d348a4cea918a61264ff0))

## [0.3.1](https://github.com/re757575/my-finance-dashboard/compare/v0.3.0...v0.3.1) (2026-09-08)

### Features

- **儀表板:** 新增 PWA 支援，可安裝到主畫面並離線開啟 ([d303630](https://github.com/re757575/my-finance-dashboard/commit/d30363069b7049fd38b65270a1a07e982b592b4e))

## [0.3.0](https://github.com/re757575/my-finance-dashboard/compare/v0.2.2...v0.3.0) (2026-09-08)

### ⚠ BREAKING CHANGES

- **儀表板:** AI 分析提示詞新增負債清償策略、定期回顧報告、資產配置再平衡建議三種模式

### Features

- **儀表板:** AI 分析提示詞新增負債清償策略、定期回顧報告、資產配置再平衡建議三種模式 ([b1ab13f](https://github.com/re757575/my-finance-dashboard/commit/b1ab13f06ea150de951678f44fee572a81921fff))

## [0.2.2](https://github.com/re757575/my-finance-dashboard/compare/v0.2.1...v0.2.2) (2026-09-08)

### Features

- **儀表板:** AI 分析提示詞新增多模式，加入投資方向評估 ([68493c2](https://github.com/re757575/my-finance-dashboard/commit/68493c2f810e781dc2cb067341825f5315b401b0))

## [0.2.1](https://github.com/re757575/my-finance-dashboard/compare/v0.2.0...v0.2.1) (2026-09-08)

### Features

- **儀表板:** 目標淨資產輸入框新增建議值計算公式說明 ([afdbe37](https://github.com/re757575/my-finance-dashboard/commit/afdbe376ddd8779b4dc9d723a195855a0097e4ab))

## [0.2.0](https://github.com/re757575/my-finance-dashboard/compare/v0.1.0...v0.2.0) (2026-09-08)

### ⚠ BREAKING CHANGES

- **儀表板:** 新增 FIRE／淨資產目標進度

### Features

- **儀表板:** 所有現況卡片新增計算公式說明 icon ([fd92fce](https://github.com/re757575/my-finance-dashboard/commit/fd92fcef89e7f3e2ac177cabe9ad7492ba5b5118))
- **儀表板:** 新增 FIRE／淨資產目標進度 ([934e363](https://github.com/re757575/my-finance-dashboard/commit/934e363c3d36d4525b718f610218ed9227baa019))

### Bug Fixes

- **儀表板:** 修正卡片標題在寬螢幕被狀態徽章擠到換行的問題 ([fd642da](https://github.com/re757575/my-finance-dashboard/commit/fd642dadc08f6ff4e8bc0b1b7052ecdef54c99a1))
- **儀表板:** 狀態徽章空間不足時整段換行，不再截斷文字 ([c006527](https://github.com/re757575/my-finance-dashboard/commit/c00652773f1fd2e3ef8496cf6cf2bd38d7fb7019))

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

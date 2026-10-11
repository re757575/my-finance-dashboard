# 深色模式

主題偏好的儲存與套用（`src/lib/theme.ts`、`src/hooks/useTheme.ts`），以及新增或修改元件時必須遵守的淺色／深色 class 對應表。

主題偏好為「跟隨系統（預設）／淺色／深色」，解析後以 `<html>` 的 `dark` class 套用（`src/index.css` 的 `@custom-variant dark` 與 shadcn 的 `.dark` CSS 變數）。規格見 [docs/PRD.md](../PRD.md) 4.2「深色模式」、6.2、7 節。

- **偏好儲存**：獨立的 LocalStorage 鍵 `my_finance_dashboard_theme`（`"system"`／`"light"`／`"dark"`），不屬於快照 schema、不隨備份匯出、匯入還原不影響；**「清空本地資料」也不清除它**（介面偏好不是財務資料），所以 `clearAllData()` 不可改成 `localStorage.clear()`。`loadThemePreference`／`persistThemePreference` 吞掉 LocalStorage 例外，內容不合法視為 `"system"`。
- **`useTheme`** 與 `useLocalSnapshots` 完全獨立，同樣只由 `App.tsx` 消費，再以 props 傳給頁首的 `ThemeToggle`（原生 `<select aria-label="顯示主題">`）。它監聽 `matchMedia("(prefers-color-scheme: dark)")` 的變化（跟隨系統時即時切換）與 `storage` 事件（其他分頁變更後同步）。
- **防閃爍**：`index.html` 的 `<head>` 有一段內嵌 script，在首次繪製前依偏好與系統設定加上 `dark` class。它無法 import `theme.ts`，鍵名與判斷邏輯是手動保持一致的——改其中一邊要同步改另一邊（`theme.test.ts` 會實際執行該段 script 比對兩邊結果）。同源靜態內容，不發出任何網路請求。
- **新增或修改元件時必須同時提供深色樣式**：保留淺色 class、在同一個 class 字串內緊接著補上 `dark:` 變體（淺色外觀不可因此改變）。`src/components/darkModeCoverage.test.ts` 會掃描 `App.tsx` 與業務元件，寫死的淺色 class 若沒有對應的 `dark:` 變體會直接讓測試失敗。對應規則：

  | 用途                         | 淺色                                                                         | 深色                                                                      |
  | ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
  | 頁面背景／卡片               | `bg-[#F9FAFB]`／`bg-white`                                                   | `dark:bg-background`／`dark:bg-card`                                      |
  | 內襯（空狀態）／軌道、灰徽章 | `bg-slate-50`／`bg-slate-100`                                                | `dark:bg-muted/50`／`dark:bg-muted`                                       |
  | 邊框、分隔線                 | `border-slate-200`、`border-slate-100`、`divide-slate-100`、`ring-slate-200` | `dark:border-border`、`dark:divide-border`、`dark:ring-border`            |
  | 原生 `<select>`              | `border-slate-200 bg-white`                                                  | `dark:border-input dark:bg-input/30`                                      |
  | 文字（由深到淺）             | `text-slate-900`／`800`／`700`／`600`／`500`／`400`                          | `dark:text-neutral-50`／`100`／`200`／`300`／`400`／`400`                 |
  | 圖表座標文字／格線／參考線   | `fill-slate-400`／`text-slate-100`／`text-slate-300`                         | `dark:fill-neutral-400`／`dark:text-neutral-800`／`dark:text-neutral-600` |
  | 狀態徽章、提示橫幅           | `bg-{色}-50` ＋ `text-{色}-700`（橫幅 `text-amber-800`）                     | `dark:bg-{色}-950` ＋ `dark:text-{色}-300`（橫幅 `dark:text-amber-200`）  |
  | 強調文字（負數、增減）       | `text-rose-600`、`text-emerald-600`、`text-amber-600`                        | `dark:text-rose-400`、`dark:text-emerald-400`、`dark:text-amber-400`      |
  | 選中的分段切換鈕             | `bg-slate-900 text-white`                                                    | `dark:bg-neutral-100 dark:text-neutral-900`                               |

  `{色}` 為 amber／rose／emerald／green／sky。進度條、燈號圓點與圖表數列的填色（`bg-*-500`、`text-*-500`、`fill-*`、資產配置色塊的 `*-600`／`slate-500`）及疊在色塊上的 `text-white` 深淺色共用，不需對應。深色下的文字下限是 `neutral-400`（`neutral-500` 在卡片上對比不足 WCAG AA）。hover 等變體寫成 `dark:hover:…`。

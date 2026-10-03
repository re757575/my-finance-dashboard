/**
 * 介面主題偏好（PRD 4.2「深色模式」、6.2 節）：獨立於快照 schema，不隨備份匯出、
 * 匯入還原不影響、清空本地資料也不清除（它是介面偏好，不是財務資料）。
 * 鍵名與判斷邏輯需與 `index.html` 內嵌的防閃爍 script 保持一致。
 */
export const THEME_STORAGE_KEY = "my_finance_dashboard_theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
/** 實際套用到畫面的主題（「跟隨系統」解析後的結果）。 */
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
/** 套用在 `<html>` 上的 class，對應 `src/index.css` 的 `@custom-variant dark`。 */
export const DARK_CLASS = "dark";

export const THEME_PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: "跟隨系統",
  light: "淺色",
  dark: "深色",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return (THEME_PREFERENCES as readonly unknown[]).includes(value);
}

/** 鍵不存在或內容不合法一律視為「跟隨系統」。 */
export function parseThemePreference(raw: string | null): ThemePreference {
  return isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
}

/** 讀取主題偏好；瀏覽器拒絕存取 LocalStorage 時視為「跟隨系統」，不拋出例外。 */
export function loadThemePreference(): ThemePreference {
  let raw: string | null;
  try {
    raw = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
  return parseThemePreference(raw);
}

/**
 * 寫入主題偏好；儲存空間已滿或被停用時回傳 false 而不拋出例外，
 * 呼叫端仍可在本次瀏覽套用所選主題，只是重新整理後不保留。
 */
export function persistThemePreference(preference: ThemePreference): boolean {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/** 系統目前是否偏好深色；環境不支援 `matchMedia` 時視為淺色。 */
export function getSystemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** 依解析後的主題加上／移除 `<html>` 的 `dark` class。 */
export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement
): void {
  root.classList.toggle(DARK_CLASS, theme === "dark");
}

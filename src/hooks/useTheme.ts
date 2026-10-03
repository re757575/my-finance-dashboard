import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  DARK_MEDIA_QUERY,
  getSystemPrefersDark,
  loadThemePreference,
  persistThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

/**
 * 介面主題（PRD 4.2「深色模式」）：偏好為「跟隨系統／淺色／深色」，
 * 解析後以 `<html>` 的 `dark` class 套用。與 `useLocalSnapshots` 完全獨立——
 * 主題是介面偏好，不屬於財務資料，也不受匯入還原、清空本地資料影響。
 */
export function useTheme(): {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
} {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(loadThemePreference);
  const [systemPrefersDark, setSystemPrefersDark] =
    useState(getSystemPrefersDark);

  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // 系統設定在頁面開啟期間改變時即時跟著切換；偏好為淺色／深色時只更新紀錄、不影響畫面
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    // 掛上監聽前系統設定可能已經變了，先對齊一次
    setSystemPrefersDark(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  // 其他分頁變更主題後同步（比照 useLocalSnapshots 的多分頁同步）
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      // key 為 null 代表整個 LocalStorage 被清空
      if (event.key === null || event.key === THEME_STORAGE_KEY) {
        setPreferenceState(loadThemePreference());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    // 寫入失敗（儲存空間已滿或被停用）時本次瀏覽仍套用所選主題，只是重新整理後不保留
    persistThemePreference(next);
    setPreferenceState(next);
  }, []);

  return { preference, resolvedTheme, setPreference };
}

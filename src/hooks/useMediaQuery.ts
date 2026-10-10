import { useCallback, useSyncExternalStore } from "react";

/**
 * 單欄版面（視窗寬度 < 1024px）：與 Tailwind `lg:` 斷點互補，`App.tsx` 用它決定
 * 單欄時的區塊順序與進入修正模式的捲動目標（PRD 第 7 節「版面佈局」）。
 */
export const SINGLE_COLUMN_QUERY = "not all and (min-width: 64rem)";

/** 訂閱 CSS media query 是否成立；環境不支援 `matchMedia` 時一律為 false。 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
    () => false
  );
}

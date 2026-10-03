import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "@/hooks/useTheme";
import { STORAGE_KEY } from "@/lib/storage";
import { DARK_MEDIA_QUERY, THEME_STORAGE_KEY } from "@/lib/theme";

type ChangeListener = (event: MediaQueryListEvent) => void;

/** 可由測試控制的 `prefers-color-scheme` 假媒體查詢（jsdom 未實作 matchMedia）。 */
function stubSystemTheme(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<ChangeListener>();
  const query = {
    get matches() {
      return matches;
    },
    media: DARK_MEDIA_QUERY,
    addEventListener: vi.fn((_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    }),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query)
  );
  return {
    query,
    listenerCount: () => listeners.size,
    /** 模擬使用者在作業系統切換深／淺色。 */
    setDark(next: boolean) {
      matches = next;
      act(() => {
        for (const listener of listeners) {
          listener({ matches: next } as MediaQueryListEvent);
        }
      });
    },
  };
}

/** 模擬另一個分頁寫入（或移除）LocalStorage 後，本分頁收到的 storage 事件。 */
function otherTabWrites(key: string | null, value: string | null) {
  if (key === null) localStorage.clear();
  else if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key, storageArea: localStorage })
    );
  });
}

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html.classList.remove("dark");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  html.classList.remove("dark");
});

// PRD 4.2「深色模式」、第 9 節 #59a～#59i
describe("useTheme", () => {
  describe("初始狀態", () => {
    it("從未設定過：偏好為跟隨系統，系統為淺色時不加 dark class", () => {
      stubSystemTheme(false);

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("system");
      expect(result.current.resolvedTheme).toBe("light");
      expect(html).not.toHaveClass("dark");
    });

    it("從未設定過且系統為深色：加上 dark class", () => {
      stubSystemTheme(true);

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("system");
      expect(result.current.resolvedTheme).toBe("dark");
      expect(html).toHaveClass("dark");
    });

    it("已存偏好為深色：即使系統為淺色也套用深色", () => {
      stubSystemTheme(false);
      localStorage.setItem(THEME_STORAGE_KEY, "dark");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("dark");
      expect(result.current.resolvedTheme).toBe("dark");
      expect(html).toHaveClass("dark");
    });

    it("已存偏好為淺色：即使系統為深色也套用淺色，並移除防閃爍 script 先加上的 dark class", () => {
      stubSystemTheme(true);
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      html.classList.add("dark");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("light");
      expect(result.current.resolvedTheme).toBe("light");
      expect(html).not.toHaveClass("dark");
    });

    it("儲存的內容不合法：視為跟隨系統", () => {
      stubSystemTheme(true);
      localStorage.setItem(THEME_STORAGE_KEY, "purple");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("system");
      expect(html).toHaveClass("dark");
    });

    it("環境不支援 matchMedia：不拋出例外，跟隨系統視為淺色", () => {
      vi.stubGlobal("matchMedia", undefined);

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("system");
      expect(result.current.resolvedTheme).toBe("light");
      expect(html).not.toHaveClass("dark");
    });
  });

  describe("手動切換", () => {
    it("切換為深色：立即加上 dark class 並寫入 LocalStorage", () => {
      stubSystemTheme(false);
      const { result } = renderHook(() => useTheme());

      act(() => result.current.setPreference("dark"));

      expect(result.current.preference).toBe("dark");
      expect(result.current.resolvedTheme).toBe("dark");
      expect(html).toHaveClass("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    });

    it("切換為淺色：移除 dark class 並寫入 LocalStorage", () => {
      stubSystemTheme(true);
      const { result } = renderHook(() => useTheme());
      expect(html).toHaveClass("dark");

      act(() => result.current.setPreference("light"));

      expect(result.current.preference).toBe("light");
      expect(html).not.toHaveClass("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });

    it("切回跟隨系統：寫入 system 並依系統設定套用", () => {
      stubSystemTheme(true);
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      const { result } = renderHook(() => useTheme());
      expect(html).not.toHaveClass("dark");

      act(() => result.current.setPreference("system"));

      expect(result.current.preference).toBe("system");
      expect(html).toHaveClass("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    });

    it("重新掛載（等同重新整理）後保留所選主題", () => {
      stubSystemTheme(false);
      const first = renderHook(() => useTheme());
      act(() => first.result.current.setPreference("dark"));
      first.unmount();
      html.classList.remove("dark");

      const second = renderHook(() => useTheme());

      expect(second.result.current.preference).toBe("dark");
      expect(html).toHaveClass("dark");
    });

    it("切換主題不會動到快照資料", () => {
      stubSystemTheme(false);
      localStorage.setItem(STORAGE_KEY, '{"schemaVersion":7,"snapshots":[]}');
      const { result } = renderHook(() => useTheme());

      act(() => result.current.setPreference("dark"));

      expect(localStorage.getItem(STORAGE_KEY)).toBe(
        '{"schemaVersion":7,"snapshots":[]}'
      );
    });

    // PRD 第 9 節 #59f
    it("寫入 LocalStorage 失敗：不拋出例外，本次瀏覽仍套用所選主題", () => {
      stubSystemTheme(false);
      const { result } = renderHook(() => useTheme());
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });

      act(() => result.current.setPreference("dark"));

      expect(result.current.preference).toBe("dark");
      expect(html).toHaveClass("dark");
    });

    // PRD 第 9 節 #59f
    it("瀏覽器拒絕讀取 LocalStorage：初始視為跟隨系統，不拋出例外", () => {
      stubSystemTheme(true);
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("access denied", "SecurityError");
      });

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("system");
      expect(html).toHaveClass("dark");
    });
  });

  // PRD 第 9 節 #59b
  describe("系統設定變化", () => {
    it("監聽 prefers-color-scheme 媒體查詢，卸載時移除監聽", () => {
      const system = stubSystemTheme(false);

      const { unmount } = renderHook(() => useTheme());

      expect(window.matchMedia).toHaveBeenCalledWith(DARK_MEDIA_QUERY);
      expect(system.listenerCount()).toBe(1);

      unmount();
      expect(system.listenerCount()).toBe(0);
    });

    it("跟隨系統時，系統切到深色即時加上 dark class，切回淺色即時移除", () => {
      const system = stubSystemTheme(false);
      const { result } = renderHook(() => useTheme());

      system.setDark(true);
      expect(result.current.resolvedTheme).toBe("dark");
      expect(html).toHaveClass("dark");

      system.setDark(false);
      expect(result.current.resolvedTheme).toBe("light");
      expect(html).not.toHaveClass("dark");
    });

    it("系統變化不會改寫已存的偏好", () => {
      const system = stubSystemTheme(false);
      const { result } = renderHook(() => useTheme());

      system.setDark(true);

      expect(result.current.preference).toBe("system");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it("偏好為淺色時，系統切到深色不影響畫面", () => {
      const system = stubSystemTheme(false);
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      const { result } = renderHook(() => useTheme());

      system.setDark(true);

      expect(result.current.resolvedTheme).toBe("light");
      expect(html).not.toHaveClass("dark");
    });

    it("偏好為深色時，系統切到淺色不影響畫面", () => {
      const system = stubSystemTheme(true);
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      const { result } = renderHook(() => useTheme());

      system.setDark(false);

      expect(result.current.resolvedTheme).toBe("dark");
      expect(html).toHaveClass("dark");
    });

    it("固定主題期間系統變了，之後切回跟隨系統會採用最新的系統設定", () => {
      const system = stubSystemTheme(false);
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      const { result } = renderHook(() => useTheme());

      system.setDark(true);
      act(() => result.current.setPreference("system"));

      expect(result.current.resolvedTheme).toBe("dark");
      expect(html).toHaveClass("dark");
    });
  });

  // PRD 第 9 節 #59i
  describe("多分頁同步", () => {
    it("另一分頁改為深色：本分頁同步偏好並加上 dark class", () => {
      stubSystemTheme(false);
      const { result } = renderHook(() => useTheme());

      otherTabWrites(THEME_STORAGE_KEY, "dark");

      expect(result.current.preference).toBe("dark");
      expect(html).toHaveClass("dark");
    });

    it("另一分頁改為淺色：本分頁移除 dark class", () => {
      stubSystemTheme(true);
      const { result } = renderHook(() => useTheme());
      expect(html).toHaveClass("dark");

      otherTabWrites(THEME_STORAGE_KEY, "light");

      expect(result.current.preference).toBe("light");
      expect(html).not.toHaveClass("dark");
    });

    it("另一分頁移除主題鍵或清空整個 LocalStorage：回到跟隨系統", () => {
      stubSystemTheme(false);
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      const { result } = renderHook(() => useTheme());
      expect(html).toHaveClass("dark");

      otherTabWrites(THEME_STORAGE_KEY, null);
      expect(result.current.preference).toBe("system");
      expect(html).not.toHaveClass("dark");

      act(() => result.current.setPreference("dark"));
      otherTabWrites(null, null);
      expect(result.current.preference).toBe("system");
      expect(html).not.toHaveClass("dark");
    });

    it("另一分頁寫入不合法的內容：視為跟隨系統", () => {
      stubSystemTheme(false);
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      const { result } = renderHook(() => useTheme());

      otherTabWrites(THEME_STORAGE_KEY, "purple");

      expect(result.current.preference).toBe("system");
      expect(html).not.toHaveClass("dark");
    });

    it("其他鍵（如快照資料）的 storage 事件不影響主題", () => {
      stubSystemTheme(false);
      const { result } = renderHook(() => useTheme());
      act(() => result.current.setPreference("dark"));
      const getItem = vi.spyOn(Storage.prototype, "getItem");

      otherTabWrites(STORAGE_KEY, '{"schemaVersion":7,"snapshots":[]}');

      expect(getItem).not.toHaveBeenCalledWith(THEME_STORAGE_KEY);
      expect(result.current.preference).toBe("dark");
      expect(html).toHaveClass("dark");
    });

    it("sessionStorage 的事件不處理", () => {
      stubSystemTheme(false);
      const { result } = renderHook(() => useTheme());
      localStorage.setItem(THEME_STORAGE_KEY, "dark");

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: THEME_STORAGE_KEY,
            storageArea: sessionStorage,
          })
        );
      });

      expect(result.current.preference).toBe("system");
      expect(html).not.toHaveClass("dark");
    });
  });
});

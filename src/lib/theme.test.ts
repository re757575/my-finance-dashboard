import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  DARK_MEDIA_QUERY,
  getSystemPrefersDark,
  isThemePreference,
  loadThemePreference,
  parseThemePreference,
  persistThemePreference,
  resolveTheme,
  THEME_PREFERENCE_LABEL,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from "@/lib/theme";
import { LAST_BACKUP_KEY, STORAGE_KEY } from "@/lib/storage";
import html from "../../index.html?raw";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

// PRD 4.2「深色模式」、6.2 節
describe("主題偏好的鍵與選項", () => {
  it("使用獨立的鍵 my_finance_dashboard_theme，不同於快照與上次備份時間的鍵", () => {
    expect(THEME_STORAGE_KEY).toBe("my_finance_dashboard_theme");
    expect(THEME_STORAGE_KEY).not.toBe(STORAGE_KEY);
    expect(THEME_STORAGE_KEY).not.toBe(LAST_BACKUP_KEY);
  });

  it("選項依序為跟隨系統／淺色／深色，且各有中文標籤", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "light", "dark"]);
    expect(THEME_PREFERENCE_LABEL).toEqual({
      system: "跟隨系統",
      light: "淺色",
      dark: "深色",
    });
  });
});

describe("parseThemePreference／isThemePreference", () => {
  it("合法值原樣回傳", () => {
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  // PRD 第 9 節 #59e
  it("鍵不存在或內容不合法時視為跟隨系統", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("")).toBe("system");
    expect(parseThemePreference("purple")).toBe("system");
    expect(parseThemePreference("DARK")).toBe("system");
    expect(parseThemePreference('"dark"')).toBe("system");
  });

  it("isThemePreference 只接受三種合法字串", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });
});

describe("loadThemePreference／persistThemePreference", () => {
  it("從未設定過時為跟隨系統", () => {
    expect(loadThemePreference()).toBe("system");
  });

  it("寫入後可讀回，且以純字串存放", () => {
    expect(persistThemePreference("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(loadThemePreference()).toBe("dark");

    expect(persistThemePreference("light")).toBe(true);
    expect(loadThemePreference()).toBe("light");

    expect(persistThemePreference("system")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(loadThemePreference()).toBe("system");
  });

  // PRD 第 9 節 #59e
  it("儲存的內容不合法時視為跟隨系統，不拋錯", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(loadThemePreference()).toBe("system");

    localStorage.setItem(THEME_STORAGE_KEY, "");
    expect(loadThemePreference()).toBe("system");
  });

  it("不影響快照資料與上次備份時間所在的鍵", () => {
    localStorage.setItem(STORAGE_KEY, "{}");
    localStorage.setItem(LAST_BACKUP_KEY, "2026-10-01T00:00:00.000Z");

    persistThemePreference("dark");

    expect(localStorage.getItem(STORAGE_KEY)).toBe("{}");
    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(
      "2026-10-01T00:00:00.000Z"
    );
  });

  // PRD 第 9 節 #59f
  it("瀏覽器拒絕讀取 LocalStorage 時視為跟隨系統，不拋出例外", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });

    expect(loadThemePreference()).toBe("system");
  });

  // PRD 第 9 節 #59f
  it("寫入失敗回傳 false，不拋出例外", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    expect(persistThemePreference("dark")).toBe(false);
  });
});

describe("getSystemPrefersDark", () => {
  it("依 prefers-color-scheme 媒體查詢的結果回傳", () => {
    const matchMedia = vi.fn((query: string) => ({ matches: true, query }));
    vi.stubGlobal("matchMedia", matchMedia);

    expect(getSystemPrefersDark()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(DARK_MEDIA_QUERY);
    expect(DARK_MEDIA_QUERY).toBe("(prefers-color-scheme: dark)");
  });

  it("系統為淺色時回傳 false", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );

    expect(getSystemPrefersDark()).toBe(false);
  });

  it("環境不支援 matchMedia 時視為淺色，不拋出例外", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(getSystemPrefersDark()).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("跟隨系統時依系統設定決定", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("指定淺色或深色時不受系統設定影響", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("深色時為 <html> 加上 dark class，淺色時移除", () => {
    applyTheme("dark");
    expect(document.documentElement).toHaveClass("dark");

    applyTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("重複套用不會產生重複的 class，也不動到其他 class", () => {
    const root = document.createElement("div");
    root.className = "foo";

    applyTheme("dark", root);
    applyTheme("dark", root);
    expect(root.className).toBe("foo dark");

    applyTheme("light", root);
    expect(root.className).toBe("foo");
  });
});

// index.html 的防閃爍 script 無法 import 常數，以測試確保鍵名與媒體查詢沒有和 theme.ts 脫節
describe("index.html 防閃爍 script", () => {
  it("使用與 theme.ts 相同的鍵名與媒體查詢", () => {
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    expect(html).toContain(`window.matchMedia("${DARK_MEDIA_QUERY}")`);
  });

  it("為同源內嵌 script：不載入外部資源、位於應用程式 bundle 之前", () => {
    const inline = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(inline).not.toBeNull();
    expect(inline![1]).not.toMatch(/https?:|fetch\(|XMLHttpRequest|import\(/);
    expect(html.indexOf("<script>")).toBeLessThan(
      html.indexOf('<script type="module"')
    );
  });

  /** 在 jsdom 內實際執行該段 script，回傳 <html> 是否帶有 dark class。 */
  function runInlineScript(): boolean {
    const source = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    document.documentElement.classList.remove("dark");
    new Function(source)();
    return document.documentElement.classList.contains("dark");
  }

  function stubSystem(prefersDark: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: prefersDark }))
    );
  }

  it("解析結果與 loadThemePreference＋resolveTheme 一致", () => {
    const stored = [null, "system", "light", "dark", "purple", ""];
    for (const prefersDark of [true, false]) {
      stubSystem(prefersDark);
      for (const value of stored) {
        localStorage.clear();
        if (value !== null) localStorage.setItem(THEME_STORAGE_KEY, value);

        const expected =
          resolveTheme(loadThemePreference(), prefersDark) === "dark";
        expect(runInlineScript(), `${value}／系統深色=${prefersDark}`).toBe(
          expected
        );
      }
    }
  });

  it("LocalStorage 或 matchMedia 不可用時不拋出例外", () => {
    stubSystem(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });
    expect(runInlineScript()).toBe(true);

    vi.stubGlobal("matchMedia", undefined);
    expect(() => runInlineScript()).not.toThrow();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SINGLE_COLUMN_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";

type ChangeListener = () => void;

/** 可由測試控制的假媒體查詢（jsdom 未實作 matchMedia）。 */
function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<ChangeListener>();
  const matchMedia = vi.fn((media: string) => ({
    get matches() {
      return matches;
    },
    media,
    addEventListener: (_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    },
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    listenerCount: () => listeners.size,
    set(next: boolean) {
      matches = next;
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("環境不支援 matchMedia 時一律為 false（jsdom 視為雙欄版面）", () => {
    const { result } = renderHook(() => useMediaQuery(SINGLE_COLUMN_QUERY));
    expect(result.current).toBe(false);
  });

  it("回傳媒體查詢目前是否成立", () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery(SINGLE_COLUMN_QUERY));

    expect(result.current).toBe(true);
    expect(media.matchMedia).toHaveBeenCalledWith(SINGLE_COLUMN_QUERY);
  });

  it("視窗跨過斷點時即時更新", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery(SINGLE_COLUMN_QUERY));
    expect(result.current).toBe(false);

    media.set(true);
    expect(result.current).toBe(true);

    media.set(false);
    expect(result.current).toBe(false);
  });

  it("卸載後移除監聽", () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery(SINGLE_COLUMN_QUERY));
    expect(media.listenerCount()).toBe(1);

    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it("單欄查詢與 Tailwind 的 lg 斷點（64rem）互補", () => {
    expect(SINGLE_COLUMN_QUERY).toBe("not all and (min-width: 64rem)");
  });
});

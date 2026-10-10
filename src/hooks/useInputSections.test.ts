import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useInputSections } from "@/hooks/useInputSections";

// PRD 4.2「輸入區分段收合」第 3、6 點、第 9 節 #70a～#70c、#70g、#70h

const ALL_OPEN = { assets: true, debts: true, cashFlow: true, goals: true };
const RETURNING = { assets: true, debts: false, cashFlow: false, goals: false };

type Props = Parameters<typeof useInputSections>[0];

const loaded = (overrides: Partial<Props> = {}): Props => ({
  hasLoaded: true,
  hasSnapshots: true,
  hasPledgeDebt: false,
  ...overrides,
});

function setup(initialProps: Props) {
  return renderHook((props: Props) => useInputSections(props), {
    initialProps,
  });
}

describe("useInputSections", () => {
  it("讀取完成前全部展開", () => {
    const { result } = setup(loaded({ hasLoaded: false, hasSnapshots: false }));

    expect(result.current.open).toEqual(ALL_OPEN);
  });

  it("首次使用（沒有已存檔快照）：四個區塊全部展開", () => {
    const { result } = setup(loaded({ hasSnapshots: false }));

    expect(result.current.open).toEqual(ALL_OPEN);
  });

  it("回訪（已有已存檔快照）：只展開「資產」", () => {
    const { result } = setup(loaded());

    expect(result.current.open).toEqual(RETURNING);
  });

  it("回訪且有質押負債：「負債」也展開", () => {
    const { result } = setup(loaded({ hasPledgeDebt: true }));

    expect(result.current.open).toEqual({ ...RETURNING, debts: true });
  });

  it("讀取完成的那一刻才決定預設值", () => {
    const { result, rerender } = setup(
      loaded({ hasLoaded: false, hasSnapshots: false })
    );

    rerender(loaded());

    expect(result.current.open).toEqual(RETURNING);
  });

  it("toggle 只切換指定的區塊，其餘不變", () => {
    const { result } = setup(loaded());

    act(() => result.current.toggle("debts"));
    expect(result.current.open).toEqual({ ...RETURNING, debts: true });

    act(() => result.current.toggle("assets"));
    expect(result.current.open).toEqual({
      ...RETURNING,
      assets: false,
      debts: true,
    });

    act(() => result.current.toggle("debts"));
    expect(result.current.open.debts).toBe(false);
  });

  it("存下第一筆快照不會讓展開中的區塊收合", () => {
    const { result, rerender } = setup(loaded({ hasSnapshots: false }));

    rerender(loaded({ hasSnapshots: true }));

    expect(result.current.open).toEqual(ALL_OPEN);
  });

  it("預設值決定後，負債清單有無質押的變化不影響展開狀態", () => {
    const { result, rerender } = setup(loaded({ hasPledgeDebt: true }));

    rerender(loaded({ hasPledgeDebt: false }));
    expect(result.current.open.debts).toBe(true);

    const other = setup(loaded());
    other.rerender(loaded({ hasPledgeDebt: true }));
    expect(other.result.current.open.debts).toBe(false);
  });

  it("清空到沒有任何快照後全部展開，包含使用者手動收合的區塊", () => {
    const { result, rerender } = setup(loaded());
    act(() => result.current.toggle("assets"));
    expect(result.current.open.assets).toBe(false);

    rerender(loaded({ hasSnapshots: false }));

    expect(result.current.open).toEqual(ALL_OPEN);
  });

  it("重新渲染（如表單輸入）不會重設使用者切換過的狀態", () => {
    const { result, rerender } = setup(loaded());
    act(() => result.current.toggle("goals"));

    rerender(loaded());

    expect(result.current.open).toEqual({ ...RETURNING, goals: true });
  });
});

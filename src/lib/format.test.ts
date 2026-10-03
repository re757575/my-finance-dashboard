import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatMonthAfter,
  formatPercent,
  formatShortDate,
  formatYearsAndMonths,
} from "@/lib/format";

describe("formatCurrency", () => {
  it("加上千分位與 $ 前綴", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000");
    expect(formatCurrency(0)).toBe("$0");
  });

  it("負數以 -$ 開頭", () => {
    expect(formatCurrency(-50000)).toBe("-$50,000");
  });

  it("四捨五入到整數", () => {
    expect(formatCurrency(1000.6)).toBe("$1,001");
    expect(formatCurrency(1000.4)).toBe("$1,000");
  });
});

describe("formatPercent", () => {
  it("保留一位小數並加上 %", () => {
    expect(formatPercent(39.999)).toBe("40.0%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(60)).toBe("60.0%");
  });
});

describe("formatShortDate", () => {
  it("YYYY-MM-DD 轉為 MM/DD", () => {
    expect(formatShortDate("2026-07-13")).toBe("07/13");
    expect(formatShortDate("2026-01-05")).toBe("01/05");
  });
});

// PRD 4.2「目標達成時間預估」
describe("formatYearsAndMonths", () => {
  it("年與月並列", () => {
    expect(formatYearsAndMonths(100)).toBe("8 年 4 個月");
    expect(formatYearsAndMonths(13)).toBe("1 年 1 個月");
  });

  it("不足 1 年只顯示月數", () => {
    expect(formatYearsAndMonths(1)).toBe("1 個月");
    expect(formatYearsAndMonths(11)).toBe("11 個月");
  });

  it("整年不顯示「0 個月」", () => {
    expect(formatYearsAndMonths(12)).toBe("1 年");
    expect(formatYearsAndMonths(1200)).toBe("100 年");
  });
});

// PRD 5.7a 節「預計達成月份」
describe("formatMonthAfter", () => {
  it("往後 N 個月所在的年月", () => {
    expect(formatMonthAfter("2026-10-03", 100)).toBe("2035 年 2 月");
    expect(formatMonthAfter("2026-10-03", 2)).toBe("2026 年 12 月");
  });

  it("跨年時年份進位", () => {
    expect(formatMonthAfter("2026-10-03", 3)).toBe("2027 年 1 月");
    expect(formatMonthAfter("2026-12-15", 1)).toBe("2027 年 1 月");
    expect(formatMonthAfter("2026-01-31", 12)).toBe("2027 年 1 月");
  });

  it("0 個月為當月；只看年月，不受日期影響", () => {
    expect(formatMonthAfter("2026-12-15", 0)).toBe("2026 年 12 月");
    expect(formatMonthAfter("2026-01-31", 1)).toBe("2026 年 2 月");
  });
});

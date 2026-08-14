import { describe, expect, it } from "vitest";
import { formatCurrency, formatPercent, formatShortDate } from "@/lib/format";

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

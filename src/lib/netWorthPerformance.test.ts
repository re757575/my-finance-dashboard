import { describe, expect, it } from "vitest";
import rawFinanceData from "../../fixtures/finance-data.json?raw";
import {
  calculateNetWorthPerformance,
  type NetWorthPerformance,
} from "@/lib/netWorthPerformance";
import { parseFinanceData } from "@/lib/storage";
import { createEmptySnapshot, type Snapshot } from "@/types/schema";

/** 建立指定淨資產的快照：正數放在現金，負數以一筆負債表示（淨資產 = 現金 − 負債）。 */
function snap(date: string, netWorth: number): Snapshot {
  return {
    ...createEmptySnapshot(date),
    cashSources:
      netWorth > 0
        ? [{ id: "c1", name: "現金", amount: netWorth, restricted: false }]
        : [],
    debts:
      netWorth < 0
        ? [
            {
              id: "d1",
              name: "信貸",
              category: "信貸",
              principal: -netWorth,
              annualRate: 0,
              remainingMonths: 12,
              repaymentMethod: "amortizing",
              collateralValue: 0,
            },
          ]
        : [],
  };
}

/** 依序給定每年 1 月 1 日的淨資產（2020 年起），方便只關心數列形狀的回撤案例。 */
function yearly(...netWorths: number[]): Snapshot[] {
  return netWorths.map((value, i) => snap(`${2020 + i}-01-01`, value));
}

function perf(snapshots: Snapshot[]): NetWorthPerformance {
  const result = calculateNetWorthPerformance(snapshots);
  if (result === null) throw new Error("預期可計算出結果");
  return result;
}

describe("calculateNetWorthPerformance", () => {
  describe("少於 2 筆", () => {
    it("沒有快照時回傳 null", () => {
      expect(calculateNetWorthPerformance([])).toBeNull();
    });

    it("只有 1 筆快照時回傳 null（無法構成一段期間）", () => {
      expect(
        calculateNetWorthPerformance([snap("2026-01-01", 100)])
      ).toBeNull();
    });
  });

  describe("成長率", () => {
    // 2020-01-01 → 2024-01-01 = 366 + 365 × 3 = 1461 天 = 365.25 × 4，指數恰為 1/4
    // 1,464,100 ÷ 1,000,000 = 1.4641 = 1.1^4 → 年化 10%
    it("一般成長：回傳起訖日期、天數、期初／期末、變化金額、期間成長率與年化成長率", () => {
      const result = perf([
        snap("2020-01-01", 1_000_000),
        snap("2024-01-01", 1_464_100),
      ]);

      expect(result.startDate).toBe("2020-01-01");
      expect(result.endDate).toBe("2024-01-01");
      expect(result.days).toBe(1461);
      expect(result.startNetWorth).toBe(1_000_000);
      expect(result.endNetWorth).toBe(1_464_100);
      expect(result.change).toBe(464_100);
      // (1,464,100 − 1,000,000) ÷ 1,000,000 = 46.41%
      expect(result.periodReturn).toBeCloseTo(46.41, 10);
      expect(result.annualizedReturn).toBeCloseTo(10, 10);
    });

    // 2018-01-01 → 2026-01-01 = 2922 天 = 365.25 × 8；淨資產腰斬：0.5^(1/8) − 1 = −8.2996%
    it("淨資產減少時，期間成長率與年化成長率皆為負", () => {
      const result = perf([snap("2018-01-01", 200), snap("2026-01-01", 100)]);

      expect(result.days).toBe(2922);
      expect(result.change).toBe(-100);
      expect(result.periodReturn).toBeCloseTo(-50, 10);
      expect(result.annualizedReturn).toBeCloseTo(-8.2996, 4);
    });

    // 2026-01-01 → 2026-12-31 = 364 天
    it("期間未滿 365 天時不年化，只給期間成長率", () => {
      const result = perf([snap("2026-01-01", 100), snap("2026-12-31", 110)]);

      expect(result.days).toBe(364);
      expect(result.periodReturn).toBeCloseTo(10, 10);
      expect(result.annualizedReturn).toBeNull();
    });

    // 2026-01-01 → 2027-01-01 = 365 天：1.1^(365.25 ÷ 365) − 1 = 10.0072%（略高於 10%）
    it("恰 365 天時照公式年化", () => {
      const result = perf([snap("2026-01-01", 100), snap("2027-01-01", 110)]);

      expect(result.days).toBe(365);
      expect(result.periodReturn).toBeCloseTo(10, 10);
      expect(result.annualizedReturn).toBeCloseTo(10.0072, 4);
    });

    it("期初淨資產為 0 時，期間成長率與年化成長率皆為 null，變化金額照算", () => {
      const result = perf([snap("2020-01-01", 0), snap("2024-01-01", 500)]);

      expect(result.change).toBe(500);
      expect(result.periodReturn).toBeNull();
      expect(result.annualizedReturn).toBeNull();
    });

    it("期初淨資產為負時，期間成長率與年化成長率皆為 null", () => {
      const result = perf([snap("2020-01-01", -300), snap("2024-01-01", 500)]);

      expect(result.startNetWorth).toBe(-300);
      expect(result.change).toBe(800);
      expect(result.periodReturn).toBeNull();
      expect(result.annualizedReturn).toBeNull();
    });

    // (−50 − 100) ÷ 100 = −150%；比值為負無法開方，不年化
    it("期末淨資產為負時不年化，期間成長率仍可計算", () => {
      const result = perf([snap("2020-01-01", 100), snap("2024-01-01", -50)]);

      expect(result.periodReturn).toBeCloseTo(-150, 10);
      expect(result.annualizedReturn).toBeNull();
    });

    it("期末淨資產為 0 時，年化成長率為 −100%", () => {
      const result = perf([snap("2020-01-01", 100), snap("2024-01-01", 0)]);

      expect(result.periodReturn).toBeCloseTo(-100, 10);
      expect(result.annualizedReturn).toBeCloseTo(-100, 10);
    });

    it("成長率只看首末兩筆，不受中間快照影響", () => {
      const result = perf([
        snap("2020-01-01", 1_000_000),
        snap("2021-06-30", 5_000_000),
        snap("2022-06-30", 200_000),
        snap("2024-01-01", 1_464_100),
      ]);

      expect(result.periodReturn).toBeCloseTo(46.41, 10);
      expect(result.annualizedReturn).toBeCloseTo(10, 10);
    });
  });

  describe("最大回撤", () => {
    it("單調上升時沒有回撤", () => {
      const result = perf(yearly(100, 110, 130, 200));

      expect(result.maxDrawdown).toBeNull();
      expect(result.hasUnmeasurableDecline).toBe(false);
    });

    it("數值完全相同（持平）時沒有回撤", () => {
      const result = perf(yearly(100, 100, 100));

      expect(result.maxDrawdown).toBeNull();
      expect(result.hasUnmeasurableDecline).toBe(false);
    });

    // 三段回撤：100→90（10%）、120→84（30%）、130→117（10%），取 30%
    it("多段回撤時取跌幅最大的一段，並回傳高低點日期與跌幅金額", () => {
      const result = perf(yearly(100, 90, 120, 84, 130, 117));

      expect(result.maxDrawdown).toEqual({
        percent: 30,
        amount: 36,
        peakDate: "2022-01-01",
        peakNetWorth: 120,
        troughDate: "2023-01-01",
        troughNetWorth: 84,
        recovered: true,
      });
    });

    // 高點 100 之後連續下跌到 80 再小幅反彈到 95：回撤 20%，低點是 80 不是 90
    it("同一個高點之後持續探底，低點取其後的最低點；未回到高點為「尚未回復」", () => {
      const result = perf(yearly(100, 90, 80, 95));

      expect(result.maxDrawdown).toMatchObject({
        percent: 20,
        amount: 20,
        peakDate: "2020-01-01",
        troughDate: "2022-01-01",
        recovered: false,
      });
    });

    it("回撤的高點是「至今最高點」，不是前一筆", () => {
      // 200 → 150 → 160 → 120：最大回撤從 200 起算（40%），不是 160 → 120（25%）
      const result = perf(yearly(200, 150, 160, 120));

      expect(result.maxDrawdown).toMatchObject({
        percent: 40,
        amount: 80,
        peakDate: "2020-01-01",
        troughDate: "2023-01-01",
        recovered: false,
      });
    });

    it("之後的淨資產剛好回到高點（相等）即視為已回復", () => {
      const result = perf(yearly(100, 80, 100));

      expect(result.maxDrawdown).toMatchObject({
        percent: 20,
        recovered: true,
      });
    });

    it("期末才創下低點時為尚未回復", () => {
      const result = perf(yearly(100, 120, 60));

      expect(result.maxDrawdown).toMatchObject({
        percent: 50,
        amount: 60,
        peakDate: "2021-01-01",
        troughDate: "2022-01-01",
        recovered: false,
      });
    });

    it("同一個高點數值出現多次時，高點日期取下跌前最近的一次", () => {
      const result = perf(yearly(100, 100, 80));

      expect(result.maxDrawdown).toMatchObject({
        percent: 20,
        peakDate: "2021-01-01",
        troughDate: "2022-01-01",
      });
    });

    it("兩段跌幅相同時取較早發生的那一段", () => {
      const result = perf(yearly(100, 90, 100, 90));

      expect(result.maxDrawdown).toMatchObject({
        percent: 10,
        peakDate: "2020-01-01",
        troughDate: "2021-01-01",
        recovered: true,
      });
    });

    it("跌到負值時跌幅可超過 100%", () => {
      const result = perf(yearly(100, -50));

      expect(result.maxDrawdown).toMatchObject({
        percent: 150,
        amount: 150,
        troughNetWorth: -50,
        recovered: false,
      });
    });

    it("高點為負時不計算回撤，並標示有無法衡量的下跌", () => {
      const result = perf(yearly(-100, -200));

      expect(result.maxDrawdown).toBeNull();
      expect(result.hasUnmeasurableDecline).toBe(true);
    });

    it("高點為 0 時不計算回撤（避免除以零）", () => {
      const result = perf(yearly(0, -50));

      expect(result.maxDrawdown).toBeNull();
      expect(result.hasUnmeasurableDecline).toBe(true);
    });

    it("淨資產由負轉正後，只計入正的高點之後的回撤", () => {
      // −100 → −200（高點為負，不計）→ 100 → 50（50%）
      const result = perf(yearly(-100, -200, 100, 50));

      expect(result.maxDrawdown).toMatchObject({
        percent: 50,
        amount: 50,
        peakDate: "2022-01-01",
        troughDate: "2023-01-01",
        recovered: false,
      });
      expect(result.hasUnmeasurableDecline).toBe(true);
    });
  });

  describe("輸入處理", () => {
    it("輸入未依日期排序時，結果與排序後相同，且不改動傳入的陣列", () => {
      const sorted = yearly(100, 90, 120, 84, 130, 117);
      const shuffled = [
        sorted[3],
        sorted[0],
        sorted[5],
        sorted[2],
        sorted[1],
        sorted[4],
      ];
      const originalOrder = shuffled.map((s) => s.date);

      expect(calculateNetWorthPerformance(shuffled)).toEqual(
        calculateNetWorthPerformance(sorted)
      );
      expect(shuffled.map((s) => s.date)).toEqual(originalOrder);
    });

    it("每筆快照的淨資產以該筆自己的欄位計算（美股以該筆自己的匯率換算）", () => {
      const start: Snapshot = {
        ...createEmptySnapshot("2020-01-01"),
        usStockValue: 1000,
        usStockCurrency: "USD",
        exchangeRate: 30,
      };
      const end: Snapshot = {
        ...createEmptySnapshot("2024-01-01"),
        usStockValue: 1000,
        usStockCurrency: "USD",
        exchangeRate: 33,
      };

      const result = perf([start, end]);

      expect(result.startNetWorth).toBe(30_000);
      expect(result.endNetWorth).toBe(33_000);
      expect(result.periodReturn).toBeCloseTo(10, 10);
    });

    it("淨資產全為 0 時不出現 NaN／Infinity", () => {
      const result = perf(yearly(0, 0, 0));

      expect(result).toEqual({
        startDate: "2020-01-01",
        endDate: "2022-01-01",
        days: 731,
        startNetWorth: 0,
        endNetWorth: 0,
        change: 0,
        periodReturn: null,
        annualizedReturn: null,
        maxDrawdown: null,
        hasUnmeasurableDecline: false,
      });
    });

    it("比值大到溢位時回傳 null，不回傳 Infinity", () => {
      const result = perf([
        snap("2020-01-01", 1e-200),
        snap("2024-01-01", 1e200),
      ]);

      expect(result.periodReturn).toBeNull();
      expect(result.annualizedReturn).toBeNull();
      expect(Number.isFinite(result.change)).toBe(true);
    });
  });

  describe("共用 fixture（fixtures/finance-data.json）", () => {
    const parsed = parseFinanceData(rawFinanceData);
    if (parsed.status !== "ok") throw new Error("fixture 應可正常解析");
    const { snapshots } = parsed.data;

    // 60 筆月底快照：2021-10-31 $5,831,964.62 → 2026-09-30 $12,351,780.58，相隔 1795 天
    it("全部範圍：年化成長率 16.5%、最大回撤 2.6%（2023-06-30 → 2023-08-31，已回復）", () => {
      const result = perf(snapshots);

      expect(result.startDate).toBe("2021-10-31");
      expect(result.endDate).toBe("2026-09-30");
      expect(result.days).toBe(1795);
      expect(result.startNetWorth).toBeCloseTo(5_831_964.62, 2);
      expect(result.endNetWorth).toBeCloseTo(12_351_780.58, 2);
      expect(result.change).toBeCloseTo(6_519_815.96, 2);
      // 6,519,815.96 ÷ 5,831,964.62 = 111.79%
      expect(result.periodReturn).toBeCloseTo(111.79, 2);
      // (12,351,780.58 ÷ 5,831,964.62)^(365.25 ÷ 1795) − 1 = 16.50%
      expect(result.annualizedReturn).toBeCloseTo(16.5, 2);
      // (7,430,083.17 − 7,236,156.14) ÷ 7,430,083.17 = 2.61%
      expect(result.maxDrawdown?.percent).toBeCloseTo(2.61, 2);
      expect(result.maxDrawdown?.amount).toBeCloseTo(193_927.03, 2);
      expect(result.maxDrawdown).toMatchObject({
        peakDate: "2023-06-30",
        troughDate: "2023-08-31",
        recovered: true,
      });
      expect(result.hasUnmeasurableDecline).toBe(false);
    });

    it("只取 2026 年的快照：未滿 1 年不年化，期間成長率 13.2%", () => {
      const result = perf(snapshots.filter((s) => s.date >= "2026-01-01"));

      expect(result.startDate).toBe("2026-01-31");
      expect(result.days).toBe(242);
      expect(result.annualizedReturn).toBeNull();
      // (12,351,780.58 − 10,910,863.04) ÷ 10,910,863.04 = 13.21%
      expect(result.periodReturn).toBeCloseTo(13.21, 2);
      // (11,136,687.83 − 11,108,342.25) ÷ 11,136,687.83 = 0.25%
      expect(result.maxDrawdown?.percent).toBeCloseTo(0.25, 2);
      expect(result.maxDrawdown).toMatchObject({
        peakDate: "2026-03-31",
        troughDate: "2026-04-30",
        recovered: true,
      });
    });

    it("所有數值欄位皆為有限數字或 null", () => {
      const result = perf(snapshots);
      const numbers = [
        result.days,
        result.startNetWorth,
        result.endNetWorth,
        result.change,
        result.periodReturn,
        result.annualizedReturn,
        result.maxDrawdown?.percent ?? null,
        result.maxDrawdown?.amount ?? null,
      ];

      for (const value of numbers) {
        expect(value === null || Number.isFinite(value)).toBe(true);
      }
    });
  });
});

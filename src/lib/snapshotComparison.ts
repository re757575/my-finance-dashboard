import { calculateMetrics, toSafeNumber } from "@/lib/calculations";
import type { Snapshot } from "@/types/schema";

/** 快照比較表的一列（PRD 4.2「快照比較」、5.10 節）。 */
export interface ComparisonRow {
  key: string;
  label: string;
  /** 該筆快照沒有這個項目時為 null（對象日才新增／對象日已移除），增減以 0 計算。 */
  base: number | null;
  target: number | null;
  /** 對象日 − 基準日。 */
  delta: number;
  /** 相對基準值的增減百分比；基準值 ≤ 0 時不具比較意義，為 null。 */
  percent: number | null;
}

export interface SnapshotComparisonResult {
  baseDate: string;
  targetDate: string;
  /** 淨資產、總資產、總負債。 */
  summary: ComparisonRow[];
  /** 負債比（%）：delta 為百分點，不換算相對百分比（percent 一律為 null）。 */
  debtRatio: ComparisonRow;
  /** 現金合計、台股、美股（台幣）、不動產；不動產在兩筆皆為 0 時不列。 */
  assets: ComparisonRow[];
  /** 逐筆現金來源，以 id 對應。 */
  cashSources: ComparisonRow[];
  /** 逐筆負債剩餘本金，以 id 對應。 */
  debts: ComparisonRow[];
  /** 每月定期定額合計（PRD 5.3a 節）。 */
  recurringInvestmentTotal: ComparisonRow;
  /** 逐筆定期定額的每月投入金額，以 id 對應；兩筆快照的清單皆為空時為空陣列。 */
  recurringInvestments: ComparisonRow[];
}

function buildRow(
  key: string,
  label: string,
  base: number | null,
  target: number | null
): ComparisonRow {
  const delta = (target ?? 0) - (base ?? 0);
  const percent = base !== null && base > 0 ? (delta / base) * 100 : null;
  return { key, label, base, target, delta, percent };
}

/**
 * 以 id 對應兩筆快照的清單項目：先依對象日的順序列出，再補上只存在於基準日（已移除）的項目。
 * 名稱以對象日為準，已移除者用基準日的名稱。
 */
function compareItems<T extends { id: string }>(
  keyPrefix: string,
  baseItems: T[],
  targetItems: T[],
  getValue: (item: T) => number,
  getLabel: (item: T) => string
): ComparisonRow[] {
  const baseById = new Map(baseItems.map((item) => [item.id, item]));
  const targetIds = new Set(targetItems.map((item) => item.id));

  const rows = targetItems.map((item) => {
    const baseItem = baseById.get(item.id);
    return buildRow(
      `${keyPrefix}-${item.id}`,
      getLabel(item),
      baseItem ? getValue(baseItem) : null,
      getValue(item)
    );
  });
  const removed = baseItems
    .filter((item) => !targetIds.has(item.id))
    .map((item) =>
      buildRow(`${keyPrefix}-${item.id}`, getLabel(item), getValue(item), null)
    );
  return [...rows, ...removed];
}

/**
 * 比較兩筆快照（PRD 5.10 節）：每個項目各自以該筆快照的欄位計算後相減（對象日 − 基準日），
 * 不讀取也不寫入任何其他資料。
 */
export function compareSnapshots(
  base: Snapshot,
  target: Snapshot
): SnapshotComparisonResult {
  const b = calculateMetrics(base);
  const t = calculateMetrics(target);

  const assets = [
    buildRow("cash", "現金合計", b.totalCash, t.totalCash),
    buildRow("tw-stock", "台股市值", b.twStockValue, t.twStockValue),
    buildRow(
      "us-stock",
      "美股市值（台幣）",
      b.usStockValueInTwd,
      t.usStockValueInTwd
    ),
  ];
  if (b.realEstateValue !== 0 || t.realEstateValue !== 0) {
    assets.push(
      buildRow(
        "real-estate",
        "不動產市值",
        b.realEstateValue,
        t.realEstateValue
      )
    );
  }

  return {
    baseDate: base.date,
    targetDate: target.date,
    summary: [
      buildRow("net-worth", "淨資產", b.netWorth, t.netWorth),
      buildRow("total-assets", "總資產", b.totalAssets, t.totalAssets),
      buildRow(
        "total-liabilities",
        "總負債",
        b.totalLiabilities,
        t.totalLiabilities
      ),
    ],
    debtRatio: {
      ...buildRow("debt-ratio", "負債比", b.debtRatio, t.debtRatio),
      percent: null,
    },
    assets,
    cashSources: compareItems(
      "cash-source",
      base.cashSources,
      target.cashSources,
      (source) => toSafeNumber(source.amount),
      (source) => source.name || "未命名"
    ),
    debts: compareItems(
      "debt",
      base.debts,
      target.debts,
      (debt) => toSafeNumber(debt.principal),
      (debt) => `${debt.name || "未命名"}（${debt.category}）`
    ),
    recurringInvestmentTotal: buildRow(
      "recurring-investment-total",
      "定期定額合計",
      b.totalRecurringInvestment,
      t.totalRecurringInvestment
    ),
    recurringInvestments: compareItems(
      "recurring-investment",
      base.recurringInvestments,
      target.recurringInvestments,
      (investment) => toSafeNumber(investment.amount),
      (investment) => investment.name || "未命名"
    ),
  };
}

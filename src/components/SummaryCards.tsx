import { DeltaText } from "@/components/charts/DeltaText";
import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { formatCurrency } from "@/lib/format";
import type { CalculatedMetrics, Debt } from "@/types/schema";

/** 增減比對的基準：日期早於表單日期的最近一筆已存檔快照（PRD 4.2「總覽卡增減比對」）。 */
export interface SummaryBaseline {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

interface SummaryCardsProps {
  metrics: CalculatedMetrics;
  debts: Debt[];
  /** 沒有更早的已存檔快照時為 null／省略，三張卡都不顯示增減行。 */
  previous?: SummaryBaseline | null;
}

/**
 * 三大核心指標卡（PRD 4.1、7 節：數字放大加粗，淨資產為負時轉紅色）。
 * 有上一筆已存檔快照時，數字下方各多一行「較 {日期} ▲/▼ 增減」。
 */
export function SummaryCards({ metrics, debts, previous }: SummaryCardsProps) {
  const netWorthNegative = metrics.netWorth < 0;
  const debtsSubstitution =
    debts.length === 0
      ? "尚無負債，總負債為 $0"
      : `${debts
          .map(
            (debt) =>
              `${formatCurrency(debt.principal)}（${debt.name || debt.category}）`
          )
          .join(" + ")} = ${formatCurrency(metrics.totalLiabilities)}`;

  return (
    <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-3">
      <SummaryCard
        testId="total-assets"
        label="總資產"
        value={metrics.totalAssets}
        baseline={
          previous && { date: previous.date, value: previous.totalAssets }
        }
        formula={
          <FormulaInfoButton
            title="總資產"
            formula="總資產 = 總流動現金 + 股票市值合計 + 不動產市值"
            substitution={`${formatCurrency(metrics.totalCash)} + ${formatCurrency(metrics.totalStockValue)} + ${formatCurrency(metrics.realEstateValue)} = ${formatCurrency(metrics.totalAssets)}`}
            note="總流動現金含標記為「不可動用」的來源（如期貨保證金）"
          />
        }
      />
      <SummaryCard
        testId="total-liabilities"
        label="總負債"
        value={metrics.totalLiabilities}
        baseline={
          previous && { date: previous.date, value: previous.totalLiabilities }
        }
        formula={
          <FormulaInfoButton
            title="總負債"
            formula="總負債 = 所有負債項目的剩餘本金加總"
            substitution={debtsSubstitution}
          />
        }
      />
      <SummaryCard
        testId="net-worth"
        label="個人淨資產"
        className="xs:max-sm:col-span-2"
        value={metrics.netWorth}
        baseline={previous && { date: previous.date, value: previous.netWorth }}
        negative={netWorthNegative}
        formula={
          <FormulaInfoButton
            title="個人淨資產"
            formula="淨資產 = 總資產 − 總負債"
            substitution={`${formatCurrency(metrics.totalAssets)} − ${formatCurrency(metrics.totalLiabilities)} = ${formatCurrency(metrics.netWorth)}`}
          />
        }
      />
    </div>
  );
}

function SummaryCard({
  testId,
  label,
  value,
  baseline,
  negative,
  formula,
  className,
}: {
  testId: string;
  label: string;
  value: number;
  baseline?: { date: string; value: number } | null;
  negative?: boolean;
  formula: React.ReactNode;
  /** 手機兩欄並排時，淨資產獨佔一列。 */
  className?: string;
}) {
  return (
    <div
      className={`@container rounded-xl bg-white dark:bg-card p-4 shadow-sm ${className ?? ""}`}
    >
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500 dark:text-neutral-400">{label}</p>
        {formula}
      </div>
      <p
        data-testid={testId}
        className={`mt-1 text-[clamp(1.125rem,14.5cqw,1.875rem)] leading-8 font-bold wrap-anywhere ${negative ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-neutral-50"}`}
      >
        {formatCurrency(value)}
      </p>
      {baseline && (
        <p
          data-testid={`${testId}-delta`}
          className="mt-1 flex flex-wrap gap-x-1.5 text-xs"
        >
          <span className="text-slate-500 dark:text-neutral-400">
            較 {baseline.date}
          </span>
          {/* 增減以畫面顯示的四捨五入後數值相減，卡片上的數字自己對得起來（比照快照比較） */}
          <DeltaText
            delta={Math.round(value) - Math.round(baseline.value)}
            percent={
              baseline.value > 0
                ? ((value - baseline.value) / baseline.value) * 100
                : null
            }
            formatValue={formatCurrency}
          />
        </p>
      )}
    </div>
  );
}

import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { formatCurrency } from "@/lib/format";
import type { CalculatedMetrics, Debt } from "@/types/schema";

interface SummaryCardsProps {
  metrics: CalculatedMetrics;
  debts: Debt[];
}

/** 三大核心指標卡（PRD 4.1、7 節：數字放大加粗，淨資產為負時轉紅色）。 */
export function SummaryCards({ metrics, debts }: SummaryCardsProps) {
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
  negative,
  formula,
  className,
}: {
  testId: string;
  label: string;
  value: number;
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
    </div>
  );
}

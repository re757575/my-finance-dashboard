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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SummaryCard
        testId="total-assets"
        label="總資產"
        value={metrics.totalAssets}
        formula={
          <FormulaInfoButton
            title="總資產"
            formula="總資產 = 總流動現金 + 股票市值合計"
            substitution={`${formatCurrency(metrics.totalCash)} + ${formatCurrency(metrics.totalStockValue)} = ${formatCurrency(metrics.totalAssets)}`}
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
}: {
  testId: string;
  label: string;
  value: number;
  negative?: boolean;
  formula: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm text-slate-500">{label}</p>
        {formula}
      </div>
      <p
        data-testid={testId}
        className={`mt-1 text-2xl font-bold sm:text-3xl ${negative ? "text-rose-600" : "text-slate-900"}`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

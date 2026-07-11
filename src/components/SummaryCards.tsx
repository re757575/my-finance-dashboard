import { formatCurrency } from "@/lib/format";
import type { CalculatedMetrics } from "@/types/schema";

interface SummaryCardsProps {
  metrics: CalculatedMetrics;
}

/** 三大核心指標卡（PRD 4.1、7 節：數字放大加粗，淨資產為負時轉紅色）。 */
export function SummaryCards({ metrics }: SummaryCardsProps) {
  const netWorthNegative = metrics.netWorth < 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SummaryCard
        testId="total-assets"
        label="總資產"
        value={metrics.totalAssets}
      />
      <SummaryCard
        testId="total-liabilities"
        label="總負債"
        value={metrics.totalLiabilities}
      />
      <SummaryCard
        testId="net-worth"
        label="個人淨資產"
        value={metrics.netWorth}
        negative={netWorthNegative}
      />
    </div>
  );
}

function SummaryCard({
  testId,
  label,
  value,
  negative,
}: {
  testId: string;
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        data-testid={testId}
        className={`mt-1 text-2xl font-bold sm:text-3xl ${negative ? "text-rose-600" : "text-slate-900"}`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

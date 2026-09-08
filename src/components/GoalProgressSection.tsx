import { Button } from "@/components/ui/button";
import { calculateSuggestedTargetNetWorth } from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";

interface GoalProgressSectionProps {
  netWorth: number;
  targetNetWorth: number;
  monthlyExpense: number;
  progress: number | null;
  onSetTarget: (value: number) => void;
}

/**
 * FIRE／淨資產目標進度（PRD 5.7 節）：獨立段落，呈現當下切面，不開新趨勢圖。
 * 目標為 0（未設定）時顯示引導文字＋「使用建議值」按鈕；達成或超過目標時進度條夾在 100%，
 * 但百分比數字不封頂；淨資產為負數時進度條夾在 0%。
 */
export function GoalProgressSection({
  netWorth,
  targetNetWorth,
  monthlyExpense,
  progress,
  onSetTarget,
}: GoalProgressSectionProps) {
  if (progress === null) {
    const suggested = calculateSuggestedTargetNetWorth(monthlyExpense);
    return (
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">FIRE／淨資產目標進度</p>
        <div
          data-testid="goal-progress-empty"
          className="mt-2 flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400"
        >
          <span>尚未設定目標淨資產</span>
          {suggested > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSetTarget(suggested)}
            >
              使用建議值 {formatCurrency(suggested)}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const achieved = progress >= 100;
  const width = Math.min(100, Math.max(0, progress));

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">FIRE／淨資產目標進度</p>
        {achieved && (
          <span
            data-testid="goal-progress-achieved"
            className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
          >
            🎉 已達成目標
          </span>
        )}
      </div>
      <p
        data-testid="goal-progress-value"
        className="mt-1 text-2xl font-bold text-slate-900"
      >
        {formatPercent(progress)}
      </p>
      <p className="text-sm text-slate-500">
        目前 {formatCurrency(netWorth)} ／ 目標 {formatCurrency(targetNetWorth)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          data-testid="goal-progress-bar-fill"
          className={`h-full rounded-full transition-all duration-100 ${
            achieved ? "bg-emerald-500" : "bg-sky-500"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

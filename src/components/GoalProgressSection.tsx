import { FormulaInfoButton } from "@/components/FormulaInfoButton";
import { GoalEta } from "@/components/GoalEta";
import { Button } from "@/components/ui/button";
import {
  calculateSuggestedTargetNetWorth,
  type GoalEstimates,
} from "@/lib/calculations";
import { formatCurrency, formatPercent } from "@/lib/format";

interface GoalProgressSectionProps {
  netWorth: number;
  targetNetWorth: number;
  monthlyExpense: number;
  progress: number | null;
  /** 可投資淨資產（金融資產 − 金融負債，PRD 5.7 節）；與淨資產不同時另列其進度。 */
  investableNetWorth: number;
  investableProgress: number | null;
  /** 目標達成時間預估（PRD 5.7a 節）；未提供時不顯示「預估達成時間」。 */
  estimates?: GoalEstimates;
  onSetTarget: (value: number) => void;
}

/**
 * FIRE／淨資產目標進度（PRD 5.7 節）：獨立段落，呈現當下切面，不開新趨勢圖。
 * 目標為 0（未設定）時顯示引導文字＋「使用建議值」按鈕；達成或超過目標時進度條夾在 100%，
 * 但百分比數字不封頂；淨資產為負數時進度條夾在 0%。進度條下方為「預估達成時間」（PRD 5.7a 節）。
 * 有不動產或房貸時，另列不含兩者的「可投資淨資產進度」作為對照；進度條與預估達成時間仍以淨資產為準。
 */
export function GoalProgressSection({
  netWorth,
  targetNetWorth,
  monthlyExpense,
  progress,
  investableNetWorth,
  investableProgress,
  estimates,
  onSetTarget,
}: GoalProgressSectionProps) {
  if (progress === null) {
    const suggested = calculateSuggestedTargetNetWorth(monthlyExpense);
    return (
      <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            FIRE／淨資產目標進度
          </p>
          <FormulaInfoButton
            title="FIRE／淨資產目標進度"
            formula={
              "進度 = 淨資產 ÷ 目標淨資產 × 100%\n建議目標 = 本月支出 × 12 × 25（4% 提領法則）"
            }
            substitution={`尚未設定目標，建議值 = ${formatCurrency(monthlyExpense)} × 12 × 25 = ${formatCurrency(suggested)}`}
          />
        </div>
        <div
          data-testid="goal-progress-empty"
          className="mt-2 flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 dark:bg-muted/50 px-4 py-6 text-center text-sm text-slate-400 dark:text-neutral-400"
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
  // 沒有不動產也沒有房貸時兩者相同，不重複顯示
  const investable =
    investableProgress !== null && investableNetWorth !== netWorth
      ? investableProgress
      : null;
  const substitution = `${formatCurrency(netWorth)} ÷ ${formatCurrency(targetNetWorth)} × 100% = ${formatPercent(progress)}`;
  const notes = [
    achieved && "已達成或超過目標，進度條寬度夾在 100%，但數字不封頂",
    investable !== null &&
      "可投資淨資產 = 金融資產（現金＋股票）− 房貸以外的負債",
  ].filter(Boolean);

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            FIRE／淨資產目標進度
          </p>
          <FormulaInfoButton
            title="FIRE／淨資產目標進度"
            formula={
              investable !== null
                ? "進度 = 淨資產 ÷ 目標淨資產 × 100%\n可投資淨資產進度 = 可投資淨資產 ÷ 目標淨資產 × 100%"
                : "進度 = 淨資產 ÷ 目標淨資產 × 100%"
            }
            substitution={
              investable !== null
                ? `淨資產：${substitution}\n可投資淨資產：${formatCurrency(investableNetWorth)} ÷ ${formatCurrency(targetNetWorth)} × 100% = ${formatPercent(investable)}`
                : substitution
            }
            note={notes.length > 0 ? notes.join("；") : undefined}
          />
        </div>
        {achieved && (
          <span
            data-testid="goal-progress-achieved"
            className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-300"
          >
            🎉 已達成目標
          </span>
        )}
      </div>
      <p
        data-testid="goal-progress-value"
        className="mt-1 text-2xl font-bold text-slate-900 dark:text-neutral-50"
      >
        {formatPercent(progress)}
      </p>
      <p className="text-sm text-slate-500 dark:text-neutral-400">
        目前 {formatCurrency(netWorth)} ／ 目標 {formatCurrency(targetNetWorth)}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        <div
          data-testid="goal-progress-bar-fill"
          className={`h-full rounded-full transition-all duration-100 ${
            achieved ? "bg-emerald-500" : "bg-sky-500"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
      {investable !== null && (
        <div
          data-testid="goal-progress-investable"
          className="mt-3 border-t border-slate-100 dark:border-border pt-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm text-slate-500 dark:text-neutral-400">
              可投資淨資產進度（不含不動產與房貸）
            </p>
            <p
              data-testid="goal-progress-investable-value"
              className="text-sm font-medium text-slate-900 dark:text-neutral-50"
            >
              {formatPercent(investable)}
            </p>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            可投資淨資產 {formatCurrency(investableNetWorth)} ／ 目標{" "}
            {formatCurrency(targetNetWorth)}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-neutral-400">
            4%
            提領法則的本金必須可提領，自住不動產不算；進度條與預估達成時間仍以淨資產計算
          </p>
        </div>
      )}
      {estimates && (
        <GoalEta
          estimates={estimates}
          netWorth={netWorth}
          targetNetWorth={targetNetWorth}
        />
      )}
    </div>
  );
}

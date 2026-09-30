import type { DataFreshness } from "@/lib/dataFreshness";

interface DataFreshnessNoticeProps {
  /** null 代表尚未存檔任何快照，不顯示（PRD 4.2「資料新鮮度提示」）。 */
  freshness: DataFreshness | null;
}

/**
 * 資料新鮮度提示：今日已更新／距上次更新 N 天，超過 14 天加琥珀色「資料可能已過期」標籤。
 * 文字與顏色同時呈現，不只用顏色傳達狀態（PRD 7 節無障礙規範）。
 */
export function DataFreshnessNotice({ freshness }: DataFreshnessNoticeProps) {
  if (freshness === null) return null;

  if (freshness.status === "today") {
    return (
      <p data-testid="data-freshness" className="text-sm text-slate-500">
        今日已更新
      </p>
    );
  }

  const stale = freshness.status === "stale";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <p
        data-testid="data-freshness"
        className={stale ? "text-amber-700" : "text-slate-500"}
      >
        距上次更新 {freshness.days} 天（{freshness.lastDate}）
      </p>
      {stale && (
        <>
          <span
            data-testid="data-freshness-stale-badge"
            className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-700"
          >
            資料可能已過期
          </span>
          <span className="text-xs text-amber-700">
            請更新股票市值、現金與負債後再存檔
          </span>
        </>
      )}
    </div>
  );
}

/** 增減比對的文字呈現：增加以 rose 紅色＋▲、減少以 emerald 綠色＋▼ 表示（沿用台股漲跌配色慣例），數值相同時顯示中性文字「持平」。 */
export function DeltaText({
  delta,
  percent,
  formatValue,
}: {
  delta: number;
  percent: number | null;
  formatValue: (value: number) => string;
}) {
  if (delta === 0) {
    return <span className="text-slate-400 dark:text-neutral-400">持平</span>;
  }

  const isUp = delta > 0;
  return (
    <span
      className={
        isUp
          ? "text-rose-600 dark:text-rose-400"
          : "text-emerald-600 dark:text-emerald-400"
      }
    >
      {isUp ? "▲" : "▼"} {formatValue(Math.abs(delta))}
      {percent !== null &&
        ` (${isUp ? "+" : "-"}${Math.abs(percent).toFixed(1)}%)`}
    </span>
  );
}

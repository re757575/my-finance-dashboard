/** 千分位金額格式化（PRD 4.2 節：如 $1,000,000） */
export function formatCurrency(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${new Intl.NumberFormat("en-US").format(Math.abs(rounded))}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** 緊急預備金月數格式化：null（分母為 0，無需求）顯示為「∞」（PRD 5.5 節）。 */
export function formatMonths(value: number | null): string {
  if (value === null) return "∞";
  return `${value.toFixed(1)} 個月`;
}

/** "YYYY-MM-DD" → "MM/DD"，供趨勢圖全螢幕檢視的節點日期標籤使用（PRD 4.2 節）。 */
export function formatShortDate(date: string): string {
  return date.slice(5).replace("-", "/");
}

/**
 * 月數 → 「X 年 Y 個月」：不足 1 年只顯示月數，整年不顯示「0 個月」（PRD 4.2「目標達成時間預估」）。
 */
export function formatYearsAndMonths(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} 個月`;
  if (rest === 0) return `${years} 年`;
  return `${years} 年 ${rest} 個月`;
}

/** "YYYY-MM-DD" 往後 N 個月所在的年月，格式「YYYY 年 M 月」（PRD 5.7a 節「預計達成月份」）。 */
export function formatMonthAfter(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  return `${Math.floor(total / 12)} 年 ${(total % 12) + 1} 月`;
}

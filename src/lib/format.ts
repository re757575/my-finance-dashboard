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

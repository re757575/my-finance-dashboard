/** 千分位金額格式化（PRD 4.2 節：如 $1,000,000） */
export function formatCurrency(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${new Intl.NumberFormat("en-US").format(Math.abs(rounded))}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

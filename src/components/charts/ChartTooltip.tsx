interface ChartTooltipProps {
  /** 節點在圖表座標空間（0..width, 0..height）中的位置。 */
  x: number;
  y: number;
  width: number;
  height: number;
  children: React.ReactNode;
}

/** 節點 hover/點擊時的浮動數值提示框，以百分比定位對齊圖表座標（PRD 4.2 節）。 */
export function ChartTooltip({
  x,
  y,
  width,
  height,
  children,
}: ChartTooltipProps) {
  return (
    <div
      data-testid="chart-tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-slate-800 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg"
      style={{
        left: `${(x / width) * 100}%`,
        top: `${(y / height) * 100}%`,
        marginTop: -8,
      }}
    >
      {children}
    </div>
  );
}

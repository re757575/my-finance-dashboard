interface ChartNoteMarkerProps {
  cx: number;
  cy: number;
  /** 節點在圖表中的索引，與 `chart-node-{index}` 對應。 */
  index: number;
  /** 圓環內是否再畫一個圓心：標記不是套在既有節點上時使用（長條圖、堆疊面積圖）。 */
  withDot?: boolean;
  className?: string;
}

/**
 * 有備註的快照節點標記（PRD 4.2「快照備註」）：以圓環這個形狀標示，不只靠顏色；
 * 顏色取自 currentColor。畫在 SVG 裡的圖形可隨 compact 圖縮放，備註文字則只放在 Tooltip。
 */
export function ChartNoteMarker({
  cx,
  cy,
  index,
  withDot = false,
  className,
}: ChartNoteMarkerProps) {
  return (
    <g data-testid={`chart-note-marker-${index}`} className={className}>
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      {withDot && <circle cx={cx} cy={cy} r={2} fill="currentColor" />}
    </g>
  );
}

/** Tooltip 內的備註行；外層 Tooltip 不換行，備註過長時在此行內換行，不把 Tooltip 撐得過寬。 */
export function ChartTooltipNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <p
      data-testid="chart-tooltip-note"
      className="w-max max-w-40 break-words whitespace-normal"
    >
      備註：{note}
    </p>
  );
}

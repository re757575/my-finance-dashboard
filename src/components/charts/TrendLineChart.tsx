import { useState } from "react";
import { ChartExpandButton } from "@/components/charts/ChartExpandButton";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { EmptyTrendCard } from "@/components/charts/EmptyTrendCard";
import { formatShortDate } from "@/lib/format";

interface TrendLineChartProps {
  title: string;
  points: { date: string; value: number }[];
  formatValue?: (value: number) => string;
  colorClassName?: string;
  showDelta?: boolean;
  /** 目標參考線數值；0 或未提供代表尚未設定目標，不畫出參考線（PRD 4.2 節）。 */
  targetValue?: number;
}

const COMPACT_WIDTH = 320;
const COMPACT_HEIGHT = 120;
const COMPACT_PADDING = 24;

const FULLSCREEN_CHART_HEIGHT = 220;
const FULLSCREEN_LABEL_HEIGHT = 28;
const FULLSCREEN_HEIGHT = FULLSCREEN_CHART_HEIGHT + FULLSCREEN_LABEL_HEIGHT;
const FULLSCREEN_PADDING = 32;
const FULLSCREEN_POINT_SPACING = 40;
/** 全螢幕檢視左側保留給 Y 軸金額刻度的寬度；compact 卡片空間有限不顯示刻度。 */
const FULLSCREEN_Y_AXIS_WIDTH = 56;
const Y_AXIS_TICK_COUNT = 4;

interface LineChartSvgProps {
  title: string;
  points: { date: string; value: number }[];
  formatValue: (value: number) => string;
  colorClassName: string;
  variant: "compact" | "fullscreen";
  showDelta?: boolean;
  targetValue?: number;
}

/**
 * 「Nice numbers」刻度演算法（沿用一般圖表軟體／股票 K 線圖慣例）：把 min/max 往外
 * 擴到最接近的整數階梯（step 為 1/2/5 乘上 10 的冪次），刻度落在乾淨的整數上（如
 * $100,000／$150,000），而不是對原始 min/max 線性內插出 $116,667 這種不易讀的數字。
 */
function getNiceTickStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function getNiceTicks(rawMin: number, rawMax: number, tickCount: number) {
  const step = getNiceTickStep((rawMax - rawMin) / (tickCount - 1));
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const values: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) {
    values.push(value);
  }
  return { min, max, values };
}

/** 計算兩個數值之間的差額與百分比；基準值（base）≤ 0 時百分比不具比較意義，回傳 null（PRD 4.2 節）。 */
function computeDelta(base: number, current: number) {
  const delta = current - base;
  const percent = base > 0 ? (delta / base) * 100 : null;
  return { delta, percent };
}

/** 增減比對的文字呈現：增加以 rose 紅色＋▲、減少以 emerald 綠色＋▼ 表示（沿用台股漲跌配色慣例），數值相同時顯示中性文字「持平」。 */
function DeltaText({
  delta,
  percent,
  formatValue,
}: {
  delta: number;
  percent: number | null;
  formatValue: (value: number) => string;
}) {
  if (delta === 0) {
    return <span className="text-slate-400">持平</span>;
  }

  const isUp = delta > 0;
  return (
    <span className={isUp ? "text-rose-600" : "text-emerald-600"}>
      {isUp ? "▲" : "▼"} {formatValue(Math.abs(delta))}
      {percent !== null &&
        ` (${isUp ? "+" : "-"}${Math.abs(percent).toFixed(1)}%)`}
    </span>
  );
}

/** 淨資產趨勢圖專用：與篩選範圍內倒數第二個節點比較增減（PRD 4.2 節「淨資產趨勢圖增減比對」）。 */
function DeltaSummary({
  points,
  formatValue,
  align = "right",
}: {
  points: { date: string; value: number }[];
  formatValue: (value: number) => string;
  align?: "left" | "right";
}) {
  const last = points.at(-1)!;
  const prev = points.at(-2)!;
  const { delta, percent } = computeDelta(prev.value, last.value);
  const alignClassName = align === "right" ? "text-right" : "text-left";

  return (
    <p className={`${alignClassName} text-xs`}>
      <DeltaText delta={delta} percent={percent} formatValue={formatValue} />
    </p>
  );
}

/** 手刻 SVG 折線圖本體：compact 為響應式縮放、fullscreen 為固定節點間距＋橫向捲動（PRD 4.2、8 節）。 */
function LineChartSvg({
  title,
  points,
  formatValue,
  colorClassName,
  variant,
  showDelta,
  targetValue,
}: LineChartSvgProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isFullscreen = variant === "fullscreen";

  const yAxisWidth = isFullscreen ? FULLSCREEN_Y_AXIS_WIDTH : 0;
  const width = isFullscreen
    ? yAxisWidth +
      FULLSCREEN_PADDING * 2 +
      (points.length - 1) * FULLSCREEN_POINT_SPACING
    : COMPACT_WIDTH;
  const totalHeight = isFullscreen ? FULLSCREEN_HEIGHT : COMPACT_HEIGHT;
  const chartHeight = isFullscreen ? FULLSCREEN_CHART_HEIGHT : COMPACT_HEIGHT;
  const padding = isFullscreen ? FULLSCREEN_PADDING : COMPACT_PADDING;
  const leftInset = padding + yAxisWidth;

  const values = points.map((p) => p.value);
  // 目標值也納入 min/max 範圍計算，確保參考線一定落在可視區域內，不會被畫到圖表外。
  const valuesWithTarget = targetValue ? [...values, targetValue] : values;
  const rawMin = Math.min(...valuesWithTarget);
  const rawMax = Math.max(...valuesWithTarget);
  const isFlat = rawMax === rawMin;
  // 數值範圍往外擴到「nice numbers」整數階梯，讓 Y 軸刻度落在乾淨的整數上；
  // 所有數值都相同時沒有階梯可言，直接用該數值本身當唯一刻度。
  const {
    min,
    max,
    values: tickValues,
  } = isFlat
    ? { min: rawMin, max: rawMax, values: [rawMin] }
    : getNiceTicks(rawMin, rawMax, Y_AXIS_TICK_COUNT);
  const range = max - min || 1;
  const stepX = (width - leftInset - padding) / (points.length - 1);
  const toY = (value: number) =>
    padding + (1 - (value - min) / range) * (chartHeight - padding * 2);

  const coords = points.map((p, i) => ({
    x: leftInset + i * stepX,
    y: toY(p.value),
  }));
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeCoord = activeIndex !== null ? coords[activeIndex] : null;
  const targetY = targetValue ? toY(targetValue) : null;
  // Y 軸金額刻度：僅全螢幕檢視顯示，數值來自上面「nice numbers」擴展後的整數階梯。
  const yAxisTicks = isFullscreen
    ? tickValues.map((value) => ({ value, y: toY(value) }))
    : [];

  return (
    <div
      className={isFullscreen ? "overflow-x-auto" : undefined}
      data-chart-scroll={isFullscreen || undefined}
    >
      <div className="relative" style={isFullscreen ? { width } : undefined}>
        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          width={isFullscreen ? width : undefined}
          height={isFullscreen ? totalHeight : undefined}
          className={
            isFullscreen
              ? `overflow-visible ${colorClassName}`
              : `w-full overflow-visible ${colorClassName}`
          }
          role="img"
          aria-label={`${title}折線圖，共 ${points.length} 筆資料${isFullscreen ? "（全螢幕）" : ""}`}
          onClick={() => setActiveIndex(null)}
        >
          {yAxisTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={leftInset}
                y1={tick.y}
                x2={width - padding}
                y2={tick.y}
                stroke="currentColor"
                strokeWidth={1}
                className="text-slate-100"
              />
              <text
                x={leftInset - 8}
                y={tick.y}
                dy="0.32em"
                textAnchor="end"
                className="fill-slate-400 text-[9px]"
              >
                {formatValue(tick.value)}
              </text>
            </g>
          ))}
          {targetY !== null && (
            <>
              <line
                x1={leftInset}
                y1={targetY}
                x2={width - padding}
                y2={targetY}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                className="text-slate-300"
              />
              <text
                x={leftInset}
                y={targetY - 4}
                textAnchor="start"
                className="fill-slate-400 text-[9px]"
              >
                目標 {formatValue(targetValue!)}
              </text>
            </>
          )}
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.map((c, i) => (
            <g key={points[i].date}>
              <circle cx={c.x} cy={c.y} r={2.5} fill="currentColor" />
              <circle
                cx={c.x}
                cy={c.y}
                r={8}
                fill="transparent"
                className="cursor-pointer"
                data-testid={`chart-node-${i}`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() =>
                  setActiveIndex((prev) => (prev === i ? null : prev))
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(i);
                }}
              />
            </g>
          ))}
          {isFullscreen &&
            coords.map((c, i) => (
              <text
                key={`label-${points[i].date}`}
                x={c.x}
                y={FULLSCREEN_CHART_HEIGHT + 16}
                textAnchor="middle"
                className="fill-slate-400 text-[10px]"
              >
                {formatShortDate(points[i].date)}
              </text>
            ))}
        </svg>
        {active && activeCoord && (
          <ChartTooltip
            x={activeCoord.x}
            y={activeCoord.y}
            width={width}
            height={totalHeight}
            clampToBounds={isFullscreen}
          >
            <p>
              {active.date} {formatValue(active.value)}
            </p>
            {showDelta && activeIndex !== points.length - 1 && (
              <p>
                距今{" "}
                <DeltaText
                  {...computeDelta(active.value, points.at(-1)!.value)}
                  formatValue={formatValue}
                />
              </p>
            )}
          </ChartTooltip>
        )}
      </div>
      {!isFullscreen && (
        <>
          {showDelta && (
            <DeltaSummary points={points} formatValue={formatValue} />
          )}
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>{points[0].date}</span>
            <span>{points.at(-1)?.date}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** 淨資產／負債比趨勢卡片：compact 圖 + 全螢幕展開按鈕（PRD 4.2 節）。 */
export function TrendLineChart({
  title,
  points,
  formatValue = String,
  colorClassName = "text-blue-500",
  showDelta = false,
  targetValue,
}: TrendLineChartProps) {
  if (points.length < 2) {
    return <EmptyTrendCard title={title} />;
  }

  const last = points.at(-1)!;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-slate-500">{title}</p>
        <div className="flex items-center gap-1">
          <p className="text-sm font-semibold text-slate-700">
            {formatValue(last.value)}
          </p>
          <ChartExpandButton title={title}>
            <p className="text-sm text-slate-500">
              最新：{formatValue(last.value)}
            </p>
            {showDelta && (
              <DeltaSummary
                points={points}
                formatValue={formatValue}
                align="left"
              />
            )}
            <LineChartSvg
              title={title}
              points={points}
              formatValue={formatValue}
              colorClassName={colorClassName}
              variant="fullscreen"
              showDelta={showDelta}
              targetValue={targetValue}
            />
          </ChartExpandButton>
        </div>
      </div>
      <div className="mt-2">
        <LineChartSvg
          title={title}
          points={points}
          formatValue={formatValue}
          colorClassName={colorClassName}
          variant="compact"
          showDelta={showDelta}
          targetValue={targetValue}
        />
      </div>
    </div>
  );
}

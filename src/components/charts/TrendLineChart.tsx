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

interface LineChartSvgProps {
  title: string;
  points: { date: string; value: number }[];
  formatValue: (value: number) => string;
  colorClassName: string;
  variant: "compact" | "fullscreen";
  showDelta?: boolean;
  targetValue?: number;
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

  const width = isFullscreen
    ? FULLSCREEN_PADDING * 2 + (points.length - 1) * FULLSCREEN_POINT_SPACING
    : COMPACT_WIDTH;
  const totalHeight = isFullscreen ? FULLSCREEN_HEIGHT : COMPACT_HEIGHT;
  const chartHeight = isFullscreen ? FULLSCREEN_CHART_HEIGHT : COMPACT_HEIGHT;
  const padding = isFullscreen ? FULLSCREEN_PADDING : COMPACT_PADDING;

  const values = points.map((p) => p.value);
  // 目標值也納入 min/max 範圍計算，確保參考線一定落在可視區域內，不會被畫到圖表外。
  const valuesWithTarget = targetValue ? [...values, targetValue] : values;
  const min = Math.min(...valuesWithTarget);
  const max = Math.max(...valuesWithTarget);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (points.length - 1);
  const toY = (value: number) =>
    padding + (1 - (value - min) / range) * (chartHeight - padding * 2);

  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: toY(p.value),
  }));
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeCoord = activeIndex !== null ? coords[activeIndex] : null;
  const targetY = targetValue ? toY(targetValue) : null;

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
          {targetY !== null && (
            <>
              <line
                x1={padding}
                y1={targetY}
                x2={width - padding}
                y2={targetY}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                className="text-slate-300"
              />
              <text
                x={padding}
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

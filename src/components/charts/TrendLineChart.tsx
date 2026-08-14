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
}

/** 手刻 SVG 折線圖本體：compact 為響應式縮放、fullscreen 為固定節點間距＋橫向捲動（PRD 4.2、8 節）。 */
function LineChartSvg({
  title,
  points,
  formatValue,
  colorClassName,
  variant,
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
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (points.length - 1);

  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: padding + (1 - (p.value - min) / range) * (chartHeight - padding * 2),
  }));
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeCoord = activeIndex !== null ? coords[activeIndex] : null;

  return (
    <div className={isFullscreen ? "overflow-x-auto" : undefined}>
      <div className="relative" style={isFullscreen ? { width } : undefined}>
        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          width={isFullscreen ? width : undefined}
          height={isFullscreen ? totalHeight : undefined}
          className={isFullscreen ? colorClassName : `w-full ${colorClassName}`}
          role="img"
          aria-label={`${title}折線圖，共 ${points.length} 筆資料${isFullscreen ? "（全螢幕）" : ""}`}
          onClick={() => setActiveIndex(null)}
        >
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
          >
            {active.date} {formatValue(active.value)}
          </ChartTooltip>
        )}
      </div>
      {!isFullscreen && (
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>{points[0].date}</span>
          <span>{points.at(-1)?.date}</span>
        </div>
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
            <LineChartSvg
              title={title}
              points={points}
              formatValue={formatValue}
              colorClassName={colorClassName}
              variant="fullscreen"
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
        />
      </div>
    </div>
  );
}

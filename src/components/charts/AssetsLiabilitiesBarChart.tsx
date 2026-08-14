import { useState } from "react";
import { ChartExpandButton } from "@/components/charts/ChartExpandButton";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { EmptyTrendCard } from "@/components/charts/EmptyTrendCard";
import { formatCurrency, formatShortDate } from "@/lib/format";

interface AssetsLiabilitiesBarChartProps {
  points: { date: string; assets: number; liabilities: number }[];
}

const COMPACT_WIDTH = 320;
const COMPACT_HEIGHT = 120;
const COMPACT_PADDING = 24;

const FULLSCREEN_CHART_HEIGHT = 220;
const FULLSCREEN_LABEL_HEIGHT = 28;
const FULLSCREEN_HEIGHT = FULLSCREEN_CHART_HEIGHT + FULLSCREEN_LABEL_HEIGHT;
const FULLSCREEN_PADDING = 32;
const FULLSCREEN_GROUP_SPACING = 48;

interface BarChartSvgProps {
  points: { date: string; assets: number; liabilities: number }[];
  variant: "compact" | "fullscreen";
}

/** 手刻 SVG 分組長條圖本體：compact 為響應式縮放、fullscreen 為固定間距＋橫向捲動（PRD 4.2、8 節）。 */
function BarChartSvg({ points, variant }: BarChartSvgProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isFullscreen = variant === "fullscreen";

  const width = isFullscreen
    ? FULLSCREEN_PADDING * 2 + points.length * FULLSCREEN_GROUP_SPACING
    : COMPACT_WIDTH;
  const totalHeight = isFullscreen ? FULLSCREEN_HEIGHT : COMPACT_HEIGHT;
  const chartHeight = isFullscreen ? FULLSCREEN_CHART_HEIGHT : COMPACT_HEIGHT;
  const padding = isFullscreen ? FULLSCREEN_PADDING : COMPACT_PADDING;

  const max = Math.max(...points.flatMap((p) => [p.assets, p.liabilities]), 1);
  const groupWidth = (width - padding * 2) / points.length;
  const barWidth = Math.min(isFullscreen ? 16 : 10, groupWidth / 3);
  const drawHeight = chartHeight - padding * 2;

  const active = activeIndex !== null ? points[activeIndex] : null;

  return (
    <div className={isFullscreen ? "overflow-x-auto" : undefined}>
      <div className="relative" style={isFullscreen ? { width } : undefined}>
        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          width={isFullscreen ? width : undefined}
          height={isFullscreen ? totalHeight : undefined}
          className={isFullscreen ? undefined : "w-full"}
          role="img"
          aria-label={`資產負債對比長條圖，共 ${points.length} 筆資料${isFullscreen ? "（全螢幕）" : ""}`}
          onClick={() => setActiveIndex(null)}
        >
          {points.map((p, i) => {
            const groupX = padding + i * groupWidth;
            const assetsHeight = (p.assets / max) * drawHeight;
            const liabilitiesHeight = (p.liabilities / max) * drawHeight;
            return (
              <g key={p.date}>
                <rect
                  x={groupX + groupWidth / 2 - barWidth - 1}
                  y={chartHeight - padding - assetsHeight}
                  width={barWidth}
                  height={assetsHeight}
                  rx={1}
                  className="fill-blue-500"
                />
                <rect
                  x={groupX + groupWidth / 2 + 1}
                  y={chartHeight - padding - liabilitiesHeight}
                  width={barWidth}
                  height={liabilitiesHeight}
                  rx={1}
                  className="fill-rose-400"
                />
                <rect
                  x={groupX}
                  y={0}
                  width={groupWidth}
                  height={chartHeight}
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
                {isFullscreen && (
                  <text
                    x={groupX + groupWidth / 2}
                    y={FULLSCREEN_CHART_HEIGHT + 16}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px]"
                  >
                    {formatShortDate(p.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active && (
          <ChartTooltip
            x={padding + (activeIndex as number) * groupWidth + groupWidth / 2}
            y={padding}
            width={width}
            height={totalHeight}
          >
            {active.date} 資產 {formatCurrency(active.assets)} ／ 負債{" "}
            {formatCurrency(active.liabilities)}
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

/** 資產負債對比卡片：compact 圖 + 全螢幕展開按鈕（PRD 4.2 節）。 */
export function AssetsLiabilitiesBarChart({
  points,
}: AssetsLiabilitiesBarChartProps) {
  if (points.length < 2) {
    return <EmptyTrendCard title="資產負債對比" />;
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">資產負債對比</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              資產
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              負債
            </span>
          </div>
          <ChartExpandButton title="資產負債對比">
            <BarChartSvg points={points} variant="fullscreen" />
          </ChartExpandButton>
        </div>
      </div>
      <div className="mt-2">
        <BarChartSvg points={points} variant="compact" />
      </div>
    </div>
  );
}

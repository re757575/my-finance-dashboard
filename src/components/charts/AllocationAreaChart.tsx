import { useState } from "react";
import { ChartExpandButton } from "@/components/charts/ChartExpandButton";
import {
  ChartNoteMarker,
  ChartTooltipNote,
} from "@/components/charts/ChartNote";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { EmptyTrendCard } from "@/components/charts/EmptyTrendCard";
import { formatPercent, formatShortDate } from "@/lib/format";

export interface AllocationPoint {
  date: string;
  /** 以下四項皆為占金融資產（現金＋股票）的百分比，加總為 100（PRD 第 5 節）。 */
  cashRatio: number;
  restrictedCashRatio: number;
  twStockRatio: number;
  usStockRatio: number;
  /** 該筆快照的備註，有值時節點上方以圓環標示、Tooltip 多一行（PRD 4.2「快照備註」）。 */
  note?: string;
}

interface AllocationAreaChartProps {
  title?: string;
  points: AllocationPoint[];
}

type LayerKey = "cash" | "restrictedCash" | "twStock" | "usStock";

/** 由下而上的堆疊順序與配色，與「資產配置比例水平堆疊長條圖」一致（PRD 4.2 節）。 */
const LAYERS: {
  key: LayerKey;
  label: string;
  fillClassName: string;
  swatchClassName: string;
  pick: (p: AllocationPoint) => number;
}[] = [
  {
    key: "cash",
    label: "現金",
    fillClassName: "fill-blue-600",
    swatchClassName: "bg-blue-600",
    pick: (p) => p.cashRatio,
  },
  {
    key: "restrictedCash",
    label: "不可動用現金",
    fillClassName: "fill-slate-500",
    swatchClassName: "bg-slate-500",
    pick: (p) => p.restrictedCashRatio,
  },
  {
    key: "twStock",
    label: "台股",
    fillClassName: "fill-orange-600",
    swatchClassName: "bg-orange-600",
    pick: (p) => p.twStockRatio,
  },
  {
    key: "usStock",
    label: "美股",
    fillClassName: "fill-teal-600",
    swatchClassName: "bg-teal-600",
    pick: (p) => p.usStockRatio,
  },
];

const COMPACT_WIDTH = 320;
const COMPACT_HEIGHT = 120;
const COMPACT_PADDING = 24;

const FULLSCREEN_CHART_HEIGHT = 220;
const FULLSCREEN_LABEL_HEIGHT = 28;
const FULLSCREEN_HEIGHT = FULLSCREEN_CHART_HEIGHT + FULLSCREEN_LABEL_HEIGHT;
const FULLSCREEN_PADDING = 32;
const FULLSCREEN_POINT_SPACING = 48;
const FULLSCREEN_Y_AXIS_WIDTH = 56;
/** 占比範圍固定為 0–100%，Y 軸刻度固定 5 個，不需要 nice numbers 演算法（PRD 4.2 節）。 */
const Y_AXIS_TICKS = [0, 25, 50, 75, 100];
/** 備註標記畫在繪圖區上緣（100%）之上。 */
const NOTE_MARKER_OFFSET = 8;

interface AreaChartSvgProps {
  title: string;
  points: AllocationPoint[];
  layers: typeof LAYERS;
  variant: "compact" | "fullscreen";
}

/** 手刻 SVG 100% 堆疊面積圖本體：compact 為響應式縮放、fullscreen 為固定節點間距＋橫向捲動（PRD 4.2、8 節）。 */
function AreaChartSvg({ title, points, layers, variant }: AreaChartSvgProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isFullscreen = variant === "fullscreen";

  const yAxisWidth = isFullscreen ? FULLSCREEN_Y_AXIS_WIDTH : 0;
  const padding = isFullscreen ? FULLSCREEN_PADDING : COMPACT_PADDING;
  const width = isFullscreen
    ? yAxisWidth + padding * 2 + (points.length - 1) * FULLSCREEN_POINT_SPACING
    : COMPACT_WIDTH;
  const totalHeight = isFullscreen ? FULLSCREEN_HEIGHT : COMPACT_HEIGHT;
  const chartHeight = isFullscreen ? FULLSCREEN_CHART_HEIGHT : COMPACT_HEIGHT;
  const leftInset = padding + yAxisWidth;
  const stepX = (width - leftInset - padding) / (points.length - 1);
  const toY = (percent: number) =>
    padding + (1 - percent / 100) * (chartHeight - padding * 2);
  const xs = points.map((_, i) => leftInset + i * stepX);

  // 逐層累加：第 k 層的下緣為前 k 層占比加總、上緣再加上自己
  const lowers = points.map(() => 0);
  const bands = layers.map((layer) => {
    const bottoms = [...lowers];
    const tops = points.map((p, i) => {
      lowers[i] += layer.pick(p);
      return lowers[i];
    });
    const upper = tops.map(
      (t, i) => `${xs[i].toFixed(1)} ${toY(t).toFixed(1)}`
    );
    const lower = bottoms
      .map((b, i) => `${xs[i].toFixed(1)} ${toY(b).toFixed(1)}`)
      .reverse();
    return { layer, d: `M ${upper.join(" L ")} L ${lower.join(" L ")} Z` };
  });

  const active = activeIndex !== null ? points[activeIndex] : null;

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
            isFullscreen ? "overflow-visible" : "w-full overflow-visible"
          }
          role="img"
          aria-label={`${title}堆疊面積圖，共 ${points.length} 筆資料${isFullscreen ? "（全螢幕）" : ""}`}
          onClick={() => setActiveIndex(null)}
        >
          {isFullscreen &&
            Y_AXIS_TICKS.map((tick) => (
              <g key={tick}>
                <line
                  x1={leftInset}
                  y1={toY(tick)}
                  x2={width - padding}
                  y2={toY(tick)}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-slate-100 dark:text-neutral-800"
                />
                <text
                  x={leftInset - 8}
                  y={toY(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-neutral-400 text-xs"
                >
                  {tick}%
                </text>
              </g>
            ))}
          {bands.map(({ layer, d }) => (
            <path
              key={layer.key}
              d={d}
              data-testid={`allocation-layer-${layer.key}`}
              className={layer.fillClassName}
              fillOpacity={0.9}
            />
          ))}
          {xs.map(
            (x, i) =>
              points[i].note && (
                <ChartNoteMarker
                  key={`note-${points[i].date}`}
                  cx={x}
                  cy={padding - NOTE_MARKER_OFFSET}
                  index={i}
                  withDot
                  className="text-slate-500 dark:text-neutral-400"
                />
              )
          )}
          {active && activeIndex !== null && (
            <line
              x1={xs[activeIndex]}
              y1={padding}
              x2={xs[activeIndex]}
              y2={chartHeight - padding}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 3"
              className="text-white"
            />
          )}
          {xs.map((x, i) => (
            <rect
              key={points[i].date}
              x={x - stepX / 2}
              y={padding}
              width={stepX}
              height={chartHeight - padding * 2}
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
          ))}
          {isFullscreen &&
            xs.map((x, i) => (
              <text
                key={`label-${points[i].date}`}
                x={x}
                y={FULLSCREEN_CHART_HEIGHT + 16}
                textAnchor="middle"
                className="fill-slate-400 dark:fill-neutral-400 text-xs"
              >
                {formatShortDate(points[i].date)}
              </text>
            ))}
        </svg>
        {active && activeIndex !== null && (
          <ChartTooltip
            x={xs[activeIndex]}
            y={padding}
            width={width}
            height={totalHeight}
            clampToBounds={isFullscreen}
          >
            <p>{active.date}</p>
            {layers.map((layer) => {
              const value = layer.pick(active);
              // 不可動用現金為 0 的節點不列該行（PRD 4.2 節）
              if (layer.key === "restrictedCash" && value === 0) return null;
              return (
                <p key={layer.key}>
                  {layer.label} {formatPercent(value)}
                </p>
              );
            })}
            <ChartTooltipNote note={active.note} />
          </ChartTooltip>
        )}
      </div>
      {!isFullscreen && (
        <div className="mt-1 flex justify-between text-xs text-slate-400 dark:text-neutral-400">
          <span>{points[0].date}</span>
          <span>{points.at(-1)?.date}</span>
        </div>
      )}
    </div>
  );
}

/** 圖例：色塊＋文字＋最新一筆占比，不只靠顏色辨識（PRD 4.2、7 節）。 */
function Legend({
  layers,
  latest,
}: {
  layers: typeof LAYERS;
  latest: AllocationPoint;
}) {
  return (
    <div
      data-testid="allocation-legend"
      className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-neutral-300"
    >
      {layers.map((layer) => (
        <span key={layer.key} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${layer.swatchClassName}`} />
          {layer.label} {formatPercent(layer.pick(latest))}
        </span>
      ))}
    </div>
  );
}

/**
 * 資產配置趨勢圖：100% 堆疊面積圖，呈現可動用現金／不可動用現金／台股／美股占金融資產比例隨時間的變化
 * （PRD 4.2 節）。不可動用現金整段期間皆為 0 時不顯示該層與圖例；少於 2 筆時顯示空狀態。
 * 呼叫端需先排除沒有意義的快照（金融資產為 0 或任一類占比為負）。
 */
export function AllocationAreaChart({
  title = "資產配置趨勢",
  points,
}: AllocationAreaChartProps) {
  if (points.length < 2) {
    return <EmptyTrendCard title={title} />;
  }

  const layers = LAYERS.filter(
    (layer) =>
      layer.key !== "restrictedCash" || points.some((p) => layer.pick(p) > 0)
  );
  const latest = points.at(-1)!;

  return (
    <div className="rounded-xl bg-white dark:bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-slate-500 dark:text-neutral-400">{title}</p>
        <ChartExpandButton title={title}>
          <Legend layers={layers} latest={latest} />
          <AreaChartSvg
            title={title}
            points={points}
            layers={layers}
            variant="fullscreen"
          />
        </ChartExpandButton>
      </div>
      <div className="mt-2">
        <AreaChartSvg
          title={title}
          points={points}
          layers={layers}
          variant="compact"
        />
      </div>
      <Legend layers={layers} latest={latest} />
    </div>
  );
}

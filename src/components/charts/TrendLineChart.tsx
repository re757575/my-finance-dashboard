import { EmptyTrendCard } from "@/components/charts/EmptyTrendCard";

interface TrendLineChartProps {
  title: string;
  points: { month: string; value: number }[];
  formatValue?: (value: number) => string;
  colorClassName?: string;
}

const WIDTH = 320;
const HEIGHT = 120;
const PADDING = 24;

/** 手刻 SVG 折線圖，不引入圖表庫，以符合 PRD 8 節「輕量圖表方案」的效能限制。 */
export function TrendLineChart({
  title,
  points,
  formatValue = String,
  colorClassName = "text-blue-500",
}: TrendLineChartProps) {
  if (points.length < 2) {
    return <EmptyTrendCard title={title} />;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (WIDTH - PADDING * 2) / (points.length - 1);

  const coords = points.map((p, i) => ({
    x: PADDING + i * stepX,
    y: PADDING + (1 - (p.value - min) / range) * (HEIGHT - PADDING * 2),
  }));
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const last = points.at(-1)!;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-sm font-semibold text-slate-700">
          {formatValue(last.value)}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={`mt-2 w-full ${colorClassName}`}
        role="img"
        aria-label={`${title}折線圖，共 ${points.length} 個月資料`}
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
          <circle
            key={points[i].month}
            cx={c.x}
            cy={c.y}
            r={2.5}
            fill="currentColor"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{points[0].month}</span>
        <span>{last.month}</span>
      </div>
    </div>
  );
}

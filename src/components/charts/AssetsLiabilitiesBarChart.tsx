import { EmptyTrendCard } from "@/components/charts/EmptyTrendCard";

interface AssetsLiabilitiesBarChartProps {
  points: { month: string; assets: number; liabilities: number }[];
}

const WIDTH = 320;
const HEIGHT = 120;
const PADDING = 24;

/** 手刻 SVG 分組長條圖：資產 vs 負債對比（PRD 4.2 節）。 */
export function AssetsLiabilitiesBarChart({
  points,
}: AssetsLiabilitiesBarChartProps) {
  if (points.length < 2) {
    return <EmptyTrendCard title="資產負債對比" />;
  }

  const max = Math.max(...points.flatMap((p) => [p.assets, p.liabilities]), 1);
  const groupWidth = (WIDTH - PADDING * 2) / points.length;
  const barWidth = Math.min(10, groupWidth / 3);
  const chartHeight = HEIGHT - PADDING * 2;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">資產負債對比</p>
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
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`資產負債對比長條圖，共 ${points.length} 個月資料`}
      >
        {points.map((p, i) => {
          const groupX = PADDING + i * groupWidth;
          const assetsHeight = (p.assets / max) * chartHeight;
          const liabilitiesHeight = (p.liabilities / max) * chartHeight;
          return (
            <g key={p.month}>
              <rect
                x={groupX + groupWidth / 2 - barWidth - 1}
                y={HEIGHT - PADDING - assetsHeight}
                width={barWidth}
                height={assetsHeight}
                rx={1}
                className="fill-blue-500"
              />
              <rect
                x={groupX + groupWidth / 2 + 1}
                y={HEIGHT - PADDING - liabilitiesHeight}
                width={barWidth}
                height={liabilitiesHeight}
                rx={1}
                className="fill-rose-400"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{points[0].month}</span>
        <span>{points.at(-1)?.month}</span>
      </div>
    </div>
  );
}

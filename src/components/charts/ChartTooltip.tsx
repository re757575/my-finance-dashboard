import { useLayoutEffect, useRef, useState } from "react";

interface ChartTooltipProps {
  /** 節點在圖表座標空間（0..width, 0..height）中的位置。 */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * 全螢幕檢視座標空間即為實際像素（SVG 設有固定 width/height），可據此將 tooltip
   * 位置夾在「捲動容器目前可視範圍」內（見 data-chart-scroll 標記），避免被水平捲動
   * 容器（overflow-x-auto，連帶使 overflow-y 也變成非 visible）裁掉邊緣節點的
   * tooltip；compact 檢視座標空間非實際像素（響應式縮放），不適用夾取，維持原本置中定位。
   */
  clampToBounds?: boolean;
  children: React.ReactNode;
}

/** 節點 hover/點擊時的浮動數值提示框，以百分比定位對齊圖表座標（PRD 4.2 節）。 */
export function ChartTooltip({
  x,
  y,
  width,
  height,
  clampToBounds = false,
  children,
}: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!clampToBounds || !ref.current) {
      setShift({ x: 0, y: 0 });
      return;
    }
    const { width: tooltipWidth, height: tooltipHeight } =
      ref.current.getBoundingClientRect();
    const halfWidth = tooltipWidth / 2;

    // 節點座標空間（0..width）只是 SVG 自身的邏輯寬度，當節點數少時常常比捲動容器
    // 目前可視的範圍窄很多；真正會裁切 tooltip 的邊界是捲動容器「目前捲動位置」下
    // 的可視範圍，而非 SVG 自身寬度，否則會誤把 tooltip 夾進一個過窄的範圍反而裁到。
    const scrollParent = ref.current.closest<HTMLElement>(
      "[data-chart-scroll]"
    );
    const boundLeft = scrollParent ? scrollParent.scrollLeft : 0;
    const boundRight = scrollParent
      ? scrollParent.scrollLeft + scrollParent.clientWidth
      : width;

    let shiftX = 0;
    if (x - halfWidth < boundLeft) {
      shiftX = boundLeft - (x - halfWidth);
    } else if (x + halfWidth > boundRight) {
      shiftX = boundRight - (x + halfWidth);
    }

    // 預設往上彈出（-translate-y-full），太靠近頂端時改往下彈出。
    let shiftY = 0;
    if (y - tooltipHeight - 8 < 0) {
      shiftY = tooltipHeight + 16;
    }

    setShift({ x: shiftX, y: shiftY });
  }, [clampToBounds, x, y, width]);

  return (
    <div
      ref={ref}
      data-testid="chart-tooltip"
      className="pointer-events-none absolute z-10 rounded-md bg-slate-800 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg"
      style={{
        left: `${(x / width) * 100}%`,
        top: `${(y / height) * 100}%`,
        marginTop: -8,
        transform: `translate(calc(-50% + ${shift.x}px), calc(-100% + ${shift.y}px))`,
      }}
    >
      {children}
    </div>
  );
}

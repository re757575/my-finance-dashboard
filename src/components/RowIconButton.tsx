import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface RowIconButtonProps extends Omit<
  ComponentProps<"button">,
  "type" | "aria-label"
> {
  /** 無障礙名稱：按鈕內只有圖示，沒有文字。 */
  label: string;
  /** `danger` 用於刪除，hover 時轉為紅色。 */
  tone?: "neutral" | "danger";
}

/**
 * 清單列右側的圖示按鈕（鎖定／複製／刪除）。圖示用 lucide 的 SVG 而非 emoji，
 * 才能跟著文字顏色變化（hover、未啟用的淡色、深色模式）。
 * 觸控裝置（`pointer: coarse`）上放大到 40px 見方（PRD 第 7 節「觸控目標」）。
 */
export function RowIconButton({
  label,
  tone = "neutral",
  className,
  children,
  ...props
}: RowIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 dark:text-neutral-400 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-10 [&_svg]:size-4 pointer-coarse:[&_svg]:size-5",
        tone === "danger"
          ? "hover:bg-rose-50 dark:hover:bg-rose-950 hover:text-rose-500 dark:hover:text-rose-400"
          : "hover:bg-slate-100 dark:hover:bg-muted hover:text-slate-700 dark:hover:text-neutral-200",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

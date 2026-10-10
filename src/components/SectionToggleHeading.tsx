import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionToggleHeadingProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** 被收合內容的容器 id，供輔助科技對應標題與內容。 */
  contentId: string;
}

/**
 * 可收合區塊的標題（PRD 4.2「快照比較與歷史快照預設收合」）：整個標題就是切換按鈕，
 * 以 `aria-expanded` 表達狀態，箭頭方向同時提供視覺提示（不只靠顏色）。
 */
export function SectionToggleHeading({
  title,
  open,
  onToggle,
  contentId,
}: SectionToggleHeadingProps) {
  return (
    <h2 className="text-lg font-semibold text-slate-800 dark:text-neutral-100">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className="-mx-1.5 flex min-h-10 items-center gap-1.5 rounded-md px-1.5 text-left outline-none hover:bg-slate-100 dark:hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-slate-500 dark:text-neutral-400 transition-transform",
            open && "rotate-90"
          )}
        />
        {title}
      </button>
    </h2>
  );
}

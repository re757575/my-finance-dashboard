import { cn } from "@/lib/utils";

interface SegmentedToggleProps<T extends string | number> {
  /** 整組按鈕的無障礙名稱。 */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * 膠囊狀的分段切換鈕（幣別、攤還方式、壓力測試情境）：以 `aria-pressed` 表達選取狀態。
 * 觸控裝置（`pointer: coarse`）上每顆按鈕至少 40px 高，滑鼠操作維持精簡尺寸
 * （PRD 第 7 節「觸控目標」）。
 */
export function SegmentedToggle<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 rounded-full border border-slate-200 dark:border-border p-0.5 text-xs whitespace-nowrap pointer-coarse:text-sm",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium transition-colors pointer-coarse:min-h-10 pointer-coarse:px-3.5",
            value === option.value
              ? "bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

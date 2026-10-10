import { useId } from "react";
import { SectionToggleHeading } from "@/components/SectionToggleHeading";

interface InputSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** 收合時顯示在標題旁的一行摘要（目前數值），展開時不顯示。 */
  summary: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}

/**
 * 輸入區的可收合區塊（PRD 4.2「輸入區分段收合」）：標題是切換按鈕，收合時不渲染欄位，
 * 改以一行摘要顯示目前數值。欄位的資料在草稿內，收合不影響計算與存檔。
 * 展開狀態由 `useInputSections` 管理（只存在 state）。
 */
export function InputSection({
  title,
  open,
  onToggle,
  summary,
  testId,
  children,
}: InputSectionProps) {
  const contentId = useId();

  return (
    <section data-testid={testId} className="py-2 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <SectionToggleHeading
          title={title}
          open={open}
          onToggle={onToggle}
          contentId={contentId}
          size="sm"
        />
        {!open && (
          <p
            data-testid={`${testId}-summary`}
            className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1 py-1 text-right text-xs text-slate-500 dark:text-neutral-400"
          >
            {summary}
          </p>
        )}
      </div>
      <div id={contentId} hidden={!open} className="space-y-4 pt-1 pb-2">
        {open ? children : null}
      </div>
    </section>
  );
}

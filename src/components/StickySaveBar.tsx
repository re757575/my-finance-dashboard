import { Button } from "@/components/ui/button";

interface StickySaveBarProps {
  /** 有可以存檔的未存檔手動編輯。 */
  hasUnsavedEdits: boolean;
  /** 修正模式下被修正的日期；一般狀態為 null。 */
  editingDate: string | null;
  /** 最近一次存檔／刪除的結果訊息，沒有時為 null。 */
  message: string | null;
  onSave: () => void;
}

/**
 * 固定在畫面底部的儲存列（PRD 4.2「固定儲存列」）：輸入區很長（單欄與桌面左欄皆然），改完上方欄位後
 * 不必捲到表單最底才能存檔。只在有未存檔的手動編輯、或剛完成存檔／刪除要顯示結果訊息時出現；
 * 表單底部原本的「更新儀表板」按鈕仍保留。
 */
export function StickySaveBar({
  hasUnsavedEdits,
  editingDate,
  message,
  onSave,
}: StickySaveBarProps) {
  if (!hasUnsavedEdits && !message) return null;

  return (
    <div
      data-testid="sticky-save-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 dark:border-border bg-white/95 dark:bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.08)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <p
          role="status"
          data-testid="sticky-save-message"
          className="min-w-0 text-sm text-slate-700 dark:text-neutral-200"
        >
          {message ??
            (editingDate
              ? `修正 ${editingDate}：有未儲存的變更`
              : "有未儲存的變更")}
        </p>
        {hasUnsavedEdits && (
          <Button
            type="button"
            size="lg"
            data-testid="sticky-save-button"
            className="shrink-0 px-4"
            onClick={onSave}
          >
            {editingDate ? "儲存修正" : "更新儀表板"}
          </Button>
        )}
      </div>
    </div>
  );
}

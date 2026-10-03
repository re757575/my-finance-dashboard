import { Button } from "@/components/ui/button";

interface SnapshotEditBannerProps {
  /** 正在修正的歷史快照日期；null 代表一般狀態，不顯示（PRD 4.2「修正歷史快照」）。 */
  date: string | null;
  onCancel: () => void;
}

/**
 * 修正模式橫幅：以文字說明目前正在修正哪一天，並提醒今日草稿已暫存、完成後會還原。
 * 以文字呈現狀態，不只用顏色區分（PRD 7 節無障礙規範）。
 */
export function SnapshotEditBanner({
  date,
  onCancel,
}: SnapshotEditBannerProps) {
  if (date === null) return null;

  return (
    <div
      data-testid="snapshot-edit-banner"
      role="status"
      className="space-y-2 rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200"
    >
      <p className="font-medium">正在修正 {date} 的快照</p>
      <p className="text-xs">
        日期無法更改，儲存只會覆蓋這一天。今日草稿已暫存，完成後會還原。
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>
        取消修正
      </Button>
    </div>
  );
}

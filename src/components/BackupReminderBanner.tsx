import type { BackupReminder } from "@/lib/dataFreshness";

interface BackupReminderBannerProps {
  reminder: BackupReminder;
}

/**
 * 備份提醒橫幅（PRD 4.2「備份提醒」）：距上次備份超過 30 天時出現（從未備份則自第一筆快照起算），
 * 完成任何一次匯出後自動消失，不提供永久關閉。樣式與資料無法讀取等既有橫幅一致。
 */
export function BackupReminderBanner({ reminder }: BackupReminderBannerProps) {
  if (!reminder.shouldRemind) return null;

  const lead = reminder.neverBackedUp
    ? `尚未備份過（第一筆資料已存在 ${reminder.days} 天）`
    : `距上次備份已 ${reminder.days} 天`;

  return (
    <div
      data-testid="backup-reminder"
      role="status"
      className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
    >
      {lead}，建議至左側「資料管理」匯出備份，以免瀏覽器資料被清除時遺失。
    </div>
  );
}

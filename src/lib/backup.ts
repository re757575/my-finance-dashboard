import { parseFinanceData, type LoadResult } from "@/lib/storage";
import type { FinanceData } from "@/types/schema";

/** 純前端實作：Blob + <a download> 觸發下載，不經任何伺服器（PRD 第 8 節隱私需求）。 */
export function downloadBackup(
  data: FinanceData,
  filename = defaultBackupFilename()
): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function defaultBackupFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `my-finance-dashboard-backup-${y}${m}${d}.json`;
}

/** 讀取使用者選擇的備份檔並用與 LocalStorage 相同的規則驗證（PRD 第 6.1 節）。 */
export function parseBackupFile(file: File): Promise<LoadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(parseFinanceData(String(reader.result)));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

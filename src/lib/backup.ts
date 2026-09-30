import {
  BackupDecryptError,
  CryptoUnavailableError,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
} from "@/lib/backupCrypto";
import { parseFinanceData, type LoadResult } from "@/lib/storage";
import type { FinanceData } from "@/types/schema";

/** 純前端實作：Blob + <a download> 觸發下載，不經任何伺服器（PRD 第 8 節隱私需求）。 */
function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 明文匯出。需要保護檔案內容時請改用 downloadEncryptedBackup（PRD 4.2「加密匯出備份」）。 */
export function downloadBackup(
  data: FinanceData,
  filename = defaultBackupFilename()
): void {
  triggerDownload(JSON.stringify(data, null, 2), filename);
}

/**
 * 加密匯出（PRD 4.2、6.2 節）：明文內容與 downloadBackup 相同，加密後才交給瀏覽器下載，
 * 因此加密失敗時不會下載任何檔案。環境不支援 WebCrypto 時拋出 CryptoUnavailableError。
 */
export async function downloadEncryptedBackup(
  data: FinanceData,
  password: string,
  filename = defaultEncryptedBackupFilename()
): Promise<void> {
  const encrypted = await encryptBackup(
    JSON.stringify(data, null, 2),
    password
  );
  triggerDownload(encrypted, filename);
}

function formatDateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function defaultBackupFilename(date: Date = new Date()): string {
  return `my-finance-dashboard-backup-${formatDateStamp(date)}.json`;
}

export function defaultEncryptedBackupFilename(
  date: Date = new Date()
): string {
  return `my-finance-dashboard-backup-${formatDateStamp(date)}.enc.json`;
}

/**
 * 讀取備份檔的結果：除了與 LocalStorage 相同的讀取狀態（PRD 第 6.1 節）外，
 * 加密備份另有 "encrypted"（尚未提供密碼）、"wrong-password"（密碼錯誤或檔案損毀）、
 * "crypto-unavailable"（環境不支援 WebCrypto）。
 */
export type BackupParseResult =
  | LoadResult
  | { status: "encrypted" }
  | { status: "wrong-password" }
  | { status: "crypto-unavailable" };

/**
 * 讀取使用者選擇的備份檔並用與 LocalStorage 相同的規則驗證（PRD 第 6.1 節）。
 * 偵測到加密備份時：未提供密碼回傳 "encrypted"；提供密碼則解密後再走同一套驗證與遷移。
 */
export async function parseBackupFile(
  file: File,
  password?: string
): Promise<BackupParseResult> {
  const text = await readFileAsText(file);
  if (!isEncryptedBackup(text)) return parseFinanceData(text);
  if (!password) return { status: "encrypted" };

  try {
    return parseFinanceData(await decryptBackup(text, password));
  } catch (error) {
    if (error instanceof CryptoUnavailableError) {
      return { status: "crypto-unavailable" };
    }
    if (error instanceof BackupDecryptError)
      return { status: "wrong-password" };
    throw error;
  }
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

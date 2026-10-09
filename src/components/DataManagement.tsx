import { useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFileDrop } from "@/hooks/useFileDrop";
import { MIN_BACKUP_PASSWORD_LENGTH } from "@/lib/backupCrypto";
import { daysBetweenDates } from "@/lib/dataFreshness";
import { getCurrentDate } from "@/lib/storage";

interface DataManagementProps {
  onExport: () => void;
  /** 加密匯出（PRD 4.2）；未提供時不顯示「加密匯出」按鈕。 */
  onExportEncrypted?: (
    password: string
  ) => Promise<{ ok: boolean; reason?: string }>;
  onImport: (
    file: File,
    password?: string
  ) => Promise<{ ok: boolean; reason?: string; needsPassword?: boolean }>;
  onClearConfirmed: () => void;
  /** 提供時於區塊內顯示「上次備份」時間（PRD 4.2「備份提醒」）；lastBackupAt 為 null 代表從未備份。 */
  backupStatus?: { lastBackupAt: string | null; currentDate: string };
}

function formatLastBackup(
  status: NonNullable<DataManagementProps["backupStatus"]>
): string {
  if (status.lastBackupAt === null) return "尚未備份";
  const date = getCurrentDate(new Date(status.lastBackupAt));
  const days = Math.max(0, daysBetweenDates(date, status.currentDate));
  return `${date}（${days === 0 ? "今天" : `${days} 天前`}）`;
}

/**
 * 匯出/加密匯出/匯入備份、清空本地資料。清空前強制先觸發（明文）匯出（PRD 4.2 節，決策 Q9 選項 C）。
 * 匯入的檔案可由按鈕選擇，或直接拖曳到頁面上任何位置；兩者都只是開啟同一個二次確認對話框。
 * 密碼只存在於對話框的 state，關閉對話框即清除，不寫入任何儲存位置。
 */
export function DataManagement({
  onExport,
  onExportEncrypted,
  onImport,
  onClearConfirmed,
  backupStatus,
}: DataManagementProps) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNeedsPassword, setImportNeedsPassword] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [encryptDialogOpen, setEncryptDialogOpen] = useState(false);
  const [encryptPassword, setEncryptPassword] = useState("");
  const [encryptConfirm, setEncryptConfirm] = useState("");
  const [encryptError, setEncryptError] = useState<string | null>(null);
  const [encrypting, setEncrypting] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropErrorRef = useRef<HTMLParagraphElement>(null);

  function resetImportState() {
    setImportError(null);
    setImportNeedsPassword(false);
    setImportPassword("");
  }

  function openImportDialog(file: File) {
    setPendingFile(file);
    setDropError(null);
    resetImportState();
    setImportDialogOpen(true);
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) openImportDialog(file);
    e.target.value = "";
  }

  const isDraggingFile = useFileDrop((files) => {
    if (files.length === 0) return;
    if (files.length > 1) {
      // 不猜測要匯入哪一個。訊息在資料管理區，使用者可能捲到別處：先渲染出來再帶回視線內
      flushSync(() => setDropError("一次只能匯入一個備份檔，請重新拖曳。"));
      dropErrorRef.current?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    openImportDialog(files[0]);
  });

  function handleImportDialogChange(open: boolean) {
    setImportDialogOpen(open);
    if (!open) resetImportState();
  }

  async function confirmImport() {
    if (!pendingFile) return;
    const result = importNeedsPassword
      ? await onImport(pendingFile, importPassword)
      : await onImport(pendingFile);
    if (result.needsPassword) {
      // 加密備份：改為請使用者輸入密碼，這不算錯誤
      setImportNeedsPassword(true);
      setImportError(null);
      return;
    }
    if (!result.ok) {
      setImportError(result.reason ?? "匯入失敗，請確認檔案內容正確。");
      return;
    }
    setImportDialogOpen(false);
    setPendingFile(null);
    resetImportState();
  }

  function handleClearClick() {
    onExport();
    setClearDialogOpen(true);
  }

  function openEncryptDialog() {
    setEncryptPassword("");
    setEncryptConfirm("");
    setEncryptError(null);
    setEncryptDialogOpen(true);
  }

  function handleEncryptDialogChange(open: boolean) {
    setEncryptDialogOpen(open);
    if (!open) {
      setEncryptPassword("");
      setEncryptConfirm("");
      setEncryptError(null);
    }
  }

  async function confirmEncryptedExport() {
    if (!onExportEncrypted) return;
    if (encryptPassword.length < MIN_BACKUP_PASSWORD_LENGTH) {
      setEncryptError(`密碼至少需要 ${MIN_BACKUP_PASSWORD_LENGTH} 個字元。`);
      return;
    }
    if (encryptPassword !== encryptConfirm) {
      setEncryptError("兩次輸入的密碼不一致。");
      return;
    }
    setEncryptError(null);
    setEncrypting(true);
    try {
      const result = await onExportEncrypted(encryptPassword);
      if (!result.ok) {
        setEncryptError(result.reason ?? "加密匯出失敗，請重試。");
        return;
      }
      handleEncryptDialogChange(false);
    } finally {
      setEncrypting(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 dark:border-border pt-4">
      <p className="text-sm font-medium text-slate-700 dark:text-neutral-200">
        資料管理
      </p>
      {backupStatus && (
        <p
          data-testid="last-backup"
          className="text-xs text-slate-500 dark:text-neutral-400"
        >
          上次備份：{formatLastBackup(backupStatus)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onExport}>
          匯出備份
        </Button>
        {onExportEncrypted && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openEncryptDialog}
          >
            加密匯出
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          匯入還原
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileSelected}
        />
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleClearClick}
        >
          清空本地資料
        </Button>
      </div>
      <p className="text-xs text-slate-500 dark:text-neutral-400 pointer-coarse:hidden">
        也可以把備份檔直接拖曳到頁面上匯入
      </p>
      {dropError && (
        <p
          ref={dropErrorRef}
          role="alert"
          data-testid="import-drop-error"
          className="text-xs text-rose-600 dark:text-rose-400"
        >
          {dropError}
        </p>
      )}
      {isDraggingFile &&
        createPortal(
          <div
            data-testid="import-drop-overlay"
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          >
            <div className="rounded-xl border-2 border-dashed border-slate-300 dark:border-border bg-white dark:bg-card px-8 py-6 text-center shadow-lg">
              <p className="text-base font-medium text-slate-900 dark:text-neutral-50">
                放開以匯入備份檔
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                放開後會先請你確認，不會直接覆蓋資料
              </p>
            </div>
          </div>,
          document.body
        )}

      <Dialog open={importDialogOpen} onOpenChange={handleImportDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認匯入備份？</DialogTitle>
            <DialogDescription>
              匯入將會覆蓋目前瀏覽器中的所有資料，此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          {pendingFile && (
            <p
              data-testid="import-file-name"
              className="text-sm break-all text-slate-600 dark:text-neutral-300"
            >
              檔案：{pendingFile.name}
            </p>
          )}
          {importNeedsPassword && (
            <div className="space-y-2">
              <p
                data-testid="import-needs-password"
                className="text-sm text-slate-600 dark:text-neutral-300"
              >
                此備份檔已加密，請輸入密碼
              </p>
              <Input
                type="password"
                autoComplete="off"
                aria-label="備份密碼"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
              />
            </div>
          )}
          {importError && (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              {importError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleImportDialogChange(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={confirmImport}>
              確認覆蓋匯入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={encryptDialogOpen} onOpenChange={handleEncryptDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>加密匯出備份</DialogTitle>
            <DialogDescription>
              備份檔將以密碼加密，別人拿到檔案也看不到內容。忘記密碼將無法還原，系統不會儲存密碼，也無法幫你找回。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-sm text-slate-700 dark:text-neutral-200">
                密碼（至少 {MIN_BACKUP_PASSWORD_LENGTH} 個字元）
              </span>
              <Input
                type="password"
                autoComplete="new-password"
                aria-label="加密密碼"
                value={encryptPassword}
                onChange={(e) => setEncryptPassword(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-700 dark:text-neutral-200">
                確認密碼
              </span>
              <Input
                type="password"
                autoComplete="new-password"
                aria-label="確認加密密碼"
                value={encryptConfirm}
                onChange={(e) => setEncryptConfirm(e.target.value)}
              />
            </label>
          </div>
          {encryptError && (
            <p
              data-testid="encrypt-error"
              className="text-sm text-rose-600 dark:text-rose-400"
            >
              {encryptError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleEncryptDialogChange(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={confirmEncryptedExport}
              disabled={encrypting}
            >
              {encrypting ? "加密中…" : "加密並下載"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認清空所有本地資料？</DialogTitle>
            <DialogDescription>
              已為您觸發備份下載。確認後將清除所有歷史快照，此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onClearConfirmed();
                setClearDialogOpen(false);
              }}
            >
              確認清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DataManagementProps {
  onExport: () => void;
  onImport: (file: File) => Promise<{ ok: boolean; reason?: string }>;
  onClearConfirmed: () => void;
}

/** 匯出/匯入備份、清空本地資料。清空前強制先觸發匯出（PRD 4.2 節，決策 Q9 選項 C）。 */
export function DataManagement({
  onExport,
  onImport,
  onClearConfirmed,
}: DataManagementProps) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setImportError(null);
      setImportDialogOpen(true);
    }
    e.target.value = "";
  }

  async function confirmImport() {
    if (!pendingFile) return;
    const result = await onImport(pendingFile);
    if (!result.ok) {
      setImportError(result.reason ?? "匯入失敗，請確認檔案內容正確。");
      return;
    }
    setImportDialogOpen(false);
    setPendingFile(null);
  }

  function handleClearClick() {
    onExport();
    setClearDialogOpen(true);
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      <p className="text-sm font-medium text-slate-700">資料管理</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onExport}>
          匯出備份
        </Button>
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

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認匯入備份？</DialogTitle>
            <DialogDescription>
              匯入將會覆蓋目前瀏覽器中的所有資料，此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          {importError && (
            <p className="text-sm text-rose-600">{importError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={confirmImport}>
              確認覆蓋匯入
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

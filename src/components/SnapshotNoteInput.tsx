import { useId } from "react";
import { Input } from "@/components/ui/input";
import { SNAPSHOT_NOTE_MAX_LENGTH } from "@/lib/snapshotNote";

interface SnapshotNoteInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 快照備註（選填）：寫一行字記下這一天發生的事，日後在趨勢圖節點與歷史快照清單解讀數字的轉折
 * （PRD 4.2「快照備註」）。前後空白等正規化在存檔時處理，輸入過程不干涉使用者打字。
 */
export function SnapshotNoteInput({ value, onChange }: SnapshotNoteInputProps) {
  const hintId = useId();

  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700 dark:text-neutral-200">
          快照備註（選填）
        </span>
        <Input
          type="text"
          placeholder="例如：買房、換工作"
          maxLength={SNAPSHOT_NOTE_MAX_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={hintId}
        />
      </label>
      {/* 說明放在 label 之外，輸入框的名稱才不會連說明一起唸出來 */}
      <p id={hintId} className="text-xs text-slate-500 dark:text-neutral-400">
        記下這一天發生的事，會顯示在趨勢圖節點與歷史快照。
      </p>
    </div>
  );
}

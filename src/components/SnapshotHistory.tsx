import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import type { Snapshot } from "@/types/schema";

/** 預設只顯示最新幾筆，避免長期使用後清單過長（PRD 4.2「歷史快照清單」）。 */
const DEFAULT_VISIBLE_COUNT = 10;
/** 展開全部後的清單高度上限（24rem），超過時在區塊內捲動，不撐長頁面（PRD 4.2）。 */
const EXPANDED_LIST_CLASS = "max-h-96 overflow-y-auto";

interface SnapshotHistoryProps {
  /** 所有已存檔快照（任意順序皆可，元件內依日期由新到舊排序）。 */
  snapshots: Snapshot[];
  currentDate: string;
  /** 目前正在修正的快照日期，用於標示該列。 */
  editingDate: string | null;
  onEdit: (date: string) => void;
  onDelete: (date: string) => void;
}

/**
 * 歷史快照清單（PRD 4.2）：列出已存檔的每日快照（由新到舊），每筆可修正或刪除。
 * 今天的那一筆不顯示「修正」（本來就是主表單），仍可刪除；刪除前以 Dialog 二次確認。
 * 淨資產／總資產一律用該筆快照自己的欄位計算（PRD 5.4 節）。
 * 展開全部後清單在固定高度內捲動；每列指標只在快照資料或展開狀態改變時重算，
 * 表單輸入造成的重新渲染不會觸發重算（PRD 4.2）。
 */
export function SnapshotHistory({
  snapshots,
  currentDate,
  editingDate,
  onEdit,
  onDelete,
}: SnapshotHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => b.date.localeCompare(a.date)),
    [snapshots]
  );
  const rows = useMemo(
    () =>
      (expanded ? sorted : sorted.slice(0, DEFAULT_VISIBLE_COUNT)).map(
        (snapshot) => {
          const { netWorth, totalAssets } = calculateMetrics(snapshot);
          return { snapshot, netWorth, totalAssets };
        }
      ),
    [sorted, expanded]
  );
  const hasMore = sorted.length > DEFAULT_VISIBLE_COUNT;

  function confirmDelete() {
    if (pendingDelete === null) return;
    onDelete(pendingDelete);
    setPendingDelete(null);
  }

  return (
    <section className="space-y-3" data-testid="snapshot-history">
      <h2 className="text-lg font-semibold text-slate-800">歷史快照</h2>

      {sorted.length === 0 ? (
        <p
          data-testid="snapshot-history-empty"
          className="rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm"
        >
          尚未有已存檔的快照
        </p>
      ) : (
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <ul
            data-testid="snapshot-history-list"
            // 捲動區需可用鍵盤聚焦，鍵盤使用者才能捲動（PRD 4.2、7 節）
            tabIndex={expanded ? 0 : undefined}
            aria-label={expanded ? "歷史快照清單" : undefined}
            className={`divide-y divide-slate-100 ${expanded ? EXPANDED_LIST_CLASS : ""}`}
          >
            {rows.map(({ snapshot, netWorth, totalAssets }) => {
              const isToday = snapshot.date === currentDate;
              const isEditing = snapshot.date === editingDate;
              return (
                <li
                  key={snapshot.date}
                  data-testid={`snapshot-row-${snapshot.date}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {snapshot.date}
                      {isToday && (
                        <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                          今天
                        </span>
                      )}
                      {isEditing && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          修正中
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      淨資產{" "}
                      <span
                        className={netWorth < 0 ? "text-rose-600" : undefined}
                      >
                        {formatCurrency(netWorth)}
                      </span>
                      　總資產 {formatCurrency(totalAssets)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!isToday && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`修正 ${snapshot.date} 的快照`}
                        onClick={() => onEdit(snapshot.date)}
                      >
                        修正
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`刪除 ${snapshot.date} 的快照`}
                      onClick={() => setPendingDelete(snapshot.date)}
                    >
                      刪除
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div className="px-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded ? "收合" : `顯示全部（${sorted.length} 筆）`}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除 {pendingDelete} 的快照？</DialogTitle>
            <DialogDescription>
              此操作無法復原，趨勢圖會少一個節點，建議先匯出備份。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
            >
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

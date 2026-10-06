import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DemoDataBannerProps {
  /** 二次確認後呼叫：清除全部範例資料並結束範例模式。 */
  onExit: () => void;
}

/**
 * 範例模式橫幅（PRD 4.2「範例資料」）：畫面上是範例資料時以文字說明狀態，並提供清除的出口。
 * 清除前只做二次確認、不強制匯出備份——虛構資料可隨時重新載入。是否顯示由呼叫端決定。
 */
export function DemoDataBanner({ onExit }: DemoDataBannerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      data-testid="demo-data-banner"
      role="status"
      className="mb-4 space-y-2 rounded-lg bg-sky-50 dark:bg-sky-950 p-3 text-sm text-sky-800 dark:text-sky-200 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0"
    >
      <div>
        <p className="font-medium">目前顯示的是範例資料</p>
        <p className="text-xs">
          所有數字皆為虛構，可以放心修改、存檔與操作各項功能。準備好之後清除範例資料，就能開始輸入自己的資料。
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setConfirmOpen(true)}
      >
        清除範例資料，開始使用
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認清除範例資料？</DialogTitle>
            <DialogDescription>
              將清除所有範例快照（包含你在範例資料上所做的修改），表單回到空白。此操作無法復原，之後仍可重新載入範例資料。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onExit();
                setConfirmOpen(false);
              }}
            >
              確認清除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

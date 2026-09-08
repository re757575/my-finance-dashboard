import { useEffect } from "react";
import { Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ChartExpandButtonProps {
  title: string;
  children: React.ReactNode;
}

/** 進入瀏覽器原生全螢幕並嘗試鎖定橫向；不支援的瀏覽器（iOS Safari、桌面等）靜默失敗，不影響 Dialog 正常顯示。 */
async function enterFullscreenLandscape() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
    await screen.orientation.lock("landscape");
  } catch {
    // 裝置/瀏覽器不支援全螢幕或橫向鎖定時靜默略過，維持原本的直向 Dialog 顯示。
  }
}

function exitFullscreenLandscape() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  try {
    screen.orientation.unlock();
  } catch {
    // 不支援時靜默略過。
  }
}

/**
 * 圖表卡片右上角的全螢幕展開按鈕，以 Dialog 放大顯示圖表（PRD 4.2、7、8 節）。
 * 額外嘗試進入瀏覽器原生全螢幕並鎖定橫向：僅 Android Chrome 等支援 Screen Orientation
 * Lock API 的瀏覽器會實際轉向，iOS Safari／桌面瀏覽器不支援時靜默失敗，屬漸進增強、
 * 不阻擋任何裝置的正常使用。使用者以系統手勢（如返回鍵）自行退出全螢幕時，
 * 監聽 fullscreenchange 同步解除橫向鎖定，避免手機卡在橫向。
 */
export function ChartExpandButton({ title, children }: ChartExpandButtonProps) {
  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        try {
          screen.orientation.unlock();
        } catch {
          // 不支援時靜默略過。
        }
      }
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          void enterFullscreenLandscape();
        } else {
          exitFullscreenLandscape();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${title}全螢幕檢視`}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

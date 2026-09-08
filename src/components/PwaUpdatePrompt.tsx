import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

/**
 * PWA 有新版本可用時顯示更新提示，使用者主動點擊才重新整理，不自動更新。
 * 理由：自動更新可能在使用者填表單填到一半時把 draft 沖掉（PRD 5.4 節：未存檔的變更重新整理後不會保留）。
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      data-testid="pwa-update-prompt"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200 sm:right-4 sm:left-auto"
    >
      <p className="text-sm text-slate-700">有新版本可用</p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setNeedRefresh(false)}
        >
          稍後
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="pwa-update-confirm"
          onClick={() => updateServiceWorker(true)}
        >
          立即更新
        </Button>
      </div>
    </div>
  );
}

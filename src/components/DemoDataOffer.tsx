import { useState } from "react";
import { Button } from "@/components/ui/button";

interface DemoDataOfferProps {
  onLoad: () => Promise<{ ok: boolean; reason?: string }>;
}

/**
 * 範例資料邀請卡（PRD 4.2「範例資料」）：沒有任何已存檔快照時顯示，讓第一次使用的人一鍵載入
 * 全部虛構的範例資料，先看到看板與趨勢圖實際的樣子。是否顯示由呼叫端決定（見 useLocalSnapshots 的 canLoadDemo）。
 */
export function DemoDataOffer({ onLoad }: DemoDataOfferProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const result = await onLoad();
      if (!result.ok) setError(result.reason ?? "範例資料載入失敗，請重試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      data-testid="demo-data-offer"
      className="mb-4 space-y-3 rounded-xl bg-white dark:bg-card p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-neutral-50">
          第一次使用？先用範例資料試試看
        </h2>
        <p className="text-sm text-slate-600 dark:text-neutral-300">
          載入一份全部虛構的範例資料（多年的每月快照，含現金、股票、不動產、各類負債與收支），馬上看到所有看板與趨勢圖實際的樣子。資料只存在這個瀏覽器，隨時可以一鍵清除；載入後會取代表單上尚未存檔的內容。
        </p>
        {error && (
          <p
            data-testid="demo-data-error"
            role="alert"
            className="text-sm text-rose-600 dark:text-rose-400"
          >
            {error}
          </p>
        )}
      </div>
      <Button
        type="button"
        className="shrink-0"
        onClick={handleLoad}
        disabled={loading}
      >
        {loading ? "載入中…" : "載入範例資料"}
      </Button>
    </section>
  );
}

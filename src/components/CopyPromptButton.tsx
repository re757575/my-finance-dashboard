import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildFinancePrompt } from "@/lib/promptBuilder";
import type { CalculatedMetrics, Snapshot } from "@/types/schema";

interface CopyPromptButtonProps {
  currentMonth: string;
  draft: Snapshot;
  metrics: CalculatedMetrics;
  recentSnapshots: Snapshot[];
  disabled: boolean;
}

/** 一鍵複製財務健康檢查提示詞（Markdown）到剪貼簿，供使用者貼給 AI 分析。 */
export function CopyPromptButton({
  currentMonth,
  draft,
  metrics,
  recentSnapshots,
  disabled,
}: CopyPromptButtonProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  async function handleCopy() {
    const prompt = buildFinancePrompt({
      currentMonth,
      draft,
      metrics,
      recentSnapshots,
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyMessage("已複製到剪貼簿，可貼給 AI 分析。");
    } catch {
      setCopyMessage("複製失敗，請確認瀏覽器剪貼簿權限。");
    }
    window.setTimeout(() => setCopyMessage(null), 4000);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="copy-prompt-button"
        onClick={handleCopy}
        disabled={disabled}
      >
        複製 AI 分析提示詞
      </Button>
      {disabled ? (
        <p className="text-xs text-slate-400">先儲存本月資料才能生成提示詞</p>
      ) : (
        copyMessage && (
          <p
            data-testid="copy-prompt-message"
            className="text-xs text-slate-500"
          >
            {copyMessage}
          </p>
        )
      )}
    </div>
  );
}

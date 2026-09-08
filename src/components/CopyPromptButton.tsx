import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildPromptForMode,
  PROMPT_MODE_LABEL,
  type PromptMode,
} from "@/lib/promptBuilder";
import type { CalculatedMetrics, Snapshot } from "@/types/schema";

interface CopyPromptButtonProps {
  currentDate: string;
  draft: Snapshot;
  metrics: CalculatedMetrics;
  recentSnapshots: Snapshot[];
  disabled: boolean;
}

const PROMPT_MODE_OPTIONS = Object.entries(PROMPT_MODE_LABEL) as [
  PromptMode,
  string,
][];

/** 一鍵複製 AI 分析提示詞（Markdown）到剪貼簿：可切換「財務健康檢查」／「投資方向評估」模式（PRD 4.2 節）。 */
export function CopyPromptButton({
  currentDate,
  draft,
  metrics,
  recentSnapshots,
  disabled,
}: CopyPromptButtonProps) {
  const [mode, setMode] = useState<PromptMode>("health-checkup");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  async function handleCopy() {
    const prompt = buildPromptForMode(mode, {
      currentDate,
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
      <div className="flex items-center gap-2">
        <select
          aria-label="AI 分析提示詞模式"
          value={mode}
          onChange={(e) => setMode(e.target.value as PromptMode)}
          disabled={disabled}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm disabled:opacity-50"
        >
          {PROMPT_MODE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
      </div>
      {disabled ? (
        <p className="text-xs text-slate-400">先儲存今日資料才能生成提示詞</p>
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

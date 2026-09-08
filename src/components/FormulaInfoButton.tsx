import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface FormulaInfoButtonProps {
  /** 卡片名稱，用於按鈕的無障礙標籤與小浮窗標題（例如「負債比」）。 */
  title: string;
  /** 公式本身（符號形式），例如「負債比 = 總負債 ÷ 總資產 × 100%」。 */
  formula: string;
  /** 代入實際數值後的計算過程，例如「$300,000 ÷ $1,000,000 × 100% = 30.0%」。 */
  substitution: string;
  /** 邊界情況說明（選填），例如「總資產為 0 時強制為 0%，避免除以零」。 */
  note?: string;
}

/**
 * 卡片標題旁的計算公式說明按鈕：點擊後以 Popover 顯示公式與代入實際數值的計算過程，
 * 讓使用者知道數字是怎麼算出來的。所有現況卡片、資產配置、FIRE 進度共用此元件。
 */
export function FormulaInfoButton({
  title,
  formula,
  substitution,
  note,
}: FormulaInfoButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${title}計算公式說明`}
        >
          <Info className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" data-testid="formula-info-content">
        <p className="font-medium text-slate-900">{title}</p>
        <p className="whitespace-pre-line text-slate-500">{formula}</p>
        <p className="font-mono text-xs whitespace-pre-line text-slate-700">
          {substitution}
        </p>
        {note && <p className="text-xs text-slate-400">{note}</p>}
      </PopoverContent>
    </Popover>
  );
}

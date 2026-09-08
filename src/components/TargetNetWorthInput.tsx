import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNumberInputText } from "@/hooks/useNumberInputText";
import { calculateSuggestedTargetNetWorth } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";

interface TargetNetWorthInputProps {
  value: number;
  monthlyExpense: number;
  onChange: (value: number) => void;
}

/**
 * 目標淨資產（選填，FIRE 進度用）：0 代表尚未設定（PRD 4.2、5.7 節）。
 * 「使用建議值」按鈕只在點擊當下把建議值（本月支出 × 12 × 25）帶入欄位，
 * 之後不論本月支出如何變動都不會自動覆寫使用者已存過的數字。
 */
export function TargetNetWorthInput({
  value,
  monthlyExpense,
  onChange,
}: TargetNetWorthInputProps) {
  const suggested = calculateSuggestedTargetNetWorth(monthlyExpense);
  const { text, handleChange, handleFocus, handleBlur } = useNumberInputText({
    value,
    onChange,
    min: 0,
  });

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">
          目標淨資產（選填，FIRE 進度）
        </span>
        {suggested > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(suggested)}
          >
            使用建議值 {formatCurrency(suggested)}
          </Button>
        )}
      </div>
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-label="目標淨資產"
      />
    </div>
  );
}

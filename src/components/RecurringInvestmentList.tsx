import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNumberInputText } from "@/hooks/useNumberInputText";
import { sumRecurringInvestments } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import type { RecurringInvestment } from "@/types/schema";

interface RecurringInvestmentListProps {
  value: RecurringInvestment[];
  onChange: (next: RecurringInvestment[]) => void;
}

/**
 * 每月定期定額清單：可動態新增/刪除，金額僅允許 0 或正數（PRD 4.2 節）。
 * 定期定額是把現金換成股票、不算支出，不影響現金流與儲蓄率（PRD 5.3a 節）。
 */
export function RecurringInvestmentList({
  value,
  onChange,
}: RecurringInvestmentListProps) {
  function addInvestment() {
    onChange([...value, { id: crypto.randomUUID(), name: "", amount: 0 }]);
  }
  function updateInvestment(id: string, patch: Partial<RecurringInvestment>) {
    onChange(
      value.map((investment) =>
        investment.id === id ? { ...investment, ...patch } : investment
      )
    );
  }
  function removeInvestment(id: string) {
    onChange(value.filter((investment) => investment.id !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-neutral-200">
          每月定期定額清單
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addInvestment}
        >
          + 新增定期定額
        </Button>
      </div>
      <p className="text-xs text-slate-400 dark:text-neutral-400">
        買股票不算支出，請勿重複填入本月支出
      </p>

      {value.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-neutral-400">
          尚未新增定期定額
        </p>
      )}

      <div className="space-y-2">
        {value.map((investment) => (
          <RecurringInvestmentRow
            key={investment.id}
            investment={investment}
            onUpdate={(patch) => updateInvestment(investment.id, patch)}
            onRemove={() => removeInvestment(investment.id)}
          />
        ))}
      </div>

      <p className="text-right text-sm text-slate-500 dark:text-neutral-400">
        定期定額合計：{formatCurrency(sumRecurringInvestments(value))}
      </p>
    </div>
  );
}

interface RecurringInvestmentRowProps {
  investment: RecurringInvestment;
  onUpdate: (patch: Partial<RecurringInvestment>) => void;
  onRemove: () => void;
}

function RecurringInvestmentRow({
  investment,
  onUpdate,
  onRemove,
}: RecurringInvestmentRowProps) {
  const { text, handleChange, handleFocus, handleBlur } = useNumberInputText({
    value: investment.amount,
    onChange: (amount) => onUpdate({ amount }),
    min: 0,
  });

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="標的名稱（如 0050／VT）"
        value={investment.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="flex-1"
        aria-label="定期定額名稱"
      />
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="w-32"
        aria-label="定期定額金額"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`刪除 ${investment.name || "此筆定期定額"}`}
        className="shrink-0 rounded-md p-1.5 text-slate-400 dark:text-neutral-400 hover:bg-rose-50 dark:hover:bg-rose-950 hover:text-rose-500 dark:hover:text-rose-400"
      >
        🗑️
      </button>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNumberInputText } from "@/hooks/useNumberInputText";
import { sumIncomeSources } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import type { IncomeSource } from "@/types/schema";

interface IncomeSourceListProps {
  value: IncomeSource[];
  onChange: (next: IncomeSource[]) => void;
}

/** 多筆每月收入清單：可動態新增/刪除，金額僅允許 0 或正數（PRD 4.2 節）。 */
export function IncomeSourceList({ value, onChange }: IncomeSourceListProps) {
  function addSource() {
    onChange([...value, { id: crypto.randomUUID(), name: "", amount: 0 }]);
  }
  function updateSource(id: string, patch: Partial<IncomeSource>) {
    onChange(
      value.map((source) =>
        source.id === id ? { ...source, ...patch } : source
      )
    );
  }
  function removeSource(id: string) {
    onChange(value.filter((source) => source.id !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">每月收入清單</span>
        <Button type="button" variant="outline" size="sm" onClick={addSource}>
          + 新增收入
        </Button>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-slate-400">尚未新增收入</p>
      )}

      <div className="space-y-2">
        {value.map((source) => (
          <IncomeSourceRow
            key={source.id}
            source={source}
            onUpdate={(patch) => updateSource(source.id, patch)}
            onRemove={() => removeSource(source.id)}
          />
        ))}
      </div>

      <p className="text-right text-sm text-slate-500">
        收入合計：{formatCurrency(sumIncomeSources(value))}
      </p>
    </div>
  );
}

interface IncomeSourceRowProps {
  source: IncomeSource;
  onUpdate: (patch: Partial<IncomeSource>) => void;
  onRemove: () => void;
}

function IncomeSourceRow({ source, onUpdate, onRemove }: IncomeSourceRowProps) {
  const { text, handleChange, handleFocus, handleBlur } = useNumberInputText({
    value: source.amount,
    onChange: (amount) => onUpdate({ amount }),
    min: 0,
  });

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="收入名稱（如薪資／接案）"
        value={source.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="flex-1"
        aria-label="收入名稱"
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
        aria-label="收入金額"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`刪除 ${source.name || "此筆收入"}`}
        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
      >
        🗑️
      </button>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sumCashSources, toSafeNumber } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import type { CashSource } from "@/types/schema";

interface CashSourceListProps {
  value: CashSource[];
  onChange: (next: CashSource[]) => void;
}

/** 多來源現金清單：可動態新增/刪除，金額允許負數以表示透支帳戶（PRD 4.2 節）。 */
export function CashSourceList({ value, onChange }: CashSourceListProps) {
  function addSource() {
    onChange([...value, { id: crypto.randomUUID(), name: "", amount: 0 }]);
  }
  function updateSource(id: string, patch: Partial<CashSource>) {
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
        <span className="text-sm font-medium text-slate-700">
          多來源現金清單
        </span>
        <Button type="button" variant="outline" size="sm" onClick={addSource}>
          + 新增現金來源
        </Button>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-slate-400">尚未新增現金來源</p>
      )}

      <div className="space-y-2">
        {value.map((source) => (
          <div key={source.id} className="flex items-center gap-2">
            <Input
              placeholder="來源名稱"
              value={source.name}
              onChange={(e) =>
                updateSource(source.id, { name: e.target.value })
              }
              className="flex-1"
              aria-label="來源名稱"
            />
            <Input
              type="number"
              inputMode="decimal"
              placeholder="金額"
              value={source.amount}
              onChange={(e) =>
                updateSource(source.id, {
                  amount: toSafeNumber(e.target.value),
                })
              }
              className="w-32"
              aria-label="金額"
            />
            <button
              type="button"
              onClick={() => removeSource(source.id)}
              aria-label={`刪除 ${source.name || "此筆現金來源"}`}
              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      <p className="text-right text-sm text-slate-500">
        現金合計：{formatCurrency(sumCashSources(value))}
      </p>
    </div>
  );
}

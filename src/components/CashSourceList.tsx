import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNumberInputText } from "@/hooks/useNumberInputText";
import { sumCashSources, sumRestrictedCashSources } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CashSource } from "@/types/schema";

interface CashSourceListProps {
  value: CashSource[];
  onChange: (next: CashSource[]) => void;
}

/**
 * 多來源現金清單：可動態新增/刪除，金額允許負數以表示透支帳戶；每筆可標記為「不可動用」
 * （如期貨保證金，不計入緊急預備金與現金比例的分子）（PRD 4.2 節）。
 */
export function CashSourceList({ value, onChange }: CashSourceListProps) {
  // 複製後要聚焦的新來源 id；用 ref 而非 state，避免多一次無謂的重新渲染。
  const focusAmountIdRef = useRef<string | null>(null);

  function addSource() {
    onChange([
      ...value,
      { id: crypto.randomUUID(), name: "", amount: 0, restricted: false },
    ]);
  }
  function updateSource(id: string, patch: Partial<CashSource>) {
    onChange(
      value.map((source) =>
        source.id === id ? { ...source, ...patch } : source
      )
    );
  }
  /** 在原列正下方插入一筆同名、金額歸零的新來源（沿用「不可動用」狀態），避免現金合計被同額重複加總。 */
  function duplicateSource(id: string) {
    const index = value.findIndex((source) => source.id === id);
    if (index === -1) return;
    const copy: CashSource = {
      id: crypto.randomUUID(),
      name: value[index].name,
      amount: 0,
      restricted: value[index].restricted,
    };
    focusAmountIdRef.current = copy.id;
    onChange([...value.slice(0, index + 1), copy, ...value.slice(index + 1)]);
  }
  function removeSource(id: string) {
    onChange(value.filter((source) => source.id !== id));
  }

  const restrictedTotal = sumRestrictedCashSources(value);

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
          <CashSourceRow
            key={source.id}
            source={source}
            autoFocusAmount={source.id === focusAmountIdRef.current}
            onUpdate={(patch) => updateSource(source.id, patch)}
            onDuplicate={() => duplicateSource(source.id)}
            onRemove={() => removeSource(source.id)}
          />
        ))}
      </div>

      <p className="text-right text-sm text-slate-500">
        現金合計：{formatCurrency(sumCashSources(value))}
        {restrictedTotal !== 0 && (
          <span data-testid="restricted-cash-total">
            （其中不可動用 {formatCurrency(restrictedTotal)}）
          </span>
        )}
      </p>
    </div>
  );
}

interface CashSourceRowProps {
  source: CashSource;
  autoFocusAmount: boolean;
  onUpdate: (patch: Partial<CashSource>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function CashSourceRow({
  source,
  autoFocusAmount,
  onUpdate,
  onDuplicate,
  onRemove,
}: CashSourceRowProps) {
  const amountRef = useRef<HTMLInputElement>(null);
  const { text, handleChange, handleFocus, handleBlur } = useNumberInputText({
    value: source.amount,
    onChange: (amount) => onUpdate({ amount }),
  });

  // 只在新列掛載時聚焦一次；既有列 remount 不會觸發（key 為穩定的 source.id）。
  useEffect(() => {
    if (autoFocusAmount) amountRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="來源名稱"
        value={source.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="flex-1"
        aria-label="來源名稱"
      />
      <Input
        ref={amountRef}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="w-32"
        aria-label="金額"
      />
      <button
        type="button"
        onClick={() => onUpdate({ restricted: !source.restricted })}
        aria-pressed={source.restricted}
        aria-label={`標記 ${source.name || "此筆現金來源"} 為不可動用`}
        title="不可動用（如期貨保證金）：仍計入總資產，但不計入緊急預備金與現金比例"
        className={cn(
          "shrink-0 rounded-md p-1.5 hover:bg-slate-100",
          source.restricted
            ? "bg-amber-50 text-amber-600"
            : "text-slate-300 hover:text-slate-500"
        )}
      >
        🔒
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        aria-label={`複製 ${source.name || "此筆現金來源"}`}
        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        📄
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`刪除 ${source.name || "此筆現金來源"}`}
        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
      >
        🗑️
      </button>
    </div>
  );
}

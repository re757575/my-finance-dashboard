import { useEffect, useRef } from "react";
import { Copy, Lock, LockOpen, Trash2 } from "lucide-react";
import { AddRowButton } from "@/components/AddRowButton";
import { RowIconButton } from "@/components/RowIconButton";
import { Input } from "@/components/ui/input";
import { useNumberInputText } from "@/hooks/useNumberInputText";
import { sumCashSources, sumRestrictedCashSources } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
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
    <div className="@container space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-neutral-200">
          多來源現金清單
        </span>
        <AddRowButton onClick={addSource}>+ 新增現金來源</AddRowButton>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-neutral-400">
          尚未新增現金來源
        </p>
      )}

      <div className="space-y-3 @md:space-y-2">
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

      <p className="text-right text-sm text-slate-500 dark:text-neutral-400">
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

  // 容器寬度不足（手機、桌面左欄）時名稱獨佔一行，避免被金額與操作鈕擠到看不出是哪個帳戶。
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 @md:flex-nowrap">
      <Input
        placeholder="來源名稱"
        value={source.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="@md:flex-1"
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
        className="flex-1 @md:w-32 @md:flex-none"
        aria-label="金額"
      />
      <RowIconButton
        label={`標記 ${source.name || "此筆現金來源"} 為不可動用`}
        aria-pressed={source.restricted}
        title="不可動用（如期貨保證金）：仍計入總資產，但不計入緊急預備金與現金比例"
        onClick={() => onUpdate({ restricted: !source.restricted })}
        // 已鎖定：琥珀色底＋閉鎖圖示；未鎖定：開鎖圖示，狀態不只靠顏色區分
        className={
          source.restricted
            ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900 hover:text-amber-700 dark:hover:text-amber-300"
            : undefined
        }
      >
        {source.restricted ? (
          <Lock aria-hidden="true" />
        ) : (
          <LockOpen aria-hidden="true" />
        )}
      </RowIconButton>
      <RowIconButton
        label={`複製 ${source.name || "此筆現金來源"}`}
        onClick={onDuplicate}
      >
        <Copy aria-hidden="true" />
      </RowIconButton>
      <RowIconButton
        label={`刪除 ${source.name || "此筆現金來源"}`}
        tone="danger"
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
      </RowIconButton>
    </div>
  );
}

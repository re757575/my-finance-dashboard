import { NumberField } from "@/components/NumberField";
import { Input } from "@/components/ui/input";
import { SegmentedToggle } from "@/components/SegmentedToggle";
import { useNumberInputText } from "@/hooks/useNumberInputText";
import { calculateTotalStockValue } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import type { StockCurrency } from "@/types/schema";

const CURRENCY_OPTIONS: { value: StockCurrency; label: string }[] = [
  { value: "USD", label: "USD" },
  { value: "TWD", label: "TWD" },
];

interface StockInputsProps {
  twStockValue: number;
  usStockValue: number;
  usStockCurrency: StockCurrency;
  exchangeRate: number;
  onChange: (patch: {
    twStockValue?: number;
    usStockValue?: number;
    usStockCurrency?: StockCurrency;
    exchangeRate?: number;
  }) => void;
}

/** 台股/美股拆分。美股市值可由使用者選擇直接以台幣或美金計價（PRD 4.2、5 節）。 */
export function StockInputs({
  twStockValue,
  usStockValue,
  usStockCurrency,
  exchangeRate,
  onChange,
}: StockInputsProps) {
  const totalStockValue = calculateTotalStockValue(
    twStockValue,
    usStockValue,
    exchangeRate,
    usStockCurrency
  );

  return (
    <div className="space-y-2">
      <NumberField
        label="台股市值"
        min={0}
        suffix="TWD"
        value={twStockValue}
        onChange={(v) => onChange({ twStockValue: v })}
      />

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-neutral-200">
            美股市值
          </span>
          <SegmentedToggle
            label="美股市值計價幣別"
            options={CURRENCY_OPTIONS}
            value={usStockCurrency}
            onChange={(nextCurrency) =>
              onChange({ usStockCurrency: nextCurrency })
            }
          />
        </div>
        <UsStockValueInput
          value={usStockValue}
          currency={usStockCurrency}
          onChange={(v) => onChange({ usStockValue: v })}
        />
      </div>

      {usStockCurrency === "USD" && (
        <NumberField
          label="美股匯率"
          min={0}
          suffix="USD/TWD"
          value={exchangeRate}
          onChange={(v) => onChange({ exchangeRate: v })}
        />
      )}

      <p className="text-right text-sm text-slate-500 dark:text-neutral-400">
        股票市值合計：{formatCurrency(totalStockValue)}
      </p>
    </div>
  );
}

function UsStockValueInput({
  value,
  currency,
  onChange,
}: {
  value: number;
  currency: StockCurrency;
  onChange: (value: number) => void;
}) {
  const { text, handleChange, handleFocus, handleBlur } = useNumberInputText({
    value,
    onChange,
    min: 0,
  });

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="pr-14"
        aria-label="美股市值"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400 dark:text-neutral-400">
        {currency}
      </span>
    </div>
  );
}

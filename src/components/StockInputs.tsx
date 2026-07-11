import { NumberField } from "@/components/NumberField";
import { Input } from "@/components/ui/input";
import { useNumberInputText } from "@/hooks/useNumberInputText";
import { calculateTotalStockValue } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StockCurrency } from "@/types/schema";

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
          <span className="text-sm font-medium text-slate-700">美股市值</span>
          <CurrencyToggle
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

      <p className="text-right text-sm text-slate-500">
        股票市值合計：{formatCurrency(totalStockValue)}
      </p>
    </div>
  );
}

function CurrencyToggle({
  value,
  onChange,
}: {
  value: StockCurrency;
  onChange: (currency: StockCurrency) => void;
}) {
  return (
    <div
      role="group"
      aria-label="美股市值計價幣別"
      className="inline-flex rounded-full border border-slate-200 p-0.5 text-xs"
    >
      {(["USD", "TWD"] as const).map((currency) => (
        <button
          key={currency}
          type="button"
          aria-pressed={value === currency}
          onClick={() => onChange(currency)}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium transition-colors",
            value === currency
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          {currency}
        </button>
      ))}
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
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">
        {currency}
      </span>
    </div>
  );
}

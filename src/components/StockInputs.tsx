import { NumberField } from "@/components/NumberField";
import { calculateTotalStockValue } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";

interface StockInputsProps {
  twStockValue: number;
  usStockValue: number;
  exchangeRate: number;
  onChange: (patch: {
    twStockValue?: number;
    usStockValue?: number;
    exchangeRate?: number;
  }) => void;
}

/** 台股/美股拆分 + 手動匯率換算（PRD 4.2、5 節）。 */
export function StockInputs({
  twStockValue,
  usStockValue,
  exchangeRate,
  onChange,
}: StockInputsProps) {
  const totalStockValue = calculateTotalStockValue(
    twStockValue,
    usStockValue,
    exchangeRate
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
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="美股市值"
          min={0}
          suffix="USD"
          value={usStockValue}
          onChange={(v) => onChange({ usStockValue: v })}
        />
        <NumberField
          label="美股匯率"
          min={0}
          suffix="USD/TWD"
          value={exchangeRate}
          onChange={(v) => onChange({ exchangeRate: v })}
        />
      </div>
      <p className="text-right text-sm text-slate-500">
        股票市值合計：{formatCurrency(totalStockValue)}
      </p>
    </div>
  );
}

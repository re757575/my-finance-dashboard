import { NumberField } from "@/components/NumberField";

interface TargetCashRatioInputProps {
  value: number;
  onChange: (value: number) => void;
}

/**
 * 目標現金比例（選填，資產配置再平衡建議用）：0-100，0 代表尚未設定（PRD 4.2 節）。
 * 目標股票比例＝100 減此值，不分台股/美股。沒有像目標淨資產那樣的通用建議值公式，
 * 因此不提供「使用建議值」按鈕，純粹由使用者自行決定。
 */
export function TargetCashRatioInput({
  value,
  onChange,
}: TargetCashRatioInputProps) {
  return (
    <NumberField
      label="目標現金比例（選填，資產配置再平衡用）"
      min={0}
      suffix="%"
      value={value}
      onChange={onChange}
    />
  );
}

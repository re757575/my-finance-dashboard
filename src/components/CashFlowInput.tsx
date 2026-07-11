import { NumberField } from "@/components/NumberField";

interface CashFlowInputProps {
  value: number;
  onChange: (value: number) => void;
}

/** 本月預估現金流，允許正負數（PRD 4.2 節）。 */
export function CashFlowInput({ value, onChange }: CashFlowInputProps) {
  return (
    <NumberField
      label="本月預估現金流（收入 − 支出）"
      value={value}
      onChange={onChange}
    />
  );
}

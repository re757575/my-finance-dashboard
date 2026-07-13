import { NumberField } from "@/components/NumberField";

interface ExpenseInputProps {
  value: number;
  onChange: (value: number) => void;
}

/** 本月支出，僅允許 0 或正數；不含負債清單的每月應還款金額（PRD 4.2、5.3 節）。 */
export function ExpenseInput({ value, onChange }: ExpenseInputProps) {
  return (
    <NumberField
      label="本月支出（不含負債月付）"
      min={0}
      value={value}
      onChange={onChange}
    />
  );
}

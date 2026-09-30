import { NumberField } from "@/components/NumberField";

interface RealEstateInputProps {
  value: number;
  onChange: (value: number) => void;
}

/**
 * 不動產市值（自住＋投資合計，使用者自行估價），僅允許 0 或正數（PRD 4.2 節）。
 * 計入總資產與淨資產，但不計入現金比例與資產配置比例的分母（金融資產）。
 */
export function RealEstateInput({ value, onChange }: RealEstateInputProps) {
  return (
    <NumberField
      label="不動產市值（選填）"
      min={0}
      suffix="TWD"
      value={value}
      onChange={onChange}
    />
  );
}

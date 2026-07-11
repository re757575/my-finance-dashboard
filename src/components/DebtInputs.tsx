import { NumberField } from "@/components/NumberField";

interface DebtInputsProps {
  loan: number;
  otherDebt: number;
  onChange: (patch: { loan?: number; otherDebt?: number }) => void;
}

/** 銀行貸款與短期/其他負債輸入（PRD 4.2 節，皆不得為負數）。 */
export function DebtInputs({ loan, otherDebt, onChange }: DebtInputsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="銀行貸款餘額"
        min={0}
        value={loan}
        onChange={(v) => onChange({ loan: v })}
      />
      <NumberField
        label="短期/其他負債"
        min={0}
        value={otherDebt}
        onChange={(v) => onChange({ otherDebt: v })}
      />
    </div>
  );
}

import { Input } from "@/components/ui/input";
import { useNumberInputText } from "@/hooks/useNumberInputText";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  suffix?: string;
}

/** 依 PRD 4.2 節輸入防呆：min 存在時擋下負數；非數字輸入一律視為 0。 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  suffix,
}: NumberFieldProps) {
  const { text, handleChange, handleFocus, handleBlur } = useNumberInputText({
    value,
    onChange,
    min,
  });

  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={text}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={suffix ? "pr-14" : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstimatedDebtFields } from "@/hooks/useLocalSnapshots";
import { useNumberInputText } from "@/hooks/useNumberInputText";
import {
  calculateMonthlyPayment,
  DEFAULT_REPAYMENT_METHOD_BY_CATEGORY,
} from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Debt, DebtCategory, RepaymentMethod } from "@/types/schema";

const DEBT_CATEGORIES: DebtCategory[] = ["信貸", "質押", "房貸", "其他"];

interface DebtListProps {
  value: Debt[];
  onChange: (next: Debt[]) => void;
  /** 哪些負債的剩餘本金／期數是系統自動估算、尚未經使用者確認（PRD 4.2 節），用於顯示提示標記。 */
  estimatedFields?: EstimatedDebtFields;
}

/** 類別化負債清單：可動態新增/刪除，每筆即時算出每月應還款金額（PRD 4.2、5.2 節）。 */
export function DebtList({ value, onChange, estimatedFields }: DebtListProps) {
  function addDebt() {
    const category: DebtCategory = "信貸";
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        name: "",
        category,
        principal: 0,
        annualRate: 0,
        remainingMonths: 0,
        repaymentMethod: DEFAULT_REPAYMENT_METHOD_BY_CATEGORY[category],
      },
    ]);
  }
  function updateDebt(id: string, patch: Partial<Debt>) {
    onChange(
      value.map((debt) => (debt.id === id ? { ...debt, ...patch } : debt))
    );
  }
  function removeDebt(id: string) {
    onChange(value.filter((debt) => debt.id !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">負債清單</span>
        <Button type="button" variant="outline" size="sm" onClick={addDebt}>
          + 新增負債
        </Button>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-slate-400">尚未新增負債</p>
      )}

      <div className="space-y-2">
        {value.map((debt) => (
          <DebtCard
            key={debt.id}
            debt={debt}
            onUpdate={(patch) => updateDebt(debt.id, patch)}
            onRemove={() => removeDebt(debt.id)}
            estimated={estimatedFields?.[debt.id]}
          />
        ))}
      </div>
    </div>
  );
}

interface DebtCardProps {
  debt: Debt;
  onUpdate: (patch: Partial<Debt>) => void;
  onRemove: () => void;
  estimated?: { principal?: boolean; remainingMonths?: boolean };
}

function EstimatedBadge() {
  return (
    <span
      title="此數值由系統依經過的月數自動估算，請確認是否正確"
      className="ml-1 rounded bg-sky-50 px-1 py-0.5 text-[10px] font-medium text-sky-600"
    >
      系統估算
    </span>
  );
}

function DebtCard({ debt, onUpdate, onRemove, estimated }: DebtCardProps) {
  const principalInput = useNumberInputText({
    value: debt.principal,
    onChange: (principal) => onUpdate({ principal }),
    min: 0,
  });
  const rateInput = useNumberInputText({
    value: debt.annualRate,
    onChange: (annualRate) => onUpdate({ annualRate }),
    min: 0,
  });
  const monthsInput = useNumberInputText({
    value: debt.remainingMonths,
    onChange: (remainingMonths) => onUpdate({ remainingMonths }),
    min: 0,
  });
  const monthlyPayment = calculateMonthlyPayment(debt);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <select
          aria-label="負債類別"
          value={debt.category}
          onChange={(e) => {
            const category = e.target.value as DebtCategory;
            onUpdate({
              category,
              repaymentMethod: DEFAULT_REPAYMENT_METHOD_BY_CATEGORY[category],
            });
          }}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
        >
          {DEBT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <Input
          placeholder="備註名稱（選填）"
          value={debt.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="flex-1"
          aria-label="備註名稱"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`刪除 ${debt.name || "此筆負債"}`}
          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
        >
          🗑️
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">
            剩餘本金
            {estimated?.principal && <EstimatedBadge />}
          </span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={principalInput.text}
            onChange={principalInput.handleChange}
            onFocus={principalInput.handleFocus}
            onBlur={principalInput.handleBlur}
            aria-label="剩餘本金"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">年利率 %</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={rateInput.text}
            onChange={rateInput.handleChange}
            onFocus={rateInput.handleFocus}
            onBlur={rateInput.handleBlur}
            aria-label="年利率"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">
            剩餘期數（月）
            {estimated?.remainingMonths && <EstimatedBadge />}
          </span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={monthsInput.text}
            onChange={monthsInput.handleChange}
            onFocus={monthsInput.handleFocus}
            onBlur={monthsInput.handleBlur}
            aria-label="剩餘還款期數"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <RepaymentMethodToggle
          value={debt.repaymentMethod}
          onChange={(repaymentMethod) => onUpdate({ repaymentMethod })}
        />
        <p className="text-sm text-slate-500">
          該筆每月應還：
          <span
            data-testid="debt-monthly-payment"
            className="font-medium text-slate-900"
          >
            {formatCurrency(monthlyPayment)}
          </span>
        </p>
      </div>
    </div>
  );
}

function RepaymentMethodToggle({
  value,
  onChange,
}: {
  value: RepaymentMethod;
  onChange: (method: RepaymentMethod) => void;
}) {
  const options: { value: RepaymentMethod; label: string }[] = [
    { value: "amortizing", label: "本息平均攤還" },
    { value: "interestOnly", label: "只計息" },
  ];

  return (
    <div
      role="group"
      aria-label="攤還方式"
      className="inline-flex rounded-full border border-slate-200 p-0.5 text-xs"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium transition-colors",
            value === option.value
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

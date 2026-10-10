import type {
  CalculatedMetrics,
  CashSource,
  Debt,
  DebtCategory,
  DebtRatioStatus,
  DebtServiceRatioStatus,
  EmergencyFundStatus,
  GoalEtaStatus,
  IncomeSource,
  PledgeMaintenanceStatus,
  RecurringInvestment,
  RepaymentMethod,
  SavingsRateStatus,
  Snapshot,
  StockCurrency,
} from "@/types/schema";
import { daysBetweenDates } from "@/lib/dataFreshness";

/** 非數字或空值一律視為 0（PRD 4.2 輸入防呆規則） */
export function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function sumCashSources(cashSources: CashSource[]): number {
  return cashSources.reduce(
    (sum, source) => sum + toSafeNumber(source.amount),
    0
  );
}

/** 標記為「不可動用」的現金來源加總（如期貨保證金）；缺少 restricted 欄位視為可動用（PRD 第 5 節）。 */
export function sumRestrictedCashSources(cashSources: CashSource[]): number {
  return cashSources.reduce(
    (sum, source) =>
      source.restricted ? sum + toSafeNumber(source.amount) : sum,
    0
  );
}

export function sumIncomeSources(incomeSources: IncomeSource[]): number {
  return incomeSources.reduce(
    (sum, source) => sum + toSafeNumber(source.amount),
    0
  );
}

/** 每月定期定額合計（PRD 5.3a 節）：把現金換成股票、不算支出，不計入現金流與儲蓄率。 */
export function sumRecurringInvestments(
  recurringInvestments: RecurringInvestment[]
): number {
  return recurringInvestments.reduce(
    (sum, investment) => sum + toSafeNumber(investment.amount),
    0
  );
}

/** 新增負債時依類別帶入的常見攤還方式預設值，使用者可自行覆寫（PRD 4.2、5.2 節）。 */
export const DEFAULT_REPAYMENT_METHOD_BY_CATEGORY: Record<
  DebtCategory,
  RepaymentMethod
> = {
  信貸: "amortizing",
  質押: "interestOnly",
  房貸: "amortizing",
  其他: "amortizing",
};

/**
 * 單筆負債的每月應還款金額（PRD 5.2 節）。
 * 本息平均攤還採標準 PMT 年金公式；只計息簡化為「年利率 ÷ 12」，不採實際天數計息。
 * 剩餘還款期數 ≤ 0 時一律視為 0，避免除以零或 NaN/Infinity。
 */
export function calculateMonthlyPayment(debt: Debt): number {
  const principal = toSafeNumber(debt.principal);
  const annualRate = toSafeNumber(debt.annualRate);
  const remainingMonths = toSafeNumber(debt.remainingMonths);

  if (remainingMonths <= 0) return 0;

  const monthlyRate = annualRate / 100 / 12;

  if (debt.repaymentMethod === "interestOnly") {
    return principal * monthlyRate;
  }

  if (monthlyRate === 0) return principal / remainingMonths;

  const factor = Math.pow(1 + monthlyRate, remainingMonths);
  return (principal * (monthlyRate * factor)) / (factor - 1);
}

export function calculateTotalMonthlyDebtPayment(debts: Debt[]): number {
  return debts.reduce((sum, debt) => sum + calculateMonthlyPayment(debt), 0);
}

/**
 * 償債負擔率 = 本月應還款總額 ÷ 總收入 × 100%（PRD 5.2b 節）。
 * 本月應還款總額為 0 時為 0（不論總收入）；總收入 ≤ 0 但有應還款時無法計算，回傳 null，
 * 避免除以零產生 NaN/Infinity。
 */
export function calculateDebtServiceRatio(
  totalMonthlyDebtPayment: number,
  totalIncome: number
): number | null {
  if (totalMonthlyDebtPayment <= 0) return 0;
  if (totalIncome <= 0) return null;
  return (totalMonthlyDebtPayment / totalIncome) * 100;
}

export function calculateDebtServiceRatioStatus(
  ratio: number | null
): DebtServiceRatioStatus {
  if (ratio === null) return "no-income";
  if (ratio <= 0) return "no-payment";
  if (ratio < 30) return "comfortable";
  if (ratio <= 40) return "heavy";
  return "excessive";
}

export const DEBT_SERVICE_RATIO_STATUS_LABEL: Record<
  DebtServiceRatioStatus,
  string
> = {
  "no-payment": "無還款負擔",
  comfortable: "負擔輕鬆",
  heavy: "負擔偏重",
  excessive: "負擔過重",
  "no-income": "無收入可負擔",
};

/**
 * 依經過的月數，將單筆負債的剩餘本金／剩餘期數往前推進，用於「今日草稿自動預填」估算負債的最新狀態
 * （PRD 4.2 節「負債剩餘本金／期數自動估算」），使用者仍可在草稿中手動覆寫。
 * 本息平均攤還：以目前狀態算出的固定月付金額（PMT）逐月扣除利息後推進本金；
 * 只計息：本金不隨時間攤還，只遞減期數（期滿代表到期須一次還清，非自動清償，本金維持不變）。
 * monthsElapsed ≤ 0 或負債已到期（remainingMonths ≤ 0）時不做任何變動。
 */
export function advanceDebtByMonths(debt: Debt, monthsElapsed: number): Debt {
  const remainingMonths = toSafeNumber(debt.remainingMonths);
  if (monthsElapsed <= 0 || remainingMonths <= 0) return debt;

  const newRemainingMonths = Math.max(0, remainingMonths - monthsElapsed);

  if (debt.repaymentMethod === "interestOnly") {
    return { ...debt, remainingMonths: newRemainingMonths };
  }

  const monthlyRate = toSafeNumber(debt.annualRate) / 100 / 12;
  const payment = calculateMonthlyPayment(debt);
  const steps = Math.min(monthsElapsed, remainingMonths);

  let balance = toSafeNumber(debt.principal);
  for (let i = 0; i < steps; i++) {
    balance -= payment - balance * monthlyRate;
  }

  return {
    ...debt,
    // 估算值會直接帶入輸入欄位，四捨五入到元，避免出現一長串小數（PRD 5.2a 節）
    principal: newRemainingMonths === 0 ? 0 : Math.round(Math.max(0, balance)),
    remainingMonths: newRemainingMonths,
  };
}

export function advanceDebtsByMonths(
  debts: Debt[],
  monthsElapsed: number
): Debt[] {
  return debts.map((debt) => advanceDebtByMonths(debt, monthsElapsed));
}

export function sumDebtPrincipal(debts: Debt[]): number {
  return debts.reduce((sum, debt) => sum + toSafeNumber(debt.principal), 0);
}

/**
 * 美股市值計價幣別為 USD 時，需乘上匯率換算成台幣；
 * 若使用者選擇直接以台幣等值金額填入（TWD），則不再重複換算。
 */
export function calculateTotalStockValue(
  twStockValue: number,
  usStockValue: number,
  exchangeRate: number,
  usStockCurrency: StockCurrency = "USD"
): number {
  const usValueInTwd =
    usStockCurrency === "TWD"
      ? toSafeNumber(usStockValue)
      : toSafeNumber(usStockValue) * toSafeNumber(exchangeRate);
  return toSafeNumber(twStockValue) + usValueInTwd;
}

export function calculateDebtRatioStatus(ratio: number): DebtRatioStatus {
  if (ratio === 0) return "debt-free";
  if (ratio < 40) return "healthy";
  if (ratio <= 60) return "elevated";
  return "high-risk";
}

export const DEBT_RATIO_STATUS_LABEL: Record<DebtRatioStatus, string> = {
  "debt-free": "完美無債",
  healthy: "財務健康（安全範圍）",
  elevated: "負債偏高（需注意調控）",
  "high-risk": "財務高風險（請儘速理債）",
};

/** 金融負債：類別不是「房貸」的負債剩餘本金合計；房貸視為與不動產成對，不計入（PRD 5.1a 節）。 */
export function sumFinancialDebtPrincipal(debts: Debt[]): number {
  return sumDebtPrincipal(debts.filter((debt) => debt.category !== "房貸"));
}

/**
 * 金融負債比 = 金融負債 ÷ 金融資產 × 100%（PRD 5.1a 節），用來看出被不動產市值稀釋掉的投資槓桿。
 * 金融資產 ≤ 0 時無法比較，回傳 null。
 */
export function calculateFinancialDebtRatio(
  financialLiabilities: number,
  financialAssets: number
): number | null {
  if (financialAssets <= 0) return null;
  return (financialLiabilities / financialAssets) * 100;
}

/**
 * 金融負債比與負債比的計算基礎是否不同（有不動產市值或房貸）。
 * 相同時兩者數值一致，畫面與提示詞都不重複顯示金融負債比（PRD 4.2、5.1a 節）。
 */
export function hasSeparateFinancialDebtRatio(
  metrics: Pick<
    CalculatedMetrics,
    | "totalAssets"
    | "financialAssets"
    | "totalLiabilities"
    | "financialLiabilities"
    | "financialDebtRatio"
  >
): boolean {
  return (
    metrics.financialDebtRatio !== null &&
    (metrics.totalAssets !== metrics.financialAssets ||
      metrics.totalLiabilities !== metrics.financialLiabilities)
  );
}

/**
 * 緊急預備金月數 = 可動用現金 ÷（本月支出 + 本月應還款總額）（PRD 5.5 節）。
 * 分子僅計入可動用現金（不含標記為「不可動用」的來源，如期貨保證金），也不含股票市值
 * （收入中斷期間賤賣股票風險高，不視為即時可動用資金）。
 * 分母為 0 時回傳 null，代表「無需求」，不套用風險分級。
 */
export function calculateEmergencyFundMonths(
  liquidCash: number,
  monthlyExpense: number,
  totalMonthlyDebtPayment: number
): number | null {
  const denominator = toSafeNumber(monthlyExpense) + totalMonthlyDebtPayment;
  if (denominator === 0) return null;
  return liquidCash / denominator;
}

export function calculateEmergencyFundStatus(
  months: number | null
): EmergencyFundStatus {
  if (months === null) return "no-need";
  if (months < 3) return "insufficient";
  if (months < 6) return "basic";
  return "sufficient";
}

export const EMERGENCY_FUND_STATUS_LABEL: Record<EmergencyFundStatus, string> =
  {
    "no-need": "無需求",
    insufficient: "預備金不足",
    basic: "基本安全",
    sufficient: "預備充足",
  };

/** 儲蓄率 = 現金流 ÷ 總收入 × 100%，總收入為 0 時強制為 0（PRD 5.6 節）。 */
export function calculateSavingsRate(
  cashFlow: number,
  totalIncome: number
): number {
  if (totalIncome === 0) return 0;
  return (cashFlow / totalIncome) * 100;
}

export function calculateSavingsRateStatus(rate: number): SavingsRateStatus {
  if (rate < 0) return "negative";
  if (rate < 10) return "low";
  if (rate < 20) return "healthy";
  return "high";
}

export const SAVINGS_RATE_STATUS_LABEL: Record<SavingsRateStatus, string> = {
  negative: "入不敷出",
  low: "儲蓄偏低",
  healthy: "儲蓄健康",
  high: "高儲蓄率",
};

/** FIRE 建議目標淨資產＝本月支出 × 12 × 25（4% 提領法則），僅供「使用建議值」按鈕帶入（PRD 5.7 節）。 */
export function calculateSuggestedTargetNetWorth(
  monthlyExpense: number
): number {
  return toSafeNumber(monthlyExpense) * 12 * 25;
}

/**
 * FIRE／淨資產目標進度 = 淨資產 ÷ 目標淨資產 × 100（PRD 5.7 節）。
 * 目標為 0（未設定）時回傳 null。不在此處夾住上下限，封頂/夾底交由 UI 呈現時處理，
 * 讓呼叫端仍能取得未夾住的真實百分比（例如超標時要如實顯示 142% 而非 100%）。
 */
export function calculateGoalProgress(
  netWorth: number,
  targetNetWorth: number
): number | null {
  const target = toSafeNumber(targetNetWorth);
  if (target === 0) return null;
  return (netWorth / target) * 100;
}

/** 目標達成時間預估的上限（月）：超過 100 年不顯示具體時間（PRD 5.7a 節）。 */
export const GOAL_ETA_MAX_MONTHS = 1200;
/** 以歷史快照估算淨資產增加速度時的回看天數上限（PRD 5.7a 節）。 */
export const GOAL_PACE_LOOKBACK_DAYS = 365;
/** 起點與終點快照至少要相隔的天數，間隔太短的變化不具代表性（PRD 5.7a 節）。 */
export const GOAL_PACE_MIN_SPAN_DAYS = 30;
/** 平均每月天數，用於把「每日變化」換算成「每月變化」。 */
const AVERAGE_DAYS_PER_MONTH = 365.25 / 12;

/**
 * 單筆負債本月償還的本金 = 每月應還款金額 − 當月利息（PRD 5.7a 節），下限 0、上限為剩餘本金。
 * 只計息或已到期（剩餘期數 ≤ 0）的負債為 0。
 */
export function calculateMonthlyPrincipalRepayment(debt: Debt): number {
  if (debt.repaymentMethod === "interestOnly") return 0;
  const principal = toSafeNumber(debt.principal);
  const interest = principal * (toSafeNumber(debt.annualRate) / 100 / 12);
  return Math.min(
    principal,
    Math.max(0, calculateMonthlyPayment(debt) - interest)
  );
}

export function calculateTotalMonthlyPrincipalRepayment(debts: Debt[]): number {
  return debts.reduce(
    (sum, debt) => sum + calculateMonthlyPrincipalRepayment(debt),
    0
  );
}

/**
 * 依歷史快照估算每月淨資產增加額（PRD 5.7a 節）：終點為最近一筆快照；起點為距終點至少
 * GOAL_PACE_MIN_SPAN_DAYS 天的快照中、落在回看範圍內最早的一筆，範圍內沒有時改取範圍外最接近的一筆。
 * 沒有可用的起點時回傳 null。每筆快照的淨資產以該筆自己的欄位計算。
 */
export function calculateHistoricalMonthlyPace(
  snapshots: Snapshot[]
): { monthlyPace: number; fromDate: string; toDate: string } | null {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const end = sorted.at(-1);
  if (!end) return null;

  const candidates = sorted
    .map((snapshot) => ({
      snapshot,
      days: daysBetweenDates(snapshot.date, end.date),
    }))
    .filter(({ days }) => days >= GOAL_PACE_MIN_SPAN_DAYS);
  const start =
    candidates.find(({ days }) => days <= GOAL_PACE_LOOKBACK_DAYS) ??
    candidates.at(-1);
  if (!start) return null;

  const change =
    calculateMetrics(end).netWorth - calculateMetrics(start.snapshot).netWorth;
  return {
    monthlyPace: (change / start.days) * AVERAGE_DAYS_PER_MONTH,
    fromDate: start.snapshot.date,
    toDate: end.date,
  };
}

/** 單一種速度的達成時間預估結果（PRD 5.7a 節）。 */
export interface GoalEta {
  status: GoalEtaStatus;
  /** 估算所用的每月淨資產增加額；沒有可用資料（no-data）時為 null。 */
  monthlyPace: number | null;
  /** 還需要的月數（無條件進位）；只有 status 為 "ok" 時有值。 */
  months: number | null;
}

/**
 * 以固定的每月淨資產增加額線性推算還需要幾個月達成目標（PRD 5.7a 節）。
 * 不預測投資報酬、通膨或收支變動。
 */
export function calculateGoalEta(
  netWorth: number,
  targetNetWorth: number,
  monthlyPace: number | null
): GoalEta {
  const target = toSafeNumber(targetNetWorth);
  const done = (status: GoalEtaStatus, months: number | null = null) => ({
    status,
    monthlyPace,
    months,
  });

  if (target <= 0) return done("unset");
  if (netWorth >= target) return done("achieved");
  if (monthlyPace === null) return done("no-data");
  if (monthlyPace <= 0) return done("not-growing");

  const months = Math.ceil((target - netWorth) / monthlyPace);
  return months > GOAL_ETA_MAX_MONTHS ? done("too-far") : done("ok", months);
}

export interface GoalEstimates {
  /** 推算預計達成月份的起算日：表單所對應的日期（一般為今天，修正模式為被修正的那一天）。 */
  baseDate: string;
  /** 依目前收支：每月增加額 = 現金流 + 本月償還的負債本金。 */
  budget: GoalEta & { cashFlow: number; principalRepayment: number };
  /** 依歷史變化：以已存檔快照的淨資產實際變化推算；fromDate／toDate 為所比較的兩筆快照。 */
  history: GoalEta & { fromDate: string | null; toDate: string | null };
}

/**
 * 目標達成時間預估（PRD 4.2、5.7a 節）：淨資產與目標取自表單（draft），
 * 「依歷史變化」只看已存檔快照（savedSnapshots），不含今日未存檔的草稿。純即時計算，不寫入任何資料。
 */
export function calculateGoalEstimates(
  draft: Snapshot,
  savedSnapshots: Snapshot[]
): GoalEstimates {
  const {
    netWorth,
    cashFlow,
    monthlyPrincipalRepayment: principalRepayment,
  } = calculateMetrics(draft);
  const history = calculateHistoricalMonthlyPace(savedSnapshots);

  return {
    baseDate: draft.date,
    budget: {
      ...calculateGoalEta(
        netWorth,
        draft.targetNetWorth,
        cashFlow + principalRepayment
      ),
      cashFlow,
      principalRepayment,
    },
    history: {
      ...calculateGoalEta(
        netWorth,
        draft.targetNetWorth,
        history?.monthlyPace ?? null
      ),
      fromDate: history?.fromDate ?? null,
      toDate: history?.toDate ?? null,
    },
  };
}

/** 質押追繳線（%）：採台灣股票質借常見的 130%，各機構標準不同，僅作參考（PRD 5.8 節）。 */
export const PLEDGE_MARGIN_CALL_RATIO = 130;

export function calculatePledgeMaintenanceStatus(
  ratio: number
): Exclude<PledgeMaintenanceStatus, "none" | "unset"> {
  if (ratio >= 160) return "safe";
  if (ratio >= 140) return "watch";
  if (ratio >= PLEDGE_MARGIN_CALL_RATIO) return "warning";
  return "margin-call";
}

export const PLEDGE_MAINTENANCE_STATUS_LABEL: Record<
  Exclude<PledgeMaintenanceStatus, "none" | "unset">,
  string
> = {
  safe: "維持率安全",
  watch: "維持率留意",
  warning: "接近追繳線",
  "margin-call": "低於追繳線",
};

/**
 * 質押整戶維持率 = 所有質押負債的質押股票市值合計 ÷ 質押負債剩餘本金合計 × 100%（PRD 5.8 節）。
 * 無質押本金 → "none"（不顯示卡片）；質押股票市值合計為 0 → "unset"（只顯示引導文字，避免誤導）。
 * dropToMarginCall 為擔保品整體同比例下跌、本金不變的前提下，距追繳線的下跌空間（%）；
 * 已低於追繳線時為 null。
 */
export function calculatePledgeMaintenance(debts: Debt[]): {
  principal: number;
  collateralValue: number;
  ratio: number | null;
  status: PledgeMaintenanceStatus;
  dropToMarginCall: number | null;
} {
  const pledgeDebts = debts.filter((debt) => debt.category === "質押");
  const principal = sumDebtPrincipal(pledgeDebts);
  const collateralValue = pledgeDebts.reduce(
    (sum, debt) => sum + toSafeNumber(debt.collateralValue),
    0
  );

  if (principal <= 0) {
    return {
      principal,
      collateralValue,
      ratio: null,
      status: "none",
      dropToMarginCall: null,
    };
  }
  if (collateralValue <= 0) {
    return {
      principal,
      collateralValue,
      ratio: null,
      status: "unset",
      dropToMarginCall: null,
    };
  }

  const ratio = (collateralValue / principal) * 100;
  const status = calculatePledgeMaintenanceStatus(ratio);
  return {
    principal,
    collateralValue,
    ratio,
    status,
    dropToMarginCall:
      ratio >= PLEDGE_MARGIN_CALL_RATIO
        ? (1 - PLEDGE_MARGIN_CALL_RATIO / ratio) * 100
        : null,
  };
}

/** 壓力測試的一鍵情境：股票下跌百分比（PRD 4.2、5.9 節）。 */
export const STRESS_TEST_DROPS = [10, 20, 30] as const;

/**
 * 股票壓力測試（PRD 5.9 節）：假設台股與美股市值同步下跌 dropPercent%，質押負債的質押股票市值同步下跌；
 * 現金、不動產、負債本金與匯率不變，其餘沿用 calculateMetrics 重新計算。純即時試算，不寫入任何資料。
 * netWorthChangeRate 以現況淨資產的絕對值為分母，現況淨資產為 0 時為 null。
 */
export function calculateStressScenario(
  snapshot: Parameters<typeof calculateMetrics>[0],
  dropPercent: number
): {
  before: CalculatedMetrics;
  after: CalculatedMetrics;
  netWorthChange: number;
  netWorthChangeRate: number | null;
} {
  const factor = 1 - dropPercent / 100;
  const before = calculateMetrics(snapshot);
  const after = calculateMetrics({
    ...snapshot,
    twStockValue: toSafeNumber(snapshot.twStockValue) * factor,
    usStockValue: toSafeNumber(snapshot.usStockValue) * factor,
    debts: snapshot.debts.map((debt) =>
      debt.category === "質押"
        ? {
            ...debt,
            collateralValue: toSafeNumber(debt.collateralValue) * factor,
          }
        : debt
    ),
  });
  const netWorthChange = after.netWorth - before.netWorth;
  return {
    before,
    after,
    netWorthChange,
    netWorthChangeRate:
      before.netWorth === 0
        ? null
        : (netWorthChange / Math.abs(before.netWorth)) * 100,
  };
}

/** 壓力測試臨界點反推的兩條負債比門檻（%），即第 5.1 節燈號的分界（PRD 5.9a 節）。 */
export const STRESS_BREAKPOINT_DEBT_RATIOS = { elevated: 40, highRisk: 60 };

export type StressBreakpointKey =
  | "pledge-margin-call"
  | "debt-ratio-elevated"
  | "debt-ratio-high-risk"
  | "net-worth-zero";

/** reached：現況已達或超過該線；drop：股票再下跌 dropPercent% 會剛好碰到；unreachable：股票跌到 0 也碰不到。 */
export type StressBreakpointStatus = "reached" | "drop" | "unreachable";

export interface StressBreakpoint {
  key: StressBreakpointKey;
  status: StressBreakpointStatus;
  /** 臨界跌幅（%，0 < dropPercent ≤ 100）；只有 status 為 "drop" 時有值。 */
  dropPercent: number | null;
}

const STRESS_BREAKPOINT_STATUS_ORDER: Record<StressBreakpointStatus, number> = {
  reached: 0,
  drop: 1,
  unreachable: 2,
};

/**
 * 股票要蒸發掉 buffer 這麼多市值才會碰到某條線：buffer ≤ 0 已觸及；
 * buffer 超過全部股票市值（或根本沒有股票）就算跌到 0 也碰不到。不會回傳 NaN／Infinity。
 */
function solveStressBreakpoint(
  key: StressBreakpointKey,
  buffer: number,
  totalStockValue: number
): StressBreakpoint {
  if (buffer <= 0) return { key, status: "reached", dropPercent: null };
  if (totalStockValue <= 0 || buffer > totalStockValue) {
    return { key, status: "unreachable", dropPercent: null };
  }
  return {
    key,
    status: "drop",
    dropPercent: Math.min((buffer / totalStockValue) * 100, 100),
  };
}

/**
 * 壓力測試臨界點（PRD 5.9a 節）：沿用 calculateStressScenario 的假設，反推「股票再下跌多少 % 會碰到風險線」。
 * 把回傳的 dropPercent 代回 calculateStressScenario，對應指標會剛好落在該線上。
 * - 質押追繳線：直接取 pledgeDropToMarginCall（兩者必為同一個數字）；無質押或未填質押股票市值時不列出。
 * - 負債比 40%／60%：(總資產 − 總負債 ÷ 門檻) ÷ 股票市值；總負債為 0 時不列出。
 * - 淨資產歸零：淨資產 ÷ 股票市值。
 * 回傳已排序：已觸及 → 跌幅由小到大 → 不會觸及；不適用的項目不在陣列內。
 */
export function calculateStressBreakpoints(
  snapshot: Parameters<typeof calculateMetrics>[0]
): StressBreakpoint[] {
  const metrics = calculateMetrics(snapshot);
  const { totalAssets, totalLiabilities, totalStockValue } = metrics;
  const breakpoints: StressBreakpoint[] = [];

  if (
    metrics.pledgeMaintenanceStatus !== "none" &&
    metrics.pledgeMaintenanceStatus !== "unset"
  ) {
    const drop = metrics.pledgeDropToMarginCall;
    breakpoints.push(
      drop !== null && drop > 0
        ? { key: "pledge-margin-call", status: "drop", dropPercent: drop }
        : { key: "pledge-margin-call", status: "reached", dropPercent: null }
    );
  }

  if (totalLiabilities > 0) {
    // 負債比 = L ÷ 總資產 = T% ⇔ 總資產 = L × 100 ÷ T；先乘後除，整數金額下邊界值不受浮點誤差影響
    const { elevated, highRisk } = STRESS_BREAKPOINT_DEBT_RATIOS;
    breakpoints.push(
      solveStressBreakpoint(
        "debt-ratio-elevated",
        totalAssets - (totalLiabilities * 100) / elevated,
        totalStockValue
      ),
      solveStressBreakpoint(
        "debt-ratio-high-risk",
        totalAssets - (totalLiabilities * 100) / highRisk,
        totalStockValue
      )
    );
  }

  breakpoints.push(
    solveStressBreakpoint("net-worth-zero", metrics.netWorth, totalStockValue)
  );

  // Array.prototype.sort 為穩定排序：狀態與跌幅都相同時維持上面的列出順序
  return breakpoints.sort(
    (a, b) =>
      STRESS_BREAKPOINT_STATUS_ORDER[a.status] -
        STRESS_BREAKPOINT_STATUS_ORDER[b.status] ||
      (a.dropPercent ?? 0) - (b.dropPercent ?? 0)
  );
}

export function calculateMetrics(
  snapshot: Pick<
    Snapshot,
    | "cashSources"
    | "twStockValue"
    | "usStockValue"
    | "usStockCurrency"
    | "exchangeRate"
    | "realEstateValue"
    | "debts"
    | "incomeSources"
    | "monthlyExpense"
    | "recurringInvestments"
    | "targetNetWorth"
  >
): CalculatedMetrics {
  const totalCash = sumCashSources(snapshot.cashSources);
  // 不可動用現金（如期貨保證金）仍計入總資產，但不算可動用現金（PRD 第 5 節）
  const restrictedCash = sumRestrictedCashSources(snapshot.cashSources);
  const liquidCash = totalCash - restrictedCash;
  const totalStockValue = calculateTotalStockValue(
    snapshot.twStockValue,
    snapshot.usStockValue,
    snapshot.exchangeRate,
    snapshot.usStockCurrency
  );
  // 金融資產（現金＋股票）為現金比例與資產配置比例的分母；總資產再加上不動產市值（PRD 第 5 節）
  const financialAssets = totalCash + totalStockValue;
  const realEstateValue = toSafeNumber(snapshot.realEstateValue);
  const totalAssets = financialAssets + realEstateValue;
  const totalLiabilities = sumDebtPrincipal(snapshot.debts);
  const netWorth = totalAssets - totalLiabilities;
  // 總資產為 0 時負債比預設為 0%，避免除以零（PRD 第 5 節）
  const debtRatio =
    totalAssets === 0 ? 0 : (totalLiabilities / totalAssets) * 100;
  // 金融負債比：不含不動產與房貸，避免不動產市值稀釋後看不出投資槓桿（PRD 5.1a 節）
  const financialLiabilities = sumFinancialDebtPrincipal(snapshot.debts);
  const financialDebtRatio = calculateFinancialDebtRatio(
    financialLiabilities,
    financialAssets
  );
  // 現金比例與資產配置比例以金融資產為分母；金融資產為 0 時同樣預設為 0%，避免除以零
  const ratioOfFinancialAssets = (amount: number) =>
    financialAssets === 0 ? 0 : (amount / financialAssets) * 100;
  const cashRatio = ratioOfFinancialAssets(liquidCash);
  const restrictedCashRatio = ratioOfFinancialAssets(restrictedCash);
  // 資產配置比例（PRD 第 5 節）：美股佔比以換算後的台幣等值金額（totalStockValue 扣除台股部分）計算
  const twStockValueSafe = toSafeNumber(snapshot.twStockValue);
  const usStockValueInTwd = totalStockValue - twStockValueSafe;
  const twStockRatio = ratioOfFinancialAssets(twStockValueSafe);
  const usStockRatio = ratioOfFinancialAssets(usStockValueInTwd);
  const totalMonthlyDebtPayment = calculateTotalMonthlyDebtPayment(
    snapshot.debts
  );
  const totalIncome = sumIncomeSources(snapshot.incomeSources);
  // 償債負擔率：本月應還款總額佔總收入的比例（PRD 5.2b 節）
  const debtServiceRatio = calculateDebtServiceRatio(
    totalMonthlyDebtPayment,
    totalIncome
  );
  // 現金流 = 總收入 − 本月支出 − 本月應還款總額（PRD 5.3 節）
  const cashFlow =
    totalIncome -
    toSafeNumber(snapshot.monthlyExpense) -
    totalMonthlyDebtPayment;
  // 定期定額只是把現金換成股票，不算支出；另算扣掉它之後手邊剩多少現金（PRD 5.3a 節）
  const totalRecurringInvestment = sumRecurringInvestments(
    snapshot.recurringInvestments
  );
  const emergencyFundMonths = calculateEmergencyFundMonths(
    liquidCash,
    snapshot.monthlyExpense,
    totalMonthlyDebtPayment
  );
  const savingsRate = calculateSavingsRate(cashFlow, totalIncome);
  // 還本金只是把現金換成負債減少，淨資產不變，因此另算一個把它加回的儲蓄率（PRD 5.6 節）
  const monthlyPrincipalRepayment = calculateTotalMonthlyPrincipalRepayment(
    snapshot.debts
  );
  const goalProgress = calculateGoalProgress(netWorth, snapshot.targetNetWorth);
  // 4% 提領法則的本金必須可提領，自住不動產不算，因此另算不含不動產與房貸的進度（PRD 5.7 節）
  const investableNetWorth = financialAssets - financialLiabilities;
  const pledge = calculatePledgeMaintenance(snapshot.debts);

  return {
    totalCash,
    totalStockValue,
    totalAssets,
    totalLiabilities,
    netWorth,
    debtRatio,
    debtRatioStatus: calculateDebtRatioStatus(debtRatio),
    financialLiabilities,
    financialDebtRatio,
    financialDebtRatioStatus:
      financialDebtRatio === null
        ? null
        : calculateDebtRatioStatus(financialDebtRatio),
    cashRatio,
    liquidCash,
    restrictedCash,
    restrictedCashRatio,
    financialAssets,
    realEstateValue,
    twStockValue: twStockValueSafe,
    usStockValueInTwd,
    twStockRatio,
    usStockRatio,
    totalMonthlyDebtPayment,
    totalIncome,
    debtServiceRatio,
    debtServiceRatioStatus: calculateDebtServiceRatioStatus(debtServiceRatio),
    cashFlow,
    totalRecurringInvestment,
    cashFlowAfterInvestment: cashFlow - totalRecurringInvestment,
    emergencyFundMonths,
    emergencyFundStatus: calculateEmergencyFundStatus(emergencyFundMonths),
    savingsRate,
    savingsRateStatus: calculateSavingsRateStatus(savingsRate),
    monthlyPrincipalRepayment,
    savingsRateWithPrincipal: calculateSavingsRate(
      cashFlow + monthlyPrincipalRepayment,
      totalIncome
    ),
    goalProgress,
    investableNetWorth,
    investableGoalProgress: calculateGoalProgress(
      investableNetWorth,
      snapshot.targetNetWorth
    ),
    pledgePrincipal: pledge.principal,
    pledgeCollateralValue: pledge.collateralValue,
    pledgeMaintenanceRatio: pledge.ratio,
    pledgeMaintenanceStatus: pledge.status,
    pledgeDropToMarginCall: pledge.dropToMarginCall,
  };
}

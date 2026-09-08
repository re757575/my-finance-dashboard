import {
  CURRENT_SCHEMA_VERSION,
  type Debt,
  type FinanceData,
  type Snapshot,
} from "@/types/schema";

export const STORAGE_KEY = "my_finance_dashboard_data";

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; data: FinanceData }
  | { status: "corrupted" }
  | { status: "version-mismatch"; foundVersion: unknown };

interface RawSnapshotV1 {
  month: string;
  updatedAt: string;
  cashSources: { id: string; name: string; amount: number }[];
  twStockValue: number;
  usStockValue: number;
  exchangeRate: number;
  loan: number;
  otherDebt: number;
  cashFlow: number;
}

interface RawSnapshotV2 extends RawSnapshotV1 {
  usStockCurrency: "USD" | "TWD";
}

interface RawSnapshotV3 extends Omit<
  Snapshot,
  "date" | "targetNetWorth" | "targetCashRatio"
> {
  month: string; // "YYYY-MM"
}

type RawSnapshotV4 = Omit<Snapshot, "targetNetWorth" | "targetCashRatio">;

type RawSnapshotV5 = Omit<Snapshot, "targetCashRatio">;

/** V1（無 usStockCurrency）→ V2：美股市值當時一律以 USD 計價換算，遷移時補上此預設值。 */
function migrateV1ToV2(raw: { schemaVersion: 1; snapshots: RawSnapshotV1[] }): {
  schemaVersion: 2;
  snapshots: RawSnapshotV2[];
} {
  return {
    schemaVersion: 2,
    snapshots: raw.snapshots.map((s) => ({ ...s, usStockCurrency: "USD" })),
  };
}

/**
 * V2（loan/otherDebt 單一數字、cashFlow 語意為淨現金流）→ V3：
 * loan 轉為一筆「房貸」類別負債、otherDebt 轉為一筆「其他」類別負債，利率/期數皆補 0
 * （沿用本金，日後由使用者自行補上利率/期數才能看到正確的每月應還款金額）；
 * 新增空的 incomeSources；不沿用舊 cashFlow 數值（語意為淨現金流，與新欄位「支出」相反，沿用會誤導使用者）。
 */
function migrateV2ToV3(raw: { schemaVersion: 2; snapshots: RawSnapshotV2[] }): {
  schemaVersion: 3;
  snapshots: RawSnapshotV3[];
} {
  return {
    schemaVersion: 3,
    snapshots: raw.snapshots.map((s) => {
      const { loan, otherDebt, cashFlow: _cashFlow, ...rest } = s;
      const debts: Debt[] = [
        {
          id: crypto.randomUUID(),
          name: "銀行貸款",
          category: "房貸",
          principal: loan,
          annualRate: 0,
          remainingMonths: 0,
          repaymentMethod: "amortizing",
        },
        {
          id: crypto.randomUUID(),
          name: "短期/其他負債",
          category: "其他",
          principal: otherDebt,
          annualRate: 0,
          remainingMonths: 0,
          repaymentMethod: "amortizing",
        },
      ];
      return {
        ...rest,
        debts,
        incomeSources: [],
        monthlyExpense: 0,
      };
    }),
  };
}

/**
 * V3（快照顆粒度為「月」，month: "YYYY-MM"）→ V4（顆粒度改為「日」，date: "YYYY-MM-DD"）：
 * date 取自該筆快照 updatedAt 的實際日期（而非統一映射到月初或月底），盡量還原使用者實際存檔當下的日期。
 */
function migrateV3ToV4(raw: { schemaVersion: 3; snapshots: RawSnapshotV3[] }): {
  schemaVersion: 4;
  snapshots: RawSnapshotV4[];
} {
  return {
    schemaVersion: 4,
    snapshots: raw.snapshots.map((s) => {
      const { month: _month, ...rest } = s;
      return { ...rest, date: s.updatedAt.slice(0, 10) };
    }),
  };
}

/**
 * V4（無 targetNetWorth）→ V5：每筆快照補上 targetNetWorth: 0（視為「尚未設定目標」），
 * 不依該筆快照的 monthlyExpense 臆測回填建議值，避免捏造使用者從未實際設定過的歷史目標。
 */
function migrateV4ToV5(raw: { schemaVersion: 4; snapshots: RawSnapshotV4[] }): {
  schemaVersion: 5;
  snapshots: RawSnapshotV5[];
} {
  return {
    schemaVersion: 5,
    snapshots: raw.snapshots.map((s) => ({ ...s, targetNetWorth: 0 })),
  };
}

/**
 * V5（無 targetCashRatio）→ V6：每筆快照補上 targetCashRatio: 0（視為「尚未設定目標配置」），
 * 供「資產配置再平衡建議」提示詞模式使用，同樣不臆測回填任何建議值。
 */
function migrateV5ToV6(raw: {
  schemaVersion: 5;
  snapshots: RawSnapshotV5[];
}): FinanceData {
  return {
    schemaVersion: 6,
    snapshots: raw.snapshots.map((s) => ({ ...s, targetCashRatio: 0 })),
  };
}

/** 已知舊版本資料的轉換邏輯（PRD 第 6.1 節）。回傳 null 代表版本無法識別/轉換，不得覆蓋原始資料。逐版遞進遷移，確保任何舊版本都能一路轉到目前版本。 */
function migrateFinanceData(parsed: {
  schemaVersion: unknown;
  snapshots: unknown[];
}): FinanceData | null {
  if (parsed.schemaVersion === 1) {
    const v2 = migrateV1ToV2(
      parsed as { schemaVersion: 1; snapshots: RawSnapshotV1[] }
    );
    const v3 = migrateV2ToV3(v2);
    const v4 = migrateV3ToV4(v3);
    const v5 = migrateV4ToV5(v4);
    return migrateV5ToV6(v5);
  }
  if (parsed.schemaVersion === 2) {
    const v3 = migrateV2ToV3(
      parsed as { schemaVersion: 2; snapshots: RawSnapshotV2[] }
    );
    const v4 = migrateV3ToV4(v3);
    const v5 = migrateV4ToV5(v4);
    return migrateV5ToV6(v5);
  }
  if (parsed.schemaVersion === 3) {
    const v4 = migrateV3ToV4(
      parsed as { schemaVersion: 3; snapshots: RawSnapshotV3[] }
    );
    const v5 = migrateV4ToV5(v4);
    return migrateV5ToV6(v5);
  }
  if (parsed.schemaVersion === 4) {
    const v5 = migrateV4ToV5(
      parsed as { schemaVersion: 4; snapshots: RawSnapshotV4[] }
    );
    return migrateV5ToV6(v5);
  }
  if (parsed.schemaVersion === 5) {
    return migrateV5ToV6(
      parsed as { schemaVersion: 5; snapshots: RawSnapshotV5[] }
    );
  }
  return null;
}

/** 依 PRD 第 6.1 節規則解析快照資料：格式錯誤或版本不符時不拋錯，回傳明確狀態供上層處理。 */
export function parseFinanceData(raw: string | null): LoadResult {
  if (raw === null) return { status: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupted" };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("snapshots" in parsed) ||
    !Array.isArray((parsed as { snapshots: unknown }).snapshots)
  ) {
    return { status: "corrupted" };
  }

  const data = parsed as FinanceData;
  if (data.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return { status: "ok", data };
  }

  const migrated = migrateFinanceData(
    parsed as { schemaVersion: unknown; snapshots: unknown[] }
  );
  if (migrated) {
    return { status: "ok", data: migrated };
  }

  return { status: "version-mismatch", foundVersion: data.schemaVersion };
}

export function loadFinanceData(): LoadResult {
  return parseFinanceData(localStorage.getItem(STORAGE_KEY));
}

export function persistFinanceData(data: FinanceData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearFinanceData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function createEmptyFinanceData(): FinanceData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, snapshots: [] };
}

export function getCurrentDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortedByDate(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
}

/** 同日覆蓋、跨日新增（PRD 5.2 / 6 節：快照顆粒度為日）。 */
export function upsertSnapshot(
  data: FinanceData,
  snapshot: Snapshot
): FinanceData {
  const withoutDate = data.snapshots.filter((s) => s.date !== snapshot.date);
  return {
    ...data,
    snapshots: sortedByDate([...withoutDate, snapshot]),
  };
}

export function getSnapshotForDate(
  data: FinanceData,
  date: string
): Snapshot | undefined {
  return data.snapshots.find((s) => s.date === date);
}

/** 最近一筆快照（日期最大者），用於「今日表單自動帶入最近一筆資料」。 */
export function getLatestSnapshot(data: FinanceData): Snapshot | undefined {
  if (data.snapshots.length === 0) return undefined;
  return sortedByDate(data.snapshots).at(-1);
}

/**
 * 兩個 YYYY-MM-DD 日期字串的「曆月差」（只看年月，忽略日），用於負債剩餘本金／期數自動估算
 * （PRD 4.2 節）。例如 2026-01-15 → 2026-03-02 視為經過 2 期，接受曆月差帶來的天數誤差。
 */
export function monthsBetweenDates(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth] = fromDate.split("-").map(Number);
  const [toYear, toMonth] = toDate.split("-").map(Number);
  return Math.max(0, (toYear - fromYear) * 12 + (toMonth - fromMonth));
}

function subtractDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - days);
  return getCurrentDate(d);
}

/** 趨勢圖範圍：最近 N 天（含今天），資料本身不刪除（PRD 4.2、5.4 節）。 */
export function getSnapshotsInRange(
  data: FinanceData,
  days: number
): Snapshot[] {
  const cutoff = subtractDays(getCurrentDate(), days - 1);
  return sortedByDate(data.snapshots).filter((s) => s.date >= cutoff);
}

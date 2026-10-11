import { expect, type Locator, type Page } from "@playwright/test";
import {
  createEmptySnapshot,
  CURRENT_SCHEMA_VERSION,
  type Snapshot,
} from "../src/types/schema";

export { CURRENT_SCHEMA_VERSION };

/** 快照資料所在的 LocalStorage 鍵（與 `src/lib/storage.ts` 的 `STORAGE_KEY` 相同）。 */
export const STORAGE_KEY = "my_finance_dashboard_data";

/** 本機日期字串（與 App 的 getCurrentDate 一致）：今天往前推 n 天。 */
export function dateDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 一筆符合目前 schema 的快照：未指定的欄位取自 `createEmptySnapshot`，只需寫出與預設不同的欄位。
 * schema 新增欄位時這裡會自動帶上預設值，各 spec 的種子資料不必跟著改。
 */
export function makeSnapshot(
  date: string,
  overrides: Partial<Snapshot> = {}
): Snapshot {
  return {
    ...createEmptySnapshot(date),
    updatedAt: `${date}T00:00:00.000Z`,
    ...overrides,
  };
}

/**
 * 把快照直接寫入 LocalStorage，不重新整理頁面。`schemaVersion` 預設為目前版本；
 * 要測舊版資料遷移時，自行傳入版本號與該版本形狀的快照。
 */
export async function writeFinanceData(
  page: Page,
  snapshots: unknown[],
  schemaVersion: number = CURRENT_SCHEMA_VERSION
) {
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data: { schemaVersion, snapshots } }
  );
}

/** `writeFinanceData` 之後重新整理頁面，讓 App 讀到寫入的資料。 */
export async function seedFinanceData(
  page: Page,
  snapshots: unknown[],
  schemaVersion: number = CURRENT_SCHEMA_VERSION
) {
  await writeFinanceData(page, snapshots, schemaVersion);
  await page.reload();
}

/** 逐一展開指定標題的可收合區塊；已展開的不會被收合。 */
async function expandSections(scope: Page | Locator, names: string[]) {
  for (const name of names) {
    const toggle = scope.getByRole("button", { name, exact: true });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
}

/**
 * 展開預設收合的「快照比較」與「歷史快照」（PRD 4.2「快照比較與歷史快照預設收合」）。
 * 已展開的不會被收合；展開狀態不保存，`page.reload()` 之後要再呼叫一次。
 * 檢查區塊內容「不存在」（`toHaveCount(0)`）之前務必先展開，否則收合狀態下必定通過。
 */
export async function expandSnapshotSections(page: Page) {
  await expandSections(page, ["快照比較", "歷史快照"]);
}

/**
 * 展開輸入區的四個區塊（PRD 4.2「輸入區分段收合」）：已有已存檔快照的頁面，
 * 「收入與支出」「目標」預設收合，沒有質押負債時「負債」也收合。
 * 預設值在讀取 LocalStorage 完成時才決定，所以先等輸入區的 `aria-busy` 解除再判斷；
 * 展開狀態不保存，`page.reload()` 之後要再呼叫一次。
 * 檢查欄位「不存在」之前同樣務必先展開。
 */
export async function expandInputSections(page: Page) {
  const form = page.getByTestId("input-form");
  await expect(form).toHaveAttribute("aria-busy", "false");
  await expandSections(form, ["資產", "負債", "收入與支出", "目標"]);
}

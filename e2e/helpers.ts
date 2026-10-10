import { expect, type Locator, type Page } from "@playwright/test";

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

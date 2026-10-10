import { expect, type Page } from "@playwright/test";

/**
 * 展開預設收合的「快照比較」與「歷史快照」（PRD 4.2「快照比較與歷史快照預設收合」）。
 * 已展開的不會被收合；展開狀態不保存，`page.reload()` 之後要再呼叫一次。
 * 檢查區塊內容「不存在」（`toHaveCount(0)`）之前務必先展開，否則收合狀態下必定通過。
 */
export async function expandSnapshotSections(page: Page) {
  for (const name of ["快照比較", "歷史快照"]) {
    const toggle = page.getByRole("button", { name, exact: true });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
}

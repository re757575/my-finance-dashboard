import { expect, test, type Page } from "@playwright/test";
import { expandSnapshotSections, STORAGE_KEY } from "./helpers";

// PRD 4.2「寫入失敗防護」「未存檔離開提醒」「多分頁資料同步」「跨日自動換日」、第 9 節 #51a～#54d

function twStockInput(page: Page) {
  return page.locator('label:has-text("台股市值") input');
}

function storedDates(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    return (JSON.parse(raw).snapshots as { date: string }[]).map((s) => s.date);
  }, STORAGE_KEY);
}

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("寫入失敗：顯示訊息並維持未存檔，排除問題後可重試", async ({ page }) => {
  await twStockInput(page).fill("50000");
  // 模擬儲存空間已滿
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreSetItem: () => void }).restoreSetItem =
      () => {
        Storage.prototype.setItem = original;
      };
    Storage.prototype.setItem = () => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    };
  });

  await page.getByTestId("save-button").click();

  await expect(page.getByTestId("save-message")).toHaveText(
    "無法寫入瀏覽器儲存空間（可能已滿或被停用），本次變更尚未存檔。"
  );
  await expect(page.getByTestId("save-button")).toBeEnabled();
  await expect(page.getByTestId("total-assets")).toHaveText("$50,000");
  expect(await storedDates(page)).toEqual([]);

  await page.evaluate(() =>
    (window as unknown as { restoreSetItem: () => void }).restoreSetItem()
  );
  await page.getByTestId("save-button").click();

  await expect(page.getByTestId("save-message")).toHaveText(
    "已更新並儲存今日資料。"
  );
  expect(await storedDates(page)).toHaveLength(1);
});

test("離開提醒：只有未存檔的手動編輯才會跳出瀏覽器確認", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });

  // 有使用者互動但沒有編輯：不提醒
  await page.getByRole("heading", { name: "個人資產負債儀表板" }).click();
  await page.reload();
  expect(dialogs).toEqual([]);

  // 有未存檔編輯：提醒，確認離開後變更不保留
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("99999");
  await page.reload();
  expect(dialogs).toEqual(["beforeunload"]);
  await expect(page.getByTestId("total-assets")).toHaveText("$0");

  // 存檔後：不再提醒
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("1000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();
  await page.reload();
  expect(dialogs).toEqual(["beforeunload"]);
  await expect(page.getByTestId("total-assets")).toHaveText("$1,000");
});

test("多分頁：另一分頁存檔與刪除後自動同步，存檔不會把已刪除的快照寫回來", async ({
  page,
  context,
}) => {
  // 先建立一筆 5 天前的快照
  await twStockInput(page).fill("10000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();
  const oldDate = await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    const d = new Date();
    d.setDate(d.getDate() - 5);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    data.snapshots[0].date = date;
    localStorage.setItem(key, JSON.stringify(data));
    return date;
  }, STORAGE_KEY);
  await page.reload();
  await expandSnapshotSections(page);

  const otherPage = await context.newPage();
  await otherPage.goto("/");
  await expect(otherPage.getByTestId("total-assets")).toHaveText("$10,000");
  // 分頁 B 也要展開，後面才能確認清單真的同步（收合時找不到任何一列）
  await expandSnapshotSections(otherPage);
  await expect(otherPage.getByTestId(`snapshot-row-${oldDate}`)).toBeVisible();

  // 分頁 A 存檔今天 → 沒有未存檔編輯的分頁 B 自動更新為已存檔狀態
  await twStockInput(page).fill("70000");
  await page.getByTestId("save-button").click();
  await expect(otherPage.getByTestId("total-assets")).toHaveText("$70,000");
  await expect(otherPage.getByTestId("save-button")).toBeDisabled();

  // 分頁 B 有未存檔編輯時，分頁 A 刪除舊快照 → B 保留編輯內容、清單同步
  await twStockInput(otherPage).fill("80000");
  await page.getByRole("button", { name: `刪除 ${oldDate} 的快照` }).click();
  await page.getByRole("button", { name: "確認刪除" }).click();
  await expect(otherPage.getByTestId(`snapshot-row-${oldDate}`)).toHaveCount(0);
  await expect(otherPage.getByTestId("total-assets")).toHaveText("$80,000");

  // B 存檔只覆蓋今天，A 刪除的快照不會復活；A 也同步到 B 存檔的值
  await otherPage.getByTestId("save-button").click();
  await expect(otherPage.getByTestId("save-message")).toBeVisible();
  const dates = await storedDates(otherPage);
  expect(dates).toHaveLength(1);
  expect(dates).not.toContain(oldDate);
  await expect(page.getByTestId("total-assets")).toHaveText("$80,000");
});

test("跨日：回到前景自動換日，存檔一律寫入實際當天", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-01T10:00:00") });
  await page.reload();
  await expect(page.getByText("目前檢視日期：2026-10-01")).toBeVisible();
  await twStockInput(page).fill("10000");
  await page.getByTestId("save-button").click();
  expect(await storedDates(page)).toEqual(["2026-10-01"]);

  // 沒有未存檔編輯就跨日：回到前景後換日，表單帶入最近一筆並回到未存檔狀態
  await page.clock.setFixedTime(new Date("2026-10-02T09:00:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("目前檢視日期：2026-10-02")).toBeVisible();
  await expect(page.getByTestId("total-assets")).toHaveText("$10,000");
  await expect(page.getByTestId("save-button")).toBeEnabled();

  // 有未存檔編輯、且沒有任何前景事件就跨日：直接按存檔仍寫入當天
  await twStockInput(page).fill("20000");
  await page.clock.setFixedTime(new Date("2026-10-03T09:00:00"));
  await page.getByTestId("save-button").click();
  await expect(page.getByText("目前檢視日期：2026-10-03")).toBeVisible();
  expect(await storedDates(page)).toEqual(["2026-10-01", "2026-10-03"]);
  await expect(page.getByTestId("total-assets")).toHaveText("$20,000");
});

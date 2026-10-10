import { expect, test, type Page } from "@playwright/test";

// PRD 4.2「快照比較與歷史快照預設收合」、第 9 節 #66a～#66f

const STORAGE_KEY = "my_finance_dashboard_data";

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

function dateDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 直接寫入 LocalStorage：由舊到新依序為 100,000／200,000／… 的現金快照。 */
async function seedSnapshots(page: Page, daysAgo: number[]) {
  await page.evaluate(
    ({ key, dates }) => {
      const snapshot = (date: string, amount: number) => ({
        date,
        updatedAt: `${date}T00:00:00.000Z`,
        cashSources: [{ id: "c1", name: "銀行", amount, restricted: false }],
        twStockValue: 0,
        usStockValue: 0,
        usStockCurrency: "USD",
        exchangeRate: 0,
        realEstateValue: 0,
        debts: [],
        incomeSources: [],
        monthlyExpense: 0,
        recurringInvestments: [],
        targetNetWorth: 0,
        targetCashRatio: 0,
      });
      localStorage.setItem(
        key,
        JSON.stringify({
          schemaVersion: 8,
          snapshots: dates.map((d, i) => snapshot(d, (i + 1) * 100000)),
        })
      );
    },
    { key: STORAGE_KEY, dates: daysAgo.map(dateDaysAgo) }
  );
  await page.reload();
  await expect(page.getByTestId("total-assets")).not.toHaveText("$0");
}

const comparisonToggle = (page: Page) =>
  page.getByRole("button", { name: "快照比較", exact: true });
const historyToggle = (page: Page) =>
  page.getByRole("button", { name: "歷史快照", exact: true });
const historyRows = (page: Page) =>
  page.locator('[data-testid^="snapshot-row-"]');
const comparisonTable = (page: Page) =>
  page.getByTestId("snapshot-comparison-table");

// #66a
test("預設收合：只顯示兩個標題，看不到日期選單、比較表格與快照清單", async ({
  page,
}) => {
  await seedSnapshots(page, [20, 10, 0]);

  await expect(comparisonToggle(page)).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await expect(historyToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("比較基準日")).toHaveCount(0);
  await expect(page.getByLabel("比較對象日")).toHaveCount(0);
  await expect(comparisonTable(page)).toHaveCount(0);
  await expect(historyRows(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^(修正|刪除) .+ 的快照$/ })
  ).toHaveCount(0);

  // 收合後兩個區塊只剩標題的高度
  for (const testId of ["snapshot-comparison", "snapshot-history"]) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box!.height).toBeLessThanOrEqual(48);
  }
});

// #66b
test("點標題展開、再點一次收合，兩區各自獨立", async ({ page }) => {
  await seedSnapshots(page, [20, 10, 0]);

  await historyToggle(page).click();
  await expect(historyToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(historyRows(page)).toHaveCount(3);
  await expect(comparisonToggle(page)).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await expect(comparisonTable(page)).toHaveCount(0);

  await comparisonToggle(page).click();
  await expect(comparisonTable(page)).toBeVisible();
  await expect(page.getByLabel("比較基準日")).toHaveValue(dateDaysAgo(10));
  await expect(page.getByLabel("比較對象日")).toHaveValue(dateDaysAgo(0));

  await historyToggle(page).click();
  await expect(historyToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(historyRows(page)).toHaveCount(0);
  // 收合歷史快照不影響已展開的快照比較
  await expect(comparisonTable(page)).toBeVisible();
});

// #66c
test("鍵盤操作：聚焦標題後按 Enter 或空白鍵切換", async ({ page }) => {
  await seedSnapshots(page, [10, 0]);

  await comparisonToggle(page).focus();
  await page.keyboard.press("Enter");
  await expect(comparisonTable(page)).toBeVisible();

  await page.keyboard.press("Space");
  await expect(comparisonTable(page)).toHaveCount(0);
  await expect(comparisonToggle(page)).toBeFocused();
});

// #66d
test("收合期間保留選擇：比較日期與「顯示全部」不被重置", async ({ page }) => {
  await seedSnapshots(
    page,
    Array.from({ length: 12 }, (_, i) => 11 - i)
  );

  await comparisonToggle(page).click();
  await page.getByLabel("比較基準日").selectOption(dateDaysAgo(11));
  await comparisonToggle(page).click();
  await comparisonToggle(page).click();
  await expect(page.getByLabel("比較基準日")).toHaveValue(dateDaysAgo(11));

  await historyToggle(page).click();
  await expect(historyRows(page)).toHaveCount(10);
  await page.getByRole("button", { name: "顯示全部（12 筆）" }).click();
  await expect(historyRows(page)).toHaveCount(12);
  await historyToggle(page).click();
  await historyToggle(page).click();
  await expect(historyRows(page)).toHaveCount(12);
});

// #66e
test("展開狀態不保存：重新整理後回到收合，LocalStorage 沒有新增任何鍵", async ({
  page,
}) => {
  await seedSnapshots(page, [10, 0]);
  const keysBefore = await page.evaluate(() => Object.keys(localStorage));

  await comparisonToggle(page).click();
  await historyToggle(page).click();
  await expect(historyRows(page)).toHaveCount(2);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(
    keysBefore
  );

  await page.reload();
  await expect(page.getByTestId("total-assets")).not.toHaveText("$0");
  await expect(comparisonToggle(page)).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await expect(historyToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(historyRows(page)).toHaveCount(0);
});

// #66f
test("沒有快照時同樣收合，展開後才看到空狀態提示", async ({ page }) => {
  await expect(page.getByTestId("snapshot-comparison-empty")).toHaveCount(0);
  await expect(page.getByTestId("snapshot-history-empty")).toHaveCount(0);

  await comparisonToggle(page).click();
  await historyToggle(page).click();

  await expect(page.getByTestId("snapshot-comparison-empty")).toHaveText(
    "至少需要 2 筆已存檔的快照才能比較"
  );
  await expect(page.getByTestId("snapshot-history-empty")).toHaveText(
    "尚未有已存檔的快照"
  );
});

test("修正與刪除後，歷史快照維持展開", async ({ page }) => {
  await seedSnapshots(page, [20, 10, 0]);
  await historyToggle(page).click();

  await page
    .getByRole("button", { name: `修正 ${dateDaysAgo(10)} 的快照` })
    .click();
  await expect(page.getByTestId("snapshot-edit-banner")).toBeVisible();
  await expect(historyToggle(page)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "取消修正" }).click();

  await page
    .getByRole("button", { name: `刪除 ${dateDaysAgo(20)} 的快照` })
    .click();
  await page.getByRole("button", { name: "確認刪除" }).click();
  await expect(historyToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(historyRows(page)).toHaveCount(2);
});

test("390px 窄螢幕：收合與展開都不造成水平溢出，標題高度足以點擊", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSnapshots(page, [10, 0]);
  const noOverflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    );

  expect(await noOverflow()).toBe(true);
  for (const toggle of [comparisonToggle(page), historyToggle(page)]) {
    const box = await toggle.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    await toggle.click();
  }
  await expect(comparisonTable(page)).toBeVisible();
  await expect(historyRows(page)).toHaveCount(2);
  expect(await noOverflow()).toBe(true);
});

import { expect, test, type Page } from "@playwright/test";

// PRD 4.2「壓力測試卡」第 9 點、5.9 節「跌幅範圍」、第 9 節 #71a～#71e

const STORAGE_KEY = "my_finance_dashboard_data";

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

/** 同 #44：現金 300,000、股票 700,000、房貸 400,000（淨資產 600,000、負債比 40%）。 */
async function fillPortfolio(page: Page) {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額", { exact: true }).fill("300000");
  await page.locator('label:has-text("台股市值") input').fill("700000");
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("負債類別").selectOption("房貸");
  await page.getByLabel("剩餘本金").fill("400000");
  await expect(page.getByTestId("net-worth")).toHaveText("$600,000");
}

const scenario = (page: Page, name: string) =>
  page
    .getByRole("group", { name: "股票下跌情境" })
    .getByRole("button", { name, exact: true });
const customInput = (page: Page) => page.getByLabel("自訂跌幅");
const stock = (page: Page) => page.getByTestId("stress-test-stock");

// #71a
test("選「自訂」：出現輸入框並取得焦點，初始值沿用當下的固定情境", async ({
  page,
}) => {
  await fillPortfolio(page);

  await expect(scenario(page, "−20%")).toHaveAttribute("aria-pressed", "true");
  await expect(scenario(page, "自訂")).toHaveAttribute("aria-pressed", "false");
  await expect(customInput(page)).toHaveCount(0);

  await scenario(page, "自訂").click();

  await expect(scenario(page, "自訂")).toHaveAttribute("aria-pressed", "true");
  await expect(scenario(page, "−20%")).toHaveAttribute("aria-pressed", "false");
  await expect(customInput(page)).toHaveValue("20");
  await expect(customInput(page)).toBeFocused();
  await expect(stock(page)).toHaveText("$700,000 → $560,000");
});

// #71b、#71d
test("輸入自訂跌幅（含小數）後情境結果即時更新", async ({ page }) => {
  await fillPortfolio(page);
  await scenario(page, "自訂").click();

  await customInput(page).fill("50");

  await expect(stock(page)).toHaveText("$700,000 → $350,000");
  await expect(page.getByTestId("stress-test-net-worth")).toHaveText(
    "$600,000 → $250,000"
  );
  await expect(page.getByTestId("stress-test-net-worth-change")).toHaveText(
    "（-$350,000，-58.3%）"
  );
  await expect(page.getByTestId("stress-test-debt-ratio")).toHaveText(
    "40.0% → 61.5%"
  );
  await expect(page.getByTestId("stress-test-debt-status")).toContainText(
    "財務高風險"
  );

  await customInput(page).fill("12.5");

  await expect(stock(page)).toHaveText("$700,000 → $612,500");
  // 臨界點與所選情境無關
  await expect(page.getByTestId("stress-breakpoint-net-worth-zero")).toHaveText(
    "股票再下跌 85.7% → 淨資產歸零"
  );
});

// #71c
test("超過 100 自動改為 100；清空視為沒有下跌，不出現 NaN", async ({
  page,
}) => {
  await fillPortfolio(page);
  await scenario(page, "自訂").click();

  await customInput(page).fill("150");

  await expect(customInput(page)).toHaveValue("100");
  await expect(stock(page)).toHaveText("$700,000 → $0");
  await expect(page.getByTestId("stress-test-net-worth")).toHaveText(
    "$600,000 → -$100,000"
  );

  await customInput(page).fill("");

  await expect(stock(page)).toHaveText("$700,000 → $700,000");
  await expect(page.getByTestId("stress-test-net-worth-change")).toHaveText(
    "（$0，0.0%）"
  );
  const card = page.getByTestId("stress-breakpoints").locator("xpath=..");
  await expect(card).not.toContainText("NaN");
  await expect(card).not.toContainText("Infinity");
});

// #71e、#44g
test("自訂值在切換情境時保留；不寫入任何資料，重新整理後回到預設", async ({
  page,
}) => {
  await fillPortfolio(page);
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY
  );

  await scenario(page, "自訂").click();
  await customInput(page).fill("50");
  await scenario(page, "−10%").click();

  await expect(customInput(page)).toHaveCount(0);
  await expect(stock(page)).toHaveText("$700,000 → $630,000");

  await scenario(page, "自訂").click();

  await expect(customInput(page)).toHaveValue("50");
  await expect(stock(page)).toHaveText("$700,000 → $350,000");
  // 試算不動到表單與存檔
  await expect(page.getByTestId("save-button")).toBeDisabled();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    STORAGE_KEY,
  ]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  ).toBe(before);

  await page.reload();

  await expect(scenario(page, "−20%")).toHaveAttribute("aria-pressed", "true");
  await expect(customInput(page)).toHaveCount(0);
  await expect(stock(page)).toHaveText("$700,000 → $560,000");
});

test.describe("觸控裝置", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 780 } });

  test("四顆情境切換鈕排在同一列且不溢出，「自訂」至少 40px 高", async ({
    page,
  }) => {
    await fillPortfolio(page);
    await scenario(page, "自訂").click();

    const box = await scenario(page, "自訂").boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    expect(box!.width).toBeGreaterThanOrEqual(40);
    const first = await scenario(page, "−10%").boundingBox();
    expect(Math.abs(first!.y - box!.y)).toBeLessThan(1);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);
  });
});

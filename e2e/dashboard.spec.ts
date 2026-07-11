import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("首次載入顯示空狀態看板與趨勢圖提示", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "個人資產負債儀表板" })
  ).toBeVisible();
  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  await expect(page.getByText("尚未新增現金來源")).toBeVisible();
  await expect(
    page.getByText("持續使用滿 2 個月即可查看趨勢").first()
  ).toBeVisible();
  // 尚無任何快照時不顯示「查看全部歷史」
  await expect(page.getByText("查看全部歷史")).toHaveCount(0);
});

test("輸入現金與台股市值後，看板數字即時更新（尚未存檔）", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("來源名稱").fill("測試銀行");
  await page.getByLabel("金額").fill("100000");
  await page.locator('label:has-text("台股市值") input').fill("50000");

  await expect(page.getByTestId("total-assets")).toHaveText("$150,000");
  await expect(page.getByTestId("net-worth")).toHaveText("$150,000");
  await expect(page.getByTestId("save-button")).toBeEnabled();
});

// PRD 4.2 節：未按下「更新儀表板」的變更不會被保留
test("未存檔的變更在重新整理後不會保留", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("99999");
  await expect(page.getByTestId("total-assets")).toHaveText("$99,999");

  await page.reload();

  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  await expect(page.getByText("尚未新增現金來源")).toBeVisible();
});

// PRD 第 9 節 #3～#6：負債比燈號邊界即時反映
test("負債比燈號隨輸入即時切換健康狀態", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("100000");

  await expect(page.getByTestId("debt-ratio-status")).toHaveText("完美無債");

  await page.locator('label:has-text("銀行貸款餘額") input').fill("39990");
  await expect(page.getByTestId("debt-ratio-status")).toHaveText(
    "財務健康（安全範圍）"
  );

  await page.locator('label:has-text("銀行貸款餘額") input').fill("40000");
  await expect(page.getByTestId("debt-ratio-status")).toHaveText(
    "負債偏高（需注意調控）"
  );

  await page.locator('label:has-text("銀行貸款餘額") input').fill("60001");
  await expect(page.getByTestId("debt-ratio-status")).toHaveText(
    "財務高風險（請儘速理債）"
  );
});

// 美股市值可切換計價幣別：USD 需乘匯率、TWD 直接採用輸入的台幣等值金額
test("美股市值可切換 USD/TWD 計價，切換後總資產與匯率欄位跟著變化", async ({
  page,
}) => {
  await page.getByLabel("美股市值", { exact: true }).fill("1000");
  await page.locator('label:has-text("美股匯率") input').fill("32");

  await expect(page.getByTestId("total-assets")).toHaveText("$32,000");
  await expect(page.locator('label:has-text("美股匯率")')).toBeVisible();

  await page.getByRole("button", { name: "TWD", exact: true }).click();

  // 切到 TWD 模式：匯率欄位消失，美股市值 1000 直接當台幣使用，不再乘 32
  await expect(page.locator('label:has-text("美股匯率")')).toHaveCount(0);
  await expect(page.getByTestId("total-assets")).toHaveText("$1,000");

  await page.getByRole("button", { name: "USD", exact: true }).click();

  // 切回 USD：先前輸入的匯率仍保留，重新乘回去
  await expect(page.locator('label:has-text("美股匯率")')).toBeVisible();
  await expect(page.getByTestId("total-assets")).toHaveText("$32,000");
});

test("按下更新儀表板後正式存檔，重新整理後資料仍在", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("50000");

  const saveButton = page.getByTestId("save-button");
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect(page.getByTestId("save-message")).toBeVisible();
  await expect(saveButton).toBeDisabled();

  await page.reload();

  await expect(page.getByTestId("total-assets")).toHaveText("$50,000");
  await expect(page.getByText("查看全部歷史")).toBeVisible();
});

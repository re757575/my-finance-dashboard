import { expect, test, type Page } from "@playwright/test";
import { STORAGE_KEY } from "./helpers";

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

/** 現金 1,000,000、台股 1,000,000、質押本金 500,000／質押股票市值 800,000（維持率 160%）。 */
async function fillPledgedPortfolio(page: Page) {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("1000000");
  await page.locator('label:has-text("台股市值") input').fill("1000000");
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("負債類別").selectOption("質押");
  await page.getByLabel("剩餘本金").fill("500000");
  await page.getByLabel("質押股票市值").fill("800000");
}

function breakpointTestIds(page: Page) {
  return page
    .getByTestId("stress-breakpoints")
    .getByRole("listitem")
    .evaluateAll((items) => items.map((item) => item.dataset.testid));
}

// PRD 第 9 節 #44h：負債比與淨資產的臨界點
test("臨界點：沒有股票時不顯示；負債比已達 40% 置頂，其餘依跌幅由小到大", async ({
  page,
}) => {
  await expect(page.getByTestId("stress-breakpoints")).toHaveCount(0);

  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("300000");
  await page.locator('label:has-text("台股市值") input').fill("700000");

  // 沒有負債：兩條負債比線不適用，現金還在所以淨資產不會歸零
  await expect(
    page.getByTestId("stress-breakpoints").getByRole("listitem")
  ).toHaveCount(1);
  await expect(page.getByTestId("stress-breakpoint-net-worth-zero")).toHaveText(
    "不會觸及淨資產歸零（股票跌到 0 也碰不到）"
  );

  await page.getByText("+ 新增負債").click();
  await page.getByLabel("剩餘本金").fill("400000");

  // 總資產 1,000,000、負債 400,000：現況負債比恰為 40%
  await expect(
    page.getByTestId("stress-breakpoint-debt-ratio-elevated")
  ).toHaveText("已觸及負債比已達 40% 以上");
  await expect(
    page.getByTestId("stress-breakpoint-debt-ratio-high-risk")
  ).toHaveText("股票再下跌 47.6% → 負債比升至 60%（再跌即進入「財務高風險」）");
  await expect(page.getByTestId("stress-breakpoint-net-worth-zero")).toHaveText(
    "股票再下跌 85.7% → 淨資產歸零"
  );
  expect(await breakpointTestIds(page)).toEqual([
    "stress-breakpoint-debt-ratio-elevated",
    "stress-breakpoint-debt-ratio-high-risk",
    "stress-breakpoint-net-worth-zero",
  ]);
  // 沒有質押負債：不顯示質押追繳線
  await expect(
    page.getByTestId("stress-breakpoint-pledge-margin-call")
  ).toHaveCount(0);
});

// PRD 第 9 節 #44i／#44j／#44k／#44m：質押追繳線、不會觸及、與所選情境無關
test("臨界點：質押追繳線與維持率卡的下跌空間一致，切換情境不影響臨界點", async ({
  page,
}) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("1000000");
  await page.locator('label:has-text("台股市值") input').fill("1000000");
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("負債類別").selectOption("質押");
  await page.getByLabel("剩餘本金").fill("500000");

  // 尚未填寫質押股票市值：不顯示質押追繳線，其餘照常
  await expect(
    page.getByTestId("stress-breakpoint-pledge-margin-call")
  ).toHaveCount(0);
  await expect(
    page.getByTestId("stress-breakpoint-debt-ratio-elevated")
  ).toHaveText("股票再下跌 75.0% → 負債比升至 40%（進入「負債偏高」）");

  await page.getByLabel("質押股票市值").fill("800000");

  await expect(
    page.getByTestId("stress-breakpoint-pledge-margin-call")
  ).toHaveText("股票再下跌 18.8% → 質押維持率觸及 130% 追繳線");
  // 與質押整戶維持率卡的「可再下跌空間」是同一個數字
  await expect(page.getByTestId("pledge-maintenance-drop")).toContainText(
    "18.8%"
  );
  await expect(
    page.getByTestId("stress-breakpoint-debt-ratio-high-risk")
  ).toHaveText(
    "不會觸及負債比升至 60%（再跌即進入「財務高風險」）（股票跌到 0 也碰不到）"
  );
  await expect(page.getByTestId("stress-breakpoint-net-worth-zero")).toHaveText(
    "不會觸及淨資產歸零（股票跌到 0 也碰不到）"
  );
  expect(await breakpointTestIds(page)).toEqual([
    "stress-breakpoint-pledge-margin-call",
    "stress-breakpoint-debt-ratio-elevated",
    "stress-breakpoint-debt-ratio-high-risk",
    "stress-breakpoint-net-worth-zero",
  ]);

  const block = page.getByTestId("stress-breakpoints");
  const before = await block.innerText();

  // 預設 −20% 已跌破追繳線（臨界點 18.8% < 20%），−10% 則還沒；兩者的臨界點文字都不變
  await expect(
    page.getByTestId("stress-test-margin-call-warning")
  ).toBeVisible();
  await page.getByRole("button", { name: "−10%" }).click();
  await expect(page.getByTestId("stress-test-pledge-ratio")).toHaveText(
    "160.0% → 144.0%"
  );
  await expect(page.getByTestId("stress-test-margin-call-warning")).toHaveCount(
    0
  );
  expect(await block.innerText()).toBe(before);

  await page.getByRole("button", { name: "−30%" }).click();
  await expect(page.getByTestId("stress-test-pledge-ratio")).toHaveText(
    "160.0% → 112.0%"
  );
  expect(await block.innerText()).toBe(before);

  // 股價下跌、質押股票市值已低於追繳線：改為「已觸及」並排到最前
  await page.getByLabel("質押股票市值").fill("600000");
  await expect(
    page.getByTestId("stress-breakpoint-pledge-margin-call")
  ).toHaveText("已觸及質押維持率已在 130% 追繳線或以下");
  expect((await breakpointTestIds(page))[0]).toBe(
    "stress-breakpoint-pledge-margin-call"
  );
});

// PRD 第 9 節 #44m：臨界點是純即時試算，不寫入任何資料
test("臨界點不寫入資料：切換情境後重新整理，存檔內容與臨界點都不變", async ({
  page,
}) => {
  await fillPledgedPortfolio(page);
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-button")).toBeDisabled();

  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY
  );
  expect(stored).not.toBeNull();
  // 臨界點不屬於快照資料，不會被存進 LocalStorage
  expect(stored).not.toContain("breakpoint");
  const before = await page.getByTestId("stress-breakpoints").innerText();

  await page.getByRole("button", { name: "−30%" }).click();
  await page.getByRole("button", { name: "−10%" }).click();
  // 切換情境、查看臨界點都不會讓草稿變成未存檔狀態
  await expect(page.getByTestId("save-button")).toBeDisabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  ).toBe(stored);

  await page.reload();

  await expect(page.getByTestId("total-assets")).toHaveText("$2,000,000");
  await expect(
    page.getByTestId("stress-breakpoint-pledge-margin-call")
  ).toHaveText("股票再下跌 18.8% → 質押維持率觸及 130% 追繳線");
  expect(await page.getByTestId("stress-breakpoints").innerText()).toBe(before);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  ).toBe(stored);
  await expect(page.getByTestId("save-button")).toBeDisabled();
});

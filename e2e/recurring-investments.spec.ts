import { expect, test, type Page } from "@playwright/test";
import { expandInputSections, expandSnapshotSections } from "./helpers";

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

/** 收入 60,000 − 支出 20,000 − 月付 12,000（本金 144,000、0%、12 期）＝ 現金流 28,000、儲蓄率 46.7%。 */
async function fillCashFlow28000(page: Page) {
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("剩餘本金").fill("144000");
  await page.getByLabel("剩餘還款期數").fill("12");
  await page.getByText("+ 新增收入").click();
  await page.getByLabel("收入金額").fill("60000");
  await page.locator('label:has-text("本月支出") input').fill("20000");
  await expect(page.getByTestId("cash-flow-value")).toHaveText("$28,000");
  await expect(page.getByTestId("savings-rate-value")).toHaveText("46.7%");
}

async function addRecurringInvestment(
  page: Page,
  name: string,
  amount: string
) {
  await page.getByText("+ 新增定期定額").click();
  await page.getByLabel("定期定額名稱").last().fill(name);
  await page.getByLabel("定期定額金額").last().fill(amount);
}

// PRD 4.2「每月定期定額清單」、5.3a 節、第 9 節 #62a～#62c、#62f
test("定期定額不算支出：現金流與儲蓄率不變，另並列定期定額後剩餘", async ({
  page,
}) => {
  await fillCashFlow28000(page);
  const emergencyFund = await page
    .getByTestId("emergency-fund-value")
    .textContent();
  await expect(page.getByText("尚未新增定期定額")).toBeVisible();
  await expect(page.getByTestId("cash-flow-after-investment")).toHaveCount(0);

  await addRecurringInvestment(page, "0050", "10000");
  await addRecurringInvestment(page, "VT", "5000");

  await expect(page.getByText("定期定額合計：$15,000")).toBeVisible();
  await expect(page.getByTestId("cash-flow-after-investment")).toHaveText(
    "定期定額後剩餘 $13,000（定期定額 $15,000）"
  );
  // 主數字、標籤、儲蓄率與緊急預備金都不受定期定額影響
  await expect(page.getByTestId("cash-flow-value")).toHaveText("$28,000");
  await expect(page.getByText("收支為正")).toBeVisible();
  await expect(page.getByTestId("savings-rate-value")).toHaveText("46.7%");
  await expect(page.getByTestId("emergency-fund-value")).toHaveText(
    emergencyFund ?? ""
  );

  await page.getByLabel("本月預估現金流計算公式說明").click();
  const formula = page.getByTestId("formula-info-content");
  await expect(formula).toContainText("定期定額後剩餘 = 現金流 − 定期定額合計");
  await expect(formula).toContainText("$28,000 − $15,000 = $13,000");
});

// PRD 第 9 節 #62d、#62e
test("定期定額超過現金流時標示不足以支應，刪除後不再顯示", async ({ page }) => {
  await fillCashFlow28000(page);
  await addRecurringInvestment(page, "0050", "30000");

  await expect(page.getByTestId("cash-flow-after-investment")).toHaveText(
    "定期定額後剩餘 -$2,000（定期定額 $30,000，不足以支應）"
  );
  await expect(page.getByTestId("cash-flow-value")).toHaveText("$28,000");
  await expect(page.getByText("收支為正")).toBeVisible();

  await page.getByLabel("刪除 0050").click();

  await expect(page.getByTestId("cash-flow-after-investment")).toHaveCount(0);
  await expect(page.getByText("定期定額合計：$0")).toBeVisible();
});

// PRD 第 9 節 #62g：隨快照存檔，重新整理後仍在
test("定期定額隨快照存檔，重新整理後仍保留", async ({ page }) => {
  await fillCashFlow28000(page);
  await addRecurringInvestment(page, "0050", "10000");
  await addRecurringInvestment(page, "VT", "5000");

  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();
  await page.reload();
  await expandInputSections(page);

  await expect(page.getByLabel("定期定額名稱")).toHaveCount(2);
  await expect(page.getByLabel("定期定額名稱").first()).toHaveValue("0050");
  await expect(page.getByLabel("定期定額名稱").last()).toHaveValue("VT");
  await expect(page.getByTestId("cash-flow-after-investment")).toHaveText(
    "定期定額後剩餘 $13,000（定期定額 $15,000）"
  );

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("my_finance_dashboard_data") ?? "{}")
  );
  expect(stored.schemaVersion).toBe(8);
  expect(
    stored.snapshots[0].recurringInvestments.map(
      (investment: { name: string; amount: number }) => [
        investment.name,
        investment.amount,
      ]
    )
  ).toEqual([
    ["0050", 10000],
    ["VT", 5000],
  ]);
});

// PRD 6.1 節、第 9 節 #62h：V7（無定期定額清單）資料遷移後照常顯示
test("V7 舊資料遷移後補上空的定期定額清單，現金流不變", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "my_finance_dashboard_data",
      JSON.stringify({
        schemaVersion: 7,
        snapshots: [
          {
            date: "2026-01-31",
            updatedAt: "2026-01-31T12:00:00.000Z",
            cashSources: [
              { id: "c1", name: "現金", amount: 300000, restricted: false },
            ],
            twStockValue: 0,
            usStockValue: 0,
            usStockCurrency: "USD",
            exchangeRate: 0,
            realEstateValue: 0,
            debts: [],
            incomeSources: [{ id: "i1", name: "薪資", amount: 60000 }],
            monthlyExpense: 20000,
            targetNetWorth: 0,
            targetCashRatio: 0,
          },
        ],
      })
    );
  });
  await page.reload();
  await expandInputSections(page);

  await expect(page.getByTestId("cash-flow-value")).toHaveText("$40,000");
  await expect(page.getByText("尚未新增定期定額")).toBeVisible();
  await expect(page.getByTestId("cash-flow-after-investment")).toHaveCount(0);

  // 補上定期定額並存檔後，資料以 V8 寫回，舊快照也帶有空清單
  await addRecurringInvestment(page, "0050", "10000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("my_finance_dashboard_data") ?? "{}")
  );
  expect(stored.schemaVersion).toBe(8);
  expect(stored.snapshots[0].recurringInvestments).toEqual([]);
  expect(stored.snapshots.at(-1).recurringInvestments).toHaveLength(1);
});

// PRD 4.2「快照比較」、5.10 節、第 9 節 #62j、#62k
test("快照比較列出每月定期定額的合計與逐筆增減；兩筆皆無時不顯示該組", async ({
  page,
}) => {
  const seed = (withInvestments: boolean) =>
    page.evaluate((hasInvestments) => {
      const snapshot = (
        date: string,
        recurringInvestments: { id: string; name: string; amount: number }[]
      ) => ({
        date,
        updatedAt: `${date}T12:00:00.000Z`,
        cashSources: [
          { id: "c1", name: "現金", amount: 300000, restricted: false },
        ],
        twStockValue: 0,
        usStockValue: 0,
        usStockCurrency: "USD",
        exchangeRate: 0,
        realEstateValue: 0,
        debts: [],
        incomeSources: [{ id: "i1", name: "薪資", amount: 60000 }],
        monthlyExpense: 20000,
        recurringInvestments: hasInvestments ? recurringInvestments : [],
        targetNetWorth: 0,
        targetCashRatio: 0,
      });
      localStorage.setItem(
        "my_finance_dashboard_data",
        JSON.stringify({
          schemaVersion: 8,
          snapshots: [
            snapshot("2026-01-31", [
              { id: "r1", name: "0050", amount: 10000 },
              { id: "r2", name: "VT", amount: 5000 },
            ]),
            snapshot("2026-02-28", [
              { id: "r1", name: "0050", amount: 15000 },
              { id: "r3", name: "QQQ", amount: 3000 },
            ]),
          ],
        })
      );
    }, withInvestments);

  await seed(true);
  await page.reload();
  await expandSnapshotSections(page);

  const comparison = page.getByTestId("snapshot-comparison");
  await expect(comparison.getByText("每月定期定額")).toBeVisible();
  const total = page.getByTestId("comparison-row-recurring-investment-total");
  await expect(total).toContainText("$15,000");
  await expect(total).toContainText("$18,000");
  await expect(total).toContainText("▲ $3,000 (+20.0%)");
  await expect(
    page.getByTestId("comparison-row-recurring-investment-r1")
  ).toContainText("▲ $5,000 (+50.0%)");
  const added = page.getByTestId("comparison-row-recurring-investment-r3");
  await expect(added).toContainText("QQQ");
  await expect(added).toContainText("新增");
  const removed = page.getByTestId("comparison-row-recurring-investment-r2");
  await expect(removed).toContainText("VT");
  await expect(removed).toContainText("已移除");
  await expect(removed).toContainText("▼ $5,000");

  // 兩筆快照都沒有定期定額：整組不顯示，其餘各組照常
  await seed(false);
  await page.reload();
  await expandSnapshotSections(page);

  await expect(page.getByTestId("comparison-row-cash")).toBeVisible();
  await expect(comparison.getByText("每月定期定額")).toHaveCount(0);
  await expect(total).toHaveCount(0);
});

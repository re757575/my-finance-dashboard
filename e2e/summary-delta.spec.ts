import { expect, test, type Page } from "@playwright/test";
import {
  dateDaysAgo,
  expandInputSections,
  expandSnapshotSections,
  makeSnapshot,
  seedFinanceData,
} from "./helpers";

// PRD 4.2「總覽卡增減比對」、第 7 節「總覽卡增減」、第 9 節 #69a～#69e

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

interface SeedSnapshot {
  daysAgo: number;
  cash: number;
  /** 只計息、期數為 0 的信貸：跨月也不會被自動攤還，數字保持穩定。 */
  debt?: number;
}

/** 直接寫入 LocalStorage：每筆快照一個現金來源，可另帶一筆負債。 */
async function seedSnapshots(page: Page, snapshots: SeedSnapshot[]) {
  await seedFinanceData(
    page,
    snapshots.map(({ daysAgo, cash, debt }) =>
      makeSnapshot(dateDaysAgo(daysAgo), {
        cashSources: [
          { id: "c1", name: "銀行", amount: cash, restricted: false },
        ],
        debts:
          debt === undefined
            ? []
            : [
                {
                  id: "d1",
                  name: "信貸",
                  category: "信貸",
                  principal: debt,
                  annualRate: 0,
                  remainingMonths: 0,
                  repaymentMethod: "interestOnly",
                  collateralValue: 0,
                },
              ],
      })
    )
  );
  await expect(page.getByTestId("input-form")).toHaveAttribute(
    "aria-busy",
    "false"
  );
}

const cashAmount = (page: Page) => page.getByLabel("金額", { exact: true });
const assetsDelta = (page: Page) => page.getByTestId("total-assets-delta");
const liabilitiesDelta = (page: Page) =>
  page.getByTestId("total-liabilities-delta");
const netWorthDelta = (page: Page) => page.getByTestId("net-worth-delta");
const allDeltas = (page: Page) => page.locator('[data-testid$="-delta"]');

// #69a
test("與上一筆快照比較：顯示基準日期與增減，隨輸入即時更新", async ({
  page,
}) => {
  await seedSnapshots(page, [{ daysAgo: 1, cash: 1000000, debt: 400000 }]);
  const yesterday = dateDaysAgo(1);

  // 今日草稿由昨天帶入、尚未修改：三張卡都是持平
  await expect(assetsDelta(page)).toHaveText(`較 ${yesterday}持平`);
  await expect(liabilitiesDelta(page)).toHaveText(`較 ${yesterday}持平`);
  await expect(netWorthDelta(page)).toHaveText(`較 ${yesterday}持平`);

  await cashAmount(page).fill("1050000");

  await expect(assetsDelta(page)).toHaveText(
    `較 ${yesterday}▲ $50,000 (+5.0%)`
  );
  await expect(netWorthDelta(page)).toHaveText(
    `較 ${yesterday}▲ $50,000 (+8.3%)`
  );
  await expect(liabilitiesDelta(page)).toHaveText(`較 ${yesterday}持平`);

  await cashAmount(page).fill("900000");

  await expect(assetsDelta(page)).toHaveText(
    `較 ${yesterday}▼ $100,000 (-10.0%)`
  );
  await expect(netWorthDelta(page)).toHaveText(
    `較 ${yesterday}▼ $100,000 (-16.7%)`
  );
});

// #69b
test("今天已存檔時，比對基準是更早的那一筆，不是今天自己", async ({ page }) => {
  await seedSnapshots(page, [
    { daysAgo: 1, cash: 1000000 },
    { daysAgo: 0, cash: 1200000 },
  ]);
  const yesterday = dateDaysAgo(1);

  await expect(page.getByTestId("total-assets")).toHaveText("$1,200,000");
  await expect(assetsDelta(page)).toHaveText(
    `較 ${yesterday}▲ $200,000 (+20.0%)`
  );

  await cashAmount(page).fill("1000000");

  await expect(assetsDelta(page)).toHaveText(`較 ${yesterday}持平`);
});

// #69c
test("沒有更早的已存檔快照時不顯示增減行", async ({ page }) => {
  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  await expect(allDeltas(page)).toHaveCount(0);

  // 存下今天第一筆之後，仍然沒有「更早」的快照可比
  await page.getByText("+ 新增現金來源").click();
  await cashAmount(page).fill("500000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();

  await expect(page.getByTestId("total-assets")).toHaveText("$500,000");
  await expect(allDeltas(page)).toHaveCount(0);
});

// #69d
test("修正模式：與被修正日期的前一筆比較；修正最早的一筆時不顯示", async ({
  page,
}) => {
  await seedSnapshots(page, [
    { daysAgo: 30, cash: 100000 },
    { daysAgo: 20, cash: 200000 },
    { daysAgo: 10, cash: 300000 },
  ]);
  await expandSnapshotSections(page);

  // 一般狀態：今日草稿（帶入 300,000）與最近一筆比較
  await expect(assetsDelta(page)).toHaveText(`較 ${dateDaysAgo(10)}持平`);

  await page
    .getByRole("button", { name: `修正 ${dateDaysAgo(20)} 的快照` })
    .click();
  await expect(page.getByTestId("total-assets")).toHaveText("$200,000");
  await expect(assetsDelta(page)).toHaveText(
    `較 ${dateDaysAgo(30)}▲ $100,000 (+100.0%)`
  );

  await page
    .getByRole("button", { name: `修正 ${dateDaysAgo(30)} 的快照` })
    .click();
  await expect(page.getByTestId("total-assets")).toHaveText("$100,000");
  await expect(allDeltas(page)).toHaveCount(0);

  await page.getByRole("button", { name: "取消修正" }).click();
  await expect(assetsDelta(page)).toHaveText(`較 ${dateDaysAgo(10)}持平`);
});

// #69e
test("基準值 ≤ 0 時只顯示增減金額，不顯示百分比", async ({ page }) => {
  // 上一筆：透支帳戶 −50,000、沒有負債 → 總資產與淨資產為負、總負債為 0
  await seedSnapshots(page, [{ daysAgo: 1, cash: -50000 }]);
  const yesterday = dateDaysAgo(1);

  await cashAmount(page).fill("100000");
  // 回訪時「負債」預設收合
  await expandInputSections(page);
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("剩餘本金").fill("30000");

  await expect(assetsDelta(page)).toHaveText(`較 ${yesterday}▲ $150,000`);
  await expect(liabilitiesDelta(page)).toHaveText(`較 ${yesterday}▲ $30,000`);
  await expect(netWorthDelta(page)).toHaveText(`較 ${yesterday}▲ $120,000`);
  const dashboard = page.getByTestId("dashboard-now");
  await expect(dashboard).not.toContainText("NaN");
  await expect(dashboard).not.toContainText("Infinity");
});

// 第 7 節「總覽卡增減」：手機兩欄並排時增減行可換行，不可超出卡片
for (const width of [360, 390]) {
  test(`${width}px：增減行留在卡片內，頁面無水平溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "載入範例資料" }).click();
    await expect(allDeltas(page)).toHaveCount(3);

    for (const delta of await allDeltas(page).all()) {
      const inside = await delta.evaluate((el) => {
        const card = el.closest(".rounded-xl")!;
        const style = getComputedStyle(card);
        const cardRect = card.getBoundingClientRect();
        const left = cardRect.left + parseFloat(style.paddingLeft);
        const right = cardRect.right - parseFloat(style.paddingRight);
        return [...el.children].every((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left >= left - 0.5 && rect.right <= right + 0.5;
        });
      });
      expect(inside).toBe(true);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);
  });
}

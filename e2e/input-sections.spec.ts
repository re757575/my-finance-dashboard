import { expect, test, type Page } from "@playwright/test";
import {
  dateDaysAgo,
  makeSnapshot,
  seedFinanceData,
  STORAGE_KEY,
} from "./helpers";

// PRD 4.2「輸入區分段收合」、第 7 節同名項目、第 9 節 #70a～#70h

const SECTIONS = ["資產", "負債", "收入與支出", "目標"] as const;

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

/** 前 n 個月 1 日的日期字串（跨月才會觸發負債自動估算）。 */
function firstDayMonthsAgo(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

interface SeedDebt {
  id: string;
  category: "信貸" | "質押" | "房貸";
  principal: number;
  repaymentMethod?: "amortizing" | "interestOnly";
  annualRate?: number;
  remainingMonths?: number;
  collateralValue?: number;
}

/**
 * 直接寫入一筆已存檔快照（預設是今天）：現金 1,000,000、收入 100,000、支出 40,000、
 * 定期定額 20,000、目標淨資產 30,000,000、目標現金比例 20%，負債由參數決定。
 */
async function seedSnapshot(page: Page, debts: SeedDebt[], date?: string) {
  await seedFinanceData(page, [
    makeSnapshot(date ?? dateDaysAgo(0), {
      cashSources: [
        { id: "c1", name: "銀行", amount: 1000000, restricted: false },
      ],
      debts: debts.map((debt) => ({
        name: "",
        annualRate: 0,
        remainingMonths: 0,
        repaymentMethod: "interestOnly",
        collateralValue: 0,
        ...debt,
      })),
      incomeSources: [{ id: "i1", name: "薪資", amount: 100000 }],
      monthlyExpense: 40000,
      recurringInvestments: [{ id: "r1", name: "0050", amount: 20000 }],
      targetNetWorth: 30000000,
      targetCashRatio: 20,
    }),
  ]);
  await expect(form(page)).toHaveAttribute("aria-busy", "false");
}

const TWO_LOANS: SeedDebt[] = [
  { id: "d1", category: "房貸", principal: 3000000 },
  { id: "d2", category: "信貸", principal: 2000000 },
];

const form = (page: Page) => page.getByTestId("input-form");
const toggle = (page: Page, name: (typeof SECTIONS)[number]) =>
  form(page).getByRole("button", { name, exact: true });
const summary = (page: Page, key: string) =>
  page.getByTestId(`input-section-${key}-summary`);

async function expectExpanded(
  page: Page,
  expected: Record<(typeof SECTIONS)[number], boolean>
) {
  for (const name of SECTIONS) {
    await expect(toggle(page, name)).toHaveAttribute(
      "aria-expanded",
      String(expected[name])
    );
  }
}

const ALL_OPEN = { 資產: true, 負債: true, 收入與支出: true, 目標: true };
const RETURNING = { 資產: true, 負債: false, 收入與支出: false, 目標: false };

const savedSnapshots = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{"snapshots":[]}'),
    STORAGE_KEY
  );

// #70a
test("首次使用：四個區塊全部展開，所有欄位都看得到", async ({ page }) => {
  await expect(form(page)).toHaveAttribute("aria-busy", "false");

  await expectExpanded(page, ALL_OPEN);
  await expect(page.getByText("+ 新增現金來源")).toBeVisible();
  await expect(page.getByText("+ 新增負債")).toBeVisible();
  await expect(page.getByText("+ 新增收入")).toBeVisible();
  await expect(page.locator('label:has-text("本月支出") input')).toBeVisible();
  await expect(page.getByText("+ 新增定期定額")).toBeVisible();
  await expect(page.getByLabel("目標淨資產", { exact: true })).toBeVisible();
  await expect(
    page.locator('label:has-text("目標現金比例") input')
  ).toBeVisible();
  // 展開時不顯示摘要
  await expect(page.locator('[data-testid$="-summary"]')).toHaveCount(0);
});

// #70b、#70d
test("回訪：只展開「資產」，收合的區塊以摘要顯示目前數值", async ({ page }) => {
  await seedSnapshot(page, TWO_LOANS);

  await expectExpanded(page, RETURNING);
  await expect(page.getByLabel("金額", { exact: true })).toBeVisible();
  await expect(page.getByText("+ 新增負債")).toHaveCount(0);
  await expect(page.getByLabel("剩餘本金")).toHaveCount(0);
  await expect(page.getByLabel("收入金額")).toHaveCount(0);
  await expect(page.locator('label:has-text("本月支出") input')).toHaveCount(0);
  await expect(page.getByLabel("定期定額名稱")).toHaveCount(0);
  await expect(page.getByLabel("目標淨資產", { exact: true })).toHaveCount(0);

  await expect(summary(page, "assets")).toHaveCount(0);
  await expect(summary(page, "debts")).toHaveText("2 筆・$5,000,000");
  await expect(summary(page, "cash-flow")).toHaveText(
    "收入 $100,000・支出 $40,000・定期定額 $20,000"
  );
  await expect(summary(page, "goals")).toHaveText(
    "淨資產 $30,000,000・現金 20%"
  );

  // 「更新儀表板」與資料管理區不屬於任何區塊，永遠顯示
  await expect(page.getByTestId("save-button")).toBeVisible();
  await expect(page.getByText("清空本地資料")).toBeVisible();
});

// #70c
test("回訪且有質押負債：「負債」也預設展開", async ({ page }) => {
  await seedSnapshot(page, [
    {
      id: "d1",
      category: "質押",
      principal: 500000,
      collateralValue: 1000000,
    },
  ]);

  await expectExpanded(page, { ...RETURNING, 負債: true });
  await expect(page.getByLabel("質押股票市值")).toHaveValue("1,000,000");
  await expect(summary(page, "debts")).toHaveCount(0);
});

test("各區塊獨立切換：展開後顯示欄位、摘要消失，再點一次收合", async ({
  page,
}) => {
  await seedSnapshot(page, TWO_LOANS);

  await toggle(page, "負債").click();

  await expectExpanded(page, { ...RETURNING, 負債: true });
  await expect(page.getByLabel("剩餘本金")).toHaveCount(2);
  await expect(summary(page, "debts")).toHaveCount(0);
  await expect(summary(page, "goals")).toBeVisible();

  // 鍵盤操作：聚焦標題後按 Enter
  await toggle(page, "目標").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("目標淨資產", { exact: true })).toHaveValue(
    "30,000,000"
  );

  await toggle(page, "負債").click();
  await expectExpanded(page, { ...RETURNING, 目標: true });
  await expect(page.getByLabel("剩餘本金")).toHaveCount(0);
  await expect(summary(page, "debts")).toHaveText("2 筆・$5,000,000");

  // 「資產」同樣可以收合，摘要為總資產合計
  await toggle(page, "資產").click();
  await expect(page.getByLabel("金額", { exact: true })).toHaveCount(0);
  await expect(summary(page, "assets")).toHaveText("合計 $1,000,000");
});

// #70e
test("負債有系統估算的數值時，收合的摘要提示「含系統估算」", async ({
  page,
}) => {
  await seedSnapshot(
    page,
    [
      {
        id: "d1",
        category: "房貸",
        principal: 3000000,
        annualRate: 2.4,
        remainingMonths: 240,
        repaymentMethod: "amortizing",
      },
    ],
    firstDayMonthsAgo(2)
  );

  await expectExpanded(page, RETURNING);
  await expect(summary(page, "debts")).toContainText("1 筆・");
  await expect(summary(page, "debts")).toContainText("含系統估算");

  await toggle(page, "負債").click();

  await expect(page.getByLabel("剩餘還款期數")).toHaveValue("238");
  await expect(page.getByText("系統估算", { exact: true })).toHaveCount(2);
});

// #70f
test("收合的區塊資料不受影響：照常計入看板、照常存檔", async ({ page }) => {
  await seedSnapshot(page, TWO_LOANS, dateDaysAgo(1));
  await expectExpanded(page, RETURNING);
  const cashFlow = await page.getByTestId("cash-flow-value").textContent();
  expect(cashFlow).toBe("$60,000");

  await page.getByLabel("金額", { exact: true }).fill("1200000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();

  await expect(page.getByTestId("cash-flow-value")).toHaveText("$60,000");
  await expect(page.getByTestId("total-liabilities")).toHaveText("$5,000,000");
  const { snapshots } = await savedSnapshots(page);
  expect(snapshots).toHaveLength(2);
  const today = snapshots[1];
  expect(today.cashSources[0].amount).toBe(1200000);
  expect(today.debts.map((d: { principal: number }) => d.principal)).toEqual([
    3000000, 2000000,
  ]);
  expect(today.incomeSources).toEqual(snapshots[0].incomeSources);
  expect(today.monthlyExpense).toBe(40000);
  expect(today.recurringInvestments).toEqual(snapshots[0].recurringInvestments);
  expect(today.targetNetWorth).toBe(30000000);
  expect(today.targetCashRatio).toBe(20);
  // 存檔不改變展開狀態
  await expectExpanded(page, RETURNING);
});

// #70g
test("存下第一筆快照不會自動收合；展開狀態不保存，重新整理後回到預設", async ({
  page,
}) => {
  await expect(form(page)).toHaveAttribute("aria-busy", "false");
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額", { exact: true }).fill("500000");
  await page.locator('label:has-text("本月支出") input').fill("30000");

  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();

  await expectExpanded(page, ALL_OPEN);
  await expect(page.getByTestId("save-message")).toBeInViewport();
  const keysAfterSave = await page.evaluate(() => Object.keys(localStorage));
  expect(keysAfterSave).toEqual([STORAGE_KEY]);

  await page.reload();
  await expect(form(page)).toHaveAttribute("aria-busy", "false");
  await expectExpanded(page, RETURNING);
  await expect(summary(page, "cash-flow")).toHaveText("收入 $0・支出 $30,000");

  // 手動展開後重新整理，仍回到預設；沒有新增任何 LocalStorage 鍵
  await toggle(page, "目標").click();
  await toggle(page, "資產").click();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    STORAGE_KEY,
  ]);
  await page.reload();
  await expect(form(page)).toHaveAttribute("aria-busy", "false");
  await expectExpanded(page, RETURNING);
});

// #70h
test("清空本地資料後四個區塊全部展開", async ({ page }) => {
  await seedSnapshot(page, TWO_LOANS);
  await expectExpanded(page, RETURNING);

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("清空本地資料").click();
  await downloadPromise;
  await page.getByRole("button", { name: "確認清空" }).click();

  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  await expectExpanded(page, ALL_OPEN);
  await expect(page.getByText("尚未新增負債")).toBeVisible();
  await expect(page.getByText("尚未新增收入")).toBeVisible();
});

test("修正模式不改變展開狀態，收合的摘要顯示被修正快照的數值", async ({
  page,
}) => {
  await seedSnapshot(page, TWO_LOANS, dateDaysAgo(5));
  await page.getByRole("button", { name: "歷史快照", exact: true }).click();

  await page
    .getByRole("button", { name: `修正 ${dateDaysAgo(5)} 的快照` })
    .click();

  await expect(page.getByTestId("snapshot-edit-banner")).toBeVisible();
  await expectExpanded(page, RETURNING);
  await expect(summary(page, "debts")).toHaveText("2 筆・$5,000,000");
});

// 第 7 節「輸入區分段收合」：摘要放不下時換行，不撐寬輸入區
for (const width of [360, 1024]) {
  test(`${width}px：收合的摘要不被截斷，頁面無水平溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedSnapshot(page, TWO_LOANS);

    for (const key of ["debts", "cash-flow", "goals"]) {
      const fits = await summary(page, key).evaluate((el) => {
        const section = el.closest("section")!.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return (
          el.scrollWidth <= el.clientWidth &&
          rect.left >= section.left - 0.5 &&
          rect.right <= section.right + 0.5
        );
      });
      expect(fits).toBe(true);
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

import { expect, test, type Page } from "@playwright/test";
import { expandSnapshotSections } from "./helpers";

// PRD 4.2「金額千分位顯示」「固定儲存列」、第 7 節「版面佈局」、第 9 節 #65a～#65k

const STORAGE_KEY = "my_finance_dashboard_data";
const PHONE = { width: 390, height: 844 };

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

/** 直接寫入 LocalStorage：每筆快照一個 100,000 的現金來源與一筆本息攤還的信貸。 */
async function seedSnapshots(page: Page, daysAgo: number[]) {
  await page.evaluate(
    ({ key, dates }) => {
      const snapshot = (date: string) => ({
        date,
        updatedAt: `${date}T00:00:00.000Z`,
        cashSources: [
          { id: "c1", name: "銀行", amount: 100000, restricted: false },
        ],
        twStockValue: 0,
        usStockValue: 0,
        usStockCurrency: "USD",
        exchangeRate: 0,
        realEstateValue: 0,
        debts: [
          {
            id: "d1",
            name: "信貸",
            category: "信貸",
            principal: 50000,
            annualRate: 0,
            remainingMonths: 0,
            repaymentMethod: "interestOnly",
            collateralValue: 0,
          },
        ],
        incomeSources: [],
        monthlyExpense: 0,
        recurringInvestments: [],
        targetNetWorth: 0,
        targetCashRatio: 0,
      });
      localStorage.setItem(
        key,
        JSON.stringify({ schemaVersion: 8, snapshots: dates.map(snapshot) })
      );
    },
    { key: STORAGE_KEY, dates: daysAgo.map(dateDaysAgo) }
  );
  await page.reload();
  await expect(page.getByTestId("total-assets")).toHaveText("$100,000");
}

const savedSnapshots = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{"snapshots":[]}'),
    STORAGE_KEY
  );

const cashAmount = (page: Page) => page.getByLabel("金額", { exact: true });
const stickyBar = (page: Page) => page.getByTestId("sticky-save-bar");
const stickyMessage = (page: Page) => page.getByTestId("sticky-save-message");
const stickyButton = (page: Page) => page.getByTestId("sticky-save-button");
const jumpToForm = (page: Page) => page.getByTestId("jump-to-form");

/** 輸入區與當下看板在 DOM 中的先後順序。 */
const sectionOrder = (page: Page) =>
  page
    .getByTestId("input-form")
    .evaluate((form) =>
      [...form.parentElement!.children]
        .map((el) => (el as HTMLElement).dataset.testid)
        .filter(Boolean)
    );

// #65a
test("金額千分位：離開欄位後顯示千分位，存檔的數值不變", async ({ page }) => {
  await page.getByText("+ 新增負債").click();
  const principal = page.getByLabel("剩餘本金");
  await principal.fill("5487138");
  await expect(principal).toHaveValue("5487138");

  await principal.blur();
  await expect(principal).toHaveValue("5,487,138");
  await expect(page.getByTestId("total-liabilities")).toHaveText("$5,487,138");

  await page.getByTestId("save-button").click();
  const data = await savedSnapshots(page);
  expect(data.snapshots[0].debts[0].principal).toBe(5487138);

  // 重新整理後仍以千分位顯示
  await page.reload();
  await expect(page.getByLabel("剩餘本金")).toHaveValue("5,487,138");
});

// #65b
test("金額千分位：聚焦時還原為純數字並全選，直接打字覆蓋原值", async ({
  page,
}) => {
  await page.getByText("+ 新增負債").click();
  const principal = page.getByLabel("剩餘本金");
  await principal.fill("5487138");
  await principal.blur();
  await expect(principal).toHaveValue("5,487,138");

  await principal.focus();
  await expect(principal).toHaveValue("5487138");
  expect(
    await principal.evaluate((el: HTMLInputElement) => [
      el.selectionStart,
      el.selectionEnd,
    ])
  ).toEqual([0, 7]);

  await page.keyboard.type("6000000");
  await expect(principal).toHaveValue("6000000");
  await principal.blur();
  await expect(principal).toHaveValue("6,000,000");
});

// #65c
test("金額千分位：小數原樣保留；貼上含逗號的數字時逗號被去除", async ({
  page,
}) => {
  await page.getByText("+ 新增現金來源").click();
  await cashAmount(page).fill("18867.36");
  await cashAmount(page).blur();
  await expect(cashAmount(page)).toHaveValue("18,867.36");

  const twStock = page.locator('label:has-text("台股市值") input');
  await twStock.fill("1,234,567");
  await expect(twStock).toHaveValue("1234567");
  await twStock.blur();
  await expect(twStock).toHaveValue("1,234,567");

  // 18,867.36 + 1,234,567 = 1,253,434.36
  await expect(page.getByTestId("total-assets")).toHaveText("$1,253,434");
});

// #65d
test("390px 已有快照：當下看板排在輸入區之前，「前往輸入區」捲到輸入區", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await seedSnapshots(page, [0]);

  expect(await sectionOrder(page)).toEqual(["dashboard-now", "input-form"]);
  const dashboardBox = await page.getByTestId("dashboard-now").boundingBox();
  const formBox = await page.getByTestId("input-form").boundingBox();
  expect(formBox!.y).toBeGreaterThan(dashboardBox!.y + dashboardBox!.height);
  // 資產配置等其餘區塊在輸入區之後
  const allocationBox = await page
    .getByTestId("asset-allocation-segment-cash")
    .boundingBox();
  expect(allocationBox!.y).toBeGreaterThan(formBox!.y + formBox!.height);

  // 總資產不必捲動就看得到
  await expect(page.getByTestId("total-assets")).toBeInViewport();
  await expect(cashAmount(page)).not.toBeInViewport();

  await jumpToForm(page).click();
  await expect(cashAmount(page)).toBeInViewport();
});

// #65e
test("390px 尚無快照：輸入區在前；存下第一筆快照後對調並回到頁面頂端", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await expect(page.getByTestId("total-assets")).toHaveText("$0");

  expect(await sectionOrder(page)).toEqual(["input-form", "dashboard-now"]);
  await expect(jumpToForm(page)).toHaveCount(0);
  await expect(stickyBar(page)).toHaveCount(0);

  await page.getByText("+ 新增現金來源").click();
  await cashAmount(page).fill("100000");
  await page.evaluate(() => window.scrollTo(0, 600));
  await stickyButton(page).click();

  await expect(stickyMessage(page)).toHaveText("已更新並儲存今日資料。");
  expect(await sectionOrder(page)).toEqual(["dashboard-now", "input-form"]);
  await expect(jumpToForm(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByTestId("total-assets")).toBeInViewport();
});

// #65f
test("1280px 雙欄：輸入區在左、看板在右，不顯示捷徑與固定儲存列", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedSnapshots(page, [0]);

  expect(await sectionOrder(page)).toEqual(["input-form", "dashboard-now"]);
  const formBox = await page.getByTestId("input-form").boundingBox();
  const dashboardBox = await page.getByTestId("dashboard-now").boundingBox();
  expect(dashboardBox!.x).toBeGreaterThan(formBox!.x + formBox!.width);
  expect(dashboardBox!.y).toBe(formBox!.y);
  await expect(jumpToForm(page)).toHaveCount(0);

  await cashAmount(page).fill("200000");
  await expect(page.getByTestId("save-button")).toBeEnabled();
  await expect(stickyBar(page)).toHaveCount(0);

  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toHaveText(
    "已更新並儲存今日資料。"
  );
  await expect(stickyBar(page)).toHaveCount(0);
});

// #65g、#65h
test("390px 固定儲存列：有未存檔編輯才出現，改回原值後消失；可直接存檔", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await seedSnapshots(page, [0]);
  await expect(stickyBar(page)).toHaveCount(0);

  await cashAmount(page).fill("250000");
  await expect(stickyMessage(page)).toHaveText("有未儲存的變更");
  await expect(stickyButton(page)).toHaveText("更新儀表板");
  // 固定在畫面底部，且不造成水平溢出
  await expect(stickyBar(page)).toBeInViewport();
  const barBox = await stickyBar(page).boundingBox();
  expect(Math.round(barBox!.y + barBox!.height)).toBe(PHONE.height);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true);

  // 改回已存檔的數值：不再有可存的變更
  await cashAmount(page).fill("100000");
  await expect(stickyBar(page)).toHaveCount(0);

  await cashAmount(page).fill("250000");
  await stickyButton(page).click();
  await expect(stickyMessage(page)).toHaveText("已更新並儲存今日資料。");
  await expect(stickyButton(page)).toHaveCount(0);
  const data = await savedSnapshots(page);
  expect(data.snapshots).toHaveLength(1);
  expect(data.snapshots[0].cashSources[0].amount).toBe(250000);

  // 訊息約 4 秒後消失，整列跟著收起
  await expect(stickyBar(page)).toHaveCount(0, { timeout: 8000 });
});

test("390px 固定儲存列顯示時，頁面最底部的內容不被遮住", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seedSnapshots(page, [0]);
  await cashAmount(page).fill("250000");
  await expect(stickyBar(page)).toBeVisible();

  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  const footerBox = await page.locator("footer").boundingBox();
  const barBox = await stickyBar(page).boundingBox();
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(barBox!.y);
});

// #65i
test("390px 系統帶入、尚未動過的今日草稿不顯示固定儲存列", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seedSnapshots(page, [1]);

  // 今日草稿由昨天的快照帶入：可以存檔，但使用者沒動過，不主動提醒
  await expect(page.getByTestId("save-button")).toBeEnabled();
  await expect(stickyBar(page)).toHaveCount(0);

  await cashAmount(page).fill("120000");
  await expect(stickyButton(page)).toBeVisible();
});

// #65j
test("390px 修正模式：捲到輸入區，固定儲存列改為「儲存修正」", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await seedSnapshots(page, [10, 0]);
  const pastDate = dateDaysAgo(10);
  await expandSnapshotSections(page);

  await page.getByRole("button", { name: `修正 ${pastDate} 的快照` }).click();
  await expect(page.getByTestId("snapshot-edit-banner")).toBeInViewport();
  // 只是載入該日快照、尚未修改：不顯示
  await expect(stickyBar(page)).toHaveCount(0);

  await cashAmount(page).fill("80000");
  await expect(stickyMessage(page)).toHaveText(
    `修正 ${pastDate}：有未儲存的變更`
  );
  await expect(stickyButton(page)).toHaveText("儲存修正");

  await stickyButton(page).click();
  await expect(stickyMessage(page)).toHaveText(`已更新 ${pastDate} 的快照。`);
  await expect(page.getByTestId("snapshot-edit-banner")).toHaveCount(0);
  const data = await savedSnapshots(page);
  expect(data.snapshots).toHaveLength(2);
  expect(data.snapshots[0].cashSources[0].amount).toBe(80000);
  expect(data.snapshots[1].cashSources[0].amount).toBe(100000);
});

// #65k
for (const width of [390, 1024]) {
  test(`${width}px 負債卡：千分位後的九位數本金不被截斷`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedSnapshots(page, [0]);

    const principal = page.getByLabel("剩餘本金");
    await principal.fill("123456789");
    await principal.blur();
    await expect(principal).toHaveValue("123,456,789");
    expect(
      await principal.evaluate((el) => el.scrollWidth <= el.clientWidth)
    ).toBe(true);

    // 本金獨佔一行，年利率與剩餘期數排在下一行
    const principalBox = await principal.boundingBox();
    const rateBox = await page.getByLabel("年利率").boundingBox();
    const monthsBox = await page.getByLabel("剩餘還款期數").boundingBox();
    expect(rateBox!.y).toBeGreaterThan(principalBox!.y + principalBox!.height);
    expect(monthsBox!.y).toBe(rateBox!.y);
  });
}

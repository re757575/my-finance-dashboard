import { expect, test, type Page } from "@playwright/test";
import { dateDaysAgo, makeSnapshot, seedFinanceData } from "./helpers";

// PRD 4.2「趨勢圖分組分頁」、第 7 節、第 9 節 #58a～#58j

const ASSET_CHARTS = ["淨資產趨勢", "現金趨勢", "股票趨勢"];
const LIABILITY_CHARTS = ["負債比趨勢", "資產負債對比", "每月應還款趨勢"];
const ALLOCATION_CHARTS = ["資產配置趨勢", "儲蓄率趨勢"];

type TrendTabName = "資產" | "負債" | "配置與儲蓄";

/** 直接寫入 LocalStorage：每筆快照都有現金、台股、負債與收支，八張趨勢圖皆有資料可畫。 */
async function seedHistory(page: Page, daysAgo: number[]) {
  await seedFinanceData(
    page,
    daysAgo.map((n, i) =>
      makeSnapshot(dateDaysAgo(n), {
        cashSources: [
          {
            id: "c1",
            name: "銀行",
            amount: 100000 + i * 10000,
            restricted: false,
          },
        ],
        twStockValue: 200000 + i * 5000,
        debts: [
          {
            id: "d1",
            name: "信貸",
            category: "信貸",
            principal: 120000 - i * 12000,
            annualRate: 0,
            remainingMonths: 12,
            repaymentMethod: "amortizing",
            collateralValue: 0,
          },
        ],
        incomeSources: [{ id: "i1", name: "薪資", amount: 100000 }],
        monthlyExpense: 40000,
      })
    )
  );
}

const trendTab = (page: Page, name: TrendTabName) =>
  page.getByRole("tab", { name, exact: true });

/** 目前分頁內的圖表卡片標題（依畫面順序）。 */
const chartTitles = (page: Page) =>
  page.getByRole("tabpanel").locator("> div > div:first-child > p:first-child");

/** 目前分頁內的圖表（SVG）。 */
const charts = (page: Page) => page.getByRole("tabpanel").getByRole("img");

async function expectOnlyCharts(page: Page, expected: string[]) {
  await expect(chartTitles(page)).toHaveText(expected);
  const others = [
    ...ASSET_CHARTS,
    ...LIABILITY_CHARTS,
    ...ALLOCATION_CHARTS,
  ].filter((title) => !expected.includes(title));
  for (const title of others) {
    await expect(
      page.getByRole("button", { name: `${title}全螢幕檢視` })
    ).toHaveCount(0);
  }
}

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

// PRD 第 9 節 #58a、#58b、#58c
test("趨勢圖分頁：預設顯示「資產」，切換後只顯示該分頁的圖表", async ({
  page,
}) => {
  await seedHistory(page, [10, 5, 2]);

  await expect(page.getByRole("tablist", { name: "趨勢圖分組" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText([
    "資產",
    "負債",
    "配置與儲蓄",
  ]);
  await expect(trendTab(page, "資產")).toHaveAttribute("aria-selected", "true");
  await expect(trendTab(page, "負債")).toHaveAttribute(
    "aria-selected",
    "false"
  );
  await expectOnlyCharts(page, ASSET_CHARTS);

  await trendTab(page, "負債").click();
  await expect(trendTab(page, "負債")).toHaveAttribute("aria-selected", "true");
  await expect(trendTab(page, "資產")).toHaveAttribute(
    "aria-selected",
    "false"
  );
  await expect(page.getByRole("tabpanel", { name: "負債" })).toBeVisible();
  await expectOnlyCharts(page, LIABILITY_CHARTS);

  await trendTab(page, "配置與儲蓄").click();
  await expect(trendTab(page, "配置與儲蓄")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expectOnlyCharts(page, ALLOCATION_CHARTS);

  await trendTab(page, "資產").click();
  await expectOnlyCharts(page, ASSET_CHARTS);
});

// PRD 第 9 節 #58d
test("趨勢圖分頁：鍵盤左右方向鍵切換分頁", async ({ page }) => {
  await seedHistory(page, [10, 5, 2]);

  await trendTab(page, "資產").focus();
  await page.keyboard.press("ArrowRight");
  await expect(trendTab(page, "負債")).toBeFocused();
  await expect(trendTab(page, "負債")).toHaveAttribute("aria-selected", "true");
  await expectOnlyCharts(page, LIABILITY_CHARTS);

  await page.keyboard.press("ArrowRight");
  await expect(trendTab(page, "配置與儲蓄")).toBeFocused();
  await expectOnlyCharts(page, ALLOCATION_CHARTS);

  // 焦點是非同步移動的，每按一次都先等焦點落定再按下一次
  await page.keyboard.press("ArrowLeft");
  await expect(trendTab(page, "負債")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(trendTab(page, "資產")).toBeFocused();
  await expect(trendTab(page, "資產")).toHaveAttribute("aria-selected", "true");
  await expect(trendTab(page, "負債")).toHaveAttribute(
    "aria-selected",
    "false"
  );
  await expectOnlyCharts(page, ASSET_CHARTS);
});

// PRD 第 9 節 #58e
test("趨勢圖分頁：範圍下拉選單對每個分頁都有效，切換範圍不會離開目前分頁", async ({
  page,
}) => {
  // 預設範圍（90 天）涵蓋 4 筆；7 天只涵蓋最近 2 筆
  await seedHistory(page, [20, 10, 5, 2]);
  const range = page.getByLabel("趨勢圖範圍");

  await trendTab(page, "負債").click();
  await expect(charts(page)).toHaveCount(3);
  for (const chart of await charts(page).all()) {
    await expect(chart).toHaveAccessibleName(/共 4 筆資料/);
  }

  await range.selectOption("7");
  await expect(trendTab(page, "負債")).toHaveAttribute("aria-selected", "true");
  await expect(charts(page)).toHaveCount(3);
  for (const chart of await charts(page).all()) {
    await expect(chart).toHaveAccessibleName(/共 2 筆資料/);
  }

  // 切到其他分頁：範圍選單仍在標題列，且沿用同一個範圍
  await trendTab(page, "配置與儲蓄").click();
  await expect(range).toHaveValue("7");
  await expect(charts(page)).toHaveCount(2);
  for (const chart of await charts(page).all()) {
    await expect(chart).toHaveAccessibleName(/共 2 筆資料/);
  }

  await trendTab(page, "資產").click();
  await expect(range).toHaveValue("7");
  await expect(charts(page)).toHaveCount(3);
  for (const chart of await charts(page).all()) {
    await expect(chart).toHaveAccessibleName(/共 2 筆資料/);
  }
});

// PRD 第 9 節 #58f
test("趨勢圖分頁：選取的分頁不寫入 LocalStorage，重新整理後回到「資產」", async ({
  page,
}) => {
  await seedHistory(page, [10, 5, 2]);
  const dumpStorage = () =>
    page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
  const before = await dumpStorage();

  await trendTab(page, "配置與儲蓄").click();
  await expectOnlyCharts(page, ALLOCATION_CHARTS);
  expect(await dumpStorage()).toBe(before);

  await page.reload();
  await expect(trendTab(page, "資產")).toHaveAttribute("aria-selected", "true");
  await expectOnlyCharts(page, ASSET_CHARTS);
});

// PRD 第 9 節 #58h：分頁後每張圖既有的 Tooltip、全螢幕展開、增減比對行為不變
test("趨勢圖分頁：非預設分頁的圖表仍可顯示 Tooltip、增減比對並全螢幕展開", async ({
  page,
}) => {
  await seedHistory(page, [10, 5, 2]);

  await trendTab(page, "負債").click();
  const panel = page.getByRole("tabpanel");

  // 每月應還款：10,000 → 9,000 → 8,000，最新一筆比上一筆減少 $1,000
  const paymentCard = panel
    .locator("> div")
    .filter({ hasText: "每月應還款趨勢" });
  await expect(paymentCard).toContainText("$8,000");
  await expect(paymentCard).toContainText("▼ $1,000 (-11.1%)");

  const barCard = panel.locator("> div").filter({ hasText: "資產負債對比" });
  await barCard.getByTestId("chart-node-1").click();
  await expect(barCard.getByTestId("chart-tooltip")).toBeVisible();

  await page.getByRole("button", { name: "資產負債對比全螢幕檢視" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: /資產負債對比長條圖，共 3 筆資料/ })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // 關閉全螢幕後仍停留在原本的分頁
  await expect(trendTab(page, "負債")).toHaveAttribute("aria-selected", "true");
});

// PRD 第 7 節、第 9 節 #58i、#58j
test("趨勢圖分頁：390px 窄螢幕分頁列不換行、不溢出，選取狀態不只靠顏色", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedHistory(page, [10, 5, 2]);

  const tablist = page.getByRole("tablist", { name: "趨勢圖分組" });
  await tablist.scrollIntoViewIfNeeded();
  const listBox = (await tablist.boundingBox())!;
  expect(listBox.x).toBeGreaterThanOrEqual(0);
  expect(listBox.x + listBox.width).toBeLessThanOrEqual(390);

  // 三個分頁在同一列、都在分頁列範圍內，文字沒有被截斷
  const boxes = [];
  for (const name of ["資產", "負債", "配置與儲蓄"] as const) {
    const tab = trendTab(page, name);
    boxes.push((await tab.boundingBox())!);
    expect(await tab.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true
    );
  }
  expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
  expect(boxes[0].x).toBeGreaterThanOrEqual(listBox.x);
  expect(boxes[2].x + boxes[2].width).toBeLessThanOrEqual(
    listBox.x + listBox.width + 0.5
  );
  expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x + 0.5);
  expect(boxes[1].x + boxes[1].width).toBeLessThanOrEqual(boxes[2].x + 0.5);

  // 頁面沒有水平捲動，範圍選單仍在畫面內
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true);
  await expect(page.getByLabel("趨勢圖範圍")).toBeInViewport();

  // 選取中的分頁有底線且字重較粗；未選取的沒有底線（底線為透明）
  const style = (name: TrendTabName) =>
    trendTab(page, name).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        underline: s.borderBottomColor !== "rgba(0, 0, 0, 0)",
        weight: Number(s.fontWeight),
      };
    });
  const selected = await style("資產");
  const unselected = await style("負債");
  expect(selected.underline).toBe(true);
  expect(unselected.underline).toBe(false);
  expect(selected.weight).toBeGreaterThan(unselected.weight);
});

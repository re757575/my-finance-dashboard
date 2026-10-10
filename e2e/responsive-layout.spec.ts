import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

// PRD 第 7 節「版面佈局」：1024px 以上雙欄、以下單欄；窄欄位不截斷內容

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 全功能、60 筆月底快照的虛構測試資料（全專案共用，見 CLAUDE.md「測試」章節）
const financeDataFixture = path.join(
  __dirname,
  "../fixtures/finance-data.json"
);

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

async function importFixture(page: Page) {
  await page.setInputFiles('input[type="file"]', financeDataFixture);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);
  await expect(page.getByLabel("來源名稱").first()).toBeVisible();
}

/**
 * 版面測試用範例資料：快照日期會平移到最新一筆落在今天，今日表單直接帶入該筆數值，
 * 不會像匯入備份那樣依經過的月數估算負債本金，欄位內容不受執行當天日期影響。
 */
async function loadDemo(page: Page) {
  await page.getByRole("button", { name: "載入範例資料" }).click();
  await expect(page.getByLabel("來源名稱").first()).toBeVisible();
}

const SUMMARY_TEST_IDS = ["total-assets", "total-liabilities", "net-worth"];

/** 輸入框內容是否完整顯示（沒有被欄寬截斷）。 */
async function expectNotClipped(inputs: Locator) {
  const count = await inputs.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    await expect(input).not.toHaveValue("");
    expect(
      await input.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `第 ${i + 1} 個輸入框「${await input.inputValue()}」被截斷`
    ).toBe(true);
  }
}

/** 三大指標卡的數字是否留在卡片內（文字右緣不超過卡片右緣）。 */
async function expectSummaryInsideCards(page: Page) {
  for (const testId of SUMMARY_TEST_IDS) {
    const overflow = await page.getByTestId(testId).evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return (
        range.getBoundingClientRect().right -
        el.parentElement!.getBoundingClientRect().right
      );
    });
    expect(overflow, `${testId} 的數字超出卡片`).toBeLessThanOrEqual(0);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true);
}

/** 頁面上所有原生下拉選單的字級（px）。 */
async function selectFontSizes(page: Page) {
  const sizes = await page
    .locator("select")
    .evaluateAll((selects) =>
      selects.map((el) => parseFloat(getComputedStyle(el).fontSize))
    );
  expect(sizes.length).toBeGreaterThan(1);
  return sizes;
}

/** 各筆負債的攤還切換鈕都不折行，且「切換鈕＋該筆每月應還」那一列高度一致。 */
async function expectConsistentRepaymentRows(page: Page) {
  const heights = await page
    .getByRole("group", { name: "攤還方式" })
    .evaluateAll((groups) =>
      groups.map((group) => ({
        toggle: Math.round(group.getBoundingClientRect().height),
        row: Math.round(group.parentElement!.getBoundingClientRect().height),
      }))
    );
  expect(heights.length).toBeGreaterThan(1);
  for (const { toggle, row } of heights) {
    // 單行文字的切換鈕約 26px；折成兩行會超過 36px
    expect(toggle).toBeLessThan(32);
    expect(row).toBe(heights[0].row);
  }
}

test("820px 平板寬度：改為單欄，輸入欄位不被截斷、指標數字不超出卡片", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await loadDemo(page);

  // 單欄：看板排在輸入區下方，而不是右側
  const saveBox = await page.getByTestId("save-button").boundingBox();
  const assetsBox = await page.getByTestId("total-assets").boundingBox();
  expect(assetsBox!.y).toBeGreaterThan(saveBox!.y);

  await expectNotClipped(page.getByLabel("來源名稱"));
  await expectNotClipped(page.getByLabel("收入名稱"));
  await expectNotClipped(page.getByLabel("定期定額名稱"));
  await expectNotClipped(page.getByLabel("剩餘本金"));
  await expectSummaryInsideCards(page);
  await expectConsistentRepaymentRows(page);
  await expectNoHorizontalOverflow(page);
});

test("1024px 桌面寬度：維持雙欄，左欄的現金來源名稱獨佔一行且完整顯示", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await loadDemo(page);

  // 雙欄：看板在輸入區右側
  const nameBox = await page.getByLabel("來源名稱").first().boundingBox();
  const assetsBox = await page.getByTestId("total-assets").boundingBox();
  expect(assetsBox!.x).toBeGreaterThan(nameBox!.x + nameBox!.width);

  // 名稱在上、金額在下
  const amountBox = await page.getByLabel("金額").first().boundingBox();
  expect(amountBox!.y).toBeGreaterThan(nameBox!.y + nameBox!.height - 1);

  await expectNotClipped(page.getByLabel("來源名稱"));
  await expectNotClipped(page.getByLabel("收入名稱"));
  await expectNotClipped(page.getByLabel("定期定額名稱"));
  await expectNotClipped(page.getByLabel("剩餘本金"));
  await expectSummaryInsideCards(page);
  await expectConsistentRepaymentRows(page);
  await expectNoHorizontalOverflow(page);

  // 桌面寬度的下拉選單維持 14px
  for (const size of await selectFontSizes(page)) expect(size).toBe(14);
});

test("390px 窄螢幕：各清單名稱完整顯示，負債卡排版一致，不造成水平溢出", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);

  const nameBox = await page.getByLabel("來源名稱").first().boundingBox();
  const amountBox = await page.getByLabel("金額").first().boundingBox();
  expect(amountBox!.y).toBeGreaterThan(nameBox!.y + nameBox!.height - 1);

  await expectNotClipped(page.getByLabel("來源名稱"));
  await expectNotClipped(page.getByLabel("收入名稱"));
  await expectNotClipped(page.getByLabel("定期定額名稱"));
  await expectNotClipped(page.getByLabel("剩餘本金"));
  await expectSummaryInsideCards(page);
  await expectConsistentRepaymentRows(page);
  await expectNoHorizontalOverflow(page);

  // 手機上下拉選單至少 16px，否則 iOS Safari 聚焦時會自動放大頁面
  for (const size of await selectFontSizes(page)) {
    expect(size).toBeGreaterThanOrEqual(16);
  }
});

test("320px 極窄螢幕：下拉選單不超出畫面，快照比較的「到」與選單一起換行", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await loadDemo(page);
  await expectNoHorizontalOverflow(page);

  // 靠右對齊的列若放不下會往左溢出（不產生捲軸），需另外檢查左緣
  for (const label of ["AI 分析提示詞模式", "比較基準日", "比較對象日"]) {
    const box = await page.getByLabel(label).boundingBox();
    expect(box!.x, `${label} 超出畫面左緣`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${label} 超出畫面右緣`).toBeLessThanOrEqual(
      320
    );
  }

  // 「到」與比較對象日選單在同一行（換行時不被拆開）
  const targetSelect = page.getByLabel("比較對象日");
  const selectBox = await targetSelect.boundingBox();
  const labelBox = await targetSelect
    .locator("xpath=preceding-sibling::span[1]")
    .boundingBox();
  expect(labelBox!.y).toBeGreaterThanOrEqual(selectBox!.y);
  expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(
    selectBox!.y + selectBox!.height
  );
  expect(labelBox!.x).toBeLessThan(selectBox!.x);
});

test("歷史快照：淨資產與總資產分開顯示，不黏在一起", async ({ page }) => {
  await importFixture(page);
  const row = page.getByTestId("snapshot-row-2026-09-30");
  const netWorth = row.getByText(/^淨資產 \$[\d,]+$/);
  const totalAssets = row.getByText(/^總資產 \$[\d,]+$/);
  await expect(netWorth).toBeVisible();
  await expect(totalAssets).toBeVisible();

  // 桌面寬度：同一行並排，中間留有間距
  const netWorthBox = await netWorth.boundingBox();
  const totalAssetsBox = await totalAssets.boundingBox();
  expect(totalAssetsBox!.y).toBe(netWorthBox!.y);
  expect(
    totalAssetsBox!.x - (netWorthBox!.x + netWorthBox!.width)
  ).toBeGreaterThanOrEqual(8);

  // 390px：分成兩行，修正／刪除按鈕仍在同一列右側，各列高度一致
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const upper = await netWorth.boundingBox();
      const lower = await totalAssets.boundingBox();
      return lower!.y - upper!.y;
    })
    .toBeGreaterThan(0);
  const editBox = await row
    .getByRole("button", { name: "修正 2026-09-30 的快照" })
    .boundingBox();
  const stackedBox = await netWorth.boundingBox();
  expect(editBox!.x).toBeGreaterThan(stackedBox!.x + stackedBox!.width);

  const rowHeights = await page
    .locator('[data-testid^="snapshot-row-"]')
    .evaluateAll((rows) =>
      rows
        // 排除只有「刪除」一顆按鈕的今日列
        .filter((el) => el.querySelectorAll("button").length === 2)
        .map((el) => Math.round(el.getBoundingClientRect().height))
    );
  expect(rowHeights.length).toBeGreaterThan(1);
  // 最後一列沒有下分隔線，容許 1px 差異
  expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThanOrEqual(
    1
  );
  await expectNoHorizontalOverflow(page);
});

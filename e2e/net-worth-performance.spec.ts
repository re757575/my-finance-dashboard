import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// PRD 4.2「淨資產成長率與最大回撤」、5.11 節、第 9 節 #14k～#14o

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 全功能、60 筆月底快照的虛構測試資料（2021-10-31～2026-09-30，全專案共用，見 CLAUDE.md「測試」章節）
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
}

const summary = (page: Page) => page.getByTestId("net-worth-performance");
const period = (page: Page) => page.getByTestId("net-worth-performance-period");
const change = (page: Page) => page.getByTestId("net-worth-change-value");
const growthLabel = (page: Page) => page.getByTestId("net-worth-growth-label");
const growthValue = (page: Page) => page.getByTestId("net-worth-growth-value");
const growthNote = (page: Page) => page.getByTestId("net-worth-growth-note");
const drawdownValue = (page: Page) =>
  page.getByTestId("net-worth-drawdown-value");
const drawdownDetail = (page: Page) =>
  page.getByTestId("net-worth-drawdown-detail");

test("尚無任何快照時不顯示成長率與最大回撤摘要", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "歷史趨勢" })).toBeVisible();
  await expect(summary(page)).toHaveCount(0);
});

// 「全部」範圍不受執行當天日期影響：2021-10-31 $5,831,965 → 2026-09-30 $12,351,781，相隔 1795 天
test("匯入全功能 fixture：選「全部」顯示年化成長率、淨資產變化與最大回撤", async ({
  page,
}) => {
  await importFixture(page);
  await page.getByLabel("趨勢圖範圍").selectOption("all");

  await expect(summary(page)).toBeVisible();
  await expect(period(page)).toHaveText(
    "統計期間 2021-10-31 ～ 2026-09-30（1,795 天）"
  );
  await expect(change(page)).toHaveText("▲ $6,519,816");
  // (12,351,780.58 ÷ 5,831,964.62)^(365.25 ÷ 1795) − 1 = 16.5%
  await expect(growthLabel(page)).toHaveText("年化成長率");
  await expect(growthValue(page)).toHaveText("▲ 16.5%");
  await expect(growthNote(page)).toHaveText("期間累計 +111.8%");
  // (7,430,083.17 − 7,236,156.14) ÷ 7,430,083.17 = 2.6%
  await expect(drawdownValue(page)).toHaveText("▼ 2.6%");
  await expect(drawdownDetail(page)).toContainText("下跌 $193,927");
  await expect(drawdownDetail(page)).toContainText("2023-06-30 → 2023-08-31");
  await expect(page.getByTestId("net-worth-drawdown-recovery")).toHaveText(
    "已回復"
  );
  await expect(summary(page)).toContainText(
    "淨資產變化包含儲蓄投入與負債償還，不等於投資報酬率"
  );
  await expect(summary(page)).not.toContainText(/NaN|Infinity/);

  // 摘要位在範圍下拉選單之下、分頁列之上
  const rangeBox = await page.getByLabel("趨勢圖範圍").boundingBox();
  const summaryBox = await summary(page).boundingBox();
  const tabsBox = await page
    .getByRole("tablist", { name: "趨勢圖分組" })
    .boundingBox();
  expect(rangeBox!.y + rangeBox!.height).toBeLessThanOrEqual(summaryBox!.y);
  expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(tabsBox!.y);
});

test("匯入全功能 fixture：公式說明顯示代入實際數值的計算過程", async ({
  page,
}) => {
  await importFixture(page);
  await page.getByLabel("趨勢圖範圍").selectOption("all");

  await page.getByLabel("淨資產成長率與最大回撤計算公式說明").click();

  const content = page.getByTestId("formula-info-content");
  await expect(content).toContainText(
    "年化成長率 =（期末 ÷ 期初）^(365.25 ÷ 天數) − 1"
  );
  await expect(content).toContainText(
    "($12,351,781 ÷ $5,831,965)^(365.25 ÷ 1795) − 1 = 16.5%"
  );
  await expect(content).toContainText(
    "($12,351,781 − $5,831,965) ÷ $5,831,965 × 100% = 111.8%"
  );
  await expect(content).toContainText(
    "($7,430,083 − $7,236,156) ÷ $7,430,083 × 100% = 2.6%"
  );
});

test("匯入全功能 fixture：切換趨勢圖範圍時摘要跟著重算，範圍內少於 2 筆時不顯示", async ({
  page,
}) => {
  // 固定今天的日期：「最近 N 天」「今年以來」的起算日都從今天推算，斷言才不會隨執行日期改變
  await page.clock.install({ time: new Date("2026-10-03T10:00:00") });
  await page.reload();
  await importFixture(page);

  const range = page.getByLabel("趨勢圖範圍");

  // 預設 90 天：2026-07-06 起，含 07-31、08-31、09-30 三筆（61 天），一路上升沒有回撤
  await expect(range).toHaveValue("90");
  await expect(period(page)).toHaveText(
    "統計期間 2026-07-31 ～ 2026-09-30（61 天）"
  );
  await expect(change(page)).toHaveText("▲ $465,723");
  await expect(growthLabel(page)).toHaveText("期間成長率");
  await expect(growthValue(page)).toHaveText("▲ 3.9%");
  await expect(growthNote(page)).toHaveText("未滿 1 年不年化");
  await expect(drawdownValue(page)).toHaveText("期間內沒有回撤");

  // 1 年：2025-10-04 起，含 2025-10-31～2026-09-30 共 12 筆；首末相隔 334 天，仍未滿 1 年
  await range.selectOption({ label: "1 年" });
  await expect(period(page)).toHaveText(
    "統計期間 2025-10-31 ～ 2026-09-30（334 天）"
  );
  await expect(change(page)).toHaveText("▲ $2,286,405");
  await expect(growthLabel(page)).toHaveText("期間成長率");
  await expect(growthValue(page)).toHaveText("▲ 22.7%");
  await expect(growthNote(page)).toHaveText("未滿 1 年不年化");
  await expect(drawdownValue(page)).toHaveText("▼ 0.3%");
  await expect(drawdownDetail(page)).toContainText("2026-03-31 → 2026-04-30");

  // 今年以來：2026-01-31～2026-09-30 共 9 筆（242 天）
  await range.selectOption({ label: "今年以來" });
  await expect(period(page)).toHaveText(
    "統計期間 2026-01-31 ～ 2026-09-30（242 天）"
  );
  await expect(growthValue(page)).toHaveText("▲ 13.2%");

  // 全部：滿 1 年，改顯示年化成長率
  await range.selectOption({ label: "全部" });
  await expect(growthLabel(page)).toHaveText("年化成長率");
  await expect(growthValue(page)).toHaveText("▲ 16.5%");
  await expect(drawdownValue(page)).toHaveText("▼ 2.6%");

  // 30 天／7 天：範圍內只有 2026-09-30 一筆，摘要不顯示，趨勢圖為既有的空狀態
  for (const label of ["30 天", "7 天"]) {
    await range.selectOption({ label });
    await expect(summary(page)).toHaveCount(0);
    await expect(
      page.getByText("持續使用滿 2 天即可查看趨勢").first()
    ).toBeVisible();
  }

  // 切回有資料的範圍後重新出現
  await range.selectOption({ label: "全部" });
  await expect(growthValue(page)).toHaveText("▲ 16.5%");
});

test("匯入全功能 fixture：摘要只看已存檔快照，不含今日未存檔的草稿，切換分頁也不受影響", async ({
  page,
}) => {
  await importFixture(page);
  await page.getByLabel("趨勢圖範圍").selectOption("all");
  await expect(change(page)).toHaveText("▲ $6,519,816");

  // 修改今日草稿（尚未按「更新儀表板」）：看板即時變動，但摘要維持以已存檔快照計算
  const netWorthBefore = await page.getByTestId("net-worth").textContent();
  await page.locator('label:has-text("台股市值") input').fill("1");
  await expect(page.getByTestId("net-worth")).not.toHaveText(netWorthBefore!);
  await expect(period(page)).toHaveText(
    "統計期間 2021-10-31 ～ 2026-09-30（1,795 天）"
  );
  await expect(change(page)).toHaveText("▲ $6,519,816");
  await expect(growthValue(page)).toHaveText("▲ 16.5%");

  // 摘要不屬於任何一個分頁
  await page.getByRole("tab", { name: "負債", exact: true }).click();
  await expect(growthValue(page)).toHaveText("▲ 16.5%");
  await page.getByRole("tab", { name: "配置與儲蓄", exact: true }).click();
  await expect(drawdownValue(page)).toHaveText("▼ 2.6%");
});

test("匯入全功能 fixture：「定期回顧報告」提示詞列出與摘要一致的成長率與最大回撤", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await importFixture(page);
  await page.getByLabel("趨勢圖範圍").selectOption("all");
  await expect(growthValue(page)).toHaveText("▲ 16.5%");

  await page.getByLabel("AI 分析提示詞模式").selectOption("periodic-review");
  await page.getByTestId("copy-prompt-button").click();
  await expect(page.getByTestId("copy-prompt-message")).toContainText(
    "已複製到剪貼簿"
  );
  const prompt = await page.evaluate(() => navigator.clipboard.readText());

  expect(prompt).toContain(
    "- 淨資產年化成長率（CAGR）：+16.5%（期間 1795 天；淨資產變化含儲蓄投入與負債償還，不等於投資報酬率）"
  );
  expect(prompt).toContain(
    "- 最大回撤：-2.6%（2023-06-30 高點 $7,430,083 → 2023-08-31 低點 $7,236,156，已回復）"
  );

  // 其他模式不加入這兩行
  await page.getByLabel("AI 分析提示詞模式").selectOption("health-checkup");
  await page.getByTestId("copy-prompt-button").click();
  await expect(page.getByTestId("copy-prompt-message")).toContainText(
    "已複製到剪貼簿"
  );
  const healthPrompt = await page.evaluate(() =>
    navigator.clipboard.readText()
  );
  expect(healthPrompt).toContain("## 今日財務總覽");
  expect(healthPrompt).not.toContain("回顧期間");
  expect(healthPrompt).not.toContain("最大回撤");
});

test("390px 窄螢幕：摘要改為單欄堆疊，不造成水平溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importFixture(page);
  await page.getByLabel("趨勢圖範圍").selectOption("all");
  await expect(growthValue(page)).toHaveText("▲ 16.5%");

  // 頁面與摘要卡本身都沒有水平捲軸
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true);
  expect(
    await summary(page).evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true);
  const box = await summary(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);

  // 三項指標由上而下堆疊
  const changeBox = await change(page).boundingBox();
  const growthBox = await growthValue(page).boundingBox();
  const drawdownBox = await drawdownValue(page).boundingBox();
  expect(growthBox!.y).toBeGreaterThan(changeBox!.y);
  expect(drawdownBox!.y).toBeGreaterThan(growthBox!.y);
  expect(growthBox!.x).toBe(changeBox!.x);
});

test("深色模式：摘要卡使用深色卡片底色", async ({ page }) => {
  await importFixture(page);
  await page.getByLabel("趨勢圖範圍").selectOption("all");
  await expect(summary(page)).toBeVisible();
  const lightBackground = await summary(page).evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  expect(lightBackground).toBe("rgb(255, 255, 255)");

  await page.getByLabel("顯示主題").selectOption("dark");

  await expect(page.locator("html")).toHaveClass(/dark/);
  const darkBackground = await summary(page).evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  expect(darkBackground).not.toBe(lightBackground);
});

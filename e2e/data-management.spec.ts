import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleBackup = path.join(__dirname, "fixtures/sample-backup.json");
const corruptedBackup = path.join(__dirname, "fixtures/corrupted-backup.json");
// 全功能、60 筆月底快照的虛構測試資料（全專案共用，見 CLAUDE.md「測試」章節）
const financeDataFixture = path.join(
  __dirname,
  "../fixtures/finance-data.json"
);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

// PRD 第 9 節 #17：匯出純前端觸發下載
test("匯出備份會觸發檔案下載", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("匯出備份").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^my-finance-dashboard-backup-\d{8}\.json$/
  );
});

// PRD 第 9 節 #18：匯入前需二次確認，確認後覆蓋現有資料並依最新快照預帶表單
test("匯入合法備份檔：二次確認後覆蓋資料", async ({ page }) => {
  await page.setInputFiles('input[type="file"]', sampleBackup);

  await expect(page.getByText("確認匯入備份？")).toBeVisible();
  await page.getByText("確認覆蓋匯入").click();

  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);
  await expect(page.getByTestId("total-assets")).toHaveText("$77,000");
  await expect(page.getByLabel("來源名稱")).toHaveValue("匯入測試銀行");
});

test("取消匯入時不會覆蓋現有資料", async ({ page }) => {
  await page.setInputFiles('input[type="file"]', sampleBackup);
  await expect(page.getByText("確認匯入備份？")).toBeVisible();

  await page.getByRole("button", { name: "取消" }).click();

  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);
  await expect(page.getByTestId("total-assets")).toHaveText("$0");
});

// PRD 第 6.1 節：資料毀損時視為無法讀取，不覆蓋現有資料
test("匯入毀損檔案顯示錯誤訊息，對話框保持開啟", async ({ page }) => {
  await page.setInputFiles('input[type="file"]', corruptedBackup);
  await page.getByText("確認覆蓋匯入").click();

  await expect(page.getByText("確認匯入備份？")).toBeVisible();
  await expect(page.getByText(/無法讀取|版本不相容/)).toBeVisible();
});

// PRD 4.2 節，決策 Q9 選項 C：清空前強制先匯出備份，再二次確認
test("清空本地資料：強制先觸發匯出，確認後清除所有資料", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("12345");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("清空本地資料").click();
  await downloadPromise;

  await expect(page.getByText("確認清空所有本地資料？")).toBeVisible();
  await page.getByRole("button", { name: "確認清空" }).click();

  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  await expect(page.getByText("尚未新增現金來源")).toBeVisible();
  await expect(page.getByLabel("趨勢圖範圍")).toHaveCount(0);
});

test("取消清空對話框時資料不受影響", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("12345");
  await page.getByTestId("save-button").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("清空本地資料").click();
  await downloadPromise;
  await page.getByRole("button", { name: "取消" }).click();

  await expect(page.getByTestId("total-assets")).toHaveText("$12,345");
});

/** 本機日期字串（與 App 的 getCurrentDate 一致）：今天往前推 n 天。 */
function dateDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 直接寫入 LocalStorage：每個日期（YYYY-MM-DD）一筆快照（現金 123,456），並可指定上次備份時間。 */
async function seedSnapshotDates(
  page: Page,
  dates: string[],
  backupIso: string | null = null
) {
  await page.evaluate(
    ({ dates, backupIso }) => {
      const snapshot = (date: string) => ({
        date,
        updatedAt: `${date}T00:00:00.000Z`,
        cashSources: [
          { id: "c1", name: "秘密銀行", amount: 123456, restricted: false },
        ],
        twStockValue: 0,
        usStockValue: 0,
        usStockCurrency: "USD",
        exchangeRate: 0,
        realEstateValue: 0,
        debts: [],
        incomeSources: [],
        monthlyExpense: 0,
        targetNetWorth: 0,
        targetCashRatio: 0,
      });
      localStorage.setItem(
        "my_finance_dashboard_data",
        JSON.stringify({ schemaVersion: 7, snapshots: dates.map(snapshot) })
      );
      if (backupIso) {
        localStorage.setItem("my_finance_dashboard_last_backup", backupIso);
      }
    },
    { dates, backupIso }
  );
  await page.reload();
}

/** 同 seedSnapshotDates，但快照日期與上次備份時間皆以「今天往前推 n 天」指定。 */
async function seedSnapshots(
  page: Page,
  snapshotDaysAgo: number[],
  lastBackupDaysAgo: number | null
) {
  await seedSnapshotDates(
    page,
    snapshotDaysAgo.map(dateDaysAgo),
    lastBackupDaysAgo === null
      ? null
      : new Date(Date.now() - lastBackupDaysAgo * 86400000).toISOString()
  );
}

// PRD 第 9 節 #45、#45a～#45d：加密匯出後，檔案不含明文；匯入時要求密碼，錯誤密碼不會覆蓋資料
test("加密匯出：檔案不含明文，匯入時需輸入正確密碼才能還原", async ({
  page,
}) => {
  await seedSnapshots(page, [3], null);
  await expect(page.getByTestId("total-assets")).toHaveText("$123,456");

  await page.getByRole("button", { name: "加密匯出" }).click();

  // 密碼太短、或兩次不一致：不下載、對話框保持開啟
  await page.getByLabel("加密密碼", { exact: true }).fill("12345");
  await page.getByLabel("確認加密密碼").fill("12345");
  await page.getByRole("button", { name: "加密並下載" }).click();
  await expect(page.getByTestId("encrypt-error")).toContainText(
    "至少需要 6 個字元"
  );

  await page.getByLabel("加密密碼", { exact: true }).fill("correct-horse");
  await page.getByLabel("確認加密密碼").fill("different-one");
  await page.getByRole("button", { name: "加密並下載" }).click();
  await expect(page.getByTestId("encrypt-error")).toContainText("不一致");

  await page.getByLabel("確認加密密碼").fill("correct-horse");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "加密並下載" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^my-finance-dashboard-backup-\d{8}\.enc\.json$/
  );
  const file = path.join(os.tmpdir(), `e2e-${Date.now()}.enc.json`);
  await download.saveAs(file);
  const content = fs.readFileSync(file, "utf8");
  expect(content).not.toContain("秘密銀行");
  expect(content).not.toContain("123456");
  expect(content).not.toContain("snapshots");
  expect(JSON.parse(content).format).toBe(
    "my-finance-dashboard-encrypted-backup"
  );
  await expect(page.getByTestId("last-backup")).toContainText("今天");

  // 清掉資料後匯入加密檔
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("total-assets")).toHaveText("$0");

  await page.setInputFiles('input[type="file"]', file);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByTestId("import-needs-password")).toBeVisible();

  await page.getByLabel("備份密碼").fill("wrong-password");
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText(/密碼錯誤或備份檔已損毀/)).toBeVisible();
  await expect(page.getByTestId("total-assets")).toHaveText("$0");

  await page.getByLabel("備份密碼").fill("correct-horse");
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByTestId("total-assets")).toHaveText("$123,456");
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);

  fs.unlinkSync(file);
});

// PRD 第 9 節 #45c、#45i：明文備份匯入不會要求密碼
test("匯入明文備份不會出現密碼欄", async ({ page }) => {
  await page.setInputFiles('input[type="file"]', sampleBackup);
  await page.getByText("確認覆蓋匯入").click();

  await expect(page.getByTestId("total-assets")).toHaveText("$77,000");
  await expect(page.getByLabel("備份密碼")).toHaveCount(0);
});

// PRD 第 9 節 #46、#46a：距上次備份超過 30 天才提醒（恰 30 天不提醒）
test("備份提醒：距上次備份 31 天出現橫幅，30 天不出現", async ({ page }) => {
  await seedSnapshots(page, [45, 3], 31);
  await expect(page.getByTestId("backup-reminder")).toContainText(
    "距上次備份已 31 天"
  );
  await expect(page.getByTestId("last-backup")).toContainText("31 天前");

  await seedSnapshots(page, [45, 3], 30);
  await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  await expect(page.getByTestId("last-backup")).toContainText("30 天前");
});

// PRD 第 9 節 #46b、#46c：從未備份者自最早快照起算；匯出後橫幅消失
test("備份提醒：從未備份時以最早快照起算，匯出備份後橫幅消失", async ({
  page,
}) => {
  await seedSnapshots(page, [10, 3], null);
  await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  await expect(page.getByTestId("last-backup")).toContainText("尚未備份");

  await seedSnapshots(page, [45, 3], null);
  await expect(page.getByTestId("backup-reminder")).toContainText(
    "尚未備份過（第一筆資料已存在 45 天）"
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("匯出備份", { exact: true }).click();
  await downloadPromise;

  await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  await expect(page.getByTestId("last-backup")).toContainText("今天");
});

// PRD 第 9 節 #46d：匯入還原不會更新上次備份時間
test("匯入還原不會更新上次備份時間，提醒仍依原本的備份時間顯示", async ({
  page,
}) => {
  await seedSnapshots(page, [45, 3], 40);
  await expect(page.getByTestId("backup-reminder")).toBeVisible();

  await page.setInputFiles('input[type="file"]', sampleBackup);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByTestId("total-assets")).toHaveText("$77,000");

  await expect(page.getByTestId("last-backup")).toContainText("40 天前");
});

// PRD 第 9 節 #46e：清空後移除上次備份紀錄，也不再提醒
test("清空本地資料後，上次備份紀錄一併清除", async ({ page }) => {
  await seedSnapshots(page, [45, 3], 40);

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("清空本地資料").click();
  await downloadPromise;
  await page.getByRole("button", { name: "確認清空" }).click();

  await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  await expect(page.getByTestId("last-backup")).toContainText("尚未備份");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("my_finance_dashboard_last_backup")
    )
  ).toBeNull();
});

// PRD 第 9 節 #47～#47d：資料新鮮度
test("資料新鮮度：今日已更新／數天前／超過 14 天標示過期", async ({ page }) => {
  // 沒有任何快照：不顯示
  await expect(page.getByTestId("data-freshness")).toHaveCount(0);

  await seedSnapshots(page, [5], null);
  await expect(page.getByTestId("data-freshness")).toContainText(
    `距上次更新 5 天（${dateDaysAgo(5)}）`
  );
  await expect(page.getByTestId("data-freshness-stale-badge")).toHaveCount(0);

  // 恰 14 天：不算過期
  await seedSnapshots(page, [14], null);
  await expect(page.getByTestId("data-freshness")).toContainText("14 天");
  await expect(page.getByTestId("data-freshness-stale-badge")).toHaveCount(0);

  // 15 天：過期
  await seedSnapshots(page, [15], null);
  await expect(page.getByTestId("data-freshness")).toContainText("15 天");
  await expect(page.getByTestId("data-freshness-stale-badge")).toHaveText(
    "資料可能已過期"
  );
  await expect(
    page.getByText("請更新股票市值、現金與負債後再存檔")
  ).toBeVisible();

  // PRD 第 9 節 #47c：修改並存檔後立即變為「今日已更新」
  await page.locator('label:has-text("台股市值") input').fill("1000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("data-freshness")).toHaveText("今日已更新");
  await expect(page.getByTestId("data-freshness-stale-badge")).toHaveCount(0);
});

// 共用 fixture：60 筆快照匯入後，歷史清單與趨勢圖都能完整呈現
test("匯入全功能 fixture：歷史快照 60 筆、各看板卡片皆有數值", async ({
  page,
}) => {
  await page.setInputFiles('input[type="file"]', financeDataFixture);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);

  // 歷史快照：預設只顯示最新 10 筆，可展開看到全部 60 筆
  await expect(page.getByTestId("snapshot-row-2026-09-30")).toBeVisible();
  await page.getByRole("button", { name: /顯示全部（60 筆）/ }).click();
  await expect(
    page
      .getByTestId("snapshot-history-list")
      .locator('[data-testid^="snapshot-row-"]')
  ).toHaveCount(60);

  // 看板卡片：有財務語意的指標皆非空值
  await expect(page.getByTestId("total-assets")).not.toHaveText("$0");
  await expect(page.getByTestId("debt-ratio-value")).toBeVisible();
  await expect(page.getByTestId("pledge-maintenance-value")).toBeVisible();
  await expect(page.getByTestId("goal-progress-value")).toBeVisible();
  await expect(page.getByTestId("emergency-fund-value")).toBeVisible();
  await expect(page.getByTestId("total-monthly-debt-payment")).not.toHaveText(
    "$0"
  );
});

test("匯入全功能 fixture：趨勢圖選「全部」會涵蓋 60 筆資料", async ({
  page,
}) => {
  await page.setInputFiles('input[type="file"]', financeDataFixture);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);

  await page.getByLabel("趨勢圖範圍").selectOption("all");
  await expect(
    page.getByRole("img", { name: /折線圖，共 60 筆資料/ }).first()
  ).toBeVisible();
});

// PRD 4.2「趨勢圖範圍選項」、第 9 節 #57a～#57c、#57e、#57f
test("匯入全功能 fixture：趨勢圖範圍六個選項依序排列，1 年／今年以來同步影響趨勢圖與 AI 提示詞", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // 固定今天的日期：各範圍的起算日都從今天推算（fixture 為 2021-10-31～2026-09-30 的月底快照）
  await page.clock.install({ time: new Date("2026-10-03T10:00:00") });
  await page.reload();
  await page.setInputFiles('input[type="file"]', financeDataFixture);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);

  const range = page.getByLabel("趨勢圖範圍");
  const lineChart = (count: number) =>
    page
      .getByRole("img", { name: new RegExp(`折線圖，共 ${count} 筆資料`) })
      .first();
  /** 複製「財務健康檢查」提示詞，回傳剪貼簿內容。 */
  const copyPrompt = async () => {
    await page.getByTestId("copy-prompt-button").click();
    await expect(page.getByTestId("copy-prompt-message")).toHaveText(
      "已複製到剪貼簿，可貼給 AI 分析。"
    );
    return page.evaluate(() => navigator.clipboard.readText());
  };

  await expect(range.locator("option")).toHaveText([
    "7 天",
    "30 天",
    "90 天",
    "1 年",
    "今年以來",
    "全部",
  ]);
  // 預設 90 天：2026-07-06 起，含 07-31、08-31、09-30 三筆
  await expect(range).toHaveValue("90");
  await expect(lineChart(3)).toBeVisible();

  // 1 年：最近 365 天（2025-10-04 起），含 2025-10-31～2026-09-30 共 12 筆
  await range.selectOption({ label: "1 年" });
  await expect(range).toHaveValue("365");
  await expect(lineChart(12)).toBeVisible();
  const yearPrompt = await copyPrompt();
  expect(yearPrompt).toContain("## 近 12 筆歷史趨勢（已儲存資料）");
  expect(yearPrompt).toContain("2025-10-31");
  expect(yearPrompt).not.toContain("2025-09-30");

  // 今年以來：2026-01-01 起，含 2026-01-31～2026-09-30 共 9 筆；前一年 12/31 不納入
  await range.selectOption({ label: "今年以來" });
  await expect(range).toHaveValue("ytd");
  await expect(lineChart(9)).toBeVisible();
  const ytdPrompt = await copyPrompt();
  expect(ytdPrompt).toContain("## 近 9 筆歷史趨勢（已儲存資料）");
  expect(ytdPrompt).toContain("2026-01-31");
  expect(ytdPrompt).not.toContain("2025-12-31");

  // 範圍不影響歷史快照清單與快照比較，也不刪除任何已存檔資料
  await expect(
    page.getByRole("button", { name: /顯示全部（60 筆）/ })
  ).toBeVisible();
  await expect(page.getByLabel("比較基準日").locator("option")).toHaveCount(60);
  const storedCount = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("my_finance_dashboard_data") ?? "{}")
        .snapshots.length
  );
  expect(storedCount).toBe(60);
});

// PRD 4.2「趨勢圖範圍選項」「跨日自動換日」、第 9 節 #57d
test("今年以來：頁面開著跨年後回到前景，改以新年度的 1 月 1 日起算", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-12-31T10:00:00") });
  await page.reload();
  await seedSnapshotDates(page, ["2025-12-31", "2026-06-30", "2026-12-30"]);

  const range = page.getByLabel("趨勢圖範圍");
  const lineChart = (count: number) =>
    page
      .getByRole("img", { name: new RegExp(`折線圖，共 ${count} 筆資料`) })
      .first();

  // 2026 年底：今年以來只含 2026 年的兩筆，前一年 12/31 不納入
  await range.selectOption("ytd");
  await expect(lineChart(2)).toBeVisible();

  // 跨年後回到前景：選項維持「今年以來」，但 2027 年尚無快照，趨勢圖回到空狀態
  await page.clock.setFixedTime(new Date("2027-01-01T09:00:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("目前檢視日期：2027-01-01")).toBeVisible();
  await expect(range).toHaveValue("ytd");
  await expect(page.getByRole("img", { name: /折線圖，共/ })).toHaveCount(0);
  await expect(
    page.getByText("持續使用滿 2 天即可查看趨勢").first()
  ).toBeVisible();

  // 已存檔資料不受影響：歷史快照仍在，改選「1 年」即可看到 2026 年的兩筆
  await expect(page.getByTestId("snapshot-row-2025-12-31")).toBeVisible();
  await expect(page.getByTestId("snapshot-row-2026-12-30")).toBeVisible();
  await range.selectOption("365");
  await expect(lineChart(2)).toBeVisible();
});

// PRD 4.2「快照比較」、第 9 節 #55b～#55j
test("匯入全功能 fixture：快照比較預設比較最新兩筆，可切換日期與反映刪除", async ({
  page,
}) => {
  await page.setInputFiles('input[type="file"]', financeDataFixture);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);

  const section = page.getByTestId("snapshot-comparison");
  const row = (key: string) => section.getByTestId(`comparison-row-${key}`);

  // 預設：倒數第二筆 → 最新一筆
  await expect(page.getByLabel("比較基準日")).toHaveValue("2026-08-31");
  await expect(page.getByLabel("比較對象日")).toHaveValue("2026-09-30");
  await expect(row("net-worth")).toContainText("$12,256,228");
  await expect(row("net-worth")).toContainText("$12,351,781");
  await expect(row("net-worth")).toContainText("▲ $95,553 (+0.8%)");
  await expect(row("debt-ratio")).toContainText("▼ 0.3 個百分點");
  await expect(row("cash-source-cash-2")).toContainText("持平");
  await expect(row("debt-debt-4")).toContainText("▼ $10,000 (-50.0%)");

  // 切換基準日為最早一筆
  await page.getByLabel("比較基準日").selectOption("2021-10-31");
  await expect(row("net-worth")).toContainText("▲ $6,519,816 (+111.8%)");
  await expect(row("debt-ratio")).toContainText("▼ 23.8 個百分點");

  // 選到同一天：不顯示表格
  await page.getByLabel("比較對象日").selectOption("2021-10-31");
  await expect(section.getByTestId("snapshot-comparison-same-date")).toHaveText(
    "請選擇兩筆不同的快照"
  );
  await expect(section.getByTestId("snapshot-comparison-table")).toHaveCount(0);

  // 被選取的快照遭刪除：該下拉選單回到預設值（最新一筆）
  await page.getByLabel("比較對象日").selectOption("2026-09-30");
  await page.getByRole("button", { name: "刪除 2026-09-30 的快照" }).click();
  await page.getByRole("button", { name: "確認刪除" }).click();
  await expect(page.getByLabel("比較對象日")).toHaveValue("2026-08-31");
  await expect(page.getByLabel("比較基準日")).toHaveValue("2021-10-31");

  // 手機寬度：每個項目排成兩行，頁面不會橫向溢出
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row("net-worth")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow).toBe(0);
});

// PRD 第 9 節 #55a、#55k
test("快照比較：少於 2 筆時顯示提示，且不含今日未存檔的草稿", async ({
  page,
}) => {
  const section = page.getByTestId("snapshot-comparison");
  await expect(section.getByTestId("snapshot-comparison-empty")).toHaveText(
    "至少需要 2 筆已存檔的快照才能比較"
  );

  // 只有 1 筆已存檔快照時，修改表單（未存檔）不會讓比較區出現
  await page.locator('label:has-text("台股市值") input').fill("1000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();
  await page.locator('label:has-text("台股市值") input').fill("2000");
  await expect(section.getByTestId("snapshot-comparison-empty")).toBeVisible();
  await expect(page.getByLabel("比較基準日")).toHaveCount(0);
});

// PRD 4.2「目標達成時間預估」、第 9 節 #56a～#56l
test("匯入全功能 fixture：目標達成時間預估並列兩種估算，並隨表單即時更新", async ({
  page,
}) => {
  // 固定今天的日期：今日草稿的負債會依距最近一筆快照的月數自動攤還，日期不同數字就不同
  await page.clock.install({ time: new Date("2026-10-03T10:00:00") });
  await page.reload();
  await page.setInputFiles('input[type="file"]', financeDataFixture);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);

  const budget = page.getByTestId("goal-eta-budget");
  const history = page.getByTestId("goal-eta-history");

  await expect(budget).toContainText("約 23 年 2 個月（預計 2049 年 12 月）");
  await expect(budget).toContainText("每月約增加 $63,468（現金流＋償還本金）");
  await expect(history).toContainText("約 7 年 5 個月（預計 2034 年 3 月）");
  await expect(history).toContainText(
    "每月約增加 $198,793（2025-09-30 → 2026-09-30）"
  );
  await expect(page.getByTestId("goal-eta")).toContainText(
    "線性估算，未計入未來的投資報酬、通膨與收支變動，僅供參考"
  );

  // 公式說明列出每月增加額的組成
  await page.getByLabel("預估達成時間計算公式說明").click();
  await expect(page.getByRole("dialog")).toContainText(
    "$34,027 + $29,441 = $63,468"
  );
  await page.keyboard.press("Escape");

  // 支出大於收入：依目前收支無法估算；依歷史變化只看已存檔快照，不受影響
  await page.locator('label:has-text("本月支出") input').fill("500000");
  await expect(budget).toContainText("淨資產沒有增加，無法估算");
  await expect(budget).toContainText("每月約減少 $392,043");
  await expect(history).toContainText("每月約增加 $198,793");

  // 目標調到低於目前淨資產：已達成，不再顯示預估
  await page.getByRole("textbox", { name: "目標淨資產" }).fill("1000000");
  await expect(page.getByTestId("goal-progress-achieved")).toBeVisible();
  await expect(page.getByTestId("goal-eta")).toHaveCount(0);
});

// PRD 第 9 節 #56i
test("目標達成時間預估：沒有歷史快照時只估算目前收支", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-03T10:00:00") });
  await page.reload();
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("4000000");
  await page.getByText("+ 新增收入").click();
  await page.getByLabel("收入金額").fill("100000");
  await page.locator('label:has-text("本月支出") input').fill("40000");
  await page.getByRole("textbox", { name: "目標淨資產" }).fill("10000000");

  await expect(page.getByTestId("goal-eta-budget")).toContainText(
    "約 8 年 4 個月（預計 2035 年 2 月）"
  );
  await expect(page.getByTestId("goal-eta-history")).toContainText(
    "需要相隔至少 30 天的兩筆已存檔快照"
  );
});

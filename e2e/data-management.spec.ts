import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleBackup = path.join(__dirname, "fixtures/sample-backup.json");
const corruptedBackup = path.join(__dirname, "fixtures/corrupted-backup.json");

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

/** 直接寫入 LocalStorage：每個日期一筆快照（現金 123,456），並可指定上次備份時間。 */
async function seedSnapshots(
  page: Page,
  snapshotDaysAgo: number[],
  lastBackupDaysAgo: number | null
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
    {
      dates: snapshotDaysAgo.map(dateDaysAgo),
      backupIso:
        lastBackupDaysAgo === null
          ? null
          : new Date(Date.now() - lastBackupDaysAgo * 86400000).toISOString(),
    }
  );
  await page.reload();
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

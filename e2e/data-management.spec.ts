import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

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
  await expect(page.getByText("查看全部歷史")).toHaveCount(0);
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

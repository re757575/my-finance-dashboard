import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  CURRENT_SCHEMA_VERSION,
  expandSnapshotSections,
  makeSnapshot,
  STORAGE_KEY,
} from "./helpers";

// PRD 4.2「範例資料」、6.2 節、第 9 節 #63a～#63n

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleBackup = path.join(__dirname, "fixtures/sample-backup.json");

const DEMO_MODE_KEY = "my_finance_dashboard_demo";
const LAST_BACKUP_KEY = "my_finance_dashboard_last_backup";
const THEME_KEY = "my_finance_dashboard_theme";
/** fixtures/finance-data.json 的快照筆數。 */
const DEMO_COUNT = 60;

function offer(page: Page) {
  return page.getByTestId("demo-data-offer");
}

function banner(page: Page) {
  return page.getByTestId("demo-data-banner");
}

function twStockInput(page: Page) {
  return page.locator('label:has-text("台股市值") input');
}

function stored(page: Page) {
  return page.evaluate(
    ([dataKey, demoKey, backupKey]) => {
      const raw = localStorage.getItem(dataKey);
      const dates =
        raw === null
          ? []
          : (JSON.parse(raw).snapshots as { date: string }[])
              .map((s) => s.date)
              .sort();
      return {
        raw,
        dates,
        demo: localStorage.getItem(demoKey),
        lastBackup: localStorage.getItem(backupKey),
      };
    },
    [STORAGE_KEY, DEMO_MODE_KEY, LAST_BACKUP_KEY]
  );
}

async function loadDemo(page: Page) {
  await page.getByRole("button", { name: "載入範例資料" }).click();
  await expect(banner(page)).toBeVisible();
}

async function clearDemo(page: Page) {
  await page.getByRole("button", { name: "清除範例資料，開始使用" }).click();
  await expect(page.getByText("確認清除範例資料？")).toBeVisible();
  await page.getByRole("button", { name: "確認清除" }).click();
  await expect(offer(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

// #63a
test("全新使用者：顯示範例資料邀請卡，不顯示範例模式橫幅", async ({ page }) => {
  await expect(offer(page)).toBeVisible();
  await expect(offer(page)).toContainText("第一次使用？先用範例資料試試看");
  await expect(
    page.getByRole("button", { name: "載入範例資料" })
  ).toBeEnabled();
  await expect(banner(page)).toHaveCount(0);
});

// #63b、#63c
test("載入範例資料：看板與趨勢圖都有數值，快照日期平移到最新一筆落在今天", async ({
  page,
}) => {
  // 固定今天的日期：fixture 最新兩筆為 2026-08-31、2026-09-30，平移 6 天
  await page.clock.install({ time: new Date("2026-10-06T10:00:00") });
  await page.reload();

  await loadDemo(page);

  await expect(offer(page)).toHaveCount(0);
  await expect(banner(page)).toContainText("目前顯示的是範例資料");
  await expect(banner(page)).toContainText("所有數字皆為虛構");

  // 最新一筆是今天：資料新鮮度為今日已更新，表單視為已存檔
  await expect(page.getByTestId("data-freshness")).toHaveText("今日已更新");
  await expect(page.getByTestId("save-button")).toBeDisabled();

  // 虛構資料不需要備份：即使最早一筆是 5 年前且從未備份，也不顯示備份提醒
  await expect(page.getByTestId("backup-reminder")).toHaveCount(0);

  // 看板卡片皆有數值
  await expect(page.getByTestId("total-assets")).not.toHaveText("$0");
  await expect(page.getByTestId("debt-ratio-value")).toBeVisible();
  await expect(page.getByTestId("pledge-maintenance-value")).toBeVisible();
  await expect(page.getByTestId("goal-progress-value")).toBeVisible();

  // 趨勢圖範圍切到 1 年，一開始就有 12 個節點
  await expect(page.getByLabel("趨勢圖範圍")).toHaveValue("365");
  await expect(
    page.getByRole("img", { name: /折線圖，共 12 筆資料/ }).first()
  ).toBeVisible();

  // 歷史快照：日期已平移，筆數不變
  await expandSnapshotSections(page);
  await expect(page.getByTestId("snapshot-row-2026-10-06")).toBeVisible();
  await expect(page.getByTestId("snapshot-row-2026-09-06")).toBeVisible();
  await expect(page.getByTestId("snapshot-row-2026-09-30")).toHaveCount(0);
  await page
    .getByRole("button", { name: new RegExp(`顯示全部（${DEMO_COUNT} 筆）`) })
    .click();
  await expect(
    page
      .getByTestId("snapshot-history-list")
      .locator('[data-testid^="snapshot-row-"]')
  ).toHaveCount(DEMO_COUNT);

  const state = await stored(page);
  expect(state.demo).toBe("1");
  expect(state.dates).toHaveLength(DEMO_COUNT);
  expect(state.dates.slice(-2)).toEqual(["2026-09-06", "2026-10-06"]);
  expect(state.lastBackup).toBeNull();
});

// PRD 第 8 節：範例資料是同源靜態檔，不發出任何對外請求
test("載入範例資料不發出任何對外網路請求", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith("data:")) {
      external.push(url);
    }
  });

  await loadDemo(page);
  await expect(page.getByTestId("total-assets")).not.toHaveText("$0");

  expect(external).toEqual([]);
});

// #63d
test("重新整理後範例資料與橫幅仍在", async ({ page }) => {
  await loadDemo(page);
  const before = await stored(page);

  await page.reload();

  await expect(banner(page)).toBeVisible();
  await expect(offer(page)).toHaveCount(0);
  await expect(page.getByTestId("total-assets")).not.toHaveText("$0");
  // 趨勢圖範圍只存在記憶體，重新整理後回到預設
  await expect(page.getByLabel("趨勢圖範圍")).toHaveValue("90");
  const after = await stored(page);
  expect(after.demo).toBe("1");
  expect(after.dates).toEqual(before.dates);
});

// #63e
test("範例模式下可正常修改並存檔，橫幅仍在", async ({ page }) => {
  await loadDemo(page);
  const before = await page.getByTestId("total-assets").textContent();

  await twStockInput(page).fill("9000000");
  await expect(page.getByTestId("save-button")).toBeEnabled();
  await page.getByTestId("save-button").click();

  await expect(page.getByTestId("save-message")).toHaveText(
    "已更新並儲存今日資料。"
  );
  await expect(page.getByTestId("total-assets")).not.toHaveText(before!);
  await expect(banner(page)).toBeVisible();
  const state = await stored(page);
  expect(state.demo).toBe("1");
  expect(state.dates).toHaveLength(DEMO_COUNT);
});

// #63f
test("清除範例資料：二次確認後清空，不強制匯出備份，主題偏好保留", async ({
  page,
}) => {
  await page.getByLabel("顯示主題").selectOption("dark");
  await loadDemo(page);
  // 先匯出一次，讓「上次備份時間」有值，才能確認清除時一併移除
  const exportDownload = page.waitForEvent("download");
  await page.getByText("匯出備份", { exact: true }).click();
  await exportDownload;
  expect((await stored(page)).lastBackup).not.toBeNull();

  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  await clearDemo(page);

  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  await expect(page.getByText("尚未新增現金來源")).toBeVisible();
  await expandSnapshotSections(page);
  await expect(page.getByTestId("snapshot-history-empty")).toBeVisible();
  const state = await stored(page);
  expect(state.raw).toBeNull();
  expect(state.demo).toBeNull();
  expect(state.lastBackup).toBeNull();
  expect(downloads).toBe(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)
  ).toBe("dark");

  // 清除後可以再次載入
  await loadDemo(page);
  expect((await stored(page)).dates).toHaveLength(DEMO_COUNT);
});

// #63g
test("取消清除範例資料時資料與橫幅皆不變", async ({ page }) => {
  await loadDemo(page);
  const before = await stored(page);

  await page.getByRole("button", { name: "清除範例資料，開始使用" }).click();
  await expect(page.getByText("確認清除範例資料？")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();

  await expect(page.getByText("確認清除範例資料？")).toHaveCount(0);
  await expect(banner(page)).toBeVisible();
  expect(await stored(page)).toEqual(before);
});

// PRD 4.2「範例資料」第 6 點：既有的「清空本地資料」同樣結束範例模式，且照舊先強制匯出
test("範例模式下使用「清空本地資料」：照舊先匯出，確認後結束範例模式", async ({
  page,
}) => {
  await loadDemo(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("清空本地資料").click();
  await downloadPromise;
  await page.getByRole("button", { name: "確認清空" }).click();

  await expect(offer(page)).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  const state = await stored(page);
  expect(state.raw).toBeNull();
  expect(state.demo).toBeNull();
});

// #63h
test("已有快照時不提供範例資料", async ({ page }) => {
  await twStockInput(page).fill("50000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();

  await expect(offer(page)).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("total-assets")).toHaveText("$50,000");
  await expect(offer(page)).toHaveCount(0);
});

// #63h：本分頁仍顯示邀請卡，但 LocalStorage 已被寫入快照（同分頁寫入不會觸發 storage 事件）
test("LocalStorage 已有快照時拒絕載入範例資料，既有資料不被覆蓋", async ({
  page,
}) => {
  await expect(offer(page)).toBeVisible();
  const raw = JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    snapshots: [
      makeSnapshot("2026-01-01", {
        cashSources: [
          { id: "c1", name: "我的銀行", amount: 4321, restricted: false },
        ],
      }),
    ],
  });
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, raw]
  );

  await page.getByRole("button", { name: "載入範例資料" }).click();

  await expect(page.getByTestId("demo-data-error")).toHaveText(
    "瀏覽器中已有資料，為避免覆蓋，已取消載入範例資料。"
  );
  await expect(banner(page)).toHaveCount(0);
  const state = await stored(page);
  expect(state.raw).toBe(raw);
  expect(state.demo).toBeNull();
});

// #63i
test("本地資料版本不相容時不提供範例資料，原始資料不被覆蓋", async ({
  page,
}) => {
  const raw = JSON.stringify({ schemaVersion: 999, snapshots: [] });
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, raw]
  );
  await page.reload();

  await expect(page.getByText("偵測到本地資料版本不相容")).toBeVisible();
  await expect(offer(page)).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);
  expect((await stored(page)).raw).toBe(raw);
});

// #63j
test("範例模式下匯入備份：換成匯入的資料並結束範例模式", async ({ page }) => {
  await loadDemo(page);

  await page.setInputFiles('input[type="file"]', sampleBackup);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);

  await expect(page.getByTestId("total-assets")).toHaveText("$77,000");
  await expect(banner(page)).toHaveCount(0);
  await expect(offer(page)).toHaveCount(0);
  const state = await stored(page);
  expect(state.demo).toBeNull();
  expect(state.dates).toHaveLength(1);

  // 重新整理後也不會被當成範例資料
  await page.reload();
  await expect(page.getByTestId("total-assets")).toHaveText("$77,000");
  await expect(banner(page)).toHaveCount(0);
});

// #63k
test("寫入失敗：邀請卡顯示訊息，不殘留範例模式標記，排除後可重試", async ({
  page,
}) => {
  // 模擬儲存空間已滿
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreSetItem: () => void }).restoreSetItem =
      () => {
        Storage.prototype.setItem = original;
      };
    Storage.prototype.setItem = () => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    };
  });

  await page.getByRole("button", { name: "載入範例資料" }).click();

  await expect(page.getByTestId("demo-data-error")).toHaveText(
    "無法寫入瀏覽器儲存空間（可能已滿或被停用），本次變更尚未存檔。"
  );
  await expect(offer(page)).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  const failed = await stored(page);
  expect(failed.raw).toBeNull();
  expect(failed.demo).toBeNull();

  await page.evaluate(() =>
    (window as unknown as { restoreSetItem: () => void }).restoreSetItem()
  );
  await loadDemo(page);

  await expect(page.getByTestId("demo-data-error")).toHaveCount(0);
  expect((await stored(page)).demo).toBe("1");
});

// #63l
test("多分頁：一個分頁載入或清除範例資料，另一個分頁自動同步", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto("/");
  await expect(offer(other)).toBeVisible();

  await loadDemo(page);

  await expect(banner(other)).toBeVisible();
  await expect(offer(other)).toHaveCount(0);
  await expect(other.getByTestId("total-assets")).toHaveText(
    (await page.getByTestId("total-assets").textContent())!
  );

  await clearDemo(page);

  await expect(offer(other)).toBeVisible();
  await expect(banner(other)).toHaveCount(0);
  await expect(other.getByTestId("total-assets")).toHaveText("$0");
});

// #63n
test("深色模式：邀請卡與範例模式橫幅改用深色配色", async ({ page }) => {
  const styleOf = (target: ReturnType<typeof offer>) =>
    target.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, color: style.color };
    });
  const themeSelect = page.getByLabel("顯示主題");
  const html = page.locator("html");

  await themeSelect.selectOption("light");
  const lightOffer = await styleOf(offer(page));
  expect(lightOffer.background).toBe("rgb(255, 255, 255)");
  await themeSelect.selectOption("dark");
  await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  expect((await styleOf(offer(page))).background).not.toBe(
    lightOffer.background
  );

  await loadDemo(page);
  const darkBanner = await styleOf(banner(page));
  await themeSelect.selectOption("light");
  await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  const lightBanner = await styleOf(banner(page));

  expect(darkBanner.background).not.toBe(lightBanner.background);
  expect(darkBanner.color).not.toBe(lightBanner.color);
});

// PRD 第 7 節：窄螢幕不得撐寬頁面
test("390px 窄螢幕：邀請卡與橫幅不造成水平捲動", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflows = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );

  await expect(offer(page)).toBeVisible();
  expect(await overflows()).toBe(false);

  await loadDemo(page);
  await expect(
    page.getByRole("button", { name: "清除範例資料，開始使用" })
  ).toBeVisible();
  expect(await overflows()).toBe(false);
});

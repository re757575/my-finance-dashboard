import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { STORAGE_KEY } from "./helpers";

// PRD 4.2「深色模式」、6.2 節、第 9 節 #59a～#59k

const THEME_KEY = "my_finance_dashboard_theme";

function html(page: Page) {
  return page.locator("html");
}

function themeSelect(page: Page) {
  return page.getByLabel("顯示主題");
}

function storedTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), THEME_KEY);
}

/** 頁面背景色，用來確認深色樣式確實有套用到畫面。 */
function pageBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function saveOneSnapshot(page: Page) {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("12345");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

// #59a
test("預設跟隨系統：系統為淺色時不套用深色", async ({ page }) => {
  await expect(themeSelect(page)).toHaveValue("system");
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await storedTheme(page)).toBeNull();
});

// #59a
test("預設跟隨系統：系統為深色時以深色顯示", async ({ page }) => {
  const lightBackground = await pageBackground(page);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();

  await expect(themeSelect(page)).toHaveValue("system");
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await pageBackground(page)).not.toBe(lightBackground);
});

// #59b
test("跟隨系統時，系統設定變化不需重新整理即時切換", async ({ page }) => {
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);

  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

// #59b
test("指定淺色或深色後，不受系統設定變化影響", async ({ page }) => {
  await themeSelect(page).selectOption("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);

  await themeSelect(page).selectOption("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

// #59c
test("手動切換：立即套用並寫入 LocalStorage，不需按「更新儀表板」", async ({
  page,
}) => {
  await expect(
    themeSelect(page).locator("option").allTextContents()
  ).resolves.toEqual(["跟隨系統", "淺色", "深色"]);

  await themeSelect(page).selectOption({ label: "深色" });
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await storedTheme(page)).toBe("dark");

  await themeSelect(page).selectOption({ label: "淺色" });
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await storedTheme(page)).toBe("light");

  await themeSelect(page).selectOption({ label: "跟隨系統" });
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await storedTheme(page)).toBe("system");

  // 主題不屬於快照資料：切換不會寫入任何快照
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  ).toBeNull();
});

// #59d
test("重新整理後保留所選主題", async ({ page }) => {
  await themeSelect(page).selectOption("dark");
  await page.reload();

  await expect(themeSelect(page)).toHaveValue("dark");
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);

  // 系統為深色但選了淺色，重新整理後仍為淺色
  await page.emulateMedia({ colorScheme: "dark" });
  await themeSelect(page).selectOption("light");
  await page.reload();

  await expect(themeSelect(page)).toHaveValue("light");
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

// #59d：index.html 的內嵌 script 在 React 載入前就套用主題，避免閃現錯誤主題
test("應用程式載入前就已套用深色（不閃現淺色）", async ({ page }) => {
  await themeSelect(page).selectOption("dark");
  // 擋下應用程式進入點，只留 index.html 的內嵌 script
  await page.route("**/src/main.tsx*", (route) => route.abort());
  await page.reload();

  await expect(page.locator("#root")).toBeEmpty();
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);

  await page.evaluate((key) => localStorage.setItem(key, "light"), THEME_KEY);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();

  await expect(page.locator("#root")).toBeEmpty();
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

// #59e
test("偏好內容不合法時視為跟隨系統", async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, "purple"), THEME_KEY);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();

  await expect(themeSelect(page)).toHaveValue("system");
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
});

// #59g
test("清空本地資料後主題偏好仍保留", async ({ page }) => {
  await themeSelect(page).selectOption("dark");
  await saveOneSnapshot(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("清空本地資料").click();
  await downloadPromise;
  await page.getByRole("button", { name: "確認清空" }).click();

  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  ).toBeNull();
  expect(await storedTheme(page)).toBe("dark");
  await expect(themeSelect(page)).toHaveValue("dark");
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);

  await page.reload();
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
});

// #59h
test("匯出的備份檔不含主題偏好，匯入還原也不影響主題", async ({
  page,
}, testInfo) => {
  await themeSelect(page).selectOption("dark");
  await saveOneSnapshot(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("匯出備份").click();
  const download = await downloadPromise;
  const file = testInfo.outputPath("backup.json");
  await download.saveAs(file);

  const content = fs.readFileSync(file, "utf-8");
  expect(content).not.toContain(THEME_KEY);
  expect(content).not.toContain("theme");
  expect(Object.keys(JSON.parse(content)).sort()).toEqual([
    "schemaVersion",
    "snapshots",
  ]);

  // 改成淺色後匯入剛才（在深色下匯出）的備份：主題維持淺色
  await themeSelect(page).selectOption("light");
  await page.setInputFiles('input[type="file"]', file);
  await page.getByText("確認覆蓋匯入").click();
  await expect(page.getByText("確認匯入備份？")).toHaveCount(0);

  await expect(page.getByTestId("total-assets")).toHaveText("$12,345");
  expect(await storedTheme(page)).toBe("light");
  await expect(themeSelect(page)).toHaveValue("light");
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

// #59i
test("多分頁：一個分頁切換主題，另一個分頁自動同步", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: "light" });
  await other.goto("/");
  await expect(html(other)).not.toHaveClass(/(^|\s)dark(\s|$)/);

  await themeSelect(page).selectOption("dark");

  await expect(html(other)).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(themeSelect(other)).toHaveValue("dark");

  await themeSelect(other).selectOption("light");

  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(themeSelect(page)).toHaveValue("light");
});

// #59j、#59k
test("深色模式下卡片、文字與提示橫幅改用深色配色，切回淺色後還原", async ({
  page,
}) => {
  await page.evaluate((key) => localStorage.setItem(key, "{bad"), STORAGE_KEY);
  await page.reload();

  const card = page.getByTestId("total-assets").locator("..");
  const banner = page.getByText("本地資料無法讀取，已重置。");
  const styles = () =>
    Promise.all(
      [card, banner].map((locator) =>
        locator.evaluate((el) => {
          const style = getComputedStyle(el);
          return { background: style.backgroundColor, color: style.color };
        })
      )
    );

  const light = await styles();
  expect(light[0].background).toBe("rgb(255, 255, 255)");

  await themeSelect(page).selectOption("dark");
  await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
  const dark = await styles();

  for (const index of [0, 1]) {
    expect(dark[index].background).not.toBe(light[index].background);
    expect(dark[index].color).not.toBe(light[index].color);
  }

  await themeSelect(page).selectOption("light");
  await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await styles()).toEqual(light);
});

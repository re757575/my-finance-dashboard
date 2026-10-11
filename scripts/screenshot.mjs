// 載入範例資料後，在「桌面淺色」與「手機深色」兩種情境截下各主要區塊，供改動畫面後目視檢查。
//
// 用法：npm run screenshot [-- --out <目錄>]
//
// - 會自行啟動一個 Vite dev server 來服務「目前目錄」的程式碼，不沿用既有的 5173 埠，
//   以免在 worktree 裡截到主目錄 dev server 的畫面。
// - 輸出預設在 test-results/screenshots/（已被 git 忽略；之後跑 e2e 時會被 Playwright 清掉）。
// - 頁面出現未捕捉的例外、console error，或頁面可以水平捲動時，以非零狀態結束。
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const VARIANTS = [
  {
    name: "desktop-light",
    context: { viewport: { width: 1280, height: 900 }, colorScheme: "light" },
  },
  {
    name: "mobile-dark",
    // hasTouch 會讓 pointer-coarse 生效，看得到放大後的觸控目標
    context: {
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      hasTouch: true,
    },
  },
];

const TREND_TABS = [
  ["assets", "資產"],
  ["liabilities", "負債"],
  ["allocation", "配置與儲蓄"],
];

function parseOutDir(argv) {
  const index = argv.indexOf("--out");
  return path.resolve(
    index !== -1 && argv[index + 1]
      ? argv[index + 1]
      : "test-results/screenshots"
  );
}

async function expandSection(page, name) {
  const toggle = page.getByRole("button", { name, exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
}

async function capture(browser, baseUrl, outDir, variant) {
  const context = await browser.newContext({
    ...variant.context,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`例外：${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console error：${message.text()}`);
    }
  });

  const shot = (locator, file) =>
    locator.screenshot({
      path: path.join(outDir, `${variant.name}-${file}.png`),
    });

  await page.goto(baseUrl);
  await page.getByRole("button", { name: "載入範例資料" }).click();
  await page.getByText("目前顯示的是範例資料").waitFor();
  const form = page.getByTestId("input-form");
  await form.and(page.locator('[aria-busy="false"]')).waitFor();
  for (const name of ["資產", "負債", "收入與支出", "目標"]) {
    await expandSection(form, name);
  }

  await shot(page.getByTestId("dashboard-now"), "01-dashboard");
  await shot(form, "02-form");

  const trend = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "歷史趨勢" }) });
  for (const [key, label] of TREND_TABS) {
    await trend.getByRole("tab", { name: label, exact: true }).click();
    await shot(trend, `03-trend-${key}`);
  }

  await expandSection(page, "快照比較");
  await shot(page.getByTestId("snapshot-comparison"), "04-comparison");
  await expandSection(page, "歷史快照");
  await shot(page.getByTestId("snapshot-history"), "05-history");

  // 全頁截圖放最後：前面展開的區塊都會入鏡
  await page.screenshot({
    path: path.join(outDir, `${variant.name}-00-full.png`),
    fullPage: true,
  });

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  if (overflow > 0) problems.push(`頁面可水平捲動 ${overflow}px`);

  await context.close();
  return problems;
}

const outDir = parseOutDir(process.argv.slice(2));
await mkdir(outDir, { recursive: true });

const server = await createServer({
  logLevel: "error",
  server: { port: 5273, strictPort: false },
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch();

let failed = false;
try {
  for (const variant of VARIANTS) {
    const problems = await capture(browser, baseUrl, outDir, variant);
    console.log(`${variant.name}：${problems.length === 0 ? "沒有問題" : ""}`);
    for (const problem of problems) console.log(`  - ${problem}`);
    if (problems.length > 0) failed = true;
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n截圖輸出在 ${path.relative(process.cwd(), outDir) || "."}/`);
process.exit(failed ? 1 : 0);

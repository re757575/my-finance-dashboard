import { expect, test, type Locator, type Page } from "@playwright/test";

// PRD 第 7 節「趨勢圖 Tooltip 與全螢幕檢視」的圖表內文字字級、第 9 節 #68a～#68b

const MIN_FONT_SIZE = 12;
const TABS = ["資產", "負債", "配置與儲蓄"];
/** 三種圖表元件各取一張：折線圖、分組長條圖、堆疊面積圖。 */
const FULLSCREEN_CHARTS = [
  { tab: "資產", title: "淨資產趨勢" },
  { tab: "負債", title: "資產負債對比" },
  { tab: "配置與儲蓄", title: "資產配置趨勢" },
];

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

/** 範例資料有 60 筆月底快照與目標淨資產 $30,000,000，八張趨勢圖皆有資料可畫。 */
async function loadDemo(page: Page) {
  await page.getByRole("button", { name: "載入範例資料" }).click();
  await expect(page.getByLabel("來源名稱").first()).toBeVisible();
}

/** SVG 文字在畫面上的實際字級：字級 × SVG 的縮放比例（compact 圖會隨卡片寬度縮放）。 */
const renderedSvgFontSizes = (scope: Page | Locator) =>
  scope.locator('svg[role="img"] text').evaluateAll((texts) =>
    (texts as SVGTextElement[]).map((text) => {
      const svg = text.ownerSVGElement!;
      const scale =
        svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      return parseFloat(getComputedStyle(text).fontSize) * scale;
    })
  );

// #68a
for (const width of [390, 1280]) {
  test(`${width}px：compact 趨勢圖的「目標」標籤為 12px，不隨卡片縮小`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await loadDemo(page);

    const label = page.getByTestId("chart-target-label");
    await expect(label).toHaveText("目標 $30,000,000");
    await expect(label).toHaveCSS("font-size", `${MIN_FONT_SIZE}px`);
    // 疊在圖上的一般文字，不在會縮放的 SVG 裡
    expect(await label.evaluate((el) => el.closest("svg") === null)).toBe(true);

    // 緊貼在目標參考線上方，且沒有超出圖表卡片
    const labelBox = (await label.boundingBox())!;
    const chartCard = label.locator(
      "xpath=ancestor::div[contains(@class,'rounded-xl')][1]"
    );
    const lineBox = (await chartCard
      .locator("svg line[stroke-dasharray]")
      .boundingBox())!;
    const cardBox = (await chartCard.boundingBox())!;
    const lineY = lineBox.y + lineBox.height / 2;
    expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(lineY + 2);
    expect(labelBox.y + labelBox.height).toBeGreaterThan(lineY - 6);
    // 參考線的外框含線寬，左緣會比標籤多出半個線寬
    expect(Math.abs(labelBox.x - lineBox.x)).toBeLessThan(2);
    expect(labelBox.y).toBeGreaterThanOrEqual(cardBox.y);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(
      cardBox.x + cardBox.width
    );

    // 三個分頁的 compact 圖都沒有小於 12px 的圖內文字
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.locator('svg[role="img"]').first()).toBeVisible();
      for (const size of await renderedSvgFontSizes(page)) {
        expect(size, `${tab}分頁`).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
      }
    }
  });
}

// #68b
for (const width of [390, 1280]) {
  test(`${width}px：全螢幕圖表的座標文字皆為 12px，日期不重疊、Y 軸刻度不超出左緣`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await loadDemo(page);

    for (const { tab, title } of FULLSCREEN_CHARTS) {
      await page.getByRole("tab", { name: tab }).click();
      await page.getByRole("button", { name: `${title}全螢幕檢視` }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Dialog 開啟時有縮放動畫，等它結束（縮放比例回到 1）再量
      await expect
        .poll(async () => Math.min(...(await renderedSvgFontSizes(dialog))), {
          message: title,
        })
        .toBeCloseTo(MIN_FONT_SIZE, 1);
      const sizes = await renderedSvgFontSizes(dialog);
      for (const size of sizes) {
        expect(size, title).toBeCloseTo(MIN_FONT_SIZE, 1);
      }

      // 相鄰的節點日期（置中對齊的文字）之間留有間隔
      const minDateGap = await dialog
        .locator('svg[role="img"] text[text-anchor="middle"]')
        .evaluateAll((labels) => {
          const rects = labels.map((el) => el.getBoundingClientRect());
          let min = Infinity;
          for (let i = 1; i < rects.length; i++) {
            min = Math.min(min, rects[i].left - rects[i - 1].right);
          }
          return min;
        });
      expect(minDateGap, title).toBeGreaterThanOrEqual(4);

      // Y 軸刻度（靠右對齊的文字）沒有超出 SVG 左緣；長條圖沒有 Y 軸刻度
      const yAxisOverflow = await dialog
        .locator('svg[role="img"]')
        .evaluate((svg) => {
          const left = svg.getBoundingClientRect().left;
          return Math.max(
            0,
            ...[...svg.querySelectorAll('text[text-anchor="end"]')].map(
              (tick) => left - tick.getBoundingClientRect().left
            )
          );
        });
      expect(yAxisOverflow, title).toBe(0);

      if (title === "淨資產趨勢") {
        await expect(dialog.getByTestId("chart-target-label")).toHaveCSS(
          "font-size",
          `${MIN_FONT_SIZE}px`
        );
      }

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
  });
}

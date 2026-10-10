import { expect, test, type Locator, type Page } from "@playwright/test";

// PRD 第 7 節「手機看板兩欄並排」「觸控目標」「操作圖示」「負債清單卡片版面」、第 9 節 #67a～#67i

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

/** 範例資料含不動產、房貸與質押負債，看板 11 張卡片全部出現。 */
async function loadDemo(page: Page) {
  await page.getByRole("button", { name: "載入範例資料" }).click();
  await expect(page.getByLabel("來源名稱").first()).toBeVisible();
}

/** 以卡片內的數值 testid 找到整張卡片。 */
const card = (page: Page, valueTestId: string) =>
  page
    .getByTestId(valueTestId)
    .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

const SUMMARY = ["total-assets", "total-liabilities", "net-worth"];
/** 狀態卡的顯示順序（PRD 4.1）。 */
const STATUS = [
  "debt-ratio-value",
  "cash-ratio-value",
  "cash-flow-value",
  "total-monthly-debt-payment",
  "debt-service-ratio-value",
  "emergency-fund-value",
  "savings-rate-value",
  "pledge-maintenance-value",
];

async function boxes(page: Page, testIds: string[]) {
  const result = [];
  for (const testId of testIds) {
    const box = await card(page, testId).boundingBox();
    result.push({ testId, ...box! });
  }
  return result;
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

/** 卡片內所有文字都留在卡片的內距範圍內（沒有被擠出去）。 */
async function expectContentInsideCard(cardLocator: Locator) {
  const overflow = await cardLocator.evaluate((el) => {
    const limit = el.getBoundingClientRect().right;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let worst = -Infinity;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      worst = Math.max(worst, range.getBoundingClientRect().right - limit);
    }
    return worst;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

// #67a
test("390px：看板卡片兩欄並排，淨資產、負債比與落單的最後一張各佔一列", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);

  const [assets, liabilities, netWorth] = await boxes(page, SUMMARY);
  expect(liabilities.y).toBe(assets.y);
  expect(liabilities.x).toBeGreaterThan(assets.x + assets.width);
  expect(netWorth.y).toBeGreaterThan(assets.y + assets.height);
  expect(netWorth.width).toBeGreaterThan(assets.width * 2);

  const status = await boxes(page, STATUS);
  const [debtRatio, ...rest] = status;
  const pledge = rest.pop()!;
  expect(debtRatio.width).toBe(netWorth.width);
  // 其餘六張依序兩兩並排
  for (let i = 0; i < rest.length; i += 2) {
    const [left, right] = [rest[i], rest[i + 1]];
    expect(right.y, `${left.testId}｜${right.testId}`).toBe(left.y);
    expect(right.x).toBeGreaterThan(left.x + left.width);
    expect(right.height).toBe(left.height);
    expect(left.width).toBeLessThan(netWorth.width / 2);
  }
  expect(rest[2].y).toBeGreaterThan(rest[0].y);
  // 第八張（質押整戶維持率）落單，補滿整列
  expect(pledge.width).toBe(netWorth.width);
  expect(pledge.y).toBeGreaterThan(rest[4].y + rest[4].height);

  await expectNoHorizontalOverflow(page);
});

test("390px 沒有質押負債：狀態卡剛好成對，最後一張不補滿", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額", { exact: true }).fill("100000");

  await expect(page.getByTestId("pledge-maintenance-value")).toHaveCount(0);
  const status = await boxes(page, STATUS.slice(0, 7));
  const savings = status[6];
  const emergency = status[5];
  expect(savings.y).toBe(emergency.y);
  expect(savings.width).toBe(emergency.width);
});

// #67b
for (const width of [360, 390]) {
  test(`${width}px：兩欄卡片的內容不溢出，「收支為正」不會逐字直排`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await loadDemo(page);

    for (const testId of [...SUMMARY, ...STATUS]) {
      await expectContentInsideCard(card(page, testId));
    }

    const cashFlowLabel = card(page, "cash-flow-value").getByText("收支為正");
    const labelBox = await cashFlowLabel.boundingBox();
    // 四個字橫排：寬大於高；直排時會變成一個字寬、四行高
    expect(labelBox!.width).toBeGreaterThan(labelBox!.height * 2);
    await expectNoHorizontalOverflow(page);
  });
}

// #67c
test("320px：看板卡片維持單欄", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await loadDemo(page);

  const all = await boxes(page, [...SUMMARY, ...STATUS]);
  for (let i = 1; i < all.length; i++) {
    expect(all[i].x).toBe(all[0].x);
    expect(all[i].width).toBe(all[0].width);
    expect(all[i].y).toBeGreaterThan(all[i - 1].y);
  }
  await expectNoHorizontalOverflow(page);
});

// #67d
test("820px 與 1280px：平板兩欄、桌面三欄的排法不變", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await loadDemo(page);

  let summary = await boxes(page, SUMMARY);
  expect(summary[1].y).toBe(summary[0].y);
  expect(summary[2].y).toBe(summary[0].y);
  let status = await boxes(page, STATUS);
  // 兩欄：負債比只佔一欄，與現金比例並排
  expect(status[1].y).toBe(status[0].y);
  expect(status[1].width).toBe(status[0].width);
  expect(status[2].y).toBeGreaterThan(status[0].y);

  await page.setViewportSize({ width: 1280, height: 800 });
  summary = await boxes(page, SUMMARY);
  expect(summary[2].y).toBe(summary[0].y);
  status = await boxes(page, STATUS);
  // 三欄：前三張同一列，第四張換行
  expect(status[1].y).toBe(status[0].y);
  expect(status[2].y).toBe(status[0].y);
  expect(status[3].y).toBeGreaterThan(status[0].y);
  expect(status[3].x).toBe(status[0].x);
});

async function sizes(locator: Locator) {
  const result = await locator.evaluateAll((elements) =>
    elements.map((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })
  );
  expect(result.length).toBeGreaterThan(0);
  return result;
}

const addButtons = (page: Page) =>
  page.getByRole("button", { name: /^\+ 新增/ });
const rowIconButtons = (page: Page) =>
  page
    .getByTestId("input-form")
    .getByRole("button", { name: /^(標記|複製|刪除) / });
const segmentButtons = (page: Page) =>
  page.locator('[role="group"] button[aria-pressed]');

// #67e
test.describe("觸控裝置", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("新增按鈕、圖示鈕與切換鈕的寬高都至少 40px", async ({ page }) => {
    await loadDemo(page);
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches)
    ).toBe(true);

    // 範例資料：5 筆現金（各 3 顆）＋ 5 筆負債 ＋ 2 筆收入 ＋ 2 筆定期定額的刪除鈕
    await expect(rowIconButtons(page)).toHaveCount(24);
    // 幣別 2 ＋ 5 筆負債的攤還方式 10 ＋ 壓力測試 3
    await expect(segmentButtons(page)).toHaveCount(15);
    await expect(addButtons(page)).toHaveCount(4);

    for (const group of [
      addButtons(page),
      rowIconButtons(page),
      segmentButtons(page),
    ]) {
      for (const { width, height } of await sizes(group)) {
        expect(height).toBeGreaterThanOrEqual(40);
        expect(width).toBeGreaterThanOrEqual(40);
      }
    }
    await expectNoHorizontalOverflow(page);
  });

  // #67i
  test("放大刪除鈕後，負債備註名稱仍完整顯示", async ({ page }) => {
    await loadDemo(page);

    const names = page.getByLabel("備註名稱");
    await expect(names).toHaveCount(5);
    expect(
      await names.evaluateAll((inputs) =>
        inputs.every((el) => el.scrollWidth <= el.clientWidth)
      )
    ).toBe(true);
  });
});

// #67f
test("滑鼠裝置 1280px：圖示鈕 32px 見方、新增按鈕高 28px，維持精簡尺寸", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadDemo(page);
  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches)
  ).toBe(false);

  for (const { width, height } of await sizes(rowIconButtons(page))) {
    expect(width).toBe(32);
    expect(height).toBe(32);
  }
  for (const { height } of await sizes(addButtons(page))) {
    expect(height).toBe(28);
  }
  for (const { height } of await sizes(segmentButtons(page))) {
    expect(height).toBeLessThan(28);
  }
});

// #67g
test("操作圖示為 SVG：頁面上沒有 emoji，每顆圖示鈕都有無障礙名稱", async ({
  page,
}) => {
  await loadDemo(page);

  const buttons = rowIconButtons(page);
  await expect(buttons).toHaveCount(24);
  const details = await buttons.evaluateAll((elements) =>
    elements.map((el) => ({
      label: el.getAttribute("aria-label") ?? "",
      text: el.textContent ?? "",
      svg: el.querySelectorAll("svg").length,
      hidden: el.querySelector("svg")?.getAttribute("aria-hidden"),
    }))
  );
  for (const detail of details) {
    expect(detail.label.length).toBeGreaterThan(3);
    expect(detail.text).toBe("");
    expect(detail.svg).toBe(1);
    expect(detail.hidden).toBe("true");
  }

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/[\u{1F512}\u{1F4C4}\u{1F5D1}]/u);
});

// #67h
test("鎖定狀態不只靠顏色：圖示由開鎖變為閉鎖，再點一次還原", async ({
  page,
}) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("來源名稱").fill("期貨保證金");
  const lock = page.getByRole("button", { name: "標記 期貨保證金 為不可動用" });
  const iconClass = () =>
    lock.locator("svg").evaluate((el) => el.getAttribute("class") ?? "");
  const background = () =>
    lock.evaluate((el) => getComputedStyle(el).backgroundColor);

  await expect(lock).toHaveAttribute("aria-pressed", "false");
  expect(await iconClass()).toContain("lucide-lock-open");
  const idleBackground = await background();

  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  expect(await iconClass()).not.toContain("lucide-lock-open");
  expect(await iconClass()).toContain("lucide-lock");
  // 移開滑鼠，排除 hover 底色的影響
  await page.mouse.move(0, 0);
  await expect.poll(background).not.toBe(idleBackground);

  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  expect(await iconClass()).toContain("lucide-lock-open");
});

// #67i
for (const width of [390, 1024]) {
  test(`${width}px 負債卡：備註名稱獨佔一行且完整顯示，類別與刪除鈕在上一行`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.getByText("+ 新增負債").click();
    const name = page.getByLabel("備註名稱");
    await name.fill("範例股票質押（券商）");
    await name.blur();

    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true
    );
    const nameBox = await name.boundingBox();
    const categoryBox = await page.getByLabel("負債類別").boundingBox();
    const removeBox = await page
      .getByRole("button", { name: "刪除 範例股票質押（券商）" })
      .boundingBox();
    expect(nameBox!.y).toBeGreaterThan(
      categoryBox!.y + categoryBox!.height - 1
    );
    expect(removeBox!.x).toBeGreaterThan(categoryBox!.x + categoryBox!.width);
    expect(removeBox!.y + removeBox!.height).toBeLessThanOrEqual(nameBox!.y);
    // 名稱欄撐滿卡片寬度
    expect(nameBox!.x).toBe(categoryBox!.x);
    expect(nameBox!.x + nameBox!.width).toBeCloseTo(
      removeBox!.x + removeBox!.width,
      0
    );
  });
}

test("640px 以上的單欄版面：負債卡維持類別、備註名稱、刪除鈕同一行", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.getByText("+ 新增負債").click();

  const categoryBox = await page.getByLabel("負債類別").boundingBox();
  const nameBox = await page.getByLabel("備註名稱").boundingBox();
  const removeBox = await page
    .getByRole("button", { name: "刪除 此筆負債" })
    .boundingBox();
  expect(nameBox!.x).toBeGreaterThan(categoryBox!.x + categoryBox!.width);
  expect(removeBox!.x).toBeGreaterThan(nameBox!.x + nameBox!.width);
  expect(Math.abs(nameBox!.y - categoryBox!.y)).toBeLessThan(8);
});

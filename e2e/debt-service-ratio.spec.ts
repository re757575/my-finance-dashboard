import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

/** 新增一筆年利率 0%、12 期本息平均攤還的負債：月付 = 144,000 ÷ 12 = 12,000。 */
async function addDebtPaying12000(page: Page) {
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("剩餘本金").fill("144000");
  await page.getByLabel("剩餘還款期數").fill("12");
  await expect(page.getByTestId("total-monthly-debt-payment")).toHaveText(
    "$12,000"
  );
}

async function expectDebtServiceRatio(
  page: Page,
  expected: { value: string; status: string; barWidth: string }
) {
  await expect(page.getByTestId("debt-service-ratio-value")).toHaveText(
    expected.value
  );
  await expect(page.getByTestId("debt-service-ratio-status")).toHaveText(
    expected.status
  );
  await expect(page.getByTestId("debt-service-ratio-bar-fill")).toHaveAttribute(
    "style",
    new RegExp(`width:\\s*${expected.barWidth}%`)
  );
}

// PRD 5.2b 節、第 9 節 #61a～#61d、#61g：比率、分級與 30%／40% 邊界
test("償債負擔率隨收入即時更新，並依 30%／40% 門檻分級", async ({ page }) => {
  await addDebtPaying12000(page);
  await page.getByText("+ 新增收入").click();
  const income = page.getByLabel("收入金額");

  await income.fill("60000");
  await expectDebtServiceRatio(page, {
    value: "20.0%",
    status: "負擔輕鬆",
    barWidth: "20",
  });

  // 30% 與 40% 都含在「負擔偏重」內
  await income.fill("40000");
  await expectDebtServiceRatio(page, {
    value: "30.0%",
    status: "負擔偏重",
    barWidth: "30",
  });
  await income.fill("30000");
  await expectDebtServiceRatio(page, {
    value: "40.0%",
    status: "負擔偏重",
    barWidth: "40",
  });

  await income.fill("25000");
  await expectDebtServiceRatio(page, {
    value: "48.0%",
    status: "負擔過重",
    barWidth: "48",
  });

  // 超過 100%：數字不封頂，進度條寬度夾在 100%
  await income.fill("10000");
  await expectDebtServiceRatio(page, {
    value: "120.0%",
    status: "負擔過重",
    barWidth: "100",
  });
});

// PRD 第 9 節 #61e、#61f：沒有應還款、以及總收入為 0 但有應還款
test("沒有負債時為無還款負擔；有應還款但沒有收入時顯示「—」與無收入可負擔", async ({
  page,
}) => {
  // 空白狀態：沒有負債也沒有收入
  await expectDebtServiceRatio(page, {
    value: "0.0%",
    status: "無還款負擔",
    barWidth: "0",
  });

  // 只有收入、沒有負債：仍為 0%
  await page.getByText("+ 新增收入").click();
  await page.getByLabel("收入金額").fill("60000");
  await expectDebtServiceRatio(page, {
    value: "0.0%",
    status: "無還款負擔",
    barWidth: "0",
  });

  // 有應還款後把收入清空（視為 0）：無法計算
  await addDebtPaying12000(page);
  await expectDebtServiceRatio(page, {
    value: "20.0%",
    status: "負擔輕鬆",
    barWidth: "20",
  });
  await page.getByLabel("收入金額").fill("");
  await expectDebtServiceRatio(page, {
    value: "—",
    status: "無收入可負擔",
    barWidth: "100",
  });

  // 公式說明同樣不得出現 NaN／Infinity
  await page.getByLabel("償債負擔率計算公式說明").click();
  const formula = page.getByTestId("formula-info-content");
  await expect(formula).toContainText("$12,000 ÷ $0：總收入為 0，無法計算");
  await expect(formula).not.toContainText(/NaN|Infinity/);
});

// PRD 第 9 節 #61h：卡片位置與公式說明
test("償債負擔率卡緊接在本月應還款總額卡之後，公式說明代入目前數值", async ({
  page,
}) => {
  await addDebtPaying12000(page);
  await page.getByText("+ 新增收入").click();
  await page.getByLabel("收入金額").fill("60000");

  // 卡片的 DOM 順序：本月應還款總額卡 → 償債負擔率卡 → 緊急預備金月數卡
  const order = await page.evaluate(() => {
    const cardIndex = (testId: string) => {
      const card = document.querySelector(
        `[data-testid="${testId}"]`
      )?.parentElement;
      return card?.parentElement
        ? Array.from(card.parentElement.children).indexOf(card)
        : -1;
    };
    return {
      payment: cardIndex("total-monthly-debt-payment"),
      ratio: cardIndex("debt-service-ratio-value"),
    };
  });
  expect(order.payment).toBeGreaterThan(-1);
  expect(order.ratio).toBe(order.payment + 1);

  await page.getByLabel("償債負擔率計算公式說明").click();
  const formula = page.getByTestId("formula-info-content");
  await expect(formula).toContainText(
    "償債負擔率 = 本月應還款總額 ÷ 總收入 × 100%"
  );
  await expect(formula).toContainText("$12,000 ÷ $60,000 × 100% = 20.0%");
});

// PRD 第 9 節 #61i：兩種提示詞模式在本月應還款總額之後各有一行償債負擔率
test("財務健康檢查與負債清償策略提示詞包含償債負擔率", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await addDebtPaying12000(page);
  await page.getByText("+ 新增收入").click();
  await page.getByLabel("收入金額").fill("30000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-message")).toHaveText(
    "已更新並儲存今日資料。"
  );

  const copyPrompt = async (mode: string) => {
    await page.getByLabel("AI 分析提示詞模式").selectOption({ label: mode });
    await page.getByTestId("copy-prompt-button").click();
    await expect(page.getByTestId("copy-prompt-message")).toHaveText(
      "已複製到剪貼簿，可貼給 AI 分析。"
    );
    return page.evaluate(() => navigator.clipboard.readText());
  };
  const expectedLines =
    "- 本月應還款總額：$12,000\n- 償債負擔率：40.0%（負擔偏重；本月應還款總額 $12,000 ÷ 總收入 $30,000）";

  expect(await copyPrompt("財務健康檢查")).toContain(expectedLines);
  expect(await copyPrompt("負債清償策略")).toContain(expectedLines);
});

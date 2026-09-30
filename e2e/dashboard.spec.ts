import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("首次載入顯示空狀態看板與趨勢圖提示", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "個人資產負債儀表板" })
  ).toBeVisible();
  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  await expect(page.getByText("尚未新增現金來源")).toBeVisible();
  await expect(
    page.getByText("持續使用滿 2 天即可查看趨勢").first()
  ).toBeVisible();
  // 尚無任何快照時不顯示趨勢圖範圍下拉選單
  await expect(page.getByLabel("趨勢圖範圍")).toHaveCount(0);
});

test("輸入現金與台股市值後，看板數字即時更新（尚未存檔）", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("來源名稱").fill("測試銀行");
  await page.getByLabel("金額").fill("100000");
  await page.locator('label:has-text("台股市值") input').fill("50000");

  await expect(page.getByTestId("total-assets")).toHaveText("$150,000");
  await expect(page.getByTestId("net-worth")).toHaveText("$150,000");
  await expect(page.getByTestId("save-button")).toBeEnabled();
});

// PRD 4.2 節：未按下「更新儀表板」的變更不會被保留
test("未存檔的變更在重新整理後不會保留", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("99999");
  await expect(page.getByTestId("total-assets")).toHaveText("$99,999");

  await page.reload();

  await expect(page.getByTestId("total-assets")).toHaveText("$0");
  await expect(page.getByText("尚未新增現金來源")).toBeVisible();
});

// PRD 第 9 節 #7a：複製現金來源只影響今日草稿
test("複製現金來源會在下方新增同名、金額 0 的來源，未存檔重新整理後消失", async ({
  page,
}) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("來源名稱").fill("富邦");
  await page.getByLabel("金額").fill("100000");

  await page.getByRole("button", { name: "複製 富邦" }).click();

  await expect(page.getByLabel("來源名稱")).toHaveCount(2);
  await expect(page.getByLabel("來源名稱").nth(1)).toHaveValue("富邦");
  // 金額 0 在欄位中顯示為空白（placeholder 為 0）
  await expect(page.getByLabel("金額").nth(1)).toHaveValue("");
  await expect(page.getByLabel("金額").nth(1)).toBeFocused();
  await expect(page.getByTestId("total-assets")).toHaveText("$100,000");

  await page.reload();

  await expect(page.getByText("尚未新增現金來源")).toBeVisible();
});

// PRD 第 9 節 #3～#6：負債比燈號邊界即時反映
test("負債比燈號隨輸入即時切換健康狀態", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("100000");

  await expect(page.getByTestId("debt-ratio-status")).toHaveText("完美無債");

  await page.getByText("+ 新增負債").click();
  const principalInput = page.getByLabel("剩餘本金");

  await principalInput.fill("39990");
  await expect(page.getByTestId("debt-ratio-status")).toHaveText(
    "財務健康（安全範圍）"
  );

  await principalInput.fill("40000");
  await expect(page.getByTestId("debt-ratio-status")).toHaveText(
    "負債偏高（需注意調控）"
  );

  await principalInput.fill("60001");
  await expect(page.getByTestId("debt-ratio-status")).toHaveText(
    "財務高風險（請儘速理債）"
  );
});

// 美股市值可切換計價幣別：USD 需乘匯率、TWD 直接採用輸入的台幣等值金額
test("美股市值可切換 USD/TWD 計價，切換後總資產與匯率欄位跟著變化", async ({
  page,
}) => {
  await page.getByLabel("美股市值", { exact: true }).fill("1000");
  await page.locator('label:has-text("美股匯率") input').fill("32");

  await expect(page.getByTestId("total-assets")).toHaveText("$32,000");
  await expect(page.locator('label:has-text("美股匯率")')).toBeVisible();

  await page.getByRole("button", { name: "TWD", exact: true }).click();

  // 切到 TWD 模式：匯率欄位消失，美股市值 1000 直接當台幣使用，不再乘 32
  await expect(page.locator('label:has-text("美股匯率")')).toHaveCount(0);
  await expect(page.getByTestId("total-assets")).toHaveText("$1,000");

  await page.getByRole("button", { name: "USD", exact: true }).click();

  // 切回 USD：先前輸入的匯率仍保留，重新乘回去
  await expect(page.locator('label:has-text("美股匯率")')).toBeVisible();
  await expect(page.getByTestId("total-assets")).toHaveText("$32,000");
});

test("按下更新儀表板後正式存檔，重新整理後資料仍在", async ({ page }) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("50000");

  const saveButton = page.getByTestId("save-button");
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect(page.getByTestId("save-message")).toBeVisible();
  await expect(saveButton).toBeDisabled();

  await page.reload();

  await expect(page.getByTestId("total-assets")).toHaveText("$50,000");
  await expect(page.getByLabel("趨勢圖範圍")).toBeVisible();
});

// PRD 第 9 節 #14b、#14c：趨勢圖節點 Tooltip 與全螢幕展開
test("趨勢圖節點可點擊顯示 tooltip，並可全螢幕展開檢視", async ({ page }) => {
  await page.evaluate(() => {
    const dates = Array.from({ length: 5 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (4 - i));
      return d.toISOString().slice(0, 10);
    });
    const snapshots = dates.map((date, i) => ({
      date,
      updatedAt: `${date}T09:00:00.000Z`,
      cashSources: [{ id: `c${i}`, name: "現金", amount: 100000 + i * 10000 }],
      twStockValue: 200000 + i * 5000,
      usStockValue: 0,
      usStockCurrency: "USD",
      exchangeRate: 0,
      debts: [],
      incomeSources: [],
      monthlyExpense: 0,
    }));
    window.localStorage.setItem(
      "my_finance_dashboard_data",
      JSON.stringify({ schemaVersion: 4, snapshots })
    );
  });
  await page.reload();

  const trendCard = page.locator("text=淨資產趨勢").locator("..").locator("..");
  await trendCard.getByTestId("chart-node-2").click();
  await expect(trendCard.getByTestId("chart-tooltip")).toBeVisible();

  await page.getByLabel("淨資產趨勢全螢幕檢視").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("chart-node-2")).toBeVisible();

  await dialog.getByTestId("chart-node-2").click();
  await expect(dialog.getByTestId("chart-tooltip")).toBeVisible();
});

// 歷史趨勢區新增的現金趨勢／股票趨勢卡片，各自反映最新一筆快照的現金／股票市值總額
test("現金趨勢與股票趨勢卡片顯示最新一筆快照的對應總額", async ({ page }) => {
  await page.evaluate(() => {
    const dates = Array.from({ length: 3 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (2 - i));
      return d.toISOString().slice(0, 10);
    });
    const snapshots = dates.map((date, i) => ({
      date,
      updatedAt: `${date}T09:00:00.000Z`,
      cashSources: [{ id: `c${i}`, name: "現金", amount: 100000 + i * 10000 }],
      twStockValue: 200000 + i * 5000,
      usStockValue: 0,
      usStockCurrency: "USD",
      exchangeRate: 0,
      debts: [],
      incomeSources: [],
      monthlyExpense: 0,
    }));
    window.localStorage.setItem(
      "my_finance_dashboard_data",
      JSON.stringify({ schemaVersion: 4, snapshots })
    );
  });
  await page.reload();

  // 最新一筆（第 3 筆，i=2）：現金 120,000、台股市值 210,000
  const cashCard = page.locator("text=現金趨勢").locator("..").locator("..");
  await expect(cashCard.getByText("$120,000")).toBeVisible();

  const stockCard = page.locator("text=股票趨勢").locator("..").locator("..");
  await expect(stockCard.getByText("$210,000")).toBeVisible();
});

// PRD 4.2、5.2a 節：負債剩餘本金／期數自動估算
test("今日草稿自動估算負債剩餘本金與期數，並標示系統估算，手動修改後標記消失", async ({
  page,
}) => {
  await page.evaluate(() => {
    const now = new Date();
    const total = now.getFullYear() * 12 + now.getMonth() - 2;
    const pastYear = Math.floor(total / 12);
    const pastMonth = (total % 12) + 1;
    const pastDate = `${pastYear}-${String(pastMonth).padStart(2, "0")}-01`;
    window.localStorage.setItem(
      "my_finance_dashboard_data",
      JSON.stringify({
        schemaVersion: 4,
        snapshots: [
          {
            date: pastDate,
            updatedAt: `${pastDate}T09:00:00.000Z`,
            cashSources: [],
            twStockValue: 0,
            usStockValue: 0,
            usStockCurrency: "USD",
            exchangeRate: 0,
            debts: [
              {
                id: "d1",
                name: "房貸",
                category: "房貸",
                principal: 3000000,
                annualRate: 2.4,
                remainingMonths: 240,
                repaymentMethod: "amortizing",
              },
            ],
            incomeSources: [],
            monthlyExpense: 0,
          },
        ],
      })
    );
  });
  await page.reload();

  const principalInput = page.getByLabel("剩餘本金");
  const monthsInput = page.getByLabel("剩餘還款期數");

  // 3 個月前的快照，經過 2 個曆月，剩餘期數應為 238，本金應小於原始 3,000,000
  await expect(monthsInput).toHaveValue("238");
  await expect(principalInput).not.toHaveValue("3000000");
  await expect(page.getByText("系統估算")).toHaveCount(2);

  await principalInput.fill("2900000");

  // 手動修改本金後，只有本金欄位的估算標記消失，期數欄位仍維持估算標記
  await expect(page.getByText("系統估算")).toHaveCount(1);
});

// PRD 第 9 節 #40／#40a：不可動用現金不計入緊急預備金月數與現金比例，仍計入總資產
test("標記現金來源為不可動用後，緊急預備金月數與現金比例排除該筆，總資產不變", async ({
  page,
}) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("來源名稱").nth(0).fill("活存");
  await page.getByLabel("金額").nth(0).fill("200000");
  await page.getByLabel("來源名稱").nth(1).fill("期貨保證金");
  await page.getByLabel("金額").nth(1).fill("100000");
  await page.locator('label:has-text("本月支出") input').fill("30000");

  // 尚未標記：全部 300,000 都算預備金 → 10.0 個月
  await expect(page.getByTestId("total-assets")).toHaveText("$300,000");
  await expect(page.getByTestId("emergency-fund-value")).toHaveText(
    "10.0 個月"
  );

  await page
    .getByRole("button", { name: "標記 期貨保證金 為不可動用" })
    .click();

  await expect(page.getByTestId("total-assets")).toHaveText("$300,000");
  await expect(page.getByTestId("emergency-fund-value")).toHaveText("6.7 個月");
  await expect(page.getByTestId("emergency-fund-restricted-note")).toHaveText(
    "不含不可動用現金 $100,000"
  );
  await expect(page.getByTestId("restricted-cash-total")).toContainText(
    "$100,000"
  );
  // 現金比例＝可動用現金 ÷ 金融資產 = 200,000 ÷ 300,000
  await expect(page.getByTestId("cash-ratio-value")).toHaveText("66.7%");
  await expect(
    page.getByTestId("asset-allocation-segment-restrictedCash")
  ).toBeVisible();

  // 「不可動用」狀態隨快照存檔，重新整理後仍在
  await page.getByTestId("save-button").click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "標記 期貨保證金 為不可動用" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("emergency-fund-value")).toHaveText("6.7 個月");
});

// PRD 第 9 節 #41／#41a：不動產計入總資產與淨資產，但不影響配置比例分母
test("填入不動產市值後，總資產與淨資產增加，負債比下降，配置比例不受影響", async ({
  page,
}) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("200000");
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("剩餘本金").fill("6000000");

  // 沒有不動產：負債比 = 6,000,000 ÷ 200,000 = 3000%
  await expect(page.getByTestId("debt-ratio-status")).toHaveText(
    "財務高風險（請儘速理債）"
  );

  await page.getByLabel(/不動產市值/).fill("10000000");

  await expect(page.getByTestId("total-assets")).toHaveText("$10,200,000");
  await expect(page.getByTestId("net-worth")).toHaveText("$4,200,000");
  await expect(page.getByTestId("debt-ratio-value")).toHaveText("58.8%");
  // 現金比例分母是金融資產（不含不動產），仍為 100%
  await expect(page.getByTestId("cash-ratio-value")).toHaveText("100.0%");
  await expect(
    page.getByTestId("asset-allocation-real-estate-note")
  ).toContainText("不動產 $10,000,000");
});

// PRD 第 9 節 #42／#42c／#42d／#42e：質押整戶維持率
test("質押負債填入質押股票市值後，顯示整戶維持率與距追繳線的下跌空間", async ({
  page,
}) => {
  // 沒有質押負債時不顯示維持率卡
  await expect(page.getByTestId("pledge-maintenance-value")).toHaveCount(0);
  await expect(page.getByTestId("pledge-maintenance-unset")).toHaveCount(0);

  await page.getByText("+ 新增負債").click();
  // 預設類別為信貸，不顯示質押股票市值欄位
  await expect(page.getByLabel("質押股票市值")).toHaveCount(0);

  await page.getByLabel("負債類別").selectOption("質押");
  await page.getByLabel("剩餘本金").fill("500000");

  // 已有質押負債但尚未填質押股票市值：只顯示引導文字
  await expect(page.getByTestId("pledge-maintenance-unset")).toHaveText(
    "尚未填寫質押股票市值"
  );

  await page.getByLabel("質押股票市值").fill("800000");

  await expect(page.getByTestId("pledge-maintenance-value")).toHaveText(
    "160.0%"
  );
  await expect(page.getByTestId("pledge-maintenance-status")).toHaveText(
    "維持率安全"
  );
  await expect(page.getByTestId("pledge-maintenance-drop")).toContainText(
    "擔保品再下跌 18.8% 將觸及 130% 追繳線"
  );
  await expect(page.getByTestId("debt-maintenance-ratio")).toHaveText("160.0%");

  // 股價下跌、質押股票市值低於追繳線
  await page.getByLabel("質押股票市值").fill("600000");
  await expect(page.getByTestId("pledge-maintenance-status")).toHaveText(
    "低於追繳線"
  );
  await expect(page.getByTestId("pledge-maintenance-drop")).toContainText(
    "已低於追繳線"
  );

  // 改成房貸：欄位隱藏，維持率卡消失
  await page.getByLabel("負債類別").selectOption("房貸");
  await expect(page.getByLabel("質押股票市值")).toHaveCount(0);
  await expect(page.getByTestId("pledge-maintenance-value")).toHaveCount(0);
});

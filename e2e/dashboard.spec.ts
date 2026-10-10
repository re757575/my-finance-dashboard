import { expect, test, type Page } from "@playwright/test";
import { expandInputSections, expandSnapshotSections } from "./helpers";

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
  // 已有快照且沒有質押負債：「負債」預設收合
  await expandInputSections(page);

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

// PRD 第 9 節 #60a～#60j：有不動產與房貸時並列的三項對照指標
test("有不動產與房貸時，另列金融負債比、含償還本金的儲蓄率與可投資淨資產進度", async ({
  page,
}) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("1000000");
  await page.locator('label:has-text("台股市值") input').fill("3000000");
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("剩餘本金").fill("400000");
  await page.getByText("+ 新增收入").click();
  await page.getByLabel("收入金額").fill("100000");
  await page.locator('label:has-text("本月支出") input').fill("40000");
  await page.getByRole("textbox", { name: "目標淨資產" }).fill("20000000");

  // 沒有不動產也沒有房貸、沒有攤還中的負債：三項對照指標都與原數字相同，不重複顯示
  await expect(page.getByTestId("debt-ratio-value")).toHaveText("10.0%");
  await expect(page.getByTestId("goal-progress-value")).toHaveText("18.0%");
  await expect(page.getByTestId("savings-rate-value")).toHaveText("60.0%");
  await expect(page.getByTestId("financial-debt-ratio")).toHaveCount(0);
  await expect(page.getByTestId("savings-rate-with-principal")).toHaveCount(0);
  await expect(page.getByTestId("goal-progress-investable")).toHaveCount(0);

  // 填入不動產：負債比被稀釋到 2.5%，金融負債比仍是 400,000 ÷ 4,000,000
  await page.getByLabel(/不動產市值/).fill("12000000");
  await expect(page.getByTestId("debt-ratio-value")).toHaveText("2.5%");
  await expect(page.getByTestId("financial-debt-ratio-value")).toHaveText(
    "10.0%"
  );
  await expect(page.getByTestId("financial-debt-ratio-status")).toHaveText(
    "財務健康（安全範圍）"
  );

  // 新增房貸 6,000,000（年利率 2.4%、240 期本息平均攤還）
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("負債類別").nth(1).selectOption("房貸");
  await page.getByLabel("剩餘本金").nth(1).fill("6000000");
  await page.getByLabel("年利率").nth(1).fill("2.4");
  await page.getByLabel("剩餘還款期數").nth(1).fill("240");

  // 負債比 = 6,400,000 ÷ 16,000,000；金融負債比不含房貸，維持 10.0%
  await expect(page.getByTestId("debt-ratio-value")).toHaveText("40.0%");
  await expect(page.getByTestId("debt-ratio-status")).toHaveText(
    "負債偏高（需注意調控）"
  );
  await expect(page.getByTestId("financial-debt-ratio-value")).toHaveText(
    "10.0%"
  );
  await expect(page.getByTestId("financial-debt-ratio-status")).toHaveText(
    "財務健康（安全範圍）"
  );

  // 儲蓄率：月付 ≈ 31,503（利息 12,000＋本金 ≈ 19,503），主數字與燈號仍為現金基礎
  await expect(page.getByTestId("savings-rate-value")).toHaveText("28.5%");
  await expect(page.getByTestId("savings-rate-status")).toHaveText("高儲蓄率");
  await expect(page.getByTestId("savings-rate-with-principal")).toHaveText(
    "含償還本金 48.0%（本月還本 $19,503）"
  );

  // 目標進度：淨資產 9,600,000 ÷ 20,000,000；可投資淨資產 = 4,000,000 − 400,000
  await expect(page.getByTestId("goal-progress-value")).toHaveText("48.0%");
  await expect(page.getByTestId("goal-progress-investable-value")).toHaveText(
    "18.0%"
  );
  await expect(page.getByTestId("goal-progress-investable")).toContainText(
    "可投資淨資產 $3,600,000 ／ 目標 $20,000,000"
  );
  // 預估達成時間仍以淨資產計算，照常顯示
  await expect(page.getByTestId("goal-eta-budget")).toBeVisible();

  // 公式說明同時列出兩個負債比的代入數值
  await page.getByLabel("負債比計算公式說明").click();
  await expect(page.getByTestId("formula-info-content")).toContainText(
    "$400,000 ÷ $4,000,000 × 100% = 10.0%"
  );
  await page.keyboard.press("Escape");

  // 皆為即時計算、不新增欄位：存檔並重新整理後結果相同
  await page.getByTestId("save-button").click();
  await page.reload();
  await expect(page.getByTestId("financial-debt-ratio-value")).toHaveText(
    "10.0%"
  );
  await expect(page.getByTestId("savings-rate-with-principal")).toContainText(
    "含償還本金 48.0%"
  );
  await expect(page.getByTestId("goal-progress-investable-value")).toHaveText(
    "18.0%"
  );
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

// PRD 第 9 節 #44～#44g：股票壓力測試
test("壓力測試：沒有股票時不顯示，持有股票後可一鍵切換 −10%／−20%／−30% 情境", async ({
  page,
}) => {
  await expect(page.getByRole("group", { name: "股票下跌情境" })).toHaveCount(
    0
  );

  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("300000");
  await page.locator('label:has-text("台股市值") input').fill("700000");
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("剩餘本金").fill("400000");

  const twenty = page.getByRole("button", { name: "\u221220%" });
  await expect(twenty).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("stress-test-stock")).toHaveText(
    "$700,000 → $560,000"
  );
  await expect(page.getByTestId("stress-test-net-worth")).toHaveText(
    "$600,000 → $460,000"
  );
  await expect(page.getByTestId("stress-test-debt-ratio")).toHaveText(
    "40.0% → 46.5%"
  );

  await page.getByRole("button", { name: "\u221230%" }).click();
  await expect(page.getByRole("button", { name: "\u221230%" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(twenty).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("stress-test-stock")).toHaveText(
    "$700,000 → $490,000"
  );

  // 只是試算：不會動到輸入欄位，也不會讓「更新儀表板」變成可點擊之外的狀態
  await expect(page.getByTestId("total-assets")).toHaveText("$1,000,000");
});

test("壓力測試：質押維持率在 −10% 仍高於追繳線，−20% 跌破時顯示警示", async ({
  page,
}) => {
  await page.getByText("+ 新增現金來源").click();
  await page.getByLabel("金額").fill("1000000");
  await page.locator('label:has-text("台股市值") input').fill("1000000");
  await page.getByText("+ 新增負債").click();
  await page.getByLabel("負債類別").selectOption("質押");
  await page.getByLabel("剩餘本金").fill("500000");
  await page.getByLabel("質押股票市值").fill("800000");

  // 有質押負債但維持率尚未跌破：預設 −20% 即跌破
  await expect(page.getByTestId("stress-test-pledge-ratio")).toHaveText(
    "160.0% → 128.0%"
  );
  await expect(page.getByTestId("stress-test-pledge-status")).toHaveText(
    "低於追繳線"
  );
  await expect(
    page.getByTestId("stress-test-margin-call-warning")
  ).toContainText("低於 130% 追繳線");

  await page.getByRole("button", { name: "\u221210%" }).click();
  await expect(page.getByTestId("stress-test-pledge-ratio")).toHaveText(
    "160.0% → 144.0%"
  );
  await expect(page.getByTestId("stress-test-margin-call-warning")).toHaveCount(
    0
  );
});

test("壓力測試不會改動已存檔資料：切換情境後重新整理，數字仍為存檔內容", async ({
  page,
}) => {
  await page.locator('label:has-text("台股市值") input').fill("500000");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-button")).toBeDisabled();

  await page.getByRole("button", { name: "\u221230%" }).click();
  // 切換情境不會讓草稿變成未存檔狀態
  await expect(page.getByTestId("save-button")).toBeDisabled();

  await page.reload();

  await expect(page.getByTestId("total-assets")).toHaveText("$500,000");
  await expect(page.getByTestId("stress-test-stock")).toHaveText(
    "$500,000 → $400,000"
  );
});

/** 本機日期字串（與 App 的 getCurrentDate 一致）：今天往前推 n 天。 */
function dateDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 直接寫入 LocalStorage：由舊到新依序為 100,000／200,000／… 的現金快照。 */
async function seedHistory(page: Page, daysAgo: number[]) {
  await page.evaluate((dates) => {
    const snapshot = (date: string, amount: number) => ({
      date,
      updatedAt: `${date}T00:00:00.000Z`,
      cashSources: [{ id: "c1", name: "銀行", amount, restricted: false }],
      twStockValue: 0,
      usStockValue: 0,
      usStockCurrency: "USD",
      exchangeRate: 0,
      realEstateValue: 0,
      debts: [],
      incomeSources: [],
      monthlyExpense: 0,
      recurringInvestments: [],
      targetNetWorth: 0,
      targetCashRatio: 0,
    });
    localStorage.setItem(
      "my_finance_dashboard_data",
      JSON.stringify({
        schemaVersion: 8,
        snapshots: dates.map((d, i) => snapshot(d, (i + 1) * 100000)),
      })
    );
  }, daysAgo.map(dateDaysAgo));
  await page.reload();
  await expandSnapshotSections(page);
  await expandInputSections(page);
}

function storedAmounts(page: Page) {
  return page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("my_finance_dashboard_data")!
    ).snapshots.map(
      (s: { date: string; cashSources: { amount: number }[] }) => [
        s.date,
        s.cashSources[0].amount,
      ]
    )
  );
}

const rows = (page: Page) => page.locator('[data-testid^="snapshot-row-"]');

// PRD 第 9 節 #48、#48a
test("歷史快照清單：由新到舊、今天沒有修正按鈕、超過 10 筆可展開", async ({
  page,
}) => {
  await expandSnapshotSections(page);
  await expect(page.getByTestId("snapshot-history-empty")).toHaveText(
    "尚未有已存檔的快照"
  );

  await seedHistory(
    page,
    Array.from({ length: 12 }, (_, i) => 12 - i)
  );

  await expect(rows(page)).toHaveCount(10);
  await expect(rows(page).first()).toHaveAttribute(
    "data-testid",
    `snapshot-row-${dateDaysAgo(1)}`
  );
  await page.getByRole("button", { name: "顯示全部（12 筆）" }).click();
  await expect(rows(page)).toHaveCount(12);
  await page.getByRole("button", { name: "收合" }).click();
  await expect(rows(page)).toHaveCount(10);

  // 今天那筆沒有「修正」，仍可刪除
  await seedHistory(page, [3, 0]);
  await expect(
    page.getByRole("button", { name: `修正 ${dateDaysAgo(0)} 的快照` })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `刪除 ${dateDaysAgo(0)} 的快照` })
  ).toBeVisible();
  await expect(
    page.getByTestId(`snapshot-row-${dateDaysAgo(0)}`)
  ).toContainText("今天");
});

// PRD 第 9 節 #48b、#48c、#48e、#48g
test("修正歷史快照：只覆蓋該日，儲存後今日草稿還原，重新整理後仍保留", async ({
  page,
}) => {
  await seedHistory(page, [30, 20, 10]); // 100,000／200,000／300,000
  await page.locator('label:has-text("本月支出") input').fill("30000");

  await page
    .getByRole("button", { name: `修正 ${dateDaysAgo(20)} 的快照` })
    .click();

  await expect(page.getByTestId("snapshot-edit-banner")).toContainText(
    `正在修正 ${dateDaysAgo(20)} 的快照`
  );
  await expect(page.getByTestId("total-assets")).toHaveText("$200,000");
  await expect(page.getByTestId("save-button")).toHaveText(
    "儲存修正（尚未修改）"
  );
  await expect(page.getByTestId("save-button")).toBeDisabled();
  await expect(
    page.getByTestId(`snapshot-row-${dateDaysAgo(20)}`)
  ).toContainText("修正中");

  await page.getByLabel("金額").fill("999");
  await expect(page.getByTestId("save-button")).toHaveText("儲存修正");
  await page.getByTestId("save-button").click();

  await expect(page.getByTestId("save-message")).toHaveText(
    `已更新 ${dateDaysAgo(20)} 的快照。`
  );
  await expect(page.getByTestId("snapshot-edit-banner")).toHaveCount(0);
  // 只有被修正的那一天改變，且沒有多出今天的快照
  expect(await storedAmounts(page)).toEqual([
    [dateDaysAgo(30), 100000],
    [dateDaysAgo(20), 999],
    [dateDaysAgo(10), 300000],
  ]);
  // 今日草稿（含尚未存檔的本月支出）原樣還原
  await expect(page.locator('label:has-text("本月支出") input')).toHaveValue(
    "30,000"
  );
  await expect(page.getByTestId("total-assets")).toHaveText("$300,000");

  await page.reload();
  expect(await storedAmounts(page)).toEqual([
    [dateDaysAgo(30), 100000],
    [dateDaysAgo(20), 999],
    [dateDaysAgo(10), 300000],
  ]);
});

// PRD 第 9 節 #48d、#48i、#48j
test("取消修正會還原今日草稿；修正中可直接切換對象，且停用 AI 提示詞按鈕", async ({
  page,
}) => {
  await seedHistory(page, [30, 20, 10]);
  await page.locator('label:has-text("本月支出") input').fill("30000");
  await expect(page.getByTestId("copy-prompt-button")).toBeEnabled();

  await page
    .getByRole("button", { name: `修正 ${dateDaysAgo(20)} 的快照` })
    .click();
  await expect(page.getByTestId("copy-prompt-button")).toBeDisabled();

  // 直接切換到另一筆
  await page
    .getByRole("button", { name: `修正 ${dateDaysAgo(30)} 的快照` })
    .click();
  await expect(page.getByTestId("total-assets")).toHaveText("$100,000");
  await expect(page.getByTestId("snapshot-edit-banner")).toContainText(
    dateDaysAgo(30)
  );

  await page.getByRole("button", { name: "取消修正" }).click();

  await expect(page.getByTestId("snapshot-edit-banner")).toHaveCount(0);
  await expect(page.locator('label:has-text("本月支出") input')).toHaveValue(
    "30,000"
  );
  await expect(page.getByTestId("total-assets")).toHaveText("$300,000");
  await expect(page.getByTestId("copy-prompt-button")).toBeEnabled();
  // 取消不寫入任何變動
  expect(await storedAmounts(page)).toEqual([
    [dateDaysAgo(30), 100000],
    [dateDaysAgo(20), 200000],
    [dateDaysAgo(10), 300000],
  ]);
});

// PRD 第 9 節 #49、#49a
test("刪除歷史快照：取消不刪，確認後只移除該日", async ({ page }) => {
  await seedHistory(page, [30, 20, 10]);

  await page
    .getByRole("button", { name: `刪除 ${dateDaysAgo(20)} 的快照` })
    .click();
  await expect(
    page.getByText(`確認刪除 ${dateDaysAgo(20)} 的快照？`)
  ).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(rows(page)).toHaveCount(3);

  await page
    .getByRole("button", { name: `刪除 ${dateDaysAgo(20)} 的快照` })
    .click();
  await page.getByRole("button", { name: "確認刪除" }).click();

  await expect(page.getByTestId("save-message")).toHaveText(
    `已刪除 ${dateDaysAgo(20)} 的快照。`
  );
  await expect(rows(page)).toHaveCount(2);
  expect(await storedAmounts(page)).toEqual([
    [dateDaysAgo(30), 100000],
    [dateDaysAgo(10), 300000],
  ]);
});

// PRD 第 9 節 #49b、#49c
test("刪除到剩 1 筆時趨勢圖回到空狀態；刪光後顯示空狀態且新鮮度提示消失；刪除修正中的那筆會離開修正模式", async ({
  page,
}) => {
  await seedHistory(page, [30, 20]);
  await expect(page.getByTestId("data-freshness")).toBeVisible();

  await page
    .getByRole("button", { name: `刪除 ${dateDaysAgo(30)} 的快照` })
    .click();
  await page.getByRole("button", { name: "確認刪除" }).click();
  await expect(
    page.getByText("持續使用滿 2 天即可查看趨勢").first()
  ).toBeVisible();

  // 修正中刪除該筆 → 自動離開修正模式
  await page
    .getByRole("button", { name: `修正 ${dateDaysAgo(20)} 的快照` })
    .click();
  await expect(page.getByTestId("snapshot-edit-banner")).toBeVisible();
  await page
    .getByRole("button", { name: `刪除 ${dateDaysAgo(20)} 的快照` })
    .click();
  await page.getByRole("button", { name: "確認刪除" }).click();

  await expect(page.getByTestId("snapshot-edit-banner")).toHaveCount(0);
  await expect(page.getByTestId("snapshot-history-empty")).toHaveText(
    "尚未有已存檔的快照"
  );
  await expect(page.getByTestId("data-freshness")).toHaveCount(0);
});

// PRD 第 9 節 #49d
test("刪除今天已存檔的快照：表單內容保留，回到未存檔狀態", async ({ page }) => {
  await seedHistory(page, [3, 0]);
  await expect(page.getByTestId("save-button")).toBeDisabled();
  await expect(page.getByTestId("total-assets")).toHaveText("$200,000");

  await page
    .getByRole("button", { name: `刪除 ${dateDaysAgo(0)} 的快照` })
    .click();
  await page.getByRole("button", { name: "確認刪除" }).click();

  await expect(page.getByTestId("total-assets")).toHaveText("$200,000");
  await expect(page.getByTestId("save-button")).toBeEnabled();
  await expect(rows(page)).toHaveCount(1);
});

// PRD 第 9 節 #48k、#48l：展開後在固定高度內捲動，不撐長頁面
test("歷史快照展開 400 筆後在區塊內捲動，頁面高度不隨筆數增加，並可用鍵盤聚焦", async ({
  page,
}) => {
  await seedHistory(
    page,
    Array.from({ length: 400 }, (_, i) => 400 - i)
  );
  const list = page.getByTestId("snapshot-history-list");

  // 收合：10 筆，沒有內部捲動
  await expect(rows(page)).toHaveCount(10);
  expect(await list.evaluate((el) => getComputedStyle(el).overflowY)).not.toBe(
    "auto"
  );
  const collapsedPageHeight = await page.evaluate(
    () => document.documentElement.scrollHeight
  );

  await page.getByRole("button", { name: "顯示全部（400 筆）" }).click();

  // 展開：400 筆，但清單高度被限制在 24rem（384px）以內並可捲動
  await expect(rows(page)).toHaveCount(400);
  const metrics = await list.evaluate((el) => ({
    overflowY: getComputedStyle(el).overflowY,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));
  expect(metrics.overflowY).toBe("auto");
  expect(metrics.clientHeight).toBeLessThanOrEqual(384);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight * 5);

  // 頁面整體高度只增加「清單上限」的量，不會隨 400 筆線性膨脹
  const expandedPageHeight = await page.evaluate(
    () => document.documentElement.scrollHeight
  );
  expect(expandedPageHeight - collapsedPageHeight).toBeLessThan(400);

  // 可捲到最舊的一筆；鍵盤可聚焦捲動區
  await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(
    page.getByTestId(`snapshot-row-${dateDaysAgo(400)}`)
  ).toBeInViewport();
  await page.getByRole("list", { name: "歷史快照清單" }).focus();
  await expect(page.getByRole("list", { name: "歷史快照清單" })).toBeFocused();

  // 收合後捲軸消失
  await page.getByRole("button", { name: "收合" }).click();
  await expect(rows(page)).toHaveCount(10);
  expect(await list.evaluate((el) => getComputedStyle(el).overflowY)).not.toBe(
    "auto"
  );
});

/** 寫入「含收入、支出、負債與股票」的快照，用來驗證儲蓄率／月付／資產配置三張新趨勢圖。 */
async function seedRichHistory(page: Page, daysAgo: number[]) {
  await page.evaluate((dates) => {
    const snapshot = (date: string, i: number) => ({
      date,
      updatedAt: `${date}T00:00:00.000Z`,
      cashSources: [
        { id: "c1", name: "銀行", amount: 100000, restricted: false },
      ],
      twStockValue: 100000,
      usStockValue: 0,
      usStockCurrency: "USD",
      exchangeRate: 0,
      realEstateValue: 0,
      debts: [
        {
          id: "d1",
          name: "信貸",
          category: "信貸",
          principal: 120000 - i * 30000,
          annualRate: 0,
          remainingMonths: 12,
          repaymentMethod: "amortizing",
          collateralValue: 0,
        },
      ],
      incomeSources: [{ id: "i1", name: "薪資", amount: 100000 }],
      monthlyExpense: 40000 - i * 10000,
      recurringInvestments: [],
      targetNetWorth: 0,
      targetCashRatio: 0,
    });
    localStorage.setItem(
      "my_finance_dashboard_data",
      JSON.stringify({
        schemaVersion: 8,
        snapshots: dates.map((d, i) => snapshot(d, i)),
      })
    );
  }, daysAgo.map(dateDaysAgo));
  await page.reload();
}

const trendCard = (page: Page, title: string) =>
  page.locator("div.rounded-xl").filter({ hasText: title }).first();

/** 切換歷史趨勢圖區的分頁：圖表依分頁分組，一次只顯示一組（PRD 4.2「趨勢圖分組分頁」）。 */
const selectTrendTab = (page: Page, name: "資產" | "負債" | "配置與儲蓄") =>
  page.getByRole("tab", { name, exact: true }).click();

// PRD 第 9 節 #50、#50b、#50d：儲蓄率、每月應還款、資產配置三張新趨勢圖
test("新增的儲蓄率、每月應還款、資產配置趨勢圖顯示對應數值", async ({
  page,
}) => {
  // i=0：月付 10,000、支出 40,000 → 儲蓄率 50%；i=1：月付 7,500、支出 30,000 → 儲蓄率 62.5%
  await seedRichHistory(page, [10, 5]);

  // 每月應還款在「負債」分頁
  await selectTrendTab(page, "負債");
  const debtCard = trendCard(page, "每月應還款趨勢");
  await expect(debtCard).toContainText("$7,500");
  await expect(debtCard).toContainText("▼ $2,500 (-25.0%)");

  // 儲蓄率、資產配置在「配置與儲蓄」分頁
  await selectTrendTab(page, "配置與儲蓄");
  await expect(trendCard(page, "儲蓄率趨勢")).toContainText("62.5%");
  await expect(page.getByTestId("allocation-legend")).toContainText(
    "現金 50.0%"
  );
  await expect(page.getByTestId("allocation-legend")).toContainText(
    "台股 50.0%"
  );
  // 沒有不可動用現金：不畫該層
  await expect(page.getByTestId("allocation-layer-restrictedCash")).toHaveCount(
    0
  );
  await expect(page.getByTestId("allocation-layer-cash")).toBeVisible();
});

// PRD 第 9 節 #50e、#50i：資產配置趨勢圖 Tooltip 與全螢幕 Y 軸 0–100%
test("資產配置趨勢圖：點擊節點顯示各類占比，全螢幕顯示 0%～100% 刻度", async ({
  page,
}) => {
  await seedRichHistory(page, [10, 5]);

  await selectTrendTab(page, "配置與儲蓄");
  await page.getByRole("button", { name: "資產配置趨勢全螢幕檢視" }).click();
  const dialog = page.getByRole("dialog");
  for (const tick of ["0%", "25%", "50%", "75%", "100%"]) {
    await expect(dialog.getByText(tick, { exact: true })).toBeVisible();
  }
  await dialog.getByTestId("chart-node-1").click();
  await expect(dialog.getByTestId("chart-tooltip")).toContainText("現金 50.0%");
  await expect(dialog.getByTestId("chart-tooltip")).toContainText("台股 50.0%");
});

// PRD 第 9 節 #50k、#58g：只有 1 筆快照時，三個分頁共八張趨勢卡片都是空狀態
test("只有 1 筆快照時，八張趨勢卡片都顯示空狀態", async ({ page }) => {
  await seedRichHistory(page, [3]);

  const emptyHint = page.getByText("持續使用滿 2 天即可查看趨勢");
  // 資產：淨資產、現金、股票
  await expect(emptyHint).toHaveCount(3);
  // 負債：負債比、資產負債對比、每月應還款
  await selectTrendTab(page, "負債");
  await expect(page.getByText("每月應還款趨勢")).toBeVisible();
  await expect(emptyHint).toHaveCount(3);
  // 配置與儲蓄：資產配置、儲蓄率
  await selectTrendTab(page, "配置與儲蓄");
  await expect(page.getByText("儲蓄率趨勢")).toBeVisible();
  await expect(emptyHint).toHaveCount(2);
});

import { expect, test, type Page } from "@playwright/test";
import {
  CURRENT_SCHEMA_VERSION,
  dateDaysAgo,
  expandSnapshotSections,
  makeSnapshot,
  seedFinanceData,
  STORAGE_KEY,
} from "./helpers";

// PRD 4.2「快照備註」、第 7 節「快照備註」、第 9 節 #72a～#72i

test.beforeEach(async ({ page }) => {
  // 只在測試開始前清空一次；不可用 addInitScript，否則測試中的 page.reload() 也會被清空
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

interface SeedSnapshot {
  daysAgo: number;
  cash: number;
  /** 省略時不寫入 note 欄位，用來模擬 schema v8 的舊資料。 */
  note?: string;
}

/** 直接寫入 LocalStorage：每筆快照一個現金來源與一筆台股市值。 */
async function seedSnapshots(
  page: Page,
  snapshots: SeedSnapshot[],
  schemaVersion = CURRENT_SCHEMA_VERSION
) {
  await seedFinanceData(
    page,
    snapshots.map(({ daysAgo, cash, note }) => {
      const snapshot = makeSnapshot(dateDaysAgo(daysAgo), {
        cashSources: [
          { id: "c1", name: "銀行", amount: cash, restricted: false },
        ],
        twStockValue: 200000,
      });
      if (note !== undefined) return { ...snapshot, note };
      // 沒給 note：拿掉這個欄位，還原成 v8 以前的資料形狀
      const { note: _note, ...legacy } = snapshot;
      return legacy;
    }),
    schemaVersion
  );
  await expect(page.getByTestId("input-form")).toHaveAttribute(
    "aria-busy",
    "false"
  );
}

async function storedData(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    STORAGE_KEY
  );
}

/** 已存檔的「日期 → 備註」。 */
async function storedNotes(page: Page): Promise<Record<string, string>> {
  const data = await storedData(page);
  return Object.fromEntries(
    data.snapshots.map((s: { date: string; note: string }) => [s.date, s.note])
  );
}

const noteInput = (page: Page) => page.getByLabel("快照備註（選填）");
const saveButton = (page: Page) => page.getByTestId("save-button");
const historyNote = (page: Page, date: string) =>
  page.getByTestId(`snapshot-note-${date}`);
const noteMarkers = (scope: ReturnType<Page["locator"]>) =>
  scope.locator('[data-testid^="chart-note-marker-"]');
const chartCard = (page: Page, title: string) =>
  page.getByRole("tabpanel").locator("> div").filter({ hasText: title });

// #72a
test("輸入備註並存檔：歷史快照顯示備註，重新整理後仍在", async ({ page }) => {
  const today = dateDaysAgo(0);
  await expect(noteInput(page)).toHaveValue("");
  await expect(noteInput(page)).toHaveAttribute("maxlength", "50");

  await noteInput(page).fill("買房");
  await saveButton(page).click();
  await expect(page.getByTestId("save-message")).toHaveText(
    "已更新並儲存今日資料。"
  );

  await expandSnapshotSections(page);
  await expect(historyNote(page, today)).toHaveText("備註：買房");
  expect((await storedData(page)).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(await storedNotes(page)).toEqual({ [today]: "買房" });

  await page.reload();
  await expect(noteInput(page)).toHaveValue("買房");
  await expect(saveButton(page)).toBeDisabled();
});

// #72c
test("存檔時去除前後空白並合併連續空白；只有空白視為沒有備註", async ({
  page,
}) => {
  const today = dateDaysAgo(0);

  await noteInput(page).fill("  換工作   加薪 ");
  await saveButton(page).click();
  await expect(noteInput(page)).toHaveValue("換工作 加薪");
  expect(await storedNotes(page)).toEqual({ [today]: "換工作 加薪" });

  await noteInput(page).fill("   ");
  await saveButton(page).click();
  await expect(noteInput(page)).toHaveValue("");
  expect(await storedNotes(page)).toEqual({ [today]: "" });
  await expandSnapshotSections(page);
  await expect(historyNote(page, today)).toHaveCount(0);
});

// #72b
test("今日表單帶入最近一筆資料時不沿用備註", async ({ page }) => {
  const yesterday = dateDaysAgo(1);
  const today = dateDaysAgo(0);
  await seedSnapshots(page, [{ daysAgo: 1, cash: 500000, note: "買房" }]);

  // 其餘欄位照常帶入，只有備註是空的
  await expect(page.getByLabel("金額", { exact: true })).toHaveValue("500,000");
  await expect(noteInput(page)).toHaveValue("");

  await saveButton(page).click();
  await expandSnapshotSections(page);
  await expect(historyNote(page, yesterday)).toHaveText("備註：買房");
  await expect(page.getByTestId(`snapshot-row-${today}`)).toBeVisible();
  await expect(historyNote(page, today)).toHaveCount(0);
  expect(await storedNotes(page)).toEqual({ [yesterday]: "買房", [today]: "" });
});

// #72e
test("趨勢圖：有備註的節點以圓環標示，Tooltip 多一行備註，全螢幕相同", async ({
  page,
}) => {
  await seedSnapshots(page, [
    { daysAgo: 2, cash: 100000, note: "" },
    { daysAgo: 1, cash: 150000, note: "換工作" },
    { daysAgo: 0, cash: 180000, note: "" },
  ]);

  const card = chartCard(page, "淨資產趨勢");
  await expect(noteMarkers(card)).toHaveCount(1);
  await expect(card.getByTestId("chart-note-marker-1")).toBeVisible();

  await card.getByTestId("chart-node-1").click();
  await expect(card.getByTestId("chart-tooltip")).toContainText(dateDaysAgo(1));
  await expect(card.getByTestId("chart-tooltip-note")).toHaveText(
    "備註：換工作"
  );

  // 沒有備註的節點不多這一行
  await card.getByTestId("chart-node-0").click();
  await expect(card.getByTestId("chart-tooltip")).toContainText(dateDaysAgo(2));
  await expect(card.getByTestId("chart-tooltip-note")).toHaveCount(0);

  // 同一個分頁的其他折線圖也有標記
  await expect(noteMarkers(chartCard(page, "現金趨勢"))).toHaveCount(1);
  await expect(noteMarkers(chartCard(page, "股票趨勢"))).toHaveCount(1);

  await page.getByLabel("淨資產趨勢全螢幕檢視").click();
  const dialog = page.getByRole("dialog");
  await expect(noteMarkers(dialog)).toHaveCount(1);
  await dialog.getByTestId("chart-node-1").click();
  await expect(dialog.getByTestId("chart-tooltip-note")).toHaveText(
    "備註：換工作"
  );
});

// #72f
test("長條圖與堆疊面積圖：同一個節點上方有標記，Tooltip 含備註", async ({
  page,
}) => {
  await seedSnapshots(page, [
    { daysAgo: 2, cash: 100000, note: "" },
    { daysAgo: 1, cash: 150000, note: "換工作" },
    { daysAgo: 0, cash: 180000, note: "" },
  ]);

  await page.getByRole("tab", { name: "負債" }).click();
  const barCard = chartCard(page, "資產負債對比");
  await expect(noteMarkers(barCard)).toHaveCount(1);
  await expect(barCard.getByTestId("chart-note-marker-1")).toBeVisible();
  await barCard.getByTestId("chart-node-1").click();
  await expect(barCard.getByTestId("chart-tooltip")).toContainText(
    "資產 $350,000"
  );
  await expect(barCard.getByTestId("chart-tooltip-note")).toHaveText(
    "備註：換工作"
  );

  await page.getByRole("tab", { name: "配置與儲蓄" }).click();
  const areaCard = chartCard(page, "資產配置趨勢");
  await expect(noteMarkers(areaCard)).toHaveCount(1);
  await expect(areaCard.getByTestId("chart-note-marker-1")).toBeVisible();
  await areaCard.getByTestId("chart-node-1").click();
  await expect(areaCard.getByTestId("chart-tooltip-note")).toHaveText(
    "備註：換工作"
  );
  await expect(noteMarkers(chartCard(page, "儲蓄率趨勢"))).toHaveCount(1);
});

// #72g
test("修正歷史快照：補寫那一天的備註，離開後還原今天的備註", async ({
  page,
}) => {
  const past = dateDaysAgo(3);
  const today = dateDaysAgo(0);
  await seedSnapshots(page, [
    { daysAgo: 3, cash: 100000, note: "" },
    { daysAgo: 0, cash: 180000, note: "今天的事" },
  ]);
  await expect(noteInput(page)).toHaveValue("今天的事");

  await expandSnapshotSections(page);
  await page.getByRole("button", { name: `修正 ${past} 的快照` }).click();
  await expect(page.getByTestId("snapshot-edit-banner")).toBeVisible();
  await expect(noteInput(page)).toHaveValue("");

  await noteInput(page).fill("還清信貸");
  await saveButton(page).click();
  await expect(page.getByTestId("save-message")).toHaveText(
    `已更新 ${past} 的快照。`
  );

  await expect(page.getByTestId("snapshot-edit-banner")).toHaveCount(0);
  await expect(noteInput(page)).toHaveValue("今天的事");
  await expect(historyNote(page, past)).toHaveText("備註：還清信貸");
  await expect(historyNote(page, today)).toHaveText("備註：今天的事");
  expect(await storedNotes(page)).toEqual({
    [past]: "還清信貸",
    [today]: "今天的事",
  });
});

// #72h
test("只修改備註也算未存檔編輯：存檔鈕與固定儲存列出現，改回後消失", async ({
  page,
}) => {
  await seedSnapshots(page, [{ daysAgo: 0, cash: 180000, note: "買房" }]);
  const stickyBar = page.getByTestId("sticky-save-bar");
  await expect(saveButton(page)).toBeDisabled();
  await expect(stickyBar).toHaveCount(0);

  await noteInput(page).fill("買房簽約");
  await expect(saveButton(page)).toBeEnabled();
  await expect(page.getByTestId("sticky-save-button")).toBeVisible();

  await noteInput(page).fill("買房");
  await expect(saveButton(page)).toBeDisabled();
  await expect(stickyBar).toHaveCount(0);
});

// #72i
test("schema v8 的舊資料：自動補上空的備註，存檔後升為 v9", async ({
  page,
}) => {
  const yesterday = dateDaysAgo(1);
  const today = dateDaysAgo(0);
  await seedSnapshots(page, [{ daysAgo: 1, cash: 500000 }], 8);

  // 正常載入，數字與遷移前一致，沒有版本不相容或資料毀損的橫幅
  await expect(page.getByText("偵測到本地資料版本不相容")).toHaveCount(0);
  await expect(page.getByText("本地資料無法讀取")).toHaveCount(0);
  await expect(page.getByTestId("total-assets")).toHaveText("$700,000");
  await expect(noteInput(page)).toHaveValue("");

  await noteInput(page).fill("第一筆備註");
  await saveButton(page).click();
  await expect(page.getByTestId("save-message")).toBeVisible();

  const data = await storedData(page);
  expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(await storedNotes(page)).toEqual({
    [yesterday]: "",
    [today]: "第一筆備註",
  });
});

// 第 7 節「快照備註」：過長的備註換行，不撐寬清單與頁面
test("390px：50 字的備註在歷史快照與 Tooltip 內換行，頁面不水平捲動", async ({
  page,
}) => {
  const longNote = "很長的備註".repeat(10);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSnapshots(page, [
    { daysAgo: 2, cash: 100000, note: "" },
    { daysAgo: 1, cash: 150000, note: longNote },
    { daysAgo: 0, cash: 180000, note: "" },
  ]);
  const hasNoHorizontalOverflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    );

  await expandSnapshotSections(page);
  const note = historyNote(page, dateDaysAgo(1));
  await expect(note).toHaveText(`備註：${longNote}`);
  const row = page.getByTestId(`snapshot-row-${dateDaysAgo(1)}`);
  const noteBox = (await note.boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(
    rowBox.x + rowBox.width
  );
  // 換成兩行以上
  const lineHeight = await note.evaluate((el) =>
    parseFloat(getComputedStyle(el).lineHeight)
  );
  expect(noteBox.height).toBeGreaterThan(lineHeight * 1.5);
  expect(await hasNoHorizontalOverflow()).toBe(true);

  const card = chartCard(page, "淨資產趨勢");
  await card.getByTestId("chart-node-1").click();
  const tooltipNote = card.getByTestId("chart-tooltip-note");
  await expect(tooltipNote).toHaveText(`備註：${longNote}`);
  expect((await tooltipNote.boundingBox())!.width).toBeLessThanOrEqual(160);
  expect(await hasNoHorizontalOverflow()).toBe(true);
});

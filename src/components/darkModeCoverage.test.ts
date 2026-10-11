import { describe, expect, it } from "vitest";
import appSource from "../App.tsx?raw";

/**
 * 深色樣式覆蓋檢查（PRD 4.2「深色模式」、第 7 節；docs/architecture/dark-mode.md）：
 * 業務元件裡寫死的淺色 className（白底、slate 灰階、狀態色的淺底與深字）必須在
 * 同一個 class 字串內帶有對應的 `dark:` 變體，避免新增元件時漏掉深色樣式。
 *
 * 不檢查的類別（深淺色共用同一個顏色）：進度條／燈號圓點／圖表數列的 500 階填色、
 * 資產配置色塊（blue／orange／teal-600、slate-500）與疊在色塊上的 `text-white`。
 * `src/components/ui/` 為 shadcn 生成檔，本身已支援深色，不在檢查範圍。
 */
const sources: Record<string, string> = {
  "src/App.tsx": appSource,
  ...Object.fromEntries(
    Object.entries(
      import.meta.glob<string>("./**/*.tsx", {
        query: "?raw",
        import: "default",
        eager: true,
      })
    )
      .filter(([file]) => !file.startsWith("./ui/") && !file.includes(".test."))
      .map(([file, source]) => [`src/components/${file.slice(2)}`, source])
  ),
};

const FAMILY = "bg|text|border|divide|ring|fill|stroke";
const STATUS = "amber|rose|emerald|green|sky";
/** 需要深色對應的淺色 class：`[變體前綴:]{family}-{顏色}`。 */
const LIGHT_ONLY = new RegExp(
  String.raw`(?<![\w:\[\]/.#-])((?:[a-z-]+:)*)(${FAMILY})-(?:` +
    String.raw`white|\[#[0-9A-Fa-f]{3,8}\]|slate-\d+|(?:${STATUS})-(?:50|100|600|700|800|900)|rose-500` +
    String.raw`)(?![\w/\[-])`,
  "g"
);
/** 深淺色共用、不需要 `dark:` 對應的例外。 */
const SHARED = new Set([
  "text-white",
  "bg-slate-500",
  "fill-slate-500",
  "bg-rose-500",
]);

interface Violation {
  file: string;
  line: number;
  className: string;
}

function findViolations(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  source.split("\n").forEach((text, index) => {
    // 以引號與大括號切開，逐段（即單一 class 字串）檢查
    for (const segment of text.split(/["'`{}]/)) {
      for (const match of segment.matchAll(LIGHT_ONLY)) {
        const [className, prefix, family] = match;
        if (prefix.startsWith("dark:")) continue;
        if (SHARED.has(className)) continue;
        if (segment.includes(`dark:${prefix}${family}-`)) continue;
        violations.push({ file, line: index + 1, className });
      }
    }
  });
  return violations;
}

describe("深色樣式覆蓋", () => {
  it("涵蓋 App.tsx 與所有業務元件（不含 ui/ 與測試檔）", () => {
    const files = Object.keys(sources);

    expect(files).toContain("src/App.tsx");
    expect(files).toContain("src/components/SummaryCards.tsx");
    expect(files).toContain("src/components/charts/TrendLineChart.tsx");
    expect(files.some((file) => file.includes("/ui/"))).toBe(false);
    expect(files.some((file) => file.includes(".test."))).toBe(false);
  });

  it("寫死的淺色 className 在同一個 class 字串內都有對應的 dark: 變體", () => {
    const violations = Object.entries(sources).flatMap(([file, source]) =>
      findViolations(file, source)
    );

    expect(violations.map((v) => `${v.file}:${v.line} ${v.className}`)).toEqual(
      []
    );
  });

  it("檢查規則本身：能抓到缺少深色對應的寫法，也不誤判已配對的寫法", () => {
    const check = (line: string) =>
      findViolations("x.tsx", line).map((v) => v.className);

    expect(check('<div className="rounded-xl bg-white p-4">')).toEqual([
      "bg-white",
    ]);
    expect(check('<p className="text-sm text-slate-500">')).toEqual([
      "text-slate-500",
    ]);
    expect(check('badge: "bg-amber-50 text-amber-700",')).toEqual([
      "bg-amber-50",
      "text-amber-700",
    ]);
    expect(check('"hover:bg-slate-100 dark:bg-muted"')).toEqual([
      "hover:bg-slate-100",
    ]);
    // 三元運算式的兩個分支各自是獨立的 class 字串
    expect(
      check(
        '`font-bold ${neg ? "text-rose-600" : "text-slate-900 dark:text-neutral-50"}`'
      )
    ).toEqual(["text-rose-600"]);

    expect(
      check('<div className="rounded-xl bg-white p-4 dark:bg-card">')
    ).toEqual([]);
    expect(
      check(
        '"text-slate-400 dark:text-neutral-400 hover:bg-rose-50 dark:hover:bg-rose-950"'
      )
    ).toEqual([]);
    expect(
      check(
        '"bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900"'
      )
    ).toEqual([]);
    expect(check('bar: "bg-emerald-500",')).toEqual([]);
    expect(check("className={`text-white ${segment.color}`}")).toEqual([]);
    expect(check('colorClassName="text-blue-500"')).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

/**
 * 文件完整性檢查：CLAUDE.md 只放指向 docs/architecture/ 的指標，文件之間互相連結，
 * 測試檔的註解也會寫文件路徑——指標一旦失效，目標文件就不會再被讀到。這裡檢查三件事：
 * 1. `CLAUDE.md`、`README.md` 與 `docs/` 下所有 Markdown 的相對連結（行內連結、圖片、
 *    參考式連結的定義）都指向存在的檔案或目錄
 * 2. `CLAUDE.md` 不超過 `CLAUDE_MD_MAX_BYTES` 位元組
 * 3. `src/`、`e2e/`、`scripts/` 內提到的 `docs/….md` 路徑都存在
 *
 * 檔案內容與 repo 的檔案清單都由 `import.meta.glob` 在轉譯時取得：`src/` 的 tsconfig
 * 沒有載入 Node 的型別，不能用 `node:fs`。
 */

/** 判斷某個以 repo 根目錄為基準的相對路徑是否存在（檔案或目錄皆可）。 */
type Exists = (repoPath: string) => boolean;

/**
 * 行內連結與圖片的目標：`[文字](目標)`、`![替代文字](目標 "標題")`。只比對 `](目標)`、不比對
 * 前面的文字，所以文字含 `]`、或連結包著圖片（`[![替代文字](圖片)](目標)`）時每個目標都會取到。
 */
const INLINE_TARGET = /\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
/** 參考式連結的定義：`[標籤]: 目標 "標題"`。`[^1]: …` 是註腳，冒號後面是文字不是目標。 */
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:\s*<?([^\s>]+)/;
/** 行內程式碼：N 個反引號開頭，到下一段恰好 N 個反引號為止；裡面的連結語法只是示範。 */
const CODE_SPAN = /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/g;
/** 不檢查的外部連結。 */
const EXTERNAL = /^(?:https?:|mailto:)/i;
/** 圍欄式程式碼區塊的圍欄：三個以上的反引號或波浪號，開頭的圍欄後面可以接語言名稱。 */
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;

/**
 * 把 `fromFile` 裡寫的相對路徑換算成以 repo 根目錄為基準的路徑（`/` 開頭視為從根目錄起算）。
 * Markdown 的連結目標與 `import.meta.glob` 的 key 都用它換算。
 */
function resolveRepoPath(fromFile: string, relativePath: string): string {
  const segments = relativePath.startsWith("/")
    ? []
    : fromFile.split("/").slice(0, -1);
  for (const segment of relativePath.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && segments.length > 0 && segments.at(-1) !== "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

function findBrokenLinks(
  file: string,
  markdown: string,
  exists: Exists
): string[] {
  const broken: string[] = [];
  /** 目前所在程式碼區塊的開頭圍欄（例如四個反引號）；不在區塊內時為 null。 */
  let openFence: string | null = null;
  markdown.split("\n").forEach((text, index) => {
    const [, fence, afterFence] = text.match(FENCE) ?? [];
    if (openFence !== null) {
      // 結尾的圍欄要和開頭同一種符號、至少一樣長，後面不能有文字；其餘的行都是區塊的內容
      if (fence?.startsWith(openFence) && afterFence.trim() === "") {
        openFence = null;
      }
      return;
    }
    if (fence) {
      openFence = fence;
      return;
    }

    // 換成空白而不是直接刪掉：刪掉會讓程式碼前後的文字接在一起，湊出原本沒有的連結
    const prose = text.replace(CODE_SPAN, " ");
    const links = [...prose.matchAll(INLINE_TARGET)].map(([, link]) => link);
    const definition = prose.match(REFERENCE_DEFINITION)?.[1];
    if (definition) links.push(definition);

    for (const link of links) {
      if (EXTERNAL.test(link)) continue;
      const target = link.split("#")[0];
      if (target === "") continue;
      if (!exists(resolveRepoPath(file, target))) {
        broken.push(`${file}:${index + 1} → ${link}`);
      }
    }
  });
  return broken;
}

/**
 * 程式碼註解或字串裡提到的文件路徑（`docs/….md`），一律以 repo 根目錄為基準。前面只能是 `./`、
 * `../` 這類往回指的寫法；接在其他路徑或網址後面的（`src/docs/x.md`、`https://example.com/docs/x.md`）
 * 指的不是根目錄的 `docs/`。
 */
const DOC_PATH = /(?<![\w./-])(?:\.{1,2}\/)*(docs\/[\w./-]+\.md)(?!\w)/g;

function findMissingDocPaths(
  file: string,
  source: string,
  exists: Exists
): string[] {
  const missing: string[] = [];
  source.split("\n").forEach((text, index) => {
    for (const [, docPath] of text.matchAll(DOC_PATH)) {
      if (!exists(docPath)) missing.push(`${file}:${index + 1} → ${docPath}`);
    }
  });
  return missing;
}

/** 把 `import.meta.glob` 以本檔為基準的 key（`../../docs/PRD.md`、`../App.tsx`）換成 repo 相對路徑。 */
function toRepoPath(globKey: string): string {
  return resolveRepoPath("src/test/docsIntegrity.test.ts", globKey);
}

/** 把 `import.meta.glob` 取回的「glob key → 檔案內容」改成以 repo 相對路徑為 key。 */
function keyByRepoPath(
  modules: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(modules).map(([key, source]) => [toRepoPath(key), source])
  );
}

/** 要檢查連結的文件：`CLAUDE.md`、`README.md` 與 `docs/` 下所有 Markdown。 */
const markdownSources = keyByRepoPath(
  import.meta.glob<string>(
    ["../../CLAUDE.md", "../../README.md", "../../docs/**/*.md"],
    { query: "?raw", import: "default", eager: true }
  )
);

/**
 * repo 內所有檔案的路徑。不加 `eager`，只取 key 而不載入內容；`import.meta.glob` 預設略過
 * `node_modules` 與 `.` 開頭的項目，所以 `.github`、`.husky`、`.vscode` 與根目錄的設定檔另外列出。
 * 建置與測試產物不在版本控制內，排除後本機與 CI 的結果才會一致。
 */
const repoFiles = new Set(
  Object.keys(
    import.meta.glob([
      "../../**/*",
      "../../.*",
      "../../.{github,husky,vscode}/**/*",
      "!../../{dist,dist-ssr,test-results,playwright-report,blob-report}/**",
    ])
  ).map(toRepoPath)
);
/** 由檔案路徑推得的所有目錄。 */
const repoDirectories = new Set(
  [...repoFiles].flatMap((file) => {
    const segments = file.split("/").slice(0, -1);
    return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
  })
);

const repoExists: Exists = (repoPath) =>
  repoFiles.has(repoPath) || repoDirectories.has(repoPath);

/**
 * 要檢查文件路徑的程式碼：`src/`、`e2e/`、`scripts/` 下所有檔案（含測試檔）。
 * `import.meta.glob` 不會把呼叫它的檔案算進結果，所以本檔不在其中。
 */
const codeSources = keyByRepoPath(
  import.meta.glob<string>(
    ["../**/*", "../../e2e/**/*", "../../scripts/**/*"],
    { query: "?raw", import: "default", eager: true }
  )
);

/** CLAUDE.md 會載入每一個 agent session，大小上限（位元組）。 */
const CLAUDE_MD_MAX_BYTES = 8192;

describe("文件完整性", () => {
  it("涵蓋 CLAUDE.md、README.md 與 docs/ 下所有 Markdown，並能分辨路徑是否存在", () => {
    const files = Object.keys(markdownSources);

    expect(files).toContain("CLAUDE.md");
    expect(files).toContain("README.md");
    expect(files).toContain("docs/PRD.md");
    expect(files).toContain("docs/architecture/testing.md");
    expect(files.every((file) => file.endsWith(".md"))).toBe(true);

    expect(repoExists("docs/architecture/testing.md")).toBe(true);
    expect(repoExists("docs/architecture")).toBe(true);
    expect(repoExists("fixtures/finance-data.json")).toBe(true);
    expect(repoExists(".github/workflows/deploy.yml")).toBe(true);
    expect(repoExists("docs/architecture/no-such-doc.md")).toBe(false);
    expect(repoExists("docs/no-such-dir")).toBe(false);
  });

  it("CLAUDE.md、README.md 與 docs/ 內的相對連結都指向存在的檔案或目錄", () => {
    const broken = Object.entries(markdownSources).flatMap(([file, source]) =>
      findBrokenLinks(file, source, repoExists)
    );

    expect(broken).toEqual([]);
  });

  it(`CLAUDE.md 不超過 ${CLAUDE_MD_MAX_BYTES} 位元組`, () => {
    const bytes = new TextEncoder().encode(markdownSources["CLAUDE.md"]).length;

    expect(
      bytes,
      `CLAUDE.md 目前 ${bytes} 位元組，超過上限 ${CLAUDE_MD_MAX_BYTES}。` +
        "架構細節請寫在 docs/architecture/，CLAUDE.md 只保留指向該文件的連結。"
    ).toBeLessThanOrEqual(CLAUDE_MD_MAX_BYTES);
  });

  it("涵蓋 src/、e2e/ 與 scripts/ 下的程式碼（含測試檔，不含本檔）", () => {
    const files = Object.keys(codeSources);

    expect(files).toContain("src/App.tsx");
    expect(files).toContain("src/lib/fixtures.test.ts");
    expect(files).toContain("e2e/helpers.ts");
    expect(files).toContain("scripts/new-worktree.sh");
    // 本檔的「檢查規則本身」案例刻意寫了不存在的文件路徑
    expect(files).not.toContain("src/test/docsIntegrity.test.ts");
  });

  it("src/、e2e/ 與 scripts/ 內提到的 docs/ 文件路徑都存在", () => {
    const missing = Object.entries(codeSources).flatMap(([file, source]) =>
      findMissingDocPaths(file, source, repoExists)
    );

    expect(missing).toEqual([]);
  });

  it("檢查規則本身：能抓到程式碼註解與字串裡不存在的文件路徑", () => {
    const exists: Exists = (repoPath) =>
      repoPath === "docs/architecture/testing.md";
    const check = (source: string) =>
      findMissingDocPaths("e2e/example.spec.ts", source, exists);

    expect(
      check(
        [
          "/**",
          " * 說明見 docs/architecture/testing.md 與 docs/architecture/gone.md。",
          " */",
          'const guide = "../docs/GONE.md";',
        ].join("\n")
      )
    ).toEqual([
      "e2e/example.spec.ts:2 → docs/architecture/gone.md",
      "e2e/example.spec.ts:4 → docs/GONE.md",
    ]);

    expect(check("// 見 docs/architecture/testing.md「測試資料」")).toEqual([]);
    // glob 樣式與其他目錄下的同名片段不是文件路徑
    expect(check('glob("docs/**/*.md")')).toEqual([]);
    expect(check("// 見 mydocs/architecture/gone.md")).toEqual([]);
  });

  it("檢查規則本身：網址與其他目錄底下的 docs/ 不是 repo 根目錄的文件路徑", () => {
    const exists: Exists = (repoPath) =>
      repoPath === "docs/architecture/testing.md";
    const check = (source: string) =>
      findMissingDocPaths("e2e/example.spec.ts", source, exists);

    expect(check("// 見 https://example.com/docs/guide.md")).toEqual([]);
    expect(check("// 見 example.com/docs/guide.md")).toEqual([]);
    expect(check('const path = "src/docs/x.md";')).toEqual([]);

    // 從根目錄寫起，或以 ./、../ 往回指的寫法照樣檢查
    expect(
      check(
        [
          "// 見 docs/architecture/gone.md",
          'const a = "./docs/GONE.md";',
          'const b = "../../docs/GONE.md";',
          "// 見 ../docs/architecture/testing.md",
        ].join("\n")
      )
    ).toEqual([
      "e2e/example.spec.ts:1 → docs/architecture/gone.md",
      "e2e/example.spec.ts:2 → docs/GONE.md",
      "e2e/example.spec.ts:3 → docs/GONE.md",
    ]);
  });

  it("檢查規則本身：能抓到失效的相對連結", () => {
    const exists: Exists = (repoPath) => repoPath === "docs/PRD.md";

    expect(
      findBrokenLinks(
        "docs/architecture/layout.md",
        "第一行\n見 [PRD](../PRD.md) 與 [不存在](../missing.md)。",
        exists
      )
    ).toEqual(["docs/architecture/layout.md:2 → ../missing.md"]);
  });

  it("檢查規則本身：連結包著圖片時，圖片與外層連結的目標都檢查", () => {
    const exists: Exists = (repoPath) => repoPath === "docs/PRD.md";
    const check = (markdown: string) =>
      findBrokenLinks("docs/architecture/layout.md", markdown, exists);

    expect(check("[![徽章](../badge.svg)](../gone.md)")).toEqual([
      "docs/architecture/layout.md:1 → ../badge.svg",
      "docs/architecture/layout.md:1 → ../gone.md",
    ]);
    expect(check("[![徽章](../PRD.md)](../gone.md)")).toEqual([
      "docs/architecture/layout.md:1 → ../gone.md",
    ]);
  });

  it("檢查規則本身：連結文字含 ] 時照樣檢查目標", () => {
    const exists: Exists = (repoPath) => repoPath === "docs/PRD.md";
    const check = (markdown: string) =>
      findBrokenLinks("docs/architecture/layout.md", markdown, exists);

    expect(check("見 [陣列 [0] 的說明](../gone.md)。")).toEqual([
      "docs/architecture/layout.md:1 → ../gone.md",
    ]);
    expect(check("見 [陣列 [0] 的說明](../PRD.md)。")).toEqual([]);
  });

  it("檢查規則本身：參考式連結的定義也檢查，註腳定義不算連結", () => {
    const exists: Exists = (repoPath) => repoPath === "docs/PRD.md";
    const check = (markdown: string) =>
      findBrokenLinks("docs/architecture/layout.md", markdown, exists);

    expect(
      check(
        [
          "見 [PRD][prd] 與 [不存在][gone]。",
          "",
          "[prd]: ../PRD.md",
          '[gone]: ../missing.md "標題"',
          "[anchor]: <../missing.md#章節>",
          "[site]: https://example.com/a.md",
          "[^1]: 註腳的說明文字",
        ].join("\n")
      )
    ).toEqual([
      "docs/architecture/layout.md:4 → ../missing.md",
      "docs/architecture/layout.md:5 → ../missing.md#章節",
    ]);
  });

  it("檢查規則本身：行內程式碼裡的連結語法不是連結，以程式碼當文字的連結照樣檢查", () => {
    const exists: Exists = (repoPath) => repoPath === "docs/PRD.md";
    const check = (markdown: string) =>
      findBrokenLinks("docs/architecture/layout.md", markdown, exists);

    expect(check("連結寫成 `[文字](../missing.md)`。")).toEqual([]);
    // 兩個反引號包起來的程式碼，內容可以有單一反引號
    expect(check("寫成 ``[文字](../missing.md) ` `` 即可。")).toEqual([]);

    expect(check("見 [`PRD.md`](../missing.md) 與 `code`。")).toEqual([
      "docs/architecture/layout.md:1 → ../missing.md",
    ]);
  });

  it("檢查規則本身：程式碼區塊要由同一種符號、至少一樣長且後面沒有文字的圍欄結束", () => {
    const exists: Exists = (repoPath) => repoPath === "docs/PRD.md";
    const check = (markdown: string) =>
      findBrokenLinks("docs/architecture/layout.md", markdown, exists);

    // 四個反引號的區塊：裡面三個反引號的行只是內容
    expect(
      check(
        [
          "````md",
          "```",
          "[範例](../a.md)",
          "```",
          "````",
          "[不存在](../b.md)",
        ].join("\n")
      )
    ).toEqual(["docs/architecture/layout.md:6 → ../b.md"]);
    // 波浪號也一樣；結尾的圍欄可以比開頭長
    expect(
      check(
        ["~~~~", "~~~", "[範例](../a.md)", "~~~~~", "[不存在](../b.md)"].join(
          "\n"
        )
      )
    ).toEqual(["docs/architecture/layout.md:5 → ../b.md"]);
    // 帶著語言名稱的圍欄不能結束區塊
    expect(
      check(
        ["```md", "```ts", "[範例](../a.md)", "```", "[不存在](../b.md)"].join(
          "\n"
        )
      )
    ).toEqual(["docs/architecture/layout.md:5 → ../b.md"]);
  });

  it("檢查規則本身：略過外部連結、錨點與程式碼區塊，並以去掉錨點後的路徑判斷", () => {
    const exists: Exists = (repoPath) => repoPath === "docs/PRD.md";
    const check = (markdown: string) =>
      findBrokenLinks("docs/architecture/layout.md", markdown, exists);

    expect(check("[規範](https://www.conventionalcommits.org/)")).toEqual([]);
    expect(check("[舊站](http://example.com/a.md)")).toEqual([]);
    expect(check("[來信](mailto:someone@example.com)")).toEqual([]);
    expect(check("[回到頂端](#版面)")).toEqual([]);
    expect(check("[PRD 第 7 節](../PRD.md#7-uiux-規範)")).toEqual([]);
    expect(check(["```md", "[範例](../missing.md)", "```"].join("\n"))).toEqual(
      []
    );
    expect(check(["~~~", "[範例](../missing.md)", "~~~"].join("\n"))).toEqual(
      []
    );

    // 去掉錨點後檔案仍不存在；程式碼區塊結束後恢復檢查，行號照原文計算
    expect(check("[不存在](../missing.md#章節)")).toEqual([
      "docs/architecture/layout.md:1 → ../missing.md#章節",
    ]);
    expect(
      check(["```md", "[範例](../a.md)", "```", "[不存在](../b.md)"].join("\n"))
    ).toEqual(["docs/architecture/layout.md:4 → ../b.md"]);
  });
});

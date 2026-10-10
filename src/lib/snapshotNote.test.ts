import { describe, expect, it } from "vitest";
import {
  normalizeSnapshotNote,
  SNAPSHOT_NOTE_MAX_LENGTH,
} from "@/lib/snapshotNote";

// PRD 4.2「快照備註」第 2、9 點、第 9 節 #72c、#72d
describe("normalizeSnapshotNote", () => {
  it("一般內容原樣保留", () => {
    expect(normalizeSnapshotNote("買房")).toBe("買房");
  });

  it("去除前後空白（含全形空白）", () => {
    expect(normalizeSnapshotNote("  換工作 ")).toBe("換工作");
    expect(normalizeSnapshotNote("　換工作　")).toBe("換工作");
  });

  it("換行與連續空白併成一個半形空格", () => {
    expect(normalizeSnapshotNote("換工作   加薪")).toBe("換工作 加薪");
    expect(normalizeSnapshotNote("換工作\n加薪\t年終")).toBe(
      "換工作 加薪 年終"
    );
  });

  it("空字串或只有空白視為沒有備註", () => {
    expect(normalizeSnapshotNote("")).toBe("");
    expect(normalizeSnapshotNote("   \n　")).toBe("");
  });

  it("不是字串（手動改過的備份檔）視為沒有備註", () => {
    expect(normalizeSnapshotNote(undefined)).toBe("");
    expect(normalizeSnapshotNote(null)).toBe("");
    expect(normalizeSnapshotNote(123)).toBe("");
    expect(normalizeSnapshotNote({ text: "買房" })).toBe("");
  });

  it("長度上限為 50 字，超過的部分截掉", () => {
    expect(SNAPSHOT_NOTE_MAX_LENGTH).toBe(50);
    expect(normalizeSnapshotNote("字".repeat(50))).toBe("字".repeat(50));
    expect(normalizeSnapshotNote("字".repeat(80))).toBe("字".repeat(50));
  });

  it("截斷處剛好是空白時不留下結尾空白", () => {
    const note = `${"字".repeat(49)} 尾巴`;
    expect(normalizeSnapshotNote(note)).toBe("字".repeat(49));
  });

  it("以字元為單位截斷，不把 emoji 切成一半", () => {
    const result = normalizeSnapshotNote("🏠".repeat(60));
    expect(result).toBe("🏠".repeat(50));
  });

  it("正規化後再正規化結果不變", () => {
    const once = normalizeSnapshotNote("  換工作 \n 加薪  ");
    expect(normalizeSnapshotNote(once)).toBe(once);
  });
});

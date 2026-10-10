/** 快照備註的長度上限（字數），輸入框與正規化共用（PRD 4.2「快照備註」）。 */
export const SNAPSHOT_NOTE_MAX_LENGTH = 50;

/**
 * 快照備註的正規化（PRD 4.2「快照備註」）：去除前後空白、把換行與連續空白併成一個空格，
 * 並截到長度上限；只有空白或不是字串（手動改過的備份檔）一律視為沒有備註（空字串）。
 * 存檔與顯示共用，確保畫面上看到的就是存下來的內容。
 */
export function normalizeSnapshotNote(note: unknown): string {
  if (typeof note !== "string") return "";
  // 以字元（而非 UTF-16 碼元）截斷，避免把 emoji 等字元切成一半
  return Array.from(note.trim().replace(/\s+/g, " "))
    .slice(0, SNAPSHOT_NOTE_MAX_LENGTH)
    .join("")
    .trimEnd();
}

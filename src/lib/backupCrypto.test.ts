import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackupDecryptError,
  CryptoUnavailableError,
  decryptBackup,
  DEFAULT_PBKDF2_ITERATIONS,
  encryptBackup,
  ENCRYPTED_BACKUP_FORMAT,
  isCryptoAvailable,
  isEncryptedBackup,
  MAX_PBKDF2_ITERATIONS,
  MIN_BACKUP_PASSWORD_LENGTH,
  type EncryptedBackupEnvelope,
} from "@/lib/backupCrypto";

// 測試中縮短迭代次數以加快速度；預設值另有一個測試單獨確認
const FAST = 1000;
const PASSWORD = "correct-horse";
const PLAINTEXT = JSON.stringify({
  schemaVersion: 7,
  snapshots: [
    { date: "2026-09-30", cashSources: [{ name: "秘密銀行", amount: 123456 }] },
  ],
});

async function encrypt(plaintext = PLAINTEXT, password = PASSWORD) {
  return encryptBackup(plaintext, password, FAST);
}

function parse(text: string): EncryptedBackupEnvelope {
  return JSON.parse(text) as EncryptedBackupEnvelope;
}

function base64Length(text: string): number {
  return atob(text).length;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("常數", () => {
  it("密碼最少 6 個字元；預設 PBKDF2 迭代 600,000 次；解密接受的上限為 10,000,000", () => {
    expect(MIN_BACKUP_PASSWORD_LENGTH).toBe(6);
    expect(DEFAULT_PBKDF2_ITERATIONS).toBe(600_000);
    expect(MAX_PBKDF2_ITERATIONS).toBe(10_000_000);
  });
});

describe("encryptBackup / decryptBackup", () => {
  // PRD 第 9 節 #45b：密碼正確可還原
  it("以相同密碼加密後可解密還原為原內容", async () => {
    const encrypted = await encrypt();
    await expect(decryptBackup(encrypted, PASSWORD)).resolves.toBe(PLAINTEXT);
  });

  // PRD 第 9 節 #45：檔案為信封格式，不含任何明文
  it("輸出 PRD 6.2 節規定的信封欄位，salt 16 位元組、iv 12 位元組", async () => {
    const envelope = parse(await encrypt());

    expect(envelope.format).toBe(ENCRYPTED_BACKUP_FORMAT);
    expect(envelope.version).toBe(1);
    expect(envelope.kdf).toBe("PBKDF2-SHA256");
    expect(envelope.iterations).toBe(FAST);
    expect(base64Length(envelope.salt)).toBe(16);
    expect(base64Length(envelope.iv)).toBe(12);
    // 密文 = 明文長度 + 16 位元組 AES-GCM 驗證標籤
    expect(base64Length(envelope.ciphertext)).toBe(
      new TextEncoder().encode(PLAINTEXT).length + 16
    );
  });

  it("加密檔內容不含任何明文金額、名稱或欄位名稱", async () => {
    const encrypted = await encrypt();

    expect(encrypted).not.toContain("123456");
    expect(encrypted).not.toContain("秘密銀行");
    expect(encrypted).not.toContain("snapshots");
    expect(encrypted).not.toContain("cashSources");
  });

  it("未指定 iterations 時使用預設 600,000 次，並寫入信封", async () => {
    const envelope = parse(await encryptBackup("{}", PASSWORD));
    expect(envelope.iterations).toBe(600_000);
  });

  // PRD 第 9 節 #45g
  it("相同資料與密碼加密兩次，salt／iv／密文皆不同，但都能還原", async () => {
    const a = parse(await encrypt());
    const b = parse(await encrypt());

    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    await expect(decryptBackup(JSON.stringify(a), PASSWORD)).resolves.toBe(
      PLAINTEXT
    );
    await expect(decryptBackup(JSON.stringify(b), PASSWORD)).resolves.toBe(
      PLAINTEXT
    );
  });

  it("支援中文與特殊字元的密碼與內容", async () => {
    const text = JSON.stringify({
      名稱: "富邦 📄",
      備註: '含"引號"與\\反斜線',
    });
    const encrypted = await encrypt(text, "密碼 p@ss🔒word");
    await expect(decryptBackup(encrypted, "密碼 p@ss🔒word")).resolves.toBe(
      text
    );
  });

  it("大量資料（數百 KB）也能正確還原，base64 轉換不會爆掉", async () => {
    const big = JSON.stringify({ filler: "x".repeat(600_000) });
    const encrypted = await encrypt(big);
    await expect(decryptBackup(encrypted, PASSWORD)).resolves.toBe(big);
  });

  // PRD 第 9 節 #45d
  it("密碼錯誤時拋出 BackupDecryptError", async () => {
    const encrypted = await encrypt();
    await expect(
      decryptBackup(encrypted, "wrong-password")
    ).rejects.toBeInstanceOf(BackupDecryptError);
  });

  it("密碼大小寫不同也視為錯誤", async () => {
    const encrypted = await encrypt();
    await expect(
      decryptBackup(encrypted, PASSWORD.toUpperCase())
    ).rejects.toBeInstanceOf(BackupDecryptError);
  });

  // PRD 第 9 節 #45e：AES-GCM 驗證標籤保證竄改必然失敗
  it.each(["ciphertext", "iv", "salt"] as const)(
    "竄改 %s 任一位元組後，即使密碼正確也解密失敗",
    async (field) => {
      const envelope = parse(await encrypt());
      const bytes = Uint8Array.from(atob(envelope[field]), (c) =>
        c.charCodeAt(0)
      );
      bytes[0] ^= 0xff;
      envelope[field] = btoa(String.fromCharCode(...bytes));

      await expect(
        decryptBackup(JSON.stringify(envelope), PASSWORD)
      ).rejects.toBeInstanceOf(BackupDecryptError);
    }
  );

  it("密文被截斷時解密失敗", async () => {
    const envelope = parse(await encrypt());
    envelope.ciphertext = envelope.ciphertext.slice(0, 8);

    await expect(
      decryptBackup(JSON.stringify(envelope), PASSWORD)
    ).rejects.toBeInstanceOf(BackupDecryptError);
  });

  // PRD 第 9 節 #45f
  it.each([
    { label: "0", value: 0 },
    { label: "負數", value: -1 },
    { label: "非整數", value: 1.5 },
    { label: "超過上限", value: MAX_PBKDF2_ITERATIONS + 1 },
    { label: "字串", value: "1000" },
    { label: "null", value: null },
  ])("iterations 為 $label 時視為檔案損毀，不嘗試解密", async ({ value }) => {
    const envelope = parse(await encrypt()) as unknown as Record<
      string,
      unknown
    >;
    envelope.iterations = value;

    await expect(
      decryptBackup(JSON.stringify(envelope), PASSWORD)
    ).rejects.toBeInstanceOf(BackupDecryptError);
  });

  it.each(["salt", "iv", "ciphertext", "kdf"] as const)(
    "缺少 %s 欄位時視為檔案損毀",
    async (field) => {
      const envelope = parse(await encrypt()) as unknown as Record<
        string,
        unknown
      >;
      delete envelope[field];

      await expect(
        decryptBackup(JSON.stringify(envelope), PASSWORD)
      ).rejects.toBeInstanceOf(BackupDecryptError);
    }
  );

  it("base64 內容損毀時視為檔案損毀，而不是拋出其他例外", async () => {
    const envelope = parse(await encrypt());
    envelope.ciphertext = "!!!不是base64!!!";

    await expect(
      decryptBackup(JSON.stringify(envelope), PASSWORD)
    ).rejects.toBeInstanceOf(BackupDecryptError);
  });

  it("未知的信封版本視為無法解密", async () => {
    const envelope = parse(await encrypt()) as unknown as Record<
      string,
      unknown
    >;
    envelope.version = 2;

    await expect(
      decryptBackup(JSON.stringify(envelope), PASSWORD)
    ).rejects.toBeInstanceOf(BackupDecryptError);
  });

  it("不是加密信封的內容交給 decryptBackup 時，拋出 BackupDecryptError", async () => {
    await expect(decryptBackup("not json", PASSWORD)).rejects.toBeInstanceOf(
      BackupDecryptError
    );
    await expect(decryptBackup(PLAINTEXT, PASSWORD)).rejects.toBeInstanceOf(
      BackupDecryptError
    );
  });

  it("空密碼也能加密與還原（長度規則由 UI 層把關），但與其他密碼不通用", async () => {
    const encrypted = await encrypt(PLAINTEXT, "");
    await expect(decryptBackup(encrypted, "")).resolves.toBe(PLAINTEXT);
    await expect(decryptBackup(encrypted, PASSWORD)).rejects.toBeInstanceOf(
      BackupDecryptError
    );
  });
});

describe("isEncryptedBackup", () => {
  it("加密信封回傳 true", async () => {
    expect(isEncryptedBackup(await encrypt())).toBe(true);
  });

  // PRD 第 9 節 #45i：明文備份不受影響
  it("明文備份、毀損內容、其他 JSON 一律回傳 false", () => {
    expect(isEncryptedBackup(PLAINTEXT)).toBe(false);
    expect(isEncryptedBackup("not json")).toBe(false);
    expect(isEncryptedBackup("null")).toBe(false);
    expect(isEncryptedBackup("[]")).toBe(false);
    expect(isEncryptedBackup(JSON.stringify({ format: "other" }))).toBe(false);
  });
});

// PRD 第 9 節 #45h
describe("環境不支援 WebCrypto", () => {
  it("isCryptoAvailable 在 crypto.subtle 不存在時回傳 false", () => {
    expect(isCryptoAvailable()).toBe(true);
    vi.stubGlobal("crypto", {});
    expect(isCryptoAvailable()).toBe(false);
  });

  it("encryptBackup 拋出 CryptoUnavailableError，訊息提示需要 HTTPS", async () => {
    vi.stubGlobal("crypto", {});
    const promise = encryptBackup("{}", PASSWORD, FAST);

    await expect(promise).rejects.toBeInstanceOf(CryptoUnavailableError);
    await expect(promise).rejects.toThrow("此環境不支援加密（需要 HTTPS）");
  });

  it("decryptBackup 拋出 CryptoUnavailableError，而不是誤報密碼錯誤", async () => {
    const encrypted = await encrypt();
    vi.stubGlobal("crypto", {});

    await expect(decryptBackup(encrypted, PASSWORD)).rejects.toBeInstanceOf(
      CryptoUnavailableError
    );
  });
});

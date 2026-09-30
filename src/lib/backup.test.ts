import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultBackupFilename,
  defaultEncryptedBackupFilename,
  downloadBackup,
  downloadEncryptedBackup,
  parseBackupFile,
} from "@/lib/backup";
import {
  CryptoUnavailableError,
  encryptBackup,
  isEncryptedBackup,
} from "@/lib/backupCrypto";
import { createEmptyFinanceData } from "@/lib/storage";
import { createEmptySnapshot } from "@/types/schema";

describe("defaultBackupFilename", () => {
  it("格式化為 my-finance-dashboard-backup-YYYYMMDD.json", () => {
    expect(defaultBackupFilename(new Date("2026-07-11T00:00:00"))).toBe(
      "my-finance-dashboard-backup-20260711.json"
    );
  });
});

describe("downloadBackup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // PRD 第 9 節 #17：匯出的內容須與目前資料一致，且純前端觸發下載
  it("透過 Blob + <a download> 觸發下載，不經任何網路請求", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    downloadBackup(createEmptyFinanceData(), "test-backup.json");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

describe("parseBackupFile", () => {
  // PRD 第 9 節 #18：匯入時套用與 LocalStorage 相同的驗證規則
  it("讀取合法備份檔回傳 ok", async () => {
    const data = createEmptyFinanceData();
    const file = new File([JSON.stringify(data)], "backup.json", {
      type: "application/json",
    });
    await expect(parseBackupFile(file)).resolves.toEqual({
      status: "ok",
      data,
    });
  });

  it("讀取毀損檔案回傳 corrupted，不拋錯", async () => {
    const file = new File(["not valid json"], "backup.json", {
      type: "application/json",
    });
    await expect(parseBackupFile(file)).resolves.toEqual({
      status: "corrupted",
    });
  });

  it("schemaVersion 不符回傳 version-mismatch", async () => {
    const file = new File(
      [JSON.stringify({ schemaVersion: 999, snapshots: [] })],
      "backup.json",
      {
        type: "application/json",
      }
    );
    await expect(parseBackupFile(file)).resolves.toEqual({
      status: "version-mismatch",
      foundVersion: 999,
    });
  });
});

describe("defaultEncryptedBackupFilename", () => {
  // PRD 第 9 節 #45：加密備份檔名為 .enc.json
  it("格式化為 my-finance-dashboard-backup-YYYYMMDD.enc.json", () => {
    expect(
      defaultEncryptedBackupFilename(new Date("2026-07-11T00:00:00"))
    ).toBe("my-finance-dashboard-backup-20260711.enc.json");
  });
});

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function sampleData() {
  const data = createEmptyFinanceData();
  data.snapshots.push({
    ...createEmptySnapshot("2026-09-30"),
    // 固定時間戳：createEmptySnapshot 預設用 new Date()，每次呼叫不同，會讓 toEqual 偶發失敗
    updatedAt: "2026-09-30T00:00:00.000Z",
    cashSources: [
      { id: "1", name: "秘密銀行", amount: 123456, restricted: false },
    ],
  });
  return data;
}

describe("downloadEncryptedBackup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubDownload() {
    let downloadedBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      downloadedBlob = blob;
      return "blob:mock-url";
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });
    let downloadName: string | undefined;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        el.click = vi.fn();
        Object.defineProperty(el, "download", {
          set: (v: string) => {
            downloadName = v;
          },
          get: () => downloadName ?? "",
        });
      }
      return el;
    });
    return {
      createObjectURL,
      getBlob: () => downloadedBlob,
      getName: () => downloadName,
    };
  }

  // PRD 第 9 節 #45：純前端觸發下載，內容是加密信封而非明文
  it("下載的是加密信封，不含明文財務數字，並使用指定的檔名", async () => {
    const stub = stubDownload();

    await downloadEncryptedBackup(
      sampleData(),
      "correct-horse",
      "test.enc.json"
    );

    expect(stub.createObjectURL).toHaveBeenCalledTimes(1);
    expect(stub.getName()).toBe("test.enc.json");
    const text = await readBlobText(stub.getBlob() as Blob);
    expect(isEncryptedBackup(text)).toBe(true);
    expect(text).not.toContain("123456");
    expect(text).not.toContain("秘密銀行");
  });

  it("環境不支援 WebCrypto 時拋出 CryptoUnavailableError，且不觸發任何下載", async () => {
    const stub = stubDownload();
    vi.stubGlobal("crypto", {});

    await expect(
      downloadEncryptedBackup(sampleData(), "correct-horse")
    ).rejects.toBeInstanceOf(CryptoUnavailableError);
    expect(stub.createObjectURL).not.toHaveBeenCalled();
  });
});

describe("parseBackupFile：加密備份", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  async function encryptedFile(password = "correct-horse") {
    const encrypted = await encryptBackup(
      JSON.stringify(sampleData()),
      password,
      1000
    );
    return new File([encrypted], "backup.enc.json", {
      type: "application/json",
    });
  }

  // PRD 第 9 節 #45c
  it("偵測到加密檔但沒有提供密碼時，回傳 encrypted，不視為錯誤", async () => {
    await expect(parseBackupFile(await encryptedFile())).resolves.toEqual({
      status: "encrypted",
    });
  });

  it("密碼為空字串時視同沒有提供密碼", async () => {
    await expect(parseBackupFile(await encryptedFile(), "")).resolves.toEqual({
      status: "encrypted",
    });
  });

  // PRD 第 9 節 #45b：解密後沿用相同的驗證與遷移規則
  it("密碼正確時解密並回傳 ok，內容與加密前一致", async () => {
    const result = await parseBackupFile(
      await encryptedFile(),
      "correct-horse"
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data).toEqual(sampleData());
    }
  });

  // PRD 第 9 節 #45d
  it("密碼錯誤時回傳 wrong-password", async () => {
    await expect(
      parseBackupFile(await encryptedFile(), "wrong-password")
    ).resolves.toEqual({ status: "wrong-password" });
  });

  // PRD 第 9 節 #45e
  it("密文被竄改時回傳 wrong-password", async () => {
    const file = await encryptedFile();
    const envelope = JSON.parse(await readBlobText(file));
    envelope.ciphertext = "AAAA" + envelope.ciphertext.slice(4);
    const tampered = new File([JSON.stringify(envelope)], "backup.enc.json");

    await expect(parseBackupFile(tampered, "correct-horse")).resolves.toEqual({
      status: "wrong-password",
    });
  });

  it("解密成功但內容不是合法備份（版本不符）時，沿用 version-mismatch", async () => {
    const encrypted = await encryptBackup(
      JSON.stringify({ schemaVersion: 999, snapshots: [] }),
      "correct-horse",
      1000
    );
    const file = new File([encrypted], "backup.enc.json");

    await expect(parseBackupFile(file, "correct-horse")).resolves.toEqual({
      status: "version-mismatch",
      foundVersion: 999,
    });
  });

  it("解密成功但內容毀損時，沿用 corrupted", async () => {
    const encrypted = await encryptBackup("not json", "correct-horse", 1000);
    const file = new File([encrypted], "backup.enc.json");

    await expect(parseBackupFile(file, "correct-horse")).resolves.toEqual({
      status: "corrupted",
    });
  });

  // PRD 第 9 節 #45h
  it("環境不支援 WebCrypto 時回傳 crypto-unavailable，而不是誤報密碼錯誤", async () => {
    const file = await encryptedFile();
    vi.stubGlobal("crypto", {});

    await expect(parseBackupFile(file, "correct-horse")).resolves.toEqual({
      status: "crypto-unavailable",
    });
  });

  // PRD 第 9 節 #45i：明文備份行為不變
  it("明文備份即使多提供密碼也照常讀取，不要求密碼", async () => {
    const data = sampleData();
    const file = new File([JSON.stringify(data)], "backup.json");

    await expect(parseBackupFile(file, "ignored")).resolves.toEqual({
      status: "ok",
      data,
    });
    await expect(parseBackupFile(file)).resolves.toEqual({
      status: "ok",
      data,
    });
  });
});

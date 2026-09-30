/**
 * 備份加密（PRD 4.2「加密匯出備份」、6.2 節）：PBKDF2-SHA256 由密碼衍生 256 位元金鑰，AES-GCM 加密。
 * 只使用瀏覽器內建 WebCrypto，零網路請求；密碼不保存於任何位置。
 */

export const ENCRYPTED_BACKUP_FORMAT = "my-finance-dashboard-encrypted-backup";
export const ENCRYPTED_BACKUP_VERSION = 1;
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
/** 解密時接受的 iterations 上限，避免惡意檔案拖垮瀏覽器（PRD 6.2 節）。 */
export const MAX_PBKDF2_ITERATIONS = 10_000_000;
export const MIN_BACKUP_PASSWORD_LENGTH = 6;

const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedBackupEnvelope {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  version: typeof ENCRYPTED_BACKUP_VERSION;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

/** 目前環境不支援 WebCrypto（例如非 HTTPS 且非 localhost）。 */
export class CryptoUnavailableError extends Error {
  constructor() {
    super("此環境不支援加密（需要 HTTPS）");
    this.name = "CryptoUnavailableError";
  }
}

/** 密碼錯誤、密文被竄改或檔案內容損毀；兩者無法區分（AES-GCM 驗證失敗）。 */
export class BackupDecryptError extends Error {
  constructor() {
    super("密碼錯誤或備份檔已損毀");
    this.name = "BackupDecryptError";
  }
}

export function isCryptoAvailable(): boolean {
  return (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined"
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 加密明文備份 JSON 字串，回傳信封 JSON 字串（PRD 6.2 節）。每次呼叫皆重新產生隨機 salt 與 iv。
 * iterations 可覆寫，僅供測試縮短耗時；正式使用一律採預設值。
 */
export async function encryptBackup(
  plaintext: string,
  password: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<string> {
  if (!isCryptoAvailable()) throw new CryptoUnavailableError();

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, iterations);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  const envelope: EncryptedBackupEnvelope = {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(cipher)),
  };
  return JSON.stringify(envelope, null, 2);
}

/** 檔案內容是否為加密備份信封（只看 format／version，不驗證其餘欄位）。 */
export function isEncryptedBackup(text: string): boolean {
  return parseEnvelope(text) !== null;
}

function parseEnvelope(text: string): EncryptedBackupEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { format?: unknown }).format !== ENCRYPTED_BACKUP_FORMAT
  ) {
    return null;
  }
  return parsed as EncryptedBackupEnvelope;
}

/**
 * 解密信封並回傳明文 JSON 字串。iterations 不合法、欄位缺漏、base64 損毀、密碼錯誤或密文被竄改
 * 一律拋出 BackupDecryptError（不洩漏是哪一種）。
 */
export async function decryptBackup(
  text: string,
  password: string
): Promise<string> {
  if (!isCryptoAvailable()) throw new CryptoUnavailableError();

  const envelope = parseEnvelope(text);
  if (
    !envelope ||
    envelope.version !== ENCRYPTED_BACKUP_VERSION ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(envelope.iterations) ||
    envelope.iterations < 1 ||
    envelope.iterations > MAX_PBKDF2_ITERATIONS ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new BackupDecryptError();
  }

  try {
    const key = await deriveKey(
      password,
      fromBase64(envelope.salt),
      envelope.iterations
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      key,
      fromBase64(envelope.ciphertext)
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new BackupDecryptError();
  }
}

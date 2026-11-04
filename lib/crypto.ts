import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

// AES-256-GCM at-rest encryption for app secrets (TOTP seeds for 2FA).
// APP_SECRETS_KEY (64 hex chars) can be set for a dedicated key; without it
// a stable key is derived from JWT_SECRET, so 2FA works with no extra setup.
// Ported from crm-officeplus lib/crypto.ts.
function getKey(): Buffer {
  const hex = process.env.APP_SECRETS_KEY;
  if (hex) {
    const key = Buffer.from(hex, "hex");
    if (key.length === 32) return key;
  }
  return createHash("sha256").update(process.env.JWT_SECRET ?? "").digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

export function decrypt(stored: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

import { authenticator } from "otplib";
import QRCode from "qrcode";
import { encrypt, decrypt } from "@/lib/crypto";

// TOTP (Google Authenticator, Microsoft Authenticator, …) for CRM 2FA.
// Ported from crm-officeplus lib/totp.ts. One step of clock drift allowed.
authenticator.options = { window: 1 };

export const generateTotpSecret = () => authenticator.generateSecret();

export async function totpQrDataUrl(username: string, issuer: string, secret: string) {
  return QRCode.toDataURL(authenticator.keyuri(username, issuer, secret));
}

export function verifyTotpCode(secret: string, code: string) {
  try { return authenticator.verify({ token: code.replace(/\s+/g, ""), secret }); }
  catch { return false; }
}

export const encryptTotpSecret = (s: string) => encrypt(s);
export const decryptTotpSecret = (s: string) => decrypt(s);

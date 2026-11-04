import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { comparePassword } from "@/lib/auth";
import { currentAccount } from "@/lib/account";
import { getCompany } from "@/lib/documents/common";
import {
  decryptTotpSecret, encryptTotpSecret, generateTotpSecret, totpQrDataUrl, verifyTotpCode,
} from "@/lib/totp";

// POST — start setup: new seed kept as "pending", QR to scan.
// PUT { code } — confirm with a code from the app → 2FA on.
// DELETE { password } — turn 2FA off (needs the account password).
export async function POST() {
  const u = await currentAccount();
  if (!u) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const secret = generateTotpSecret();
  await execute(
    `MERGE INTO AGRO_CRM_USER_2FA t USING (SELECT :id AS USER_ID FROM DUAL) s ON (t.USER_ID = s.USER_ID)
     WHEN MATCHED THEN UPDATE SET PENDING_SECRET_ENC = :enc, UPDATED_AT = SYSDATE
     WHEN NOT MATCHED THEN INSERT (USER_ID, PENDING_SECRET_ENC, ENABLED) VALUES (:id, :enc, 'N')`,
    { id: u.ID, enc: encryptTotpSecret(secret) });
  const issuer = `${(await getCompany()).name} CRM`;
  return NextResponse.json({ qr: await totpQrDataUrl(u.USERNAME, issuer, secret), secret });
}

export async function PUT(request: Request) {
  const u = await currentAccount();
  if (!u) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { code } = await request.json().catch(() => ({}));
  const rows = await query<{ PENDING_SECRET_ENC: string | null }>(
    `SELECT PENDING_SECRET_ENC FROM AGRO_CRM_USER_2FA WHERE USER_ID = :1`, [u.ID]);
  const pending = rows[0]?.PENDING_SECRET_ENC;
  if (!pending) return NextResponse.json({ error: "Сначала начните настройку заново" }, { status: 400 });
  if (!verifyTotpCode(decryptTotpSecret(pending), String(code ?? "")))
    return NextResponse.json({ error: "Неверный код — проверьте время на телефоне и попробуйте снова" }, { status: 400 });
  await execute(
    `UPDATE AGRO_CRM_USER_2FA SET SECRET_ENC = PENDING_SECRET_ENC, PENDING_SECRET_ENC = NULL, ENABLED = 'Y', UPDATED_AT = SYSDATE
      WHERE USER_ID = :1`, [u.ID]);
  await execute(
    `INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY) VALUES ('user', :id, :name, '2fa_enabled', :name)`,
    { id: u.ID, name: u.USERNAME });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const u = await currentAccount();
  if (!u) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { password } = await request.json().catch(() => ({}));
  if (!password || !comparePassword(String(password), u.PASSWORD_HASH))
    return NextResponse.json({ error: "Пароль указан неверно" }, { status: 400 });
  await execute(`DELETE FROM AGRO_CRM_USER_2FA WHERE USER_ID = :1`, [u.ID]);
  await execute(
    `INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY) VALUES ('user', :id, :name, '2fa_disabled', :name)`,
    { id: u.ID, name: u.USERNAME });
  return NextResponse.json({ success: true });
}

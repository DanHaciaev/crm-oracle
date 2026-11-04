import { NextResponse } from "next/server";
import { query } from "@/lib/oracle";
import { verifyTwoFaChallenge } from "@/lib/auth";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";
import { isLocked, recordLogin, sessionResponse, twoFactorSecret, LOCK_MINUTES } from "@/lib/login-security";

// Second sign-in step for users with 2FA: challenge (from /api/auth/login)
// + the 6-digit code from the authenticator app → session cookie.
export async function POST(request: Request) {
  const { challenge, code } = await request.json().catch(() => ({})) as { challenge?: string; code?: string };
  if (!challenge || !code) return NextResponse.json({ error: "Введите код" }, { status: 400 });

  const userId = verifyTwoFaChallenge(challenge);
  if (!userId) return NextResponse.json({ error: "Сессия входа истекла, войдите заново" }, { status: 401 });

  const rows = await query<{ ID: number; USERNAME: string; ROLE: string; ACTIVE: string }>(
    `SELECT ID, USERNAME, ROLE, ACTIVE FROM AGRO_USERS WHERE ID = :1`, [userId]);
  const u = rows[0];
  if (!u || u.ACTIVE !== "Y") return NextResponse.json({ error: "Пользователь отключён" }, { status: 403 });

  if (await isLocked(u.USERNAME)) {
    return NextResponse.json({ error: `Слишком много неудачных попыток. Попробуйте через ${LOCK_MINUTES} минут.` }, { status: 429 });
  }

  const enc = await twoFactorSecret(u.ID);
  if (!enc) return NextResponse.json({ error: "2FA не настроена" }, { status: 400 });

  if (!verifyTotpCode(decryptTotpSecret(enc), String(code))) {
    await recordLogin(request, { userId: u.ID, username: u.USERNAME, success: false, reason: "bad_2fa_code" });
    return NextResponse.json({ error: "Неверный код" }, { status: 401 });
  }

  await recordLogin(request, { userId: u.ID, username: u.USERNAME, success: true, reason: "2fa" });
  return sessionResponse(u);
}

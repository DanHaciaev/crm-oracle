import { NextResponse } from "next/server";
import { query } from "@/lib/oracle";
import { comparePassword, signTwoFaChallenge } from "@/lib/auth";
import { isLocked, recordLogin, sessionResponse, twoFactorSecret, LOCK_MINUTES } from "@/lib/login-security";

interface UserRow {
  [key: string]: unknown;
  ID:            number;
  USERNAME:      string;
  PASSWORD_HASH: string;
  ROLE:          string;
  ACTIVE:        string;
}

export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({}));

  if (!username || !password) {
    return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
  }
  const uname = String(username);

  if (await isLocked(uname)) {
    await recordLogin(request, { userId: null, username: uname, success: false, reason: "locked" });
    return NextResponse.json(
      { error: `Слишком много неудачных попыток. Попробуйте через ${LOCK_MINUTES} минут.` }, { status: 429 });
  }

  const users = await query<UserRow>(
    `SELECT id, username, password_hash, role, active
       FROM AGRO_USERS
      WHERE username = :1`,
    [uname]
  );

  if (users.length === 0) {
    await recordLogin(request, { userId: null, username: uname, success: false, reason: "unknown_user" });
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  const user = users[0];

  if (user.ACTIVE !== "Y") {
    await recordLogin(request, { userId: user.ID, username: uname, success: false, reason: "inactive" });
    return NextResponse.json({ error: "Пользователь отключён" }, { status: 403 });
  }

  if (!comparePassword(String(password), user.PASSWORD_HASH)) {
    await recordLogin(request, { userId: user.ID, username: uname, success: false, reason: "bad_password" });
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  // Password is right; with 2FA on, the session is only issued after the
  // code is checked at /api/auth/login-2fa.
  if (await twoFactorSecret(user.ID)) {
    return NextResponse.json({ requires_2fa: true, challenge: signTwoFaChallenge(user.ID) });
  }

  await recordLogin(request, { userId: user.ID, username: uname, success: true });
  return sessionResponse(user);
}
